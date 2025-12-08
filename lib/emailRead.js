// Servicio para leer correos electrónicos usando IMAP (ImapFlow)
// Permite leer la bandeja de entrada de contacto@digitalspace.com.ar
// Soporta múltiples carpetas: INBOX, SPAM, TRASH, etc.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { emailConfig } from "./emailConfig.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache, eliminarCorreoDelCache } from "./emailCache.js";
import { obtenerListaDelCache, guardarListaEnCache, limpiarCacheListaCarpeta } from "./emailListCache.js";
import { imapManager, ConnectionNotAvailableError } from "./imapConnectionManager.js";
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
 * @param {string} carpeta - Nombre de la carpeta (INBOX, SPAM, TRASH, etc.)
 * @param {number} limit - Número máximo de correos a obtener (por defecto 10)
 * @param {boolean} forzarServidor - Si es true, ignora el cache y consulta directamente el servidor IMAP
 * @returns {Promise<Array>} Array de correos ordenados del más nuevo al más viejo
 */
async function obtenerUltimosCorreos(carpeta = "INBOX", limit = 10, forzarServidor = false) {
  // OPTIMIZACIÓN: Verificar cache persistente primero (ultra-rápido)
  // Solo si no se fuerza la actualización desde el servidor
  if (!forzarServidor) {
    const cachedList = await obtenerListaDelCache(carpeta, limit);
    if (cachedList) {
      return cachedList;
    }
  } else {
    console.log(`🔄 Forzando actualización desde servidor IMAP para carpeta ${carpeta}`);
    // Limpiar cache cuando se fuerza desde servidor para asegurar sincronización correcta
    try {
      await limpiarCacheListaCarpeta(carpeta);
      console.log(`🧹 Cache limpiado para carpeta ${carpeta} antes de sincronizar`);
    } catch (clearError) {
      console.warn(`⚠️ Error limpiando cache: ${clearError.message}`);
    }
  }
  
  // Usar el IMAP Connection Manager para evitar múltiples conexiones simultáneas
  try {
    return await imapManager.withImapClient(async (client) => {
      console.log(`✅ Usando conexión IMAP compartida. Leyendo carpeta: ${carpeta}`);

    // Verificar que la carpeta existe antes de intentar acceder
    let carpetaExiste = false;
    let nombreCarpetaReal = carpeta;
    let mailbox = null;
    
    // Intentar verificar si la carpeta existe, pero si falla, intentar acceder directamente
    // En lugar de listar todas las carpetas, intentar acceder directamente a la carpeta solicitada
    // Esto es más eficiente y evita problemas con client.list()
    try {
      // Intentar abrir la carpeta directamente - si existe, no lanzará error
      const testLock = await client.getMailboxLock(carpeta);
      testLock.release();
      carpetaExiste = true;
      nombreCarpetaReal = carpeta;
    } catch (lockError) {
      // Distinguir entre error de conexión y carpeta inexistente
      if (isConnectionError(lockError)) {
        console.warn(`⚠️ Error de conexión al verificar carpeta ${carpeta}, uso cache como fallback`);
        // NO guardar lista vacía, solo retornar cache si existe
        const cached = await obtenerListaDelCache(carpeta, limit);
        return cached || [];
      }
      
      // Si falla, la carpeta puede no existir o tener otro nombre
      // Intentar variaciones comunes
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
      
      for (const variacion of variaciones) {
        try {
          const testLock = await client.getMailboxLock(variacion);
          testLock.release();
          carpetaExiste = true;
          nombreCarpetaReal = variacion;
          console.log(`✅ Carpeta encontrada: "${carpeta}" -> "${nombreCarpetaReal}"`);
          break;
        } catch (e) {
          // Continuar con la siguiente variación
        }
      }
      
      // Solo marcar como inexistente si es un error real de carpeta, no de conexión
      if (!carpetaExiste && isRealNonExistentFolderError(lockError)) {
        console.warn(`⚠️ La carpeta ${carpeta} no existe en el servidor`);
        // Solo guardar lista vacía si realmente no existe la carpeta
        try {
          await guardarListaEnCache(carpeta, [], limit);
          console.log(`✅ Lista vacía guardada en cache para carpeta inexistente ${carpeta}`);
        } catch (err) {
          console.warn(`⚠️ Error guardando lista vacía en cache: ${err.message}`);
        }
        return []; // Retornar array vacío en lugar de lanzar error
      } else if (!carpetaExiste) {
        // Si no es un error claro de carpeta inexistente, puede ser conexión
        console.warn(`⚠️ No se pudo verificar carpeta ${carpeta}, puede ser error de conexión`);
        const cached = await obtenerListaDelCache(carpeta, limit);
        return cached || [];
      }
    }

    const lock = await client.getMailboxLock(nombreCarpetaReal);
    let mensajes = [];

    try {
      // Abrir la carpeta para obtener información del mailbox
      mailbox = await client.mailboxOpen(nombreCarpetaReal);
      const totalMessages = mailbox.exists || 0;
      
      if (!totalMessages) {
        // Carpeta vacía - guardar lista vacía solo si realmente está vacía
        try {
          await guardarListaEnCache(nombreCarpetaReal, [], limit);
          console.log(`✅ Lista vacía guardada en cache para carpeta vacía ${nombreCarpetaReal}`);
        } catch (err) {
          console.warn(`⚠️ Error guardando lista vacía en cache: ${err.message}`);
        }
        return [];
      }

      // Construir secuencia correctamente como string para client.fetch
      const start = Math.max(1, totalMessages - limit + 1);
      const end = totalMessages;
      
      // IMPORTANTE: sequence debe ser SIEMPRE string (o array de números)
      const sequence = start === end ? String(start) : `${start}:${end}`;

      // ✅ CRÍTICO: Obtener flags desde IMAP (fuente de verdad)
      // OPTIMIZACIÓN: Obtener solo envelope y flags para la lista (más rápido)
      // El contenido completo se descargará después en segundo plano
      for await (let msg of client.fetch(sequence, {
        envelope: true,
        uid: true,
        flags: true, // ✅ CRÍTICO: Siempre obtener flags desde IMAP
        // No obtener source completo aquí para optimizar la lista
      })) {
        try {
          // Usar solo envelope para la vista previa (mucho más rápido)
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
          
          // 🔴 VALIDACIÓN: Solo agregar correos con metadata mínima
          // Verificar que tenga al menos remitente, asunto o fecha válida
          const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                                (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                                (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
          
          if (tieneMetadata) {
            mensajes.push({
              uid: msg.uid,
              subject: msg.envelope.subject || "(Sin asunto)",
              from: fromText,
              date: msg.envelope.date || new Date(),
              to: toText,
              text: "", // Se descargará con contenido completo después
              html: "", // Se descargará con contenido completo después
              flags: flagsArray, // Array en lugar de Set para MongoDB
              leido: seen, // Mantener compatibilidad con código existente
              seen: seen, // Campo explícito 'seen' basado en flags
              important: important, // Campo explícito 'important' basado en flags (fuente única de verdad)
              preview: "", // Vista previa vacía inicialmente
            });
          } else {
            console.log(`🚫 Descartando correo sin metadata mínima. UID: ${msg.uid}, Carpeta: ${nombreCarpetaReal}`);
          }
        } catch (parseError) {
          console.error(`⚠️ Error procesando mensaje UID ${msg.uid}:`, parseError.message);
          // Continuar con el siguiente mensaje aunque este falle
        }
      }
      
      // 🔴 LIMPIEZA CRÍTICA: Eliminar del cache correos que ya no existen en IMAP
      // Esto previene mostrar correos eliminados que todavía están en el cache
      // IMPORTANTE: Hacer esto ANTES de liberar el lock para poder usar client.fetch
      // Ejecutar siempre que se sincroniza desde IMAP (no solo cuando se fuerza)
      if (totalMessages > 0) {
        try {
          // Obtener TODOS los UIDs que realmente existen en IMAP (no solo los últimos limit)
          const uidsEnImap = new Set();
          for await (const msg of client.fetch('1:*', { uid: true })) {
            if (msg.uid) {
              uidsEnImap.add(msg.uid);
            }
          }
          
          // Obtener todos los UIDs que están en el cache para esta carpeta
          const { obtenerTodosLosUIDsDelCache } = await import('./emailCache.js');
          const uidsEnCache = await obtenerTodosLosUIDsDelCache(nombreCarpetaReal);
          
          // Encontrar UIDs que están en cache pero no en IMAP
          const uidsAEliminar = uidsEnCache.filter(uid => !uidsEnImap.has(uid));
          
          if (uidsAEliminar.length > 0) {
            console.log(`🧹 Limpiando ${uidsAEliminar.length} correo(s) del cache que ya no existen en IMAP para carpeta ${nombreCarpetaReal}`);
            for (const uid of uidsAEliminar) {
              await eliminarCorreoDelCache(uid, nombreCarpetaReal);
              // También eliminar con el nombre solicitado si es diferente
              if (nombreCarpetaReal !== carpeta) {
                await eliminarCorreoDelCache(uid, carpeta);
              }
            }
            console.log(`✅ ${uidsAEliminar.length} correo(s) eliminado(s) del cache`);
          }
        } catch (limpiezaError) {
          // No fallar la sincronización si falla la limpieza
          console.warn(`⚠️ Error limpiando correos eliminados del cache: ${limpiezaError.message}`);
        }
      }
    } finally {
      lock.release();
    }

    // Ordenar del más nuevo al más viejo
    const mensajesOrdenados = mensajes.reverse();
    
    // CRÍTICO: Guardar lista PRIMERO y verificar que esté disponible
    // Esto permite acceso inmediato desde la base de datos
    // IMPORTANTE: Guardar con TODOS los nombres posibles para máxima compatibilidad
    try {
      // Guardar con el nombre solicitado
      await guardarListaEnCache(carpeta, mensajesOrdenados, limit);
      console.log(`✅ Lista guardada en base de datos: ${mensajesOrdenados.length} correos para carpeta ${carpeta}`);
      
      // También guardar con el nombre real encontrado si es diferente
      if (nombreCarpetaReal !== carpeta) {
        await guardarListaEnCache(nombreCarpetaReal, mensajesOrdenados, limit);
        console.log(`✅ Lista también guardada con nombre real: ${nombreCarpetaReal}`);
      }
      
      // Guardar también con variaciones comunes para estas carpetas específicas
      if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
        await guardarListaEnCache("Sent Items", mensajesOrdenados, limit).catch(() => {});
        await guardarListaEnCache("Enviados", mensajesOrdenados, limit).catch(() => {});
      } else if (carpeta === "Drafts" || carpeta === "drafts" || carpeta === "DRAFTS") {
        await guardarListaEnCache("Draft", mensajesOrdenados, limit).catch(() => {});
        await guardarListaEnCache("Borradores", mensajesOrdenados, limit).catch(() => {});
      }
      
      // Verificar inmediatamente que está disponible (crítico para polling)
      const listaVerificada = await obtenerListaDelCache(carpeta, limit);
      if (listaVerificada !== null) {
        console.log(`✅ Verificación inmediata: Lista disponible con ${listaVerificada.length} correos`);
      } else {
        console.warn(`⚠️ Advertencia: Lista guardada pero no encontrada en verificación inmediata`);
      }
    } catch (err) {
      console.warn(`⚠️ Error al guardar lista en cache persistente: ${err.message}`);
    }
    
    // Guardar correos individuales en segundo plano (no bloquea el retorno)
    // Primero guardar sin contenido (rápido) para que la lista esté disponible inmediatamente
    // CRÍTICO: Guardar tanto con el nombre solicitado como con el nombre real encontrado
    // ✅ CORREGIDO: Si se sincroniza desde IMAP (forzarServidor = true), SIEMPRE usar valores de IMAP como fuente de verdad
    // Solo preservar contenido completo del cache si existe, pero flags/seen/important vienen de IMAP
    Promise.all(
      mensajesOrdenados.map(async (mensaje) => {
        try {
          // Si se está sincronizando desde IMAP, los valores de flags/seen/important ya vienen correctos desde IMAP
          // Solo preservar contenido completo (text/html) del cache si existe para no perderlo
          if (forzarServidor) {
            // ✅ CRÍTICO: Cuando se sincroniza desde IMAP, los flags son la fuente de verdad
            // No sobrescribir con valores del cache - IMAP tiene prioridad
            console.log(`✅ Sincronizando desde IMAP - UID ${mensaje.uid}: seen=${mensaje.seen}, important=${mensaje.important}, flags=${JSON.stringify(mensaje.flags)}`);
          } else {
            // Si no se fuerza desde servidor, verificar cache para preservar contenido completo
            const cacheExistente = await obtenerCorreoDelCache(mensaje.uid, carpeta, false);
            if (cacheExistente) {
              // Preservar solo contenido completo, NO flags/seen/important (esos vienen de IMAP)
              if (cacheExistente.html && !mensaje.html) {
                mensaje.html = cacheExistente.html;
              }
              if (cacheExistente.text && !mensaje.text) {
                mensaje.text = cacheExistente.text;
              }
            }
          }
          
          // Guardar con nombre solicitado (los flags/seen/important vienen de IMAP)
          await guardarCorreoEnCache(mensaje.uid, carpeta, mensaje, false);
          // También guardar con nombre real si es diferente
          if (nombreCarpetaReal !== carpeta) {
            await guardarCorreoEnCache(mensaje.uid, nombreCarpetaReal, mensaje, false);
          }
        } catch (err) {
          console.warn(`⚠️ Error guardando correo ${mensaje.uid} en DB: ${err.message}`);
        }
      })
    ).then(() => {
      console.log(`✅ ${mensajesOrdenados.length} correos guardados en base de datos (metadatos desde IMAP)`);
    }).catch(err => {
      console.warn(`⚠️ Error guardando correos en DB: ${err.message}`);
    });
    
    // Descargar contenido completo en segundo plano (REALMENTE en segundo plano, no bloquea)
    // IMPORTANTE: No usar await aquí, ejecutar en background sin bloquear
    setImmediate(() => {
      descargarContenidoCompletoEnSegundoPlano(mensajesOrdenados, carpeta)
        .then(() => {
          console.log(`✅ Contenido completo descargado para ${mensajesOrdenados.length} correos (en segundo plano)`);
        })
        .catch(err => {
          console.warn(`⚠️ Error descargando contenido completo en segundo plano: ${err.message}`);
        });
    });
    
    // Retornar inmediatamente con solo metadatos (no esperar contenido completo)
    return mensajesOrdenados;
    });
  } catch (error) {
    // Si es error de conexión, retornar cache si existe
    if (error instanceof ConnectionNotAvailableError) {
      console.warn(`⚠️ Error de conexión IMAP, intentando usar cache para carpeta ${carpeta}`);
      const cachedList = await obtenerListaDelCache(carpeta, limit);
      if (cachedList && cachedList.length > 0) {
        return cachedList;
      }
      // Si no hay cache, retornar array vacío
      return [];
    }
    console.error("❌ Error obteniendo correos:", error.message);
    throw error;
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
        
        // Validar metadata mínima
        const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                              (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                              (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
        
        if (!tieneMetadata) {
          console.log(`[obtenerCorreoSoloUID] 🚫 Descartando correo sin metadata mínima. UID: ${uidNumero}`);
          return null;
        }
        
        const correo = {
          uid: msg.uid,
          subject: msg.envelope.subject || "(Sin asunto)",
          from: fromText,
          date: msg.envelope.date || new Date(),
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
            const parsed = await Promise.race([
              simpleParser(msg.source),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 10000)
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
 * Obtiene un correo específico por su UID (versión completa con cache)
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo (por defecto INBOX)
 * @returns {Promise<Object>} Información del correo
 */
async function obtenerCorreoPorUID(uid, carpeta = "INBOX", incluirContenido = false) {
  console.log(`🚀 obtenerCorreoPorUID llamado con UID: ${uid}, carpeta: ${carpeta}, contenido: ${incluirContenido}`);
  
  // OPTIMIZACIÓN 1: Verificar cache en memoria primero (ultra-rápido, ~0ms)
  const cacheKey = `${uid}-${carpeta}`;
  const cached = emailCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    // Si se solicita contenido, solo usar cache si también tiene contenido
    if (incluirContenido) {
      if (cached.incluyeContenido) {
        console.log(`✅ Correo con contenido encontrado en cache en memoria! UID: ${uid}`);
        return cached.data;
      }
    } else {
      // Si no se solicita contenido, usar cache siempre
      console.log(`✅ Correo encontrado en cache en memoria! UID: ${uid}`);
      return cached.data;
    }
  }
  
  // OPTIMIZACIÓN 2: Verificar cache persistente en MongoDB (muy rápido, ~10-50ms)
  const cachedPersistente = await obtenerCorreoDelCache(uid, carpeta, incluirContenido);
  if (cachedPersistente) {
    // Guardar también en cache en memoria para acceso aún más rápido
    if (emailCache.size >= CACHE_SIZE) {
      const firstKey = emailCache.keys().next().value;
      emailCache.delete(firstKey);
    }
    emailCache.set(cacheKey, {
      data: cachedPersistente,
      timestamp: Date.now(),
      incluyeContenido: incluirContenido || cached?.incluyeContenido || false
    });
    return cachedPersistente;
  }
  
  if (!emailConfig.user || ! emailConfig.pass || !emailConfig.host) {
    console.error("❌ Configuración de correo incompleta");
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }
  
  // Validar que el UID sea un número válido
  const uidNumero = Number(uid);
  if (isNaN(uidNumero) || uidNumero <= 0) {
    console.error(`❌ UID inválido: ${uid}`);
    throw new Error(`UID inválido: ${uid}. Debe ser un número positivo.`);
  }
  
  console.log(`✅ UID validado: ${uidNumero}`);

  // Usar el IMAP Connection Manager para evitar múltiples conexiones simultáneas
  try {
    return await imapManager.withImapClient(async (client) => {
      console.log(`✅ Usando conexión IMAP compartida. Buscando correo UID ${uidNumero} en carpeta: ${carpeta}`);
    
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
    
    // Intentar abrir la carpeta con las variaciones
    let lock = null;
    let carpetaEncontrada = false;
    
    for (const variacion of variaciones) {
      try {
        console.log(`🔍 Intentando abrir carpeta: ${variacion}`);
        lock = await client.getMailboxLock(variacion);
        nombreCarpetaReal = variacion;
        carpetaEncontrada = true;
        console.log(`✅ Carpeta abierta: ${nombreCarpetaReal} (solicitada: ${carpeta})`);
        break;
      } catch (e) {
        // Continuar con la siguiente variación (no loguear cada intento para evitar spam)
        if (lock) {
          try {
            lock.release();
          } catch (releaseError) {
            // Ignorar errores de release
          }
          lock = null;
        }
      }
    }
    
    if (!carpetaEncontrada || !lock) {
      throw new Error(`La carpeta "${carpeta}" no existe en el servidor`);
    }

    try {
      // Buscar el correo por UID: obtener todos los correos y encontrar el que tiene el UID correcto
      console.log(`🔍 Buscando correo con UID ${uidNumero}...`);
      
      // No necesitamos buscar todos los correos, podemos buscar directamente por UID
      let correoEncontrado = null;
      let mensajeEncontrado = false;
      
      // Función para parsear un mensaje (ULTRA-OPTIMIZADA - SIN parseo bloqueante)
      // Función para parsear un mensaje (OPTIMIZADA - parsea solo si hay source)
      const parsearMensaje = async (msg) => {
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
        
        // 🔴 VALIDACIÓN: Verificar que tenga metadata mínima antes de crear el objeto
        // Si no tiene remitente válido, asunto válido ni fecha válida, no crear correo vacío
        const tieneMetadata = fromText && fromText.trim() !== '' && fromText !== 'Sin remitente' ||
                              (msg.envelope.subject && msg.envelope.subject.trim() !== '') ||
                              (msg.envelope.date && !isNaN(new Date(msg.envelope.date).getTime()));
        
        if (!tieneMetadata) {
          console.log(`🚫 Descartando correo sin metadata mínima en obtenerCorreoPorUID. UID: ${uidNumero}`);
          return null; // No retornar correo vacío
        }
        
        const resultadoBase = {
          uid: msg.uid,
          subject: msg.envelope.subject || "(Sin asunto)",
          from: fromText,
          date: msg.envelope.date || new Date(),
          to: toText,
          text: "",
          html: "",
          attachments: [], // Array para archivos adjuntos
          flags: flagsArray, // Array en lugar de Set para MongoDB
          leido: seen, // Mantener compatibilidad con código existente
          seen: seen, // Campo explícito 'seen' basado en flags
          important: important, // Campo explícito 'important' basado en flags (fuente única de verdad)
        };
        
        // Solo parsear si hay source y se solicitó contenido
        if (incluirContenido && msg.source) {
          try {
            // Parsear con timeout más largo cuando se incluye contenido (puede tener attachments grandes)
            const parsed = await Promise.race([
              simpleParser(msg.source),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 10000) // 10 segundos para attachments grandes
              )
            ]);
            
            if (parsed) {
              resultadoBase.text = parsed.text || "";
              resultadoBase.html = parsed.html || "";
              
              // Procesar attachments si existen
              if (parsed.attachments && parsed.attachments.length > 0) {
                resultadoBase.attachments = [];
                
                for (const att of parsed.attachments) {
                  try {
                    const attachmentData = {
                      filename: att.filename || att.contentId || "sin-nombre",
                      contentType: att.contentType || "application/octet-stream",
                      size: att.size || (att.content ? att.content.length : 0),
                      contentId: att.contentId || null,
                    };
                    
                    // Solo guardar contenido si es menor a 5MB (para no saturar MongoDB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (att.content && att.content.length <= maxSize) {
                      try {
                        attachmentData.content = att.content.toString('base64');
                      } catch (base64Error) {
                        console.warn(`⚠️ Error convirtiendo attachment a base64: ${base64Error.message}`);
                        attachmentData.content = null;
                      }
                    } else if (att.content && att.content.length > maxSize) {
                      console.warn(`⚠️ Attachment ${attachmentData.filename} muy grande (${(attachmentData.size / 1024 / 1024).toFixed(2)}MB), no se guardará en cache`);
                      attachmentData.content = null; // No guardar contenido de archivos muy grandes
                    }
                    
                    resultadoBase.attachments.push(attachmentData);
                  } catch (attError) {
                    console.warn(`⚠️ Error procesando attachment: ${attError.message}`);
                    // Continuar con el siguiente attachment
                  }
                }
                
                console.log(`📎 ${resultadoBase.attachments.length} archivo(s) adjunto(s) encontrado(s)`);
              }
            }
          } catch (parseError) {
            // Si falla el parseo, usar solo envelope
            console.log(`⚠️ Parseo falló, usando solo envelope: ${parseError.message}`);
          }
        }
        
        return resultadoBase;
      };
      
      // Buscar directamente por UID (mucho más eficiente que iterar)
      console.log(`📧 Buscando correo directamente por UID: ${uidNumero}...`);
      const inicioBusqueda = Date.now();
      
      // OPTIMIZACIÓN ULTRA-RÁPIDA: Buscar directamente por UID usando search
      try {
        const uidBuscado = Number(uidNumero);
        
          // INTENTO 1: Buscar directamente por UID (sintaxis más común)
          try {
            // OPTIMIZACIÓN: Timeout más corto para respuesta más rápida
            const searchTimeout = incluirContenido ? 1500 : 300; // Reducido para ser más rápido
            const searchPromise = client.search({ uid: uidBuscado });
            const sequenceNumbers = await Promise.race([
              searchPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Search timeout")), searchTimeout)
              )
            ]).catch(() => null);
            
            // Asegurar que sequenceNumbers sea un array
            const seqArray = Array.isArray(sequenceNumbers) ? sequenceNumbers : (sequenceNumbers ? [sequenceNumbers] : []);
            
            if (seqArray.length > 0) {
              // Encontrado! Hacer fetch directamente del número de secuencia
              const seqNum = seqArray[0];
            
            // OPTIMIZACIÓN: Fetch directo sin loop innecesario
            // Timeout más corto para respuesta más rápida
            const fetchTimeout = incluirContenido ? 20000 : 200; // Reducido para ser más rápido
            let msg = null;
            try {
              const fetchPromise = (async () => {
                for await (let m of client.fetch(seqNum, {
                  envelope: true,
                  source: incluirContenido, // Solo descargar source si se solicita
                  uid: true,
                  flags: true,
                })) {
                  if (m.uid && Number(m.uid) === uidBuscado) {
                    return m;
                  }
                }
                return null;
              })();
              
              msg = await Promise.race([
                fetchPromise,
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error("Fetch timeout")), fetchTimeout)
                )
              ]).catch(() => null);
            } catch (fetchErr) {
              console.warn(`⚠️ Error en fetch: ${fetchErr.message}`);
            }
            
            if (msg && msg.uid && Number(msg.uid) === uidBuscado) {
              mensajeEncontrado = true;
              const tiempoBusqueda = Date.now() - inicioBusqueda;
              console.log(`✅ Correo encontrado directamente! UID: ${msg.uid} (${tiempoBusqueda}ms)`);
              
              correoEncontrado = await parsearMensaje(msg);
              
              if (lock) {
                try {
                  lock.release();
                  lock = null;
                } catch (releaseError) {
                  console.warn(`⚠️ Error al liberar lock: ${releaseError.message}`);
                }
              }
            }
          }
        } catch (searchError) {
          // Si search por UID falla, continuar con búsqueda en lotes
          console.log(`⚠️ Búsqueda directa falló, usando búsqueda en lotes: ${searchError.message}`);
        }
        
        // INTENTO 2: Si no se encontró con búsqueda directa, buscar SOLO en últimos 20 correos (ultra-rápido)
        if (!mensajeEncontrado) {
          // OPTIMIZACIÓN: Solo buscar en los últimos 20 correos primero (muy rápido, ~20-40ms)
          // La mayoría de correos abiertos son recientes
          try {
            const ultimos20Sequence = await client.search({ 
              // Buscar solo los últimos 20 correos usando una búsqueda limitada
              // Usar una búsqueda más específica para evitar cargar todos los correos
            });
            
            // Asegurar que sea un array y construir secuencia correctamente
            const seqArray = Array.isArray(ultimos20Sequence) ? ultimos20Sequence : (ultimos20Sequence ? [ultimos20Sequence] : []);
            const ultimos20 = seqArray.length > 0 ? seqArray.slice(-20) : [];
            
            if (ultimos20.length > 0) {
              console.log(`🔍 Buscando en últimos 20 correos...`);
              
              // Construir secuencia como string para fetch
              const sequenceStr = ultimos20.length === 1 ? String(ultimos20[0]) : `${ultimos20[0]}:${ultimos20[ultimos20.length - 1]}`;
              
              for await (let msg of client.fetch(sequenceStr, {
                envelope: true,
                source: incluirContenido, // Solo descargar source si se solicita
                uid: true,
                flags: true,
              })) {
                if (msg.uid && Number(msg.uid) === uidBuscado) {
                  mensajeEncontrado = true;
                  const tiempoBusqueda = Date.now() - inicioBusqueda;
                  console.log(`✅ Correo encontrado! UID: ${msg.uid} (${tiempoBusqueda}ms)`);
                  
                  correoEncontrado = await parsearMensaje(msg);
                  
                  if (lock) {
                    try {
                      lock.release();
                      lock = null;
                    } catch (releaseError) {
                      console.warn(`⚠️ Error al liberar lock: ${releaseError.message}`);
                    }
                  }
                  break;
                }
              }
            }
          } catch (searchError) {
            console.log(`⚠️ Búsqueda en últimos 20 falló: ${searchError.message}`);
          }
          
          // Si aún no se encontró, hacer búsqueda completa (solo como último recurso)
          if (!mensajeEncontrado) {
            console.log(`⚠️ No encontrado en últimos 20, buscando en todos los correos...`);
            const allSequenceRaw = await client.search({ all: true });
            
            // Asegurar que sea un array
            const allSequence = Array.isArray(allSequenceRaw) ? allSequenceRaw : (allSequenceRaw ? [allSequenceRaw] : []);
            
            if (allSequence.length === 0) {
              throw new Error(`La carpeta ${nombreCarpetaReal} está vacía`);
            }
            
            // Buscar en lotes pequeños desde el final
            const batchSize = 50;
            for (let i = allSequence.length; i > 0 && !mensajeEncontrado; i -= batchSize) {
              const start = Math.max(0, i - batchSize);
              const end = i;
              const batch = allSequence.slice(start, end);
              
              // Construir secuencia como string para fetch
              const sequenceStr = batch.length === 1 ? String(batch[0]) : `${batch[0]}:${batch[batch.length - 1]}`;
              
              for await (let msg of client.fetch(sequenceStr, {
                envelope: true,
                source: incluirContenido, // Solo descargar source si se solicita
                uid: true,
                flags: true,
              })) {
                if (msg.uid && Number(msg.uid) === uidBuscado) {
                  mensajeEncontrado = true;
                  console.log(`✅ Correo encontrado! UID: ${msg.uid}`);
                  
                  correoEncontrado = await parsearMensaje(msg);
                  
                  if (lock) {
                    try {
                      lock.release();
                      lock = null;
                    } catch (releaseError) {
                      console.warn(`⚠️ Error al liberar lock: ${releaseError.message}`);
                    }
                  }
                  break;
                }
              }
              
              if (mensajeEncontrado) break;
            }
          }
        }
        
        if (!mensajeEncontrado) {
          throw new Error(`Correo con UID ${uidNumero} no encontrado en la carpeta ${nombreCarpetaReal}`);
        }
      } catch (fetchError) {
        console.error(`❌ Error buscando correo por UID ${uidNumero}:`, fetchError.message);
        throw fetchError;
      }
      
      if (!mensajeEncontrado || !correoEncontrado) {
        throw new Error(`Correo con UID ${uidNumero} no encontrado en la carpeta ${nombreCarpetaReal}`);
      }
      
      // El lock ya fue liberado cuando encontramos el correo
      console.log(`✅ Retornando correo UID ${uidNumero}`);
      
      // OPTIMIZACIÓN: Guardar en cache en memoria (tanto con como sin contenido)
      if (correoEncontrado) {
        const cacheKey = `${uidNumero}-${nombreCarpetaReal}`;
        
        // Limpiar cache si está lleno (FIFO)
        if (emailCache.size >= CACHE_SIZE) {
          const firstKey = emailCache.keys().next().value;
          emailCache.delete(firstKey);
        }
        
        emailCache.set(cacheKey, {
          data: correoEncontrado,
          timestamp: Date.now(),
          incluyeContenido: incluirContenido
        });
        console.log(`💾 Correo guardado en cache en memoria (${incluirContenido ? 'con' : 'sin'} contenido) (${emailCache.size}/${CACHE_SIZE})`);
      }
      
      // OPTIMIZACIÓN: Guardar en cache persistente MongoDB
      // CRÍTICO: Guardar tanto con el nombre solicitado como con el nombre real encontrado
      // Esto asegura que "SPAM" y "spam" encuentren el mismo cache
      if (correoEncontrado) {
        if (incluirContenido) {
          // Para contenido completo, esperar a guardar en DB (importante para pre-carga)
          try {
            // Guardar con nombre real encontrado
            await guardarCorreoEnCache(uidNumero, nombreCarpetaReal, correoEncontrado, incluirContenido);
            // También guardar con nombre solicitado para búsqueda rápida
            if (nombreCarpetaReal !== carpeta) {
              await guardarCorreoEnCache(uidNumero, carpeta, correoEncontrado, incluirContenido);
            }
            console.log(`✅ Correo con contenido guardado en cache persistente MongoDB (${nombreCarpetaReal})`);
          } catch (err) {
            console.warn(`⚠️ Error al guardar en cache persistente (no crítico): ${err.message}`);
          }
        } else {
          // Para contenido básico, guardar en segundo plano (no bloquea)
          guardarCorreoEnCache(uidNumero, nombreCarpetaReal, correoEncontrado, incluirContenido)
            .then(() => {
              // También guardar con nombre solicitado
              if (nombreCarpetaReal !== carpeta) {
                return guardarCorreoEnCache(uidNumero, carpeta, correoEncontrado, incluirContenido);
              }
            })
            .catch(err => {
              console.warn(`⚠️ Error al guardar en cache persistente (no crítico): ${err.message}`);
            });
        }
      }
      
      // El manager maneja el cierre de la conexión automáticamente
      return correoEncontrado;
    } finally {
      // Asegurarse de liberar el lock si aún está activo (por si acaso)
      if (lock) {
        try {
          lock.release();
        } catch (releaseError) {
          console.warn(`⚠️ Error al liberar lock en finally: ${releaseError.message}`);
        }
      }
    }
    });
  } catch (error) {
    console.error("❌ Error obteniendo correo por UID:", error);
    console.error("❌ Tipo de error:", error.constructor.name);
    console.error("❌ Código de error:", error.code);
    console.error("❌ Mensaje:", error.message);
    if (error.stack) {
      console.error("❌ Stack:", error.stack);
    }
    
    // Mejorar el mensaje de error para errores de conexión
    const errorMessage = error.message || String(error);
    const errorCode = error.code || "";
    
    // Detectar errores de conexión
    if (errorMessage.includes("Connection") || 
        errorMessage.includes("NoConnection") || 
        errorCode === "NoConnection" ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("Connection closed") ||
        errorMessage.includes("Connection not available") ||
        errorCode === "ECONNREFUSED" ||
        errorCode === "ETIMEDOUT") {
      throw new Error("Error de conexión con el servidor de correo. Por favor, intenta nuevamente.");
    }
    
    // Si es un error de carpeta no encontrada
    if (errorMessage.includes("no existe") || errorMessage.includes("not found") || errorMessage.includes("no encontrado")) {
      throw error; // Mantener el mensaje original
    }
    
    // Si es un error de comando IMAP
    if (errorMessage.includes("Command failed") || errorMessage.includes("IMAP")) {
      throw new Error(`Error del servidor de correo: ${errorMessage}. Por favor, intenta nuevamente.`);
    }
    
    // Para otros errores, lanzar con mensaje mejorado
    throw new Error(`Error al obtener el correo: ${errorMessage}`);
  }
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

export { obtenerUltimosCorreos, obtenerCorreoPorUID, obtenerCarpetas, moverCorreo, marcarComoLeido, eliminarCorreo };

