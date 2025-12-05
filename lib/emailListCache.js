// Sistema de cache persistente para la lista de correos en MongoDB
// Almacena las listas de correos por carpeta para acceso ultra-rápido

import mongoose from 'mongoose';
import connectDB from './mongo.js';

// Importar el schema de EmailCache para reconstruir listas
let EmailCacheModel = null;
function getEmailCacheModel() {
  if (!EmailCacheModel) {
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
        flags: [String],
        leido: Boolean,
      },
      incluyeContenido: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now, index: true },
      updatedAt: { type: Date, default: Date.now },
    }, { strict: false });
    
    EmailCacheModel = mongoose.models.EmailCache || mongoose.model('EmailCache', EmailCacheSchema);
  }
  return EmailCacheModel;
}

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
  createdAt: { type: Date, default: Date.now, index: true, expires: 30 * 60 }, // TTL: 30 minutos (aumentado para mejor rendimiento)
  updatedAt: { type: Date, default: Date.now },
}, {
  // Índice compuesto para búsquedas rápidas
});

EmailListCacheSchema.index({ carpeta: 1, createdAt: -1 });

const EmailListCache = mongoose.models.EmailListCache || mongoose.model('EmailListCache', EmailListCacheSchema);

/**
 * Obtiene la lista de correos del cache persistente
 * Ahora también intenta reconstruir la lista desde el cache individual si la lista expiró
 */
export async function obtenerListaDelCache(carpeta, limit = 10) {
  try {
    await connectDB();
    
    // Primero intentar obtener la lista cacheada
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
    
    // Si no hay lista cacheada, intentar reconstruir desde el cache individual
    // Esto es útil si la lista expiró pero los correos individuales siguen en cache
    try {
      const EmailCache = getEmailCacheModel();
      const correosIndividuales = await EmailCache.find({ carpeta })
        .sort({ 'mensaje.date': -1 })
        .limit(limit)
        .lean();
      
      if (correosIndividuales && correosIndividuales.length > 0) {
        // Reconstruir la lista desde los correos individuales
        const mensajesReconstruidos = correosIndividuales
          .map(c => c.mensaje)
          .filter(m => m) // Filtrar nulos
          .slice(0, limit);
        
        if (mensajesReconstruidos.length > 0) {
          console.log(`✅ Lista reconstruida desde cache individual! Carpeta: ${carpeta}, Correos: ${mensajesReconstruidos.length}`);
          return mensajesReconstruidos;
        }
      }
    } catch (reconstructError) {
      // Si falla la reconstrucción, continuar normalmente
      console.warn(`⚠️ Error reconstruyendo lista desde cache individual: ${reconstructError.message}`);
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

