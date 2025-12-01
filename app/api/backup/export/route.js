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
import TeamMember from '../../../../models/TeamMember';
import { logOperation, logDatabaseState, getDatabaseCounts } from '../../../../lib/auditLogger';
import mongoose from 'mongoose';

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    // PROTECCIÓN CRÍTICA: Registrar el estado de la base de datos ANTES de exportar
    logOperation('EXPORT_START', { timestamp });
    
    await connectDB();
    
    // Verificar y registrar el estado de la base de datos antes de exportar
    const dbName = mongoose.connection.db?.databaseName || 'N/A';
    logOperation('EXPORT_DB_CONNECTION', { 
      database: dbName,
      readyState: mongoose.connection.readyState,
      timestamp 
    });
    
    // Contar documentos ANTES de exportar (para auditoría)
    const countsBefore = await getDatabaseCounts(connectDB, {
      Client,
      MonthlyPayment,
      Expense,
      Income,
      User,
      Budget,
      Meeting,
      Task,
      TeamMember
    });
    
    logDatabaseState('BEFORE_EXPORT', countsBefore);
    
    // PROTECCIÓN: Verificar que no se esté borrando nada
    // Este endpoint SOLO debe leer datos, nunca borrarlos
    console.log('[EXPORT] Estado de la BD antes de exportar:', countsBefore);
    
    // PROTECCIÓN CRÍTICA: Verificar que hay datos antes de exportar
    const totalDocumentos = Object.values(countsBefore).reduce((sum, count) => {
      return sum + (typeof count === 'number' ? count : 0);
    }, 0);
    
    if (totalDocumentos === 0) {
      const warningMsg = 'ADVERTENCIA: La base de datos está vacía antes de exportar';
      console.warn('[EXPORT]', warningMsg);
      logOperation('EXPORT_WARNING_EMPTY_DB', {
        timestamp,
        countsBefore,
        database: dbName
      });
      // Continuar de todas formas para que el usuario pueda exportar un backup vacío si es necesario
    }

    // Obtener todos los datos - SOLO LECTURA, NUNCA ESCRITURA O BORRADO
    // IMPORTANTE: Estas operaciones SOLO leen datos, no los modifican
    const [clientes, pagos, gastos, ingresos, usuarios, presupuestos, reuniones, tareas, equipo] = await Promise.all([
      Client.find({}).lean().maxTimeMS(30000), // Timeout de 30 segundos
      MonthlyPayment.find({}).lean().maxTimeMS(30000),
      Expense.find({}).lean().maxTimeMS(30000),
      Income.find({}).lean().maxTimeMS(30000),
      User.find({}).lean().maxTimeMS(30000),
      Budget.find({}).lean().maxTimeMS(30000),
      Meeting.find({}).lean().maxTimeMS(30000),
      Task.find({}).lean().maxTimeMS(30000),
      TeamMember.find({}).lean().maxTimeMS(30000)
    ]);
    
    // PROTECCIÓN: Verificar inmediatamente después de leer que no se haya borrado nada
    const countsAfterRead = await getDatabaseCounts(connectDB, {
      Client,
      MonthlyPayment,
      Expense,
      Income,
      User,
      Budget,
      Meeting,
      Task,
      TeamMember
    });
    
    const dataLossAfterRead = Object.keys(countsBefore).some(key => {
      if (typeof countsBefore[key] === 'number' && typeof countsAfterRead[key] === 'number') {
        return countsAfterRead[key] < countsBefore[key];
      }
      return false;
    });
    
    if (dataLossAfterRead) {
      const errorMsg = 'ERROR CRÍTICO: Se detectó pérdida de datos DESPUÉS de leer (durante la exportación)';
      console.error('[EXPORT]', errorMsg);
      console.error('[EXPORT] Antes de leer:', countsBefore);
      console.error('[EXPORT] Después de leer:', countsAfterRead);
      logOperation('EXPORT_DATA_LOSS_AFTER_READ', {
        before: countsBefore,
        after: countsAfterRead,
        timestamp,
        database: dbName
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          details: { before: countsBefore, after: countsAfterRead }
        },
        { status: 500 }
      );
    }

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
      observaciones: cliente.observaciones,
      etiquetas: cliente.etiquetas || [],
      createdAt: cliente.createdAt || null,
      updatedAt: cliente.updatedAt || null
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

    // Convertir equipo al formato esperado
    const equipoFormateado = equipo.map(miembro => ({
      id: miembro.crmId || miembro._id.toString(),
      crmId: miembro.crmId || miembro._id.toString(),
      nombre: miembro.nombre,
      cargo: miembro.cargo || undefined,
      email: miembro.email || undefined,
      telefono: miembro.telefono || undefined,
      calificacion: miembro.calificacion || 0,
      comentarios: miembro.comentarios || [],
      habilidades: miembro.habilidades || [],
      activo: miembro.activo !== undefined ? miembro.activo : true,
      createdAt: miembro.createdAt || null,
      updatedAt: miembro.updatedAt || null
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
      equipo: equipoFormateado, // Array directamente
      fechaExportacion: new Date().toISOString(),
      version: '2.3'
    };

    // PROTECCIÓN: Verificar que no se haya borrado nada durante la exportación
    // Verificar ANTES de formatear los datos
    const countsAfterFormat = await getDatabaseCounts(connectDB, {
      Client,
      MonthlyPayment,
      Expense,
      Income,
      User,
      Budget,
      Meeting,
      Task,
      TeamMember
    });
    
    // Verificar que los conteos no hayan cambiado después de formatear
    const hasDataLossAfterFormat = Object.keys(countsBefore).some(key => {
      if (typeof countsBefore[key] === 'number' && typeof countsAfterFormat[key] === 'number') {
        return countsAfterFormat[key] < countsBefore[key];
      }
      return false;
    });
    
    if (hasDataLossAfterFormat) {
      const errorMsg = 'ERROR CRÍTICO: Se detectó pérdida de datos después de formatear datos';
      console.error('[EXPORT]', errorMsg);
      console.error('[EXPORT] Antes:', countsBefore);
      console.error('[EXPORT] Después de formatear:', countsAfterFormat);
      logOperation('EXPORT_DATA_LOSS_AFTER_FORMAT', {
        before: countsBefore,
        after: countsAfterFormat,
        timestamp,
        database: dbName
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          details: { before: countsBefore, after: countsAfterFormat }
        },
        { status: 500 }
      );
    }
    
    // Verificación final ANTES de devolver la respuesta
    const countsAfter = await getDatabaseCounts(connectDB, {
      Client,
      MonthlyPayment,
      Expense,
      Income,
      User,
      Budget,
      Meeting,
      Task,
      TeamMember
    });
    
    logDatabaseState('AFTER_EXPORT', countsAfter);
    
    // Verificar que los conteos no hayan cambiado (no se debe borrar nada)
    const hasDataLoss = Object.keys(countsBefore).some(key => {
      if (typeof countsBefore[key] === 'number' && typeof countsAfter[key] === 'number') {
        return countsAfter[key] < countsBefore[key];
      }
      return false;
    });
    
    if (hasDataLoss) {
      const errorMsg = 'ERROR CRÍTICO: Se detectó pérdida de datos durante la exportación (verificación final)';
      console.error('[EXPORT]', errorMsg);
      console.error('[EXPORT] Antes:', countsBefore);
      console.error('[EXPORT] Después:', countsAfter);
      logOperation('EXPORT_DATA_LOSS_DETECTED', {
        before: countsBefore,
        after: countsAfter,
        timestamp,
        database: dbName,
        countsAfterRead,
        countsAfterFormat
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          details: { 
            before: countsBefore, 
            after: countsAfter,
            afterRead: countsAfterRead,
            afterFormat: countsAfterFormat
          }
        },
        { status: 500 }
      );
    }
    
    logOperation('EXPORT_SUCCESS', {
      timestamp,
      counts: countsAfter,
      dataSize: {
        clientes: datos.clientes.length,
        usuarios: datos.usuarios.length,
        presupuestos: datos.presupuestos.length,
        reuniones: datos.reuniones.length,
        tareas: datos.tareas.length,
        equipo: datos.equipo.length
      }
    });
    
    return NextResponse.json({
      success: true,
      data: datos,
      audit: {
        timestamp,
        countsBefore,
        countsAfter
      }
    });
  } catch (error) {
    console.error('[EXPORT] Error al exportar backup:', error);
    logOperation('EXPORT_ERROR', {
      error: error.message,
      stack: error.stack,
      timestamp
    });
    return NextResponse.json(
      { success: false, error: error.message || 'Error al exportar los datos' },
      { status: 500 }
    );
  }
}

