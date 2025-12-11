import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import User from '../../../../models/User';
import { getCurrentUserId } from '../../../../lib/auth';
import mongoose from 'mongoose';

// Endpoint para actualizar lastSeen del usuario (heartbeat)
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
      console.error('[API Heartbeat] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    // Actualizar lastSeen
    await User.findByIdAndUpdate(userObjectId, { 
      lastSeen: new Date() 
    });
    
    return NextResponse.json({ success: true, message: 'Heartbeat actualizado' });
  } catch (error) {
    console.error('[API Heartbeat] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
