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
    
    // Generar presupuestoId si no viene
    if (!body.presupuestoId) {
      body.presupuestoId = `presup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Generar número de presupuesto si no viene
    if (!body.numero) {
      const ultimoPresupuesto = await Budget.findOne({})
        .sort({ numero: -1 })
        .select('numero')
        .lean();
      body.numero = ultimoPresupuesto ? ultimoPresupuesto.numero + 1 : 1;
    }
    
    // Asegurar que cliente tenga la estructura correcta
    body.cliente = {
      nombre: body.cliente.nombre.trim(),
      rubro: body.cliente.rubro?.trim() || undefined,
      ciudad: body.cliente.ciudad?.trim() || undefined,
      email: body.cliente.email?.trim() || undefined,
      telefono: body.cliente.telefono?.trim() || undefined
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
    
    const presupuesto = await Budget.create(body, { 
      runValidators: true,
      maxTimeMS: 5000
    });
    
    return NextResponse.json({ success: true, data: presupuesto }, { status: 201 });
  } catch (error) {
    console.error('[API Presupuestos] Error al crear:', error);
    
    // Mejorar mensaje de error de validación
    let errorMessage = error.message;
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map(err => err.message);
      errorMessage = `Error de validación: ${validationErrors.join(', ')}`;
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 400 }
    );
  }
}

