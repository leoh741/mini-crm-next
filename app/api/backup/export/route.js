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
import ActivityList from '../../../../models/ActivityList';
import Activity from '../../../../models/Activity';
import Report from '../../../../models/Report';
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
      TeamMember,
      ActivityList,
      Activity,
      Report
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
    
    // Obtener ActivityLists primero para tenerlas disponibles
    const activityLists = await ActivityList.find({}).lean().maxTimeMS(30000);
    console.log(`[EXPORT] ActivityLists encontradas: ${activityLists.length}`);
    
    // Obtener Activities con populate
    const activities = await Activity.find({})
      .populate('assignee', 'nombre email crmId _id')
      .populate('createdBy', 'nombre email crmId _id')
      .populate('list', 'name color _id')
      .lean()
      .maxTimeMS(60000);
    
    console.log(`[EXPORT] Activities encontradas ANTES de formatear: ${activities.length}`);
    
    // Verificar que las actividades tengan lista
    const actividadesConListaBD = activities.filter(a => a.list);
    const actividadesSinListaBD = activities.filter(a => !a.list);
    console.log(`[EXPORT] Actividades con lista: ${actividadesConListaBD.length}, sin lista: ${actividadesSinListaBD.length}`);
    
    if (actividadesSinListaBD.length > 0) {
      console.warn(`[EXPORT] ⚠️ ${actividadesSinListaBD.length} actividades sin lista en la BD:`, actividadesSinListaBD.map(a => ({ id: a._id?.toString(), title: a.title })));
    }
    
    const [clientes, pagos, gastos, ingresos, usuarios, presupuestos, reuniones, tareas, equipo, informes] = await Promise.all([
      Client.find({}).lean().maxTimeMS(30000), // Timeout de 30 segundos
      MonthlyPayment.find({}).lean().maxTimeMS(30000),
      Expense.find({}).lean().maxTimeMS(30000),
      Income.find({}).lean().maxTimeMS(30000),
      User.find({}).lean().maxTimeMS(30000),
      Budget.find({}).lean().maxTimeMS(30000),
      Meeting.find({}).lean().maxTimeMS(30000),
      Task.find({}).lean().maxTimeMS(30000),
      TeamMember.find({}).lean().maxTimeMS(30000),
      Report.find({}).lean().maxTimeMS(30000)
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
      TeamMember,
      ActivityList,
      Activity,
      Report
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

    // Convertir listas de actividades al formato esperado
    const activityListsFormateadas = activityLists.map(list => ({
      id: list._id.toString(),
      name: list.name,
      description: list.description || undefined,
      color: list.color || '#22c55e',
      owner: list.owner?.toString() || list.owner,
      members: (list.members || []).map(m => m?.toString() || m),
      isArchived: list.isArchived || false,
      createdAt: list.createdAt || null,
      updatedAt: list.updatedAt || null
    }));

    // Convertir actividades al formato esperado
    console.log(`[EXPORT] Total de actividades encontradas en BD: ${activities.length}`);
    
    // NO FILTRAR actividades - exportar TODAS, incluso si no tienen lista
    // La lista puede ser un ObjectId sin poblar, y eso está bien
    console.log(`[EXPORT] Procesando ${activities.length} actividades para exportar`);
    
    const activitiesFormateadas = activities.map((activity, index) => {
      // Obtener el ID de la lista de diferentes formas posibles
      let listId = null;
      
      if (activity.list) {
        // Si está poblado (objeto con _id)
        if (activity.list._id) {
          listId = activity.list._id.toString();
        } 
        // Si es un ObjectId de mongoose (tiene método toString)
        else if (activity.list.toString && typeof activity.list.toString === 'function') {
          try {
            listId = activity.list.toString();
          } catch (e) {
            console.warn(`[EXPORT] Error al convertir lista a string (actividad ${index + 1}):`, e);
          }
        } 
        // Si es un string directamente
        else if (typeof activity.list === 'string') {
          listId = activity.list;
        } 
        // Si tiene propiedad id
        else if (activity.list.id) {
          listId = activity.list.id.toString();
        }
        // Si es un ObjectId de mongoose directamente (verificar por constructor)
        else if (activity.list.constructor && (activity.list.constructor.name === 'ObjectId' || activity.list.constructor.name === 'Types.ObjectId')) {
          listId = activity.list.toString();
        }
        // Último intento: convertir a string directamente
        else {
          try {
            listId = String(activity.list);
          } catch (e) {
            console.warn(`[EXPORT] No se pudo convertir lista a string (actividad ${index + 1}):`, e);
          }
        }
      }
      
      // Logging para las primeras 5 actividades para debug
      if (index < 5) {
        console.log(`[EXPORT] Actividad ${index + 1}/${activities.length}:`, {
          id: activity._id?.toString(),
          title: activity.title,
          listOriginal: activity.list,
          listId: listId,
          listType: typeof activity.list,
          listConstructor: activity.list?.constructor?.name,
          hasListId: !!listId,
          listIsPopulated: activity.list && typeof activity.list === 'object' && activity.list._id
        });
      }
      
      // Si no se pudo obtener el ID de la lista, registrar un warning
      if (!listId && activity.list) {
        console.warn(`[EXPORT] ⚠️ Actividad ${index + 1} (${activity.title}) tiene lista pero no se pudo extraer el ID:`, {
          list: activity.list,
          listType: typeof activity.list,
          listConstructor: activity.list?.constructor?.name
        });
      }
      
      // Si no se pudo obtener listId pero activity.list existe, intentar obtenerlo directamente
      if (!listId && activity.list) {
        // Si es un ObjectId de mongoose sin poblar, convertirlo directamente
        if (activity.list.toString && typeof activity.list.toString === 'function') {
          try {
            listId = activity.list.toString();
          } catch (e) {
            // Ignorar error
          }
        }
        // Si es un string, usarlo directamente
        if (!listId && typeof activity.list === 'string') {
          listId = activity.list;
        }
      }
      
      return {
      id: activity._id ? activity._id.toString() : (activity.id ? activity.id.toString() : `unknown-${index}`),
      list: listId || (activity.list ? (activity.list.toString ? activity.list.toString() : String(activity.list)) : null),
      title: activity.title,
      description: activity.description || undefined,
      status: activity.status || 'pendiente',
      priority: activity.priority || 'media',
      assignee: activity.assignee ? {
        _id: activity.assignee._id?.toString() || activity.assignee.id?.toString(),
        id: activity.assignee._id?.toString() || activity.assignee.id?.toString(),
        crmId: activity.assignee.crmId,
        nombre: activity.assignee.nombre,
        email: activity.assignee.email
      } : undefined,
      labels: activity.labels || [],
      dueDate: activity.dueDate || null,
      order: activity.order || 0,
      createdBy: activity.createdBy ? {
        _id: activity.createdBy._id?.toString() || activity.createdBy.id?.toString(),
        id: activity.createdBy._id?.toString() || activity.createdBy.id?.toString(),
        crmId: activity.createdBy.crmId,
        nombre: activity.createdBy.nombre,
        email: activity.createdBy.email
      } : activity.createdBy?.toString() || activity.createdBy,
      createdAt: activity.createdAt || null,
      updatedAt: activity.updatedAt || null
      };
    });

    // Convertir informes al formato esperado
    console.log(`[EXPORT] Informes encontrados ANTES de formatear: ${informes.length}`);
    const informesFormateados = informes.map(informe => ({
      reportId: informe.reportId || informe._id.toString(),
      clienteNombre: informe.clienteNombre,
      clienteEmail: informe.clienteEmail || undefined,
      titulo: informe.titulo,
      periodo: {
        from: informe.periodo?.from || null,
        to: informe.periodo?.to || null
      },
      moneda: informe.moneda || 'ARS',
      porcentajeImpuestos: informe.porcentajeImpuestos || 0,
      estado: informe.estado || 'borrador',
      createdBy: informe.createdBy,
      sections: informe.sections || [],
      reportNotes: informe.reportNotes || {},
      share: informe.share || { enabled: false },
      createdAt: informe.createdAt || null,
      updatedAt: informe.updatedAt || null
    }));
    console.log(`[EXPORT] Informes formateados: ${informesFormateados.length}`);

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
      activityLists: activityListsFormateadas, // Array directamente
      activities: activitiesFormateadas, // Array directamente
      informes: informesFormateados, // Array directamente
      fechaExportacion: new Date().toISOString(),
      version: '2.5'
    };
    
    // Logging para verificar que todas las actividades se exportaron
    console.log(`[EXPORT] Actividades formateadas: ${activitiesFormateadas.length}`);
    console.log(`[EXPORT] Listas de actividades formateadas: ${activityListsFormateadas.length}`);
    
    // Verificar que todas las actividades tengan una lista válida
    const actividadesSinLista = activitiesFormateadas.filter(a => !a.list);
    if (actividadesSinLista.length > 0) {
      console.warn(`[EXPORT] ⚠️ ${actividadesSinLista.length} actividades sin lista válida:`, actividadesSinLista.map(a => ({ id: a.id, title: a.title })));
    }
    
    // Agrupar actividades por lista para verificar
    const actividadesPorLista = {};
    activitiesFormateadas.forEach(activity => {
      const listId = activity.list || 'sin-lista';
      if (!actividadesPorLista[listId]) {
        actividadesPorLista[listId] = [];
      }
      actividadesPorLista[listId].push(activity);
    });
    
    console.log(`[EXPORT] Actividades agrupadas por lista:`, Object.keys(actividadesPorLista).map(listId => ({
      lista: listId,
      cantidad: actividadesPorLista[listId].length
    })));
    
    // Resumen final de exportación
    console.log(`[EXPORT] ==========================================`);
    console.log(`[EXPORT] RESUMEN DE EXPORTACIÓN:`);
    console.log(`[EXPORT] - Clientes: ${clientesFormateados.length}`);
    console.log(`[EXPORT] - Usuarios: ${usuariosFormateados.length}`);
    console.log(`[EXPORT] - Presupuestos: ${presupuestosFormateados.length}`);
    console.log(`[EXPORT] - Reuniones: ${reunionesFormateadas.length}`);
    console.log(`[EXPORT] - Tareas: ${tareasFormateadas.length}`);
    console.log(`[EXPORT] - Equipo: ${equipoFormateado.length}`);
    console.log(`[EXPORT] - Listas de Actividades: ${activityListsFormateadas.length}`);
    console.log(`[EXPORT] - Actividades: ${activitiesFormateadas.length}`);
    console.log(`[EXPORT] - Informes: ${informesFormateados.length}`);
    console.log(`[EXPORT] ==========================================`);

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
      TeamMember,
      ActivityList,
      Activity,
      Report
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
      TeamMember,
      ActivityList,
      Activity,
      Report
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
        equipo: datos.equipo.length,
        activityLists: datos.activityLists.length,
        activities: datos.activities.length,
        informes: datos.informes.length
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

