// Sistema de descarga de body de correos en background (estilo Gmail)
// Descarga el contenido completo de correos sin bloquear la UI

import { simpleParser } from "mailparser";
import { imapManager, ConnectionNotAvailableError } from "./imapConnectionManager.js";
import { guardarCorreoEnCache, obtenerCorreoDelCache } from "./emailCache.js";

// Set para trackear UIDs que están siendo descargados (evitar duplicados)
const uidsEnProceso = new Set();

/**
 * Obtiene la clave única para un UID y carpeta
 */
function getCacheKey(uid, carpeta) {
  return `${uid}-${carpeta}`;
}

/**
 * Encola la descarga del body de un correo en background
 * Evita duplicados y ejecuta en fire-and-forget
 * 
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @param {boolean} forzarReintento - Si true, reintenta aunque haya fallado antes
 */
export function enqueueFetchBody(uid, carpeta, forzarReintento = false) {
  const cacheKey = getCacheKey(uid, carpeta);
  
  // Evitar duplicados: si ya está en proceso, no hacer nada
  if (uidsEnProceso.has(cacheKey)) {
    console.log(`[email-body] ⏭️ Body ya en proceso para UID ${uid}, omitiendo`);
    return;
  }
  
  // Verificar si hay un intento reciente fallido (evitar reintentos infinitos)
  if (!forzarReintento) {
    // Ejecutar verificación en background (no bloquea)
    obtenerCorreoDelCache(uid, carpeta, false)
      .then(correo => {
        if (correo && correo.lastBodyAttemptAt) {
          const tiempoDesdeUltimoIntento = Date.now() - new Date(correo.lastBodyAttemptAt).getTime();
          const MIN_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutos
          
          if (correo.bodyStatus === 'error' && tiempoDesdeUltimoIntento < MIN_RETRY_INTERVAL) {
            console.log(`[email-body] ⏭️ Último intento fallido hace ${Math.round(tiempoDesdeUltimoIntento / 1000)}s, omitiendo reintento automático para UID ${uid}`);
            return;
          }
        }
        
        // Marcar como en proceso
        uidsEnProceso.add(cacheKey);
        console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta}`);
        
        // Ejecutar en background (fire & forget)
        fetchBodyInBackground(uid, carpeta, false)
          .finally(() => {
            // Remover del set cuando termine (éxito o error)
            uidsEnProceso.delete(cacheKey);
          });
      })
      .catch(() => {
        // Si falla obtener cache, intentar de todos modos
        uidsEnProceso.add(cacheKey);
        console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta}`);
        fetchBodyInBackground(uid, carpeta, false)
          .finally(() => {
            uidsEnProceso.delete(cacheKey);
          });
      });
  } else {
    // Forzar reintento (desde endpoint manual)
    uidsEnProceso.add(cacheKey);
    console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta} (forzarReintento=true)`);
    fetchBodyInBackground(uid, carpeta, true)
      .finally(() => {
        uidsEnProceso.delete(cacheKey);
      });
  }
}

/**
 * Descarga el body de un correo desde IMAP en background
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 * @param {boolean} forzarReintento - Si true, reintenta aunque haya fallado antes
 */
async function fetchBodyInBackground(uid, carpeta, forzarReintento = false) {
  const inicioTiempo = Date.now();
  console.log(`[email-body] 🚀 Iniciando descarga de body para UID ${uid}, carpeta ${carpeta}`);
  
  try {
    // Verificar si IMAP está disponible
    if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
      console.log(`[email-body] offline skip uid=${uid} carpeta=${carpeta}`);
      
      // Guardar estado de error
      const correoMetadata = await obtenerCorreoDelCache(uid, carpeta, false);
      if (correoMetadata) {
        await guardarCorreoEnCache(uid, carpeta, correoMetadata, false, 'error', 'IMAP offline');
      }
      return;
    }
    
    // Verificar si ya tiene contenido completo en cache (evitar trabajo innecesario)
    const correoCache = await obtenerCorreoDelCache(uid, carpeta, true);
    if (correoCache && correoCache.html && !forzarReintento) {
      console.log(`[email-body] ✅ Body ya disponible en cache para UID ${uid}, omitiendo`);
      return;
    }
    
    // Obtener metadata del correo desde cache (debe existir)
    const correoMetadata = await obtenerCorreoDelCache(uid, carpeta, false);
    if (!correoMetadata) {
      console.log(`[email-body] ⚠️ No se encontró metadata en cache para UID ${uid}, no se puede descargar body`);
      return;
    }
    
    // Actualizar estado a "loading" antes de intentar descargar
    await guardarCorreoEnCache(uid, carpeta, correoMetadata, false, 'loading', null);
    
    // Usar imapConnectionManager para descargar el body
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
        
        // Buscar directamente por UID usando fetchOne
        const msg = await client.fetchOne(uid, {
          envelope: true,
          flags: true,
          source: true, // Descargar source completo para body
          uid: true
        }, { uid: true });
        
        if (!msg || msg.uid !== uid) {
          throw new Error(`Correo con UID ${uid} no encontrado en carpeta ${nombreCarpetaReal}`);
        }
        
        // Construir objeto correo con metadata existente + nuevo body
        const fromText = msg.envelope.from?.map(f => {
          if (f.name) {
            return `${f.name} <${f.address}>`;
          }
          return f.address;
        }).join(", ") || correoMetadata.from || "Sin remitente";
        
        const toText = msg.envelope.to?.map(t => t.address).join(", ") || correoMetadata.to || "";
        const flagsArray = msg.flags ? Array.from(msg.flags) : (correoMetadata.flags || []);
        const seen = flagsArray.includes("\\Seen");
        const important = flagsArray.includes("\\Flagged");
        
        // Usar metadata existente como base y actualizar con body
        const correoCompleto = {
          ...correoMetadata, // Preservar metadata existente
          uid: msg.uid,
          subject: msg.envelope.subject || correoMetadata.subject || "(Sin asunto)",
          from: fromText,
          date: msg.envelope.date || correoMetadata.date || new Date(),
          to: toText,
          flags: flagsArray,
          leido: seen,
          seen: seen,
          important: important,
          text: "",
          html: "",
          attachments: [],
        };
        
        // Parsear contenido si hay source
        if (msg.source) {
          try {
            const parsed = await Promise.race([
              simpleParser(msg.source),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 30000) // 30s para attachments grandes
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
            console.warn(`[email-body-fetch] ⚠️ Error parseando contenido para UID ${uid}: ${parseError.message}`);
            // Continuar con correo sin body parseado
          }
        }
        
        // Guardar en MongoDB con incluyeContenido = true y bodyStatus = "ready"
        await guardarCorreoEnCache(uid, nombreCarpetaReal, correoCompleto, true, 'ready', null);
        // También guardar con nombre solicitado si es diferente
        if (nombreCarpetaReal !== carpeta) {
          await guardarCorreoEnCache(uid, carpeta, correoCompleto, true, 'ready', null);
        }
        
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[email-body] fetched ok uid=${uid} carpeta=${carpeta} tiempo=${tiempoTranscurrido}ms`);
        
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    const errorMessage = error.message || String(error);
    
    // Determinar si es error de conexión
    const esErrorConexion = error instanceof ConnectionNotAvailableError || 
                            isConnectionError(error) ||
                            errorMessage.includes("Connection not available");
    
    // Guardar estado de error en cache
    try {
      const correoMetadata = await obtenerCorreoDelCache(uid, carpeta, false);
      if (correoMetadata) {
        const mensajeError = esErrorConexion ? 'IMAP offline o error de conexión' : errorMessage;
        await guardarCorreoEnCache(uid, carpeta, correoMetadata, false, 'error', mensajeError);
      }
    } catch (guardarError) {
      console.warn(`[email-body] ⚠️ Error guardando estado de error: ${guardarError.message}`);
    }
    
    // Log del error
    if (esErrorConexion) {
      console.log(`[email-body] error uid=${uid} carpeta=${carpeta} msg="IMAP offline" tiempo=${tiempoTranscurrido}ms`);
    } else {
      console.log(`[email-body] error uid=${uid} carpeta=${carpeta} msg="${errorMessage}" tiempo=${tiempoTranscurrido}ms`);
    }
    
    // No lanzar error - esto es en background, no debe afectar al usuario
  }
}

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
    /getaddrinfo/i.test(msg)
  );
}

