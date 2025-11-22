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
    
    console.log('PUT /api/clientes/[id] - Body recibido:', JSON.stringify(body, null, 2));
    
    // Preparar objeto de actualización con $set para asegurar que false se guarde correctamente
    const updateData = {};
    
    // Asegurar que los campos booleanos sean explícitos y siempre se incluyan
    // IMPORTANTE: Incluir siempre, incluso si es false
    if (body.pagado !== undefined) {
      updateData.pagado = Boolean(body.pagado);
      console.log('Campo pagado a actualizar:', { valorOriginal: body.pagado, valorBooleano: updateData.pagado });
    } else {
      console.warn('Campo pagado NO está en el body, no se actualizará');
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
    
    console.log('Datos a actualizar en MongoDB:', JSON.stringify(updateData, null, 2));
    
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
    
    console.log('Cliente actualizado en BD:', { 
      id: cliente._id, 
      nombre: cliente.nombre,
      pagado: cliente.pagado,
      tipoPagado: typeof cliente.pagado
    });
    
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

