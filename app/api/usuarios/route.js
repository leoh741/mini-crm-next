import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
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
      
      // Intentar buscar de múltiples formas (optimizado para MongoDB Free)
      let usuario = await User.findOne({ 
        email: { $regex: new RegExp(`^${emailEscapado}$`, 'i') } 
      })
      .select('crmId nombre email password rol fechaCreacion')
      .lean()
      .maxTimeMS(3000);
      
      // Si no se encuentra con regex, intentar búsqueda exacta (case-insensitive)
      if (!usuario) {
        // Buscar todos los usuarios y filtrar en memoria (fallback optimizado)
        const todosUsuarios = await User.find({})
          .select('crmId nombre email password rol fechaCreacion')
          .lean()
          .maxTimeMS(3000);
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
    const usuarios = await User.find({})
      .select('crmId nombre email password rol fechaCreacion createdAt')
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(3000);
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
      errorMessage = 'Error de configuración: MONGODB_URI no está configurada. Configura la variable de entorno MONGODB_URI en el archivo .env.local o variables de entorno del sistema.';
    } else if (error.message.includes('MongoNetworkError') || error.message.includes('ENOTFOUND')) {
      errorMessage = 'Error de conexión: No se pudo conectar a MongoDB. Verifica que MONGODB_URI sea correcta y que MongoDB esté corriendo.';
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
    
    console.log('[API POST /usuarios] Body recibido:', JSON.stringify(body, null, 2));
    
    // Validar que los campos requeridos estén presentes
    if (!body.nombre || !body.email || !body.password) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: nombre, email o password' },
        { status: 400 }
      );
    }
    
    // Preparar los datos del usuario con todos los campos requeridos
    // Asegurarse de que crmId esté presente y correctamente escrito
    const usuarioData = {
      crmId: body.crmId || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nombre: String(body.nombre).trim(),
      email: String(body.email).trim().toLowerCase(),
      password: String(body.password),
      rol: body.rol || 'usuario',
      fechaCreacion: body.fechaCreacion || new Date()
    };
    
    // Verificar que todos los campos requeridos estén presentes
    if (!usuarioData.crmId || !usuarioData.nombre || !usuarioData.email || !usuarioData.password) {
      return NextResponse.json(
        { success: false, error: 'Todos los campos requeridos deben estar presentes: crmId, nombre, email, password' },
        { status: 400 }
      );
    }
    
    console.log('[API POST /usuarios] Datos a crear:', JSON.stringify(usuarioData, null, 2));
    console.log('[API POST /usuarios] Campos verificados:', {
      crmId: !!usuarioData.crmId,
      nombre: !!usuarioData.nombre,
      email: !!usuarioData.email,
      password: !!usuarioData.password
    });
    
    // Crear el usuario usando new y save para tener más control sobre la validación
    const nuevoUsuario = new User(usuarioData);
    await nuevoUsuario.save();
    
    console.log('[API POST /usuarios] Usuario creado exitosamente:', nuevoUsuario._id);
    
    return NextResponse.json({ success: true, data: nuevoUsuario }, { status: 201 });
  } catch (error) {
    console.error('[API POST /usuarios] Error completo:', {
      message: error.message,
      name: error.name,
      code: error.code,
      errors: error.errors,
      stack: error.stack
    });
    
    // Manejar errores de duplicado
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { success: false, error: `El ${campo === 'email' ? 'email' : campo} ya está registrado` },
        { status: 400 }
      );
    }
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const mensajes = Object.values(error.errors || {}).map(e => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: `Error de validación: ${mensajes || error.message}` },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear usuario' },
      { status: 400 }
    );
  }
}

