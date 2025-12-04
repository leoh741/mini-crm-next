// Servicio para leer correos electrónicos usando IMAP (ImapFlow)
// Permite leer la bandeja de entrada de contacto@digitalspace.com.ar
// Soporta múltiples carpetas: INBOX, SPAM, TRASH, etc.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { emailConfig } from "./emailConfig.js";

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
 * @param {number} limit - Número máximo de correos a obtener (por defecto 20)
 * @returns {Promise<Array>} Array de correos ordenados del más nuevo al más viejo
 */
async function obtenerUltimosCorreos(carpeta = "INBOX", limit = 20) {
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
      // Buscar todos los mensajes en la carpeta
      const sequence = await client.search({ all: true });

      // Obtener los últimos 'limit' mensajes
      const ultimos = sequence.slice(-limit);

      // Obtener información de cada mensaje
      for await (let msg of client.fetch(ultimos, {
        envelope: true,
        source: true,
        uid: true,
        flags: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source);

          mensajes.push({
            uid: msg.uid,
            subject: parsed.subject || msg.envelope.subject || "(Sin asunto)",
            from: parsed.from?.text || msg.envelope.from?.map(f => `${f.name || ""} <${f.address}>`).join(", ") || "Sin remitente",
            date: parsed.date || msg.envelope.date || new Date(),
            to: parsed.to?.text || msg.envelope.to?.map(t => t.address).join(", ") || "",
            text: parsed.text || "",
            html: parsed.html || "",
            flags: msg.flags || [],
            leido: msg.flags?.has("\\Seen") || false,
          });
        } catch (parseError) {
          console.error(`⚠️ Error parseando mensaje UID ${msg.uid}:`, parseError.message);
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
async function obtenerCorreoPorUID(uid, carpeta = "INBOX") {
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
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(carpeta);

    try {
      const messages = await client.fetch([uid], {
        envelope: true,
        source: true,
        uid: true,
        flags: true,
      });

      for await (let msg of messages) {
        const parsed = await simpleParser(msg.source);
        return {
          uid: msg.uid,
          subject: parsed.subject || msg.envelope.subject || "(Sin asunto)",
          from: parsed.from?.text || msg.envelope.from?.map(f => `${f.name || ""} <${f.address}>`).join(", ") || "Sin remitente",
          date: parsed.date || msg.envelope.date || new Date(),
          to: parsed.to?.text || msg.envelope.to?.map(t => t.address).join(", ") || "",
          text: parsed.text || "",
          html: parsed.html || "",
          flags: msg.flags || [],
          leido: msg.flags?.has("\\Seen") || false,
        };
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
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

