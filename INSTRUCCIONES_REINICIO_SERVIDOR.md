# Instrucciones para Reiniciar el Servidor

## Problema
El servidor estaba devolviendo errores 404 porque necesitaba ser reiniciado después de limpiar la caché.

## Solución

### Paso 1: Verificar que no hay procesos bloqueando el puerto
El proceso anterior (PID 14244) ya fue detenido. Verifica que no haya otros:
```powershell
netstat -ano | findstr :3000
```

Si aparece algún proceso, termínalo:
```powershell
taskkill /PID <PID_NUMBER> /F
```

### Paso 2: Reiniciar el servidor de desarrollo
```powershell
npm run dev
```

Espera a que veas el mensaje:
```
✓ Ready in X.XXs
○ Local:        http://localhost:3000
```

### Paso 3: Limpiar caché del navegador
- **Opción 1 (Recomendada):** Abre en **Modo Incógnito**
  - Chrome/Edge: `Ctrl+Shift+N`
  - Firefox: `Ctrl+Shift+P`

- **Opción 2:** Limpia la caché manualmente
  - Presiona `Ctrl+Shift+Delete`
  - Selecciona "Caché" o "Cached images and files"
  - Limpia los últimos 24 horas

### Paso 4: Recargar la página
- Presiona `Ctrl+F5` (recarga forzada)
- O `Ctrl+Shift+R`

### Paso 5: Verificar que funcione
Deberías ver la aplicación cargando correctamente en `http://localhost:3000`

## Notas Importantes

1. **Archivos requests.js y traffic.js:** Estos archivos que aparecen en la consola NO son parte del proyecto. Probablemente son de alguna extensión del navegador o script externo. Puedes ignorarlos.

2. **Directorio .next:** Ya fue limpiado. Se regenerará automáticamente al iniciar el servidor.

3. **Errores de MIME type:** Si aún ves errores de MIME type después de reiniciar, asegúrate de:
   - Usar modo incógnito
   - O limpiar completamente la caché del navegador
   - Y recargar con `Ctrl+F5`

## Si el problema persiste

1. Verifica que Node.js esté instalado:
```powershell
node --version
npm --version
```

2. Reinstala las dependencias:
```powershell
npm install
```

3. Intenta usar otro puerto:
```powershell
npm run dev -- -p 3001
```

Luego accede a `http://localhost:3001`

