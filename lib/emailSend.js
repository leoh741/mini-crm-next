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
 * @returns {Promise<Object>} Información del correo enviado
 */
async function enviarCorreo({ to, subject, text, html }) {
  if (!to || !subject) {
    throw new Error("Faltan parámetros: 'to' y 'subject' son obligatorios");
  }

  if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
    throw new Error("Configuración de correo incompleta. Verifica las variables de entorno.");
  }

  try {
    const info = await transporter.sendMail({
      from: `"Digital Space" <${emailConfig.user}>`,
      to,
      subject,
      text: text || "",
      html: html || undefined,
    });

    console.log(`✅ Correo enviado exitosamente a ${to}. MessageId: ${info.messageId}`);
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

