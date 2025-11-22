import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Client from '../../../models/Client';

export async function GET() {
  try {
    await connectDB();
    const clientes = await Client.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: clientes });
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
    
    const cliente = await Client.create(body);
    return NextResponse.json({ success: true, data: cliente }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

