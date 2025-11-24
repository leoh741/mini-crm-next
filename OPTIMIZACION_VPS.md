# Guía de Optimización para VPS con MongoDB Local

Este documento describe todas las optimizaciones implementadas y recomendaciones adicionales para el servidor VPS de GoDaddy con MongoDB local.

## Optimizaciones Implementadas

### 1. Conexión MongoDB Optimizada
- **Pool de conexiones aumentado**: De 5 a 20 conexiones máximas (servidor local puede manejar más)
- **Timeouts reducidos**: Timeouts más cortos apropiados para localhost (1-2 segundos vs 3-8 segundos)
- **Compresión deshabilitada**: No es necesaria para conexiones locales, mejora rendimiento
- **AutoIndex deshabilitado**: Los índices se crean manualmente al inicio
- **Validadores habilitados**: Ahora se validan los datos para mantener integridad

### 2. Índices de MongoDB
Se agregaron índices en todos los modelos para acelerar queries:
- **Client**: índices en crmId, nombre, rubro, pagado, createdAt (y compuestos)
- **MonthlyPayment**: índices en mes, crmClientId, pagado, fechaActualizacion (y compuestos)
- **Expense**: índices en periodo, crmId, fecha, categoria (y compuestos)
- **Income**: índices en periodo, crmId, fecha, categoria (y compuestos)

**Para crear los índices, ejecuta:**
```bash
npm run create-indexes
```

### 3. Configuración Next.js Optimizada
- **SWC Minifier**: Habilitado para compilación más rápida
- **Compresión**: Habilitada (gzip/brotli)
- **Headers de seguridad y caché**: Optimizados
- **Cache de páginas**: Configurado para mantener páginas en memoria

### 4. APIs Optimizadas
- **Timeouts actualizados**: De 3-8 segundos a 5 segundos (adecuado para servidor local)
- **Validadores habilitados**: Para mantener integridad de datos
- **Cache headers**: Aumentado a 120 segundos con stale-while-revalidate de 240 segundos
- **Queries optimizadas**: Usando lean() y select() para traer solo campos necesarios

### 5. Caché en Cliente
- **Duración aumentada**: De 1-2 minutos a 2-3 minutos
- **localStorage**: Mejor uso de caché local
- **Caché en memoria**: Optimizado para reducir queries

## Recomendaciones Adicionales para el VPS

### 1. Configuración de MongoDB en el Servidor

Asegúrate de que MongoDB tenga estas configuraciones en `/etc/mongod.conf`:

```yaml
# Optimizaciones de rendimiento
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1  # Ajustar según RAM disponible (50-60% del total)
      journalCompressor: snappy
      directoryForIndexes: false

# Red - para servidor local
net:
  bindIp: 127.0.0.1  # Solo localhost
  port: 27017

# Operaciones
operationProfiling:
  slowOpThresholdMs: 100
  mode: slowOp

# Logging
systemLog:
  verbosity: 1  # Reducir logging en producción
```

### 2. Configuración de Node.js/Next.js

Para producción, considera usar PM2 para gestión de procesos:

```bash
npm install -g pm2
```

Crear archivo `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'crm-nextjs',
    script: 'npm',
    args: 'start',
    instances: 1, // Para VPS pequeño, 1 es suficiente
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
    max_memory_restart: '500M'
  }]
};
```

Iniciar con:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Para iniciar automáticamente al reiniciar el servidor
```

### 3. Configuración de Nginx (si usas proxy reverso)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts optimizados para VPS
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Compresión
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;
}
```

### 4. Optimizaciones de Sistema Operativo

```bash
# Aumentar límite de archivos abiertos
ulimit -n 65536

# Asegurar que MongoDB tenga suficiente memoria
# Editar /etc/security/limits.conf
mongodb soft nofile 65536
mongodb hard nofile 65536
```

### 5. Monitoreo y Logging

Considera agregar monitoreo básico:
- Usar PM2 monit para monitorear procesos
- Configurar logs de MongoDB
- Monitorear uso de CPU y RAM

### 6. Backup Automático

Configura backups automáticos de MongoDB:

```bash
# Crear script de backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/ruta/a/backups"
mongodump --out $BACKUP_DIR/backup_$DATE
# Mantener solo últimos 7 días
find $BACKUP_DIR -name "backup_*" -mtime +7 -exec rm -rf {} \;
```

Agregar a crontab:
```bash
0 2 * * * /ruta/al/script/backup.sh
```

## Comandos Útiles

```bash
# Crear índices en MongoDB
npm run create-indexes

# Build de producción
npm run build

# Iniciar en producción
npm start

# Con PM2
pm2 start ecosystem.config.js
pm2 logs crm-nextjs
pm2 monit
```

## Verificación de Optimizaciones

1. **Verificar índices creados:**
   ```bash
   mongosh
   use tu_base_de_datos
   db.clients.getIndexes()
   db.monthlypayments.getIndexes()
   ```

2. **Monitorear queries lentas:**
   ```bash
   mongosh
   db.setProfilingLevel(1, { slowms: 100 })
   db.system.profile.find().limit(5).sort({ ts: -1 }).pretty()
   ```

3. **Verificar conexiones activas:**
   ```bash
   mongosh
   db.serverStatus().connections
   ```

## Notas Importantes

- Las optimizaciones están configuradas para un servidor VPS con MongoDB local
- Los timeouts son más cortos porque no hay latencia de red entre la app y MongoDB
- El pool de conexiones es más grande porque el servidor puede manejarlo
- Los índices deben crearse una vez con `npm run create-indexes`

