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
    const opts = {
      bufferCommands: false, // Desactivar buffering de comandos
      maxPoolSize: 5, // Reducido para MongoDB Free (menos conexiones = más rápido)
      minPoolSize: 1, // Mantener al menos 1 conexión activa
      serverSelectionTimeoutMS: 3000, // Timeout reducido a 3 segundos para fail rápido
      socketTimeoutMS: 30000, // Reducido de 45s a 30s
      family: 4, // Usar IPv4 para conexiones más rápidas
      // Optimizaciones para MongoDB Free Tier
      retryWrites: true,
      w: 1, // Cambiar de 'majority' a 1 para MongoDB Free (más rápido, menos consistencia)
      wtimeout: 5000, // Timeout de escritura de 5 segundos
      // Timeouts optimizados para Free Tier
      connectTimeoutMS: 5000, // Reducido de 10s a 5s
      heartbeatFrequencyMS: 15000, // Aumentado para reducir latencia
      // Compresión para reducir latencia
      compressors: ['zlib'],
      // Minimizar round trips
      maxIdleTimeMS: 45000, // Aumentado para mantener conexiones más tiempo
      // Optimizaciones adicionales para Free Tier
      readPreference: 'primary', // Leer siempre del primario (más rápido en Free Tier)
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

