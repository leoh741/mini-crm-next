// Servicio para leer correos electrónicos usando IMAP (ImapFlow)
// Permite leer la bandeja de entrada de contacto@digitalspace.com.ar
// Soporta múltiples carpetas: INBOX, SPAM, TRASH, etc.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { emailConfig } from "./emailConfig.js";

// Cache simple en memoria para correos recientes (últimos 10 correos)
const emailCache = new Map();
const CACHE_SIZE = 20; // Aumentado para mejor rendimiento
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos (aumentado)

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
 * @returns {Promise<Array>} Array de correos ordenados del más nuevo al más viejo
 */
async function obtenerUltimosCorreos(carpeta = "INBOX", limit = 10) {
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
      const variaciones = [
        carpeta,
        carpeta.toUpperCase(),
        carpeta.toLowerCase(),
        carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
      ];
      
      for (const variacion of variaciones) {
        try {
          const testLock = await client.getMailboxLock(variacion);
          testLock.release();
          carpetaExiste = true;
          nombreCarpetaReal = variacion;
          break;
        } catch (e) {
          // Continuar con la siguiente variación
        }
      }
      
      if (!carpetaExiste) {
        console.warn(`⚠️ La carpeta ${carpeta} no existe en el servidor`);
        return []; // Retornar array vacío en lugar de lanzar error
      }
    }

    if (!carpetaExiste) {
      console.warn(`⚠️ La carpeta ${carpeta} no existe en el servidor`);
      return []; // Retornar array vacío en lugar de lanzar error
    }

    const lock = await client.getMailboxLock(nombreCarpetaReal);
    let mensajes = [];

    try {
      // OPTIMIZACIÓN: Obtener solo los últimos mensajes directamente
      // Usar search con límite para evitar cargar todos los correos
      const sequence = await client.search({ all: true });

      if (sequence.length === 0) {
        return [];
      }

      // OPTIMIZACIÓN: Obtener solo los últimos 'limit' mensajes (los más recientes)
      // Si hay muchos correos, limitar la búsqueda a los últimos 100 para mejor rendimiento
      const maxUidsParaBuscar = Math.min(sequence.length, 100);
      const uidsRecientes = sequence.slice(-maxUidsParaBuscar);
      const ultimos = uidsRecientes.slice(-limit);
      
      // Usar los últimos 'limit' correos encontrados
      const uidsParaObtener = ultimos.length > 0 ? ultimos : uidsRecientes.slice(-limit);

      // OPTIMIZACIÓN: Solo obtener envelope y flags inicialmente (más rápido)
      // El contenido completo se parsea solo cuando se abre el correo individual
      // IMPORTANTE: Usar 'uidsParaObtener' no 'sequence' para no cargar todos los correos
      for await (let msg of client.fetch(uidsParaObtener, {
        envelope: true,
        uid: true,
        flags: true,
        // No obtener source completo aquí para optimizar
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

          mensajes.push({
            uid: msg.uid,
            subject: msg.envelope.subject || "(Sin asunto)",
            from: fromText,
            date: msg.envelope.date || new Date(),
            to: toText,
            text: "", // Se carga solo cuando se abre el correo
            html: "", // Se carga solo cuando se abre el correo
            flags: msg.flags || [],
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
    return mensajes.reverse();
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
  
  // OPTIMIZACIÓN: Verificar cache primero (solo para datos básicos sin contenido)
  if (!incluirContenido) {
    const cacheKey = `${uid}-${carpeta}`;
    const cached = emailCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`✅ Correo encontrado en cache! UID: ${uid}`);
      return cached.data;
    }
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
    timeout: 1500, // 1.5 segundos máximo - operaciones ultra-rápidas
    // Cerrar la conexión automáticamente después de un tiempo de inactividad
    socketTimeout: 1500, // 1.5 segundos de timeout en el socket (ultra-rápido)
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
    const variaciones = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Intentar abrir la carpeta con las variaciones
    let lock = null;
    let carpetaEncontrada = false;
    
    for (const variacion of variaciones) {
      try {
        console.log(`🔍 Intentando abrir carpeta: ${variacion}`);
        lock = await client.getMailboxLock(variacion);
        nombreCarpetaReal = variacion;
        carpetaEncontrada = true;
        console.log(`✅ Carpeta abierta: ${nombreCarpetaReal}`);
        break;
      } catch (e) {
        console.log(`⚠️ No se pudo abrir carpeta ${variacion}: ${e.message}`);
        // Continuar con la siguiente variación
        if (lock) {
          try {
            lock.release();
          } catch (releaseError) {
            console.warn(`⚠️ Error al liberar lock: ${releaseError.message}`);
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
        
        const resultadoBase = {
          uid: msg.uid,
          subject: msg.envelope.subject || "(Sin asunto)",
          from: fromText,
          date: msg.envelope.date || new Date(),
          to: toText,
          text: "",
          html: "",
          flags: msg.flags || [],
          leido: msg.flags?.has("\\Seen") || false,
        };
        
        // Solo parsear si hay source y se solicitó contenido
        if (incluirContenido && msg.source) {
          try {
            // Parsear con timeout muy corto (1 segundo)
            const parsed = await Promise.race([
              simpleParser(msg.source),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Parseo timeout")), 500)
              )
            ]);
            
            if (parsed) {
              resultadoBase.text = parsed.text || "";
              resultadoBase.html = parsed.html || "";
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
        console.log(`🔍 Buscando correo directamente por UID: ${uidBuscado}...`);
        
        // INTENTO 1: Buscar directamente por UID (sintaxis más común)
        try {
          // OPTIMIZACIÓN: Búsqueda directa por UID con timeout muy corto
          const searchPromise = client.search({ uid: uidBuscado });
          const sequenceNumbers = await Promise.race([
            searchPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Search timeout")), 500)
            )
          ]).catch(() => null);
          
          if (!sequenceNumbers) {
            throw new Error("Search timeout");
          }
          
          if (sequenceNumbers && sequenceNumbers.length > 0) {
            // Encontrado! Hacer fetch directamente del número de secuencia
            const seqNum = sequenceNumbers[0];
            console.log(`✅ UID encontrado! Número de secuencia: ${seqNum}`);
            
            // OPTIMIZACIÓN: Fetch directo sin loop innecesario
            // OPTIMIZACIÓN: Fetch directo con timeout muy corto (500ms)
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
                  setTimeout(() => reject(new Error("Fetch timeout")), 300)
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
      
      // OPTIMIZACIÓN: Guardar en cache (solo datos básicos sin contenido)
      if (!incluirContenido && correoEncontrado) {
        const cacheKey = `${uidNumero}-${nombreCarpetaReal}`;
        
        // Limpiar cache si está lleno (FIFO)
        if (emailCache.size >= CACHE_SIZE) {
          const firstKey = emailCache.keys().next().value;
          emailCache.delete(firstKey);
        }
        
        emailCache.set(cacheKey, {
          data: correoEncontrado,
          timestamp: Date.now()
        });
        console.log(`💾 Correo guardado en cache (${emailCache.size}/${CACHE_SIZE})`);
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
    const lock = await client.getMailboxLock(carpeta);

    try {
      if (leido) {
        await client.messageFlagsAdd(uid, ["\\Seen"]);
      } else {
        await client.messageFlagsRemove(uid, ["\\Seen"]);
      }
      console.log(`✅ Correo ${uid} marcado como ${leido ? "leído" : "no leído"}`);
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

export { obtenerUltimosCorreos, obtenerCorreoPorUID, obtenerCarpetas, moverCorreo, marcarComoLeido, eliminarCorreo };

