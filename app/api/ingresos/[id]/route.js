import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Income from '../../../../models/Income';

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const ingreso = await Income.findByIdAndDelete(params.id, { maxTimeMS: 5000 }); // Timeout adecuado para servidor local
    
    if (!ingreso) {
      return NextResponse.json(
        { success: false, error: 'Ingreso no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: ingreso });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

