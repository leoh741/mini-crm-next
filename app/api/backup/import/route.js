import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';
import MonthlyPayment from '../../../../models/MonthlyPayment';
import Expense from '../../../../models/Expense';
import Income from '../../../../models/Income';
import User from '../../../../models/User';
import Budget from '../../../../models/Budget';

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    
    // Validar estructura básica
    if (!body.clientes && !body.pagosMensuales) {
      return NextResponse.json(
        { success: false, error: 'Formato de datos inválido. Se requieren al menos clientes o pagosMensuales.' },
        { status: 400 }
      );
    }

    // Parsear los datos (pueden venir como strings JSON o como objetos)
    let clientes = [];
    let pagosMensuales = {};
    let gastos = {};
    let ingresos = {};
    let usuarios = [];
    let presupuestos = [];

    try {
      clientes = typeof body.clientes === 'string' ? JSON.parse(body.clientes) : (body.clientes || []);
      pagosMensuales = typeof body.pagosMensuales === 'string' ? JSON.parse(body.pagosMensuales) : (body.pagosMensuales || {});
      gastos = typeof body.gastos === 'string' ? JSON.parse(body.gastos) : (body.gastos || {});
      ingresos = typeof body.ingresos === 'string' ? JSON.parse(body.ingresos) : (body.ingresos || {});
      usuarios = typeof body.usuarios === 'string' ? JSON.parse(body.usuarios) : (body.usuarios || []);
      presupuestos = typeof body.presupuestos === 'string' ? JSON.parse(body.presupuestos) : (body.presupuestos || []);
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Error al parsear los datos JSON: ' + parseError.message },
        { status: 400 }
      );
    }

    // Limpiar colecciones existentes (EXCEPTO usuarios - se mantienen)
    await Client.deleteMany({});
    await MonthlyPayment.deleteMany({});
    await Expense.deleteMany({});
    await Income.deleteMany({});
    await Budget.deleteMany({});
    // NO eliminamos usuarios - se mantienen y se hace merge

    const resultados = {
      clientes: 0,
      pagosMensuales: 0,
      gastos: 0,
      ingresos: 0,
      usuarios: 0,
      usuariosMantenidos: 0,
      presupuestos: 0
    };

    // Importar clientes
    if (Array.isArray(clientes) && clientes.length > 0) {
      const clientesImportados = clientes.map(cliente => ({
        crmId: cliente.id || cliente.crmId || `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
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
      
      if (clientesImportados.length > 0) {
        await Client.insertMany(clientesImportados);
        resultados.clientes = clientesImportados.length;
      }
    }

    // Importar pagos mensuales
    if (typeof pagosMensuales === 'object' && pagosMensuales !== null) {
      const pagosArray = [];
      for (const [mes, pagosDelMes] of Object.entries(pagosMensuales)) {
        if (typeof pagosDelMes === 'object' && pagosDelMes !== null) {
          for (const [crmClientId, datosPago] of Object.entries(pagosDelMes)) {
            pagosArray.push({
              mes,
              crmClientId,
              pagado: datosPago?.pagado || false,
              fechaActualizacion: datosPago?.fechaActualizacion ? new Date(datosPago.fechaActualizacion) : null
            });
          }
        }
      }
      
      if (pagosArray.length > 0) {
        // Usar insertMany con ordered: false para evitar errores por duplicados
        try {
          await MonthlyPayment.insertMany(pagosArray, { ordered: false });
          resultados.pagosMensuales = pagosArray.length;
        } catch (error) {
          // Si hay errores de duplicados, intentar uno por uno
          if (error.code === 11000) {
            let insertados = 0;
            for (const pago of pagosArray) {
              try {
                await MonthlyPayment.findOneAndUpdate(
                  { mes: pago.mes, crmClientId: pago.crmClientId },
                  pago,
                  { upsert: true }
                );
                insertados++;
              } catch (e) {
                console.warn('Error al insertar pago:', e.message);
              }
            }
            resultados.pagosMensuales = insertados;
          } else {
            throw error;
          }
        }
      }
    }

    // Importar gastos
    if (typeof gastos === 'object' && gastos !== null) {
      const gastosArray = [];
      for (const [periodo, gastosDelPeriodo] of Object.entries(gastos)) {
        if (Array.isArray(gastosDelPeriodo)) {
          for (const gasto of gastosDelPeriodo) {
            gastosArray.push({
              periodo,
              crmId: gasto.id || gasto.crmId || `expense-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              descripcion: gasto.descripcion,
              monto: parseFloat(gasto.monto) || 0,
              fecha: gasto.fecha ? new Date(gasto.fecha) : null,
              categoria: gasto.categoria || '',
              fechaCreacion: gasto.fechaCreacion ? new Date(gasto.fechaCreacion) : new Date()
            });
          }
        }
      }
      
      if (gastosArray.length > 0) {
        await Expense.insertMany(gastosArray);
        resultados.gastos = gastosArray.length;
      }
    }

    // Importar ingresos
    if (typeof ingresos === 'object' && ingresos !== null) {
      const ingresosArray = [];
      for (const [periodo, ingresosDelPeriodo] of Object.entries(ingresos)) {
        if (Array.isArray(ingresosDelPeriodo)) {
          for (const ingreso of ingresosDelPeriodo) {
            ingresosArray.push({
              periodo,
              crmId: ingreso.id || ingreso.crmId || `income-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              descripcion: ingreso.descripcion,
              monto: parseFloat(ingreso.monto) || 0,
              fecha: ingreso.fecha ? new Date(ingreso.fecha) : null,
              categoria: ingreso.categoria || '',
              fechaCreacion: ingreso.fechaCreacion ? new Date(ingreso.fechaCreacion) : new Date()
            });
          }
        }
      }
      
      if (ingresosArray.length > 0) {
        await Income.insertMany(ingresosArray);
        resultados.ingresos = ingresosArray.length;
      }
    }

    // Importar usuarios - MERGE: mantener existentes, actualizar/insertar del backup
    // Primero contar usuarios existentes que se mantendrán
    const usuariosExistentes = await User.find({}).select('email').lean();
    const emailsExistentes = new Set(usuariosExistentes.map(u => u.email));
    const emailsDelBackup = new Set();
    
    if (Array.isArray(usuarios) && usuarios.length > 0) {
      const usuariosImportados = usuarios.map(usuario => ({
        crmId: usuario.id || usuario.crmId || `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        nombre: usuario.nombre,
        email: usuario.email ? usuario.email.trim().toLowerCase() : usuario.email, // Normalizar email
        password: usuario.password, // Mantener password tal cual
        rol: usuario.rol || 'usuario',
        fechaCreacion: usuario.fechaCreacion ? new Date(usuario.fechaCreacion) : new Date()
      }));
      
      if (usuariosImportados.length > 0) {
        let insertados = 0;
        let actualizados = 0;
        
        for (const usuario of usuariosImportados) {
          if (!usuario.email) {
            console.warn('Usuario sin email, omitiendo:', usuario);
            continue;
          }
          
          emailsDelBackup.add(usuario.email);
          
          try {
            // Usar upsert para actualizar si existe o insertar si no existe
            const resultado = await User.findOneAndUpdate(
              { email: usuario.email },
              usuario,
              { upsert: true, new: true, runValidators: true }
            );
            
            // Verificar si fue insertado o actualizado
            if (resultado.createdAt && resultado.createdAt.getTime() === resultado.updatedAt.getTime()) {
              insertados++;
            } else {
              actualizados++;
            }
          } catch (e) {
            console.warn('Error al insertar/actualizar usuario:', e.message);
          }
        }
        
        resultados.usuarios = insertados + actualizados;
      }
    }
    
    // Contar usuarios existentes que NO están en el backup (se mantienen)
    const usuariosMantenidos = Array.from(emailsExistentes).filter(email => !emailsDelBackup.has(email));
    resultados.usuariosMantenidos = usuariosMantenidos.length;

    // Importar presupuestos
    if (Array.isArray(presupuestos) && presupuestos.length > 0) {
      const presupuestosImportados = presupuestos.map(presupuesto => ({
        presupuestoId: presupuesto.presupuestoId || presupuesto.id || `budget-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        numero: presupuesto.numero,
        cliente: presupuesto.cliente || {},
        fecha: presupuesto.fecha ? new Date(presupuesto.fecha) : new Date(),
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
      
      if (presupuestosImportados.length > 0) {
        try {
          await Budget.insertMany(presupuestosImportados, { ordered: false });
          resultados.presupuestos = presupuestosImportados.length;
        } catch (error) {
          // Si hay errores de duplicados, intentar uno por uno
          if (error.code === 11000) {
            let insertados = 0;
            for (const presupuesto of presupuestosImportados) {
              try {
                await Budget.findOneAndUpdate(
                  { presupuestoId: presupuesto.presupuestoId },
                  presupuesto,
                  { upsert: true }
                );
                insertados++;
              } catch (e) {
                console.warn('Error al insertar presupuesto:', e.message);
              }
            }
            resultados.presupuestos = insertados;
          } else {
            throw error;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Datos importados correctamente',
      resultados
    });
  } catch (error) {
    console.error('Error al importar backup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al importar los datos' },
      { status: 500 }
    );
  }
}

