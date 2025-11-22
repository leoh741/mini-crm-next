import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const cliente = await Client.findById(params.id);
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: cliente });
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
    
    // Asegurar que los campos booleanos sean explícitos
    if (body.pagado !== undefined) {
      body.pagado = Boolean(body.pagado);
    }
    if (body.pagoUnico !== undefined) {
      body.pagoUnico = Boolean(body.pagoUnico);
    }
    if (body.pagoMesSiguiente !== undefined) {
      body.pagoMesSiguiente = Boolean(body.pagoMesSiguiente);
    }
    
    const cliente = await Client.findByIdAndUpdate(
      params.id,
      body,
      { new: true, runValidators: true }
    );
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const cliente = await Client.findByIdAndDelete(params.id);
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: cliente });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

