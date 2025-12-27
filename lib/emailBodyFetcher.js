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
 */
export function enqueueFetchBody(uid, carpeta) {
  const cacheKey = getCacheKey(uid, carpeta);
  
  // Evitar duplicados: si ya está en proceso, no hacer nada
  if (uidsEnProceso.has(cacheKey)) {
    console.log(`[email-body-fetch] ⏭️ Body ya en proceso para UID ${uid}, omitiendo`);
    return;
  }
  
  // Marcar como en proceso
  uidsEnProceso.add(cacheKey);
  
  // Ejecutar en background (fire & forget)
  fetchBodyInBackground(uid, carpeta)
    .finally(() => {
      // Remover del set cuando termine (éxito o error)
      uidsEnProceso.delete(cacheKey);
    });
}

/**
 * Descarga el body de un correo desde IMAP en background
 * @param {number} uid - UID del correo
 * @param {string} carpeta - Carpeta donde está el correo
 */
async function fetchBodyInBackground(uid, carpeta) {
  const inicioTiempo = Date.now();
  console.log(`[email-body-fetch] 🚀 Iniciando descarga de body para UID ${uid}, carpeta ${carpeta}`);
  
  try {
    // Verificar si IMAP está disponible
    if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
      console.log(`[email-body-fetch] ⚠️ IMAP offline, omitiendo descarga para UID ${uid}`);
      return;
    }
    
    // Verificar si ya tiene contenido completo en cache (evitar trabajo innecesario)
    const correoCache = await obtenerCorreoDelCache(uid, carpeta, true);
    if (correoCache && correoCache.html) {
      console.log(`[email-body-fetch] ✅ Body ya disponible en cache para UID ${uid}, omitiendo`);
      return;
    }
    
    // Obtener metadata del correo desde cache (debe existir)
    const correoMetadata = await obtenerCorreoDelCache(uid, carpeta, false);
    if (!correoMetadata) {
      console.log(`[email-body-fetch] ⚠️ No se encontró metadata en cache para UID ${uid}, no se puede descargar body`);
      return;
    }
    
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
        
        // Guardar en MongoDB con incluyeContenido = true
        await guardarCorreoEnCache(uid, nombreCarpetaReal, correoCompleto, true);
        // También guardar con nombre solicitado si es diferente
        if (nombreCarpetaReal !== carpeta) {
          await guardarCorreoEnCache(uid, carpeta, correoCompleto, true);
        }
        
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[email-body-fetch] ✅ Body descargado y guardado para UID ${uid} (${tiempoTranscurrido}ms)`);
        
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    
    // Si es error de conexión, solo loguear (no crítico)
    if (error instanceof ConnectionNotAvailableError || 
        isConnectionError(error) ||
        error.message?.includes("Connection not available")) {
      console.log(`[email-body-fetch] ⚠️ IMAP offline durante descarga de body para UID ${uid} (${tiempoTranscurrido}ms)`);
    } else {
      console.warn(`[email-body-fetch] ❌ Error descargando body para UID ${uid} después de ${tiempoTranscurrido}ms: ${error.message}`);
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

