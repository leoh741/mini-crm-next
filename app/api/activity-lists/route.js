import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import ActivityList from '../../../models/ActivityList';
import { getCurrentUserId, getCurrentUserRole } from '../../../lib/auth';
import { updateUserLastSeen } from '../../../lib/userActivity';
import mongoose from 'mongoose';

export async function GET(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    console.log('[API ActivityLists GET] UserId recibido del header:', userId);
    console.log('[API ActivityLists GET] Headers completos:', {
      'X-User-Id': request.headers.get('X-User-Id'),
      'Cookie': request.headers.get('Cookie') ? 'Presente' : 'No presente'
    });
    
    if (!userId) {
      console.error('[API ActivityLists GET] No se pudo obtener userId');
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }
    
    // Convert userId to ObjectId (handle both string and ObjectId)
    let userObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        // If userId is not a valid ObjectId, try to find by crmId
        const User = (await import('../../../models/User')).default;
        const user = await User.findOne({ crmId: userId }).lean();
        if (user) {
          userObjectId = user._id;
        } else {
          console.error('[API ActivityLists GET] Usuario no encontrado para userId:', userId);
          return NextResponse.json(
            { success: false, error: 'Usuario no encontrado' },
            { status: 404 }
          );
        }
      }
    } catch (error) {
      console.error('[API ActivityLists GET] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    // Obtener el rol del usuario para determinar qué listas puede ver
    const User = (await import('../../../models/User')).default;
    let user;
    
    // Intentar buscar el usuario de múltiples formas
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId).lean();
    }
    
    if (!user) {
      // Buscar por crmId
      user = await User.findOne({ crmId: userId }).lean();
    }
    
    if (!user) {
      // Buscar por _id como string
      user = await User.findOne({ _id: userId }).lean();
    }
    
    if (!user) {
      console.error('[API ActivityLists GET] Usuario no encontrado con ningún método. userId recibido:', userId);
      console.error('[API ActivityLists GET] Intentando buscar todos los usuarios para debug...');
      const allUsers = await User.find({}).select('_id crmId nombre email rol').lean().limit(10);
      console.error('[API ActivityLists GET] Primeros 10 usuarios en DB:', allUsers);
      return NextResponse.json(
        { success: false, error: `Usuario no encontrado. userId recibido: ${userId}` },
        { status: 404 }
      );
    }
    
    const userRole = user.rol || 'usuario';
    console.log('[API ActivityLists GET] Usuario encontrado:', {
      userId: userId,
      userMongoId: user._id,
      crmId: user.crmId,
      nombre: user.nombre,
      email: user.email,
      rol: userRole
    });
    
    // Todos los usuarios autenticados pueden ver todas las listas no archivadas
    const query = { isArchived: false };
    console.log('[API ActivityLists GET] Mostrando TODAS las listas no archivadas para todos los usuarios');
    
    const lists = await ActivityList.find(query)
    .populate('owner', 'nombre email')
    .populate('members', 'nombre email')
    .sort({ createdAt: -1 })
    .lean()
    .maxTimeMS(15000);
    
    console.log('[API ActivityLists GET] Listas encontradas:', lists.length, 'para usuario con rol:', userRole);
    
    return NextResponse.json({ success: true, data: lists }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API ActivityLists] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    console.log('[API ActivityLists POST] UserId recibido:', userId);
    console.log('[API ActivityLists POST] Headers:', {
      'X-User-Id': request.headers.get('X-User-Id'),
      'Content-Type': request.headers.get('Content-Type')
    });
    
    if (!userId) {
      console.error('[API ActivityLists POST] Usuario no autenticado - userId es null/undefined');
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado. Por favor, inicia sesión nuevamente.' },
        { status: 401 }
      );
    }
    
    // Verificar permisos: solo admin puede crear listas
    const userRole = await getCurrentUserRole(request);
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para crear listas. Solo los administradores pueden crear listas.' },
        { status: 403 }
      );
    }
    
    // Convert userId to ObjectId
    let userObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        // If userId is not a valid ObjectId, try to find by crmId
        const User = (await import('../../../models/User')).default;
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
      console.error('[API ActivityLists POST] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    console.log('[API ActivityLists POST] UserId convertido a ObjectId:', userObjectId);
    
    const body = await request.json();
    console.log('[API ActivityLists POST] Body recibido:', JSON.stringify(body, null, 2));
    
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre de la lista es requerido' },
        { status: 400 }
      );
    }
    
    if (!userObjectId) {
      console.error('[API ActivityLists POST] userObjectId es null o undefined');
      return NextResponse.json(
        { success: false, error: 'Error: usuario no válido' },
        { status: 400 }
      );
    }
    
    const listData = {
      name: body.name.trim(),
      description: body.description?.trim() || '',
      color: body.color || '#22c55e',
      owner: userObjectId,
      members: [userObjectId] // Include owner as member
    };
    
    console.log('[API ActivityLists POST] Datos de lista a crear:', JSON.stringify({
      ...listData,
      owner: listData.owner.toString(),
      members: listData.members.map(m => m.toString())
    }, null, 2));
    
    const list = await ActivityList.create(listData);
    console.log('[API ActivityLists POST] Lista creada exitosamente:', list._id);
    
    // Actualizar lastSeen del usuario
    updateUserLastSeen(userId);
    
    // Populate before returning
    await list.populate('owner', 'nombre email');
    await list.populate('members', 'nombre email');
    
    return NextResponse.json({ success: true, data: list }, { status: 201 });
  } catch (error) {
    console.error('[API ActivityLists POST] Error completo:', error);
    console.error('[API ActivityLists POST] Stack:', error.stack);
    
    // Extraer mensaje de error más detallado si es un error de validación
    let errorMessage = error.message;
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors || {}).map(key => {
        return `${key}: ${error.errors[key].message}`;
      }).join(', ');
      errorMessage = `Error de validación: ${validationErrors}`;
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage || 'Error al crear la lista' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }
    
    // Verificar permisos: solo admin puede editar listas
    const userRole = await getCurrentUserRole(request);
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para editar listas. Solo los administradores pueden editar listas.' },
        { status: 403 }
      );
    }
    
    // Convert userId to ObjectId
    let userObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        const User = (await import('../../../models/User')).default;
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
      console.error('[API ActivityLists PATCH] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'ID de lista requerido' },
        { status: 400 }
      );
    }
    
    const list = await ActivityList.findById(body.id);
    
    if (!list) {
      return NextResponse.json(
        { success: false, error: 'Lista no encontrada' },
        { status: 404 }
      );
    }
    
    // Only owner can modify the list
    if (list.owner.toString() !== userObjectId.toString()) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para modificar esta lista' },
        { status: 403 }
      );
    }
    
    // Update allowed fields
    if (body.name !== undefined) {
      list.name = body.name.trim();
    }
    if (body.description !== undefined) {
      list.description = body.description?.trim() || '';
    }
    if (body.color !== undefined) {
      list.color = body.color;
    }
    if (body.isArchived !== undefined) {
      list.isArchived = Boolean(body.isArchived);
    }
    
    await list.save();
    
    // Populate before returning
    await list.populate('owner', 'nombre email');
    await list.populate('members', 'nombre email');
    
    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error('[API ActivityLists PATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }
    
    // Verificar permisos: solo admin puede borrar listas
    const userRole = await getCurrentUserRole(request);
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para borrar listas. Solo los administradores pueden borrar listas.' },
        { status: 403 }
      );
    }
    
    // Convert userId to ObjectId
    let userObjectId;
    try {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        const User = (await import('../../../models/User')).default;
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
      console.error('[API ActivityLists DELETE] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'ID de lista requerido' },
        { status: 400 }
      );
    }
    
    const list = await ActivityList.findById(body.id);
    
    if (!list) {
      return NextResponse.json(
        { success: false, error: 'Lista no encontrada' },
        { status: 404 }
      );
    }
    
    // Only owner can delete the list
    if (list.owner.toString() !== userObjectId.toString()) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para borrar esta lista' },
        { status: 403 }
      );
    }
    
    // Borrar todas las actividades de la lista primero
    const Activity = (await import('../../../models/Activity')).default;
    await Activity.deleteMany({ list: list._id });
    
    // Borrar la lista
    await ActivityList.findByIdAndDelete(body.id);
    
    return NextResponse.json({ success: true, message: 'Lista eliminada correctamente' });
  } catch (error) {
    console.error('[API ActivityLists DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
