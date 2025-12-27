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
    bodyStatus: { type: String, enum: ['ready', 'loading', 'error'], default: 'ready' },
    lastBodyError: String,
    lastBodyAttemptAt: Date,
  },
  incluyeContenido: { type: Boolean, default: false },
  bodyStatus: { type: String, enum: ['ready', 'loading', 'error'], default: 'ready' },
  lastBodyError: String,
  lastBodyAttemptAt: Date,
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
      
      // Normalizar correo: priorizar campos seen e important sobre flags
      const mensaje = cached.mensaje;
      if (mensaje) {
        // 🔴 VALIDACIÓN CRÍTICA: Filtrar correos sin metadata mínima al leer del cache
        // Esto previene mostrar correos "fantasma" que ya están guardados
        if (!tieneMetadataMinima(mensaje)) {
          console.log(`🚫 Correo sin metadata válida encontrado en cache, descartando. UID: ${uid}, Carpeta: ${carpeta}`);
          // Eliminar el correo inválido del cache
          try {
            await EmailCache.deleteOne({ uid: Number(uid), carpeta: cached.carpeta });
            console.log(`🧹 Correo inválido eliminado del cache. UID: ${uid}`);
          } catch (deleteError) {
            console.warn(`⚠️ Error eliminando correo inválido del cache: ${deleteError.message}`);
          }
          return null;
        }
        
        const seen = mensaje.seen ?? 
                     (Array.isArray(mensaje.flags) && mensaje.flags.includes('\\Seen')) ?? 
                     false;
        const important = mensaje.important ?? 
                          (Array.isArray(mensaje.flags) && mensaje.flags.includes('\\Flagged')) ?? 
                          false;
        // Incluir bodyStatus desde el documento cacheado o desde el mensaje
        const bodyStatus = cached.bodyStatus || mensaje.bodyStatus || (cached.incluyeContenido ? 'ready' : 'loading');
        const lastBodyError = cached.lastBodyError || mensaje.lastBodyError || null;
        const lastBodyAttemptAt = cached.lastBodyAttemptAt || mensaje.lastBodyAttemptAt || null;
        
        const mensajeNormalizado = {
          ...mensaje,
          seen: !!seen,
          leido: !!seen, // Mantener compatibilidad
          important: !!important,
          bodyStatus: bodyStatus,
          lastBodyError: lastBodyError,
          lastBodyAttemptAt: lastBodyAttemptAt,
        };
        
        // Si no se solicita contenido, usar cache aunque no tenga contenido
        if (!incluirContenido) {
          console.log(`✅ Correo encontrado en cache persistente! UID: ${uid}, Carpeta: ${carpeta}`);
          return mensajeNormalizado;
        }
        
        // Si se solicita contenido y el cache lo tiene
        if (incluirContenido && cached.incluyeContenido) {
          console.log(`✅ Correo con contenido encontrado en cache persistente! UID: ${uid}, Carpeta: ${carpeta}`);
          return mensajeNormalizado;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ Error al buscar en cache persistente: ${error.message}`);
    return null;
  }
}

/**
 * Obtiene todos los UIDs que están en el cache para una carpeta
 * Útil para comparar con los UIDs que existen en IMAP
 */
export async function obtenerTodosLosUIDsDelCache(carpeta) {
  try {
    await connectDB();
    
    // Normalizar nombre de carpeta para búsqueda (intentar variaciones comunes)
    const variacionesCarpeta = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Agregar variaciones específicas para carpetas comunes
    if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
      variacionesCarpeta.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
    } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
      variacionesCarpeta.push("Junk", "JUNK", "junk", "Correo no deseado");
    } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
      variacionesCarpeta.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
    }
    
    // Buscar con todas las variaciones y obtener UIDs únicos
    const correosEnCache = await EmailCache.find({ 
      carpeta: { $in: variacionesCarpeta }
    }).select('uid').lean();
    
    // Extraer UIDs únicos
    const uids = [...new Set(correosEnCache.map(c => c.uid).filter(uid => uid != null))];
    
    return uids;
  } catch (error) {
    console.warn(`⚠️ Error obteniendo UIDs del cache: ${error.message}`);
    return [];
  }
}

/**
 * Limpia correos inválidos del cache persistente
 * Útil para limpiar correos "fantasma" que ya están guardados
 */
export async function limpiarCorreosInvalidosDelCache(carpeta = null) {
  try {
    await connectDB();
    
    // Buscar todos los correos en cache
    const query = carpeta ? { carpeta } : {};
    const correosEnCache = await EmailCache.find(query).lean();
    
    let eliminados = 0;
    for (const cached of correosEnCache) {
      if (cached.mensaje && !tieneMetadataMinima(cached.mensaje)) {
        await EmailCache.deleteOne({ _id: cached._id });
        eliminados++;
      }
    }
    
    if (eliminados > 0) {
      console.log(`🧹 Limpiados ${eliminados} correo(s) inválido(s) del cache${carpeta ? ` para carpeta ${carpeta}` : ''}`);
    }
    
    return eliminados;
  } catch (error) {
    console.warn(`⚠️ Error limpiando correos inválidos del cache: ${error.message}`);
    return 0;
  }
}

/**
 * Normaliza una fecha a objeto Date válido
 * Maneja strings raros, Date objects, y valores inválidos
 * @param {any} fecha - Fecha a normalizar (puede ser Date, string, o null)
 * @returns {Date} - Date válido (usa new Date() como fallback si no se puede parsear)
 */
export function normalizarFecha(fecha) {
  if (!fecha) return null;
  
  // Si ya es Date válido, retornarlo
  if (fecha instanceof Date && !isNaN(fecha.getTime())) {
    return fecha;
  }
  
  // Si es string, intentar parsear
  if (typeof fecha === 'string') {
    // Si es string raro tipo "20251217220742.4W4O71MC", usar new Date() como fallback
    if (/^\d{14,}\.\w+/.test(fecha)) {
      console.warn(`⚠️ Fecha con formato raro detectada: ${fecha}, usando fecha actual como fallback`);
      return new Date();
    }
    
    const fechaParsed = new Date(fecha);
    if (!isNaN(fechaParsed.getTime())) {
      return fechaParsed;
    }
  }
  
  // Si es número (timestamp), convertir
  if (typeof fecha === 'number' && !isNaN(fecha)) {
    const fechaFromTimestamp = new Date(fecha);
    if (!isNaN(fechaFromTimestamp.getTime())) {
      return fechaFromTimestamp;
    }
  }
  
  // Si no se puede parsear, retornar new Date() como fallback seguro
  // (mejor que null para evitar problemas en MongoDB)
  return new Date();
}

/**
 * Valida que un correo tenga metadata mínima antes de guardarlo
 * Evita guardar correos "fantasma" (sin remitente, sin asunto, sin fecha)
 * que aparecen cuando hay errores de conexión IMAP
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
                     (mensaje.date instanceof Date && !isNaN(mensaje.date.getTime()) ||
                      normalizarFecha(mensaje.date) !== null);
  
  // Debe tener al menos uno de los tres
  return tieneRemitente || tieneAsunto || tieneFecha;
}

/**
 * Guarda un correo en el cache persistente
 * IMPORTANTE: Solo guarda correos con metadata mínima (remitente, asunto o fecha)
 * para evitar correos "fantasma" cuando hay errores de conexión IMAP
 */
export async function guardarCorreoEnCache(uid, carpeta, mensaje, incluirContenido = false, bodyStatus = null, lastBodyError = null) {
  try {
    // 🔴 VALIDACIÓN CRÍTICA: No guardar correos sin metadata mínima
    // Esto previene correos "fantasma" (Sin remitente / Sin asunto) cuando IMAP falla
    if (!tieneMetadataMinima(mensaje)) {
      console.log(`🚫 Descartando correo vacío en cache. UID: ${uid}, Carpeta: ${carpeta}. Razón: Sin metadata mínima (remitente, asunto o fecha)`);
      return; // No guardar correos vacíos
    }
    
    await connectDB();
    const cacheKey = `${uid}-${carpeta}`;
    
    // Determinar bodyStatus: usar el proporcionado, o del mensaje, o calcularlo
    const finalBodyStatus = bodyStatus !== null 
      ? bodyStatus 
      : (mensaje.bodyStatus || (incluirContenido && (mensaje.html || mensaje.text) ? 'ready' : 'loading'));
    
    // Normalizar fecha antes de guardar (evita errores de cast)
    const fechaNormalizada = normalizarFecha(mensaje.date) || new Date();
    
    // Preparar campos de actualización
    const updateFields = {
      uid,
      carpeta,
      cacheKey,
      mensaje: {
        ...mensaje,
        date: fechaNormalizada, // Usar fecha normalizada
        bodyStatus: finalBodyStatus,
      },
      incluyeContenido: incluirContenido,
      bodyStatus: finalBodyStatus,
      updatedAt: new Date(),
    };
    
    // Solo actualizar lastBodyError y lastBodyAttemptAt si se proporciona un error
    if (lastBodyError !== null) {
      updateFields.mensaje.lastBodyError = lastBodyError;
      updateFields.mensaje.lastBodyAttemptAt = new Date();
      updateFields.lastBodyError = lastBodyError;
      updateFields.lastBodyAttemptAt = new Date();
    } else if (mensaje.lastBodyError !== undefined) {
      // Preservar valores existentes si no se proporcionan nuevos
      updateFields.mensaje.lastBodyError = mensaje.lastBodyError;
      updateFields.mensaje.lastBodyAttemptAt = mensaje.lastBodyAttemptAt;
    }
    
    // Actualizar o crear
    await EmailCache.findOneAndUpdate(
      { cacheKey },
      updateFields,
      { upsert: true, new: true }
    );
    
    console.log(`💾 Correo guardado en cache persistente (${incluirContenido ? 'con' : 'sin'} contenido, bodyStatus: ${finalBodyStatus})`);
    
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
 * Elimina un correo específico del cache
 */
export async function eliminarCorreoDelCache(uid, carpeta) {
  try {
    await connectDB();
    
    // Normalizar nombre de carpeta para búsqueda (intentar variaciones comunes)
    const variacionesCarpeta = [
      carpeta,
      carpeta.toUpperCase(),
      carpeta.toLowerCase(),
      carpeta.charAt(0).toUpperCase() + carpeta.slice(1).toLowerCase()
    ];
    
    // Agregar variaciones específicas para carpetas comunes
    if (carpeta === "Sent" || carpeta === "sent" || carpeta === "SENT") {
      variacionesCarpeta.push("Sent Items", "SentItems", "Enviados", "ENVIADOS", "enviados");
    } else if (carpeta === "SPAM" || carpeta === "spam" || carpeta === "Spam") {
      variacionesCarpeta.push("Junk", "JUNK", "junk", "Correo no deseado");
    } else if (carpeta === "TRASH" || carpeta === "trash" || carpeta === "Trash") {
      variacionesCarpeta.push("Deleted", "DELETED", "deleted", "Deleted Items", "Papelera", "PAPELERA");
    }
    
    // Eliminar con todas las variaciones
    let totalEliminados = 0;
    for (const variacion of variacionesCarpeta) {
      const result = await EmailCache.deleteMany({ 
        uid: Number(uid),
        carpeta: variacion 
      });
      totalEliminados += result.deletedCount;
    }
    
    if (totalEliminados > 0) {
      console.log(`🧹 Eliminado correo ${uid} del cache (${totalEliminados} entradas)`);
    }
    return totalEliminados;
  } catch (error) {
    console.warn(`⚠️ Error al eliminar correo del cache: ${error.message}`);
    return 0;
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

