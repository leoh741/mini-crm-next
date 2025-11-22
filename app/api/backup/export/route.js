import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';
import MonthlyPayment from '../../../../models/MonthlyPayment';
import Expense from '../../../../models/Expense';
import Income from '../../../../models/Income';
import User from '../../../../models/User';

export async function GET() {
  try {
    await connectDB();

    // Obtener todos los datos
    const [clientes, pagos, gastos, ingresos, usuarios] = await Promise.all([
      Client.find({}).lean(),
      MonthlyPayment.find({}).lean(),
      Expense.find({}).lean(),
      Income.find({}).lean(),
      User.find({}).lean()
    ]);

    // Convertir clientes al formato esperado
    const clientesFormateados = clientes.map(cliente => ({
      id: cliente.crmId || cliente._id.toString(),
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

    // Formato compatible con el formato antiguo de localStorage (strings JSON)
    const datos = {
      clientes: JSON.stringify(clientesFormateados),
      pagosMensuales: JSON.stringify(pagosMensualesFormateados),
      clientesEliminados: JSON.stringify([]),
      gastos: JSON.stringify(gastosFormateados),
      ingresos: JSON.stringify(ingresosFormateados),
      usuarios: JSON.stringify(usuariosFormateados),
      fechaExportacion: new Date().toISOString(),
      version: '2.0'
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

