// Servicio para enviar correos electrónicos usando SMTP (Nodemailer)
// Permite enviar correos desde contacto@digitalspace.com.ar
// También guarda una copia en la carpeta Sent usando IMAP

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { emailConfig } from "./emailConfig.js";
import { guardarListaEnCache } from "./emailListCache.js";
import { obtenerUltimosCorreos } from "./emailRead.js";

// Crear el transportador de correo con la configuración
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.smtpPort,
  secure: emailConfig.secure, // true para puerto 465
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
});

/**
 * Envía un correo electrónico
 * @param {Object} options - Opciones del correo
 * @param {string} options.to - Dirección de correo del destinatario
 * @param {string} options.subject - Asunto del correo
 * @param {string} [options.text] - Contenido en texto plano
 * @param {string} [options.html] - Contenido en HTML
 * @param {Array} [options.attachments] - Array de archivos adjuntos [{ filename, content, contentType?, path? }]
 * @param {string} [options.replyTo] - Dirección de correo a la que responder (para respuestas)
 * @returns {Promise<Object>} Información del correo enviado
 */
async function enviarCorreo({ to, subject, text, html, attachments, replyTo }) {
  console.log(`📧 [enviarCorreo] Iniciando envío de correo a: ${to}, Subject: ${subject}`);
  
  if (!to || !subject) {
    throw new Error("Faltan parámetros: 'to' y 'subject' son obligatorios");
  }

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  try {
    const mailOptions = {
      from: `"Digital Space" <${emailConfig.user}>`,
      to,
      subject,
      text: text || "",
      html: html || undefined,
    };

    // Agregar adjuntos si existen
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => {
        const attachment = {
          filename: att.filename || att.name,
        };
        
        // Si tiene contenido (buffer), usarlo
        if (att.content) {
          attachment.content = att.content;
        }
        // Si tiene path, usarlo
        else if (att.path) {
          attachment.path = att.path;
        }
        
        // Si tiene contentType, agregarlo
        if (att.contentType || att.type) {
          attachment.contentType = att.contentType || att.type;
        }
        
        return attachment;
      });
    }

    // Agregar replyTo si existe (para respuestas)
    if (replyTo) {
      mailOptions.replyTo = replyTo;
      // También agregar In-Reply-To y References para que sea una respuesta válida
      mailOptions.inReplyTo = replyTo;
    }

    // Construir el mensaje completo ANTES de enviar para tener el Message-ID correcto
    // Esto asegura que el mensaje guardado en Sent tenga el mismo Message-ID que el enviado
    const messageIdTemporal = `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${emailConfig.host}>`;
    const messageContent = await construirMensajeCompleto(mailOptions, messageIdTemporal);
    
    // Agregar el Message-ID al mailOptions para que Nodemailer lo use
    mailOptions.messageId = messageIdTemporal;
    
    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Correo enviado exitosamente a ${to}. MessageId: ${info.messageId || messageIdTemporal}`);
    if (attachments && attachments.length > 0) {
      console.log(`📎 Adjuntos enviados: ${attachments.length}`);
    }
    
    // Guardar copia en carpeta Sent usando IMAP
    // CRÍTICO: Esperar a que se complete para asegurar que se guarde
    // Si falla, registrar el error pero no bloquear (el correo ya fue enviado)
    console.log(`📝 Iniciando guardado en carpeta Sent...`);
    try {
      await guardarEnSent(mailOptions, info.messageId || messageIdTemporal, messageContent);
      console.log(`✅ Correo guardado en carpeta Sent exitosamente`);
    } catch (err) {
      console.error(`❌ ERROR CRÍTICO guardando correo en Sent: ${err.message}`);
      console.error(`❌ Stack completo:`, err.stack);
      // No lanzar error para no bloquear la respuesta, pero registrar el error completo
      // El correo ya fue enviado exitosamente, solo falló el guardado en Sent
    }
    
    return info;
  } catch (error) {
    console.error("❌ Error enviando correo:", error.message);
    throw error;
  }
}

/**
 * Verifica la conexión con el servidor SMTP
 * @returns {Promise<boolean>} true si la conexión es exitosa
 */
async function verificarConexion() {
  try {
    await transporter.verify();
    console.log("✅ Conexión SMTP verificada correctamente");
    return true;
  } catch (error) {
    console.error("❌ Error verificando conexión SMTP:", error.message);
    return false;
  }
}

/**
 * Construye el mensaje completo en formato RFC822
 * @param {Object} mailOptions - Opciones del correo
 * @param {string} messageId - ID del mensaje
 * @returns {Promise<Buffer>} Mensaje completo en formato RFC822
 */
async function construirMensajeCompleto(mailOptions, messageId) {
  const lines = [];
  
  // Headers principales (en orden correcto según RFC822)
  // From debe ser la primera línea
  lines.push(`From: ${mailOptions.from}`);
  
  // To
  lines.push(`To: ${mailOptions.to}`);
  
  // Subject (escapar caracteres especiales y saltos de línea)
  const subjectEscaped = (mailOptions.subject || '').replace(/\r?\n/g, ' ').replace(/\r/g, '');
  lines.push(`Subject: ${subjectEscaped}`);
  
  // Date en formato RFC822
  const dateStr = new Date().toUTCString();
  lines.push(`Date: ${dateStr}`);
  
  // Message-ID (debe estar entre < >)
  const msgId = messageId || `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${emailConfig.host}>`;
  lines.push(`Message-ID: ${msgId}`);
  
  // MIME-Version
  lines.push(`MIME-Version: 1.0`);
  
  // Headers adicionales
  if (mailOptions.replyTo) {
    lines.push(`Reply-To: ${mailOptions.replyTo}`);
  }
  if (mailOptions.inReplyTo) {
    lines.push(`In-Reply-To: ${mailOptions.inReplyTo}`);
    lines.push(`References: ${mailOptions.inReplyTo}`);
  }
  
  // Construir el cuerpo del mensaje
  const tieneHTML = mailOptions.html && mailOptions.html.trim().length > 0;
  const tieneTexto = mailOptions.text && mailOptions.text.trim().length > 0;
  const tieneAttachments = mailOptions.attachments && mailOptions.attachments.length > 0;
  
  // Línea vacía separando headers del cuerpo
  lines.push(``);
  
  if (tieneHTML && tieneTexto) {
    // Si hay HTML y texto, usar multipart/alternative
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push(``);
    
    // Parte de texto plano
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push(``);
    lines.push(mailOptions.text);
    lines.push(``);
    
    // Parte HTML
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push(``);
    lines.push(mailOptions.html);
    lines.push(``);
    
    lines.push(`--${boundary}--`);
  } else if (tieneHTML) {
    // Solo HTML
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push(``);
    lines.push(mailOptions.html);
  } else {
    // Solo texto plano
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push(``);
    lines.push(mailOptions.text || '');
  }
  
  // Unir todas las líneas con \r\n (formato RFC822)
  const mensajeCompleto = lines.join('\r\n');
  
  // Asegurar que termine con \r\n
  const mensajeFinal = mensajeCompleto.endsWith('\r\n') ? mensajeCompleto : mensajeCompleto + '\r\n';
  
  // Convertir a buffer
  const buffer = Buffer.from(mensajeFinal, 'utf-8');
  
  // Verificar que el mensaje tenga al menos los headers básicos
  if (!buffer.toString('utf-8').includes('From:') || !buffer.toString('utf-8').includes('To:')) {
    throw new Error("El mensaje construido no tiene los headers básicos requeridos");
  }
  
  console.log(`📝 Mensaje construido: ${buffer.length} bytes, ${lines.length} líneas`);
  console.log(`📝 Primeras líneas: ${lines.slice(0, 5).join(' | ')}`);
  console.log(`📝 Últimas líneas: ${lines.slice(-3).join(' | ')}`);
  
  return buffer;
}

/**
 * Guarda una copia del correo enviado en la carpeta Sent usando IMAP
 * @param {Object} mailOptions - Opciones del correo enviado
 * @param {string} messageId - ID del mensaje enviado
 * @param {Buffer} messageContent - Contenido del mensaje en formato RFC822 (opcional)
 */
async function guardarEnSent(mailOptions, messageId, messageContent = null) {
  console.log(`📝 [guardarEnSent] Iniciando guardado de correo en Sent...`);
  console.log(`📝 [guardarEnSent] Message-ID: ${messageId}`);
  console.log(`📝 [guardarEnSent] Subject: ${mailOptions.subject}`);
  
  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta para guardar en Sent");
  }

  console.log(`📝 [guardarEnSent] Conectando a IMAP: ${emailConfig.host}:${emailConfig.imapPort}`);
  const client = new ImapFlow({
    host: emailConfig.host,
    port: emailConfig.imapPort,
    secure: emailConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
    logger: false,
  });

  try {
    await client.connect();
    console.log(`✅ [guardarEnSent] Conectado a IMAP exitosamente`);
    
    // Intentar diferentes nombres comunes para la carpeta Sent
    // También buscar usando list() para encontrar el nombre exacto
    let carpetaSent = null;
    
    try {
      // Primero intentar listar todas las carpetas para encontrar Sent
      const carpetas = [];
      for await (const box of client.list()) {
        carpetas.push(box.name);
        // Verificar si es una carpeta Sent (case insensitive)
        if (box.name && (
          box.name.toLowerCase() === 'sent' ||
          box.name.toLowerCase() === 'sent items' ||
          box.name.toLowerCase() === 'sent messages' ||
          box.name.toLowerCase() === 'enviados'
        )) {
          carpetaSent = box.name;
          console.log(`✅ [guardarEnSent] Carpeta Sent encontrada: "${box.name}"`);
          break;
        }
      }
      
      // Si no se encontró en la lista, intentar nombres comunes directamente
      if (!carpetaSent) {
        const nombresSent = ["Sent", "SENT", "sent", "Sent Messages", "Sent Items", "Enviados", "ENVIADOS"];
        for (const nombre of nombresSent) {
          try {
            const lock = await client.getMailboxLock(nombre);
            lock.release();
            carpetaSent = nombre;
            console.log(`✅ Carpeta Sent encontrada por nombre directo: "${nombre}"`);
            break;
          } catch (e) {
            // Continuar con el siguiente nombre
          }
        }
      }
    } catch (listError) {
      console.warn(`⚠️ Error listando carpetas: ${listError.message}`);
      // Continuar con búsqueda directa
      const nombresSent = ["Sent", "SENT", "sent", "Sent Messages", "Sent Items"];
      for (const nombre of nombresSent) {
        try {
          const lock = await client.getMailboxLock(nombre);
          lock.release();
          carpetaSent = nombre;
          break;
        } catch (e) {
          // Continuar con el siguiente nombre
        }
      }
    }
    
    if (!carpetaSent) {
      // Si no se encuentra, intentar crear
      try {
        await client.mailboxCreate("Sent");
        carpetaSent = "Sent";
        console.log(`✅ Carpeta Sent creada exitosamente`);
      } catch (createError) {
        console.error(`❌ No se pudo crear carpeta Sent: ${createError.message}`);
        throw new Error(`No se pudo encontrar ni crear la carpeta Sent. Error: ${createError.message}`);
      }
    }
    
    // Usar el mensaje completo proporcionado o construirlo
    let mensajeParaGuardar = messageContent;
    if (!mensajeParaGuardar) {
      mensajeParaGuardar = await construirMensajeCompleto(mailOptions, messageId);
    }
    
    // Guardar en la carpeta Sent usando append
    // Primero abrir la carpeta para asegurar que existe y está accesible
    try {
      await client.mailboxOpen(carpetaSent);
      console.log(`✅ Carpeta ${carpetaSent} abierta exitosamente`);
    } catch (openError) {
      console.error(`❌ Error abriendo carpeta ${carpetaSent}:`, openError.message);
      throw new Error(`No se pudo abrir la carpeta Sent: ${openError.message}`);
    }
    
    // Obtener el lock de la carpeta
    const lock = await client.getMailboxLock(carpetaSent);
    try {
      // Verificar que el mensaje tenga contenido válido
      if (!mensajeParaGuardar || mensajeParaGuardar.length === 0) {
        throw new Error("El mensaje está vacío");
      }
      
      // Verificar que el mensaje tenga formato válido (debe tener From y To)
      const mensajeStr = mensajeParaGuardar.toString('utf-8');
      if (!mensajeStr.includes('From:') || !mensajeStr.includes('To:')) {
        console.error(`❌ Mensaje inválido - falta From o To`);
        console.error(`❌ Primeros 500 caracteres:`, mensajeStr.substring(0, 500));
        throw new Error("El mensaje no tiene el formato RFC822 válido (falta From o To)");
      }
      
      console.log(`📝 Intentando guardar correo en ${carpetaSent} (tamaño: ${mensajeParaGuardar.length} bytes)`);
      console.log(`📝 Message-ID: ${messageId}`);
      console.log(`📝 Subject: ${mailOptions.subject}`);
      console.log(`📝 From: ${mailOptions.from}`);
      console.log(`📝 To: ${mailOptions.to}`);
      
      // Verificar que el mensaje termine con \r\n (requerido por RFC822)
      let mensajeFinal = mensajeParaGuardar;
      const mensajeStrFinal = mensajeParaGuardar.toString('utf-8');
      if (!mensajeStrFinal.endsWith('\r\n') && !mensajeStrFinal.endsWith('\n')) {
        console.log(`⚠️ Mensaje no termina con \\r\\n, agregando...`);
        mensajeFinal = Buffer.from(mensajeStrFinal + '\r\n', 'utf-8');
      } else if (mensajeStrFinal.endsWith('\n') && !mensajeStrFinal.endsWith('\r\n')) {
        // Convertir \n a \r\n
        mensajeFinal = Buffer.from(mensajeStrFinal.replace(/\n/g, '\r\n'), 'utf-8');
      }
      
      // Guardar el mensaje en la carpeta Sent
      // ImapFlow append puede retornar el UID directamente (número) o undefined
      let appendResult;
      let uidGuardado = null;
      
      try {
        console.log(`📝 Ejecutando append en carpeta: ${carpetaSent}`);
        console.log(`📝 Tamaño del mensaje final: ${mensajeFinal.length} bytes`);
        
        // Ejecutar append - asegurarse de que el mensaje sea un Buffer o string
        // ImapFlow espera un Buffer o string con el mensaje completo en formato RFC822
        // El problema detectado: los flags se están pasando como "[object Object]" en lugar de strings
        // Solución: intentar primero sin flags, luego marcar como leído después si es necesario
        console.log(`📝 Intentando append sin flags primero...`);
        
        // Intentar append sin flags primero (más compatible)
        appendResult = await client.append(carpetaSent, mensajeFinal);
        
        console.log(`📝 Resultado de append (tipo: ${typeof appendResult}):`, appendResult);
        
        // Si el append fue exitoso, intentar marcar como leído después
        if (appendResult) {
          try {
            const uid = typeof appendResult === 'number' ? appendResult : (appendResult?.uid || null);
            if (uid) {
              console.log(`📝 Intentando marcar mensaje UID ${uid} como leído...`);
              // Marcar como leído después del append usando messageFlagsAdd
              await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
              console.log(`✅ Mensaje marcado como leído después del append`);
            } else {
              console.log(`⚠️ No se obtuvo UID del append, no se puede marcar como leído`);
            }
          } catch (flagError) {
            console.warn(`⚠️ No se pudo marcar como leído (no crítico): ${flagError.message}`);
            // No es crítico si no se puede marcar como leído
          }
        }
        
        console.log(`📝 Resultado de append (tipo: ${typeof appendResult}):`, appendResult);
        
        // El resultado puede ser:
        // - Un número (UID directamente)
        // - Un objeto con { uid: number }
        // - undefined (algunos servidores no retornan UID)
        if (typeof appendResult === 'number') {
          uidGuardado = appendResult;
        } else if (appendResult && typeof appendResult === 'object' && appendResult.uid) {
          uidGuardado = appendResult.uid;
        } else if (appendResult === undefined || appendResult === null) {
          // Algunos servidores no retornan UID, pero el mensaje se guardó
          console.log(`⚠️ Append completó pero no retornó UID (comportamiento normal en algunos servidores)`);
        } else {
          console.warn(`⚠️ Formato inesperado de resultado:`, appendResult);
        }
        
        if (uidGuardado) {
          console.log(`✅ Correo guardado en carpeta Sent: ${carpetaSent} (UID: ${uidGuardado})`);
        } else {
          console.log(`✅ Append completado en carpeta Sent: ${carpetaSent} (sin UID retornado)`);
        }
        
      } catch (appendError) {
        console.error(`❌ Error en append:`, appendError);
        console.error(`❌ Mensaje:`, appendError.message);
        console.error(`❌ Stack:`, appendError.stack);
        console.error(`❌ Tipo de error:`, appendError.constructor.name);
        throw new Error(`Error al guardar correo en Sent: ${appendError.message}`);
      }
      
      // Verificar que se guardó correctamente haciendo una búsqueda
      try {
        // Esperar un momento para que el servidor procese el mensaje
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Obtener el estado de la carpeta para ver cuántos mensajes hay
        const status = await client.status(carpetaSent, { messages: true });
        console.log(`📊 Estado de carpeta ${carpetaSent}: ${status.messages} mensajes`);
        
        // Buscar el correo por Message-ID (escapar caracteres especiales)
        const messageIdEscaped = messageId.replace(/[<>]/g, '');
        try {
          const searchResult = await client.search({ 
            header: ['message-id', messageIdEscaped] 
          });
          
          if (searchResult && searchResult.length > 0) {
            console.log(`✅ Verificación exitosa: Correo encontrado en Sent con UID ${searchResult[0]}`);
          } else {
            // Si no se encuentra por Message-ID, verificar el último mensaje
            const allMessages = await client.search({ all: true });
            if (allMessages && allMessages.length > 0) {
              const lastUid = allMessages[allMessages.length - 1];
              console.log(`✅ Correo probablemente guardado (último UID en carpeta: ${lastUid}, total: ${allMessages.length})`);
              
              // Verificar el último mensaje para confirmar
              try {
                for await (const msg of client.fetch(lastUid, { envelope: true })) {
                  if (msg.envelope && msg.envelope.subject === mailOptions.subject) {
                    console.log(`✅ Confirmado: Último correo coincide con el enviado`);
                  }
                }
              } catch (fetchError) {
                console.warn(`⚠️ Error verificando último mensaje: ${fetchError.message}`);
              }
            } else {
              console.warn(`⚠️ No se pudo verificar el correo guardado - carpeta vacía`);
            }
          }
        } catch (searchError) {
          console.warn(`⚠️ Error en búsqueda por Message-ID: ${searchError.message}`);
          // Intentar búsqueda alternativa
          const allMessages = await client.search({ all: true });
          console.log(`📊 Total de mensajes en carpeta: ${allMessages ? allMessages.length : 0}`);
        }
      } catch (verifyError) {
        console.warn(`⚠️ Error verificando correo guardado: ${verifyError.message}`);
        // No lanzar error, el correo ya fue guardado
      }
      
      // CRÍTICO: Actualizar el cache de la carpeta Sent después de guardar
      // Esperar un momento para que el correo esté disponible en IMAP
      // Hacerlo en segundo plano para no bloquear la respuesta, pero asegurar que se complete
      (async () => {
        try {
          // Esperar 3 segundos para que el correo esté disponible en IMAP después del append
          // Aumentado de 2 a 3 segundos para dar más tiempo al servidor
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Obtener los últimos correos de Sent (esto actualizará el cache automáticamente)
          // Usar forzarServidor=true para forzar actualización desde servidor y actualizar cache
          console.log(`🔄 Actualizando cache de Sent después de enviar correo...`);
          console.log(`🔄 Usando nombre de carpeta: "${carpetaSent}"`);
          
          // Intentar obtener los correos con el nombre real de la carpeta
          let mensajes = await obtenerUltimosCorreos(carpetaSent, 20, true);
          
          // Si no se encontraron, intentar con "Sent" como fallback
          if (!mensajes || mensajes.length === 0) {
            console.log(`⚠️ No se encontraron correos con "${carpetaSent}", intentando con "Sent"...`);
            mensajes = await obtenerUltimosCorreos("Sent", 20, true);
          }
          
          if (mensajes && mensajes.length > 0) {
            // Guardar en cache con todas las variaciones de nombre para máxima compatibilidad
            // CRÍTICO: Guardar con el nombre real de la carpeta primero
            await guardarListaEnCache(carpetaSent, mensajes, 20);
            await guardarListaEnCache("Sent", mensajes, 20).catch(() => {});
            await guardarListaEnCache("Enviados", mensajes, 20).catch(() => {});
            await guardarListaEnCache("Sent Items", mensajes, 20).catch(() => {});
            console.log(`✅ Cache de carpeta Sent actualizado con ${mensajes.length} correos`);
            console.log(`✅ Cache guardado para: "${carpetaSent}", "Sent", "Enviados", "Sent Items"`);
          } else {
            console.warn(`⚠️ No se encontraron correos en Sent después de enviar`);
            // Intentar una vez más después de otro segundo
            await new Promise(resolve => setTimeout(resolve, 1000));
            mensajes = await obtenerUltimosCorreos(carpetaSent, 20, true);
            if (mensajes && mensajes.length > 0) {
              await guardarListaEnCache(carpetaSent, mensajes, 20);
              await guardarListaEnCache("Sent", mensajes, 20).catch(() => {});
              await guardarListaEnCache("Enviados", mensajes, 20).catch(() => {});
              await guardarListaEnCache("Sent Items", mensajes, 20).catch(() => {});
              console.log(`✅ Cache actualizado en segundo intento con ${mensajes.length} correos`);
            }
          }
        } catch (cacheError) {
          console.warn(`⚠️ Error actualizando cache de Sent (no crítico): ${cacheError.message}`);
        }
      })(); // Ejecutar en segundo plano
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("❌ Error guardando correo en Sent:", error.message);
    throw error;
  } finally {
    await client.logout();
  }
}

export { enviarCorreo, verificarConexion };

