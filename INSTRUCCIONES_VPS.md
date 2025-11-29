# Instrucciones para Verificar Errores en el VPS

## 🔍 Verificación Rápida

### 1. Ejecutar el script de verificación
```bash
npm run check-errors
```

Este script mostrará:
- ✅ Logs de auditoría (últimas 50 líneas)
- ✅ Operaciones de borrado recientes
- ✅ Estado de la base de datos (conteo de documentos)
- ✅ Errores en logs del servidor
- ✅ Configuración de MongoDB

---

## 📋 Verificación Manual

### 1. Ver logs de auditoría
```bash
# Ver últimas 100 líneas
tail -100 logs/audit.log

# Buscar operaciones de borrado
grep -i "DELETE_OPERATION\|ELIMINACIÓN\|deleteMany" logs/audit.log | tail -50

# Ver todo el log
cat logs/audit.log
```

### 2. Ver logs del servidor Next.js

**Si usas PM2:**
```bash
# Ver logs en tiempo real
pm2 logs crm-nextjs

# Ver últimas 500 líneas
pm2 logs crm-nextjs --lines 500

# Buscar errores
pm2 logs crm-nextjs --lines 1000 | grep -i "error\|delete\|borrar"
```

**Si usas npm run dev:log:**
```bash
# Ver últimas líneas
tail -100 server.log

# Buscar errores
grep -i "error\|delete\|borrar" server.log | tail -50
```

### 3. Verificar estado de la base de datos
```bash
# Verificar conteo de documentos
npm run check-db

# Conectar directamente a MongoDB
mongosh
# Luego ejecutar:
use mini-crm
db.clients.countDocuments()
db.monthlypayments.countDocuments()
db.expenses.countDocuments()
db.incomes.countDocuments()
```

### 4. Verificar procesos en ejecución
```bash
# Si usas PM2
pm2 list
pm2 status

# Ver procesos de Node
ps aux | grep node

# Ver procesos de MongoDB
ps aux | grep mongod
```

### 5. Verificar configuración
```bash
# Ver variables de entorno (sin mostrar credenciales)
cat .env.local | grep MONGODB_URI | sed 's/\/\/[^:]*:[^@]*@/\/\/***:***@/'

# Verificar que MongoDB esté corriendo
systemctl status mongod
# o
service mongod status
```

---

## 🚨 Si Encuentras Problemas

### Datos borrados
1. **Revisar logs de auditoría:**
   ```bash
   grep -i "DELETE_OPERATION" logs/audit.log | tail -20
   ```

2. **Verificar backup automático:**
   - Los backups automáticos se crean antes de importar
   - Revisa los logs para ver si hay un backup disponible

3. **Verificar base de datos:**
   ```bash
   npm run check-db
   ```

### Errores de conexión
1. **Verificar que MongoDB esté corriendo:**
   ```bash
   systemctl status mongod
   ```

2. **Verificar la URI de conexión:**
   ```bash
   cat .env.local | grep MONGODB_URI
   ```

3. **Probar conexión manual:**
   ```bash
   mongosh "mongodb://localhost:27017/mini-crm"
   ```

### Errores del servidor
1. **Ver logs de PM2:**
   ```bash
   pm2 logs crm-nextjs --err
   ```

2. **Reiniciar el servidor:**
   ```bash
   pm2 restart crm-nextjs
   # o
   npm run dev
   ```

---

## 📊 Comandos Útiles

```bash
# Ver espacio en disco
df -h

# Ver uso de memoria
free -h

# Ver uso de CPU
top

# Ver logs del sistema
journalctl -xe

# Verificar puertos en uso
netstat -tulpn | grep :3000
netstat -tulpn | grep :27017
```

---

## 🔐 Verificar Seguridad

```bash
# Ver quién tiene acceso al servidor
who
last

# Ver logs de autenticación
grep -i "authentication\|login\|failed" /var/log/auth.log | tail -20
```

---

## 📝 Notas Importantes

1. **Los logs de auditoría** se guardan en `logs/audit.log`
2. **Cada operación de borrado** se registra con timestamp y detalles
3. **El estado de la BD** se registra antes y después de operaciones críticas
4. **Los backups automáticos** se crean antes de importar datos

Si encuentras algo sospechoso, revisa los logs de auditoría para ver exactamente qué pasó y cuándo.

