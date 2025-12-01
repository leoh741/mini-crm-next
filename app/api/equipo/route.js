import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import TeamMember from '../../../models/TeamMember';

export async function GET() {
  try {
    await connectDB();
    
    const miembros = await TeamMember.find({})
      .select('_id crmId nombre cargo email telefono calificacion comentarios habilidades activo createdAt updatedAt')
      .sort({ nombre: 1 })
      .lean()
      .maxTimeMS(15000);
    
    return NextResponse.json({ success: true, data: miembros }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Equipo] Error completo:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    await connectDB();
    
    // Leer el body de forma segura
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[API Equipo POST] Error al parsear JSON:', parseError);
      return NextResponse.json(
        { success: false, error: 'Error al procesar los datos enviados' },
        { status: 400 }
      );
    }
    
    console.log('[API Equipo POST] Body recibido (raw):', body);
    console.log('[API Equipo POST] Body recibido (JSON):', JSON.stringify(body, null, 2));
    console.log('[API Equipo POST] Tipo de body:', typeof body);
    console.log('[API Equipo POST] Keys del body:', Object.keys(body || {}));
    
    // Validar que el body sea un objeto
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      console.error('[API Equipo POST] Error: body no es un objeto válido');
      return NextResponse.json(
        { success: false, error: 'Los datos enviados no son válidos' },
        { status: 400 }
      );
    }
    
    // Validar que el nombre esté presente y no esté vacío
    if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim() === '') {
      console.error('[API Equipo POST] Error: nombre inválido o vacío. Nombre recibido:', body.nombre);
      return NextResponse.json(
        { success: false, error: 'El nombre es requerido y no puede estar vacío' },
        { status: 400 }
      );
    }
    
    // Preparar datos del miembro - asegurar que nombre y crmId estén presentes
    const nombreLimpio = String(body.nombre).trim();
    const crmIdGenerado = body.crmId ? String(body.crmId).trim() : `team-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    // Construir objeto de datos paso a paso para asegurar que los campos requeridos estén presentes
    const datosMiembro = {};
    datosMiembro.nombre = nombreLimpio;
    datosMiembro.crmId = crmIdGenerado;
    datosMiembro.activo = body.activo !== undefined ? Boolean(body.activo) : true;
    datosMiembro.calificacion = 0;
    datosMiembro.habilidades = [];
    
    // Agregar campos opcionales solo si tienen valor
    if (body.cargo && String(body.cargo).trim()) {
      datosMiembro.cargo = String(body.cargo).trim();
    }
    if (body.email && String(body.email).trim()) {
      datosMiembro.email = String(body.email).trim();
    }
    if (body.telefono && String(body.telefono).trim()) {
      datosMiembro.telefono = String(body.telefono).trim();
    }
    
    // Validar y asignar calificación
    if (body.calificacion !== undefined && body.calificacion !== null && body.calificacion !== '') {
      const calificacionNum = parseFloat(body.calificacion);
      if (!isNaN(calificacionNum)) {
        datosMiembro.calificacion = Math.max(0, Math.min(10, calificacionNum));
      }
    }
    
    // Agregar habilidades si vienen
    if (body.habilidades && Array.isArray(body.habilidades)) {
      datosMiembro.habilidades = body.habilidades
        .map(h => String(h).trim().toLowerCase())
        .filter(h => h);
    }
    
    // Verificar que los campos requeridos estén presentes antes de crear
    if (!datosMiembro.nombre || !datosMiembro.crmId) {
      console.error('[API Equipo POST] Error: campos requeridos faltantes');
      console.error('[API Equipo POST] nombre:', datosMiembro.nombre);
      console.error('[API Equipo POST] crmId:', datosMiembro.crmId);
      return NextResponse.json(
        { success: false, error: 'Error interno: campos requeridos no están presentes' },
        { status: 500 }
      );
    }
    
    console.log('[API Equipo POST] Datos a crear:', JSON.stringify(datosMiembro, null, 2));
    console.log('[API Equipo POST] Verificación - nombre existe?', !!datosMiembro.nombre);
    console.log('[API Equipo POST] Verificación - crmId existe?', !!datosMiembro.crmId);
    
    // Crear el documento usando new TeamMember() para tener más control
    const miembro = new TeamMember(datosMiembro);
    await miembro.save({ validateBeforeSave: true });
    
    console.log('[API Equipo POST] Miembro creado exitosamente:', miembro._id);
    
    return NextResponse.json({ success: true, data: miembro }, { status: 201 });
  } catch (error) {
    console.error('[API Equipo POST] Error completo:', error);
    console.error('[API Equipo POST] Error name:', error.name);
    console.error('[API Equipo POST] Error message:', error.message);
    console.error('[API Equipo POST] Stack:', error.stack);
    if (body) {
      console.error('[API Equipo POST] Body recibido en catch:', JSON.stringify(body, null, 2));
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

