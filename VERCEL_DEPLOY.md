# Instrucciones para Desplegar en Vercel

## Problema: La aplicación muestra "Cargando..." y no guarda cambios

Esto generalmente ocurre porque:

1. **Las variables de entorno no están configuradas en Vercel**
2. **La conexión a MongoDB no está funcionando**
3. **Los datos no se han importado a MongoDB**

## Solución Paso a Paso

### 1. Configurar Variables de Entorno en Vercel

1. Ve a tu proyecto en Vercel: https://vercel.com/dashboard
2. Selecciona tu proyecto
3. Ve a **Settings** → **Environment Variables**
4. Agrega las siguientes variables:

```
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/nombre-db?retryWrites=true&w=majority
NEXT_PUBLIC_BASE_URL=https://tu-dominio.vercel.app
```

**Importante:**
- Reemplaza `usuario`, `password`, `cluster`, y `nombre-db` con tus credenciales reales de MongoDB Atlas
- Si estás usando MongoDB local, usa la URI correspondiente
- `NEXT_PUBLIC_BASE_URL` debe ser la URL de tu aplicación en Vercel

### 2. Importar Datos a MongoDB

Si tienes un backup JSON, necesitas importarlo:

1. **Opción A: Usar el script de importación localmente**
   ```bash
   # En tu máquina local, con .env.local configurado:
   npm run import-backup
   ```

2. **Opción B: Importar manualmente desde Vercel**
   - Usa la función de "Importar Respaldo" en la aplicación
   - O conecta directamente a MongoDB y ejecuta el script

### 3. Verificar la Conexión

1. Despliega nuevamente la aplicación en Vercel (o espera a que se redespiegue automáticamente)
2. Abre la consola del navegador (F12) y revisa si hay errores
3. Verifica que las llamadas a `/api/clientes`, `/api/pagos`, etc. estén funcionando

### 4. Verificar Logs en Vercel

1. Ve a **Deployments** en Vercel
2. Selecciona el último deployment
3. Ve a **Functions** y revisa los logs de las funciones API
4. Busca errores relacionados con MongoDB

## Errores Comunes

### Error: "Please define the MONGODB_URI environment variable"
- **Solución**: Agrega `MONGODB_URI` en las variables de entorno de Vercel

### Error: "MongoNetworkError" o "MongooseServerSelectionError" o "Could not connect to any servers"
- **Causa**: MongoDB Atlas está bloqueando las conexiones desde Vercel porque las IPs de Vercel no están en la whitelist
- **Solución**: 
  1. Ve a MongoDB Atlas: https://cloud.mongodb.com
  2. Selecciona tu proyecto/cluster
  3. Ve a **Network Access** (o Security → Network Access)
  4. Haz clic en **"Add IP Address"**
  5. Agrega `0.0.0.0/0` con el comentario "Allow All IPs (Vercel)"
  6. Haz clic en **"Confirm"**
  7. Espera 1-2 minutos para que se propague el cambio
  8. Vuelve a intentar el login en Vercel
  
  **Nota de Seguridad**: `0.0.0.0/0` permite conexiones desde cualquier IP. Asegúrate de:
  - Usar autenticación fuerte (usuario/contraseña)
  - No exponer tu `MONGODB_URI` públicamente
  - Considerar restringir IPs en producción si es necesario

### La aplicación muestra "Cargando..." indefinidamente
- **Solución**: 
  - Revisa la consola del navegador para ver errores
  - Verifica que las APIs estén respondiendo correctamente
  - Asegúrate de que los datos existan en MongoDB

## Verificar que Todo Funciona

1. **Login**: Debe funcionar con usuarios de MongoDB
2. **Clientes**: Debe mostrar la lista de clientes desde MongoDB
3. **Pagos**: Debe mostrar los pagos desde MongoDB
4. **Balance**: Debe mostrar gastos e ingresos desde MongoDB

## Notas Importantes

- Después de configurar las variables de entorno, **Vercel necesita redespelgar** la aplicación
- Los cambios en variables de entorno requieren un nuevo deployment
- Si cambias `MONGODB_URI`, todos los datos se perderán a menos que uses la misma base de datos

