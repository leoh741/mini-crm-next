import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const searchId = params.id;
    
    // Buscar por _id o por crmId
    let cliente = null;
    
    // Primero intentar buscar por _id (ObjectId de MongoDB)
    // Verificar si es un ObjectId válido (24 caracteres hexadecimales)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchId);
    if (isValidObjectId) {
      try {
        cliente = await Client.findById(searchId).lean();
      } catch (idError) {
        // Si falla, continuar para buscar por crmId
        console.warn('Error al buscar por _id:', idError.message);
      }
    }
    
    // Si no se encontró por _id, buscar por crmId
    if (!cliente) {
      cliente = await Client.findOne({ crmId: searchId }).lean();
    }
    
    // Si aún no se encuentra, intentar buscar en todos los clientes (fallback)
    if (!cliente) {
      const todosClientes = await Client.find({}).lean();
      cliente = todosClientes.find(c => 
        c._id?.toString() === searchId || 
        c.crmId === searchId ||
        String(c._id) === searchId
      );
    }
    
    if (!cliente) {
      console.error(`Cliente no encontrado con ID: ${searchId}`);
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: cliente }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });
  } catch (error) {
    console.error('Error en GET /api/clientes/[id]:', error);
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
    
    // Buscar cliente por _id o crmId
    let cliente = null;
    
    // Verificar si es un ObjectId válido
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        cliente = await Client.findById(params.id);
      } catch (idError) {
        // Si falla, buscar por crmId
      }
    }
    
    // Si no se encontró por _id, buscar por crmId
    if (!cliente) {
      cliente = await Client.findOne({ crmId: params.id });
    }
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    // Preparar objeto de actualización con $set para asegurar que false se guarde correctamente
    const updateData = {};
    
    // Asegurar que los campos booleanos sean explícitos y siempre se incluyan
    // IMPORTANTE: Incluir siempre, incluso si es false
    // Convertir explícitamente a booleano verdadero, no solo truthy
    if (body.pagado !== undefined) {
      // Convertir explícitamente: solo true si es exactamente true, 1, o 'true'
      updateData.pagado = body.pagado === true || body.pagado === 1 || body.pagado === 'true';
      console.log('Campo pagado a actualizar:', { 
        valorOriginal: body.pagado, 
        tipoOriginal: typeof body.pagado,
        valorBooleano: updateData.pagado,
        tipoBooleano: typeof updateData.pagado
      });
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
    // Usar lean() para respuesta más rápida y select solo campos necesarios
    const clienteActualizado = await Client.findByIdAndUpdate(
      cliente._id,
      { $set: updateData },
      { new: true, runValidators: true, lean: true }
    ).select('-__v'); // Excluir campo __v de la respuesta
    
    if (!clienteActualizado) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    console.log('Cliente actualizado en BD:', { 
      id: clienteActualizado._id, 
      nombre: clienteActualizado.nombre,
      pagado: clienteActualizado.pagado,
      tipoPagado: typeof clienteActualizado.pagado
    });
    
    return NextResponse.json({ success: true, data: clienteActualizado });
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
    
    // Buscar cliente por _id o crmId
    let cliente = null;
    
    // Verificar si es un ObjectId válido
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
    if (isValidObjectId) {
      try {
        cliente = await Client.findById(params.id);
      } catch (idError) {
        // Si falla, buscar por crmId
      }
    }
    
    // Si no se encontró por _id, buscar por crmId
    if (!cliente) {
      cliente = await Client.findOne({ crmId: params.id });
    }
    
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }
    
    // Eliminar usando el _id encontrado
    await Client.findByIdAndDelete(cliente._id);
    
    return NextResponse.json({ success: true, data: cliente });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

