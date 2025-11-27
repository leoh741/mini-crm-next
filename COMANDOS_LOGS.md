# Comandos para revisar logs y errores

## 1. Ver logs de PM2 (aplicación Next.js)
```bash
# Ver logs en tiempo real
pm2 logs crm-nextjs

# Ver últimas 100 líneas
pm2 logs crm-nextjs --lines 100

# Ver solo errores
pm2 logs crm-nextjs --err

# Ver logs de hoy
pm2 logs crm-nextjs --lines 1000 | grep "$(date +%Y-%m-%d)"

# Buscar errores relacionados con backup/import
pm2 logs crm-nextjs --lines 1000 | grep -i "backup\|import\|delete\|error"
```

## 2. Ver logs de Next.js (si hay archivos de log)
```bash
# Buscar archivos de log
find . -name "*.log" -type f

# Ver logs de Next.js si existen
tail -f .next/trace
tail -f npm-debug.log
```

## 3. Buscar errores en logs del sistema
```bash
# Ver logs del sistema (si hay errores de MongoDB)
sudo journalctl -u mongod -n 100 --no-pager

# Ver logs de nginx (si usas nginx como proxy)
sudo tail -f /var/log/nginx/error.log
```

## 4. Buscar en logs de PM2 por palabras clave específicas
```bash
# Buscar intentos de importación de backup
pm2 logs crm-nextjs --lines 5000 | grep -i "BACKUP IMPORT"

# Buscar eliminaciones de datos
pm2 logs crm-nextjs --lines 5000 | grep -i "deleteMany\|eliminados\|borrar"

# Buscar errores críticos
pm2 logs crm-nextjs --lines 5000 | grep -i "error\|critical\|fatal"

# Buscar conexiones a MongoDB
pm2 logs crm-nextjs --lines 5000 | grep -i "mongodb\|conectando\|conectado"
```

## 5. Exportar logs a archivo para análisis
```bash
# Exportar últimos 1000 logs a archivo
pm2 logs crm-nextjs --lines 1000 --nostream > logs_export.txt

# Exportar logs de hoy
pm2 logs crm-nextjs --lines 10000 --nostream | grep "$(date +%Y-%m-%d)" > logs_hoy.txt

# Buscar en el archivo exportado
grep -i "backup\|import\|delete" logs_export.txt
```

## 6. Verificar estado de la aplicación
```bash
# Ver estado de PM2
pm2 status

# Ver información detallada
pm2 describe crm-nextjs

# Ver uso de recursos
pm2 monit
```

## 7. Buscar en logs por timestamp específico
```bash
# Si sabes la fecha/hora aproximada cuando se borraron los datos
pm2 logs crm-nextjs --lines 10000 | grep "2025-01-27"  # Cambiar por la fecha

# Buscar por hora específica
pm2 logs crm-nextjs --lines 10000 | grep "12:00\|13:00"  # Cambiar por la hora
```

## 8. Verificar conexión a MongoDB
```bash
# Ver si hay errores de conexión
pm2 logs crm-nextjs --lines 1000 | grep -i "mongodb\|connection\|disconnect"

# Verificar que MongoDB esté corriendo
sudo systemctl status mongod
# o
ps aux | grep mongod
```

## 9. Buscar llamadas a la API de backup
```bash
# Buscar todas las llamadas a /api/backup/import
pm2 logs crm-nextjs --lines 5000 | grep "/api/backup/import"

# Ver detalles de importaciones
pm2 logs crm-nextjs --lines 5000 | grep -A 10 "BACKUP IMPORT.*INICIADA"
```

## 10. Comando combinado para análisis completo
```bash
# Este comando busca múltiples patrones importantes
pm2 logs crm-nextjs --lines 5000 | grep -E "BACKUP IMPORT|deleteMany|ERROR|eliminados|borrar|confirmDelete" -i
```

## 11. Ver logs de MongoDB directamente (si tienes acceso)
```bash
# Ver logs de MongoDB
sudo tail -f /var/log/mongodb/mongod.log

# Buscar operaciones de eliminación
sudo grep -i "delete" /var/log/mongodb/mongod.log | tail -50
```

## 12. Verificar si hay procesos que puedan estar borrando datos
```bash
# Ver procesos relacionados con Node/Next
ps aux | grep node

# Ver si hay algún script ejecutándose
ps aux | grep importBackup
```

