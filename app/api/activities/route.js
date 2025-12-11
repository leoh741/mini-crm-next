import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Activity from '../../../models/Activity';
import ActivityList from '../../../models/ActivityList';
import { getCurrentUserId, getCurrentUserRole } from '../../../lib/auth';
import { updateUserLastSeen } from '../../../lib/userActivity';
import mongoose from 'mongoose';

export async function GET(request) {
  try {
    await connectDB();
    
    const userId = await getCurrentUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado' },
        { status: 401 }
      );
    }
    
    // Obtener el rol del usuario para determinar qué actividades puede ver
    const userRole = await getCurrentUserRole(request);
    console.log('[API Activities GET] User role:', userRole, 'User ID:', userId);
    
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');
    const status = searchParams.get('status');
    const assigneeId = searchParams.get('assigneeId');
    
    let query = {};
    
    if (listId) {
      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(listId)) {
        return NextResponse.json(
          { success: false, error: 'ID de lista inválido' },
          { status: 400 }
        );
      }
      query.list = new mongoose.Types.ObjectId(listId);
      
      // Todos los usuarios autenticados pueden ver actividades de cualquier lista
      // (Las listas ya son visibles para todos, así que las actividades también)
      console.log('[API Activities GET] Obteniendo actividades de la lista:', listId);
    }
    
    if (status) {
      query.status = status;
    }
    
    // Por defecto, no mostrar actividades eliminadas a menos que se solicite explícitamente
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    if (!includeDeleted) {
      query.isDeleted = { $ne: true };
    }
    
    if (assigneeId) {
      let assigneeObjectId;
      if (mongoose.Types.ObjectId.isValid(assigneeId)) {
        assigneeObjectId = new mongoose.Types.ObjectId(assigneeId);
      } else {
        // Try to find by crmId
        const User = (await import('../../../models/User')).default;
        const user = await User.findOne({ crmId: assigneeId }).lean();
        if (user) {
          assigneeObjectId = user._id;
        }
      }
      if (assigneeObjectId) {
        query.assignee = assigneeObjectId;
      }
    }
    
    const activities = await Activity.find(query)
      .populate('assignee', 'nombre email')
      .populate('createdBy', 'nombre email')
      .populate('list', 'name color')
      .sort({ order: 1, createdAt: -1 })
      .lean()
      .maxTimeMS(15000);
    
    return NextResponse.json({ success: true, data: activities }, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Activities] Error:', error);
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
    console.log('[API Activities POST] UserId recibido:', userId);
    console.log('[API Activities POST] Headers:', {
      'X-User-Id': request.headers.get('X-User-Id'),
      'Content-Type': request.headers.get('Content-Type')
    });
    
    if (!userId) {
      console.error('[API Activities POST] Usuario no autenticado - userId es null/undefined');
      return NextResponse.json(
        { success: false, error: 'Usuario no autenticado. Por favor, inicia sesión nuevamente.' },
        { status: 401 }
      );
    }
    
    // Verificar permisos: admin puede hacer todo, coordinador también puede crear/editar
    const userRole = await getCurrentUserRole(request);
    console.log('[API Activities POST] User ID:', userId, 'User role:', userRole);
    
    // Si es admin o coordinador, permitir siempre
    if (userRole === 'admin') {
      console.log('[API Activities POST] Admin detectado - acceso permitido');
    } else if (userRole === 'coordinador') {
      console.log('[API Activities POST] Coordinador detectado - acceso permitido');
    } else {
      console.log('[API Activities POST] Acceso denegado. Rol:', userRole);
      return NextResponse.json(
        { success: false, error: `No tienes permisos para crear actividades. Solo coordinadores y administradores pueden crear actividades. Tu rol actual es: ${userRole || 'no definido'}` },
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
      console.error('[API Activities POST] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    console.log('[API Activities POST] Body recibido:', JSON.stringify(body, null, 2));
    
    if (!body.listId) {
      console.error('[API Activities POST] listId faltante en body');
      return NextResponse.json(
        { success: false, error: 'ID de lista requerido' },
        { status: 400 }
      );
    }
    
    if (!body.title || !body.title.trim()) {
      console.error('[API Activities POST] title faltante o vacío en body');
      return NextResponse.json(
        { success: false, error: 'El título es requerido' },
        { status: 400 }
      );
    }
    
    // Validate listId and check access
    if (!mongoose.Types.ObjectId.isValid(body.listId)) {
      return NextResponse.json(
        { success: false, error: 'ID de lista inválido' },
        { status: 400 }
      );
    }
    
    const list = await ActivityList.findById(body.listId);
    if (!list) {
      return NextResponse.json(
        { success: false, error: 'Lista no encontrada' },
        { status: 404 }
      );
    }
    
    // Check if user has access to this list
    // Admin y coordinador pueden crear actividades en cualquier lista
    if (userRole !== 'admin' && userRole !== 'coordinador') {
      const isOwner = list.owner.toString() === userObjectId.toString();
      const isMember = list.members.some(m => m.toString() === userObjectId.toString());
      
      if (!isOwner && !isMember) {
        return NextResponse.json(
          { success: false, error: 'No tienes acceso a esta lista' },
          { status: 403 }
        );
      }
    }
    
    // Convert assignee if provided
    let assigneeObjectId = null;
    if (body.assignee) {
      if (mongoose.Types.ObjectId.isValid(body.assignee)) {
        assigneeObjectId = new mongoose.Types.ObjectId(body.assignee);
      } else {
        const User = (await import('../../../models/User')).default;
        const user = await User.findOne({ crmId: body.assignee }).lean();
        if (user) {
          assigneeObjectId = user._id;
        }
      }
    }
    
    // Parse dueDate
    let dueDate = null;
    if (body.dueDate) {
      dueDate = new Date(body.dueDate);
      if (isNaN(dueDate.getTime())) {
        dueDate = null;
      }
    }
    
    const activityData = {
      list: new mongoose.Types.ObjectId(body.listId),
      title: body.title.trim(),
      description: body.description?.trim() || '',
      status: body.status || 'pendiente',
      priority: body.priority || 'media',
      labels: Array.isArray(body.labels) ? body.labels.filter(l => l && l.trim()).map(l => l.trim()) : [],
      dueDate: dueDate,
      assignee: assigneeObjectId,
      order: body.order || 0,
      createdBy: userObjectId
    };
    
    console.log('[API Activities POST] Creando actividad con datos:', JSON.stringify({
      ...activityData,
      list: activityData.list.toString(),
      createdBy: activityData.createdBy.toString(),
      assignee: activityData.assignee?.toString() || null
    }, null, 2));
    
    const activity = await Activity.create(activityData);
    console.log('[API Activities POST] Actividad creada exitosamente:', activity._id);
    
    // Actualizar lastSeen del usuario
    updateUserLastSeen(userId);
    
    // Populate before returning
    await activity.populate('assignee', 'nombre email');
    await activity.populate('createdBy', 'nombre email');
    await activity.populate('list', 'name color');
    
    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (error) {
    console.error('[API Activities POST] Error completo:', error);
    console.error('[API Activities POST] Stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear la actividad' },
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
    
    // Verificar permisos: admin puede hacer todo, coordinador también puede crear/editar
    const userRole = await getCurrentUserRole(request);
    console.log('[API Activities PATCH] User ID:', userId, 'User role:', userRole);
    
    // Convert userId to ObjectId primero para poder verificar asignación
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
      console.error('[API Activities PATCH] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'ID de actividad requerido' },
        { status: 400 }
      );
    }
    
    const activity = await Activity.findById(body.id).populate('list').populate('assignee');
    
    if (!activity) {
      return NextResponse.json(
        { success: false, error: 'Actividad no encontrada' },
        { status: 404 }
      );
    }
    
    // Verificar si el usuario está asignado a la actividad
    const isAssignedToUser = activity.assignee && (
      activity.assignee._id?.toString() === userObjectId.toString() ||
      activity.assignee.id?.toString() === userObjectId.toString() ||
      (activity.assignee.crmId && String(activity.assignee.crmId) === String(userId))
    );
    
    // Verificar si solo se está cambiando el estado (y es un cambio permitido para usuarios normales)
    const onlyChangingStatus = body.status !== undefined && 
      Object.keys(body).filter(k => k !== 'id' && k !== 'status').length === 0;
    const isStatusChangeAllowed = onlyChangingStatus && 
      (body.status === 'en_proceso' || body.status === 'pendiente');
    
    // Si es admin, permitir siempre
    if (userRole === 'admin') {
      console.log('[API Activities PATCH] Admin detectado - acceso permitido');
    } else if (userRole === 'coordinador') {
      console.log('[API Activities PATCH] Coordinador detectado - acceso permitido');
    } else if (isAssignedToUser && isStatusChangeAllowed) {
      // Usuario normal puede cambiar estado a en_proceso o pendiente si está asignado
      console.log('[API Activities PATCH] Usuario asignado cambiando estado permitido');
    } else {
      console.log('[API Activities PATCH] Acceso denegado. Rol:', userRole, 'Asignado:', isAssignedToUser, 'Solo estado:', onlyChangingStatus);
      return NextResponse.json(
        { success: false, error: `No tienes permisos para editar actividades. Solo coordinadores y administradores pueden editar actividades. Los usuarios solo pueden cambiar el estado de actividades asignadas a ellos. Tu rol actual es: ${userRole || 'no definido'}` },
        { status: 403 }
      );
    }
    
    // Check access: user must be owner of list, member of list, creator of activity, or assigned to activity (for status changes)
    // Admin y coordinador pueden modificar cualquier actividad, así que saltamos esta verificación
    if (userRole !== 'admin' && userRole !== 'coordinador') {
      const list = activity.list;
      const isListOwner = list.owner.toString() === userObjectId.toString();
      const isListMember = list.members.some(m => m.toString() === userObjectId.toString());
      const isActivityCreator = activity.createdBy.toString() === userObjectId.toString();
      
      if (!isListOwner && !isListMember && !isActivityCreator && !isAssignedToUser) {
        return NextResponse.json(
          { success: false, error: 'No tienes permiso para modificar esta actividad' },
          { status: 403 }
        );
      }
    }
    
    // Si es usuario normal y solo está cambiando estado, no permitir cambiar otros campos
    if (userRole !== 'admin' && userRole !== 'coordinador' && isAssignedToUser) {
      // Solo permitir cambiar el estado
      if (body.title !== undefined || body.description !== undefined || 
          body.priority !== undefined || body.labels !== undefined || 
          body.dueDate !== undefined || body.assignee !== undefined || 
          body.order !== undefined) {
        return NextResponse.json(
          { success: false, error: 'Solo puedes cambiar el estado de actividades asignadas a ti. No puedes editar otros campos.' },
          { status: 403 }
        );
      }
    }
    
    // Update allowed fields
    if (body.title !== undefined) {
      activity.title = body.title.trim();
    }
    if (body.description !== undefined) {
      activity.description = body.description?.trim() || '';
    }
    if (body.status !== undefined) {
      activity.status = body.status;
    }
    if (body.priority !== undefined) {
      activity.priority = body.priority;
    }
    if (body.labels !== undefined) {
      activity.labels = Array.isArray(body.labels) 
        ? body.labels.filter(l => l && l.trim()).map(l => l.trim())
        : [];
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate) {
        const dueDate = new Date(body.dueDate);
        activity.dueDate = isNaN(dueDate.getTime()) ? null : dueDate;
      } else {
        activity.dueDate = null;
      }
    }
    if (body.assignee !== undefined) {
      if (body.assignee) {
        if (mongoose.Types.ObjectId.isValid(body.assignee)) {
          activity.assignee = new mongoose.Types.ObjectId(body.assignee);
        } else {
          const User = (await import('../../../models/User')).default;
          const user = await User.findOne({ crmId: body.assignee }).lean();
          if (user) {
            activity.assignee = user._id;
          } else {
            activity.assignee = null;
          }
        }
      } else {
        activity.assignee = null;
      }
    }
    if (body.order !== undefined) {
      activity.order = Number(body.order) || 0;
    }
    
    await activity.save();
    
    // Populate before returning
    await activity.populate('assignee', 'nombre email');
    await activity.populate('createdBy', 'nombre email');
    await activity.populate('list', 'name color');
    
    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error('[API Activities PATCH] Error:', error);
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
    
    // Verificar permisos: admin puede hacer todo, coordinador también puede eliminar
    const userRole = await getCurrentUserRole(request);
    console.log('[API Activities DELETE] User ID:', userId, 'User role:', userRole);
    
    // Si es admin o coordinador, permitir siempre
    if (userRole === 'admin') {
      console.log('[API Activities DELETE] Admin detectado - acceso permitido');
    } else if (userRole === 'coordinador') {
      console.log('[API Activities DELETE] Coordinador detectado - acceso permitido');
    } else {
      console.log('[API Activities DELETE] Acceso denegado. Rol:', userRole);
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para eliminar actividades. Solo coordinadores y administradores pueden eliminar actividades.' },
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
      console.error('[API Activities DELETE] Error converting userId:', error);
      return NextResponse.json(
        { success: false, error: 'Error al validar usuario' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'ID de actividad requerido' },
        { status: 400 }
      );
    }
    
    const activity = await Activity.findById(body.id).populate('list');
    
    if (!activity) {
      return NextResponse.json(
        { success: false, error: 'Actividad no encontrada' },
        { status: 404 }
      );
    }
    
     // Admin y coordinador pueden eliminar cualquier actividad
     if (userRole !== 'admin' && userRole !== 'coordinador') {
       // Only list owner or activity creator can delete
       const list = activity.list;
       const isListOwner = list.owner.toString() === userObjectId.toString();
       const isActivityCreator = activity.createdBy.toString() === userObjectId.toString();
       
       if (!isListOwner && !isActivityCreator) {
         return NextResponse.json(
           { success: false, error: 'No tienes permiso para eliminar esta actividad' },
           { status: 403 }
         );
       }
     }
     
     // Soft delete: marcar como eliminada en lugar de borrar físicamente
     activity.isDeleted = true;
     activity.deletedAt = new Date();
     await activity.save();
    
    return NextResponse.json({ success: true, message: 'Actividad eliminada' });
  } catch (error) {
    console.error('[API Activities DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
