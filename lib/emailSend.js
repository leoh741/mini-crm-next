// Servicio para enviar correos electrónicos usando SMTP (Nodemailer)
// Permite enviar correos desde contacto@digitalspace.com.ar
// También guarda una copia en la carpeta Sent usando IMAP

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { emailConfig } from "./emailConfig.js";

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

    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Correo enviado exitosamente a ${to}. MessageId: ${info.messageId}`);
    if (attachments && attachments.length > 0) {
      console.log(`📎 Adjuntos enviados: ${attachments.length}`);
    }
    
    // Guardar copia en carpeta Sent usando IMAP (en segundo plano, no bloquea)
    guardarEnSent(mailOptions, info.messageId).catch(err => {
      console.warn(`⚠️ Error guardando correo en Sent (no crítico): ${err.message}`);
    });
    
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
 * Guarda una copia del correo enviado en la carpeta Sent usando IMAP
 * @param {Object} mailOptions - Opciones del correo enviado
 * @param {string} messageId - ID del mensaje enviado
 */
async function guardarEnSent(mailOptions, messageId) {
  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta para guardar en Sent");
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
  });

  try {
    await client.connect();
    
    // Intentar diferentes nombres comunes para la carpeta Sent
    const nombresSent = ["Sent", "SENT", "sent", "Sent Messages", "Sent Items"];
    let carpetaSent = null;
    
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
    
    if (!carpetaSent) {
      // Si no se encuentra, intentar crear
      try {
        await client.mailboxCreate("Sent");
        carpetaSent = "Sent";
      } catch (createError) {
        console.warn("⚠️ No se pudo crear carpeta Sent, el correo no se guardará en Sent");
        return; // No es crítico, solo loguear
      }
    }
    
    // Construir el mensaje en formato RFC822
    const lines = [];
    lines.push(`From: ${mailOptions.from}`);
    lines.push(`To: ${mailOptions.to}`);
    lines.push(`Subject: ${mailOptions.subject}`);
    if (mailOptions.replyTo) {
      lines.push(`Reply-To: ${mailOptions.replyTo}`);
    }
    if (mailOptions.inReplyTo) {
      lines.push(`In-Reply-To: ${mailOptions.inReplyTo}`);
    }
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push(`Message-ID: ${messageId || `<${Date.now()}@${emailConfig.host}>`}`);
    lines.push(`MIME-Version: 1.0`);
    
    // Construir el cuerpo del mensaje
    if (mailOptions.html) {
      // Si hay HTML, usar multipart/alternative
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push(``);
      lines.push(`--${boundary}`);
      if (mailOptions.text) {
        lines.push(`Content-Type: text/plain; charset=UTF-8`);
        lines.push(``);
        lines.push(mailOptions.text);
        lines.push(``);
        lines.push(`--${boundary}`);
      }
      lines.push(`Content-Type: text/html; charset=UTF-8`);
      lines.push(``);
      lines.push(mailOptions.html);
      lines.push(``);
      lines.push(`--${boundary}--`);
    } else {
      lines.push(`Content-Type: text/plain; charset=UTF-8`);
      lines.push(``);
      lines.push(mailOptions.text || "");
    }
    
    const messageContent = Buffer.from(lines.join('\r\n'), 'utf-8');
    
    // Guardar en la carpeta Sent usando append
    const lock = await client.getMailboxLock(carpetaSent);
    try {
      await client.append(carpetaSent, messageContent, {
        flags: ['\\Seen'], // Marcar como leído
      });
      console.log(`✅ Correo guardado en carpeta Sent: ${carpetaSent}`);
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

