// Sistema de cache persistente para la lista de correos en MongoDB
// Almacena las listas de correos por carpeta para acceso ultra-rápido

import mongoose from 'mongoose';
import connectDB from './mongo.js';

// Schema para cache de listas de correos
const EmailListCacheSchema = new mongoose.Schema({
  carpeta: { type: String, required: true, index: true },
  mensajes: [{
    uid: Number,
    subject: String,
    from: String,
    date: Date,
    to: String,
    text: String,
    html: String,
    flags: [String],
    leido: Boolean,
    preview: String,
  }],
  limit: { type: Number, default: 10 },
  createdAt: { type: Date, default: Date.now, index: true, expires: 5 * 60 }, // TTL: 5 minutos
  updatedAt: { type: Date, default: Date.now },
}, {
  // Índice compuesto para búsquedas rápidas
});

EmailListCacheSchema.index({ carpeta: 1, createdAt: -1 });

const EmailListCache = mongoose.models.EmailListCache || mongoose.model('EmailListCache', EmailListCacheSchema);

/**
 * Obtiene la lista de correos del cache persistente
 */
export async function obtenerListaDelCache(carpeta, limit = 10) {
  try {
    await connectDB();
    
    const cached = await EmailListCache.findOne({ 
      carpeta,
      limit: { $gte: limit } // Si el cache tiene más o igual correos, usarlo
    })
    .sort({ createdAt: -1 }) // Más reciente primero
    .lean();
    
    if (cached && cached.mensajes && cached.mensajes.length >= limit) {
      // Retornar solo los primeros 'limit' correos
      const mensajes = cached.mensajes.slice(0, limit);
      console.log(`✅ Lista de correos encontrada en cache persistente! Carpeta: ${carpeta}, Correos: ${mensajes.length}`);
      return mensajes;
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ Error al buscar lista en cache persistente: ${error.message}`);
    return null;
  }
}

/**
 * Guarda la lista de correos en el cache persistente
 */
export async function guardarListaEnCache(carpeta, mensajes, limit = 10) {
  try {
    await connectDB();
    
    // Actualizar o crear
    await EmailListCache.findOneAndUpdate(
      { carpeta, limit },
      {
        carpeta,
        mensajes,
        limit,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    
    console.log(`💾 Lista de correos guardada en cache persistente: ${carpeta} (${mensajes.length} correos)`);
  } catch (error) {
    console.warn(`⚠️ Error al guardar lista en cache persistente: ${error.message}`);
    // No lanzar error - el cache es opcional
  }
}

/**
 * Limpia el cache de una carpeta específica
 */
export async function limpiarCacheListaCarpeta(carpeta) {
  try {
    await connectDB();
    const result = await EmailListCache.deleteMany({ carpeta });
    console.log(`🧹 Limpiado cache de lista de carpeta ${carpeta}: ${result.deletedCount} entradas`);
    return result.deletedCount;
  } catch (error) {
    console.warn(`⚠️ Error al limpiar cache de lista: ${error.message}`);
    return 0;
  }
}

