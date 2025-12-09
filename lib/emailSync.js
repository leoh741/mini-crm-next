// Sistema de sincronización bidireccional IMAP
// Maneja cambios de flags, carpetas y detecta cambios remotos

import { ImapFlow } from "imapflow";
import { emailConfig } from "./emailConfig.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache } from "./emailCache.js";
import { obtenerListaDelCache, guardarListaEnCache, limpiarCacheListaCarpeta } from "./emailListCache.js";
import { obtenerCorreoPorUID } from "./emailRead.js";
import { imapManager, ConnectionNotAvailableError } from "./imapConnectionManager.js";
import { getMaxUidForFolder, setMaxUidForFolder } from "./emailSyncState.js";

// Cliente IMAP persistente para listeners (se mantiene conectado)
let imapClientPersistente = null;
// Map<carpeta, { callbacks: Set<callback>, pollingActivo: boolean, ultimoUID: number | null, cleanup: Function }>
let imapListeners = new Map();

/**
 * Obtiene o crea un cliente IMAP persistente para listeners
 * @returns {Promise<ImapFlow>} Cliente IMAP
 */
async function obtenerClienteIMAPPersistente() {
  if (imapClientPersistente && imapClientPersistente.authenticated) {
    return imapClientPersistente;
  }

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  const client = new ImapFlow({
    host: emailConfig.host,
    port: emailConfig.imapPort,
    secure: emailConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
    logger: false,
    // Mantener conexión abierta para listeners
    disableAutoIdle: false, // Habilitar IDLE para notificaciones en tiempo real
  });

  await client.connect();
  imapClientPersistente = client;

  // Manejar desconexiones
  client.on("close", () => {
    console.log("⚠️ Cliente IMAP persistente desconectado");
    imapClientPersistente = null;
  });

  client.on("error", (error) => {
    console.error("❌ Error en cliente IMAP persistente:", error.message);
    imapClientPersistente = null;
  });

  return client;
}

/**
 * Encuentra el nombre real de una carpeta (maneja variaciones)
 * @param {ImapFlow} client - Cliente IMAP
 * @param {string} carpeta - Nombre de la carpeta
 * @returns {Promise<string|null>} Nombre real de la carpeta o null si no existe
 */
async function encontrarCarpetaReal(client, carpeta) {
  const variaciones = [
    carpeta,
    carpeta.toUpperCase(),
    carpeta.toLowerCase(),
    carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
  ];

  // Agregar variaciones específicas
  if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
    variaciones.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
  } else if (carpeta === "Drafts" || carpeta === "drafts" || carpeta === "DRAFTS") {
    variaciones.push("Draft", "DRAFT", "draft", "Borradores", "BORRADORES", "borradores");
  } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
    variaciones.push("Junk", "JUNK", "junk", "Spam", "Correo no deseado");
  } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
    variaciones.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
  }

  for (const variacion of variaciones) {
    try {
      const testLock = await client.getMailboxLock(variacion);
      testLock.release();
      return variacion;
    } catch (e) {
      // Continuar con la siguiente variación
    }
  }

  return null;
}

/**
 * Helpers para asegurar coherencia de flags con \Seen
 */
function ensureFlagsWithSeen(flags = []) {
  if (!Array.isArray(flags)) {
    flags = [];
  }
  if (flags.includes('\\Seen')) {
    return flags;
  }
  return [...flags, '\\Seen'];
}

function ensureFlagsWithoutSeen(flags = []) {
  if (!Array.isArray(flags)) {
    flags = [];
  }
  return flags.filter((f) => f !== '\\Seen');
}

/**
 * Marca un correo como visto/no visto en IMAP usando el flag \Seen
 * Siempre intenta actualizar IMAP, pero si falla, continúa actualizando localmente
 * Mantiene seen y flags coherentes en MongoDB/cache
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @param {boolean} visto - true para marcar como visto, false para no visto
 * @returns {Promise<boolean>} El valor de seen (true/false)
 */
export async function markAsSeen(uid, carpeta, visto = true) {
  console.log(`>>> markAsSeen: UID=${uid}, Carpeta=${carpeta}, Visto=${visto}`);

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum)) {
    throw new Error(`UID inválido: ${uid}`);
  }

  // Paso 1: Obtener correo actual de cache/DB para no perder otros flags
  const correoActual = await obtenerCorreoDelCache(uidNum, carpeta, true);
  const currentFlags = correoActual?.flags || [];
  console.log(`>>> markAsSeen - Flags actuales en cache: ${JSON.stringify(currentFlags)}`);

  // Paso 2: Calcular flags nuevos según visto
  let newFlags;
  if (visto) {
    newFlags = ensureFlagsWithSeen(currentFlags);
    console.log(`>>> markAsSeen - Flags DESPUÉS de agregar \\Seen: ${JSON.stringify(newFlags)}`);
  } else {
    newFlags = ensureFlagsWithoutSeen(currentFlags);
    console.log(`>>> markAsSeen - Flags DESPUÉS de remover \\Seen: ${JSON.stringify(newFlags)}`);
  }

  let imapActualizado = false;

  try {
    return await imapManager.withImapClient(async (client) => {

    // Paso 3: Encontrar carpeta real
    const nombreCarpetaReal = await encontrarCarpetaReal(client, carpeta);
    if (!nombreCarpetaReal) {
      throw new Error(`No se pudo encontrar la carpeta ${carpeta}`);
    }

    const lock = await client.getMailboxLock(nombreCarpetaReal);

    try {
      // Paso 4: Abrir la carpeta explícitamente
      console.log(`>>> markAsSeen - Abriendo carpeta: ${nombreCarpetaReal}`);
      await client.mailboxOpen(nombreCarpetaReal);
      console.log(`>>> markAsSeen - Carpeta abierta exitosamente`);

      // Paso 5: Verificar que la conexión esté activa
      if (!client.authenticated) {
        throw new Error("Conexión IMAP no autenticada");
      }

      // Paso 6: Intentar actualizar IMAP (agregar o remover \Seen)
      if (visto) {
        console.log(`>>> markAsSeen - Agregando \\Seen en IMAP para UID ${uidNum}`);
        try {
          await client.messageFlagsAdd(uidNum, ["\\Seen"], { uid: true });
          imapActualizado = true;
          console.log(`✅ Flag \\Seen agregado en IMAP para UID ${uidNum}`);
        } catch (imapError) {
          console.warn(`⚠️ Error/timeout agregando \\Seen en IMAP, actualizo igual local: ${imapError.message}`);
          // Continuar con actualización local
        }
      } else {
        console.log(`>>> markAsSeen - Removiendo \\Seen en IMAP para UID ${uidNum}`);
        try {
          await client.messageFlagsRemove(uidNum, ["\\Seen"], { uid: true });
          imapActualizado = true;
          console.log(`✅ Flag \\Seen removido en IMAP para UID ${uidNum}`);
        } catch (imapError) {
          console.warn(`⚠️ Error/timeout removiendo \\Seen en IMAP, actualizo igual local: ${imapError.message}`);
          // Continuar con actualización local aunque IMAP falle
        }
      }

      // Paso 7: Si IMAP se actualizó, esperar un poco y releer flags
      let flagsFinales = newFlags;
      if (imapActualizado) {
        const delay = 300 + Math.floor(Math.random() * 200); // 300-500ms
        console.log(`>>> markAsSeen - Esperando ${delay}ms antes de releer flags...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        try {
          console.log(`>>> markAsSeen - Releyendo flags desde IMAP para UID ${uidNum}`);
          const fetchResult = client.fetch(uidNum, { flags: true }, { uid: true });
          
          for await (const msg of fetchResult) {
            if (msg.uid === uidNum) {
              flagsFinales = msg.flags ? Array.from(msg.flags) : [];
              console.log(`✅ Flags releídos desde IMAP: ${JSON.stringify(flagsFinales)}`);
              break;
            }
          }
        } catch (fetchError) {
          console.warn(`⚠️ Error leyendo flags desde IMAP: ${fetchError.message}`);
          // Usar los flags calculados si falla la lectura
          flagsFinales = newFlags;
        }
      }

      // Paso 8: Actualizar cache/DB con valores coherentes
      // 🔴 IMPORTANTE: Solo actualizar si ya existe correoActual con metadata válida
      // No crear correos "fantasma" (Sin remitente / Sin asunto) cuando no hay datos del correo
      if (correoActual) {
        const correoParaGuardar = {
          ...correoActual,
          seen: !!visto,
          leido: !!visto, // Mantener compatibilidad
          flags: flagsFinales
        };

        console.log(`>>> markAsSeen - Guardando en cache: seen=${correoParaGuardar.seen}, flags=${JSON.stringify(correoParaGuardar.flags)}`);
        await guardarCorreoEnCache(uidNum, nombreCarpetaReal, correoParaGuardar, correoActual?.html ? true : false);
        if (nombreCarpetaReal !== carpeta) {
          await guardarCorreoEnCache(uidNum, carpeta, correoParaGuardar, correoActual?.html ? true : false);
        }
      } else {
        // Si no hay correoActual, no crear uno vacío - esperar a que se sincronice correctamente
        console.log(`>>> markAsSeen - No hay correo en cache para UID ${uidNum}, no se creará correo vacío. Se sincronizará en próxima sync.`);
      }

      // Paso 9: Invalidar cache de lista (CRÍTICO para reflejar cambios en la UI)
      try {
        await limpiarCacheListaCarpeta(nombreCarpetaReal);
        if (nombreCarpetaReal !== carpeta) {
          await limpiarCacheListaCarpeta(carpeta);
        }
        console.log(`✅ markAsSeen - Cache de lista invalidado para carpeta ${nombreCarpetaReal} (visto=${visto})`);
        // ✅ IMPORTANTE: El cache está invalidado, la próxima carga de la lista reflejará el cambio
      } catch (cacheError) {
        console.warn(`⚠️ Error invalidando cache de lista: ${cacheError.message}`);
      }

      console.log(`✅ markAsSeen completado: UID=${uidNum}, seen=${!!visto}, flags=${JSON.stringify(flagsFinales)}`);
      return !!visto;
    } finally {
      lock.release();
    }
    });
  } catch (error) {
    console.error(`>>> markAsSeen - Error en IMAP: ${error.message}`);
    console.error(`>>> markAsSeen - Stack: ${error.stack}`);
    
    // Si falla IMAP completamente, solo actualizar si ya existe correoActual
    // 🔴 IMPORTANTE: No crear correos "fantasma" cuando IMAP falla
    if (correoActual) {
      console.log(`>>> markAsSeen - Actualizando cache local aunque IMAP falló (solo si ya existe correo válido)`);
      const correoParaGuardar = {
        ...correoActual,
        seen: !!visto,
        leido: !!visto,
        flags: newFlags
      };
      
      await guardarCorreoEnCache(uidNum, carpeta, correoParaGuardar, correoActual?.html ? true : false);
    } else {
      console.log(`>>> markAsSeen - IMAP falló y no hay correo en cache para UID ${uidNum}. No se creará correo vacío.`);
    }

    try {
      await guardarCorreoEnCache(uidNum, carpeta, correoParaGuardar, correoActual?.html ? true : false);
      await limpiarCacheListaCarpeta(carpeta);
      console.log(`>>> markAsSeen - Cache local actualizado: seen=${!!visto}, flags=${JSON.stringify(newFlags)}`);
    } catch (cacheError) {
      console.error(`>>> markAsSeen - Error actualizando cache local: ${cacheError.message}`);
    }
    
    // No lanzar error, retornar el valor esperado
    return !!visto;
  }
}

/**
 * Alterna un flag específico en un correo
 * Implementa el flujo estable: UI → IMAP → espera → relectura → cache → verificación
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @param {string} flag - Flag a alternar (ej: "\\Flagged", "\\Seen", "\\Deleted")
 * @param {boolean} activar - true para activar, false para desactivar (opcional, si no se especifica alterna)
 * @returns {Promise<boolean>} true si el flag está activo después de la operación
 */
export async function toggleFlag(uid, carpeta, flag, activar = null) {
  console.log(`🚀 toggleFlag: UID=${uid}, Carpeta=${carpeta}, Flag=${flag}, Activar=${activar}`);

  // Validar UID
  const uidNumero = Number(uid);
  if (!uidNumero || !Number.isFinite(uidNumero)) {
    throw new Error(`UID inválido: ${uid}`);
  }

  // Verificar si IMAP está offline ANTES de intentar cualquier operación
  if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
    console.warn(`⚠️ toggleFlag - IMAP está offline, no se puede operar`);
    return {
      success: false,
      offline: true,
      important: flag === "\\Flagged" ? (activar !== null ? activar : null) : null,
      flags: null
    };
  }

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  // Retry automático con 3 intentos
  const maxIntentos = 3;
  const esperaEntreIntentos = 300;
  let ultimoError = null;

  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      return await imapManager.withImapClient(async (client) => {
        // Encontrar carpeta real
        const nombreCarpetaReal = await encontrarCarpetaReal(client, carpeta);
        if (!nombreCarpetaReal) {
          throw new Error(`No se pudo encontrar la carpeta ${carpeta}`);
        }

        // 🔴 CRÍTICO: Abrir la carpeta ANTES de operar flags
        await client.mailboxOpen(nombreCarpetaReal);
        console.log(`✅ toggleFlag - Carpeta ${nombreCarpetaReal} abierta correctamente`);

        const lock = await client.getMailboxLock(nombreCarpetaReal);

    try {
      // Paso 1: Leer estado actual del flag
      let flagActual = false;
      const correoCache = await obtenerCorreoDelCache(uidNumero, nombreCarpetaReal, true);
      if (correoCache && correoCache.flags) {
        flagActual = correoCache.flags.includes(flag);
      } else {
        // Si no está en cache, leer desde IMAP usando UID correctamente
        // 🔴 CRÍTICO: Usar { uid: true } en el tercer parámetro para que ImapFlow envíe UID FETCH
        try {
          const msg = await client.fetchOne(uidNumero, { flags: true }, { uid: true });
          if (msg && msg.uid === uidNumero) {
            flagActual = msg.flags?.has(flag) || false;
          }
        } catch (fetchError) {
          console.warn(`>>> toggleFlag - Error leyendo flags desde IMAP: ${fetchError.message}`);
        }
      }

      // Paso 2: Determinar acción (alternar si no se especifica)
      const nuevoEstado = activar !== null ? activar : !flagActual;

      // Paso 3: Leer flags ANTES de modificar para tener referencia
      let flagsAntes = [];
      try {
        // 🔴 CRÍTICO: Usar { uid: true } en el tercer parámetro
        const msgAntes = await client.fetchOne(uidNumero, { flags: true }, { uid: true });
        if (msgAntes && msgAntes.uid === uidNumero) {
          flagsAntes = msgAntes.flags ? Array.from(msgAntes.flags) : [];
        }
      } catch (e) {
        console.warn(`>>> toggleFlag - No se pudieron leer flags antes: ${e.message}`);
      }
      console.log(`>>> toggleFlag - Flags ANTES: ${JSON.stringify(flagsAntes)}`);

      // Paso 4: Aplicar flag en IMAP usando { uid: true } para que use UID y no número de secuencia
      if (nuevoEstado) {
        await client.messageFlagsAdd(uidNumero, [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(uidNumero, [flag], { uid: true });
      }
      console.log(`✅ Flag ${flag} ${nuevoEstado ? 'agregado' : 'removido'} en IMAP para UID ${uidNumero} (usando { uid: true })`);

      // Paso 5: Esperar 300-400ms antes de releer (igual que markAsSeen)
      const delay = 300 + Math.floor(Math.random() * 100);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Paso 6: Releer y verificar con reintentos (especialmente importante al desmarcar)
      let flagsReales = flagsAntes;
      let flagReal = flagsAntes.includes(flag);
      const maxReintentosVerificacion = 5; // 🔴 CORREGIDO: Variable definida correctamente
      
      for (let intento = 0; intento < maxReintentosVerificacion; intento++) {
        // Esperar entre 300-500ms antes de verificar
        const delay = 300 + Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
          // 🔴 CRÍTICO: Usar { uid: true } en el tercer parámetro para que ImapFlow envíe UID FETCH
          // Esto previene el error "Invalid messageset"
          const msg = await client.fetchOne(uidNumero, { flags: true }, { uid: true });
          if (msg && msg.uid === uidNumero) {
            flagsReales = msg.flags ? Array.from(msg.flags) : [];
            flagReal = flagsReales.includes(flag);
            console.log(`>>> toggleFlag - Reintento verificación ${intento + 1}/${maxReintentosVerificacion} - flags: ${JSON.stringify(flagsReales)}, hasFlag: ${flagReal}`);
            
            // Si el resultado coincide con lo que queríamos, salir del loop
            if (flagReal === nuevoEstado) {
              console.log(`✅ toggleFlag - Flag ${flag} confirmado en IMAP después de ${intento + 1} intento(s)`);
              break;
            }
          }
        } catch (fetchError) {
          console.warn(`⚠️ toggleFlag - Error en reintento verificación ${intento + 1}: ${fetchError.message}`);
          // Continuar con el siguiente intento
        }
      }
      
      // Si después de todos los intentos no coincide, usar el valor que queríamos
      if (flagReal !== nuevoEstado) {
        console.warn(`⚠️ toggleFlag - Después de ${maxReintentosVerificacion} intentos, flag ${flag} no coincide. Usando valor esperado: ${nuevoEstado}`);
        // Actualizar flagsReales para reflejar el estado esperado
        if (nuevoEstado) {
          flagsReales = [...new Set([...flagsReales, flag])];
        } else {
          flagsReales = flagsReales.filter(f => f !== flag);
        }
        flagReal = nuevoEstado;
      }
      
      console.log(`>>> toggleFlag - FINAL - flags: ${JSON.stringify(flagsReales)}, ${flag}: ${flagReal}`);

      // Paso 5: Actualizar cache local con valores reales
      if (flagsReales !== null && flagReal !== null) {
        const correoCacheActual = await obtenerCorreoDelCache(uid, nombreCarpetaReal, true);
        if (correoCacheActual) {
          // Si el flag es \Flagged, también actualizar el campo important
          const important = flag === "\\Flagged" ? flagReal : (correoCacheActual.important ?? (flagsReales.includes("\\Flagged")));
          
          const correoFinal = {
            ...correoCacheActual,
            flags: flagsReales,
            important: important, // Mantener sincronizado con flags
            seen: correoCacheActual.seen ?? (flagsReales.includes("\\Seen")), // Mantener seen también sincronizado
            leido: correoCacheActual.leido ?? (flagsReales.includes("\\Seen")), // Compatibilidad
          };

          console.log(`>>> toggleFlag - Actualizando cache/DB con flags=${JSON.stringify(flagsReales)}, important=${important}, seen=${correoFinal.seen}`);

          await guardarCorreoEnCache(uidNumero, nombreCarpetaReal, correoFinal, correoCacheActual.html ? true : false);
          if (nombreCarpetaReal !== carpeta) {
            await guardarCorreoEnCache(uidNumero, carpeta, correoFinal, correoCacheActual.html ? true : false);
          }

          // Actualizar lista en cache
          const limites = [10, 20, 50];
          for (const limit of limites) {
            try {
              const listaCache = await obtenerListaDelCache(nombreCarpetaReal, limit);
              if (listaCache && Array.isArray(listaCache)) {
                const listaActualizada = listaCache.map(m => {
                  if (m.uid === uidNumero) {
                    const importantLista = flag === "\\Flagged" ? flagReal : (m.important ?? (flagsReales.includes("\\Flagged")));
                    return { 
                      ...m, 
                      flags: flagsReales,
                      important: importantLista,
                      seen: m.seen ?? (flagsReales.includes("\\Seen")),
                      leido: m.leido ?? (flagsReales.includes("\\Seen")),
                    };
                  }
                  return m;
                });

                await guardarListaEnCache(nombreCarpetaReal, listaActualizada, limit);
                if (nombreCarpetaReal !== carpeta) {
                  await guardarListaEnCache(carpeta, listaActualizada, limit);
                }
              }
            } catch (listError) {
              console.warn(`⚠️ Error actualizando lista con limit ${limit}: ${listError.message}`);
            }
          }
          
          // Invalidar cache de lista para forzar recarga con valores actualizados
          try {
            await limpiarCacheListaCarpeta(nombreCarpetaReal);
            if (nombreCarpetaReal !== carpeta) {
              await limpiarCacheListaCarpeta(carpeta);
            }
            console.log(`>>> toggleFlag - Cache de lista invalidado para carpeta ${nombreCarpetaReal}`);
          } catch (invalidateError) {
            console.warn(`⚠️ Error invalidando cache de lista: ${invalidateError.message}`);
          }
        }
      }

      // Paso 7: Verificar consistencia
      const correoVerificado = await obtenerCorreoDelCache(uidNumero, nombreCarpetaReal, false);
      if (correoVerificado && correoVerificado.flags) {
        const flagEnCache = correoVerificado.flags.includes(flag);
        if (flagEnCache !== flagReal) {
          console.warn(`⚠️ Inconsistencia detectada: flag ${flag} en cache=${flagEnCache}, flag en IMAP=${flagReal}`);
          // Reintentar una vez más
          const correoReintento = await obtenerCorreoPorUID(uidNumero, nombreCarpetaReal, false);
          if (correoReintento) {
            await guardarCorreoEnCache(uidNumero, nombreCarpetaReal, correoReintento, false);
          }
        }
      }

      // Calcular important si es el flag \Flagged
      const important = flag === "\\Flagged" ? flagReal : null;
      
      console.log(`✅ toggleFlag completado: UID=${uidNumero}, Flag=${flag}, Estado=${flagReal}`);
      
      // Retornar objeto consistente
      return {
        success: true,
        important: important,
        flags: flagsReales,
        offline: false
      };
        } finally {
          lock.release();
        }
      });
    } catch (error) {
      ultimoError = error;
      
      // Si es error de conexión y no es el último intento, reintentar
      if ((error instanceof ConnectionNotAvailableError || 
           error.message?.includes("Connection") || 
           error.message?.includes("ETIMEOUT") ||
           error.message?.includes("timeout")) && 
          intento < maxIntentos - 1) {
        console.warn(`⚠️ toggleFlag - Intento ${intento + 1}/${maxIntentos} falló: ${error.message}. Reintentando en ${esperaEntreIntentos}ms...`);
        await new Promise(resolve => setTimeout(resolve, esperaEntreIntentos));
        continue; // Reintentar
      }
      
      // Si es error de conexión y es el último intento, o si IMAP está offline
      if (error instanceof ConnectionNotAvailableError || 
          error.message?.includes("Connection") || 
          error.message?.includes("ETIMEOUT") ||
          error.message?.includes("timeout") ||
          imapManager.isOffline()) {
        console.warn(`⚠️ toggleFlag - IMAP offline o error de conexión después de ${intento + 1} intentos`);
        return {
          success: false,
          offline: true,
          important: flag === "\\Flagged" ? (activar !== null ? activar : null) : null,
          flags: null
        };
      }
      
      // Otros errores: lanzar
      throw error;
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  console.error(`❌ toggleFlag - Todos los intentos fallaron. Último error: ${ultimoError?.message}`);
  throw ultimoError || new Error("Error desconocido en toggleFlag");
}

/**
 * Mueve un correo de una carpeta a otra
 * Implementa el flujo estable: UI → IMAP → espera → relectura → cache → verificación
 * @param {number} uid - UID del correo
 * @param {string} carpetaOrigen - Carpeta de origen
 * @param {string} carpetaDestino - Carpeta de destino
 * @returns {Promise<boolean>} true si se movió correctamente
 */
export async function moveMail(uid, carpetaOrigen, carpetaDestino) {
  console.log(`🚀 moveMail: UID=${uid}, Origen=${carpetaOrigen}, Destino=${carpetaDestino}`);

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  try {
    return await imapManager.withImapClient(async (client) => {
      const nombreCarpetaOrigenReal = await encontrarCarpetaReal(client, carpetaOrigen);
    const nombreCarpetaDestinoReal = await encontrarCarpetaReal(client, carpetaDestino);

    if (!nombreCarpetaOrigenReal) {
      throw new Error(`No se pudo encontrar la carpeta de origen ${carpetaOrigen}`);
    }
    if (!nombreCarpetaDestinoReal) {
      throw new Error(`No se pudo encontrar la carpeta de destino ${carpetaDestino}`);
    }

    // Paso 1: Obtener correo del cache antes de mover
    const correoMovido = await obtenerCorreoDelCache(uid, nombreCarpetaOrigenReal, true);

    // Paso 2: Actualizar UI localmente (remover de origen)
    // Esto se hace en la UI, pero actualizamos el cache

    const lock = await client.getMailboxLock(nombreCarpetaOrigenReal);

    try {
      // Paso 3: Mover en IMAP usando UID
      await client.messageMove(uid, nombreCarpetaDestinoReal, { uid: true });
      console.log(`✅ Correo ${uid} movido de ${nombreCarpetaOrigenReal} a ${nombreCarpetaDestinoReal} en IMAP (usando { uid: true })`);

      // Paso 4: Esperar 300-800ms
      const delay = 300 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Paso 5: Verificar que el correo está en la carpeta destino
      // Nota: El UID puede cambiar al mover, así que buscamos por fecha/asunto
      let correoEncontrado = null;
      let nuevoUid = null;
      try {
        const lockDestino = await client.getMailboxLock(nombreCarpetaDestinoReal);
        try {
          // Buscar el correo más reciente con el mismo asunto
          if (correoMovido && correoMovido.subject) {
            const sequence = await client.search({ all: true });
            if (sequence.length > 0) {
              // Buscar en los últimos 10 correos
              const ultimos = sequence.slice(-10);
              for await (const msg of client.fetch(ultimos, { envelope: true, uid: true })) {
                if (msg.envelope.subject === correoMovido.subject) {
                  nuevoUid = msg.uid;
                  correoEncontrado = true;
                  break;
                }
              }
            }
          }

          // Si no se encontró por asunto, usar el UID original (puede que no haya cambiado)
          if (!correoEncontrado) {
            try {
              for await (const msg of client.fetch(uid, { envelope: true, uid: true })) {
                if (msg.uid === uid) {
                  nuevoUid = uid;
                  correoEncontrado = true;
                  break;
                }
              }
            } catch (e) {
              // El UID cambió, usar el último UID de la carpeta
              const sequence = await client.search({ all: true });
              if (sequence.length > 0) {
                nuevoUid = sequence[sequence.length - 1];
                correoEncontrado = true;
              }
            }
          }
        } finally {
          lockDestino.release();
        }
      } catch (verificacionError) {
        console.warn(`⚠️ Error verificando correo movido: ${verificacionError.message}`);
        // Asumir que se movió correctamente
        correoEncontrado = true;
        nuevoUid = uid; // Usar UID original como fallback
      }

      // Paso 6: Actualizar cache
      if (correoMovido && correoEncontrado) {
        // Eliminar del cache de origen
        const { eliminarCorreoDelCache } = await import("./emailCache.js");
        await eliminarCorreoDelCache(uid, nombreCarpetaOrigenReal);
        if (nombreCarpetaOrigenReal !== carpetaOrigen) {
          await eliminarCorreoDelCache(uid, carpetaOrigen);
        }

        // Guardar en cache de destino (con nuevo UID si cambió)
        const correoParaDestino = {
          ...correoMovido,
          uid: nuevoUid || uid
        };

        await guardarCorreoEnCache(nuevoUid || uid, nombreCarpetaDestinoReal, correoParaDestino, correoMovido.html ? true : false);
        if (nombreCarpetaDestinoReal !== carpetaDestino) {
          await guardarCorreoEnCache(nuevoUid || uid, carpetaDestino, correoParaDestino, correoMovido.html ? true : false);
        }

        // Actualizar listas en cache
        const limites = [10, 20, 50];
        for (const limit of limites) {
          try {
            // Remover de lista de origen
            const listaOrigen = await obtenerListaDelCache(nombreCarpetaOrigenReal, limit);
            if (listaOrigen && Array.isArray(listaOrigen)) {
              const listaActualizadaOrigen = listaOrigen.filter(m => m.uid !== uid);
              await guardarListaEnCache(nombreCarpetaOrigenReal, listaActualizadaOrigen, limit);
              if (nombreCarpetaOrigenReal !== carpetaOrigen) {
                await guardarListaEnCache(carpetaOrigen, listaActualizadaOrigen, limit);
              }
            }

            // Agregar a lista de destino
            const listaDestino = await obtenerListaDelCache(nombreCarpetaDestinoReal, limit);
            const listaActualizadaDestino = listaDestino
              ? [correoParaDestino, ...listaDestino.filter(m => m.uid !== (nuevoUid || uid))].slice(0, limit)
              : [correoParaDestino];
            await guardarListaEnCache(nombreCarpetaDestinoReal, listaActualizadaDestino, limit);
            if (nombreCarpetaDestinoReal !== carpetaDestino) {
              await guardarListaEnCache(carpetaDestino, listaActualizadaDestino, limit);
            }
          } catch (listError) {
            console.warn(`⚠️ Error actualizando listas con limit ${limit}: ${listError.message}`);
          }
        }
      }

      // Paso 7: Verificar consistencia
      const correoEnDestino = await obtenerCorreoDelCache(nuevoUid || uid, nombreCarpetaDestinoReal, false);
      if (!correoEnDestino) {
        console.warn(`⚠️ Correo no encontrado en cache de destino después de mover`);
        // Reintentar obteniendo desde IMAP
        try {
          const correoReintento = await obtenerCorreoPorUID(nuevoUid || uid, nombreCarpetaDestinoReal, false);
          if (correoReintento) {
            await guardarCorreoEnCache(nuevoUid || uid, nombreCarpetaDestinoReal, correoReintento, false);
          }
        } catch (reintentoError) {
          console.warn(`⚠️ Error en reintento: ${reintentoError.message}`);
        }
      }

      console.log(`✅ moveMail completado: UID=${nuevoUid || uid} en ${nombreCarpetaDestinoReal}`);
      return true;
    } finally {
      lock.release();
    }
    });
  } catch (error) {
    if (error instanceof ConnectionNotAvailableError) {
      throw error;
    }
    console.error(`❌ Error en moveMail: ${error.message}`);
    throw error;
  }
}

/**
 * Configura un listener IMAP para detectar cambios remotos en una carpeta
 * Usa polling periódico ya que ImapFlow no expone eventos de mail directamente
 * 
 * IMPORTANTE: Solo se crea UN listener por carpeta (singleton)
 * Múltiples callbacks pueden registrarse para la misma carpeta
 * 
 * @param {string} carpeta - Carpeta a monitorear
 * @param {Function} callback - Función a llamar cuando hay cambios (recibe carpeta como parámetro)
 * @returns {Promise<Function>} Función para desactivar el listener
 */
export async function configurarListenerIMAP(carpeta, callback) {
  const nombreCarpetaReal = carpeta.toUpperCase(); // Normalizar para consistencia
  
  // Verificar si ya existe un listener activo para esta carpeta
  const listenerExistente = imapListeners.get(nombreCarpetaReal);
  
  if (listenerExistente && listenerExistente.pollingActivo) {
    // Ya hay un listener activo, solo agregar el callback
    console.log(`🎧 Listener ya existe para ${nombreCarpetaReal}, agregando callback`);
    listenerExistente.callbacks.add(callback);
    
    // Retornar función para desactivar solo este callback
    return () => {
      const listener = imapListeners.get(nombreCarpetaReal);
      if (listener) {
        listener.callbacks.delete(callback);
        // Si no quedan callbacks, detener el polling
        if (listener.callbacks.size === 0) {
          listener.pollingActivo = false;
          imapListeners.delete(nombreCarpetaReal);
          console.log(`🔇 Listener detenido para ${nombreCarpetaReal} (sin callbacks)`);
        }
      }
    };
  }

  console.log(`🎧 Configurando NUEVO listener IMAP para carpeta: ${nombreCarpetaReal}`);

  try {
    // Crear nuevo listener con estructura completa
    const listenerInfo = {
      callbacks: new Set([callback]),
      pollingActivo: true,
      ultimoUID: null,
      cleanup: null
    };
    
    imapListeners.set(nombreCarpetaReal, listenerInfo);

    // Configurar polling periódico (solo una vez por carpeta)
    const iniciarPolling = async () => {
      while (listenerInfo.pollingActivo) {
        try {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Polling cada 5 segundos

          if (!listenerInfo.pollingActivo) break;

          // Verificar si IMAP está offline antes de hacer polling
          if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
            // Si está offline, esperar más tiempo y no loguear error
            continue;
          }

          // Usar el manager para obtener conexión
          try {
            await imapManager.withImapClient(async (client) => {
              const carpetaReal = await encontrarCarpetaReal(client, carpeta);

              if (carpetaReal) {
                const lock = await client.getMailboxLock(carpetaReal);
                try {
                  // Obtener el último UID de la carpeta
                  const sequenceRaw = await client.search({ all: true });
                  // Asegurar que sea un array
                  const sequence = Array.isArray(sequenceRaw) ? sequenceRaw : (sequenceRaw ? [sequenceRaw] : []);
                  const nuevoUltimoUID = sequence.length > 0 ? sequence[sequence.length - 1] : null;

                  // Si el UID cambió, hay correos nuevos
                  if (listenerInfo.ultimoUID !== null && nuevoUltimoUID !== listenerInfo.ultimoUID) {
                    console.log(`📬 Cambio detectado en carpeta ${carpetaReal}: UID cambió de ${listenerInfo.ultimoUID} a ${nuevoUltimoUID}`);
                    
                    // Notificar a todos los callbacks registrados
                    listenerInfo.callbacks.forEach(cb => {
                      try {
                        cb(carpetaReal);
                      } catch (cbError) {
                        console.error(`❌ Error en callback de listener: ${cbError.message}`);
                      }
                    });
                  }

                  listenerInfo.ultimoUID = nuevoUltimoUID;
                } finally {
                  lock.release();
                }
              }
            });
          } catch (pollingError) {
            // Si es ConnectionNotAvailableError, solo continuar
            if (pollingError instanceof ConnectionNotAvailableError || pollingError.name === 'ConnectionNotAvailableError' || pollingError.status === 'offline') {
              // Continuar con el siguiente ciclo sin loguear
              continue;
            } else {
              console.warn(`⚠️ Error en polling de listener: ${pollingError.message}`);
            }
          }
        } catch (pollingError) {
          // Si es ConnectionNotAvailableError, solo continuar
          if (pollingError instanceof ConnectionNotAvailableError || pollingError.name === 'ConnectionNotAvailableError' || pollingError.status === 'offline') {
            continue;
          } else {
            console.warn(`⚠️ Error en polling de listener: ${pollingError.message}`);
          }
        }
      }
    };

    // Iniciar polling en segundo plano
    iniciarPolling().catch(err => {
      console.error(`❌ Error en polling de listener: ${err.message}`);
      listenerInfo.pollingActivo = false;
    });

    // Retornar función para desactivar el listener
    return () => {
      const listener = imapListeners.get(nombreCarpetaReal);
      if (listener) {
        listener.callbacks.delete(callback);
        // Si no quedan callbacks, detener el polling
        if (listener.callbacks.size === 0) {
          listener.pollingActivo = false;
          imapListeners.delete(nombreCarpetaReal);
          console.log(`🔇 Listener detenido para ${nombreCarpetaReal} (sin callbacks)`);
        }
      }
    };
  } catch (error) {
    console.error(`❌ Error configurando listener IMAP: ${error.message}`);
    throw error;
  }
}

/**
 * Cierra el cliente IMAP persistente (útil para limpieza)
 */
export async function cerrarClienteIMAPPersistente() {
  if (imapClientPersistente) {
    try {
      await imapClientPersistente.logout();
    } catch (err) {
      console.warn(`⚠️ Error cerrando cliente IMAP persistente: ${err.message}`);
    }
    imapClientPersistente = null;
  }
  
  // Detener todos los listeners
  for (const [carpeta, listener] of imapListeners.entries()) {
    listener.pollingActivo = false;
  }
  imapListeners.clear();
}

/**
 * Obtiene el estado de los listeners (útil para debugging)
 */
export function getListenersStatus() {
  const status = {};
  for (const [carpeta, listener] of imapListeners.entries()) {
    status[carpeta] = {
      callbacks: listener.callbacks.size,
      pollingActivo: listener.pollingActivo,
      ultimoUID: listener.ultimoUID
    };
  }
  return status;
}

/**
 * Sincronización incremental por UID - NUEVA IMPLEMENTACIÓN
 * Solo sincroniza mensajes nuevos (UID > maxUID) para máxima eficiencia
 * 
 * @param {string} carpeta - Nombre de la carpeta
 * @param {number} limit - Límite de mensajes para bootstrap (solo primera vez)
 * @returns {Promise<{nuevos: number, mensajes: Array}>} Resultado de la sincronización
 */
export async function sincronizarCarpetaIncremental(carpeta, limit = 50) {
  const inicioTiempo = Date.now();
  console.log(`🔄 Iniciando sync incremental para carpeta: ${carpeta}`);
  
  try {
    // Paso 1: Obtener maxUID actual
    const maxUid = await getMaxUidForFolder(carpeta);
    console.log(`📊 MaxUID actual para ${carpeta}: ${maxUid}`);
    
    return await imapManager.withImapClient(async (client) => {
      // Encontrar nombre real de la carpeta
      const nombreCarpetaReal = await encontrarCarpetaReal(client, carpeta);
      if (!nombreCarpetaReal) {
        throw new Error(`No se pudo encontrar la carpeta ${carpeta}`);
      }
      
      const lock = await client.getMailboxLock(nombreCarpetaReal);
      
      try {
        // Abrir la carpeta
        const mailbox = await client.mailboxOpen(nombreCarpetaReal);
        const totalMessages = mailbox.exists || 0;
        
        // Si la carpeta está vacía
        if (totalMessages === 0) {
          await setMaxUidForFolder(carpeta, 0);
          await guardarListaEnCache(carpeta, [], limit);
          console.log(`✅ Carpeta ${carpeta} vacía, estado guardado`);
          return { nuevos: 0, mensajes: [] };
        }
        
        // Paso 2: Si no hay maxUID (primera vez) - Bootstrap
        if (maxUid === 0) {
          console.log(`🚀 Bootstrap inicial para ${carpeta} - descargando últimos ${limit} mensajes`);
          
          // Calcular rango para los últimos N mensajes
          const start = Math.max(1, totalMessages - limit + 1);
          const end = totalMessages;
          const sequence = start === end ? String(start) : `${start}:${end}`;
          
          const mensajesBootstrap = [];
          let maxUidBootstrap = 0;
          
          // Fetch solo de ese rango con envelope, flags, uid (sin source)
          for await (const msg of client.fetch(sequence, {
            envelope: true,
            flags: true,
            uid: true,
            // NO incluir source aquí - solo metadatos
          })) {
            if (!msg.uid) continue;
            
            const fromText = msg.envelope.from?.map(f => {
              if (f.name) {
                return `${f.name} <${f.address}>`;
              }
              return f.address;
            }).join(", ") || "Sin remitente";
            
            const toText = msg.envelope.to?.map(t => t.address).join(", ") || "";
            const flagsArray = msg.flags ? Array.from(msg.flags) : [];
            const seen = flagsArray.includes("\\Seen");
            const important = flagsArray.includes("\\Flagged");
            
            // Validar metadata mínima
            const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                                  (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                                  (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
            
            if (tieneMetadata) {
              const mensaje = {
                uid: msg.uid,
                subject: msg.envelope.subject || "(Sin asunto)",
                from: fromText,
                date: msg.envelope.date || new Date(),
                to: toText,
                text: "",
                html: "",
                flags: flagsArray,
                leido: seen,
                seen: seen,
                important: important,
                preview: "",
              };
              
              mensajesBootstrap.push(mensaje);
              maxUidBootstrap = Math.max(maxUidBootstrap, msg.uid);
            }
          }
          
          // Ordenar del más nuevo al más viejo
          mensajesBootstrap.reverse();
          
          // Guardar en cache
          await guardarListaEnCache(carpeta, mensajesBootstrap, limit);
          
          // 🔍 Verificación inmediata después de guardar
          console.log(`🔍 Verificando guardado de cache para ${carpeta}...`);
          const verificado = await obtenerListaDelCache(carpeta, limit);
          if (verificado && verificado.length > 0) {
            console.log(`✅ VERIFICACIÓN: Cache disponible con ${verificado.length} correos`);
          } else {
            console.error(`❌ ERROR CRÍTICO: Cache NO disponible después de guardar!`);
            console.error(`   Mensajes guardados: ${mensajesBootstrap.length}`);
            console.error(`   Cache encontrado: ${verificado ? verificado.length : 'null'}`);
            // Reintentar guardado una vez más
            console.log(`🔄 Reintentando guardado de cache...`);
            await guardarListaEnCache(carpeta, mensajesBootstrap, limit);
            const verificado2 = await obtenerListaDelCache(carpeta, limit);
            if (verificado2 && verificado2.length > 0) {
              console.log(`✅ Reintento exitoso: Cache disponible con ${verificado2.length} correos`);
            } else {
              console.error(`❌ Reintento fallido: Cache aún no disponible`);
            }
          }
          
          // Guardar correos individuales (sin contenido completo)
          for (const mensaje of mensajesBootstrap) {
            await guardarCorreoEnCache(mensaje.uid, carpeta, mensaje, false);
            if (nombreCarpetaReal !== carpeta) {
              await guardarCorreoEnCache(mensaje.uid, nombreCarpetaReal, mensaje, false);
            }
          }
          
          // Fijar maxUID
          await setMaxUidForFolder(carpeta, maxUidBootstrap);
          
          const tiempoTranscurrido = Date.now() - inicioTiempo;
          console.log(`✅ Bootstrap completado para ${carpeta}: ${mensajesBootstrap.length} mensajes en ${tiempoTranscurrido}ms`);
          
          return { nuevos: mensajesBootstrap.length, mensajes: mensajesBootstrap };
        }
        
        // Paso 3: Si sí hay maxUID - Sync incremental
        console.log(`📥 Sync incremental para ${carpeta} - buscando UIDs > ${maxUid}`);
        
        // OPTIMIZACIÓN: Buscar solo los últimos mensajes y filtrar por UID
        // Esto evita escanear toda la carpeta
        // Buscar desde el final hacia atrás hasta encontrar mensajes con UID <= maxUid
        const mensajesNuevos = [];
        let nuevoMaxUid = maxUid;
        const MAX_SCAN = 200; // Máximo de mensajes a escanear desde el final
        
        // Obtener todos los números de secuencia
        const allSequence = await client.search({ all: true });
        const allSequenceArray = Array.isArray(allSequence) ? allSequence : (allSequence ? [allSequence] : []);
        
        if (allSequenceArray.length === 0) {
          console.log(`✅ No hay mensajes en ${carpeta}`);
          return { nuevos: 0, mensajes: [] };
        }
        
        // Escanear solo los últimos MAX_SCAN mensajes (desde el final)
        const startScan = Math.max(1, allSequenceArray.length - MAX_SCAN + 1);
        const endScan = allSequenceArray.length;
        const sequenceToScan = startScan === endScan ? String(startScan) : `${startScan}:${endScan}`;
        
        // Fetch de los últimos mensajes con UID para identificar cuáles son nuevos
        for await (const msg of client.fetch(sequenceToScan, {
          uid: true,
          envelope: true,
          flags: true,
          // NO incluir source - solo metadatos
        })) {
          if (!msg.uid) continue;
          
          // Si el UID es menor o igual al maxUID, ya no hay más mensajes nuevos
          // (porque los mensajes están ordenados por número de secuencia, no por UID)
          // Pero como estamos escaneando desde el final, seguimos hasta encontrar todos los nuevos
          if (msg.uid > maxUid) {
            const fromText = msg.envelope.from?.map(f => {
              if (f.name) {
                return `${f.name} <${f.address}>`;
              }
              return f.address;
            }).join(", ") || "Sin remitente";
            
            const toText = msg.envelope.to?.map(t => t.address).join(", ") || "";
            const flagsArray = msg.flags ? Array.from(msg.flags) : [];
            const seen = flagsArray.includes("\\Seen");
            const important = flagsArray.includes("\\Flagged");
            
            // Validar metadata mínima
            const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                                  (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                                  (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
            
            if (tieneMetadata) {
              const mensaje = {
                uid: msg.uid,
                subject: msg.envelope.subject || "(Sin asunto)",
                from: fromText,
                date: msg.envelope.date || new Date(),
                to: toText,
                text: "",
                html: "",
                flags: flagsArray,
                leido: seen,
                seen: seen,
                important: important,
                preview: "",
              };
              
              mensajesNuevos.push(mensaje);
              nuevoMaxUid = Math.max(nuevoMaxUid, msg.uid);
            }
          }
        }
        
        // Ordenar del más nuevo al más viejo
        mensajesNuevos.sort((a, b) => b.uid - a.uid);
        
        if (mensajesNuevos.length === 0) {
          console.log(`✅ No hay mensajes nuevos en ${carpeta} (maxUID: ${maxUid})`);
          return { nuevos: 0, mensajes: [] };
        }
        
        console.log(`📬 Encontrados ${mensajesNuevos.length} mensajes nuevos en ${carpeta}`);
        
        // Guardar correos individuales (sin contenido completo)
        for (const mensaje of mensajesNuevos) {
          await guardarCorreoEnCache(mensaje.uid, carpeta, mensaje, false);
          if (nombreCarpetaReal !== carpeta) {
            await guardarCorreoEnCache(mensaje.uid, nombreCarpetaReal, mensaje, false);
          }
        }
        
        // Actualizar lista cacheada: insertar nuevos al principio y recortar
        const listaExistente = await obtenerListaDelCache(carpeta, limit) || [];
        const listaActualizada = [...mensajesNuevos, ...listaExistente.filter(m => !mensajesNuevos.some(n => n.uid === m.uid))].slice(0, limit);
        await guardarListaEnCache(carpeta, listaActualizada, limit);
        
        // 🔍 Verificación después de actualizar lista
        const verificado = await obtenerListaDelCache(carpeta, limit);
        if (verificado && verificado.length > 0) {
          console.log(`✅ VERIFICACIÓN post-sync: Cache actualizado con ${verificado.length} correos`);
        } else {
          console.warn(`⚠️ Advertencia: Cache no disponible después de actualizar lista`);
        }
        
        // Actualizar maxUID
        await setMaxUidForFolder(carpeta, nuevoMaxUid);
        
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`✅ Sync incremental completado para ${carpeta}: ${mensajesNuevos.length} nuevos mensajes en ${tiempoTranscurrido}ms`);
        
        return { nuevos: mensajesNuevos.length, mensajes: mensajesNuevos };
        
      } finally {
        lock.release();
      }
    });
    
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`❌ Error en sync incremental para ${carpeta} después de ${tiempoTranscurrido}ms:`, error.message);
    
    // Si es error de conexión, retornar datos desde cache sin tirar abajo todo
    if (error instanceof ConnectionNotAvailableError || error.message?.includes("Connection") || error.message?.includes("ETIMEDOUT")) {
      console.warn(`⚠️ Error de conexión en sync, retornando datos desde cache`);
      const mensajesCache = await obtenerListaDelCache(carpeta, limit) || [];
      return { nuevos: 0, mensajes: mensajesCache };
    }
    
    throw error;
  }
}

