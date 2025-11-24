import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Budget from '../../../../models/Budget';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const searchId = params.id;
    
    // Buscar por _id o por presupuestoId
    let presupuesto = null;
    
    // Verificar si es un ObjectId válido
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchId);
    if (isValidObjectId) {
      try {
        presupuesto = await Budget.findById(searchId)
          .lean()
          .maxTimeMS(5000);
      } catch (idError) {
        console.warn('Error al buscar por _id:', idError.message);
      }
    }
    
    // Si no se encontró por _id, buscar por presupuestoId
    if (!presupuesto) {
      presupuesto = await Budget.findOne({ presupuestoId: searchId })
        .lean()
        .maxTimeMS(5000);
    }
    
    // Si no se encontró, buscar por número
    if (!presupuesto) {
      const numero = parseInt(searchId);
      if (!isNaN(numero)) {
        presupuesto = await Budget.findOne({ numero: numero })
          .lean()
          .maxTimeMS(5000);
      }
    }
    
    if (!presupuesto) {
      return NextResponse.json(
        { success: false, error: 'Presupuesto no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: presupuesto }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error en GET /api/presupuestos/[id]:', error);
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
    
    // Buscar presupuesto por _id, presupuestoId o número
    let presupuesto = null;
    
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        presupuesto = await Budget.findById(params.id);
      } catch (idError) {
        // Continuar para buscar por otros campos
      }
    }
    
    if (!presupuesto) {
      presupuesto = await Budget.findOne({ presupuestoId: params.id });
    }
    
    if (!presupuesto) {
      const numero = parseInt(params.id);
      if (!isNaN(numero)) {
        presupuesto = await Budget.findOne({ numero: numero });
      }
    }
    
    if (!presupuesto) {
      return NextResponse.json(
        { success: false, error: 'Presupuesto no encontrado' },
        { status: 404 }
      );
    }
    
    // Recalcular items si se actualizan
    if (body.items && Array.isArray(body.items)) {
      body.items = body.items.map(item => ({
        ...item,
        subtotal: item.cantidad * item.precioUnitario
      }));
      body.subtotal = body.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    }
    
    // Recalcular descuento y total
    if (body.porcentajeDescuento !== undefined && body.porcentajeDescuento > 0) {
      body.descuento = (body.subtotal * body.porcentajeDescuento) / 100;
    } else if (body.descuento === undefined && presupuesto.porcentajeDescuento > 0) {
      body.descuento = (body.subtotal * presupuesto.porcentajeDescuento) / 100;
    }
    
    body.total = (body.subtotal || presupuesto.subtotal) - (body.descuento || presupuesto.descuento || 0);
    
    const presupuestoActualizado = await Budget.findByIdAndUpdate(
      presupuesto._id,
      { $set: body },
      { 
        new: true, 
        runValidators: true,
        maxTimeMS: 5000,
        lean: true
      }
    );
    
    if (!presupuestoActualizado) {
      return NextResponse.json(
        { success: false, error: 'Presupuesto no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: presupuestoActualizado });
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    
    // Buscar presupuesto por _id, presupuestoId o número
    let presupuesto = null;
    
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        presupuesto = await Budget.findById(params.id);
      } catch (idError) {
        // Continuar para buscar por otros campos
      }
    }
    
    if (!presupuesto) {
      presupuesto = await Budget.findOne({ presupuestoId: params.id });
    }
    
    if (!presupuesto) {
      const numero = parseInt(params.id);
      if (!isNaN(numero)) {
        presupuesto = await Budget.findOne({ numero: numero });
      }
    }
    
    if (!presupuesto) {
      return NextResponse.json(
        { success: false, error: 'Presupuesto no encontrado' },
        { status: 404 }
      );
    }
    
    await Budget.findByIdAndDelete(presupuesto._id, { 
      maxTimeMS: 5000
    });
    
    return NextResponse.json({ success: true, data: presupuesto });
  } catch (error) {
    console.error('Error al eliminar presupuesto:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

