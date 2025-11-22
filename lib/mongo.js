import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[MongoDB] ERROR: MONGODB_URI no está definida en las variables de entorno');
  console.error('[MongoDB] Por favor, configura MONGODB_URI en Vercel: Settings → Environment Variables');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // Verificar que MONGODB_URI esté definida
  if (!MONGODB_URI) {
    const errorMsg = 'MONGODB_URI no está configurada. Por favor, agrega la variable de entorno MONGODB_URI en Vercel (Settings → Environment Variables).';
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
      maxPoolSize: 10, // Mantener hasta 10 conexiones en el pool
      serverSelectionTimeoutMS: 5000, // Timeout reducido a 5 segundos para fail rápido
      socketTimeoutMS: 45000,
      family: 4, // Usar IPv4 para conexiones más rápidas
      // Optimizaciones para Vercel/serverless
      retryWrites: true,
      w: 'majority',
      // Timeouts optimizados
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      // Compresión para reducir latencia (disponible en MongoDB 3.4+)
      compressors: ['zlib'],
      // Minimizar round trips
      maxIdleTimeMS: 30000,
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
        ? `No se pudo conectar a MongoDB. Verifica que MONGODB_URI sea correcta y que tu IP esté permitida en MongoDB Atlas. Error: ${error.message}`
        : `Error de conexión a MongoDB: ${error.message}. Verifica que MONGODB_URI esté configurada correctamente.`;
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

