import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Meeting from '../../../models/Meeting';
import mongoose from 'mongoose';

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get('fecha');
    const completada = searchParams.get('completada');
    const proximas = searchParams.get('proximas'); // Si es 'true', solo devolver próximas 24 horas
    
    let query = {};
    
    if (fecha) {
      // Parsear fecha en formato YYYY-MM-DD y crear rango del día completo
      // Usar hora local (no UTC) para que coincida con cómo se guardan las fechas
      const [año, mes, dia] = fecha.split('-').map(Number);
      
      // Crear rango amplio para evitar problemas de zona horaria
      // Las fechas se guardan a las 12:00 (mediodía) en hora local
      // Inicio: día anterior a las 00:00 (para capturar fechas guardadas a las 12:00 del día anterior en UTC)
      const fechaInicio = new Date(año, mes - 1, dia - 1, 0, 0, 0, 0);
      // Fin: día siguiente a las 23:59 (para capturar todas las fechas del día)
      const fechaFin = new Date(año, mes - 1, dia + 1, 23, 59, 59, 999);
      
      query.fecha = { $gte: fechaInicio, $lte: fechaFin };
      
      // Log temporal para debug
      console.log('[API Reuniones] Filtro por fecha:', {
        fechaBuscada: fecha,
        fechaInicio: fechaInicio.toISOString(),
        fechaFin: fechaFin.toISOString(),
        fechaInicioLocal: fechaInicio.toLocaleString('es-AR'),
        fechaFinLocal: fechaFin.toLocaleString('es-AR'),
        fechaInicioUTC: fechaInicio.toUTCString(),
        fechaFinUTC: fechaFin.toUTCString()
      });
    }
    
    if (completada !== null && completada !== undefined) {
      query.completada = completada === 'true';
    }
    
    // Para reuniones próximas: no completadas, del día actual y próximas 24 horas
    if (proximas === 'true') {
      query.completada = false;
      const ahora = new Date();
      const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0); // Inicio del día actual
      const en24Horas = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
      // Incluir desde el inicio del día actual hasta 24 horas desde ahora
      query.fecha = { $gte: hoy, $lte: en24Horas };
    }
    
    const reuniones = await Meeting.find(query)
      .select('reunionId titulo fecha hora tipo cliente linkMeet observaciones asignados completada createdAt updatedAt')
      .sort({ fecha: 1, hora: 1 })
      .lean()
      .maxTimeMS(15000); // Timeout optimizado para VPS (15 segundos)
      // Nota: No agregamos límite aquí porque el filtro ya limita los resultados
    
    // Log temporal para debug
    if (fecha) {
      console.log('[API Reuniones] Reuniones encontradas:', reuniones.length, reuniones.map(r => ({
        titulo: r.titulo,
        fecha: r.fecha,
        fechaISO: r.fecha?.toISOString?.(),
        fechaLocal: r.fecha?.toLocaleString?.('es-AR'),
        completada: r.completada
      })));
    }
    
    return NextResponse.json({ success: true, data: reuniones }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Reuniones] Error:', error);
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
    console.log('[API Reuniones] Content-Type:', contentType);
    
    // Parsear body con manejo de errores robusto
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[API Reuniones] Error al parsear JSON:', parseError);
      // Intentar leer como texto para debugging
      try {
        const text = await request.text();
        console.error('[API Reuniones] Body como texto (fallback):', text);
      } catch (textError) {
        console.error('[API Reuniones] No se pudo leer el body:', textError);
      }
      return NextResponse.json(
        { success: false, error: 'Error al procesar los datos enviados. Por favor, verifica que todos los campos estén completos.' },
        { status: 400 }
      );
    }
    
    console.log('[API Reuniones] Body recibido:', JSON.stringify(body, null, 2));
    console.log('[API Reuniones] Body es objeto?:', typeof body === 'object' && body !== null);
    console.log('[API Reuniones] Keys del body:', body ? Object.keys(body) : 'body es null/undefined');
    
    // Validar campos requeridos básicos
    if (!body.titulo || typeof body.titulo !== 'string' || !body.titulo.trim()) {
      return NextResponse.json(
        { success: false, error: 'El título de la reunión es requerido' },
        { status: 400 }
      );
    }
    
    if (!body.fecha) {
      return NextResponse.json(
        { success: false, error: 'La fecha es requerida' },
        { status: 400 }
      );
    }
    
    if (!body.hora || typeof body.hora !== 'string' || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(body.hora.trim())) {
      return NextResponse.json(
        { success: false, error: 'La hora es requerida y debe estar en formato HH:MM (24 horas)' },
        { status: 400 }
      );
    }
    
    if (!body.tipo || typeof body.tipo !== 'string' || !['meet', 'oficina'].includes(body.tipo)) {
      return NextResponse.json(
        { success: false, error: 'El tipo de reunión es requerido (meet u oficina)' },
        { status: 400 }
      );
    }
    
    // Generar reunionId si no viene (asegurar que siempre exista)
    if (!body.reunionId || typeof body.reunionId !== 'string' || !body.reunionId.trim()) {
      body.reunionId = `reunion-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // Parsear fecha en formato YYYY-MM-DD a Date en hora local
    let fechaDate;
    if (typeof body.fecha === 'string' && body.fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [año, mes, dia] = body.fecha.split('-').map(Number);
      fechaDate = new Date(año, mes - 1, dia, 12, 0, 0, 0);
    } else {
      fechaDate = new Date(body.fecha);
    }
    
    if (isNaN(fechaDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'La fecha proporcionada no es válida' },
        { status: 400 }
      );
    }
    
    // Preparar datos modificando el body directamente (similar a otros endpoints)
    body.reunionId = String(body.reunionId).trim();
    body.titulo = String(body.titulo).trim();
    body.fecha = fechaDate; // Ya convertido a Date
    body.hora = String(body.hora).trim();
    body.tipo = String(body.tipo);
    body.completada = Boolean(body.completada || false);
    
    // Limpiar campos opcionales
    if (body.cliente) {
      body.cliente = {
        ...(body.cliente.nombre && body.cliente.nombre.trim() ? { nombre: String(body.cliente.nombre).trim() } : {}),
        ...(body.cliente.crmId && body.cliente.crmId.trim() ? { crmId: String(body.cliente.crmId).trim() } : {})
      };
      if (Object.keys(body.cliente).length === 0) {
        delete body.cliente;
      }
    }
    
    if (body.linkMeet && body.linkMeet.trim()) {
      body.linkMeet = String(body.linkMeet).trim();
    } else {
      delete body.linkMeet;
    }
    
    if (body.observaciones && body.observaciones.trim()) {
      body.observaciones = String(body.observaciones).trim();
    } else {
      delete body.observaciones;
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
    
    // Crear objeto final con todos los campos requeridos (usar body directamente)
    const reunionData = {
      reunionId: body.reunionId,
      titulo: body.titulo,
      fecha: body.fecha, // Ya está convertido a Date
      hora: body.hora,
      tipo: body.tipo,
      completada: body.completada
    };
    
    // Agregar campos opcionales solo si existen
    if (body.cliente && Object.keys(body.cliente).length > 0) {
      reunionData.cliente = body.cliente;
    }
    if (body.linkMeet) {
      reunionData.linkMeet = body.linkMeet;
    }
    if (body.observaciones) {
      reunionData.observaciones = body.observaciones;
    }
    
    // Verificar una vez más que todos los campos requeridos estén presentes
    if (!reunionData.reunionId || !reunionData.titulo || !reunionData.fecha || !reunionData.hora || !reunionData.tipo) {
      console.error('[API Reuniones] ERROR: Campos faltantes antes de crear:', {
        reunionId: !!reunionData.reunionId,
        titulo: !!reunionData.titulo,
        fecha: !!reunionData.fecha,
        hora: !!reunionData.hora,
        tipo: !!reunionData.tipo,
        reunionData: JSON.stringify(reunionData)
      });
      return NextResponse.json(
        { success: false, error: 'Error interno: Faltan campos requeridos' },
        { status: 500 }
      );
    }
    
    // Verificar que ningún campo requerido sea undefined, null o string vacío
    const camposRequeridos = {
      reunionId: reunionData.reunionId && String(reunionData.reunionId).trim(),
      titulo: reunionData.titulo && String(reunionData.titulo).trim(),
      fecha: reunionData.fecha instanceof Date ? reunionData.fecha : null,
      hora: reunionData.hora && String(reunionData.hora).trim(),
      tipo: reunionData.tipo && String(reunionData.tipo).trim()
    };
    
    console.log('[API Reuniones] Verificación final de campos requeridos:', camposRequeridos);
    
    // Si algún campo requerido falta o está vacío, retornar error
    if (!camposRequeridos.reunionId || !camposRequeridos.titulo || !camposRequeridos.fecha || !camposRequeridos.hora || !camposRequeridos.tipo) {
      console.error('[API Reuniones] ERROR: Campos requeridos faltantes o inválidos:', {
        reunionId: !!camposRequeridos.reunionId,
        titulo: !!camposRequeridos.titulo,
        fecha: !!camposRequeridos.fecha,
        hora: !!camposRequeridos.hora,
        tipo: !!camposRequeridos.tipo,
        reunionDataOriginal: JSON.stringify(reunionData)
      });
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: ' + Object.entries(camposRequeridos).filter(([k, v]) => !v).map(([k]) => k).join(', ') },
        { status: 400 }
      );
    }
    
    // Construir objeto final con campos validados
    const reunionParaCrear = {
      reunionId: camposRequeridos.reunionId,
      titulo: camposRequeridos.titulo,
      fecha: camposRequeridos.fecha,
      hora: camposRequeridos.hora,
      tipo: camposRequeridos.tipo,
      completada: reunionData.completada || false
    };
    
    // Agregar campos opcionales si existen
    if (reunionData.cliente && Object.keys(reunionData.cliente).length > 0) {
      reunionParaCrear.cliente = reunionData.cliente;
    }
    if (reunionData.linkMeet && String(reunionData.linkMeet).trim()) {
      reunionParaCrear.linkMeet = String(reunionData.linkMeet).trim();
    }
    if (reunionData.observaciones && String(reunionData.observaciones).trim()) {
      reunionParaCrear.observaciones = String(reunionData.observaciones).trim();
    }
    
    console.log('[API Reuniones] Objeto final para crear:', JSON.stringify({
      ...reunionParaCrear,
      fecha: reunionParaCrear.fecha.toISOString()
    }, null, 2));
    
    // Verificar una vez más que todos los campos requeridos estén presentes antes de crear la instancia
    console.log('[API Reuniones] Verificación final antes de crear instancia:', {
      reunionId: typeof reunionParaCrear.reunionId,
      titulo: typeof reunionParaCrear.titulo,
      fecha: reunionParaCrear.fecha instanceof Date,
      hora: typeof reunionParaCrear.hora,
      tipo: typeof reunionParaCrear.tipo,
      valores: {
        reunionId: reunionParaCrear.reunionId,
        titulo: reunionParaCrear.titulo,
        fecha: reunionParaCrear.fecha?.toISOString(),
        hora: reunionParaCrear.hora,
        tipo: reunionParaCrear.tipo
      }
    });
    
    // Intentar crear la reunión usando insertOne directamente para evitar hooks
    let reunion;
    try {
      // Usar insertOne directamente desde la colección para evitar hooks
      const db = mongoose.connection.db;
      const result = await db.collection('meetings').insertOne({
        ...reunionParaCrear,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Obtener el documento creado usando findById
      reunion = await Meeting.findById(result.insertedId).lean();
      if (!reunion) {
        // Si lean() no funciona, obtener directamente desde la colección
        reunion = await db.collection('meetings').findOne({ _id: result.insertedId });
      }
      console.log('[API Reuniones] Reunión creada exitosamente:', reunion?.reunionId || reunion?._id);
    } catch (createError) {
      console.error('[API Reuniones] Error al crear en MongoDB:', createError);
      console.error('[API Reuniones] reunionParaCrear que se intentó crear:', JSON.stringify(reunionParaCrear, null, 2));
      console.error('[API Reuniones] Tipo de error:', createError.name);
      console.error('[API Reuniones] Mensaje de error:', createError.message);
      
      if (createError.code === 11000) {
        return NextResponse.json(
          { success: false, error: 'Ya existe una reunión con ese ID' },
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
    
    return NextResponse.json({ success: true, data: reunion }, { status: 201 });
  } catch (error) {
    console.error('[API Reuniones] Error general:', error);
    console.error('[API Reuniones] Stack:', error.stack);
    
    return NextResponse.json(
      { success: false, error: error.message || 'Error al crear la reunión' },
      { status: 500 }
    );
  }
}

