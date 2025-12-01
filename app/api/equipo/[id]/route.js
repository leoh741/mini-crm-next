import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import TeamMember from '../../../../models/TeamMember';
import mongoose from 'mongoose';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    // Intentar buscar por _id primero, luego por crmId
    let miembro = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      miembro = await TeamMember.findById(id)
        .select('_id crmId nombre cargo email telefono calificacion comentarios habilidades activo createdAt updatedAt')
        .lean()
        .maxTimeMS(30000);
    }
    
    if (!miembro) {
      miembro = await TeamMember.findOne({ crmId: id })
        .select('_id crmId nombre cargo email telefono calificacion comentarios habilidades activo createdAt updatedAt')
        .lean()
        .maxTimeMS(30000);
    }
    
    if (!miembro) {
      return NextResponse.json(
        { success: false, error: 'Miembro del equipo no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: miembro });
  } catch (error) {
    console.error('[API Equipo GET] Error completo:', error);
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
    
    // Buscar el miembro
    let miembro = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      miembro = await TeamMember.findById(id);
    }
    
    if (!miembro) {
      miembro = await TeamMember.findOne({ crmId: id });
    }
    
    if (!miembro) {
      return NextResponse.json(
        { success: false, error: 'Miembro del equipo no encontrado' },
        { status: 404 }
      );
    }
    
    // Preparar datos de actualización
    const updateData = {};
    
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.cargo !== undefined) updateData.cargo = body.cargo;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.telefono !== undefined) updateData.telefono = body.telefono;
    if (body.activo !== undefined) updateData.activo = body.activo;
    
    // Actualizar habilidades si viene
    if (body.habilidades !== undefined) {
      updateData.habilidades = Array.isArray(body.habilidades) 
        ? body.habilidades.map(h => String(h).trim().toLowerCase()).filter(h => h)
        : [];
    }
    
    // Validar y actualizar calificación
    if (body.calificacion !== undefined) {
      updateData.calificacion = Math.max(0, Math.min(10, parseFloat(body.calificacion) || 0));
    }
    
    // Agregar comentario si viene
    if (body.nuevoComentario) {
      const nuevoComentario = {
        texto: body.nuevoComentario.texto,
        autor: body.nuevoComentario.autor,
        fecha: new Date(),
        calificacion: body.nuevoComentario.calificacion !== undefined 
          ? Math.max(0, Math.min(10, parseFloat(body.nuevoComentario.calificacion) || 0))
          : undefined
      };
      
      if (!miembro.comentarios) {
        miembro.comentarios = [];
      }
      miembro.comentarios.push(nuevoComentario);
      updateData.comentarios = miembro.comentarios;
    }
    
    // Actualizar comentario existente
    if (body.actualizarComentario) {
      const { comentarioId, texto, calificacion } = body.actualizarComentario;
      if (miembro.comentarios && miembro.comentarios[comentarioId]) {
        if (texto !== undefined) miembro.comentarios[comentarioId].texto = texto;
        if (calificacion !== undefined) {
          miembro.comentarios[comentarioId].calificacion = Math.max(0, Math.min(10, parseFloat(calificacion) || 0));
        }
        updateData.comentarios = miembro.comentarios;
      }
    }
    
    // Eliminar comentario
    if (body.eliminarComentario !== undefined) {
      if (miembro.comentarios) {
        miembro.comentarios.splice(body.eliminarComentario, 1);
        updateData.comentarios = miembro.comentarios;
      }
    }
    
    const miembroActualizado = await TeamMember.findByIdAndUpdate(
      miembro._id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
        maxTimeMS: 30000,
        lean: true
      }
    ).select('_id crmId nombre cargo email telefono calificacion comentarios habilidades activo createdAt updatedAt');
    
    return NextResponse.json({ success: true, data: miembroActualizado });
  } catch (error) {
    console.error('[API Equipo PUT] Error completo:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { id } = params;
    
    // Buscar el miembro
    let miembro = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      miembro = await TeamMember.findById(id);
    }
    
    if (!miembro) {
      miembro = await TeamMember.findOne({ crmId: id });
    }
    
    if (!miembro) {
      return NextResponse.json(
        { success: false, error: 'Miembro del equipo no encontrado' },
        { status: 404 }
      );
    }
    
    // Eliminar físicamente
    await TeamMember.findByIdAndDelete(miembro._id);
    
    return NextResponse.json({ success: true, message: 'Miembro del equipo eliminado' });
  } catch (error) {
    console.error('[API Equipo DELETE] Error completo:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

