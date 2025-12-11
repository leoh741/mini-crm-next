// Utilidad para actualizar lastSeen del usuario en las APIs
import User from '../models/User';
import mongoose from 'mongoose';

export async function updateUserLastSeen(userId) {
  try {
    if (!userId) return;
    
    // Convert userId to ObjectId
    let userObjectId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } else {
      const user = await User.findOne({ crmId: userId }).lean();
      if (user) {
        userObjectId = user._id;
      } else {
        return; // Usuario no encontrado, no actualizar
      }
    }
    
    // Actualizar lastSeen (sin await para no bloquear la respuesta)
    User.findByIdAndUpdate(userObjectId, { 
      lastSeen: new Date() 
    }).catch(err => {
      // Silenciar errores de actualización de lastSeen
      console.debug('[UserActivity] Error actualizando lastSeen:', err);
    });
  } catch (error) {
    // Silenciar errores
    console.debug('[UserActivity] Error en updateUserLastSeen:', error);
  }
}
