import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import MonthlyPayment from '../../../models/MonthlyPayment';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const crmClientId = searchParams.get('crmClientId');
    const clientesIds = searchParams.get('clientesIds'); // Para obtener múltiples estados a la vez
    
    const query = {};
    if (mes) query.mes = mes;
    if (crmClientId) query.crmClientId = crmClientId;
    // Si se pasan múltiples IDs, buscar todos a la vez
    if (clientesIds) {
      const idsArray = clientesIds.split(',');
      query.crmClientId = { $in: idsArray };
    }
    
    // Optimización: usar lean() y seleccionar solo campos necesarios
    // El índice compuesto { mes: 1, crmClientId: 1 } hace esta query muy rápida
    const pagos = await MonthlyPayment.find(query)
      .select('mes crmClientId pagado fechaActualizacion createdAt updatedAt')
      .sort({ mes: -1, createdAt: -1 })
      .lean()
      .maxTimeMS(3000); // Timeout reducido a 3 segundos para MongoDB Free
    
    return NextResponse.json({ success: true, data: pagos }, {
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
    // Optimizado para MongoDB Free: sin validadores para mayor velocidad
    const pago = await MonthlyPayment.create(body, { 
      runValidators: false,
      maxTimeMS: 3000 
    });
    return NextResponse.json({ success: true, data: pago }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { mes, crmClientId, pagado, fechaActualizacion } = body;
    
    // Optimización: usar lean() y el índice compuesto para update rápido
    // Optimizado para MongoDB Free: sin validadores, timeout reducido
    const pago = await MonthlyPayment.findOneAndUpdate(
      { mes, crmClientId }, // Usa el índice compuesto { mes: 1, crmClientId: 1 }
      { 
        $set: {
          pagado, 
          fechaActualizacion: fechaActualizacion || new Date(),
          updatedAt: new Date()
        }
      },
      { 
        new: true, 
        upsert: true, 
        lean: true,
        runValidators: false, // Desactivar validadores para mayor velocidad
        maxTimeMS: 3000 // Timeout de 3 segundos
      }
    ).select('-__v -__t'); // Excluir campos innecesarios
    
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

