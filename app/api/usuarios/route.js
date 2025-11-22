import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import User from '../../../models/User';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    
    // Si se busca por email, devolver solo ese usuario (case-insensitive)
    if (email) {
      // Limpiar y normalizar el email
      const emailLimpio = email.trim().toLowerCase();
      
      // Escapar caracteres especiales para regex
      const emailEscapado = emailLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Intentar buscar de múltiples formas
      let usuario = await User.findOne({ 
        email: { $regex: new RegExp(`^${emailEscapado}$`, 'i') } 
      }).lean();
      
      // Si no se encuentra con regex, intentar búsqueda exacta (case-insensitive)
      if (!usuario) {
        // Buscar todos los usuarios y filtrar en memoria (fallback)
        const todosUsuarios = await User.find({}).lean();
        usuario = todosUsuarios.find(u => 
          u.email && u.email.trim().toLowerCase() === emailLimpio
        );
      }
      
      if (!usuario) {
        // Devolver success: false pero con status 200 para que el frontend pueda manejarlo
        return NextResponse.json(
          { success: false, error: 'Usuario no encontrado' },
          { status: 200 }
        );
      }
      
      return NextResponse.json({ success: true, data: usuario });
    }
    
    // Si no hay email, devolver todos los usuarios
    const usuarios = await User.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: usuarios });
  } catch (error) {
    console.error('[API /usuarios] Error completo:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Mensaje de error más descriptivo
    let errorMessage = error.message;
    if (error.message.includes('MONGODB_URI')) {
      errorMessage = 'Error de configuración: MONGODB_URI no está configurada en Vercel. Ve a Settings → Environment Variables y agrega MONGODB_URI.';
    } else if (error.message.includes('MongoNetworkError') || error.message.includes('ENOTFOUND')) {
      errorMessage = 'Error de conexión: No se pudo conectar a MongoDB. Verifica que MONGODB_URI sea correcta y que tu IP esté permitida en MongoDB Atlas.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const usuario = await User.create(body);
    return NextResponse.json({ success: true, data: usuario }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

