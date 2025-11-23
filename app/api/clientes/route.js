import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Client from '../../../models/Client';

export async function GET() {
  try {
    await connectDB();
    // Optimización: traer solo los campos necesarios, usar lean() y timeout reducido
    // El índice en createdAt hace el sort más rápido
    const clientes = await Client.find({})
      .select('crmId nombre rubro ciudad email montoPago fechaPago pagado pagoUnico pagoMesSiguiente servicios observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean() // Usar lean() para obtener objetos planos (más rápido, sin overhead de Mongoose)
      .maxTimeMS(3000); // Timeout reducido a 3 segundos para MongoDB Free
    
    return NextResponse.json({ success: true, data: clientes }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
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
  try {
    await connectDB();
    const body = await request.json();
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Optimizado para MongoDB Free: sin validadores para mayor velocidad
    const cliente = await Client.create(body, { 
      runValidators: false,
      maxTimeMS: 3000 
    });
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

