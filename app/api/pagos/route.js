import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import MonthlyPayment from '../../../models/MonthlyPayment';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const crmClientId = searchParams.get('crmClientId');
    
    const query = {};
    if (mes) query.mes = mes;
    if (crmClientId) query.crmClientId = crmClientId;
    
    const pagos = await MonthlyPayment.find(query).sort({ mes: -1, createdAt: -1 });
    return NextResponse.json({ success: true, data: pagos });
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
    const pago = await MonthlyPayment.create(body);
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
    
    const pago = await MonthlyPayment.findOneAndUpdate(
      { mes, crmClientId },
      { pagado, fechaActualizacion: fechaActualizacion || new Date() },
      { new: true, upsert: true }
    );
    
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

