import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import Budget from '../../../models/Budget';

export async function GET() {
  try {
    await connectDB();
    const presupuestos = await Budget.find({})
      .select('presupuestoId numero cliente fecha validez subtotal descuento total estado observaciones createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(5000);
    
    return NextResponse.json({ success: true, data: presupuestos }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[API Presupuestos] Error:', error);
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
    
    // Validar que cliente.nombre existe
    if (!body.cliente || !body.cliente.nombre || !body.cliente.nombre.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre del cliente es requerido' },
        { status: 400 }
      );
    }
    
    // Validar que hay items
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Debe agregar al menos un item al presupuesto' },
        { status: 400 }
      );
    }
    
    // Generar presupuestoId si no viene (asegurar que siempre esté presente)
    if (!body.presupuestoId || body.presupuestoId.trim() === '') {
      body.presupuestoId = `presup-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    
    // Generar número de presupuesto si no viene (asegurar que siempre esté presente)
    if (!body.numero || isNaN(body.numero)) {
      const ultimoPresupuesto = await Budget.findOne({})
        .sort({ numero: -1 })
        .select('numero')
        .lean()
        .maxTimeMS(5000);
      body.numero = ultimoPresupuesto && ultimoPresupuesto.numero ? ultimoPresupuesto.numero + 1 : 1;
    } else {
      // Asegurar que sea un número
      body.numero = parseInt(body.numero);
    }
    
    // Asegurar que cliente tenga la estructura correcta
    body.cliente = {
      nombre: body.cliente.nombre.trim(),
      ...(body.cliente.rubro?.trim() && { rubro: body.cliente.rubro.trim() }),
      ...(body.cliente.ciudad?.trim() && { ciudad: body.cliente.ciudad.trim() }),
      ...(body.cliente.email?.trim() && { email: body.cliente.email.trim() }),
      ...(body.cliente.telefono?.trim() && { telefono: body.cliente.telefono.trim() })
    };
    
    // Calcular subtotales y total si no vienen
    if (body.items && Array.isArray(body.items)) {
      body.items = body.items.map(item => ({
        descripcion: item.descripcion.trim(),
        cantidad: item.cantidad || 1,
        precioUnitario: item.precioUnitario || 0,
        subtotal: (item.cantidad || 1) * (item.precioUnitario || 0)
      }));
      body.subtotal = body.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    } else {
      body.subtotal = 0;
    }
    
    // Calcular total con descuento
    if (body.porcentajeDescuento && body.porcentajeDescuento > 0) {
      body.descuento = (body.subtotal * body.porcentajeDescuento) / 100;
    } else {
      body.descuento = body.descuento || 0;
    }
    body.total = (body.subtotal || 0) - (body.descuento || 0);
    
    // Asegurar valores por defecto
    body.estado = body.estado || 'borrador';
    body.validez = body.validez || 30;
    body.fecha = body.fecha ? new Date(body.fecha) : new Date();
    
    // Asegurar que subtotal y total sean números válidos
    body.subtotal = parseFloat(body.subtotal) || 0;
    body.descuento = parseFloat(body.descuento) || 0;
    body.total = parseFloat(body.total) || 0;
    
    // Crear objeto limpio solo con los campos del modelo
    const presupuestoData = {
      presupuestoId: body.presupuestoId,
      numero: body.numero,
      cliente: body.cliente,
      fecha: body.fecha,
      validez: body.validez,
      items: body.items,
      subtotal: body.subtotal,
      descuento: body.descuento,
      porcentajeDescuento: body.porcentajeDescuento || 0,
      total: body.total,
      estado: body.estado,
      ...(body.observaciones && { observaciones: body.observaciones }),
      ...(body.notasInternas && { notasInternas: body.notasInternas })
    };
    
    try {
      const presupuesto = await Budget.create(presupuestoData, { 
        runValidators: true,
        maxTimeMS: 30000
      });
      
      return NextResponse.json({ success: true, data: presupuesto }, { status: 201 });
    } catch (createError) {
      console.error('[API Presupuestos] Error al crear presupuesto:', createError);
      
      // Si es un error de validación, filtrar errores falsos
      if (createError.name === 'ValidationError') {
        const validationErrors = Object.values(createError.errors || {})
          .map(err => {
            // Filtrar errores de campos que no existen o son incorrectos
            const path = err.path;
            // Ignorar errores de campos que no existen en el modelo
            if (path && (path.toLowerCase().includes('presupuestold') || path.toLowerCase().includes('presupuestold'))) {
              return null;
            }
            // Solo incluir errores de campos que realmente existen en el modelo
            const validPaths = ['presupuestoId', 'numero', 'cliente', 'fecha', 'items', 'subtotal', 'total'];
            if (path && !validPaths.some(validPath => path.includes(validPath))) {
              return null;
            }
            return err.message;
          })
          .filter(Boolean); // Eliminar nulls
        
        // Si no hay errores válidos después de filtrar, el presupuesto probablemente se guardó
        // Intentar obtenerlo para confirmar antes de mostrar error
        if (validationErrors.length === 0) {
          try {
            const presupuestoGuardado = await Budget.findOne({ presupuestoId: presupuestoData.presupuestoId }).lean();
            if (presupuestoGuardado) {
              return NextResponse.json({ success: true, data: presupuestoGuardado }, { status: 201 });
            }
          } catch (e) {
            // Si no se puede obtener, continuar con el error
            console.warn('[API Presupuestos] No se pudo verificar presupuesto guardado:', e);
          }
        }
        
        if (validationErrors.length > 0) {
          return NextResponse.json(
            { success: false, error: `Error de validación: ${validationErrors.join(', ')}` },
            { status: 400 }
          );
        }
      }
      
      // Si el presupuesto se creó pero hay un error después, intentar obtenerlo
      if (createError.code === 11000) {
        // Error de duplicado - intentar obtener el presupuesto existente
        const presupuestoExistente = await Budget.findOne({ presupuestoId: presupuestoData.presupuestoId }).lean();
        if (presupuestoExistente) {
          return NextResponse.json({ success: true, data: presupuestoExistente }, { status: 201 });
        }
      }
      
      return NextResponse.json(
        { success: false, error: createError.message || 'Error al crear presupuesto' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API Presupuestos] Error general:', error);
    
    return NextResponse.json(
      { success: false, error: error.message || 'Error al procesar el presupuesto' },
      { status: 500 }
    );
  }
}

