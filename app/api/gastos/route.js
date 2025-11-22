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
    
    const gastos = await Expense.find(query).sort({ periodo: -1, createdAt: -1 });
    return NextResponse.json({ success: true, data: gastos });
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
      body.crmId = `expense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const gasto = await Expense.create(body);
    return NextResponse.json({ success: true, data: gasto }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

