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
    
    // Normalizar nombre de carpeta para búsqueda (intentar variaciones comunes)
    let variacionesCarpeta = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Agregar variaciones específicas para carpetas comunes
    if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
      variacionesCarpeta.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
    } else if (carpeta === "Drafts" || carpeta === "drafts" || carpeta === "DRAFTS") {
      variacionesCarpeta.push("Draft", "DRAFT", "draft", "Borradores", "BORRADORES", "borradores");
    } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
      variacionesCarpeta.push("Junk", "JUNK", "junk", "Correo no deseado");
    } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
      variacionesCarpeta.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
    }
    
    // Primero intentar obtener la lista cacheada (buscar por carpeta y limit exacto primero)
    let cached = null;
    for (const variacion of variacionesCarpeta) {
      cached = await EmailListCache.findOne({ 
        carpeta: variacion,
        limit: limit // Buscar limit exacto primero
      })
      .sort({ updatedAt: -1 }) // Más reciente primero (usar updatedAt en lugar de createdAt)
      .lean();
      
      if (cached) break;
    }
    
    // Si no se encuentra con limit exacto, buscar cualquier lista de esa carpeta (con variaciones)
    if (!cached) {
      for (const variacion of variacionesCarpeta) {
        cached = await EmailListCache.findOne({ 
          carpeta: variacion
          // Sin filtro de limit para encontrar cualquier lista de esa carpeta
        })
        .sort({ updatedAt: -1 }) // Más reciente primero
        .lean();
        
        if (cached) break;
      }
    }
    
    // Helper para normalizar correo: priorizar campos seen e important sobre flags
    const normalizarCorreo = (correo) => {
      if (!correo) return correo;
      // Priorizar siempre el campo seen que guardamos en MongoDB con markAsSeen
      // Usar flags.includes('\\Seen') solo como fallback
      const seen = correo.seen ?? 
                   (Array.isArray(correo.flags) && correo.flags.includes('\\Seen')) ?? 
                   false;
      // Priorizar campo important, usar flags.includes('\\Flagged') como fallback
      const important = correo.important ?? 
                        (Array.isArray(correo.flags) && correo.flags.includes('\\Flagged')) ?? 
                        false;
      return {
        ...correo,
        seen: !!seen,
        leido: !!seen, // Mantener compatibilidad
        important: !!important,
      };
    };

    // CRÍTICO: Retornar cache incluso si está vacío (para evitar "sincronizando" cada vez)
    if (cached && cached.mensajes !== undefined) {
      // Retornar solo los primeros 'limit' correos (puede ser array vacío)
      // Normalizar correos: priorizar campos seen e important sobre flags
      // 🔴 VALIDACIÓN CRÍTICA: Filtrar correos sin metadata mínima al leer del cache
      const mensajes = cached.mensajes
        .slice(0, limit)
        .map(normalizarCorreo)
        .filter(m => tieneMetadataMinima(m)); // Filtrar correos "fantasma"
      
      const descartados = cached.mensajes.length - mensajes.length;
      if (descartados > 0) {
        console.log(`🚫 ${descartados} correo(s) sin metadata válida descartado(s) del cache de lista. Carpeta: ${carpeta}`);
      }
      
      console.log(`✅ Lista de correos encontrada en cache persistente! Carpeta: ${carpeta}, Correos: ${mensajes.length}`);
      return mensajes; // Retornar incluso si está vacío (después de filtrar)
    }
    
    // Si no hay lista cacheada, intentar reconstruir desde el cache individual
    // Esto es útil si la lista expiró pero los correos individuales siguen en cache
    try {
      const EmailCache = getEmailCacheModel();
      // Buscar usando todas las variaciones de la carpeta
      const correosIndividuales = await EmailCache.find({ 
        carpeta: { $in: variacionesCarpeta }
      })
        .sort({ 'mensaje.date': -1 })
        .limit(limit)
        .lean();
      
      if (correosIndividuales && correosIndividuales.length > 0) {
        // Reconstruir la lista desde los correos individuales
        // Normalizar correos: priorizar campos seen e important sobre flags
        // 🔴 VALIDACIÓN CRÍTICA: Filtrar correos sin metadata mínima al reconstruir
        const mensajesReconstruidos = correosIndividuales
          .map(c => c.mensaje)
          .filter(m => m) // Filtrar nulos
          .filter(m => tieneMetadataMinima(m)) // Filtrar correos "fantasma"
          .map(normalizarCorreo)
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
 * Valida que un correo tenga metadata mínima
 * Helper para filtrar correos "fantasma" antes de guardar listas
 */
function tieneMetadataMinima(mensaje) {
  if (!mensaje) return false;
  
  // Debe tener AL MENOS uno de estos campos con valor real:
  const tieneRemitente = mensaje.from && 
                         mensaje.from.trim() !== '' && 
                         mensaje.from !== 'Sin remitente';
  
  const tieneAsunto = mensaje.subject && 
                      mensaje.subject.trim() !== '' && 
                      mensaje.subject !== '(Sin asunto)';
  
  const tieneFecha = mensaje.date && 
                     mensaje.date instanceof Date && 
                     !isNaN(mensaje.date.getTime());
  
  // Debe tener al menos uno de los tres
  return tieneRemitente || tieneAsunto || tieneFecha;
}

/**
 * Guarda la lista de correos en el cache persistente
 * IMPORTANTE: Filtra correos sin metadata mínima antes de guardar
 * para evitar correos "fantasma" en la lista cuando hay errores de conexión IMAP
 */
export async function guardarListaEnCache(carpeta, mensajes, limit = 10) {
  try {
    await connectDB();
    
    // 🔴 VALIDACIÓN CRÍTICA: Filtrar correos sin metadata mínima antes de guardar
    // Esto previene correos "fantasma" (Sin remitente / Sin asunto) en la lista
    const mensajesFiltrados = Array.isArray(mensajes) 
      ? mensajes.filter(m => tieneMetadataMinima(m))
      : [];
    
    // Si después de filtrar quedan menos correos, loguear cuántos se descartaron
    if (mensajesFiltrados.length < mensajes.length) {
      const descartados = mensajes.length - mensajesFiltrados.length;
      console.log(`🚫 Descartando ${descartados} correo(s) vacío(s) de la lista antes de guardar en cache. Carpeta: ${carpeta}`);
    }
    
    // Actualizar o crear - usar new: true para retornar el documento actualizado
    const resultado = await EmailListCache.findOneAndUpdate(
      { carpeta, limit },
      {
        carpeta,
        mensajes: mensajesFiltrados, // Guardar solo correos con metadata válida
        limit,
        updatedAt: new Date(),
        createdAt: new Date(), // Actualizar también createdAt para evitar expiración prematura
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    console.log(`💾 Lista de correos guardada en cache persistente: ${carpeta} (${mensajesFiltrados.length} correos válidos de ${mensajes.length} totales)`);
    
    // Verificar inmediatamente que se guardó correctamente
    const verificado = await EmailListCache.findOne({ carpeta, limit }).lean();
    if (verificado && verificado.mensajes && verificado.mensajes.length > 0) {
      console.log(`✅ Verificación inmediata: Lista disponible con ${verificado.mensajes.length} correos`);
    } else {
      console.warn(`⚠️ Advertencia: Lista guardada pero no encontrada en verificación inmediata`);
    }
    
    return resultado;
  } catch (error) {
    console.warn(`⚠️ Error al guardar lista en cache persistente: ${error.message}`);
    // No lanzar error - el cache es opcional
    return null;
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

