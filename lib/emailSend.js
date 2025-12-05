// Servicio para enviar correos electrónicos usando SMTP (Nodemailer)
// Permite enviar correos desde contacto@digitalspace.com.ar

import nodemailer from "nodemailer";
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

export { enviarCorreo, verificarConexion };

