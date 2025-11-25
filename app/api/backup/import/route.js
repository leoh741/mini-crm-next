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
    // Logging detallado con timestamp
    const timestamp = new Date().toISOString();
    console.log(`[BACKUP IMPORT] [${timestamp}] Iniciando importación de backup...`);
    
    // Obtener IP y headers para auditoría
    const headers = request.headers;
    const userAgent = headers.get('user-agent') || 'unknown';
    const referer = headers.get('referer') || 'unknown';
    console.log(`[BACKUP IMPORT] [${timestamp}] User-Agent: ${userAgent}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Referer: ${referer}`);
    
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
      
      console.log(`[BACKUP IMPORT] [${timestamp}] Datos parseados:`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Clientes:`, Array.isArray(clientes) ? clientes.length : 'NO ES ARRAY');
      console.log(`[BACKUP IMPORT] [${timestamp}] - Pagos:`, typeof pagosMensuales === 'object' ? Object.keys(pagosMensuales).length + ' meses' : 'NO ES OBJETO');
      console.log(`[BACKUP IMPORT] [${timestamp}] - Gastos:`, typeof gastos === 'object' ? Object.keys(gastos).length + ' periodos' : 'NO ES OBJETO');
      console.log(`[BACKUP IMPORT] [${timestamp}] - Ingresos:`, typeof ingresos === 'object' ? Object.keys(ingresos).length + ' periodos' : 'NO ES OBJETO');
      console.log(`[BACKUP IMPORT] [${timestamp}] - Usuarios:`, Array.isArray(usuarios) ? usuarios.length : 'NO ES ARRAY');
      console.log(`[BACKUP IMPORT] [${timestamp}] - Presupuestos:`, Array.isArray(presupuestos) ? presupuestos.length : 'NO ES ARRAY');
    } catch (parseError) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error al parsear JSON:`, parseError);
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

    // VALIDACIÓN CRÍTICA: Verificar que los clientes tienen nombre válido ANTES de borrar
    let clientesValidos = [];
    if (tieneClientes) {
      clientesValidos = clientes.filter(c => c.nombre && typeof c.nombre === 'string' && c.nombre.trim().length > 0);
      if (clientesValidos.length === 0) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: No hay clientes con nombre válido. NO se borrará nada.`);
        return NextResponse.json(
          { success: false, error: 'No se puede importar: ningún cliente tiene nombre válido. Los datos NO fueron borrados.' },
          { status: 400 }
        );
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] Validación de clientes: ${clientesValidos.length} válidos de ${clientes.length} totales`);
    }

    if (!tieneClientes && !tienePagos && !tieneGastos && !tieneIngresos && !tienePresupuestos) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: No hay datos válidos para importar`);
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
      presupuestos: tienePresupuestos ? await Budget.countDocuments() : 0
    };
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Documentos existentes que se borrarán:`, documentosExistentes);
    
    // PROTECCIÓN CRÍTICA: Preparar TODOS los datos ANTES de borrar nada
    // Esto asegura que si algo falla, no perdemos datos
    let clientesPreparados = [];
    let pagosPreparados = [];
    let gastosPreparados = [];
    let ingresosPreparados = [];
    let presupuestosPreparados = [];
    
    // Preparar clientes ANTES de borrar
    if (tieneClientes && clientesValidos.length > 0) {
      clientesPreparados = clientesValidos.map((cliente, index) => {
        const crmId = cliente.id || cliente.crmId || `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        
        if (!cliente.nombre || typeof cliente.nombre !== 'string' || cliente.nombre.trim().length === 0) {
          console.warn(`[BACKUP IMPORT] Cliente ${index} sin nombre válido, crmId: ${crmId}`);
        }
        
        return {
          crmId: crmId,
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
        };
      }).filter(c => c.nombre && c.nombre.trim()); // Filtrar nuevamente por seguridad
      
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
    
    // VALIDACIÓN FINAL ANTES DE BORRAR: Verificar que tenemos al menos algunos datos válidos
    const totalDatosPreparados = clientesPreparados.length + pagosPreparados.length + gastosPreparados.length + ingresosPreparados.length + presupuestosPreparados.length;
    if (totalDatosPreparados === 0) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: No hay datos válidos preparados. NO se borrará nada.`);
      return NextResponse.json(
        { success: false, error: 'Error crítico: No hay datos válidos para importar después de preparar. Los datos existentes NO fueron borrados.' },
        { status: 400 }
      );
    }
    
    console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Validación final exitosa. Total de datos preparados: ${totalDatosPreparados}`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Procediendo a limpiar colecciones y importar datos...`);
    
    // SOLO AHORA borrar colecciones existentes (después de preparar y validar todo)
    if (tieneClientes && clientesPreparados.length > 0) {
      const countAntes = documentosExistentes.clientes;
      // LOG DE AUDITORÍA: Registrar antes de borrar
      console.log(`[AUDIT] [${timestamp}] ⚠️ ELIMINACIÓN DE DATOS - Clientes: ${countAntes} documentos serán eliminados`);
      console.log(`[AUDIT] [${timestamp}] Razón: Importación de backup con ${clientesPreparados.length} clientes válidos preparados`);
      console.log(`[AUDIT] [${timestamp}] Usuario/IP: ${userAgent} | Referer: ${referer}`);
      
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

    // Importar clientes (usar los ya preparados y validados)
    if (clientesPreparados.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Intentando insertar ${clientesPreparados.length} clientes preparados...`);
      
      // Log del primer cliente para debugging
      if (clientesPreparados.length > 0) {
        console.log(`[BACKUP IMPORT] [${timestamp}] Ejemplo de cliente preparado:`, JSON.stringify(clientesPreparados[0], null, 2));
      }
      
      try {
        const result = await Client.insertMany(clientesPreparados, { ordered: false });
        resultados.clientes = result.length;
        console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Clientes insertados exitosamente: ${result.length}`);
        
        // Log de los primeros 3 clientes insertados para verificación
        if (result.length > 0) {
          console.log('[BACKUP IMPORT] Primeros clientes insertados:');
          result.slice(0, 3).forEach((c, i) => {
            console.log(`[BACKUP IMPORT]   ${i + 1}. ${c.nombre} (crmId: ${c.crmId})`);
          });
        }
      } catch (insertError) {
        console.error('[BACKUP IMPORT] Error al insertar clientes:', insertError);
        console.error('[BACKUP IMPORT] Detalles del error:', {
          code: insertError.code,
          name: insertError.name,
          message: insertError.message,
          writeErrors: insertError.writeErrors ? insertError.writeErrors.length : 0
        });
        
        // Si hay errores de duplicados, intentar uno por uno
        if (insertError.code === 11000 || insertError.name === 'BulkWriteError') {
          console.log('[BACKUP IMPORT] Intentando insertar clientes uno por uno...');
          let insertados = 0;
          let errores = 0;
          for (const cliente of clientesPreparados) {
            try {
              const resultado = await Client.findOneAndUpdate(
                { crmId: cliente.crmId },
                cliente,
                { upsert: true, new: true }
              );
              insertados++;
              console.log(`[BACKUP IMPORT] Cliente insertado/actualizado: ${cliente.nombre} (crmId: ${cliente.crmId})`);
            } catch (e) {
              errores++;
              console.error(`[BACKUP IMPORT] Error al insertar cliente "${cliente.nombre}" (crmId: ${cliente.crmId}):`, e.message);
            }
          }
          resultados.clientes = insertados;
          console.log('[BACKUP IMPORT] Clientes insertados uno por uno:', insertados, 'errores:', errores);
        } else {
          throw insertError;
        }
      }
    }

    // Importar pagos mensuales (usar los ya preparados)
    if (pagosPreparados.length > 0) {
      console.log('[BACKUP IMPORT] Intentando insertar', pagosPreparados.length, 'pagos preparados...');
      try {
        const result = await MonthlyPayment.insertMany(pagosPreparados, { ordered: false });
        resultados.pagosMensuales = result.length;
        console.log('[BACKUP IMPORT] Pagos insertados exitosamente:', result.length);
      } catch (error) {
        console.error('[BACKUP IMPORT] Error al insertar pagos:', error);
        // Si hay errores de duplicados, intentar uno por uno
        if (error.code === 11000) {
          console.log('[BACKUP IMPORT] Intentando insertar pagos uno por uno...');
          let insertados = 0;
          for (const pago of pagosPreparados) {
            try {
              await MonthlyPayment.findOneAndUpdate(
                { mes: pago.mes, crmClientId: pago.crmClientId },
                pago,
                { upsert: true }
              );
              insertados++;
            } catch (e) {
              console.warn('[BACKUP IMPORT] Error al insertar pago individual:', e.message);
            }
          }
          resultados.pagosMensuales = insertados;
          console.log('[BACKUP IMPORT] Pagos insertados uno por uno:', insertados);
        } else {
          throw error;
        }
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

    // Verificar que los datos se insertaron correctamente
    const clientesVerificados = await Client.countDocuments();
    const pagosVerificados = await MonthlyPayment.countDocuments();
    
    console.log('[BACKUP IMPORT] Verificación final:');
    console.log('[BACKUP IMPORT] - Clientes en BD:', clientesVerificados, '(esperados:', resultados.clientes, ')');
    console.log('[BACKUP IMPORT] - Pagos en BD:', pagosVerificados, '(esperados:', resultados.pagosMensuales, ')');
    
    // Listar algunos clientes para verificación
    if (clientesVerificados > 0) {
      const algunosClientes = await Client.find({}).select('nombre crmId').limit(5).lean();
      console.log('[BACKUP IMPORT] Primeros clientes en BD:', algunosClientes.map(c => `${c.nombre} (${c.crmId})`).join(', '));
    }
    
    if (resultados.clientes > 0 && clientesVerificados === 0) {
      console.error('[BACKUP IMPORT] ERROR CRÍTICO: Se reportaron clientes insertados pero la BD está vacía');
      return NextResponse.json({
        success: false,
        error: 'Error crítico: Los clientes no se insertaron correctamente en la base de datos',
        resultados
      }, { status: 500 });
    }
    
    if (resultados.clientes > clientesVerificados) {
      console.warn(`[BACKUP IMPORT] ADVERTENCIA: Se esperaban ${resultados.clientes} clientes pero solo hay ${clientesVerificados} en BD`);
    }

    console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Importación completada exitosamente`);
    console.log(`[BACKUP IMPORT] [${timestamp}] Resumen final:`, resultados);
    
    return NextResponse.json({
      success: true,
      message: 'Datos importados correctamente',
      resultados,
      timestamp: timestamp
    });
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[BACKUP IMPORT] [${errorTimestamp}] ❌ Error al importar backup:`, error);
    console.error(`[BACKUP IMPORT] [${errorTimestamp}] Stack:`, error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al importar los datos' },
      { status: 500 }
    );
  }
}

