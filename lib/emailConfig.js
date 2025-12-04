// Configuración del correo electrónico corporativo
// Lee las variables de entorno para conectar con el servidor de correo

const emailConfig = {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS,
  host: process.env.EMAIL_HOST,
  imapPort: Number(process.env.EMAIL_IMAP_PORT) || 993,
  smtpPort: Number(process.env.EMAIL_SMTP_PORT) || 465,
  secure: process.env.EMAIL_SECURE === "true",
};

// Validar que las variables de entorno estén configuradas
if (!emailConfig.user || !emailConfig.pass || !emailConfig.host) {
  console.error("⚠️ Faltan variables de entorno para el correo:");
  console.error("   - EMAIL_USER");
  console.error("   - EMAIL_PASS");
  console.error("   - EMAIL_HOST");
  console.error("   Configuralas en .env.local o .env");
}

export { emailConfig };

