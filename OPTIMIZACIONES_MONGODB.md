# Optimizaciones de Rendimiento MongoDB + Vercel

## Optimizaciones Implementadas ✅

### 1. **Caché Inteligente**
- **Caché de clientes**: 2 minutos (120 segundos)
- **Caché de estados de pago**: 1 minuto (60 segundos)
- **Caché solo se limpia después de actualizaciones**, no al cargar

### 2. **Timeouts en Requests**
- Timeout de 8-10 segundos en todas las llamadas fetch
- Evita que el usuario espere indefinidamente
- Usa caché si hay timeout

### 3. **Connection Pooling**
- Pool de hasta 10 conexiones reutilizables
- Verificación de conexión activa antes de usar
- Reconexión automática si se pierde la conexión

### 4. **Queries Optimizadas**
- Uso de `lean()` en todas las queries (hasta 2x más rápido)
- Índices en campos frecuentemente consultados
- Timeouts en queries (maxTimeMS: 5000)

### 5. **Eliminación de Llamadas Innecesarias**
- Ya no se busca en todos los clientes si falla getClienteById
- No se limpia caché al cargar, solo al actualizar

## Recomendaciones Adicionales para Vercel + MongoDB Atlas

### ⚠️ **CRÍTICO: Verificar Región de MongoDB Atlas**

1. **En MongoDB Atlas:**
   - Ve a tu cluster → "Configuration" → "Network Access"
   - Verifica en qué región está tu cluster (ej: us-east-1, sa-east-1, etc.)

2. **En Vercel:**
   - Ve a Settings → Functions → Region
   - Asegúrate de que la región de Vercel sea la **más cercana posible** a tu cluster de MongoDB
   
   **Ejemplo:** Si MongoDB está en `sa-east-1` (São Paulo), configura Vercel para usar `South America (São Paulo)`

### 📊 **Optimizaciones de MongoDB Atlas**

1. **Upgrade del Plan** (si es necesario):
   - Los planes gratuitos tienen más latencia
   - Considera un plan M0/M2 para mejor rendimiento

2. **Connection String:**
   - Asegúrate de usar el connection string correcto con retryWrites
   - Formato: `mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority`

3. **Network Access:**
   - Permite `0.0.0.0/0` temporalmente para Vercel (o mejor, agrega las IPs de Vercel)
   - Las funciones serverless de Vercel pueden cambiar de IP

### 🔧 **Configuración de Vercel**

1. **Variables de Entorno:**
   - Verifica que `MONGODB_URI` esté configurada correctamente
   - Sin espacios extras o caracteres especiales

2. **Function Timeout:**
   - Por defecto Vercel tiene timeout de 10s en plan Hobby
   - Considera actualizar si necesitas más tiempo (o mejor, optimiza más)

3. **Edge Functions** (opcional):
   - Para operaciones simples, considera usar Edge Functions
   - Son más rápidas pero tienen limitaciones con Mongoose

### 📈 **Monitoreo**

1. **MongoDB Atlas:**
   - Revisa las métricas de conexión en Atlas
   - Verifica si hay muchas conexiones simultáneas

2. **Vercel Analytics:**
   - Habilita Vercel Analytics para ver tiempos de respuesta
   - Identifica qué rutas son más lentas

## Cambios Aplicados en el Código

✅ Caché aumentado a 2 minutos
✅ Caché para estados de pago mensual
✅ Timeouts en todas las requests (8-10s)
✅ Eliminadas limpiezas de caché innecesarias
✅ Optimización de getClienteById
✅ Connection pooling mejorado
✅ Índices agregados en modelos

## Próximos Pasos Recomendados

1. **Verificar región de MongoDB Atlas vs Vercel**
2. **Monitorear tiempos de respuesta después de los cambios**
3. **Considerar Redis** si el problema persiste (para caché más robusto)
4. **Implementar paginación** si hay muchos clientes

