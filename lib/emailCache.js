// Sistema de cache persistente para correos electrónicos en MongoDB
// Almacena los últimos correos para acceso ultra-rápido

import mongoose from 'mongoose';
import connectDB from './mongo.js';

// Schema para cache de correos
const EmailCacheSchema = new mongoose.Schema({
  uid: { type: Number, required: true, index: true },
  carpeta: { type: String, required: true, index: true },
  cacheKey: { type: String, required: true, unique: true, index: true },
  mensaje: {
    uid: Number,
    subject: String,
    from: String,
    date: Date,
    to: String,
    text: String,
    html: String,
    attachments: [{
      filename: String,
      contentType: String,
      size: Number,
      contentId: String,
      content: String, // Base64
    }],
    flags: [String],
    leido: Boolean,
  },
  incluyeContenido: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true, expires: 7 * 24 * 60 * 60 }, // TTL: 7 días
  updatedAt: { type: Date, default: Date.now },
});

// Índice compuesto para búsquedas rápidas
EmailCacheSchema.index({ uid: 1, carpeta: 1 });
EmailCacheSchema.index({ createdAt: -1 }); // Para limpieza de correos antiguos

const EmailCache = mongoose.models.EmailCache || mongoose.model('EmailCache', EmailCacheSchema);

// Máximo de correos a mantener en cache (últimos 100)
const MAX_CACHE_SIZE = 100;

/**
 * Obtiene un correo del cache persistente
 * Optimizado con índices para búsqueda ultra-rápida
 */
export async function obtenerCorreoDelCache(uid, carpeta, incluirContenido = false) {
  try {
    await connectDB();
    const cacheKey = `${uid}-${carpeta}`;
    
    // Normalizar nombre de carpeta para búsqueda (intentar variaciones comunes)
    // Esto asegura que "SPAM" y "spam" encuentren el mismo cache
    const variacionesCarpeta = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Buscar con variaciones del nombre de carpeta
    let cached = null;
    for (const variacion of variacionesCarpeta) {
      cached = await EmailCache.findOne({ 
        uid: Number(uid),
        carpeta: variacion 
      }).lean();
      
      if (cached) break;
    }
    
    if (cached) {
      // Si se solicita contenido pero el cache no lo tiene, no usar cache
      if (incluirContenido && !cached.incluyeContenido) {
        return null;
      }
      
      // Si no se solicita contenido, usar cache aunque no tenga contenido
      if (!incluirContenido) {
        console.log(`✅ Correo encontrado en cache persistente! UID: ${uid}, Carpeta: ${carpeta}`);
        return cached.mensaje;
      }
      
      // Si se solicita contenido y el cache lo tiene
      if (incluirContenido && cached.incluyeContenido) {
        console.log(`✅ Correo con contenido encontrado en cache persistente! UID: ${uid}, Carpeta: ${carpeta}`);
        return cached.mensaje;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ Error al buscar en cache persistente: ${error.message}`);
    return null;
  }
}

/**
 * Guarda un correo en el cache persistente
 */
export async function guardarCorreoEnCache(uid, carpeta, mensaje, incluirContenido = false) {
  try {
    await connectDB();
    const cacheKey = `${uid}-${carpeta}`;
    
    // Actualizar o crear
    await EmailCache.findOneAndUpdate(
      { cacheKey },
      {
        uid,
        carpeta,
        cacheKey,
        mensaje,
        incluyeContenido: incluirContenido, // Corregir: usar el parámetro incluirContenido
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    
    console.log(`💾 Correo guardado en cache persistente (${incluirContenido ? 'con' : 'sin'} contenido)`);
    
    // Limpiar correos antiguos si hay más de MAX_CACHE_SIZE
    const count = await EmailCache.countDocuments();
    if (count > MAX_CACHE_SIZE) {
      const toDelete = count - MAX_CACHE_SIZE;
      const oldest = await EmailCache.find()
        .sort({ createdAt: 1 })
        .limit(toDelete)
        .select('_id');
      
      if (oldest.length > 0) {
        await EmailCache.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
        console.log(`🧹 Limpiados ${oldest.length} correos antiguos del cache`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error al guardar en cache persistente: ${error.message}`);
    // No lanzar error - el cache es opcional
  }
}

/**
 * Limpia el cache de una carpeta específica
 */
export async function limpiarCacheCarpeta(carpeta) {
  try {
    await connectDB();
    const result = await EmailCache.deleteMany({ carpeta });
    console.log(`🧹 Limpiado cache de carpeta ${carpeta}: ${result.deletedCount} correos`);
    return result.deletedCount;
  } catch (error) {
    console.warn(`⚠️ Error al limpiar cache: ${error.message}`);
    return 0;
  }
}

/**
 * Limpia todo el cache
 */
export async function limpiarTodoElCache() {
  try {
    await connectDB();
    const result = await EmailCache.deleteMany({});
    console.log(`🧹 Limpiado todo el cache: ${result.deletedCount} correos`);
    return result.deletedCount;
  } catch (error) {
    console.warn(`⚠️ Error al limpiar todo el cache: ${error.message}`);
    return 0;
  }
}

