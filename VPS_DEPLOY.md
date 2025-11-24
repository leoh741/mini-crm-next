# Guía de Despliegue en VPS (GoDaddy)

## Configuración para MongoDB Local en el mismo VPS

### 1. Crear archivo `.env.local`

Crea un archivo `.env.local` en la raíz del proyecto con el siguiente contenido:

```bash
# Configuración para MongoDB local en el mismo VPS
MONGODB_URI=mongodb://localhost:27017/mini-crm
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Si MongoDB tiene autenticación:**
```bash
MONGODB_URI=mongodb://usuario:password@localhost:27017/mini-crm
```

**Si MongoDB está en otro puerto:**
```bash
MONGODB_URI=mongodb://localhost:27018/mini-crm
```

**En producción, actualiza NEXT_PUBLIC_BASE_URL:**
```bash
NEXT_PUBLIC_BASE_URL=https://tu-dominio.com
```

### 2. Verificar que MongoDB esté corriendo

```bash
# Verificar estado de MongoDB
sudo systemctl status mongod
# O
sudo systemctl status mongodb

# Si no está corriendo, iniciarlo:
sudo systemctl start mongod

# Para que inicie automáticamente al reiniciar el servidor:
sudo systemctl enable mongod
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Importar datos (si tienes un backup)

```bash
npm run import-backup
```

### 5. Construir la aplicación

```bash
npm run build
```

### 6. Ejecutar en producción

**Opción A: Usando PM2 (recomendado)**

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Crear archivo ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'mini-crm',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Iniciar con PM2
pm2 start ecosystem.config.js

# Guardar configuración de PM2
pm2 save

# Configurar PM2 para iniciar al arrancar el servidor
pm2 startup
```

**Opción B: Usando systemd**

```bash
# Crear servicio systemd
sudo nano /etc/systemd/system/mini-crm.service
```

Contenido del servicio:
```ini
[Unit]
Description=Mini CRM Next.js App
After=network.target

[Service]
Type=simple
User=tu-usuario
WorkingDirectory=/ruta/a/mini-crm-next
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Luego:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mini-crm
sudo systemctl start mini-crm
```

**Opción C: Ejecutar directamente**

```bash
npm start
```

### 7. Configurar Nginx como proxy reverso (opcional pero recomendado)

```bash
sudo nano /etc/nginx/sites-available/mini-crm
```

Contenido:
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
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilitar el sitio:
```bash
sudo ln -s /etc/nginx/sites-available/mini-crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Verificar que todo funciona

1. Verifica los logs:
   ```bash
   # Si usas PM2
   pm2 logs mini-crm
   
   # Si usas systemd
   sudo journalctl -u mini-crm -f
   ```

2. Deberías ver en los logs:
   ```
   [MongoDB] Conectado exitosamente
   ```

3. Accede a tu aplicación en el navegador

## Solución de Problemas

### Error: "MONGODB_URI no está configurada"

- Verifica que el archivo `.env.local` exista en la raíz del proyecto
- Verifica que la variable esté correctamente escrita (sin comillas)
- Si usas PM2 o systemd, asegúrate de que las variables de entorno estén configuradas

### Error: "No se pudo conectar a MongoDB"

1. Verifica que MongoDB esté corriendo:
   ```bash
   sudo systemctl status mongod
   ```

2. Verifica que MongoDB esté escuchando en el puerto correcto:
   ```bash
   sudo netstat -tlnp | grep mongod
   ```

3. Prueba conectarte manualmente:
   ```bash
   mongosh mongodb://localhost:27017
   ```

4. Verifica los logs de MongoDB:
   ```bash
   sudo tail -f /var/log/mongodb/mongod.log
   ```

### La aplicación no responde

1. Verifica que la aplicación esté corriendo:
   ```bash
   # PM2
   pm2 list
   
   # systemd
   sudo systemctl status mini-crm
   ```

2. Verifica los logs para ver errores

3. Verifica que el puerto 3000 esté abierto:
   ```bash
   sudo netstat -tlnp | grep 3000
   ```

## Notas Importantes

- El archivo `.env.local` NO debe subirse a Git (ya está en `.gitignore`)
- En producción, asegúrate de actualizar `NEXT_PUBLIC_BASE_URL` con tu dominio real
- Si cambias `MONGODB_URI`, reinicia la aplicación para que tome los cambios
- MongoDB local es más rápido que MongoDB Atlas porque no hay latencia de red

