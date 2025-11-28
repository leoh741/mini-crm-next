// Configuración PM2 para producción en VPS
// Instalar PM2: npm install -g pm2
// Iniciar: pm2 start ecosystem.config.js
// Guardar: pm2 save
// Configurar inicio automático: pm2 startup

module.exports = {
  apps: [{
    name: 'crm-nextjs',
    // Usar directamente el servidor standalone (modificado por fix-server-hostname.js)
    script: 'node',
    args: '.next/standalone/server.js',
    instances: 1, // Para VPS pequeño, 1 instancia es suficiente
    exec_mode: 'fork',
    cwd: '/var/www/mini-crm-next', // Directorio de trabajo absoluto
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0' // Escuchar en todas las interfaces para que Nginx pueda conectarse
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '800M', // Aumentar a 800MB para evitar reinicios innecesarios
    min_uptime: '30s', // Aumentar a 30 segundos para considerar estable
    max_restarts: 5, // Reducir a 5 reinicios máximo para evitar loops
    restart_delay: 10000, // Aumentar delay a 10 segundos entre reinicios
    exp_backoff_restart_delay: 100, // Delay exponencial para reinicios
    watch: false, // Desactivar watch en producción
    ignore_watch: ['node_modules', '.next', 'logs'],
    // Configuraciones adicionales para estabilidad
    kill_timeout: 5000, // Tiempo para cerrar limpiamente antes de forzar kill
    wait_ready: true, // Esperar señal de "ready" antes de considerar iniciado
    listen_timeout: 10000 // Tiempo máximo para escuchar en el puerto
  }]
};

