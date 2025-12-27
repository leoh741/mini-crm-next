// Sistema de descarga de body de correos en background (estilo Gmail)
// Descarga el contenido completo de correos sin bloquear la UI

import { simpleParser } from "mailparser";
import { imapManager, ConnectionNotAvailableError } from "./imapConnectionManager.js";
import { guardarCorreoEnCache, obtenerCorreoDelCache, normalizarFecha } from "./emailCache.js";

// Map para trackear UIDs que están siendo descargados (evitar duplicados)
// Estructura: Map<cacheKey, { startedAt: timestamp }>
const uidsEnProceso = new Map();

// Tiempo máximo para considerar un UID como stale (120 segundos)
const STALE_TIMEOUT_MS = 120 * 1000;

/**
 * Obtiene la clave única para un UID y carpeta
 */
export function getCacheKey(uid, carpeta) {
  return `${uid}-${carpeta}`;
}

/**
 * Verifica si un UID está en proceso de descarga
 */
export function isUidInProgress(uid, carpeta) {
  const cacheKey = getCacheKey(uid, carpeta);
  return uidsEnProceso.has(cacheKey);
}

/**
 * Limpia UIDs stale del map (más de STALE_TIMEOUT_MS)
 */
function limpiarUidsStale() {
  const ahora = Date.now();
  const keysToDelete = [];
  
  for (const [key, info] of uidsEnProceso.entries()) {
    if (ahora - info.startedAt > STALE_TIMEOUT_MS) {
      keysToDelete.push(key);
    }
  }
  
  for (const key of keysToDelete) {
    uidsEnProceso.delete(key);
    console.log(`[email-body] cleared stale inProgress uid=${key}`);
  }
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
  
  // Limpiar UIDs stale antes de verificar
  limpiarUidsStale();
  
  // Verificar si ya está en proceso
  const enProceso = uidsEnProceso.get(cacheKey);
  if (enProceso) {
    const tiempoEnProceso = Date.now() - enProceso.startedAt;
    
    // Si está stale (>120s), limpiarlo y permitir reintento
    if (tiempoEnProceso > STALE_TIMEOUT_MS) {
      console.log(`[email-body] ⚠️ UID ${uid} está stale (${Math.round(tiempoEnProceso / 1000)}s), limpiando y reintentando`);
      uidsEnProceso.delete(cacheKey);
    } else {
      console.log(`[email-body] ⏭️ Body ya en proceso para UID ${uid} (hace ${Math.round(tiempoEnProceso / 1000)}s), omitiendo`);
      return;
    }
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
        
        // Marcar como en proceso con timestamp
        uidsEnProceso.set(cacheKey, { startedAt: Date.now() });
        console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta}`);
        
        // CRÍTICO: Persistir inmediatamente bodyStatus="loading" + lastBodyAttemptAt=now (fire-and-forget)
        guardarCorreoEnCache(uid, carpeta, correo, false, 'loading', null)
          .then(() => {
            console.log(`[email-body] persisted loading uid=${uid} lastBodyAttemptAt=${new Date().toISOString()}`);
          })
          .catch((persistError) => {
            console.warn(`[email-body] ⚠️ Error persistiendo loading state: ${persistError.message}`);
          });
        
        // Ejecutar en background (fire & forget)
        fetchBodyInBackground(uid, carpeta, false)
          .finally(() => {
            // SIEMPRE remover del map cuando termine (éxito o error)
            uidsEnProceso.delete(cacheKey);
            console.log(`[email-body] cleared inProgress uid=${uid} carpeta=${carpeta}`);
          });
      })
      .catch(() => {
        // Si falla obtener cache, intentar de todos modos
        uidsEnProceso.set(cacheKey, { startedAt: Date.now() });
        console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta}`);
        
        // CRÍTICO: Persistir inmediatamente bodyStatus="loading" + lastBodyAttemptAt=now (fire-and-forget)
        obtenerCorreoDelCache(uid, carpeta, false)
          .then((correoFallback) => {
            if (correoFallback) {
              return guardarCorreoEnCache(uid, carpeta, correoFallback, false, 'loading', null);
            }
          })
          .then(() => {
            console.log(`[email-body] persisted loading uid=${uid} lastBodyAttemptAt=${new Date().toISOString()}`);
          })
          .catch((persistError) => {
            console.warn(`[email-body] ⚠️ Error persistiendo loading state: ${persistError.message}`);
          });
        
        fetchBodyInBackground(uid, carpeta, false)
          .finally(() => {
            uidsEnProceso.delete(cacheKey);
            console.log(`[email-body] cleared inProgress uid=${uid} carpeta=${carpeta}`);
          });
      });
  } else {
    // Forzar reintento (desde endpoint manual)
    uidsEnProceso.set(cacheKey, { startedAt: Date.now() });
    console.log(`[email-body] enqueue uid=${uid} carpeta=${carpeta} (forzarReintento=true)`);
    
    // CRÍTICO: Persistir inmediatamente bodyStatus="loading" + lastBodyAttemptAt=now (fire-and-forget)
    obtenerCorreoDelCache(uid, carpeta, false)
      .then((correo) => {
        if (correo) {
          return guardarCorreoEnCache(uid, carpeta, correo, false, 'loading', null);
        }
      })
      .then(() => {
        console.log(`[email-body] persisted loading uid=${uid} lastBodyAttemptAt=${new Date().toISOString()}`);
      })
      .catch((persistError) => {
        // Ignorar error al obtener cache o persistir
        if (persistError.message && !persistError.message.includes('No se encontró')) {
          console.warn(`[email-body] ⚠️ Error persistiendo loading state: ${persistError.message}`);
        }
      });
    
    fetchBodyInBackground(uid, carpeta, true)
      .finally(() => {
        uidsEnProceso.delete(cacheKey);
        console.log(`[email-body] cleared inProgress uid=${uid} carpeta=${carpeta}`);
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
  const cacheKey = getCacheKey(uid, carpeta);
  console.log(`[email-body] start uid=${uid} carpeta=${carpeta}`);
  
  try {
    // Verificar si IMAP está disponible
    if (!imapManager.isConnectionAvailable() || imapManager.isOffline()) {
      console.log(`[email-body] offline uid=${uid} carpeta=${carpeta} -> set error + clear inProgress`);
      
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
    
    // Timeout máximo para la descarga completa (30 segundos)
    const MAX_FETCH_TIMEOUT = 30000;
    const fetchTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout descargando body (30s)')), MAX_FETCH_TIMEOUT);
    });
    
    // Usar imapConnectionManager para descargar el body con timeout
    await Promise.race([
      imapManager.withImapClient(async (client) => {
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
        
        // Normalizar fecha antes de guardar
        const fechaNormalizada = normalizarFecha(msg.envelope.date || correoMetadata.date);
        
        // Usar metadata existente como base y actualizar con body
        const correoCompleto = {
          ...correoMetadata, // Preservar metadata existente
          uid: msg.uid,
          subject: msg.envelope.subject || correoMetadata.subject || "(Sin asunto)",
          from: fromText,
          date: fechaNormalizada,
          to: toText,
          flags: flagsArray,
          leido: seen,
          seen: seen,
          important: important,
          text: "",
          html: "",
          attachments: [],
        };
        
        // Parsear contenido si hay source (con opciones livianas para mejor performance)
        if (msg.source) {
          try {
            const parseStartTime = Date.now();
            const parsed = await Promise.race([
              simpleParser(msg.source, {
                skipHtmlToText: true,  // No convertir HTML a texto (más rápido)
                skipTextToHtml: true,  // No convertir texto a HTML (más rápido)
                streamAttachments: true, // Stream attachments en lugar de cargarlos en memoria
                maxHtmlLengthToParse: 1024 * 1024, // Limitar HTML a 1MB para parseo
                maxTextLengthToParse: 1024 * 1024, // Limitar texto a 1MB para parseo
              }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 30000) // 30s timeout (con streamAttachments debería ser raro)
              )
            ]);
            
            const parseTime = Date.now() - parseStartTime;
            
            if (parsed) {
              // Extraer text y html
              correoCompleto.text = parsed.text || "";
              correoCompleto.html = parsed.html || "";
              
              // Si ambos están vacíos, usar preview o envelope como fallback
              if (!correoCompleto.text && !correoCompleto.html) {
                const preview = parsed.textAsHtml || parsed.preview || "";
                const subject = msg.envelope.subject || correoMetadata.subject || "";
                correoCompleto.text = preview || `(Correo sin contenido de texto)\n\nAsunto: ${subject}`;
                console.log(`[email-body] ⚠️ UID ${uid} sin text/html, usando preview/envelope como fallback`);
              }
              
              // Procesar attachments (SOLO metadata, NO contenido)
              if (parsed.attachments && parsed.attachments.length > 0) {
                for (const att of parsed.attachments) {
                  try {
                    // Guardar SOLO metadata, NO contenido (para mejor performance)
                    const attachmentData = {
                      filename: att.filename || att.contentId || "sin-nombre",
                      contentType: att.contentType || "application/octet-stream",
                      size: att.size || 0,
                      contentId: att.contentId || null,
                      // NO guardar content - solo metadata para mejor performance
                    };
                    
                    correoCompleto.attachments.push(attachmentData);
                  } catch (attError) {
                    console.warn(`[email-body] ⚠️ Error procesando attachment para UID ${uid}: ${attError.message}`);
                    // Continuar con siguiente attachment
                  }
                }
                console.log(`[email-body] 📎 UID ${uid}: ${correoCompleto.attachments.length} attachments (solo metadata)`);
              }
              
              console.log(`[email-body] ✅ Parseo completado para UID ${uid} en ${parseTime}ms (text: ${correoCompleto.text.length} chars, html: ${correoCompleto.html.length} chars)`);
            }
          } catch (parseError) {
            const parseTime = Date.now() - inicioTiempo;
            console.warn(`[email-body] ⚠️ Error parseando contenido para UID ${uid} después de ${parseTime}ms: ${parseError.message}`);
            
            // Si falla el parseo pero tenemos envelope, usar eso como fallback
            if (msg.envelope && msg.envelope.subject) {
              correoCompleto.text = `(Error parseando contenido completo)\n\nAsunto: ${msg.envelope.subject}`;
              console.log(`[email-body] ⚠️ UID ${uid}: usando envelope como fallback después de error de parseo`);
            }
          }
        }
        
        // Asegurar que siempre hay algún contenido (text o html) antes de marcar como ready
        // Si ambos están vacíos después del parseo, usar fallback
        if (!correoCompleto.text && !correoCompleto.html) {
          const subject = correoCompleto.subject || "(Sin asunto)";
          correoCompleto.text = `(Correo sin contenido de texto)\n\nAsunto: ${subject}\nDe: ${correoCompleto.from || "Sin remitente"}`;
          console.log(`[email-body] ⚠️ UID ${uid}: text y html vacíos, usando fallback con metadata`);
        }
        
        // Guardar en MongoDB con incluyeContenido = true y bodyStatus = "ready"
        await guardarCorreoEnCache(uid, nombreCarpetaReal, correoCompleto, true, 'ready', null);
        // También guardar con nombre solicitado si es diferente
        if (nombreCarpetaReal !== carpeta) {
          await guardarCorreoEnCache(uid, carpeta, correoCompleto, true, 'ready', null);
        }
        
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        const tieneText = correoCompleto.text && correoCompleto.text.length > 0;
        const tieneHtml = correoCompleto.html && correoCompleto.html.length > 0;
        const numAttachments = correoCompleto.attachments ? correoCompleto.attachments.length : 0;
        console.log(`[email-body] ✅ success uid=${uid} carpeta=${carpeta} tiempo=${tiempoTranscurrido}ms text=${tieneText ? '✓' : '✗'} html=${tieneHtml ? '✓' : '✗'} attachments=${numAttachments}`);
        
      } finally {
        if (lock) {
          lock.release();
        }
      }
      }),
      fetchTimeoutPromise
    ]);
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    const errorMessage = error.message || String(error);
    
    // Determinar si es error de conexión o timeout
    const esErrorConexion = error instanceof ConnectionNotAvailableError || 
                            isConnectionError(error) ||
                            errorMessage.includes("Connection not available") ||
                            errorMessage.includes("Timeout") ||
                            errorMessage.includes("timeout");
    
    // Guardar estado de error en cache (CRÍTICO para evitar loading infinito)
    try {
      const correoMetadata = await obtenerCorreoDelCache(uid, carpeta, false);
      if (correoMetadata) {
        const mensajeError = esErrorConexion 
          ? (errorMessage.includes("Timeout") ? 'Timeout descargando body (30s)' : 'IMAP offline o error de conexión')
          : errorMessage;
        await guardarCorreoEnCache(uid, carpeta, correoMetadata, false, 'error', mensajeError);
        console.log(`[email-body] fail uid=${uid} carpeta=${carpeta} err="${mensajeError}" -> set error + clear inProgress tiempo=${tiempoTranscurrido}ms`);
      }
    } catch (guardarError) {
      console.warn(`[email-body] ⚠️ Error guardando estado de error: ${guardarError.message}`);
    }
    
    // No lanzar error - esto es en background, no debe afectar al usuario
  } finally {
    // CRÍTICO: SIEMPRE limpiar inProgress, incluso si hay error
    // Esto se ejecuta después del finally del Promise.race, garantizando limpieza
    uidsEnProceso.delete(cacheKey);
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

