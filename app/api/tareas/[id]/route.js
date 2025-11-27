import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Task from '../../../../models/Task';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    const tarea = await Task.findOne({ tareaId: id }).lean().maxTimeMS(30000);
    
    if (!tarea) {
      return NextResponse.json(
        { success: false, error: 'Tarea no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: tarea });
  } catch (error) {
    console.error('[API Tareas] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    const body = await request.json();
    
    const updateData = {};
    
    if (body.titulo !== undefined) {
      if (!body.titulo || !body.titulo.trim()) {
        return NextResponse.json(
          { success: false, error: 'El título no puede estar vacío' },
          { status: 400 }
        );
      }
      updateData.titulo = String(body.titulo).trim();
    }
    
    if (body.descripcion !== undefined) {
      updateData.descripcion = body.descripcion && body.descripcion.trim()
        ? String(body.descripcion).trim()
        : undefined;
    }
    
    if (body.fechaVencimiento !== undefined) {
      if (body.fechaVencimiento) {
        let fechaDate;
        if (typeof body.fechaVencimiento === 'string' && body.fechaVencimiento.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Formato YYYY-MM-DD - parsear manualmente para evitar problemas de zona horaria
          const [año, mes, dia] = body.fechaVencimiento.split('-').map(Number);
          fechaDate = new Date(año, mes - 1, dia, 12, 0, 0, 0); // Usar mediodía para evitar cambios de día
        } else {
          fechaDate = new Date(body.fechaVencimiento);
        }
        updateData.fechaVencimiento = !isNaN(fechaDate.getTime()) ? fechaDate : undefined;
      } else {
        updateData.fechaVencimiento = undefined;
      }
    }
    
    if (body.prioridad !== undefined) {
      if (!['baja', 'media', 'alta', 'urgente'].includes(body.prioridad)) {
        return NextResponse.json(
          { success: false, error: 'La prioridad debe ser: baja, media, alta o urgente' },
          { status: 400 }
        );
      }
      updateData.prioridad = String(body.prioridad);
    }
    
    if (body.estado !== undefined) {
      if (!['pendiente', 'en_progreso', 'completada', 'cancelada'].includes(body.estado)) {
        return NextResponse.json(
          { success: false, error: 'El estado debe ser: pendiente, en_progreso, completada o cancelada' },
          { status: 400 }
        );
      }
      updateData.estado = String(body.estado);
      
      // Auto-actualizar completada según el estado
      if (body.estado === 'completada') {
        updateData.completada = true;
        updateData.fechaCompletada = new Date();
      } else if (body.estado !== 'completada') {
        updateData.completada = false;
        updateData.fechaCompletada = undefined;
      }
    }
    
    if (body.completada !== undefined) {
      updateData.completada = Boolean(body.completada);
      if (updateData.completada && !updateData.estado) {
        updateData.estado = 'completada';
        updateData.fechaCompletada = new Date();
      } else if (!updateData.completada && !updateData.estado) {
        updateData.estado = 'pendiente';
        updateData.fechaCompletada = undefined;
      }
    }
    
    if (body.cliente !== undefined) {
      if (body.cliente === null) {
        updateData.cliente = undefined;
      } else {
        updateData.cliente = {
          ...(body.cliente.nombre && { nombre: String(body.cliente.nombre).trim() }),
          ...(body.cliente.crmId && { crmId: String(body.cliente.crmId).trim() })
        };
      }
    }
    
    if (body.etiquetas !== undefined) {
      if (Array.isArray(body.etiquetas)) {
        updateData.etiquetas = body.etiquetas
          .map(et => String(et).trim())
          .filter(et => et.length > 0);
      }
    }
    
    if (body.asignados !== undefined) {
      if (Array.isArray(body.asignados)) {
        updateData.asignados = body.asignados
          .map(a => String(a).trim())
          .filter(a => a.length > 0);
      }
    }
    
    const tarea = await Task.findOneAndUpdate(
      { tareaId: id },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean().maxTimeMS(30000);
    
    if (!tarea) {
      return NextResponse.json(
        { success: false, error: 'Tarea no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: tarea });
  } catch (error) {
    console.error('[API Tareas] Error al actualizar:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al actualizar la tarea' },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    const tarea = await Task.findOneAndDelete({ tareaId: id }).lean().maxTimeMS(30000);
    
    if (!tarea) {
      return NextResponse.json(
        { success: false, error: 'Tarea no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, message: 'Tarea eliminada correctamente' });
  } catch (error) {
    console.error('[API Tareas] Error al eliminar:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

