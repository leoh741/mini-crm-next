import mongoose from 'mongoose';

// Usar MONGODB_URI de env o fallback a localhost con base crm
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm';

// Asegurar que la URI apunte a la base 'crm'
let finalMongoURI = MONGODB_URI;
// Extraer la parte antes de la query string o fragmento
const uriParts = finalMongoURI.split('?');
const baseUri = uriParts[0];
const queryString = uriParts[1] ? '?' + uriParts[1] : '';

// Verificar si ya tiene una base de datos especificada
if (!baseUri.match(/\/[^\/]+$/)) {
  // No tiene base de datos, agregar /crm
  if (baseUri.endsWith('/')) {
    finalMongoURI = baseUri + 'crm' + queryString;
  } else {
    finalMongoURI = baseUri + '/crm' + queryString;
  }
} else {
  // Ya tiene base de datos, verificar si es 'crm', si no, reemplazar
  const currentDb = baseUri.split('/').pop();
  if (currentDb !== 'crm') {
    // Reemplazar la base de datos actual por 'crm'
    finalMongoURI = baseUri.replace(/\/[^\/]+$/, '/crm') + queryString;
    console.warn(`[MongoDB] Base de datos en URI cambiada de '${currentDb}' a 'crm'`);
  }
}

if (!process.env.MONGODB_URI) {
  console.warn('[MongoDB] MONGODB_URI no está definida en las variables de entorno, usando fallback:', finalMongoURI);
} else {
  console.log('[MongoDB] Usando MONGODB_URI de variables de entorno');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  console.log('[MongoDB] Conectando a:', finalMongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Ocultar credenciales en logs

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
      wtimeoutMS: 3000, // Timeout de escritura reducido
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

    cached.promise = mongoose.connect(finalMongoURI, opts).then((mongoose) => {
      // Configurar eventos de conexión para debugging
      mongoose.connection.on('connected', () => {
        console.log('[MongoDB] Conectado exitosamente a la base:', mongoose.connection.db?.databaseName || 'N/A');
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
      console.error('[MongoDB] Error de conexión:', error);
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

