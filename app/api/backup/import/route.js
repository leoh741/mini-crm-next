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

export async function POST(request) {
  // Variable para backup automático (disponible en todo el scope)
  let backupAutomatico = null;
  
  try {
    // Logging detallado con timestamp
    const timestamp = new Date().toISOString();
    console.log(`[BACKUP IMPORT] [${timestamp}] Iniciando importación de backup...`);
    
    // Obtener IP y headers para auditoría
    const headers = request.headers;
    const userAgent = headers.get('user-agent') || 'unknown';
    const referer = headers.get('referer') || 'unknown';
    const ip = headers.get('x-forwarded-for') || headers.get('x-real-ip') || request.ip || 'unknown';
    const origin = headers.get('origin') || 'unknown';
    
    console.log(`[BACKUP IMPORT] [${timestamp}] ==========================================`);
    console.log(`[BACKUP IMPORT] [${timestamp}] 🔔 IMPORTACIÓN INICIADA`);
    console.log(`[BACKUP IMPORT] [${timestamp}] User-Agent: ${userAgent}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Referer: ${referer}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Origin: ${origin}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] IP: ${ip}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] ==========================================`);
    
    await connectDB();
    console.log(`[BACKUP IMPORT] [${timestamp}] Conectado a MongoDB`);
    
    const body = await request.json();
    console.log(`[BACKUP IMPORT] [${timestamp}] Body recibido, keys:`, Object.keys(body));
    
    // Validar estructura básica
    if (!body.clientes && !body.pagosMensuales) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Formato inválido, no hay clientes ni pagosMensuales`);
      return NextResponse.json(
        { success: false, error: 'Formato de datos inválido. Se requieren al menos clientes o pagosMensuales.' },
        { status: 400 }
      );
    }
    
    // REQUERIR confirmación explícita para borrar datos
    if (!body.confirmDelete || body.confirmDelete !== true) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Falta confirmación explícita para borrar datos`);
      return NextResponse.json(
        { success: false, error: 'Se requiere confirmación explícita para importar. Agrega "confirmDelete": true al body de la petición.' },
        { status: 400 }
      );
    }

    // Parsear los datos (pueden venir como strings JSON o como objetos)
    // IMPORTANTE: Manejar doble serialización (cuando JSON.stringify escapa strings JSON)
    let clientes = [];
    let pagosMensuales = {};
    let gastos = {};
    let ingresos = {};
    let usuarios = [];
    let presupuestos = [];
    let reuniones = [];
    let tareas = [];

    // Función helper para parsear strings JSON que pueden estar doblemente serializados
    const parseJsonField = (field, fieldName) => {
      if (!field) {
        return fieldName.includes('clientes') || fieldName.includes('usuarios') || fieldName.includes('presupuestos') ? [] : {};
      }
      
      // Si ya es un objeto/array, devolverlo directamente
      if (typeof field !== 'string') {
        return field;
      }
      
      // Es un string, intentar parsearlo
      try {
        let parsed = JSON.parse(field);
        
        // Si después de parsear sigue siendo un string, probablemente está doblemente serializado
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch (e2) {
            // Si falla el segundo parse, devolver el primero
            console.warn(`[BACKUP IMPORT] [${timestamp}] Campo ${fieldName}: doble parse falló, usando primer parse`);
          }
        }
        
        return parsed;
      } catch (parseError) {
        console.error(`[BACKUP IMPORT] [${timestamp}] Error al parsear ${fieldName}:`, parseError.message);
        // Si falla, devolver valor por defecto
        return fieldName.includes('clientes') || fieldName.includes('usuarios') || fieldName.includes('presupuestos') ? [] : {};
      }
    };

    try {
      console.log(`[BACKUP IMPORT] [${timestamp}] Parseando datos recibidos...`);
      console.log(`[BACKUP IMPORT] [${timestamp}] Tipo de body.clientes:`, typeof body.clientes);
      if (body.clientes && typeof body.clientes === 'string') {
        console.log(`[BACKUP IMPORT] [${timestamp}] body.clientes (primeros 200 chars):`, body.clientes.substring(0, 200));
      }
      
      clientes = parseJsonField(body.clientes, 'clientes');
      pagosMensuales = parseJsonField(body.pagosMensuales, 'pagosMensuales');
      gastos = parseJsonField(body.gastos, 'gastos');
      ingresos = parseJsonField(body.ingresos, 'ingresos');
      usuarios = parseJsonField(body.usuarios, 'usuarios');
      presupuestos = parseJsonField(body.presupuestos, 'presupuestos');
      reuniones = parseJsonField(body.reuniones, 'reuniones');
      tareas = parseJsonField(body.tareas, 'tareas');
      
      console.log(`[BACKUP IMPORT] [${timestamp}] Datos parseados:`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Clientes:`, Array.isArray(clientes) ? `${clientes.length} clientes` : `NO ES ARRAY (tipo: ${typeof clientes})`);
      if (Array.isArray(clientes) && clientes.length > 0) {
        console.log(`[BACKUP IMPORT] [${timestamp}]   Ejemplo de cliente parseado:`, JSON.stringify(clientes[0], null, 2).substring(0, 200));
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] - Pagos:`, typeof pagosMensuales === 'object' && pagosMensuales !== null ? `${Object.keys(pagosMensuales).length} meses` : `NO ES OBJETO (tipo: ${typeof pagosMensuales})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Gastos:`, typeof gastos === 'object' && gastos !== null ? `${Object.keys(gastos).length} periodos` : `NO ES OBJETO (tipo: ${typeof gastos})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Ingresos:`, typeof ingresos === 'object' && ingresos !== null ? `${Object.keys(ingresos).length} periodos` : `NO ES OBJETO (tipo: ${typeof ingresos})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Usuarios:`, Array.isArray(usuarios) ? `${usuarios.length} usuarios` : `NO ES ARRAY (tipo: ${typeof usuarios})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Presupuestos:`, Array.isArray(presupuestos) ? `${presupuestos.length} presupuestos` : `NO ES ARRAY (tipo: ${typeof presupuestos})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Reuniones:`, Array.isArray(reuniones) ? `${reuniones.length} reuniones` : `NO ES ARRAY (tipo: ${typeof reuniones})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Tareas:`, Array.isArray(tareas) ? `${tareas.length} tareas` : `NO ES ARRAY (tipo: ${typeof tareas})`);
    } catch (parseError) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error al parsear JSON:`, parseError);
      console.error(`[BACKUP IMPORT] [${timestamp}] Stack:`, parseError.stack);
      return NextResponse.json(
        { success: false, error: 'Error al parsear los datos JSON: ' + parseError.message },
        { status: 400 }
      );
    }

    // VALIDAR que hay datos para importar ANTES de borrar
    const tieneClientes = Array.isArray(clientes) && clientes.length > 0;
    const tienePagos = typeof pagosMensuales === 'object' && pagosMensuales !== null && Object.keys(pagosMensuales).length > 0;
    const tieneGastos = typeof gastos === 'object' && gastos !== null && Object.keys(gastos).length > 0;
    const tieneIngresos = typeof ingresos === 'object' && ingresos !== null && Object.keys(ingresos).length > 0;
    const tienePresupuestos = Array.isArray(presupuestos) && presupuestos.length > 0;
    const tieneReuniones = Array.isArray(reuniones) && reuniones.length > 0;
    const tieneTareas = Array.isArray(tareas) && tareas.length > 0;

    // VALIDACIÓN CRÍTICA: Verificar que los clientes tienen nombre válido ANTES de borrar
    let clientesValidos = [];
    if (tieneClientes) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Analizando ${clientes.length} clientes recibidos...`);
      console.log(`[BACKUP IMPORT] [${timestamp}] Tipo de clientes:`, Array.isArray(clientes) ? 'Array' : typeof clientes);
      if (clientes.length > 0) {
        console.log(`[BACKUP IMPORT] [${timestamp}] Ejemplo de cliente recibido:`, JSON.stringify(clientes[0], null, 2));
      }
      
      clientesValidos = clientes.filter(c => {
        const tieneNombre = c.nombre && typeof c.nombre === 'string' && c.nombre.trim().length > 0;
        if (!tieneNombre) {
          console.warn(`[BACKUP IMPORT] Cliente sin nombre válido:`, {
            id: c.id,
            crmId: c.crmId,
            nombre: c.nombre,
            tipoNombre: typeof c.nombre
          });
        }
        return tieneNombre;
      });
      
      if (clientesValidos.length === 0) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: No hay clientes con nombre válido.`);
        console.error(`[BACKUP IMPORT] [${timestamp}] Total recibidos: ${clientes.length}`);
        if (clientes.length > 0) {
          console.error(`[BACKUP IMPORT] [${timestamp}] Ejemplos de clientes inválidos:`, clientes.slice(0, 3));
        }
        return NextResponse.json(
          { success: false, error: `No se puede importar: ningún cliente tiene nombre válido. Recibidos: ${clientes.length}, válidos: 0. Los datos NO fueron borrados.` },
          { status: 400 }
        );
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Validación de clientes: ${clientesValidos.length} válidos de ${clientes.length} totales`);
    }

    if (!tieneClientes && !tienePagos && !tieneGastos && !tieneIngresos && !tienePresupuestos && !tieneReuniones && !tieneTareas) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ Error: No hay datos válidos para importar`);
      console.error(`[BACKUP IMPORT] [${timestamp}] User-Agent: ${userAgent}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] Referer: ${referer}`);
      return NextResponse.json(
        { success: false, error: 'No hay datos válidos para importar. El backup está vacío o tiene formato incorrecto. Los datos NO fueron borrados.' },
        { status: 400 }
      );
    }

    // Contar documentos existentes ANTES de borrar (para auditoría)
    const documentosExistentes = {
      clientes: tieneClientes ? await Client.countDocuments() : 0,
      pagos: tienePagos ? await MonthlyPayment.countDocuments() : 0,
      gastos: tieneGastos ? await Expense.countDocuments() : 0,
      ingresos: tieneIngresos ? await Income.countDocuments() : 0,
      presupuestos: tienePresupuestos ? await Budget.countDocuments() : 0,
      reuniones: tieneReuniones ? await Meeting.countDocuments() : 0,
      tareas: tieneTareas ? await Task.countDocuments() : 0
    };
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Documentos existentes que se borrarán:`, documentosExistentes);
    
    // PROTECCIÓN CRÍTICA: Preparar TODOS los datos ANTES de borrar nada
    // Esto asegura que si algo falla, no perdemos datos
    let clientesPreparados = [];
    let pagosPreparados = [];
    let gastosPreparados = [];
    let ingresosPreparados = [];
    let presupuestosPreparados = [];
    let reunionesPreparadas = [];
    let tareasPreparadas = [];
    
    // Preparar clientes ANTES de borrar
    if (tieneClientes && clientesValidos.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Preparando ${clientesValidos.length} clientes válidos...`);
      
      clientesPreparados = clientesValidos.map((cliente, index) => {
        // Asegurar que siempre haya un crmId válido
        const crmId = cliente.id || cliente.crmId;
        
        if (!crmId) {
          // Generar crmId si no existe, basado en el nombre o un ID único
          const nombreBase = cliente.nombre ? cliente.nombre.substring(0, 20).toLowerCase().replace(/[^a-z0-9]/g, '') : 'cliente';
          const nuevoCrmId = `${nombreBase}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          console.warn(`[BACKUP IMPORT] Cliente ${index + 1} sin crmId, generando: ${nuevoCrmId}`, {
            nombre: cliente.nombre
          });
          return {
            crmId: nuevoCrmId,
            nombre: cliente.nombre.trim(),
            rubro: cliente.rubro || undefined,
            ciudad: cliente.ciudad || undefined,
            email: cliente.email || undefined,
            montoPago: cliente.montoPago !== undefined && cliente.montoPago !== null ? Number(cliente.montoPago) : undefined,
            fechaPago: cliente.fechaPago !== undefined && cliente.fechaPago !== null ? Number(cliente.fechaPago) : undefined,
            pagado: Boolean(cliente.pagado),
            pagoUnico: Boolean(cliente.pagoUnico),
            pagoMesSiguiente: Boolean(cliente.pagoMesSiguiente),
            servicios: Array.isArray(cliente.servicios) ? cliente.servicios : [],
            observaciones: cliente.observaciones || undefined
          };
        }
        
        return {
          crmId: String(crmId), // Asegurar que sea string
          nombre: cliente.nombre.trim(),
          rubro: cliente.rubro || undefined,
          ciudad: cliente.ciudad || undefined,
          email: cliente.email || undefined,
          montoPago: cliente.montoPago !== undefined && cliente.montoPago !== null ? Number(cliente.montoPago) : undefined,
          fechaPago: cliente.fechaPago !== undefined && cliente.fechaPago !== null ? Number(cliente.fechaPago) : undefined,
          pagado: Boolean(cliente.pagado),
          pagoUnico: Boolean(cliente.pagoUnico),
          pagoMesSiguiente: Boolean(cliente.pagoMesSiguiente),
          servicios: Array.isArray(cliente.servicios) ? cliente.servicios : [],
          observaciones: cliente.observaciones || undefined
        };
      }).filter(c => {
        // Filtrar nuevamente por seguridad - debe tener crmId y nombre válidos
        const valido = c.crmId && c.nombre && c.nombre.trim().length > 0;
        if (!valido) {
          console.warn(`[BACKUP IMPORT] Cliente preparado inválido filtrado:`, c);
        }
        return valido;
      });
      
      // VALIDACIÓN FINAL: Verificar que tenemos clientes válidos preparados
      if (clientesPreparados.length === 0) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: Después de preparar, no quedan clientes válidos. NO se borrará nada.`);
        return NextResponse.json(
          { success: false, error: 'Error crítico: No quedan clientes válidos después de preparar. Los datos NO fueron borrados.' },
          { status: 400 }
        );
      }
      
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${clientesPreparados.length} clientes preparados y validados para importar`);
    }
    
    // Preparar pagos ANTES de borrar
    if (tienePagos && typeof pagosMensuales === 'object' && pagosMensuales !== null) {
      for (const [mes, pagosDelMes] of Object.entries(pagosMensuales)) {
        if (typeof pagosDelMes === 'object' && pagosDelMes !== null) {
          for (const [crmClientId, datosPago] of Object.entries(pagosDelMes)) {
            pagosPreparados.push({
              mes,
              crmClientId,
              pagado: datosPago?.pagado || false,
              serviciosPagados: datosPago?.serviciosPagados || {},
              fechaActualizacion: datosPago?.fechaActualizacion ? new Date(datosPago.fechaActualizacion) : null
            });
          }
        }
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${pagosPreparados.length} pagos preparados para importar`);
    }
    
    // Preparar gastos ANTES de borrar
    if (tieneGastos && typeof gastos === 'object' && gastos !== null) {
      for (const [periodo, gastosDelPeriodo] of Object.entries(gastos)) {
        if (Array.isArray(gastosDelPeriodo)) {
          for (const gasto of gastosDelPeriodo) {
            gastosPreparados.push({
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
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${gastosPreparados.length} gastos preparados para importar`);
    }
    
    // Preparar ingresos ANTES de borrar
    if (tieneIngresos && typeof ingresos === 'object' && ingresos !== null) {
      for (const [periodo, ingresosDelPeriodo] of Object.entries(ingresos)) {
        if (Array.isArray(ingresosDelPeriodo)) {
          for (const ingreso of ingresosDelPeriodo) {
            ingresosPreparados.push({
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
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${ingresosPreparados.length} ingresos preparados para importar`);
    }
    
    // Preparar presupuestos ANTES de borrar
    if (tienePresupuestos && Array.isArray(presupuestos) && presupuestos.length > 0) {
      presupuestosPreparados = presupuestos.map(presupuesto => ({
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
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${presupuestosPreparados.length} presupuestos preparados para importar`);
    }
    
    // Preparar reuniones ANTES de borrar
    if (tieneReuniones && Array.isArray(reuniones) && reuniones.length > 0) {
      reunionesPreparadas = reuniones.map(reunion => {
        // Parsear fecha correctamente
        let fechaDate = null;
        if (reunion.fecha) {
          if (typeof reunion.fecha === 'string' && reunion.fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [año, mes, dia] = reunion.fecha.split('-').map(Number);
            fechaDate = new Date(año, mes - 1, dia, 12, 0, 0, 0);
          } else {
            fechaDate = new Date(reunion.fecha);
            if (isNaN(fechaDate.getTime())) {
              fechaDate = null;
            }
          }
        }
        
        return {
          reunionId: reunion.reunionId || reunion.id || `reunion-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          titulo: reunion.titulo?.trim() || '',
          fecha: fechaDate || new Date(),
          hora: reunion.hora?.trim() || '00:00',
          tipo: reunion.tipo && ['meet', 'oficina'].includes(reunion.tipo) ? reunion.tipo : 'meet',
          cliente: reunion.cliente || undefined,
          linkMeet: reunion.linkMeet?.trim() || undefined,
          observaciones: reunion.observaciones?.trim() || undefined,
          asignados: Array.isArray(reunion.asignados) ? reunion.asignados.filter(a => a && String(a).trim()).map(a => String(a).trim()) : [],
          completada: Boolean(reunion.completada || false)
        };
      }).filter(r => r.titulo && r.titulo.trim().length > 0);
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${reunionesPreparadas.length} reuniones preparadas para importar`);
    }
    
    // Preparar tareas ANTES de borrar
    if (tieneTareas && Array.isArray(tareas) && tareas.length > 0) {
      tareasPreparadas = tareas.map(tarea => {
        // Parsear fecha de vencimiento correctamente
        let fechaVencDate = null;
        if (tarea.fechaVencimiento) {
          if (typeof tarea.fechaVencimiento === 'string' && tarea.fechaVencimiento.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [año, mes, dia] = tarea.fechaVencimiento.split('-').map(Number);
            fechaVencDate = new Date(año, mes - 1, dia, 12, 0, 0, 0);
          } else {
            fechaVencDate = new Date(tarea.fechaVencimiento);
            if (isNaN(fechaVencDate.getTime())) {
              fechaVencDate = null;
            }
          }
        }
        
        return {
          tareaId: tarea.tareaId || tarea.id || `tarea-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          titulo: tarea.titulo?.trim() || '',
          descripcion: tarea.descripcion?.trim() || undefined,
          fechaVencimiento: fechaVencDate || undefined,
          prioridad: tarea.prioridad && ['baja', 'media', 'alta', 'urgente'].includes(tarea.prioridad) ? tarea.prioridad : 'media',
          estado: tarea.estado && ['pendiente', 'en_progreso', 'completada', 'cancelada'].includes(tarea.estado) ? tarea.estado : 'pendiente',
          cliente: tarea.cliente || undefined,
          etiquetas: Array.isArray(tarea.etiquetas) ? tarea.etiquetas.filter(e => e && String(e).trim()).map(e => String(e).trim()) : [],
          asignados: Array.isArray(tarea.asignados) ? tarea.asignados.filter(a => a && String(a).trim()).map(a => String(a).trim()) : [],
          completada: Boolean(tarea.completada || false),
          fechaCompletada: tarea.fechaCompletada ? new Date(tarea.fechaCompletada) : undefined
        };
      }).filter(t => t.titulo && t.titulo.trim().length > 0);
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${tareasPreparadas.length} tareas preparadas para importar`);
    }
    
    // VALIDACIÓN FINAL ANTES DE BORRAR: Verificar que tenemos al menos algunos datos válidos
    const totalDatosPreparados = clientesPreparados.length + pagosPreparados.length + gastosPreparados.length + ingresosPreparados.length + presupuestosPreparados.length + reunionesPreparadas.length + tareasPreparadas.length;
    if (totalDatosPreparados === 0) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: No hay datos válidos preparados. NO se borrará nada.`);
      return NextResponse.json(
        { success: false, error: 'Error crítico: No hay datos válidos para importar después de preparar. Los datos existentes NO fueron borrados.' },
        { status: 400 }
      );
    }
    
    console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Validación final exitosa. Total de datos preparados: ${totalDatosPreparados}`);
    
    // PROTECCIÓN CRÍTICA: Crear backup automático ANTES de borrar cualquier cosa
    console.log(`[BACKUP IMPORT] [${timestamp}] 🔒 Creando backup automático de seguridad antes de importar...`);
    try {
      const [clientesExistentes, pagosExistentes, gastosExistentes, ingresosExistentes, presupuestosExistentes, reunionesExistentes, tareasExistentes] = await Promise.all([
        Client.find({}).lean(),
        MonthlyPayment.find({}).lean(),
        Expense.find({}).lean(),
        Income.find({}).lean(),
        Budget.find({}).lean(),
        Meeting.find({}).lean(),
        Task.find({}).lean()
      ]);
      
      // Formatear para backup (igual que en export)
      const clientesBackup = clientesExistentes.map(c => ({
        id: c.crmId || c._id?.toString(),
        crmId: c.crmId || c._id?.toString(),
        nombre: c.nombre,
        rubro: c.rubro,
        ciudad: c.ciudad,
        email: c.email,
        montoPago: c.montoPago,
        fechaPago: c.fechaPago,
        pagado: c.pagado || false,
        pagoUnico: c.pagoUnico || false,
        pagoMesSiguiente: c.pagoMesSiguiente || false,
        servicios: c.servicios || [],
        observaciones: c.observaciones
      }));
      
      // Formatear pagos mensuales
      const pagosMensualesBackup = {};
      pagosExistentes.forEach(pago => {
        if (!pagosMensualesBackup[pago.mes]) {
          pagosMensualesBackup[pago.mes] = {};
        }
        pagosMensualesBackup[pago.mes][pago.crmClientId] = {
          pagado: pago.pagado || false,
          serviciosPagados: pago.serviciosPagados || {},
          fechaActualizacion: pago.fechaActualizacion || null
        };
      });
      
      // Formatear gastos
      const gastosBackup = {};
      gastosExistentes.forEach(gasto => {
        if (!gastosBackup[gasto.periodo]) {
          gastosBackup[gasto.periodo] = [];
        }
        gastosBackup[gasto.periodo].push({
          id: gasto.crmId || gasto._id.toString(),
          descripcion: gasto.descripcion,
          monto: gasto.monto,
          fecha: gasto.fecha || null,
          categoria: gasto.categoria || '',
          fechaCreacion: gasto.fechaCreacion || null
        });
      });
      
      // Formatear ingresos
      const ingresosBackup = {};
      ingresosExistentes.forEach(ingreso => {
        if (!ingresosBackup[ingreso.periodo]) {
          ingresosBackup[ingreso.periodo] = [];
        }
        ingresosBackup[ingreso.periodo].push({
          id: ingreso.crmId || ingreso._id.toString(),
          descripcion: ingreso.descripcion,
          monto: ingreso.monto,
          fecha: ingreso.fecha || null,
          categoria: ingreso.categoria || '',
          fechaCreacion: ingreso.fechaCreacion || null
        });
      });
      
      // Formatear presupuestos
      const presupuestosBackup = presupuestosExistentes.map(p => ({
        id: p.presupuestoId || p._id.toString(),
        presupuestoId: p.presupuestoId || p._id.toString(),
        numero: p.numero,
        cliente: p.cliente,
        fecha: p.fecha || null,
        validez: p.validez || 30,
        items: p.items || [],
        subtotal: p.subtotal || 0,
        descuento: p.descuento || 0,
        porcentajeDescuento: p.porcentajeDescuento || 0,
        total: p.total || 0,
        estado: p.estado || 'borrador',
        observaciones: p.observaciones || '',
        notasInternas: p.notasInternas || ''
      }));
      
      // Formatear reuniones
      const reunionesBackup = reunionesExistentes.map(r => ({
        id: r.reunionId || r._id.toString(),
        reunionId: r.reunionId || r._id.toString(),
        titulo: r.titulo,
        fecha: r.fecha || null,
        hora: r.hora,
        tipo: r.tipo,
        cliente: r.cliente || undefined,
        linkMeet: r.linkMeet || undefined,
        observaciones: r.observaciones || undefined,
        asignados: r.asignados || [],
        completada: r.completada || false,
        createdAt: r.createdAt || null,
        updatedAt: r.updatedAt || null
      }));
      
      // Formatear tareas
      const tareasBackup = tareasExistentes.map(t => ({
        id: t.tareaId || t._id.toString(),
        tareaId: t.tareaId || t._id.toString(),
        titulo: t.titulo,
        descripcion: t.descripcion || undefined,
        fechaVencimiento: t.fechaVencimiento || null,
        prioridad: t.prioridad || 'media',
        estado: t.estado || 'pendiente',
        cliente: t.cliente || undefined,
        etiquetas: t.etiquetas || [],
        asignados: t.asignados || [],
        completada: t.completada || false,
        fechaCompletada: t.fechaCompletada || null,
        createdAt: t.createdAt || null,
        updatedAt: t.updatedAt || null
      }));
      
      backupAutomatico = {
        clientes: JSON.stringify(clientesBackup),
        pagosMensuales: JSON.stringify(pagosMensualesBackup),
        gastos: JSON.stringify(gastosBackup),
        ingresos: JSON.stringify(ingresosBackup),
        presupuestos: JSON.stringify(presupuestosBackup),
        reuniones: JSON.stringify(reunionesBackup),
        tareas: JSON.stringify(tareasBackup),
        fechaExportacion: new Date().toISOString(),
        version: '2.2',
        tipo: 'backup_automatico_pre_importacion'
      };
      
      const totalItems = clientesBackup.length + Object.keys(pagosMensualesBackup).length + 
                         Object.keys(gastosBackup).length + Object.keys(ingresosBackup).length + 
                         presupuestosBackup.length + reunionesBackup.length + tareasBackup.length;
      
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Backup automático creado:`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${clientesBackup.length} clientes`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(pagosMensualesBackup).length} meses de pagos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(gastosBackup).length} periodos de gastos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(ingresosBackup).length} periodos de ingresos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${presupuestosBackup.length} presupuestos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${reunionesBackup.length} reuniones`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${tareasBackup.length} tareas`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   Total: ${totalItems} items guardados`);
    } catch (backupError) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ERROR CRÍTICO: No se pudo crear backup automático:`, backupError);
      // NO CONTINUAR si no se puede crear el backup
      return NextResponse.json(
        { 
          success: false, 
          error: 'No se puede proceder: Error al crear backup automático de seguridad. Los datos NO fueron modificados.' 
        },
        { status: 500 }
      );
    }
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Procediendo a limpiar colecciones y importar datos...`);
    
    // SOLO AHORA borrar colecciones existentes (después de crear backup y validar todo)
    // IMPORTANTE: Solo borramos si tenemos datos válidos preparados para insertar
    if (tieneClientes && clientesPreparados.length > 0) {
      const countAntes = documentosExistentes.clientes;
      // LOG DE AUDITORÍA: Registrar antes de borrar
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Clientes: ${countAntes} documentos serán eliminados`);
      console.log(`[AUDIT] [${timestamp}] Razón: Importación de backup con ${clientesPreparados.length} clientes válidos preparados`);
      console.log(`[AUDIT] [${timestamp}] Usuario/IP: ${userAgent} | Referer: ${referer}`);
      console.log(`[AUDIT] [${timestamp}] Backup automático disponible antes de borrar`);
      
      await Client.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Clientes eliminados: ${countAntes} (se importarán ${clientesPreparados.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} clientes eliminados`);
    }
    if (tienePagos && pagosPreparados.length > 0) {
      const countAntes = documentosExistentes.pagos;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Pagos: ${countAntes} documentos serán eliminados`);
      await MonthlyPayment.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Pagos eliminados: ${countAntes} (se importarán ${pagosPreparados.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} pagos eliminados`);
    }
    if (tieneGastos && gastosPreparados.length > 0) {
      const countAntes = documentosExistentes.gastos;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Gastos: ${countAntes} documentos serán eliminados`);
      await Expense.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Gastos eliminados: ${countAntes} (se importarán ${gastosPreparados.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} gastos eliminados`);
    }
    if (tieneIngresos && ingresosPreparados.length > 0) {
      const countAntes = documentosExistentes.ingresos;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Ingresos: ${countAntes} documentos serán eliminados`);
      await Income.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Ingresos eliminados: ${countAntes} (se importarán ${ingresosPreparados.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} ingresos eliminados`);
    }
    if (tienePresupuestos && presupuestosPreparados.length > 0) {
      const countAntes = documentosExistentes.presupuestos;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Presupuestos: ${countAntes} documentos serán eliminados`);
      await Budget.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Presupuestos eliminados: ${countAntes} (se importarán ${presupuestosPreparados.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} presupuestos eliminados`);
    }
    if (tieneReuniones && reunionesPreparadas.length > 0) {
      const countAntes = documentosExistentes.reuniones;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Reuniones: ${countAntes} documentos serán eliminados`);
      await Meeting.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Reuniones eliminadas: ${countAntes} (se importarán ${reunionesPreparadas.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} reuniones eliminadas`);
    }
    if (tieneTareas && tareasPreparadas.length > 0) {
      const countAntes = documentosExistentes.tareas;
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Tareas: ${countAntes} documentos serán eliminados`);
      await Task.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Tareas eliminadas: ${countAntes} (se importarán ${tareasPreparadas.length})`);
      console.log(`[AUDIT] [${timestamp}] ✅ Eliminación completada: ${countAntes} tareas eliminadas`);
    }
    // NO eliminamos usuarios - se mantienen y se hace merge

    const resultados = {
      clientes: 0,
      pagosMensuales: 0,
      gastos: 0,
      ingresos: 0,
      usuarios: 0,
      usuariosMantenidos: 0,
      presupuestos: 0,
      reuniones: 0,
      tareas: 0
    };

    // Importar clientes (usar los ya preparados y validados)
    // PROTECCIÓN: Si borramos clientes, DEBEMOS insertar al menos algunos, o revertir
    // CAMBIO: Usar upsert directamente para evitar problemas de duplicados y garantizar que todos se importen
    let clientesInsertadosExitosamente = false;
    if (clientesPreparados.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${clientesPreparados.length} clientes usando upsert (uno por uno)...`);
      
      // Log del primer cliente para debugging
      if (clientesPreparados.length > 0) {
        console.log(`[BACKUP IMPORT] [${timestamp}] Ejemplo de cliente preparado:`, JSON.stringify(clientesPreparados[0], null, 2));
      }
      
      let insertados = 0;
      let actualizados = 0;
      let errores = 0;
      const erroresDetallados = [];
      
      // Verificar cuántos clientes hay antes de insertar (para detectar si fueron insertados)
      const countAntes = await Client.countDocuments({});
      
      // Insertar/actualizar cada cliente uno por uno usando upsert
      // Esto garantiza que todos se importen correctamente, incluso si hay duplicados
      for (let i = 0; i < clientesPreparados.length; i++) {
        const cliente = clientesPreparados[i];
        try {
          // Validar que el cliente tenga crmId y nombre (requeridos)
          if (!cliente.crmId || !cliente.nombre || !cliente.nombre.trim()) {
            console.warn(`[BACKUP IMPORT] Cliente ${i + 1} omitido: falta crmId o nombre válido`, {
              crmId: cliente.crmId,
              nombre: cliente.nombre
            });
            errores++;
            erroresDetallados.push({
              index: i + 1,
              crmId: cliente.crmId,
              nombre: cliente.nombre,
              error: 'Falta crmId o nombre válido'
            });
            continue;
          }
          
          // Verificar si el cliente ya existe
          const existeAntes = await Client.findOne({ crmId: cliente.crmId }).select('_id').lean();
          const eraNuevo = !existeAntes;
          
          // Usar upsert para insertar o actualizar
          // IMPORTANTE: Excluir crmId del update porque ya está en el filtro
          // Si intentamos actualizar crmId que está en el filtro, Mongoose lanza error de conflicto
          const { crmId, ...clienteParaActualizar } = cliente;
          
          const resultado = await Client.findOneAndUpdate(
            { crmId: cliente.crmId },
            { $set: clienteParaActualizar }, // Excluir crmId del update para evitar conflicto
            { 
              upsert: true, 
              new: true,
              runValidators: true,
              setDefaultsOnInsert: true
            }
          );
          
          // Verificar que realmente se guardó
          if (!resultado || !resultado._id) {
            throw new Error('El documento no se guardó correctamente (sin _id)');
          }
          
          // Contar como insertado o actualizado según si existía antes
          if (eraNuevo) {
            insertados++;
            if (insertados <= 3 || (insertados % 10 === 0)) {
              console.log(`[BACKUP IMPORT] [${i + 1}/${clientesPreparados.length}] ✅ Cliente insertado: ${cliente.nombre} (crmId: ${cliente.crmId})`);
            }
          } else {
            actualizados++;
            if (actualizados <= 3 || (actualizados % 10 === 0)) {
              console.log(`[BACKUP IMPORT] [${i + 1}/${clientesPreparados.length}] 🔄 Cliente actualizado: ${cliente.nombre} (crmId: ${cliente.crmId})`);
            }
          }
        } catch (e) {
          errores++;
          erroresDetallados.push({
            index: i + 1,
            crmId: cliente.crmId,
            nombre: cliente.nombre,
            error: e.message
          });
          console.error(`[BACKUP IMPORT] [${i + 1}/${clientesPreparados.length}] ❌ Error al insertar cliente "${cliente.nombre}" (crmId: ${cliente.crmId}):`, e.message);
          
          // Si hay muchos errores seguidos, log adicional
          if (errores === 1 || errores === 5 || errores === 10) {
            console.error(`[BACKUP IMPORT] Detalle del error ${errores}:`, {
              cliente: JSON.stringify(cliente, null, 2),
              error: {
                name: e.name,
                message: e.message,
                code: e.code,
                stack: e.stack?.split('\n').slice(0, 5).join('\n')
              }
            });
          }
        }
      }
      
      // Verificar cuántos clientes hay después de insertar
      const countDespues = await Client.countDocuments({});
      console.log(`[BACKUP IMPORT] [${timestamp}] Clientes en BD: ${countAntes} antes → ${countDespues} después (esperados: ${countAntes + insertados})`);
      
      resultados.clientes = insertados + actualizados;
      clientesInsertadosExitosamente = resultados.clientes > 0;
      
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Resumen de importación de clientes:`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - Insertados: ${insertados}`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - Actualizados: ${actualizados}`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - Errores: ${errores}`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - Total procesados: ${insertados + actualizados + errores} de ${clientesPreparados.length}`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar clientes.`);
        if (errores <= 10) {
          console.warn(`[BACKUP IMPORT] [${timestamp}] Errores detallados:`, erroresDetallados);
        } else {
          console.warn(`[BACKUP IMPORT] [${timestamp}] Primeros 5 errores:`, erroresDetallados.slice(0, 5));
          console.warn(`[BACKUP IMPORT] [${timestamp}] ... y ${errores - 5} errores más`);
        }
      }
      
      // Log de los primeros 3 clientes insertados para verificación
      if (insertados > 0) {
        const primerosInsertados = await Client.find({})
          .sort({ createdAt: -1 })
          .limit(3)
          .select('nombre crmId')
          .lean();
        console.log('[BACKUP IMPORT] Primeros clientes en BD después de importar:');
        primerosInsertados.forEach((c, idx) => {
          console.log(`[BACKUP IMPORT]   ${idx + 1}. ${c.nombre} (crmId: ${c.crmId})`);
        });
      }
      
      // VERIFICACIÓN FINAL: Si borramos clientes, debemos haber insertado al menos algunos
      if (documentosExistentes.clientes > 0 && !clientesInsertadosExitosamente) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ERROR CRÍTICO: Se borraron ${documentosExistentes.clientes} clientes pero NO se insertó ninguno.`);
        console.error(`[BACKUP IMPORT] [${timestamp}] 💾 Backup automático disponible para restaurar.`);
        return NextResponse.json({
          success: false,
          error: `Error crítico: Se borraron ${documentosExistentes.clientes} clientes pero no se pudieron insertar nuevos. El backup automático está disponible para restaurar.`,
          backupAutomatico: backupAutomatico,
          resultados,
          errores: erroresDetallados
        }, { status: 500 });
      }
      
      // ADVERTENCIA si no se importaron todos los clientes esperados
      if (resultados.clientes < clientesPreparados.length) {
        const faltantes = clientesPreparados.length - resultados.clientes;
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: Solo se importaron ${resultados.clientes} de ${clientesPreparados.length} clientes esperados (${faltantes} faltantes)`);
      }
    }

    // Importar pagos mensuales (usar los ya preparados)
    // CAMBIO: Usar upsert directamente para evitar problemas de duplicados
    if (pagosPreparados.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${pagosPreparados.length} pagos usando upsert...`);
      const countPagosAntes = await MonthlyPayment.countDocuments({});
      let insertados = 0;
      let actualizados = 0;
      let errores = 0;
      
      for (let i = 0; i < pagosPreparados.length; i++) {
        const pago = pagosPreparados[i];
        try {
          // Validar que tenga los campos requeridos
          if (!pago.mes || !pago.crmClientId) {
            console.warn(`[BACKUP IMPORT] Pago ${i + 1} omitido: falta mes o crmClientId`, pago);
            errores++;
            continue;
          }
          
          // Verificar si el pago ya existe
          const existeAntes = await MonthlyPayment.findOne({ 
            mes: pago.mes, 
            crmClientId: pago.crmClientId 
          }).select('_id').lean();
          const eraNuevo = !existeAntes;
          
          // Excluir los campos del filtro del update para evitar conflictos
          const { mes, crmClientId, ...pagoParaActualizar } = pago;
          
          const resultado = await MonthlyPayment.findOneAndUpdate(
            { mes: pago.mes, crmClientId: pago.crmClientId },
            { $set: pagoParaActualizar }, // Excluir campos del filtro del update
            { upsert: true, new: true, runValidators: true }
          );
          
          // Verificar que se guardó
          if (!resultado || !resultado._id) {
            throw new Error('El pago no se guardó correctamente (sin _id)');
          }
          
          if (eraNuevo) {
            insertados++;
          } else {
            actualizados++;
          }
          
          if ((insertados + actualizados) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesados ${insertados + actualizados}/${pagosPreparados.length} pagos...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar pago [${i + 1}]:`, e.message);
          }
        }
      }
      
      const countPagosDespues = await MonthlyPayment.countDocuments({});
      resultados.pagosMensuales = insertados + actualizados;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Pagos importados: ${insertados} insertados, ${actualizados} actualizados, ${errores} errores`);
      console.log(`[BACKUP IMPORT] [${timestamp}] Pagos en BD: ${countPagosAntes} antes → ${countPagosDespues} después (esperados: ${countPagosAntes + insertados})`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar pagos`);
      }
    }

    // Importar gastos (usar los ya preparados)
    if (gastosPreparados.length > 0) {
      try {
        await Expense.insertMany(gastosPreparados);
        resultados.gastos = gastosPreparados.length;
        console.log('[BACKUP IMPORT] Gastos insertados exitosamente:', gastosPreparados.length);
      } catch (error) {
        console.error('[BACKUP IMPORT] Error al insertar gastos:', error);
        throw error;
      }
    }

    // Importar ingresos (usar los ya preparados)
    if (ingresosPreparados.length > 0) {
      try {
        await Income.insertMany(ingresosPreparados);
        resultados.ingresos = ingresosPreparados.length;
        console.log('[BACKUP IMPORT] Ingresos insertados exitosamente:', ingresosPreparados.length);
      } catch (error) {
        console.error('[BACKUP IMPORT] Error al insertar ingresos:', error);
        throw error;
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

    // Importar presupuestos (usar los ya preparados)
    if (presupuestosPreparados.length > 0) {
      try {
        await Budget.insertMany(presupuestosPreparados, { ordered: false });
        resultados.presupuestos = presupuestosPreparados.length;
        console.log('[BACKUP IMPORT] Presupuestos insertados exitosamente:', presupuestosPreparados.length);
      } catch (error) {
        console.error('[BACKUP IMPORT] Error al insertar presupuestos:', error);
        // Si hay errores de duplicados, intentar uno por uno
        if (error.code === 11000) {
          let insertados = 0;
          for (const presupuesto of presupuestosPreparados) {
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

    // Importar reuniones (usar las ya preparadas)
    if (reunionesPreparadas.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${reunionesPreparadas.length} reuniones usando upsert...`);
      let insertadas = 0;
      let actualizadas = 0;
      let errores = 0;
      
      for (let i = 0; i < reunionesPreparadas.length; i++) {
        const reunion = reunionesPreparadas[i];
        try {
          // Validar que tenga los campos requeridos
          if (!reunion.reunionId || !reunion.titulo || !reunion.fecha || !reunion.hora || !reunion.tipo) {
            console.warn(`[BACKUP IMPORT] Reunión ${i + 1} omitida: faltan campos requeridos`, reunion);
            errores++;
            continue;
          }
          
          // Verificar si la reunión ya existe
          const existeAntes = await Meeting.findOne({ reunionId: reunion.reunionId }).select('_id').lean();
          const eraNueva = !existeAntes;
          
          // Excluir reunionId del update para evitar conflictos
          const { reunionId, ...reunionParaActualizar } = reunion;
          
          const resultado = await Meeting.findOneAndUpdate(
            { reunionId: reunion.reunionId },
            { $set: reunionParaActualizar },
            { upsert: true, new: true, runValidators: true }
          );
          
          // Verificar que se guardó
          if (!resultado || !resultado._id) {
            throw new Error('La reunión no se guardó correctamente (sin _id)');
          }
          
          if (eraNueva) {
            insertadas++;
          } else {
            actualizadas++;
          }
          
          if ((insertadas + actualizadas) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesadas ${insertadas + actualizadas}/${reunionesPreparadas.length} reuniones...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar reunión [${i + 1}]:`, e.message);
          }
        }
      }
      
      resultados.reuniones = insertadas + actualizadas;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Reuniones importadas: ${insertadas} insertadas, ${actualizadas} actualizadas, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar reuniones`);
      }
    }

    // Importar tareas (usar las ya preparadas)
    if (tareasPreparadas.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${tareasPreparadas.length} tareas usando upsert...`);
      let insertadas = 0;
      let actualizadas = 0;
      let errores = 0;
      
      for (let i = 0; i < tareasPreparadas.length; i++) {
        const tarea = tareasPreparadas[i];
        try {
          // Validar que tenga los campos requeridos
          if (!tarea.tareaId || !tarea.titulo) {
            console.warn(`[BACKUP IMPORT] Tarea ${i + 1} omitida: faltan campos requeridos`, tarea);
            errores++;
            continue;
          }
          
          // Verificar si la tarea ya existe
          const existeAntes = await Task.findOne({ tareaId: tarea.tareaId }).select('_id').lean();
          const eraNueva = !existeAntes;
          
          // Excluir tareaId del update para evitar conflictos
          const { tareaId, ...tareaParaActualizar } = tarea;
          
          const resultado = await Task.findOneAndUpdate(
            { tareaId: tarea.tareaId },
            { $set: tareaParaActualizar },
            { upsert: true, new: true, runValidators: true }
          );
          
          // Verificar que se guardó
          if (!resultado || !resultado._id) {
            throw new Error('La tarea no se guardó correctamente (sin _id)');
          }
          
          if (eraNueva) {
            insertadas++;
          } else {
            actualizadas++;
          }
          
          if ((insertadas + actualizadas) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesadas ${insertadas + actualizadas}/${tareasPreparadas.length} tareas...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar tarea [${i + 1}]:`, e.message);
          }
        }
      }
      
      resultados.tareas = insertadas + actualizadas;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Tareas importadas: ${insertadas} insertadas, ${actualizadas} actualizadas, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar tareas`);
      }
    }

    // Verificar que los datos se insertaron correctamente
    const clientesVerificados = await Client.countDocuments();
    const pagosVerificados = await MonthlyPayment.countDocuments();
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Verificación final:`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - Clientes en BD: ${clientesVerificados} (esperados: ${resultados.clientes}, preparados: ${clientesPreparados.length})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - Pagos en BD: ${pagosVerificados} (esperados: ${resultados.pagosMensuales}, preparados: ${pagosPreparados.length})`);
    
    // Listar algunos clientes para verificación
    if (clientesVerificados > 0) {
      const algunosClientes = await Client.find({}).select('nombre crmId').limit(5).lean();
      console.log(`[BACKUP IMPORT] [${timestamp}] Primeros clientes en BD:`, algunosClientes.map(c => `${c.nombre} (${c.crmId})`).join(', '));
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: No hay clientes en la BD después de la importación`);
    }
    
    // Verificar si hubo problemas críticos con clientes
    let hayErrorCritico = false;
    let mensajeError = '';
    
    if (clientesPreparados.length > 0 && clientesVerificados === 0 && resultados.clientes === 0) {
      hayErrorCritico = true;
      mensajeError = `Error crítico: Se intentaron importar ${clientesPreparados.length} clientes pero ninguno se importó correctamente. El backup automático está disponible para restaurar.`;
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ${mensajeError}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] 💾 Backup automático disponible para restaurar:`, backupAutomatico ? 'SÍ' : 'NO');
    } else if (resultados.clientes > 0 && clientesVerificados === 0) {
      hayErrorCritico = true;
      mensajeError = `Error crítico: Se reportaron ${resultados.clientes} clientes insertados pero la BD está vacía. El backup automático está disponible para restaurar.`;
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ${mensajeError}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] 💾 Backup automático disponible para restaurar:`, backupAutomatico ? 'SÍ' : 'NO');
    } else if (resultados.clientes < clientesPreparados.length && clientesPreparados.length > 0) {
      const faltantes = clientesPreparados.length - resultados.clientes;
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: Solo se importaron ${resultados.clientes} de ${clientesPreparados.length} clientes esperados (${faltantes} faltantes)`);
      // No es crítico si al menos se importaron algunos
    }
    
    // Si hay error crítico, devolver error
    if (hayErrorCritico) {
      return NextResponse.json({
        success: false,
        error: mensajeError,
        backupAutomatico: backupAutomatico,
        resultados,
        verificacion: {
          clientesEnBD: clientesVerificados,
          clientesEsperados: resultados.clientes,
          clientesPreparados: clientesPreparados.length
        }
      }, { status: 500 });
    }

    // Si todo está bien, pero no se importaron clientes cuando se esperaba, al menos advertir
    const exitoCompleto = clientesPreparados.length === 0 || (resultados.clientes > 0 && clientesVerificados > 0);
    
    console.log(`[BACKUP IMPORT] [${timestamp}] ${exitoCompleto ? '✅' : '⚠️'} Importación ${exitoCompleto ? 'completada exitosamente' : 'completada con advertencias'}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Resumen final:`, resultados);
    
    // Incluir información del backup automático en la respuesta (por si acaso)
    return NextResponse.json({
      success: exitoCompleto,
      message: exitoCompleto ? 'Datos importados correctamente' : `Datos importados con advertencias. Clientes: ${resultados.clientes}/${clientesPreparados.length}`,
      resultados,
      timestamp: timestamp,
      backupAutomaticoCreado: backupAutomatico ? true : false,
      verificacion: {
        clientesEnBD: clientesVerificados,
        clientesEsperados: resultados.clientes,
        clientesPreparados: clientesPreparados.length
      }
    });
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[BACKUP IMPORT] [${errorTimestamp}] ❌ Error al importar backup:`, error);
    console.error(`[BACKUP IMPORT] [${errorTimestamp}] Stack:`, error.stack);
    
    // Si hay un backup automático, mencionarlo en el error
    let errorMessage = error.message || 'Error al importar los datos';
    if (backupAutomatico !== null) {
      errorMessage += ' (Backup automático disponible para restaurar)';
      console.error(`[BACKUP IMPORT] [${errorTimestamp}] 💾 Backup automático disponible para restaurar datos`);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        backupAutomatico: backupAutomatico
      },
      { status: 500 }
    );
  }
}

