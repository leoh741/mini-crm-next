import mongoose from 'mongoose';

// Usar MONGODB_URI de env o fallback a localhost con base mini-crm
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';

// PROTECCIÓN: Detectar si estamos en modo desarrollo
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isLocalDev = isDevelopment && (process.env.NEXT_PUBLIC_BASE_URL?.includes('localhost') || 
                                     process.env.NEXT_PUBLIC_BASE_URL?.includes('127.0.0.1') ||
                                     !process.env.NEXT_PUBLIC_BASE_URL);

// RESPETAR la base de datos especificada en la URI - NO forzar cambio
let finalMongoURI = MONGODB_URI;
// Extraer la parte antes de la query string o fragmento
const uriParts = finalMongoURI.split('?');
const baseUri = uriParts[0];
const queryString = uriParts[1] ? '?' + uriParts[1] : '';

// Verificar si ya tiene una base de datos especificada
if (!baseUri.match(/\/[^\/]+$/)) {
  // No tiene base de datos, agregar /mini-crm como fallback
  if (baseUri.endsWith('/')) {
    finalMongoURI = baseUri + 'mini-crm' + queryString;
  } else {
    finalMongoURI = baseUri + '/mini-crm' + queryString;
  }
}
// IMPORTANTE: Respetar el nombre de base de datos en la URI original
// No forzar cambios automáticos - usar la que está configurada

// Extraer información de la URI para validaciones
const dbName = baseUri.split('/').pop() || 'mini-crm';
const isRemoteMongo = !baseUri.includes('localhost') && !baseUri.includes('127.0.0.1') && 
                      !baseUri.startsWith('mongodb://localhost') && 
                      !baseUri.startsWith('mongodb://127.0.0.1');

// PROTECCIÓN CRÍTICA: Advertir si estamos en desarrollo local pero conectando a MongoDB remoto (VPS)
if (isLocalDev && isRemoteMongo) {
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('⚠️  ADVERTENCIA CRÍTICA DE SEGURIDAD ⚠️');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('Estás ejecutando en MODO DESARROLLO LOCAL pero conectando a');
  console.error('una base de datos REMOTA (probablemente del VPS).');
  console.error('');
  console.error('Esto es PELIGROSO porque:');
  console.error('1. Cualquier operación destructiva (importar backup, etc.)');
  console.error('   afectará los datos del VPS en producción');
  console.error('2. Podrías borrar accidentalmente todos los datos del VPS');
  console.error('');
  console.error('Base de datos a la que te estás conectando:', dbName);
  console.error('URI (oculta):', finalMongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  console.error('');
  console.error('SOLUCIÓN:');
  console.error('1. Crea un archivo .env.local con una base de datos LOCAL diferente:');
  console.error('   MONGODB_URI=mongodb://localhost:27017/mini-crm-dev');
  console.error('2. O usa una base de datos completamente diferente para desarrollo');
  console.error('═══════════════════════════════════════════════════════════════');
}

if (!process.env.MONGODB_URI) {
  console.warn('[MongoDB] MONGODB_URI no está definida en las variables de entorno, usando fallback:', finalMongoURI);
  if (isLocalDev) {
    console.warn('[MongoDB] ⚠️  Usando base de datos local para desarrollo. Esto es correcto.');
  }
} else {
  // Mostrar qué base de datos se está usando
  console.log(`[MongoDB] Usando MONGODB_URI de variables de entorno - Base de datos: '${dbName}'`);
  if (isLocalDev && isRemoteMongo) {
    console.error('[MongoDB] ⚠️  PELIGRO: Desarrollo local conectando a base de datos remota!');
  }
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Exportar función para verificar si estamos en desarrollo local conectando a remoto
export function isLocalDevConnectingToRemote() {
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  const isLocal = isDev && (process.env.NEXT_PUBLIC_BASE_URL?.includes('localhost') || 
                           process.env.NEXT_PUBLIC_BASE_URL?.includes('127.0.0.1') ||
                           !process.env.NEXT_PUBLIC_BASE_URL);
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mini-crm';
  const isRemote = !uri.includes('localhost') && !uri.includes('127.0.0.1') && 
                   !uri.startsWith('mongodb://localhost') && 
                   !uri.startsWith('mongodb://127.0.0.1');
  return isLocal && isRemote;
}

async function connectDB() {
  // Si ya hay una conexión establecida y está lista, reutilizarla (sin loguear)
  if (cached.conn) {
    // Verificar que la conexión esté activa
    if (mongoose.connection.readyState === 1) {
      return cached.conn;
    } else {
      // Si la conexión se perdió, limpiar y reconectar
      console.log('[MongoDB] Conexión perdida, reconectando...');
      cached.conn = null;
      cached.promise = null;
    }
  }

  // Si hay una promesa de conexión en curso, esperarla
  if (!cached.promise) {
    // Solo loguear cuando realmente se está conectando (no cuando se reutiliza)
    console.log('[MongoDB] Conectando a:', finalMongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Ocultar credenciales en logs
    
    // Optimizaciones para servidor VPS local con MongoDB en el mismo servidor
    const opts = {
      bufferCommands: false, // Desactivar buffering de comandos
      // Pool de conexiones optimizado para servidor local (sin latencia de red)
      maxPoolSize: 10, // Reducir a 10 para evitar demasiadas conexiones
      minPoolSize: 2, // Reducir a 2 conexiones mínimas
      // Timeouts optimizados para servidor local (mucho más rápidos)
      serverSelectionTimeoutMS: 1000, // 1 segundo es suficiente para localhost
      socketTimeoutMS: 30000, // Aumentar a 30 segundos para evitar timeouts
      connectTimeoutMS: 2000, // 2 segundos para conexión local
      // Optimizaciones de escritura
      retryWrites: true,
      w: 'majority', // PROTECCIÓN: Usar 'majority' para asegurar persistencia (era 1)
      wtimeoutMS: 10000, // Aumentar timeout de escritura a 10 segundos
      journal: true, // Asegurar que se escriba al journal
      // Heartbeat menos frecuente para reducir reconexiones
      heartbeatFrequencyMS: 30000, // Aumentar a 30 segundos (era 10)
      // Compresión deshabilitada para servidor local (mejor rendimiento sin compresión)
      // compressors: ['zlib'], // Comentado: no necesario en local
      // Maximizar tiempo de vida de conexiones
      maxIdleTimeMS: 300000, // Aumentar a 5 minutos (era 1 minuto)
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

