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
      .maxTimeMS(15000); // Timeout optimizado para VPS (15 segundos)
    
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
    
    // Verificar que todos los campos requeridos estén presentes antes de crear
    if (!body.presupuestoId || !body.numero || !body.cliente || !body.cliente.nombre) {
      console.error('[API Presupuestos] Campos faltantes:', {
        presupuestoId: body.presupuestoId,
        numero: body.numero,
        clienteNombre: body.cliente?.nombre
      });
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos para crear el presupuesto' },
        { status: 400 }
      );
    }
    
    // Crear objeto limpio solo con los campos del modelo
    const presupuestoData = {
      presupuestoId: String(body.presupuestoId).trim(),
      numero: parseInt(body.numero),
      cliente: {
        nombre: String(body.cliente.nombre).trim()
      },
      fecha: body.fecha instanceof Date ? body.fecha : new Date(body.fecha),
      validez: parseInt(body.validez) || 30,
      items: body.items.map(item => ({
        descripcion: String(item.descripcion).trim(),
        cantidad: parseInt(item.cantidad) || 1,
        precioUnitario: parseFloat(item.precioUnitario) || 0,
        subtotal: parseFloat(item.subtotal) || (parseInt(item.cantidad) || 1) * (parseFloat(item.precioUnitario) || 0)
      })),
      subtotal: parseFloat(body.subtotal) || 0,
      descuento: parseFloat(body.descuento) || 0,
      porcentajeDescuento: parseFloat(body.porcentajeDescuento) || 0,
      total: parseFloat(body.total) || 0,
      estado: String(body.estado || 'borrador')
    };
    
    // Agregar campos opcionales del cliente
    if (body.cliente.rubro) presupuestoData.cliente.rubro = String(body.cliente.rubro).trim();
    if (body.cliente.ciudad) presupuestoData.cliente.ciudad = String(body.cliente.ciudad).trim();
    if (body.cliente.email) presupuestoData.cliente.email = String(body.cliente.email).trim();
    if (body.cliente.telefono) presupuestoData.cliente.telefono = String(body.cliente.telefono).trim();
    
    // Agregar campos opcionales del presupuesto
    if (body.observaciones) presupuestoData.observaciones = String(body.observaciones).trim();
    if (body.notasInternas) presupuestoData.notasInternas = String(body.notasInternas).trim();
    
    // Logging para debug (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[API Presupuestos] Datos del presupuesto:', {
        presupuestoId: presupuestoData.presupuestoId,
        numero: presupuestoData.numero,
        clienteNombre: presupuestoData.cliente.nombre,
        itemsCount: presupuestoData.items.length
      });
    }
    
    try {
      const presupuesto = await Budget.create(presupuestoData, { 
        runValidators: true,
        maxTimeMS: 30000
      });
      
      return NextResponse.json({ success: true, data: presupuesto }, { status: 201 });
    } catch (createError) {
      console.error('[API Presupuestos] Error al crear presupuesto:', createError);
      
      // Si es un error de validación, primero verificar si el presupuesto se guardó
      // A veces Mongoose lanza errores de validación pero el documento se guarda de todas formas
      if (createError.name === 'ValidationError') {
        // Intentar obtener el presupuesto para ver si se guardó exitosamente
        try {
          const presupuestoGuardado = await Budget.findOne({ presupuestoId: presupuestoData.presupuestoId }).lean();
          if (presupuestoGuardado) {
            // El presupuesto se guardó exitosamente, ignorar el error de validación
            console.log('[API Presupuestos] Presupuesto guardado exitosamente a pesar del error de validación');
            return NextResponse.json({ success: true, data: presupuestoGuardado }, { status: 201 });
          }
        } catch (e) {
          console.warn('[API Presupuestos] No se pudo verificar presupuesto guardado:', e);
        }
        
        // Si no se guardó, filtrar errores falsos y mostrar solo errores reales
        const validationErrors = Object.values(createError.errors || {})
          .map(err => {
            const path = err.path;
            // Ignorar errores de campos que no existen en el modelo
            if (path && path.toLowerCase().includes('presupuestold')) {
              return null;
            }
            // Solo incluir errores de campos que realmente existen en el modelo
            const validPaths = ['presupuestoId', 'numero', 'cliente', 'fecha', 'items', 'subtotal', 'total'];
            if (path && !validPaths.some(validPath => path.includes(validPath))) {
              return null;
            }
            return err.message;
          })
          .filter(Boolean);
        
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

