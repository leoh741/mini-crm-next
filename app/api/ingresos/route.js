import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Income from '../../../models/Income';

// Configurar para que Next.js no consuma el body automáticamente
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    
    const query = {};
    if (periodo) query.periodo = periodo;
    
    const ingresos = await Income.find(query)
      .select('crmId descripcion monto fecha categoria fechaCreacion createdAt updatedAt')
      .sort({ periodo: -1, fecha: -1 }) // Usar índice compuesto (periodo, fecha)
      .lean()
      .maxTimeMS(10000); // Timeout optimizado para VPS (10 segundos)
    
    return NextResponse.json({ success: true, data: ingresos }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240', // Cache más largo para servidor local
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  console.log('🚀 POST /api/ingresos - INICIO');
  
  try {
    await connectDB();
    
    // Log del request antes de leer el body
    console.log('📋 REQUEST INFO:');
    console.log('  Method:', request.method);
    console.log('  URL:', request.url);
    const headers = Object.fromEntries(request.headers.entries());
    console.log('  Headers:', JSON.stringify(headers, null, 2));
    console.log('  Content-Type:', request.headers.get('content-type'));
    console.log('  Content-Length:', request.headers.get('content-length'));
    
    // Leer el body directamente como JSON
    // En Next.js, el body solo se puede leer una vez
    let body;
    try {
      console.log('📥 Intentando leer body como JSON...');
      body = await request.json();
      console.log('✅ Body leído exitosamente');
    } catch (error) {
      console.error('❌ Error al leer body como JSON:', error);
      console.error('  Message:', error.message);
      console.error('  Name:', error.name);
      
      // Si falla, retornar error descriptivo
      return NextResponse.json(
        { 
          success: false, 
          error: `Error al leer el body: ${error.message}. Verifica que el cliente esté enviando los datos correctamente.` 
        },
        { status: 400 }
      );
    }
    
    // Verificar que el body no esté vacío
    if (!body) {
      console.error('❌ Body es null o undefined');
      return NextResponse.json(
        { success: false, error: 'El body de la petición está vacío (null/undefined)' },
        { status: 400 }
      );
    }
    
    if (typeof body !== 'object') {
      console.error('❌ Body no es un objeto:', typeof body, body);
      return NextResponse.json(
        { success: false, error: `El body debe ser un objeto, pero es: ${typeof body}` },
        { status: 400 }
      );
    }
    
    if (Array.isArray(body)) {
      console.error('❌ Body es un array en lugar de objeto');
      return NextResponse.json(
        { success: false, error: 'El body no puede ser un array, debe ser un objeto' },
        { status: 400 }
      );
    }
    
    const bodyKeys = Object.keys(body);
    if (bodyKeys.length === 0) {
      console.error('❌ Body es un objeto vacío');
      return NextResponse.json(
        { success: false, error: 'El body de la petición está vacío (objeto sin propiedades)' },
        { status: 400 }
      );
    }
    
    // Logs detallados para debugging
    console.log('=== INICIO LOG API INGRESOS ===');
    console.log('Body recibido:', JSON.stringify(body, null, 2));
    console.log('Tipo de body:', typeof body);
    console.log('Es array?', Array.isArray(body));
    console.log('Es null?', body === null);
    console.log('Es undefined?', body === undefined);
    console.log('Keys:', body && typeof body === 'object' ? Object.keys(body) : 'N/A');
    console.log('Periodo:', body?.periodo, 'Tipo:', typeof body?.periodo);
    console.log('Descripción:', body?.descripcion, 'Tipo:', typeof body?.descripcion);
    console.log('Monto:', body?.monto, 'Tipo:', typeof body?.monto);
    console.log('=== FIN LOG API INGRESOS ===');
    
    // Validar que body sea un objeto válido
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      console.error('Body inválido:', body);
      return NextResponse.json(
        { success: false, error: 'El body debe ser un objeto JSON válido' },
        { status: 400 }
      );
    }
    
    // Validar campos requeridos con mensajes más claros
    const errores = [];
    if (!body.periodo || (typeof body.periodo === 'string' && body.periodo.trim() === '')) {
      errores.push('periodo es requerido');
    }
    if (!body.descripcion || (typeof body.descripcion === 'string' && body.descripcion.trim() === '')) {
      errores.push('descripcion es requerida');
    }
    if (body.monto === undefined || body.monto === null || body.monto === '') {
      errores.push('monto es requerido');
    }
    
    if (errores.length > 0) {
      console.error('Errores de validación:', errores);
      console.error('Body completo:', JSON.stringify(body, null, 2));
      return NextResponse.json(
        { success: false, error: `Errores de validación: ${errores.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `income-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // Optimizado para servidor local: validadores habilitados
    const ingreso = await Income.create(body, { 
      runValidators: true, // Habilitar validadores para integridad
      maxTimeMS: 5000 // Timeout adecuado para servidor local
    });
    
    // Convertir a objeto plano para asegurar serialización correcta
    const ingresoData = ingreso.toObject ? ingreso.toObject() : ingreso;
    
    return NextResponse.json({ success: true, data: ingresoData }, { status: 201 });
  } catch (error) {
    console.error('Error al crear ingreso:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

