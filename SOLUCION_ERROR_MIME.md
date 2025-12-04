# Solución al Error de MIME Type

## Problema
Los archivos estáticos de Next.js (JavaScript, CSS) no se están cargando correctamente, mostrando errores de MIME type.

## Solución

### Paso 1: Detener el servidor de desarrollo
Si tienes el servidor corriendo, deténlo con `Ctrl+C` en la terminal donde está corriendo.

### Paso 2: Limpiar la caché
Ya se limpió el directorio `.next`, pero puedes verificar que no exista:
```powershell
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
```

### Paso 3: Reiniciar el servidor de desarrollo
```powershell
npm run dev
```

### Paso 4: Limpiar la caché del navegador
- Presiona `Ctrl+Shift+Delete`
- Selecciona "Caché" o "Cached images and files"
- Limpia los últimos 24 horas
- O mejor aún, usa **Modo Incógnito** para probar

### Paso 5: Verificar que funcione
Abre `http://localhost:3000` en modo incógnito o con la caché limpia.

## Si el problema persiste

1. Verifica que no haya otros procesos usando el puerto 3000:
```powershell
netstat -ano | findstr :3000
```

2. Si hay un proceso, termínalo:
```powershell
taskkill /PID <PID_NUMBER> /F
```

3. Reinicia el servidor:
```powershell
npm run dev
```

## Nota
El archivo `next.config.js` tiene `output: 'standalone'` comentado, lo cual está correcto para desarrollo. Esto solo debe estar activo en producción si usas el modo standalone.

