import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Expense from '../../../models/Expense';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    
    const query = {};
    if (periodo) query.periodo = periodo;
    
    const gastos = await Expense.find(query)
      .select('crmId descripcion monto fecha categoria fechaCreacion createdAt updatedAt')
      .sort({ periodo: -1, fecha: -1 }) // Usar índice compuesto (periodo, fecha)
      .lean()
      .maxTimeMS(10000); // Timeout optimizado para VPS (10 segundos)
    
    return NextResponse.json({ success: true, data: gastos }, {
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
  try {
    await connectDB();
    const body = await request.json();
    
    // Generar crmId si no viene
    if (!body.crmId) {
      body.crmId = `expense-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // Optimizado para servidor local: validadores habilitados
    const gasto = await Expense.create(body, { 
      runValidators: true, // Habilitar validadores para integridad
      maxTimeMS: 5000 // Timeout adecuado para servidor local
    });
    
    // Convertir a objeto plano para asegurar serialización correcta
    const gastoData = gasto.toObject ? gasto.toObject() : gasto;
    
    return NextResponse.json({ success: true, data: gastoData }, { status: 201 });
  } catch (error) {
    console.error('Error al crear gasto:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

