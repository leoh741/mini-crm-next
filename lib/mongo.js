import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[MongoDB] ERROR: MONGODB_URI no está definida en las variables de entorno');
  console.error('[MongoDB] Por favor, configura MONGODB_URI en el archivo .env.local o variables de entorno del sistema');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // Verificar que MONGODB_URI esté definida
  if (!MONGODB_URI) {
    const errorMsg = 'MONGODB_URI no está configurada. Por favor, agrega la variable de entorno MONGODB_URI en el archivo .env.local o variables de entorno del sistema.';
    console.error('[MongoDB]', errorMsg);
    throw new Error(errorMsg);
  }

  // Si ya hay una conexión establecida y está lista, reutilizarla
  if (cached.conn) {
    // Verificar que la conexión esté activa
    if (mongoose.connection.readyState === 1) {
      return cached.conn;
    } else {
      // Si la conexión se perdió, limpiar y reconectar
      cached.conn = null;
      cached.promise = null;
    }
  }

  // Si hay una promesa de conexión en curso, esperarla
  if (!cached.promise) {
    // Optimizaciones para servidor VPS local con MongoDB en el mismo servidor
    const opts = {
      bufferCommands: false, // Desactivar buffering de comandos
      // Pool de conexiones optimizado para servidor local (sin latencia de red)
      maxPoolSize: 20, // Más conexiones permitidas en servidor local
      minPoolSize: 5, // Mantener más conexiones activas para respuesta rápida
      // Timeouts optimizados para servidor local (mucho más rápidos)
      serverSelectionTimeoutMS: 1000, // 1 segundo es suficiente para localhost
      socketTimeoutMS: 20000, // 20 segundos suficiente para local
      connectTimeoutMS: 2000, // 2 segundos para conexión local
      // Optimizaciones de escritura
      retryWrites: true,
      w: 1, // Write concern 1 para máximo rendimiento en servidor local
      wtimeout: 3000, // Timeout de escritura reducido
      // Heartbeat más frecuente para detección rápida de problemas
      heartbeatFrequencyMS: 10000, // 10 segundos
      // Compresión deshabilitada para servidor local (mejor rendimiento sin compresión)
      // compressors: ['zlib'], // Comentado: no necesario en local
      // Maximizar tiempo de vida de conexiones
      maxIdleTimeMS: 60000, // 1 minuto - mantener conexiones más tiempo
      // Leer siempre del primario (único servidor en local)
      readPreference: 'primary',
      // Optimizaciones de red para localhost
      family: 4, // IPv4
      // Deshabilitar autoIndex en producción (índices ya creados)
      autoIndex: false, // Mejora rendimiento - asume índices ya creados
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      // Configurar eventos de conexión para debugging
      mongoose.connection.on('connected', () => {
        console.log('[MongoDB] Conectado exitosamente');
      });
      
      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB] Error de conexión:', err);
        cached.conn = null;
        cached.promise = null;
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('[MongoDB] Desconectado');
        cached.conn = null;
        cached.promise = null;
      });
      
      return mongoose;
    }).catch((error) => {
      console.error('[MongoDB] Error de conexión:', error.message);
      cached.promise = null;
      const errorMsg = error.message.includes('MongoNetworkError') || error.message.includes('ENOTFOUND')
        ? `No se pudo conectar a MongoDB. Verifica que MONGODB_URI sea correcta y que MongoDB esté corriendo. Error: ${error.message}`
        : `Error de conexión a MongoDB: ${error.message}. Verifica que MONGODB_URI esté configurada correctamente y que MongoDB esté corriendo.`;
      throw new Error(errorMsg);
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;

