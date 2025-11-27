import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Task from '../../../models/Task';
import mongoose from 'mongoose';

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const prioridad = searchParams.get('prioridad');
    const completada = searchParams.get('completada');
    const pendientes = searchParams.get('pendientes'); // Si es 'true', solo pendientes
    
    let query = {};
    
    if (estado) {
      query.estado = estado;
    }
    
    if (prioridad) {
      query.prioridad = prioridad;
    }
    
    if (completada !== null && completada !== undefined) {
      query.completada = completada === 'true';
    }
    
    if (pendientes === 'true') {
      query.estado = { $in: ['pendiente', 'en_progreso'] };
      query.completada = false;
    }
    
    const tareas = await Task.find(query)
      .select('tareaId titulo descripcion fechaVencimiento prioridad estado cliente etiquetas asignados completada fechaCompletada createdAt updatedAt')
      .sort({ prioridad: -1, fechaVencimiento: 1, createdAt: -1 })
      .lean()
      .maxTimeMS(30000);
    
    return NextResponse.json({ success: true, data: tareas }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Tareas] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    
    // Verificar headers
    const contentType = request.headers.get('content-type');
    console.log('[API Tareas] Content-Type:', contentType);
    
    // Parsear body con manejo de errores robusto
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[API Tareas] Error al parsear JSON:', parseError);
      // Intentar leer como texto para debugging
      try {
        const text = await request.text();
        console.error('[API Tareas] Body como texto (fallback):', text);
      } catch (textError) {
        console.error('[API Tareas] No se pudo leer el body:', textError);
      }
      return NextResponse.json(
        { success: false, error: 'Error al procesar los datos enviados. Por favor, verifica que todos los campos estén completos.' },
        { status: 400 }
      );
    }
    
    console.log('[API Tareas] Body recibido:', JSON.stringify(body, null, 2));
    console.log('[API Tareas] Body es objeto?:', typeof body === 'object' && body !== null);
    console.log('[API Tareas] Keys del body:', body ? Object.keys(body) : 'body es null/undefined');
    
    // Validar título
    if (!body.titulo || typeof body.titulo !== 'string' || !body.titulo.trim()) {
      return NextResponse.json(
        { success: false, error: 'El título de la tarea es requerido' },
        { status: 400 }
      );
    }
    
    // Generar tareaId si no viene (asegurar que siempre exista)
    if (!body.tareaId || typeof body.tareaId !== 'string' || !body.tareaId.trim()) {
      body.tareaId = `tarea-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // Asegurar valores por defecto
    body.tareaId = String(body.tareaId).trim();
    body.titulo = String(body.titulo).trim();
    body.prioridad = body.prioridad && ['baja', 'media', 'alta', 'urgente'].includes(body.prioridad) 
      ? String(body.prioridad) 
      : 'media';
    body.estado = body.estado && ['pendiente', 'en_progreso', 'completada', 'cancelada'].includes(body.estado)
      ? String(body.estado)
      : 'pendiente';
    body.completada = Boolean(body.completada || false);
    
    // Limpiar campos opcionales
    if (body.descripcion && typeof body.descripcion === 'string' && body.descripcion.trim()) {
      body.descripcion = String(body.descripcion).trim();
    } else {
      delete body.descripcion;
    }
    
    // Parsear fecha de vencimiento en formato YYYY-MM-DD a Date en hora local
    if (body.fechaVencimiento) {
      let fechaDate;
      if (typeof body.fechaVencimiento === 'string' && body.fechaVencimiento.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Formato YYYY-MM-DD - parsear manualmente para evitar problemas de zona horaria
        const [año, mes, dia] = body.fechaVencimiento.split('-').map(Number);
        fechaDate = new Date(año, mes - 1, dia, 12, 0, 0, 0); // Usar mediodía para evitar cambios de día
      } else {
        fechaDate = new Date(body.fechaVencimiento);
      }
      
      if (!isNaN(fechaDate.getTime())) {
        body.fechaVencimiento = fechaDate;
      } else {
        delete body.fechaVencimiento;
      }
    } else {
      delete body.fechaVencimiento;
    }
    
    if (body.cliente && typeof body.cliente === 'object') {
      body.cliente = {
        ...(body.cliente.nombre && body.cliente.nombre.trim() ? { nombre: String(body.cliente.nombre).trim() } : {}),
        ...(body.cliente.crmId && body.cliente.crmId.trim() ? { crmId: String(body.cliente.crmId).trim() } : {})
      };
      if (Object.keys(body.cliente).length === 0) {
        delete body.cliente;
      }
    }
    
    if (body.etiquetas && Array.isArray(body.etiquetas) && body.etiquetas.length > 0) {
      body.etiquetas = body.etiquetas
        .filter(et => et != null && typeof et === 'string')
        .map(et => String(et).trim())
        .filter(et => et.length > 0);
      if (body.etiquetas.length === 0) {
        delete body.etiquetas;
      }
    } else {
      delete body.etiquetas;
    }
    
    if (body.asignados && Array.isArray(body.asignados) && body.asignados.length > 0) {
      body.asignados = body.asignados
        .filter(a => a != null && typeof a === 'string')
        .map(a => String(a).trim())
        .filter(a => a.length > 0);
      if (body.asignados.length === 0) {
        delete body.asignados;
      }
    } else {
      delete body.asignados;
    }
    
    // Crear objeto final usando body directamente (ya tiene todos los campos necesarios)
    const tareaData = {
      tareaId: body.tareaId,
      titulo: body.titulo,
      prioridad: body.prioridad,
      estado: body.estado,
      completada: body.completada,
      // Agregar campos opcionales solo si existen
      ...(body.descripcion && { descripcion: body.descripcion }),
      ...(body.fechaVencimiento && { fechaVencimiento: body.fechaVencimiento }),
      ...(body.cliente && Object.keys(body.cliente).length > 0 && { cliente: body.cliente }),
      ...(body.etiquetas && body.etiquetas.length > 0 && { etiquetas: body.etiquetas }),
      ...(body.asignados && body.asignados.length > 0 && { asignados: body.asignados })
    };
    
    // Verificar que ningún campo requerido sea undefined, null o string vacío
    const camposRequeridos = {
      tareaId: tareaData.tareaId && String(tareaData.tareaId).trim(),
      titulo: tareaData.titulo && String(tareaData.titulo).trim()
    };
    
    console.log('[API Tareas] Verificación final de campos requeridos:', camposRequeridos);
    
    // Si algún campo requerido falta o está vacío, retornar error
    if (!camposRequeridos.tareaId || !camposRequeridos.titulo) {
      console.error('[API Tareas] ERROR: Campos requeridos faltantes o inválidos:', {
        tareaId: !!camposRequeridos.tareaId,
        titulo: !!camposRequeridos.titulo,
        tareaDataOriginal: JSON.stringify(tareaData)
      });
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: ' + Object.entries(camposRequeridos).filter(([k, v]) => !v).map(([k]) => k).join(', ') },
        { status: 400 }
      );
    }
    
    // Construir objeto final con campos validados
    const tareaParaCrear = {
      tareaId: camposRequeridos.tareaId,
      titulo: camposRequeridos.titulo,
      prioridad: tareaData.prioridad && ['baja', 'media', 'alta', 'urgente'].includes(tareaData.prioridad) ? tareaData.prioridad : 'media',
      estado: tareaData.estado && ['pendiente', 'en_progreso', 'completada', 'cancelada'].includes(tareaData.estado) ? tareaData.estado : 'pendiente',
      completada: tareaData.completada || false
    };
    
    // Agregar campos opcionales si existen
    if (tareaData.descripcion && String(tareaData.descripcion).trim()) {
      tareaParaCrear.descripcion = String(tareaData.descripcion).trim();
    }
    if (tareaData.fechaVencimiento && tareaData.fechaVencimiento instanceof Date) {
      tareaParaCrear.fechaVencimiento = tareaData.fechaVencimiento;
    }
    if (tareaData.cliente && Object.keys(tareaData.cliente).length > 0) {
      tareaParaCrear.cliente = tareaData.cliente;
    }
    if (tareaData.etiquetas && Array.isArray(tareaData.etiquetas) && tareaData.etiquetas.length > 0) {
      tareaParaCrear.etiquetas = tareaData.etiquetas;
    }
    if (tareaData.asignados && Array.isArray(tareaData.asignados) && tareaData.asignados.length > 0) {
      tareaParaCrear.asignados = tareaData.asignados;
    }
    
    console.log('[API Tareas] Objeto final para crear:', JSON.stringify({
      ...tareaParaCrear,
      fechaVencimiento: tareaParaCrear.fechaVencimiento ? tareaParaCrear.fechaVencimiento.toISOString() : undefined
    }, null, 2));
    
    // Verificar una vez más que todos los campos requeridos estén presentes antes de crear la instancia
    console.log('[API Tareas] Verificación final antes de crear instancia:', {
      tareaId: typeof tareaParaCrear.tareaId,
      titulo: typeof tareaParaCrear.titulo,
      prioridad: typeof tareaParaCrear.prioridad,
      estado: typeof tareaParaCrear.estado,
      valores: {
        tareaId: tareaParaCrear.tareaId,
        titulo: tareaParaCrear.titulo,
        prioridad: tareaParaCrear.prioridad,
        estado: tareaParaCrear.estado
      }
    });
    
    // Actualizar estado de completada si es necesario
    if (tareaParaCrear.estado === 'completada' && !tareaParaCrear.completada) {
      tareaParaCrear.completada = true;
      tareaParaCrear.fechaCompletada = new Date();
    } else if (tareaParaCrear.estado !== 'completada' && tareaParaCrear.completada) {
      tareaParaCrear.completada = false;
      tareaParaCrear.fechaCompletada = undefined;
    }
    
    // Intentar crear la tarea usando insertOne directamente para evitar hooks
    let tarea;
    try {
      // Usar insertOne directamente desde la colección para evitar hooks
      const db = mongoose.connection.db;
      const result = await db.collection('tasks').insertOne({
        ...tareaParaCrear,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Obtener el documento creado usando findById
      tarea = await Task.findById(result.insertedId).lean();
      if (!tarea) {
        // Si lean() no funciona, obtener directamente desde la colección
        tarea = await db.collection('tasks').findOne({ _id: result.insertedId });
      }
      console.log('[API Tareas] Tarea creada exitosamente:', tarea?.tareaId || tarea?._id);
    } catch (createError) {
      console.error('[API Tareas] Error al crear en MongoDB:', createError);
      console.error('[API Tareas] tareaParaCrear que se intentó crear:', JSON.stringify(tareaParaCrear, null, 2));
      console.error('[API Tareas] Tipo de error:', createError.name);
      console.error('[API Tareas] Mensaje de error:', createError.message);
      
      if (createError.code === 11000) {
        return NextResponse.json(
          { success: false, error: 'Ya existe una tarea con ese ID' },
          { status: 400 }
        );
      }
      
      // Manejar errores de validación de Mongoose
      if (createError.name === 'ValidationError') {
        const validationErrors = Object.entries(createError.errors || {}).map(([key, err]) => {
          return `${key}: ${err.message}`;
        }).join(', ');
        return NextResponse.json(
          { success: false, error: `Error de validación: ${validationErrors}` },
          { status: 400 }
        );
      }
      
      throw createError; // Re-lanzar para que lo capture el catch externo
    }
    
    return NextResponse.json({ success: true, data: tarea }, { status: 201 });
  } catch (error) {
    console.error('[API Tareas] Error general:', error);
    console.error('[API Tareas] Stack:', error.stack);
    
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear la tarea' },
      { status: 500 }
    );
  }
}

