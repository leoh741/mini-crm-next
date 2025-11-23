import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Income from '../../../models/Income';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    
    const query = {};
    if (periodo) query.periodo = periodo;
    
    const ingresos = await Income.find(query)
      .select('crmId descripcion monto fecha categoria fechaCreacion createdAt updatedAt')
      .sort({ periodo: -1, createdAt: -1 })
      .lean()
      .maxTimeMS(3000); // Timeout reducido para MongoDB Free
    
    return NextResponse.json({ success: true, data: ingresos }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
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
      body.crmId = `income-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Optimizado para MongoDB Free: sin validadores para mayor velocidad
    const ingreso = await Income.create(body, { 
      runValidators: false,
      maxTimeMS: 3000 
    });
    return NextResponse.json({ success: true, data: ingreso }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

