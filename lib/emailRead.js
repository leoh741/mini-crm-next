// Servicio para leer correos electrónicos usando IMAP (ImapFlow)
// Permite leer la bandeja de entrada de contacto@digitalspace.com.ar
// Soporta múltiples carpetas: INBOX, SPAM, TRASH, etc.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { emailConfig } from "./emailConfig.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache, eliminarCorreoDelCache, normalizarFecha } from "./emailCache.js";
import { obtenerListaDelCache, guardarListaEnCache, limpiarCacheListaCarpeta } from "./emailListCache.js";
import { imapManager, ConnectionNotAvailableError } from "./imapConnectionManager.js";
import { enqueueFetchBody } from "./emailBodyFetcher.js";
// Importar error handlers globales para prevenir que errores no capturados tiren abajo el servidor
import "./errorHandlers.js";

/**
 * Detecta si un error es de conexión/red
 */
function isConnectionError(err) {
  if (!err) return false;
  
  const msg = (err && err.message) || '';
  const code = err && err.code;
  
  return (
    code === 'ETIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    /timed out/i.test(msg) ||
    /Connection not available/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /ENOTFOUND/i.test(msg) ||
    /Handshake inactivity timeout/i.test(msg) ||
    /getaddrinfo/i.test(msg) ||
    err instanceof ConnectionNotAvailableError ||
    err.name === 'ConnectionNotAvailableError'
  );
}

/**
 * Detecta si un error indica que la carpeta realmente no existe
 */
function isRealNonExistentFolderError(err) {
  if (!err) return false;
  
  const msg = (err && err.message) || '';
  
  // Mensajes específicos de imapflow cuando la carpeta no existe
  return (
    /Mailbox does not exist/i.test(msg) ||
    /NO Such Mailbox/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /Mailbox.*not found/i.test(msg)
  );
}

// Cache simple en memoria para correos recientes (con y sin contenido)
// Estructura: { data: mensaje, timestamp: fecha, incluyeContenido: boolean }
const emailCache = new Map();
const CACHE_SIZE = 30; // Aumentado para mejor rendimiento
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos (aumentado para mejor persistencia)

/**
 * Obtiene la lista de carpetas disponibles en el servidor
 * @returns {Promise<Array>} Array de carpetas con su información
 */
async function obtenerCarpetas() {
  try {
    return await imapManager.withImapClient(async (client) => {
      // Usar await client.list() directamente - retorna un array o promesa que resuelve a array
      const mailboxes = await client.list();

      // Mapear el resultado a nuestro formato y filtrar carpetas no deseadas
      // Excluir: Sent Items, Promociones y sus variaciones
      const folders = (mailboxes || [])
        .filter(mb => {
          const nombre = mb.name?.toLowerCase() || '';
          const nombreOriginal = mb.name;
          
          // Excluir Sent Items y variaciones
          if (nombre.includes('sent items') || 
              nombreOriginal === 'Sent Items' || 
              nombreOriginal === 'SentItems') {
            return false;
          }
          
          // Excluir Promociones y variaciones
          if (nombre.includes('promociones') || 
              nombre.includes('promotions')) {
            return false;
          }
          
          return true;
        })
        .map((mb) => ({
          name: mb.name,
          path: mb.path || mb.name,
          delimiter: mb.delimiter || '/',
          flags: mb.flags || [],
          specialUse: mb.specialUse || null,
          subscribed: mb.subscribed ?? true,
        }));

      // Si no se encontraron carpetas, agregar al menos INBOX
      if (folders.length === 0) {
        console.warn("⚠️ No se encontraron carpetas, usando INBOX por defecto");
        folders.push({
          name: 'INBOX',
          path: 'INBOX',
          delimiter: '/',
          flags: [],
          specialUse: null,
          subscribed: true,
        });
      }

      return folders;
    });
  } catch (error) {
    if (error instanceof ConnectionNotAvailableError) {
      console.warn("⚠️ Error de conexión al obtener carpetas, retornando carpetas por defecto");
      // Retornar carpetas por defecto en modo offline (sin Sent Items ni Promociones)
      return [
        { name: 'INBOX', path: 'INBOX', delimiter: '/', flags: [], specialUse: null, subscribed: true },
        { name: 'SPAM', path: 'SPAM', delimiter: '/', flags: [], specialUse: null, subscribed: true },
        { name: 'TRASH', path: 'TRASH', delimiter: '/', flags: [], specialUse: null, subscribed: true },
      ];
    }
    throw error;
  }
}

/**
 * Obtiene los últimos correos de una carpeta específica
 * REFACTORIZADO: Cache-first total - siempre retorna desde cache primero
 * @param {string} carpeta - Nombre de la carpeta (INBOX, SPAM, TRASH, etc.)
 * @param {number} limit - Número máximo de correos a obtener (por defecto 10)
 * @param {boolean} forzarServidor - Si es true, ejecuta sync incremental y luego retorna desde cache
 * @returns {Promise<Array>} Array de correos ordenados del más nuevo al más viejo
 */
async function obtenerUltimosCorreos(carpeta = "INBOX", limit = 10, forzarServidor = false) {
  // CACHE-FIRST: Siempre intentar obtener desde cache primero (ultra-rápido)
  if (!forzarServidor) {
    const cachedList = await obtenerListaDelCache(carpeta, limit);
    if (cachedList && cachedList.length > 0) {
      console.log(`✅ Lista obtenida desde cache: ${cachedList.length} correos para ${carpeta}`);
      return cachedList;
    }
    // Si no hay cache, retornar vacío (la sync se hace en segundo plano)
    console.log(`⚠️ No hay cache para ${carpeta}, retornando vacío (sync en segundo plano)`);
    return [];
  }
  
  // Si se fuerza desde servidor, ejecutar sync incremental (no full scan)
  console.log(`🔄 Forzando sync incremental desde servidor IMAP para carpeta ${carpeta}`);
  
  // Importar función de sync incremental
  const { sincronizarCarpetaIncremental } = await import('./emailSync.js');
  
  try {
    // Ejecutar sync incremental (solo mensajes nuevos)
    await sincronizarCarpetaIncremental(carpeta, limit);
    
    // Después de sync, retornar desde cache
    const cachedList = await obtenerListaDelCache(carpeta, limit);
    return cachedList || [];
  } catch (syncError) {
    console.warn(`⚠️ Error en sync incremental, retornando cache: ${syncError.message}`);
    // Si falla la sync, retornar cache si existe
    const cachedList = await obtenerListaDelCache(carpeta, limit);
    return cachedList || [];
  }
}

/**
 * Obtiene SOLO un correo específico por su UID desde IMAP
 * OPTIMIZADO: No dispara syncs masivas ni descarga múltiples correos
 * Solo obtiene ese UID específico sin afectar otros correos
 * 
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo (por defecto INBOX)
 * @param {boolean} incluirContenido - Si incluir contenido completo (text/html/attachments)
 * @returns {Promise<Object>} Información del correo
 */
export async function obtenerCorreoSoloUID(uid, carpeta = "INBOX", incluirContenido = false) {
  const inicioTiempo = Date.now();
  console.log(`[obtenerCorreoSoloUID] Iniciando - UID: ${uid}, Carpeta: ${carpeta}, Contenido: ${incluirContenido}`);
  
  // Validar UID
  const uidNumero = Number(uid);
  if (isNaN(uidNumero) || uidNumero <= 0) {
    throw new Error(`UID inválido: ${uid}`);
  }

  // Usar el IMAP Connection Manager
  try {
    return await imapManager.withImapClient(async (client) => {
      // Encontrar el nombre correcto de la carpeta
      let nombreCarpetaReal = carpeta;
      let variaciones = [
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
      
      // Intentar abrir la carpeta
      let lock = null;
      for (const variacion of variaciones) {
        try {
          lock = await client.getMailboxLock(variacion);
          nombreCarpetaReal = variacion;
          break;
        } catch (e) {
          // Continuar con siguiente variación
        }
      }
      
      if (!lock) {
        throw new Error(`No se pudo abrir carpeta ${carpeta}`);
      }
      
      try {
        // Abrir carpeta
        await client.mailboxOpen(nombreCarpetaReal);
        
        // OPTIMIZACIÓN: Buscar directamente por UID usando fetchOne (más rápido)
        // Esto NO dispara syncs masivas, solo obtiene ese UID
        const msg = await client.fetchOne(uidNumero, {
          envelope: true,
          flags: true,
          source: incluirContenido, // Solo descargar source si se solicita contenido
          uid: true
        }, { uid: true });
        
        if (!msg || msg.uid !== uidNumero) {
          return null;
        }
        
        // Construir objeto correo
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
        
        // Normalizar fecha antes de validar
        const fechaNormalizada = normalizarFecha(msg.envelope.date);
        
        // Validar metadata mínima
        const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                              (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                              (fechaNormalizada && !isNaN(fechaNormalizada.getTime()));
        
        if (!tieneMetadata) {
          console.log(`[obtenerCorreoSoloUID] 🚫 Descartando correo sin metadata mínima. UID: ${uidNumero}`);
          return null;
        }
        
        const correo = {
          uid: msg.uid,
          subject: msg.envelope.subject || "(Sin asunto)",
          from: fromText,
          date: fechaNormalizada,
          to: toText,
          text: "",
          html: "",
          attachments: [],
          flags: flagsArray,
          leido: seen,
          seen: seen,
          important: important,
        };
        
        // Parsear contenido si se solicita y hay source
        if (incluirContenido && msg.source) {
          try {
            // Aumentar timeout para parseo de correos con attachments grandes
            const parsed = await Promise.race([
              simpleParser(msg.source),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 30000) // 30s para attachments grandes
              )
            ]);
            
            if (parsed) {
              correo.text = parsed.text || "";
              correo.html = parsed.html || "";
              
              // Procesar attachments
              if (parsed.attachments && parsed.attachments.length > 0) {
                for (const att of parsed.attachments) {
                  try {
                    const attachmentData = {
                      filename: att.filename || att.contentId || "sin-nombre",
                      contentType: att.contentType || "application/octet-stream",
                      size: att.size || (att.content ? att.content.length : 0),
                      contentId: att.contentId || null,
                    };
                    
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (att.content && att.content.length <= maxSize) {
                      try {
                        attachmentData.content = att.content.toString('base64');
                      } catch (base64Error) {
                        attachmentData.content = null;
                      }
                    } else if (att.content && att.content.length > maxSize) {
                      attachmentData.content = null;
                    }
                    
                    correo.attachments.push(attachmentData);
                  } catch (attError) {
                    // Continuar con siguiente attachment
                  }
                }
              }
            }
          } catch (parseError) {
            console.warn(`[obtenerCorreoSoloUID] ⚠️ Error parseando contenido: ${parseError.message}`);
          }
        }
        
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[obtenerCorreoSoloUID] ✅ Correo obtenido. UID: ${uidNumero}, Tiempo: ${tiempoTranscurrido}ms`);
        
        return correo;
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`[obtenerCorreoSoloUID] ❌ Error después de ${tiempoTranscurrido}ms:`, error.message);
    throw error;
  }
}

/**
 * Obtiene un correo específico por su UID (versión refactorizada - NUNCA va a IMAP)
 * REFACTORIZADO: Estilo Gmail - siempre lee desde cache, body se descarga en background
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo (por defecto INBOX)
 * @param {boolean} incluirContenido - Si se solicita contenido completo
 * @returns {Promise<Object>} Información del correo (con bodyStatus: "loading" si no hay contenido)
 */
async function obtenerCorreoPorUID(uid, carpeta = "INBOX", incluirContenido = false) {
  const inicioTiempo = Date.now();
  console.log(`[email-open] 🚀 obtenerCorreoPorUID - UID: ${uid}, carpeta: ${carpeta}, contenido: ${incluirContenido}`);
  
  // Validar UID
  const uidNumero = Number(uid);
  if (isNaN(uidNumero) || uidNumero <= 0) {
    throw new Error(`UID inválido: ${uid}. Debe ser un número positivo.`);
  }
  
  // PASO 1: Verificar cache en memoria primero (ultra-rápido, ~0ms)
  const cacheKey = `${uidNumero}-${carpeta}`;
  const cached = emailCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    // Si se solicita contenido, solo usar cache si también tiene contenido
    if (incluirContenido) {
      if (cached.incluyeContenido) {
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[email-open] ✅ Correo con contenido encontrado en cache en memoria! UID: ${uid} (${tiempoTranscurrido}ms)`);
        return cached.data;
      }
    } else {
      // Si no se solicita contenido, usar cache siempre
      const tiempoTranscurrido = Date.now() - inicioTiempo;
      console.log(`[email-open] ✅ Correo encontrado en cache en memoria! UID: ${uid} (${tiempoTranscurrido}ms)`);
      return cached.data;
    }
  }
  
  // PASO 2: Verificar cache persistente en MongoDB (muy rápido, ~10-50ms)
  // Primero intentar con contenido si se solicita
  let cachedPersistente = null;
  if (incluirContenido) {
    cachedPersistente = await obtenerCorreoDelCache(uidNumero, carpeta, true);
  }
  
  // Si no se encontró con contenido, buscar sin contenido (solo metadata)
  if (!cachedPersistente) {
    cachedPersistente = await obtenerCorreoDelCache(uidNumero, carpeta, false);
  }
  
  if (cachedPersistente) {
    // Verificar si tiene contenido completo
    const tieneContenido = cachedPersistente.html || cachedPersistente.text;
    
    // Obtener bodyStatus del cache (puede ser 'ready', 'loading', o 'error')
    const bodyStatusActual = cachedPersistente.bodyStatus || (tieneContenido ? 'ready' : 'loading');
    
    // Si se solicita contenido pero no lo tiene
    if (incluirContenido && !tieneContenido) {
      // Si hay error previo, retornar con bodyStatus: "error"
      if (bodyStatusActual === 'error') {
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[email-open] ⚠️ Correo encontrado con error previo en body. UID: ${uid} (${tiempoTranscurrido}ms)`);
        
        const correoConError = {
          ...cachedPersistente,
          bodyStatus: 'error',
          lastBodyError: cachedPersistente.lastBodyError || 'Error desconocido',
          text: "",
          html: "",
          attachments: []
        };
        
        // Guardar también en cache en memoria
        if (emailCache.size >= CACHE_SIZE) {
          const firstKey = emailCache.keys().next().value;
          emailCache.delete(firstKey);
        }
        emailCache.set(cacheKey, {
          data: correoConError,
          timestamp: Date.now(),
          incluyeContenido: false
        });
        
        return correoConError;
      }
      
      // Si no hay error previo, disparar descarga en background
      console.log(`[email-open] ⏳ Correo encontrado pero sin contenido, disparando descarga en background. UID: ${uid}`);
      
      // Disparar descarga en background (fire & forget) solo si no está en proceso
      enqueueFetchBody(uidNumero, carpeta);
      
      // Retornar correo con bodyStatus: "loading"
      const correoConLoading = {
        ...cachedPersistente,
        bodyStatus: "loading",
        text: "",
        html: "",
        attachments: []
      };
      
      // Guardar también en cache en memoria
      if (emailCache.size >= CACHE_SIZE) {
        const firstKey = emailCache.keys().next().value;
        emailCache.delete(firstKey);
      }
      emailCache.set(cacheKey, {
        data: correoConLoading,
        timestamp: Date.now(),
        incluyeContenido: false
      });
      
      const tiempoTranscurrido = Date.now() - inicioTiempo;
      console.log(`[email-open] ✅ Correo devuelto con bodyStatus: loading. UID: ${uid} (${tiempoTranscurrido}ms)`);
      return correoConLoading;
    }
    
    // Si tiene contenido o no se solicita contenido, retornar normalmente
    // Guardar también en cache en memoria para acceso aún más rápido
    if (emailCache.size >= CACHE_SIZE) {
      const firstKey = emailCache.keys().next().value;
      emailCache.delete(firstKey);
    }
    emailCache.set(cacheKey, {
      data: cachedPersistente,
      timestamp: Date.now(),
      incluyeContenido: tieneContenido
    });
    
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.log(`[email-open] ✅ Correo encontrado en cache persistente! UID: ${uid} (${tiempoTranscurrido}ms)`);
    return cachedPersistente;
  }
  
  // PASO 3: Si no está en cache, retornar null (el correo no existe en cache)
  // NUNCA ir a IMAP desde aquí - eso se hace en background durante sync
  const tiempoTranscurrido = Date.now() - inicioTiempo;
  console.log(`[email-open] ⚠️ Correo no encontrado en cache. UID: ${uid} (${tiempoTranscurrido}ms)`);
  return null;
}

/**
 * Mueve un correo de una carpeta a otra
 * @param {number} uid - UID del correo
 * @param {string} carpetaOrigen - Carpeta de origen
 * @param {string} carpetaDestino - Carpeta de destino
 * @returns {Promise<boolean>} true si se movió correctamente
 */
async function moverCorreo(uid, carpetaOrigen, carpetaDestino) {
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
    // Timeouts más cortos para evitar esperas largas
    logger: false, // Desactivar logs detallados para mejor rendimiento
  });

  try {
    await client.connect();
    
    // Encontrar el nombre correcto de las carpetas
    let nombreCarpetaOrigenReal = carpetaOrigen;
    let nombreCarpetaDestinoReal = carpetaDestino;
    
    // Función auxiliar para encontrar variaciones de carpeta
    const encontrarCarpeta = async (carpeta) => {
      let variaciones = [
        carpeta,
        carpeta.toUpperCase(),
        carpeta.toLowerCase(),
        carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
      ];
      
      if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
        variaciones.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
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
      return carpeta; // Fallback al nombre original
    };
    
    nombreCarpetaOrigenReal = await encontrarCarpeta(carpetaOrigen);
    nombreCarpetaDestinoReal = await encontrarCarpeta(carpetaDestino);
    
    const lock = await client.getMailboxLock(nombreCarpetaOrigenReal);

    try {
      await client.messageMove(uid, nombreCarpetaDestinoReal);
      console.log(`✅ Correo ${uid} movido de ${nombreCarpetaOrigenReal} a ${nombreCarpetaDestinoReal}`);
      
      // CRÍTICO: Actualizar el cache después de mover
      try {
        // Obtener el correo del cache de origen antes de eliminarlo
        const correoMovido = await obtenerCorreoDelCache(uid, nombreCarpetaOrigenReal, true);
        
        // Eliminar del cache de origen
        await eliminarCorreoDelCache(uid, nombreCarpetaOrigenReal);
        if (nombreCarpetaOrigenReal !== carpetaOrigen) {
          await eliminarCorreoDelCache(uid, carpetaOrigen);
        }
        
        // Si tenemos el correo, guardarlo en el cache de destino
        if (correoMovido) {
          await guardarCorreoEnCache(uid, nombreCarpetaDestinoReal, correoMovido, correoMovido.html ? true : false);
          if (nombreCarpetaDestinoReal !== carpetaDestino) {
            await guardarCorreoEnCache(uid, carpetaDestino, correoMovido, correoMovido.html ? true : false);
          }
        }
        
        // Actualizar listas en cache
        const limites = [10, 20, 50];
        for (const limit of limites) {
          try {
            // Remover de la lista de origen
            const listaOrigen = await obtenerListaDelCache(nombreCarpetaOrigenReal, limit);
            if (listaOrigen && Array.isArray(listaOrigen)) {
              const listaActualizadaOrigen = listaOrigen.filter(m => m.uid !== uid);
              await guardarListaEnCache(nombreCarpetaOrigenReal, listaActualizadaOrigen, limit);
              if (nombreCarpetaOrigenReal !== carpetaOrigen) {
                await guardarListaEnCache(carpetaOrigen, listaActualizadaOrigen, limit);
              }
            }
            
            // Agregar a la lista de destino (si tenemos el correo)
            if (correoMovido) {
              const listaDestino = await obtenerListaDelCache(nombreCarpetaDestinoReal, limit);
              const listaActualizadaDestino = listaDestino 
                ? [correoMovido, ...listaDestino.filter(m => m.uid !== uid)].slice(0, limit)
                : [correoMovido];
              await guardarListaEnCache(nombreCarpetaDestinoReal, listaActualizadaDestino, limit);
              if (nombreCarpetaDestinoReal !== carpetaDestino) {
                await guardarListaEnCache(carpetaDestino, listaActualizadaDestino, limit);
              }
            }
          } catch (limitError) {
            console.warn(`⚠️ Error actualizando listas con limit ${limit}: ${limitError.message}`);
          }
        }
        
        console.log(`✅ Cache actualizado después de mover correo ${uid}`);
      } catch (cacheError) {
        console.warn(`⚠️ Error actualizando cache después de mover: ${cacheError.message}`);
        // No lanzar error, el correo ya fue movido en el servidor
      }
      
      return true;
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("❌ Error moviendo correo:", error.message);
    throw error;
  } finally {
    await client.logout();
  }
}

/**
 * Marca un correo como leído o no leído
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @param {boolean} leido - true para marcar como leído, false para no leído
 * @returns {Promise<boolean>} true si se marcó correctamente
 */
async function marcarComoLeido(uid, carpeta, leido = true) {
  console.log(`🚀 marcarComoLeido llamado: UID=${uid}, Carpeta=${carpeta}, Leido=${leido}`);
  
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
    // Timeouts más cortos para evitar esperas largas
    logger: false, // Desactivar logs detallados para mejor rendimiento
  });

  try {
    await client.connect();
    
    // Encontrar el nombre correcto de la carpeta
    let nombreCarpetaReal = carpeta;
    let variaciones = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Agregar variaciones específicas para carpetas comunes
    if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
      variaciones.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
    } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
      variaciones.push("Junk", "JUNK", "junk", "Spam", "Correo no deseado");
    } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
      variaciones.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
    }
    
    let lock = null;
    for (const variacion of variaciones) {
      try {
        lock = await client.getMailboxLock(variacion);
        nombreCarpetaReal = variacion;
        break;
      } catch (e) {
        // Continuar con la siguiente variación
      }
    }
    
    if (!lock) {
      throw new Error(`No se pudo abrir la carpeta ${carpeta}`);
    }

    try {
      if (leido) {
        await client.messageFlagsAdd(uid, ["\\Seen"]);
      } else {
        await client.messageFlagsRemove(uid, ["\\Seen"]);
      }
      console.log(`✅ Correo ${uid} marcado como ${leido ? "leído" : "no leído"} en servidor IMAP`);
      
      // CRÍTICO: Actualizar el cache después de marcar como leído
      // En lugar de obtener desde el servidor (puede fallar), actualizar directamente el cache
      try {
        // Obtener el correo existente del cache para preservar el contenido
        const correoExistente = await obtenerCorreoDelCache(uid, nombreCarpetaReal, true);
        
        if (correoExistente) {
          // Actualizar solo el estado leído y los flags
          const flagsActualizadas = leido 
            ? [...new Set([...(correoExistente.flags || []), "\\Seen"])] // Agregar \Seen si no existe
            : (correoExistente.flags || []).filter(f => f !== "\\Seen"); // Remover \Seen si existe
          
          const correoActualizado = {
            ...correoExistente,
            leido: leido, // Usar el valor que acabamos de establecer
            flags: flagsActualizadas
          };
          
          // Actualizar el cache individual del correo
          await guardarCorreoEnCache(uid, nombreCarpetaReal, correoActualizado, correoExistente.html ? true : false);
          // También actualizar con el nombre solicitado si es diferente
          if (nombreCarpetaReal !== carpeta) {
            await guardarCorreoEnCache(uid, carpeta, correoActualizado, correoExistente.html ? true : false);
          }
          console.log(`✅ Cache actualizado para correo ${uid} con estado leído=${leido}`);
        } else {
          console.warn(`⚠️ No se encontró correo en cache para actualizar: UID=${uid}, Carpeta=${nombreCarpetaReal}`);
        }
        
        // Actualizar también la lista en el cache
        // CRÍTICO: Actualizar todas las variaciones de limit que puedan existir (10, 20, etc.)
        try {
          const limites = [10, 20, 50]; // Actualizar los límites más comunes
          const estadoLeidoReal = leido; // Usar el valor que acabamos de establecer en el servidor
          
          for (const limit of limites) {
            try {
              const listaCache = await obtenerListaDelCache(nombreCarpetaReal, limit);
              if (listaCache && Array.isArray(listaCache)) {
                const listaActualizada = listaCache.map(m => {
                  if (m.uid === uid) {
                    // Actualizar con el estado real del servidor
                    const flagsActualizadas = estadoLeidoReal 
                      ? [...new Set([...(m.flags || []), "\\Seen"])] // Agregar \Seen si no existe
                      : (m.flags || []).filter(f => f !== "\\Seen"); // Remover \Seen si existe
                    
                    return { 
                      ...m, 
                      leido: estadoLeidoReal, // Usar el valor real del servidor
                      flags: flagsActualizadas 
                    };
                  }
                  return m;
                });
                
                // Guardar con todas las variaciones de nombre
                await guardarListaEnCache(nombreCarpetaReal, listaActualizada, limit);
                if (nombreCarpetaReal !== carpeta) {
                  await guardarListaEnCache(carpeta, listaActualizada, limit);
                }
                
                // También guardar con variaciones comunes para Sent
                if (nombreCarpetaReal === "Sent" || nombreCarpetaReal === "Sent Items" || nombreCarpetaReal === "Enviados") {
                  await guardarListaEnCache("Sent", listaActualizada, limit).catch(() => {});
                  await guardarListaEnCache("Sent Items", listaActualizada, limit).catch(() => {});
                  await guardarListaEnCache("Enviados", listaActualizada, limit).catch(() => {});
                }
              }
            } catch (limitError) {
              // Continuar con el siguiente limit aunque este falle
              console.warn(`⚠️ Error actualizando lista con limit ${limit}: ${limitError.message}`);
            }
          }
          console.log(`✅ Lista en cache actualizada para carpeta ${nombreCarpetaReal} con estado leído=${estadoLeidoReal}`);
        } catch (listaError) {
          console.warn(`⚠️ Error actualizando lista en cache: ${listaError.message}`);
        }
      } catch (cacheError) {
        console.warn(`⚠️ Error actualizando cache después de marcar como leído: ${cacheError.message}`);
        // No lanzar error, el correo ya fue marcado en el servidor
      }
      
      return true;
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("❌ Error marcando correo:", error.message);
    throw error;
  } finally {
    await client.logout();
  }
}

/**
 * Elimina un correo (lo mueve a la papelera o lo marca para eliminación)
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
async function eliminarCorreo(uid, carpeta) {
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
    // Timeouts más cortos para evitar esperas largas
    logger: false, // Desactivar logs detallados para mejor rendimiento
  });

  try {
    await client.connect();
    
    // Encontrar el nombre correcto de la carpeta
    let nombreCarpetaReal = carpeta;
    let variaciones = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Agregar variaciones específicas para carpetas comunes
    if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
      variaciones.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
    } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
      variaciones.push("Junk", "JUNK", "junk", "Spam", "Correo no deseado");
    } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
      variaciones.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
    }
    
    let lock = null;
    for (const variacion of variaciones) {
      try {
        lock = await client.getMailboxLock(variacion);
        nombreCarpetaReal = variacion;
        break;
      } catch (e) {
        // Continuar con la siguiente variación
      }
    }
    
    if (!lock) {
      throw new Error(`No se pudo abrir la carpeta ${carpeta}`);
    }

    try {
      // CRÍTICO: Intentar eliminar permanentemente el correo
      // Estrategia: Marcar como \Deleted y hacer expunge (eliminación permanente)
      let eliminado = false;
      
      try {
        // Marcar como eliminado
        await client.messageFlagsAdd(uid, ["\\Deleted"]);
        // Hacer expunge para eliminar permanentemente
        await client.expunge();
        eliminado = true;
        console.log(`✅ Correo ${uid} eliminado permanentemente de ${nombreCarpetaReal}`);
      } catch (deleteError) {
        console.warn(`⚠️ Eliminación directa falló, intentando mover a TRASH: ${deleteError.message}`);
        
        // Si falla la eliminación directa, intentar mover a TRASH
        // Buscar variaciones de TRASH
        const trashVariations = ["TRASH", "Trash", "trash", "Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA"];
        let trashFolder = null;
        
        for (const trashVar of trashVariations) {
          try {
            const testLock = await client.getMailboxLock(trashVar);
            testLock.release();
            trashFolder = trashVar;
            break;
          } catch (e) {
            // Continuar con siguiente variación
          }
        }
        
        if (trashFolder) {
          try {
            // Mover a TRASH
            await client.messageMove(uid, trashFolder);
            console.log(`✅ Correo ${uid} movido a ${trashFolder}`);
            
            // CRÍTICO: Intentar eliminar permanentemente de TRASH también
            // Nota: El UID puede cambiar al mover, así que intentamos varias estrategias
            try {
              const trashLock = await client.getMailboxLock(trashFolder);
              try {
                // Estrategia 1: Intentar con el UID original (puede que no haya cambiado)
                try {
                  await client.messageFlagsAdd(uid, ["\\Deleted"]);
                  await client.expunge();
                  eliminado = true;
                  console.log(`✅ Correo ${uid} eliminado permanentemente de ${trashFolder}`);
                } catch (uidError) {
                  // Estrategia 2: Buscar el correo más reciente en TRASH (probablemente el que acabamos de mover)
                  console.log(`⚠️ UID original no funcionó, buscando correo más reciente en TRASH...`);
                  let lastUid = null;
                  let maxDate = null;
                  
                  // Obtener todos los correos de TRASH para encontrar el más reciente
                  for await (const msg of client.fetch('1:*', { envelope: true, uid: true })) {
                    if (!lastUid || (msg.envelope.date && (!maxDate || msg.envelope.date > maxDate))) {
                      lastUid = msg.uid;
                      maxDate = msg.envelope.date;
                    }
                  }
                  
                  if (lastUid) {
                    await client.messageFlagsAdd(lastUid, ["\\Deleted"]);
                    await client.expunge();
                    eliminado = true;
                    console.log(`✅ Correo ${lastUid} (más reciente) eliminado permanentemente de ${trashFolder}`);
                  } else {
                    console.warn(`⚠️ No se encontraron correos en TRASH para eliminar`);
                  }
                }
              } finally {
                trashLock.release();
              }
            } catch (trashDeleteError) {
              console.warn(`⚠️ No se pudo eliminar permanentemente de ${trashFolder}: ${trashDeleteError.message}`);
              // El correo está en TRASH, que es aceptable como eliminación de la carpeta original
              eliminado = true; // Consideramos que está "eliminado" de la carpeta original
            }
          } catch (moveError) {
            console.error(`❌ Error moviendo correo a TRASH: ${moveError.message}`);
            throw new Error(`No se pudo eliminar el correo: ${moveError.message}`);
          }
        } else {
          // Si no existe TRASH, lanzar error
          throw new Error("No se pudo encontrar carpeta TRASH y la eliminación directa falló");
        }
      }
      
      if (!eliminado) {
        throw new Error("No se pudo eliminar el correo permanentemente");
      }
      
      // CRÍTICO: Limpiar el cache después de eliminar
      try {
        // Eliminar del cache individual
        await eliminarCorreoDelCache(uid, nombreCarpetaReal);
        if (nombreCarpetaReal !== carpeta) {
          await eliminarCorreoDelCache(uid, carpeta);
        }
        
        // Actualizar la lista en cache removiendo el correo eliminado
        const limites = [10, 20, 50]; // Actualizar los límites más comunes
        for (const limit of limites) {
          try {
            const listaCache = await obtenerListaDelCache(nombreCarpetaReal, limit);
            if (listaCache && Array.isArray(listaCache)) {
              // Remover el correo eliminado de la lista
              const listaActualizada = listaCache.filter(m => m.uid !== uid);
              
              // Guardar con todas las variaciones de nombre
              await guardarListaEnCache(nombreCarpetaReal, listaActualizada, limit);
              if (nombreCarpetaReal !== carpeta) {
                await guardarListaEnCache(carpeta, listaActualizada, limit);
              }
              
              // También guardar con variaciones comunes
              if (nombreCarpetaReal === "Sent" || nombreCarpetaReal === "Sent Items" || nombreCarpetaReal === "Enviados") {
                await guardarListaEnCache("Sent", listaActualizada, limit).catch(() => {});
                await guardarListaEnCache("Sent Items", listaActualizada, limit).catch(() => {});
                await guardarListaEnCache("Enviados", listaActualizada, limit).catch(() => {});
              }
            }
          } catch (limitError) {
            // Continuar con el siguiente limit aunque este falle
            console.warn(`⚠️ Error actualizando lista con limit ${limit}: ${limitError.message}`);
          }
        }
        
        console.log(`✅ Cache limpiado para correo eliminado ${uid}`);
      } catch (cacheError) {
        console.warn(`⚠️ Error limpiando cache después de eliminar: ${cacheError.message}`);
        // No lanzar error, el correo ya fue eliminado en el servidor
      }
      
      return true;
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("❌ Error eliminando correo:", error.message);
    throw error;
  } finally {
    await client.logout();
  }
}

/**
 * Descarga contenido completo de correos en segundo plano usando una sola conexión IMAP
 * Optimizado para descargar múltiples correos eficientemente
 */
async function descargarContenidoCompletoEnSegundoPlano(mensajes, carpeta) {
  // 🔴 CRÍTICO: Verificar si IMAP está offline ANTES de intentar descargar
  if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
    console.log(`ℹ️ IMAP offline, omitiendo descarga en segundo plano para carpeta ${carpeta}`);
    return;
  }
  
  // Verificar qué correos ya tienen contenido completo en DB
  const correosParaDescargar = [];
  for (const mensaje of mensajes) {
    try {
      const correoCache = await obtenerCorreoDelCache(mensaje.uid, carpeta, true);
      if (!correoCache || !correoCache.html) {
        correosParaDescargar.push(mensaje.uid);
      }
    } catch (err) {
      // Si hay error, intentar descargar de todos modos
      correosParaDescargar.push(mensaje.uid);
    }
  }
  
  if (correosParaDescargar.length === 0) {
    console.log(`✅ Todos los correos ya tienen contenido completo en DB`);
    return;
  }
  
  console.log(`🔄 Descargando contenido completo para ${correosParaDescargar.length} correos...`);
  
  // Usar el manager en lugar de crear conexión directa
  try {
    await imapManager.withImapClient(async (client) => {
      // Encontrar el nombre correcto de la carpeta
      let nombreCarpetaReal = carpeta;
      let variaciones = [
        carpeta,
        carpeta.toUpperCase(),
        carpeta.toLowerCase(),
        carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
      ];
      
      // Agregar variaciones específicas para carpetas comunes
      if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
        variaciones.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
      } else if (carpeta === "Drafts" || carpeta === "drafts" || carpeta === "DRAFTS") {
        variaciones.push("Draft", "DRAFT", "draft", "Borradores", "BORRADORES", "borradores");
      } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
        variaciones.push("Junk", "JUNK", "junk", "Spam", "Correo no deseado");
      } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
        variaciones.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
      }
      
      let lock = null;
      for (const variacion of variaciones) {
        try {
          lock = await client.getMailboxLock(variacion);
          nombreCarpetaReal = variacion;
          console.log(`✅ Carpeta encontrada para descarga: "${carpeta}" -> "${nombreCarpetaReal}"`);
          break;
        } catch (e) {
          if (lock) {
            try { lock.release(); } catch {}
            lock = null;
          }
        }
      }
      
      if (!lock) {
        console.warn(`⚠️ No se pudo abrir carpeta ${carpeta} para descargar contenido`);
        return;
      }
      
      try {
        // Abrir carpeta
        await client.mailboxOpen(nombreCarpetaReal);
        
        // Descargar correos en lotes de 5 para no saturar
        const BATCH_SIZE = 5;
        for (let i = 0; i < correosParaDescargar.length; i += BATCH_SIZE) {
          const lote = correosParaDescargar.slice(i, i + BATCH_SIZE);
          
          // Procesar en secuencia dentro del lote para evitar conflictos de conexión IMAP
          for (const uid of lote) {
            try {
              // Verificar si ya tiene contenido completo en DB antes de descargar
              const correoCache = await obtenerCorreoDelCache(uid, carpeta, true);
              if (correoCache && correoCache.html) {
                console.log(`✅ Correo ${uid} ya tiene contenido completo en DB, omitiendo descarga`);
                continue;
              }
              
              // Buscar correo por UID y obtener con source completo
              // 🔴 CRÍTICO: Usar fetchOne con { uid: true } en el tercer parámetro para que ImapFlow envíe UID FETCH
              let correoCompleto = null;
              try {
                const msg = await client.fetchOne(uid, { source: true, envelope: true, flags: true }, { uid: true });
                if (msg && msg.uid === uid) {
                  // Parsear el correo con contenido completo
                  const fromText = msg.envelope.from?.map(f => {
                    if (f.name) {
                      return `${f.name} <${f.address}>`;
                    }
                    return f.address;
                  }).join(", ") || "Sin remitente";
                  
                  const toText = msg.envelope.to?.map(t => t.address).join(", ") || "";
                  
                  // Convertir Set a Array para MongoDB (no puede guardar Sets directamente)
                  const flagsArray = msg.flags ? Array.from(msg.flags) : [];
                  const seen = flagsArray.includes("\\Seen");
                  // Calcular important de forma consistente: siempre desde flags
                  const important = flagsArray.includes("\\Flagged");
                  
                  // 🔴 VALIDACIÓN: Verificar metadata mínima antes de crear correo completo
                  const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                                        (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                                        (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
                  
                  if (!tieneMetadata) {
                    console.log(`🚫 Descartando correo sin metadata mínima en descarga en segundo plano. UID: ${uid}`);
                    correoCompleto = null;
                  } else {
                    correoCompleto = {
                      uid: msg.uid,
                      subject: msg.envelope.subject || "(Sin asunto)",
                      from: fromText,
                      date: msg.envelope.date || new Date(),
                      to: toText,
                      text: "",
                      html: "",
                      attachments: [],
                      flags: flagsArray, // Array en lugar de Set para MongoDB
                      leido: seen, // Mantener compatibilidad con código existente
                      seen: seen, // Campo explícito 'seen' basado en flags
                      important: important, // Campo explícito 'important' basado en flags (fuente única de verdad)
                    };
                  }
                  
                  // Parsear contenido si hay source
                  if (msg.source) {
                    try {
                      const parsed = await Promise.race([
                        simpleParser(msg.source),
                        new Promise((_, reject) => 
                          setTimeout(() => reject(new Error("Parseo timeout")), 10000)
                        )
                      ]);
                      
                      if (parsed) {
                        correoCompleto.text = parsed.text || "";
                        correoCompleto.html = parsed.html || "";
                        
                        // Procesar attachments
                        if (parsed.attachments && parsed.attachments.length > 0) {
                          for (const att of parsed.attachments) {
                            try {
                              const attachmentData = {
                                filename: att.filename || att.contentId || "sin-nombre",
                                contentType: att.contentType || "application/octet-stream",
                                size: att.size || (att.content ? att.content.length : 0),
                                contentId: att.contentId || null,
                              };
                              
                              const maxSize = 5 * 1024 * 1024; // 5MB
                              if (att.content && att.content.length <= maxSize) {
                                try {
                                  attachmentData.content = att.content.toString('base64');
                                } catch (base64Error) {
                                  attachmentData.content = null;
                                }
                              } else if (att.content && att.content.length > maxSize) {
                                attachmentData.content = null;
                              }
                              
                              correoCompleto.attachments.push(attachmentData);
                            } catch (attError) {
                              // Continuar con siguiente attachment
                            }
                          }
                        }
                      }
                    } catch (parseError) {
                      console.warn(`⚠️ Error parseando correo ${uid}: ${parseError.message}`);
                    }
                  }
                }
              } catch (fetchError) {
                // Si falla el fetch, intentar usar obtenerCorreoPorUID como fallback
                console.warn(`⚠️ Error en fetch directo para ${uid}, usando fallback: ${fetchError.message}`);
                try {
                  const correoFallback = await obtenerCorreoPorUID(uid, carpeta, true);
                  if (correoFallback) {
                    correoCompleto = correoFallback;
                  }
                } catch (fallbackError) {
                  console.warn(`⚠️ Error en fallback para ${uid}: ${fallbackError.message}`);
                }
              }
            
            // Guardar en DB con contenido completo
            // CRÍTICO: Guardar tanto con el nombre solicitado como con el nombre real encontrado
            if (correoCompleto) {
              // Guardar con nombre solicitado
              await guardarCorreoEnCache(uid, carpeta, correoCompleto, true);
              // También guardar con nombre real si es diferente
              if (nombreCarpetaReal !== carpeta) {
                await guardarCorreoEnCache(uid, nombreCarpetaReal, correoCompleto, true);
              }
              console.log(`✅ Correo ${uid} descargado con contenido completo a DB (${nombreCarpetaReal})`);
            }
          } catch (err) {
            console.warn(`⚠️ Error descargando correo ${uid}: ${err.message}`);
          }
          
          // Pequeña pausa entre correos para no saturar el servidor IMAP
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Pequeña pausa entre lotes
        if (i + BATCH_SIZE < correosParaDescargar.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      } finally {
        if (lock) {
          lock.release();
        }
      }
    });
  } catch (error) {
    // Si es error de conexión, solo loguear (no crítico)
    if (error instanceof ConnectionNotAvailableError || error.code === 'ETIMEOUT') {
      console.log(`ℹ️ IMAP offline durante descarga en segundo plano, omitiendo`);
    } else {
      console.warn(`⚠️ Error en descarga en segundo plano: ${error.message}`);
    }
  }
}

export { obtenerUltimosCorreos, obtenerCorreoPorUID, obtenerCarpetas, moverCorreo, marcarComoLeido, eliminarCorreo, descargarContenidoCompletoEnSegundoPlano };

