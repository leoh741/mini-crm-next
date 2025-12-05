// Servicio para leer correos electrónicos usando IMAP (ImapFlow)
// Permite leer la bandeja de entrada de contacto@digitalspace.com.ar
// Soporta múltiples carpetas: INBOX, SPAM, TRASH, etc.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { emailConfig } from "./emailConfig.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache } from "./emailCache.js";
import { obtenerListaDelCache, guardarListaEnCache } from "./emailListCache.js";

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
    const carpetas = [];

    // Usar list() correctamente - ImapFlow retorna un async iterable
    // Verificar que el método existe antes de usarlo
    if (typeof client.list === 'function') {
      try {
        const listIterator = client.list();
        // Verificar que es un async iterable
        if (listIterator && typeof listIterator[Symbol.asyncIterator] === 'function') {
          for await (const box of listIterator) {
            carpetas.push({
              name: box.name,
              path: box.path,
              delimiter: box.delimiter,
              flags: box.flags || [],
              specialUse: box.specialUse || null,
            });
          }
        } else {
          throw new Error("client.list() no retorna un async iterable");
        }
      } catch (listError) {
        console.warn("⚠️ Error al listar carpetas:", listError.message);
        // Retornar solo INBOX como fallback mínimo
        carpetas.push({
          name: 'INBOX',
          path: 'INBOX',
          delimiter: '/',
          flags: [],
          specialUse: null,
        });
      }
    } else {
      console.warn("⚠️ client.list() no es una función");
      // Retornar solo INBOX como fallback
      carpetas.push({
        name: 'INBOX',
        path: 'INBOX',
        delimiter: '/',
        flags: [],
        specialUse: null,
      });
    }

    return carpetas;
  } catch (error) {
    console.error("❌ Error obteniendo carpetas:", error.message);
    throw error;
  } finally {
    await client.logout();
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
    // Timeouts más cortos para evitar esperas largas
    logger: false, // Desactivar logs detallados para mejor rendimiento
  });

  try {
    await client.connect();
    console.log(`✅ Conectado al servidor IMAP. Leyendo carpeta: ${carpeta}`);

    // Verificar que la carpeta existe antes de intentar acceder
    let carpetaExiste = false;
    let nombreCarpetaReal = carpeta;
    
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
      
      if (!carpetaExiste) {
        console.warn(`⚠️ La carpeta ${carpeta} no existe en el servidor`);
        // CRÍTICO: Guardar lista vacía en cache para que no muestre "sincronizando" cada vez
        try {
          await guardarListaEnCache(carpeta, [], limit);
          console.log(`✅ Lista vacía guardada en cache para carpeta inexistente ${carpeta}`);
        } catch (err) {
          console.warn(`⚠️ Error guardando lista vacía en cache: ${err.message}`);
        }
        return []; // Retornar array vacío en lugar de lanzar error
      }
    }

    if (!carpetaExiste) {
      console.warn(`⚠️ La carpeta ${carpeta} no existe en el servidor`);
      // CRÍTICO: Guardar lista vacía en cache para que no muestre "sincronizando" cada vez
      try {
        await guardarListaEnCache(carpeta, [], limit);
        console.log(`✅ Lista vacía guardada en cache para carpeta inexistente ${carpeta}`);
      } catch (err) {
        console.warn(`⚠️ Error guardando lista vacía en cache: ${err.message}`);
      }
      return []; // Retornar array vacío en lugar de lanzar error
    }

    const lock = await client.getMailboxLock(nombreCarpetaReal);
    let mensajes = [];

    try {
      // OPTIMIZACIÓN: Obtener solo los últimos mensajes directamente
      // Usar search con límite para evitar cargar todos los correos
      const sequence = await client.search({ all: true });

      if (sequence.length === 0) {
        // CRÍTICO: Guardar lista vacía en cache para que no muestre "sincronizando" cada vez
        try {
          await guardarListaEnCache(nombreCarpetaReal, [], limit);
          console.log(`✅ Lista vacía guardada en cache para carpeta ${nombreCarpetaReal}`);
        } catch (err) {
          console.warn(`⚠️ Error guardando lista vacía en cache: ${err.message}`);
        }
        return [];
      }

      // OPTIMIZACIÓN: Obtener solo los últimos 'limit' mensajes (los más recientes)
      // Si hay muchos correos, limitar la búsqueda a los últimos 100 para mejor rendimiento
      const maxUidsParaBuscar = Math.min(sequence.length, 100);
      const uidsRecientes = sequence.slice(-maxUidsParaBuscar);
      const ultimos = uidsRecientes.slice(-limit);
      
      // Usar los últimos 'limit' correos encontrados
      const uidsParaObtener = ultimos.length > 0 ? ultimos : uidsRecientes.slice(-limit);

      // OPTIMIZACIÓN: Obtener solo envelope y flags para la lista (más rápido)
      // El contenido completo se descargará después en segundo plano
      // IMPORTANTE: Usar 'uidsParaObtener' no 'sequence' para no cargar todos los correos
      for await (let msg of client.fetch(uidsParaObtener, {
        envelope: true,
        uid: true,
        flags: true,
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
          
          mensajes.push({
            uid: msg.uid,
            subject: msg.envelope.subject || "(Sin asunto)",
            from: fromText,
            date: msg.envelope.date || new Date(),
            to: toText,
            text: "", // Se descargará con contenido completo después
            html: "", // Se descargará con contenido completo después
            flags: flagsArray, // Array en lugar de Set para MongoDB
            leido: msg.flags?.has("\\Seen") || false,
            preview: "", // Vista previa vacía inicialmente
          });
        } catch (parseError) {
          console.error(`⚠️ Error procesando mensaje UID ${msg.uid}:`, parseError.message);
          // Continuar con el siguiente mensaje aunque este falle
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
    Promise.all(
      mensajesOrdenados.map(async (mensaje) => {
        try {
          // Guardar con nombre solicitado
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
      console.log(`✅ ${mensajesOrdenados.length} correos guardados en base de datos (metadatos)`);
    }).catch(err => {
      console.warn(`⚠️ Error guardando correos en DB: ${err.message}`);
    });
    
    // Descargar contenido completo en segundo plano (no bloquea)
    // Usar una sola conexión IMAP para descargar todos los correos con contenido completo
    descargarContenidoCompletoEnSegundoPlano(mensajesOrdenados, carpeta)
      .then(() => {
        console.log(`✅ Contenido completo descargado para ${mensajesOrdenados.length} correos`);
      })
      .catch(err => {
        console.warn(`⚠️ Error descargando contenido completo en segundo plano: ${err.message}`);
      });
    
    return mensajesOrdenados;
  } catch (error) {
    console.error("❌ Error obteniendo correos:", error.message);
    throw error;
  } finally {
    await client.logout();
    console.log("✅ Desconectado del servidor IMAP");
  }
}

/**
 * Obtiene un correo específico por su UID
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

  console.log(`🔧 Configuración IMAP:`);
  console.log(`   - Host: ${emailConfig.host}`);
  console.log(`   - Port: ${emailConfig.imapPort}`);
  console.log(`   - Secure: ${emailConfig.secure}`);
  console.log(`   - User: ${emailConfig.user ? emailConfig.user.substring(0, 5) + '...' : 'NO CONFIGURADO'}`);
  
  const client = new ImapFlow({
    host: emailConfig.host,
    port: emailConfig.imapPort,
    secure: emailConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
    logger: false, // Desactivar logs detallados para mejor rendimiento
    // Timeouts más largos para evitar errores de conexión (especialmente para correos grandes)
    timeout: incluirContenido ? 35000 : 1500, // 35s si hay contenido (attachments grandes), 1.5s si no
    // Cerrar la conexión automáticamente después de un tiempo de inactividad
    socketTimeout: incluirContenido ? 35000 : 1500, // 35s si hay contenido, 1.5s si no
    // Optimizaciones adicionales
    disableAutoIdle: true, // Desactivar IDLE automático para mejor rendimiento
    // Optimizaciones de rendimiento
    tls: {
      rejectUnauthorized: false, // Más rápido (solo para desarrollo)
    },
  });

  // Agregar manejador de errores para timeouts del socket
  client.on('error', (error) => {
    // Ignorar errores de timeout si ya obtuvimos el correo
    if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      console.warn("⚠️ Timeout del socket detectado (puede ser después de obtener el correo):", error.message);
    } else {
      console.error("❌ Error del socket IMAP:", error.message);
    }
  });

  try {
    console.log(`🔌 Intentando conectar al servidor IMAP...`);
    await client.connect();
    console.log(`✅ Conectado al servidor IMAP. Buscando correo UID ${uidNumero} en carpeta: ${carpeta}`);
    
    // Verificar que la conexión esté activa
    if (!client.authenticated) {
      throw new Error("No se pudo autenticar con el servidor de correo");
    }
    
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
          leido: msg.flags?.has("\\Seen") || false,
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
          
          if (sequenceNumbers && sequenceNumbers.length > 0) {
            // Encontrado! Hacer fetch directamente del número de secuencia
            const seqNum = sequenceNumbers[0];
            
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
            
            // Si search sin parámetros devuelve todos, limitar manualmente
            const sequence = Array.isArray(ultimos20Sequence) ? ultimos20Sequence : [];
            const ultimos20 = sequence.length > 0 ? sequence.slice(-20) : [];
            
            if (ultimos20.length > 0) {
              console.log(`🔍 Buscando en últimos 20 correos...`);
              
              for await (let msg of client.fetch(ultimos20, {
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
            const allSequence = await client.search({ all: true });
            
            if (allSequence.length === 0) {
              throw new Error(`La carpeta ${nombreCarpetaReal} está vacía`);
            }
            
            // Buscar en lotes pequeños desde el final
            const batchSize = 50;
            for (let i = allSequence.length; i > 0 && !mensajeEncontrado; i -= batchSize) {
              const start = Math.max(0, i - batchSize);
              const end = i;
              const batch = allSequence.slice(start, end);
              
              for await (let msg of client.fetch(batch, {
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
      
      // Marcar que ya cerramos la conexión para evitar doble cierre
      let conexionCerrada = false;
      
      // Cerrar la conexión inmediatamente después de obtener el correo para evitar timeouts
      try {
        if (client && typeof client.logout === 'function' && client.authenticated) {
          // No esperar el logout completo - hacerlo en segundo plano
          client.logout().catch(() => {});
          conexionCerrada = true;
          console.log("✅ Desconectando del servidor IMAP (en segundo plano)");
        }
      } catch (logoutError) {
        conexionCerrada = true; // Asumir que ya estaba cerrada
      }
      
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
  } finally {
    try {
      if (client) {
        // Verificar que el cliente esté conectado antes de intentar logout
        // Solo cerrar si no se cerró ya antes
        if (typeof client.logout === 'function' && client.authenticated) {
          await client.logout();
          console.log("✅ Desconectado del servidor IMAP (finally)");
        }
      }
    } catch (logoutError) {
      // Ignorar errores de logout si ya se cerró la conexión
      if (!logoutError.message.includes("already closed") && !logoutError.message.includes("not connected")) {
        console.warn("⚠️ Error al cerrar sesión IMAP:", logoutError.message);
      }
    }
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
    const lock = await client.getMailboxLock(carpetaOrigen);

    try {
      await client.messageMove(uid, carpetaDestino);
      console.log(`✅ Correo ${uid} movido de ${carpetaOrigen} a ${carpetaDestino}`);
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
      // Obtener el correo actualizado desde el servidor para actualizar el cache
      try {
        let correoActualizado = null;
        for await (let msg of client.fetch(uid, {
          envelope: true,
          uid: true,
          flags: true,
        })) {
          if (msg.uid === uid) {
            const fromText = msg.envelope.from?.map(f => {
              if (f.name) {
                return `${f.name} <${f.address}>`;
              }
              return f.address;
            }).join(", ") || "Sin remitente";

            const toText = msg.envelope.to?.map(t => t.address).join(", ") || "";

            // Convertir Set a Array para MongoDB
            const flagsArray = msg.flags ? Array.from(msg.flags) : [];
            
            // Obtener el correo existente del cache para preservar el contenido
            const correoExistente = await obtenerCorreoDelCache(uid, nombreCarpetaReal, true);
            
            correoActualizado = {
              uid: msg.uid,
              subject: msg.envelope.subject || "(Sin asunto)",
              from: fromText,
              date: msg.envelope.date || new Date(),
              to: toText,
              text: correoExistente?.text || "",
              html: correoExistente?.html || "",
              attachments: correoExistente?.attachments || [],
              flags: flagsArray,
              leido: msg.flags?.has("\\Seen") || false,
            };
            break;
          }
        }
        
        // Actualizar el cache individual del correo
        if (correoActualizado) {
          await guardarCorreoEnCache(uid, nombreCarpetaReal, correoActualizado, correoExistente?.html ? true : false);
          // También actualizar con el nombre solicitado si es diferente
          if (nombreCarpetaReal !== carpeta) {
            await guardarCorreoEnCache(uid, carpeta, correoActualizado, correoExistente?.html ? true : false);
          }
          console.log(`✅ Cache actualizado para correo ${uid} con estado leído=${leido}`);
        }
        
        // Actualizar también la lista en el cache
        // CRÍTICO: Actualizar todas las variaciones de limit que puedan existir (10, 20, etc.)
        try {
          const limites = [10, 20, 50]; // Actualizar los límites más comunes
          const estadoLeidoReal = correoActualizado?.leido || leido; // Usar el valor real del servidor
          
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
    const lock = await client.getMailboxLock(carpeta);

    try {
      // Intentar mover a TRASH primero, si no existe, marcar para eliminación
      try {
        await client.messageMove(uid, "TRASH");
        console.log(`✅ Correo ${uid} movido a TRASH`);
      } catch (moveError) {
        // Si no existe TRASH, marcar para eliminación
        await client.messageFlagsAdd(uid, ["\\Deleted"]);
        await client.expunge();
        console.log(`✅ Correo ${uid} marcado para eliminación`);
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
  // Verificar qué correos ya tienen contenido completo en DB
  const correosParaDescargar = [];
  for (const mensaje of mensajes) {
    try {
      const correoCache = await obtenerCorreoDelCache(mensaje.uid, carpeta, true);
      if (!correoCache) {
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
  
  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    console.warn(`⚠️ Configuración de correo incompleta, no se puede descargar contenido`);
    return;
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
    timeout: 60000, // 60 segundos para descargar múltiples correos
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
      // Descargar correos en lotes de 5 para no saturar
      const BATCH_SIZE = 5;
      for (let i = 0; i < correosParaDescargar.length; i += BATCH_SIZE) {
        const lote = correosParaDescargar.slice(i, i + BATCH_SIZE);
        
        // Procesar en secuencia dentro del lote para evitar conflictos de conexión IMAP
        for (const uid of lote) {
          try {
            // Verificar si ya tiene contenido completo en DB antes de descargar
            const correoCache = await obtenerCorreoDelCache(uid, carpeta, true);
            if (correoCache) {
              console.log(`✅ Correo ${uid} ya tiene contenido completo en DB, omitiendo descarga`);
              continue;
            }
            
            // Buscar correo por UID y obtener con source completo
            let correoCompleto = null;
            try {
              for await (const msg of client.fetch(uid, { source: true, envelope: true, flags: true })) {
                if (msg.uid === uid) {
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
                    leido: msg.flags?.has("\\Seen") || false,
                  };
                  
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
                  
                  break;
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
      lock.release();
    }
  } catch (error) {
    console.warn(`⚠️ Error en descarga en segundo plano: ${error.message}`);
  } finally {
    try {
      await client.logout();
    } catch (logoutError) {
      // Ignorar errores de logout
    }
  }
}

export { obtenerUltimosCorreos, obtenerCorreoPorUID, obtenerCarpetas, moverCorreo, marcarComoLeido, eliminarCorreo };

