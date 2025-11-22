import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import User from '../../../models/User';

export async function GET() {
  try {
    await connectDB();
    const usuarios = await User.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: usuarios });
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
      body.crmId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const usuario = await User.create(body);
    return NextResponse.json({ success: true, data: usuario }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

