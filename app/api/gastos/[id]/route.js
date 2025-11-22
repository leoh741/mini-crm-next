import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Expense from '../../../../models/Expense';

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const gasto = await Expense.findByIdAndDelete(params.id);
    
    if (!gasto) {
      return NextResponse.json(
        { success: false, error: 'Gasto no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: gasto });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

