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

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // Timeout de 10 segundos
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('[MongoDB] Conectado exitosamente');
      return mongoose;
    }).catch((error) => {
      console.error('[MongoDB] Error de conexión:', error.message);
      console.error('[MongoDB] Stack:', error.stack);
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

