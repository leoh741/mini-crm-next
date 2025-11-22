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
    
    // Preparar objeto de actualización con $set para asegurar que false se guarde correctamente
    const updateData = {};
    
    // Asegurar que los campos booleanos sean explícitos y siempre se incluyan
    if (body.pagado !== undefined) {
      updateData.pagado = Boolean(body.pagado);
    }
    if (body.pagoUnico !== undefined) {
      updateData.pagoUnico = Boolean(body.pagoUnico);
    }
    if (body.pagoMesSiguiente !== undefined) {
      updateData.pagoMesSiguiente = Boolean(body.pagoMesSiguiente);
    }
    
    // Agregar otros campos
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.rubro !== undefined) updateData.rubro = body.rubro;
    if (body.ciudad !== undefined) updateData.ciudad = body.ciudad;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.montoPago !== undefined) updateData.montoPago = body.montoPago;
    if (body.fechaPago !== undefined) updateData.fechaPago = body.fechaPago;
    if (body.servicios !== undefined) updateData.servicios = body.servicios;
    if (body.observaciones !== undefined) updateData.observaciones = body.observaciones;
    
    // Usar $set explícitamente para asegurar que false se guarde
    const cliente = await Client.findByIdAndUpdate(
      params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    console.log('Cliente actualizado:', { id: cliente._id, pagado: cliente.pagado });
    
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

