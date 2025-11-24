import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import User from '../../../../models/User';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const usuario = await User.findById(params.id)
      .select('crmId nombre email password rol fechaCreacion')
      .lean()
      .maxTimeMS(5000); // Timeout adecuado para servidor local
    
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: usuario });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const body = await request.json();
    const usuario = await User.findByIdAndUpdate(
      params.id,
      body,
      { 
        new: true, 
        runValidators: true, // Habilitar validadores para integridad
        lean: true,
        maxTimeMS: 5000 // Timeout adecuado para servidor local
      }
    );
    
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: usuario });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const usuario = await User.findByIdAndDelete(params.id, { maxTimeMS: 3000 });
    
    if (!usuario) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: usuario });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

