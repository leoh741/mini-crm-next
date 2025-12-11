import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import User from '../../../../models/User';
import { getCurrentUserId } from '../../../../lib/auth';
import mongoose from 'mongoose';

// Endpoint para marcar al usuario como offline cuando cierra la pestaña
export async function POST(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }
    
    // Convert userId to ObjectId
    let userObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        const user = await User.findOne({ crmId: userId }).lean();
        if (user) {
          userObjectId = user._id;
        } else {
          return NextResponse.json(
            { success: false, error: 'Usuario no encontrado' },
            { status: 404 }
          );
        }
      }
    } catch (error) {
      console.error('[API Offline] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    // Marcar como offline estableciendo lastSeen a hace 10 minutos
    // Esto hará que el usuario se muestre como offline inmediatamente
    const offlineDate = new Date();
    offlineDate.setMinutes(offlineDate.getMinutes() - 10);
    
    const result = await User.findByIdAndUpdate(userObjectId, { 
      lastSeen: offlineDate 
    }, { new: true });
    
    console.log(`[API Offline] Usuario ${userId} marcado como offline. lastSeen actualizado a: ${offlineDate.toISOString()}`);
    
    return NextResponse.json({ success: true, message: 'Usuario marcado como offline' });
  } catch (error) {
    console.error('[API Offline] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

