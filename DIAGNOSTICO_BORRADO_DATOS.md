# Diagnóstico: Base de Datos Borrada

## Pasos para diagnosticar el problema

### 1. Verificar el estado actual de la base de datos

```bash
npm run check-db
```

Este script mostrará:
- Cuántos documentos hay en cada colección
- Cuándo fue la última modificación
- Si hay algún problema de conexión

### 2. Revisar logs de PM2 para buscar borrados

```bash
# Ver los últimos 1000 logs
pm2 logs crm-nextjs --lines 1000 | grep -i "deleteMany\|eliminados\|borrar\|BACKUP IMPORT"

# Ver todos los logs recientes
pm2 logs crm-nextjs --lines 5000
```

Busca específicamente:
- `[BACKUP IMPORT]` - Indica que se ejecutó una importación
- `deleteMany` - Indica que se borraron documentos
- `ELIMINACIÓN DE DATOS` - Logs de auditoría de borrado

### 3. Verificar si hay procesos automáticos

```bash
# Ver procesos PM2
pm2 list

# Ver si hay cron jobs configurados
crontab -l

# Ver procesos de Node.js
ps aux | grep node
```

### 4. Verificar acceso a la ruta de importación

La única forma de borrar todos los datos es a través de:
- `/api/backup/import` - Requiere `confirmDelete: true` en el body
- `scripts/importBackup.js` - Solo se ejecuta manualmente

**Verificar si alguien está llamando a la API:**

```bash
# Buscar en logs de nginx/apache si hay acceso a /api/backup/import
# (depende de tu configuración de servidor web)
```

### 5. Verificar variables de entorno

```bash
# Verificar que MONGODB_URI apunta a la base de datos correcta
cat .env.local | grep MONGODB_URI
```

### 6. Restaurar desde backup

Si tienes un backup reciente:

1. **Desde la aplicación web:**
   - Ve a la página de inicio
   - Usa la función "Importar" backup

2. **Desde línea de comandos:**
   ```bash
   npm run import-backup
   # Luego sigue las instrucciones
   ```

## Posibles causas

1. **Importación accidental de backup vacío o corrupto**
   - Alguien importó un backup sin datos
   - El backup estaba corrupto

2. **Proceso automático mal configurado**
   - Cron job ejecutando importación
   - Script de mantenimiento mal configurado

3. **Problema con MongoDB**
   - La base de datos se desconectó y perdió datos
   - Problema de permisos

4. **Múltiples instancias de la aplicación**
   - PM2 ejecutando múltiples instancias
   - Conflicto entre instancias

## Prevención

1. **Habilitar backups automáticos regulares**
2. **Revisar logs regularmente**
3. **Limitar acceso a la ruta `/api/backup/import`**
4. **Agregar autenticación adicional para operaciones destructivas**

## Comandos útiles

```bash
# Ver estado de PM2
pm2 status

# Ver logs en tiempo real
pm2 logs crm-nextjs

# Reiniciar aplicación
pm2 restart crm-nextjs

# Ver uso de memoria
pm2 monit

# Verificar base de datos
npm run check-db
```

