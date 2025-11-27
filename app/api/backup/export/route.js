import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';
import MonthlyPayment from '../../../../models/MonthlyPayment';
import Expense from '../../../../models/Expense';
import Income from '../../../../models/Income';
import User from '../../../../models/User';
import Budget from '../../../../models/Budget';
import Meeting from '../../../../models/Meeting';
import Task from '../../../../models/Task';

export async function GET() {
  try {
    await connectDB();

    // Obtener todos los datos
    const [clientes, pagos, gastos, ingresos, usuarios, presupuestos, reuniones, tareas] = await Promise.all([
      Client.find({}).lean(),
      MonthlyPayment.find({}).lean(),
      Expense.find({}).lean(),
      Income.find({}).lean(),
      User.find({}).lean(),
      Budget.find({}).lean(),
      Meeting.find({}).lean(),
      Task.find({}).lean()
    ]);

    // Convertir clientes al formato esperado
    const clientesFormateados = clientes.map(cliente => ({
      id: cliente.crmId || cliente._id?.toString() || cliente._id,
      crmId: cliente.crmId || cliente._id?.toString() || cliente._id, // Incluir también crmId explícitamente
      nombre: cliente.nombre,
      rubro: cliente.rubro,
      ciudad: cliente.ciudad,
      email: cliente.email,
      montoPago: cliente.montoPago,
      fechaPago: cliente.fechaPago,
      pagado: cliente.pagado || false,
      pagoUnico: cliente.pagoUnico || false,
      pagoMesSiguiente: cliente.pagoMesSiguiente || false,
      servicios: cliente.servicios || [],
      observaciones: cliente.observaciones
    }));

    // Convertir pagos mensuales al formato esperado (objeto anidado por mes)
    const pagosMensualesFormateados = {};
    pagos.forEach(pago => {
      if (!pagosMensualesFormateados[pago.mes]) {
        pagosMensualesFormateados[pago.mes] = {};
      }
      pagosMensualesFormateados[pago.mes][pago.crmClientId] = {
        pagado: pago.pagado || false,
        serviciosPagados: pago.serviciosPagados || {},
        fechaActualizacion: pago.fechaActualizacion || null
      };
    });

    // Convertir gastos al formato esperado (objeto anidado por periodo)
    const gastosFormateados = {};
    gastos.forEach(gasto => {
      if (!gastosFormateados[gasto.periodo]) {
        gastosFormateados[gasto.periodo] = [];
      }
      gastosFormateados[gasto.periodo].push({
        id: gasto.crmId || gasto._id.toString(),
        descripcion: gasto.descripcion,
        monto: gasto.monto,
        fecha: gasto.fecha || null,
        categoria: gasto.categoria || '',
        fechaCreacion: gasto.fechaCreacion || null
      });
    });

    // Convertir ingresos al formato esperado (objeto anidado por periodo)
    const ingresosFormateados = {};
    ingresos.forEach(ingreso => {
      if (!ingresosFormateados[ingreso.periodo]) {
        ingresosFormateados[ingreso.periodo] = [];
      }
      ingresosFormateados[ingreso.periodo].push({
        id: ingreso.crmId || ingreso._id.toString(),
        descripcion: ingreso.descripcion,
        monto: ingreso.monto,
        fecha: ingreso.fecha || null,
        categoria: ingreso.categoria || '',
        fechaCreacion: ingreso.fechaCreacion || null
      });
    });

    // Convertir usuarios al formato esperado
    const usuariosFormateados = usuarios.map(usuario => ({
      id: usuario.crmId || usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      password: usuario.password,
      rol: usuario.rol || 'usuario',
      fechaCreacion: usuario.fechaCreacion || null
    }));

    // Convertir presupuestos al formato esperado
    const presupuestosFormateados = presupuestos.map(presupuesto => ({
      id: presupuesto.presupuestoId || presupuesto._id.toString(),
      presupuestoId: presupuesto.presupuestoId || presupuesto._id.toString(),
      numero: presupuesto.numero,
      cliente: presupuesto.cliente,
      fecha: presupuesto.fecha || null,
      validez: presupuesto.validez || 30,
      items: presupuesto.items || [],
      subtotal: presupuesto.subtotal || 0,
      descuento: presupuesto.descuento || 0,
      porcentajeDescuento: presupuesto.porcentajeDescuento || 0,
      total: presupuesto.total || 0,
      estado: presupuesto.estado || 'borrador',
      observaciones: presupuesto.observaciones || '',
      notasInternas: presupuesto.notasInternas || ''
    }));

    // Convertir reuniones al formato esperado
    const reunionesFormateadas = reuniones.map(reunion => ({
      id: reunion.reunionId || reunion._id.toString(),
      reunionId: reunion.reunionId || reunion._id.toString(),
      titulo: reunion.titulo,
      fecha: reunion.fecha || null,
      hora: reunion.hora,
      tipo: reunion.tipo,
      cliente: reunion.cliente || undefined,
      linkMeet: reunion.linkMeet || undefined,
      observaciones: reunion.observaciones || undefined,
      asignados: reunion.asignados || [],
      completada: reunion.completada || false,
      createdAt: reunion.createdAt || null,
      updatedAt: reunion.updatedAt || null
    }));

    // Convertir tareas al formato esperado
    const tareasFormateadas = tareas.map(tarea => ({
      id: tarea.tareaId || tarea._id.toString(),
      tareaId: tarea.tareaId || tarea._id.toString(),
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || undefined,
      fechaVencimiento: tarea.fechaVencimiento || null,
      prioridad: tarea.prioridad || 'media',
      estado: tarea.estado || 'pendiente',
      cliente: tarea.cliente || undefined,
      etiquetas: tarea.etiquetas || [],
      asignados: tarea.asignados || [],
      completada: tarea.completada || false,
      fechaCompletada: tarea.fechaCompletada || null,
      createdAt: tarea.createdAt || null,
      updatedAt: tarea.updatedAt || null
    }));

    // Formato compatible: devolver como objetos/arrays directamente
    // El frontend los serializará cuando cree el archivo JSON
    const datos = {
      clientes: clientesFormateados, // Array directamente, no string JSON
      pagosMensuales: pagosMensualesFormateados, // Objeto directamente
      clientesEliminados: [], // Array directamente
      gastos: gastosFormateados, // Objeto directamente
      ingresos: ingresosFormateados, // Objeto directamente
      usuarios: usuariosFormateados, // Array directamente
      presupuestos: presupuestosFormateados, // Array directamente
      reuniones: reunionesFormateadas, // Array directamente
      tareas: tareasFormateadas, // Array directamente
      fechaExportacion: new Date().toISOString(),
      version: '2.2'
    };

    return NextResponse.json({
      success: true,
      data: datos
    });
  } catch (error) {
    console.error('Error al exportar backup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al exportar los datos' },
      { status: 500 }
    );
  }
}

