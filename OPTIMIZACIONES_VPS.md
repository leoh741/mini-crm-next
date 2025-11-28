# Optimizaciones para VPS - Mini CRM Next.js

Este documento describe todas las optimizaciones implementadas para mejorar el rendimiento en el VPS.

## ✅ Optimizaciones Implementadas

### 1. Configuración de Next.js (`next.config.js`)

- ✅ **SWC Minifier**: Compilación más rápida
- ✅ **Compresión**: Gzip/Brotli habilitado
- ✅ **Output Standalone**: Build optimizado para VPS
- ✅ **Optimización de imágenes**: AVIF y WebP
- ✅ **Caché mejorado**: Headers de caché optimizados por ruta
- ✅ **Source Maps desactivados**: Mejor rendimiento en producción
- ✅ **Package imports optimizados**: Reducción de bundle size

### 2. Configuración de PM2 (`ecosystem.config.js`)

- ✅ **Límite de memoria**: 800MB (aumentado de 500MB)
- ✅ **Tiempo mínimo de uptime**: 30 segundos
- ✅ **Máximo de reinicios**: 5 (reducido de 10)
- ✅ **Delay entre reinicios**: 10 segundos
- ✅ **Backoff exponencial**: Evita loops de reinicio
- ✅ **Kill timeout**: 5 segundos para cierre limpio

### 3. Conexión a MongoDB (`lib/mongo.js`)

- ✅ **Pool de conexiones optimizado**: 
  - maxPoolSize: 10 (reducido de 20)
  - minPoolSize: 2 (reducido de 5)
- ✅ **Timeouts aumentados**:
  - socketTimeoutMS: 30 segundos
  - wtimeoutMS: 5 segundos
- ✅ **Heartbeat menos frecuente**: 30 segundos (era 10)
- ✅ **Conexiones más persistentes**: maxIdleTimeMS: 5 minutos
- ✅ **Logs optimizados**: Solo loguea cuando realmente conecta

### 4. Optimizaciones de Queries MongoDB

Todas las rutas API ahora tienen:
- ✅ **Timeouts optimizados**: 10-15 segundos según la ruta
- ✅ **Uso de `.lean()`**: Objetos planos sin overhead de Mongoose
- ✅ **Select explícito**: Solo campos necesarios
- ✅ **Índices utilizados**: Queries usan índices existentes
- ✅ **Caché HTTP**: Headers de caché optimizados

### 5. Optimizaciones del Frontend

- ✅ **Página de inicio**: 
  - Actualización cada 2 minutos (era 1 minuto)
  - Eliminación de duplicados eficiente con Map
  - Llamadas condicionales (solo si hay pocas reuniones del día)
- ✅ **Filtro de tareas**: Comparación exacta de fecha sin problemas de zona horaria
- ✅ **Manejo de errores**: Arrays vacíos por defecto para evitar crashes

### 6. Headers de Caché Optimizados

- ✅ **API Clientes**: 120 segundos de caché
- ✅ **API Pagos**: 60 segundos de caché
- ✅ **API General**: 30 segundos de caché
- ✅ **Stale-while-revalidate**: Permite servir contenido obsoleto mientras se actualiza

## 📊 Mejoras de Rendimiento Esperadas

1. **Menos reconexiones a MongoDB**: ~70% reducción
2. **Queries más rápidas**: 20-30% más rápidas con `.lean()`
3. **Menos carga en el servidor**: Actualizaciones cada 2 minutos en lugar de 1
4. **Mejor uso de memoria**: Pool de conexiones reducido
5. **Menos reinicios**: Configuración de PM2 más estable

## 🔧 Comandos de Mantenimiento

```bash
# Reconstruir con optimizaciones
npm run build

# Reiniciar PM2
pm2 restart crm-nextjs

# Verificar estado
pm2 list
pm2 logs crm-nextjs --lines 50

# Monitorear recursos
pm2 monit
```

## 📝 Notas Importantes

- Los timeouts están optimizados para un VPS con MongoDB local
- El pool de conexiones está reducido para evitar sobrecarga
- Los logs de MongoDB solo aparecen cuando realmente se conecta (no en cada request)
- El caché HTTP ayuda a reducir la carga en el servidor

