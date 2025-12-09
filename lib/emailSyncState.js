// Sistema de estado de sincronización por carpeta usando UID
// Guarda el máximo UID sincronizado para cada carpeta para hacer syncs incrementales

import mongoose from 'mongoose';
import connectDB from './mongo.js';

// Schema para estado de sincronización por carpeta
const EmailSyncStateSchema = new mongoose.Schema({
  folder: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  maxUid: { 
    type: Number, 
    required: true, 
    default: 0 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
}, {
  // Sin TTL - estos datos deben persistir
});

EmailSyncStateSchema.index({ folder: 1 });

const EmailSyncState = mongoose.models.EmailSyncState || mongoose.model('EmailSyncState', EmailSyncStateSchema);

/**
 * Normaliza el nombre de carpeta para consistencia
 * Maneja variaciones como INBOX, inbox, Inbox, etc.
 */
function normalizarCarpeta(carpeta) {
  if (!carpeta) return 'INBOX';
  
  // Normalizar a mayúsculas para carpetas estándar
  const upper = carpeta.toUpperCase();
  if (upper === 'INBOX' || upper === 'SPAM' || upper === 'TRASH' || upper === 'DRAFTS') {
    return upper;
  }
  
  // Para otras carpetas, mantener formato original pero normalizar variaciones comunes
  if (carpeta === 'Sent' || carpeta === 'sent' || carpeta === 'SENT') {
    return 'SENT';
  }
  
  return carpeta;
}

/**
 * Obtiene el máximo UID sincronizado para una carpeta
 * @param {string} carpeta - Nombre de la carpeta
 * @returns {Promise<number>} El máximo UID sincronizado (0 si no hay estado)
 */
export async function getMaxUidForFolder(carpeta) {
  try {
    await connectDB();
    const carpetaNormalizada = normalizarCarpeta(carpeta);
    
    const estado = await EmailSyncState.findOne({ folder: carpetaNormalizada }).lean();
    
    if (estado && estado.maxUid) {
      return estado.maxUid;
    }
    
    // Si no hay estado, retornar 0 (primera vez)
    return 0;
  } catch (error) {
    console.warn(`⚠️ Error obteniendo maxUID para carpeta ${carpeta}: ${error.message}`);
    return 0; // Fallback a 0 en caso de error
  }
}

/**
 * Establece el máximo UID sincronizado para una carpeta
 * @param {string} carpeta - Nombre de la carpeta
 * @param {number} maxUid - El máximo UID sincronizado
 * @returns {Promise<void>}
 */
export async function setMaxUidForFolder(carpeta, maxUid) {
  try {
    await connectDB();
    const carpetaNormalizada = normalizarCarpeta(carpeta);
    
    // Validar que maxUid sea un número válido
    const maxUidNumero = Number(maxUid);
    if (isNaN(maxUidNumero) || maxUidNumero < 0) {
      throw new Error(`maxUid inválido: ${maxUid}`);
    }
    
    await EmailSyncState.findOneAndUpdate(
      { folder: carpetaNormalizada },
      { 
        folder: carpetaNormalizada,
        maxUid: maxUidNumero,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log(`✅ MaxUID actualizado para carpeta ${carpetaNormalizada}: ${maxUidNumero}`);
  } catch (error) {
    console.warn(`⚠️ Error estableciendo maxUID para carpeta ${carpeta}: ${error.message}`);
    // No lanzar error - el sync puede continuar sin guardar estado
  }
}

/**
 * Resetea el estado de sincronización para una carpeta (útil para forzar resync completo)
 * @param {string} carpeta - Nombre de la carpeta
 * @returns {Promise<void>}
 */
export async function resetSyncStateForFolder(carpeta) {
  try {
    await connectDB();
    const carpetaNormalizada = normalizarCarpeta(carpeta);
    
    await EmailSyncState.deleteOne({ folder: carpetaNormalizada });
    console.log(`✅ Estado de sync reseteado para carpeta ${carpetaNormalizada}`);
  } catch (error) {
    console.warn(`⚠️ Error reseteando estado de sync para carpeta ${carpeta}: ${error.message}`);
  }
}

/**
 * Obtiene el estado de sincronización para todas las carpetas (útil para debugging)
 * @returns {Promise<Array>} Array de estados de sincronización
 */
export async function getAllSyncStates() {
  try {
    await connectDB();
    const estados = await EmailSyncState.find({}).lean();
    return estados;
  } catch (error) {
    console.warn(`⚠️ Error obteniendo estados de sync: ${error.message}`);
    return [];
  }
}

