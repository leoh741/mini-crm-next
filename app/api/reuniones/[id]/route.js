import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Meeting from '../../../../models/Meeting';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    const reunion = await Meeting.findOne({ reunionId: id }).lean().maxTimeMS(30000);
    
    if (!reunion) {
      return NextResponse.json(
        { success: false, error: 'Reunión no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: reunion });
  } catch (error) {
    console.error('[API Reuniones] Error:', error);
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
    
    if (body.fecha !== undefined) {
      // Parsear la fecha en formato YYYY-MM-DD y crear Date en hora local para evitar problemas de zona horaria
      let fechaDate;
      if (typeof body.fecha === 'string' && body.fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Formato YYYY-MM-DD - parsear manualmente para evitar problemas de zona horaria
        const [año, mes, dia] = body.fecha.split('-').map(Number);
        fechaDate = new Date(año, mes - 1, dia, 12, 0, 0, 0); // Usar mediodía para evitar cambios de día
      } else {
        fechaDate = new Date(body.fecha);
      }
      
      if (isNaN(fechaDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'La fecha proporcionada no es válida' },
          { status: 400 }
        );
      }
      
      updateData.fecha = fechaDate;
    }
    
    if (body.hora !== undefined) {
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(body.hora)) {
        return NextResponse.json(
          { success: false, error: 'La hora debe estar en formato HH:MM (24 horas)' },
          { status: 400 }
        );
      }
      updateData.hora = String(body.hora).trim();
    }
    
    if (body.tipo !== undefined) {
      if (!['meet', 'oficina'].includes(body.tipo)) {
        return NextResponse.json(
          { success: false, error: 'El tipo debe ser "meet" u "oficina"' },
          { status: 400 }
        );
      }
      updateData.tipo = String(body.tipo);
    }
    
    if (body.completada !== undefined) {
      updateData.completada = Boolean(body.completada);
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
    
    if (body.linkMeet !== undefined) {
      updateData.linkMeet = body.linkMeet && body.linkMeet.trim() 
        ? String(body.linkMeet).trim() 
        : undefined;
    }
    
    if (body.observaciones !== undefined) {
      updateData.observaciones = body.observaciones && body.observaciones.trim()
        ? String(body.observaciones).trim()
        : undefined;
    }
    
    if (body.asignados !== undefined) {
      if (Array.isArray(body.asignados)) {
        updateData.asignados = body.asignados
          .map(a => String(a).trim())
          .filter(a => a.length > 0);
      }
    }
    
    const reunion = await Meeting.findOneAndUpdate(
      { reunionId: id },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean().maxTimeMS(30000);
    
    if (!reunion) {
      return NextResponse.json(
        { success: false, error: 'Reunión no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: reunion });
  } catch (error) {
    console.error('[API Reuniones] Error al actualizar:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al actualizar la reunión' },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    const reunion = await Meeting.findOneAndDelete({ reunionId: id }).lean().maxTimeMS(30000);
    
    if (!reunion) {
      return NextResponse.json(
        { success: false, error: 'Reunión no encontrada' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, message: 'Reunión eliminada correctamente' });
  } catch (error) {
    console.error('[API Reuniones] Error al eliminar:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

