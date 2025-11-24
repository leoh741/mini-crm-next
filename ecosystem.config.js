// Configuración PM2 para producción en VPS
// Instalar PM2: npm install -g pm2
// Iniciar: pm2 start ecosystem.config.js
// Guardar: pm2 save
// Configurar inicio automático: pm2 startup

module.exports = {
  apps: [{
    name: 'crm-nextjs',
    script: 'npm',
    args: 'start',
    instances: 1, // Para VPS pequeño, 1 instancia es suficiente
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M', // Reiniciar si usa más de 500MB
    min_uptime: '10s', // Tiempo mínimo de ejecución antes de considerar estable
    max_restarts: 10, // Máximo de reinicios en el período
    restart_delay: 4000, // Esperar 4 segundos entre reinicios
    watch: false, // Desactivar watch en producción
    ignore_watch: ['node_modules', '.next', 'logs']
  }]
};

