import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Client from '../../../models/Client';

export async function GET() {
  try {
    await connectDB();
    // Optimización para servidor VPS local: queries más rápidas con índices
    // El índice en createdAt hace el sort más rápido
    const clientes = await Client.find({})
      .select('crmId nombre rubro ciudad email montoPago fechaPago pagado pagoUnico pagoMesSiguiente servicios observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean() // Usar lean() para obtener objetos planos (más rápido, sin overhead de Mongoose)
      .maxTimeMS(5000); // Timeout adecuado para servidor local
    
    return NextResponse.json({ success: true, data: clientes }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240', // Cache más largo para servidor local
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Clientes] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Optimizado para servidor local: validadores habilitados pero con timeout adecuado
    const cliente = await Client.create(body, { 
      runValidators: true, // Habilitar validadores para integridad de datos
      maxTimeMS: 5000 // Timeout adecuado para servidor local
    });
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

