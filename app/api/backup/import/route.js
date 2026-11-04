import { NextResponse } from 'next/server';
import connectDB, { isLocalDevConnectingToRemote } from '../../../../lib/mongo';
import { logDeleteOperation, logOperation, logDatabaseState, getDatabaseCounts } from '../../../../lib/auditLogger';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
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

export async function POST(request) {
  // PROTECCIÓN CRÍTICA: Bloquear importaciones desde desarrollo local si se conecta a base remota
  if (isLocalDevConnectingToRemote()) {
    const timestamp = new Date().toISOString();
    console.error(`[BACKUP IMPORT] [${timestamp}] 🚫 BLOQUEO DE SEGURIDAD: Intento de importación desde desarrollo local a base de datos remota`);
    console.error(`[BACKUP IMPORT] [${timestamp}] Esta operación está BLOQUEADA para prevenir borrado accidental de datos del VPS`);
    
    logOperation('IMPORT_BLOCKED_LOCAL_DEV', {
      timestamp,
      reason: 'Desarrollo local conectando a base de datos remota',
      blocked: true
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'BLOQUEO DE SEGURIDAD: No se pueden importar backups desde desarrollo local cuando se conecta a una base de datos remota (VPS). Esto previene borrados accidentales de datos de producción. Para importar, ejecuta la aplicación en el VPS o configura una base de datos local para desarrollo.',
        bloqueado: true,
        razon: 'desarrollo_local_a_remoto'
      },
      { status: 403 }
    );
  }
  // PROTECCIÓN CRÍTICA: Verificar si existe archivo de bloqueo
  // NOTA: En desarrollo local, permitir importaciones si se usa base de datos local
  try {
    const lockFile = path.join(process.cwd(), 'app', 'api', 'backup', 'import', 'route.js.lock');
    
    if (fs.existsSync(lockFile)) {
      // Verificar si estamos en desarrollo local con base de datos local
      const isLocalDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const mongoUri = process.env.MONGODB_URI || '';
      const isLocalMongo = mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1') || mongoUri.includes('mongodb://localhost') || mongoUri.includes('mongodb://127.0.0.1');
      
      // Si estamos en desarrollo local con base de datos local, permitir la importación
      if (isLocalDev && isLocalMongo) {
        console.warn('[BACKUP IMPORT] Archivo de bloqueo detectado, pero permitiendo importación en desarrollo local con base de datos local');
      } else {
        const timestamp = new Date().toISOString();
        console.error(`[BACKUP IMPORT] [${timestamp}] 🚫 BLOQUEO ACTIVO: El endpoint de importación está deshabilitado por archivo de bloqueo`);
        return NextResponse.json(
          { 
            success: false, 
            error: 'El endpoint de importación está temporalmente deshabilitado por seguridad. Contacta al administrador.',
            bloqueado: true
          },
          { status: 503 }
        );
      }
    }
  } catch (lockError) {
    // Si hay error al verificar el bloqueo, continuar (no es crítico)
    console.warn('[BACKUP IMPORT] No se pudo verificar archivo de bloqueo:', lockError.message);
  }

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
    const dbName = mongoose.connection.db?.databaseName || 'N/A';
    console.log(`[BACKUP IMPORT] [${timestamp}] Conectado a MongoDB - Base de datos: ${dbName}`);
    
    // PROTECCIÓN CRÍTICA: Registrar estado inicial de la base de datos
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
    logDatabaseState('BEFORE_IMPORT', countsBefore);
    logOperation('IMPORT_START', {
      timestamp,
      database: dbName,
      countsBefore,
      userAgent,
      referer
    });
    
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
    
    // PROTECCIÓN CRÍTICA: Requerir confirmación triple para borrar datos
    // Esto previene borrados accidentales
    if (!body.confirmDelete || body.confirmDelete !== true || typeof body.confirmDelete !== 'boolean') {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Falta confirmación explícita para borrar datos`);
      return NextResponse.json(
        { success: false, error: 'Se requiere confirmación explícita para importar. Agrega "confirmDelete": true (boolean) al body de la petición.' },
        { status: 400 }
      );
    }
    
    // REQUERIR confirmación doble adicional (confirmDelete2)
    if (!body.confirmDelete2 || body.confirmDelete2 !== true || typeof body.confirmDelete2 !== 'boolean') {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Falta segunda confirmación para borrar datos`);
      return NextResponse.json(
        { success: false, error: 'Se requiere confirmación doble para importar. Agrega "confirmDelete2": true (boolean) al body de la petición.' },
        { status: 400 }
      );
    }
    
    // PROTECCIÓN ADICIONAL: Requerir token de seguridad único por sesión
    // Esto previene ejecuciones accidentales o maliciosas
    const tokenSeguridad = body.tokenSeguridad;
    if (!tokenSeguridad || typeof tokenSeguridad !== 'string' || tokenSeguridad.length < 20) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Falta token de seguridad válido`);
      logOperation('IMPORT_BLOCKED_NO_TOKEN', {
        timestamp,
        userAgent,
        referer,
        ip
      });
      return NextResponse.json(
        { success: false, error: 'Se requiere un token de seguridad válido para importar. Este token se genera automáticamente en el frontend.' },
        { status: 400 }
      );
    }
    
    // PROTECCIÓN ADICIONAL: Verificar que el token tenga el formato correcto
    if (!tokenSeguridad.startsWith('import-') && !tokenSeguridad.startsWith('import-retry-')) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error: Token de seguridad con formato inválido`);
      logOperation('IMPORT_BLOCKED_INVALID_TOKEN', {
        timestamp,
        tokenPrefix: tokenSeguridad.substring(0, 20),
        userAgent,
        referer,
        ip
      });
      return NextResponse.json(
        { success: false, error: 'Token de seguridad inválido. El token debe generarse desde el frontend.' },
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
    let equipo = []; // Inicializar equipo como array vacío para compatibilidad con backups antiguos
    let activityLists = []; // Inicializar activityLists como array vacío para compatibilidad con backups antiguos
    let activities = []; // Inicializar activities como array vacío para compatibilidad con backups antiguos
    let informes = []; // Inicializar informes como array vacío para compatibilidad con backups antiguos

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
        // Para campos de array (clientes, usuarios, presupuestos, reuniones, tareas, equipo, activityLists, activities, informes)
        if (fieldName.includes('clientes') || fieldName.includes('usuarios') || fieldName.includes('presupuestos') || 
            fieldName.includes('reuniones') || fieldName.includes('tareas') || fieldName.includes('equipo') ||
            fieldName.includes('activityLists') || fieldName.includes('activities') || fieldName.includes('informes')) {
          return [];
        }
        // Para campos de objeto (pagosMensuales, gastos, ingresos)
        return {};
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
      // Equipo puede no existir en backups antiguos (versión < 2.3), usar array vacío por defecto
      if (body.equipo !== undefined && body.equipo !== null) {
        equipo = parseJsonField(body.equipo, 'equipo');
      } else {
        equipo = []; // Backup antiguo sin equipo
      }
      // ActivityLists y Activities pueden no existir en backups antiguos (versión < 2.4), usar array vacío por defecto
      if (body.activityLists !== undefined && body.activityLists !== null) {
        activityLists = parseJsonField(body.activityLists, 'activityLists');
      } else {
        activityLists = []; // Backup antiguo sin activityLists
      }
      if (body.activities !== undefined && body.activities !== null) {
        activities = parseJsonField(body.activities, 'activities');
      } else {
        activities = []; // Backup antiguo sin activities
      }
      // Informes pueden no existir en backups antiguos (versión < 2.5), usar array vacío por defecto
      if (body.informes !== undefined && body.informes !== null) {
        informes = parseJsonField(body.informes, 'informes');
      } else {
        informes = []; // Backup antiguo sin informes
      }
      
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
      console.log(`[BACKUP IMPORT] [${timestamp}] - Equipo:`, Array.isArray(equipo) ? `${equipo.length} miembros` : `NO ES ARRAY (tipo: ${typeof equipo})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - ActivityLists:`, Array.isArray(activityLists) ? `${activityLists.length} listas` : `NO ES ARRAY (tipo: ${typeof activityLists})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Activities:`, Array.isArray(activities) ? `${activities.length} actividades` : `NO ES ARRAY (tipo: ${typeof activities})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - Informes:`, Array.isArray(informes) ? `${informes.length} informes` : `NO ES ARRAY (tipo: ${typeof informes})`);
    } catch (parseError) {
      console.error(`[BACKUP IMPORT] [${timestamp}] Error al parsear JSON:`, parseError);
      console.error(`[BACKUP IMPORT] [${timestamp}] Stack:`, parseError.stack);
      // Asegurar que equipo, activityLists y activities estén inicializados incluso si hay error
      if (typeof equipo === 'undefined') {
        equipo = [];
      }
      if (typeof activityLists === 'undefined') {
        activityLists = [];
      }
      if (typeof activities === 'undefined') {
        activities = [];
      }
      if (typeof informes === 'undefined') {
        informes = [];
      }
      return NextResponse.json(
        { success: false, error: 'Error al parsear los datos JSON: ' + parseError.message },
        { status: 400 }
      );
    }

    // Asegurar que equipo, activityLists, activities e informes estén inicializados (por si acaso)
    if (typeof equipo === 'undefined') {
      equipo = [];
    }
    if (typeof activityLists === 'undefined') {
      activityLists = [];
    }
    if (typeof activities === 'undefined') {
      activities = [];
    }
    if (typeof informes === 'undefined') {
      informes = [];
    }

    // VALIDAR que hay datos para importar ANTES de borrar
    const tieneClientes = Array.isArray(clientes) && clientes.length > 0;
    const tienePagos = typeof pagosMensuales === 'object' && pagosMensuales !== null && Object.keys(pagosMensuales).length > 0;
    const tieneGastos = typeof gastos === 'object' && gastos !== null && Object.keys(gastos).length > 0;
    const tieneIngresos = typeof ingresos === 'object' && ingresos !== null && Object.keys(ingresos).length > 0;
    const tienePresupuestos = Array.isArray(presupuestos) && presupuestos.length > 0;
    const tieneReuniones = Array.isArray(reuniones) && reuniones.length > 0;
    const tieneTareas = Array.isArray(tareas) && tareas.length > 0;
    const tieneEquipo = Array.isArray(equipo) && equipo.length > 0;
    const tieneActivityLists = Array.isArray(activityLists) && activityLists.length > 0;
    const tieneActivities = Array.isArray(activities) && activities.length > 0;
    const tieneInformes = Array.isArray(informes) && informes.length > 0;
    
    // Logging detallado para diagnóstico
    console.log(`[BACKUP IMPORT] [${timestamp}] Resumen de datos recibidos:`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tieneClientes: ${tieneClientes} (${Array.isArray(clientes) ? clientes.length : 'NO ES ARRAY'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tienePagos: ${tienePagos} (${typeof pagosMensuales === 'object' && pagosMensuales !== null ? Object.keys(pagosMensuales).length : 'NO ES OBJETO'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tieneGastos: ${tieneGastos} (${typeof gastos === 'object' && gastos !== null ? Object.keys(gastos).length : 'NO ES OBJETO'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tieneIngresos: ${tieneIngresos} (${typeof ingresos === 'object' && ingresos !== null ? Object.keys(ingresos).length : 'NO ES OBJETO'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tienePresupuestos: ${tienePresupuestos} (${Array.isArray(presupuestos) ? presupuestos.length : 'NO ES ARRAY'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tieneReuniones: ${tieneReuniones} (${Array.isArray(reuniones) ? reuniones.length : 'NO ES ARRAY'})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - tieneTareas: ${tieneTareas} (${Array.isArray(tareas) ? tareas.length : 'NO ES ARRAY'})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - tieneEquipo: ${tieneEquipo} (${Array.isArray(equipo) ? equipo.length : 'NO ES ARRAY'})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - tieneActivityLists: ${tieneActivityLists} (${Array.isArray(activityLists) ? activityLists.length : 'NO ES ARRAY'})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - tieneActivities: ${tieneActivities} (${Array.isArray(activities) ? activities.length : 'NO ES ARRAY'})`);
      console.log(`[BACKUP IMPORT] [${timestamp}] - tieneInformes: ${tieneInformes} (${Array.isArray(informes) ? informes.length : 'NO ES ARRAY'})`);

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

    if (!tieneClientes && !tienePagos && !tieneGastos && !tieneIngresos && !tienePresupuestos && !tieneReuniones && !tieneTareas && !tieneEquipo && !tieneActivityLists && !tieneActivities && !tieneInformes) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ Error: No hay datos válidos para importar`);
      console.error(`[BACKUP IMPORT] [${timestamp}] User-Agent: ${userAgent}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] Referer: ${referer}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] Body keys recibidos:`, Object.keys(body || {}));
      console.error(`[BACKUP IMPORT] [${timestamp}] Tipos de datos en body:`, {
        clientes: typeof body?.clientes,
        pagosMensuales: typeof body?.pagosMensuales,
        gastos: typeof body?.gastos,
        ingresos: typeof body?.ingresos,
        usuarios: typeof body?.usuarios,
        presupuestos: typeof body?.presupuestos,
        reuniones: typeof body?.reuniones,
        tareas: typeof body?.tareas,
        equipo: typeof body?.equipo,
        activityLists: typeof body?.activityLists,
        activities: typeof body?.activities
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'No hay datos válidos para importar. El backup está vacío o tiene formato incorrecto. Los datos NO fueron borrados.',
          debug: {
            tieneClientes,
            tienePagos,
            tieneGastos,
            tieneIngresos,
            tienePresupuestos,
            tieneReuniones,
            tieneTareas,
            tieneEquipo,
            tieneActivityLists,
            tieneActivities,
            bodyKeys: Object.keys(body || {})
          }
        },
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
      tareas: tieneTareas ? await Task.countDocuments() : 0,
      equipo: tieneEquipo ? await TeamMember.countDocuments() : 0,
      activityLists: tieneActivityLists ? await ActivityList.countDocuments() : 0,
      activities: tieneActivities ? await Activity.countDocuments() : 0,
      informes: tieneInformes ? await Report.countDocuments() : 0
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
    let equipoPreparado = []; // Inicializar como array vacío
    let activityListsPreparadas = []; // Inicializar como array vacío
    let activitiesPreparadas = []; // Inicializar como array vacío
    let informesPreparados = []; // Inicializar como array vacío
    
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
          observaciones: cliente.observaciones || undefined,
          etiquetas: Array.isArray(cliente.etiquetas) ? cliente.etiquetas.map(e => String(e).trim().toLowerCase()).filter(e => e) : []
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
          observaciones: cliente.observaciones || undefined,
          etiquetas: Array.isArray(cliente.etiquetas) ? cliente.etiquetas.map(e => String(e).trim().toLowerCase()).filter(e => e) : []
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
              // Compatibilidad: backups viejos sin snapshot → 0 / sin nombre
              montoPagado: typeof datosPago?.montoPagado === 'number' ? datosPago.montoPagado : 0,
              clienteNombre: datosPago?.clienteNombre ? String(datosPago.clienteNombre).trim() : undefined,
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
    
    // Preparar equipo ANTES de borrar
    if (tieneEquipo && Array.isArray(equipo) && equipo.length > 0) {
      equipoPreparado = equipo.map(miembro => {
        const crmId = miembro.crmId || miembro.id || `team-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        return {
          crmId: String(crmId),
          nombre: miembro.nombre?.trim() || '',
          cargo: miembro.cargo?.trim() || undefined,
          email: miembro.email?.trim() || undefined,
          telefono: miembro.telefono?.trim() || undefined,
          calificacion: miembro.calificacion !== undefined && miembro.calificacion !== null ? Math.max(0, Math.min(10, Number(miembro.calificacion))) : 0,
          comentarios: Array.isArray(miembro.comentarios) ? miembro.comentarios.map(c => ({
            texto: String(c.texto || '').trim(),
            autor: String(c.autor || '').trim(),
            fecha: c.fecha ? new Date(c.fecha) : new Date(),
            calificacion: c.calificacion !== undefined && c.calificacion !== null ? Math.max(0, Math.min(10, Number(c.calificacion))) : undefined
          })).filter(c => c.texto && c.autor) : [],
          habilidades: Array.isArray(miembro.habilidades) ? miembro.habilidades.map(h => String(h).trim().toLowerCase()).filter(h => h) : [],
          activo: miembro.activo !== undefined ? Boolean(miembro.activo) : true
        };
      }).filter(m => m.nombre && m.nombre.trim().length > 0);
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${equipoPreparado.length} miembros del equipo preparados para importar`);
    }

    // Preparar ActivityLists ANTES de borrar
    if (tieneActivityLists && Array.isArray(activityLists) && activityLists.length > 0) {
      activityListsPreparadas = activityLists.map(list => {
        // Buscar el owner por _id, id o crmId
        let ownerId = null;
        if (list.owner) {
          if (typeof list.owner === 'string') {
            ownerId = list.owner;
          } else if (list.owner._id) {
            ownerId = list.owner._id.toString();
          } else if (list.owner.id) {
            ownerId = list.owner.id.toString();
          }
        }
        
        // Preparar members
        const members = [];
        if (Array.isArray(list.members)) {
          for (const member of list.members) {
            if (typeof member === 'string') {
              members.push(member);
            } else if (member?._id) {
              members.push(member._id.toString());
            } else if (member?.id) {
              members.push(member.id.toString());
            }
          }
        }

        return {
          name: list.name?.trim() || '',
          description: list.description?.trim() || undefined,
          color: list.color || '#22c55e',
          owner: ownerId,
          members: members,
          isArchived: list.isArchived !== undefined ? Boolean(list.isArchived) : false
        };
      }).filter(l => l.name && l.name.trim().length > 0 && l.owner);
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${activityListsPreparadas.length} listas de actividades preparadas para importar`);
    }

    // Preparar Activities ANTES de borrar (después de preparar ActivityLists)
    console.log(`[BACKUP IMPORT] [${timestamp}] Preparando actividades: tieneActivities=${tieneActivities}, activities.length=${activities?.length || 0}, esArray=${Array.isArray(activities)}`);
    
    if (tieneActivities && Array.isArray(activities) && activities.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Procesando ${activities.length} actividades del backup...`);
      activitiesPreparadas = activities.map((activity, index) => {
        // Buscar el list por _id o id - manejar múltiples formatos
        let listId = null;
        if (activity.list) {
          if (typeof activity.list === 'string') {
            listId = activity.list;
          } else if (activity.list._id) {
            listId = activity.list._id.toString();
          } else if (activity.list.id) {
            listId = activity.list.id.toString();
          } else if (activity.list.toString && typeof activity.list.toString === 'function') {
            // Si es un ObjectId sin poblar
            try {
              listId = activity.list.toString();
            } catch (e) {
              console.warn(`[BACKUP IMPORT] No se pudo convertir list a string (actividad ${index + 1}):`, e);
            }
          }
        }

        // Buscar el assignee por _id, id o crmId
        let assigneeId = null;
        if (activity.assignee) {
          if (typeof activity.assignee === 'string') {
            assigneeId = activity.assignee;
          } else if (activity.assignee._id) {
            assigneeId = activity.assignee._id.toString();
          } else if (activity.assignee.id) {
            assigneeId = activity.assignee.id.toString();
          } else if (activity.assignee.crmId) {
            assigneeId = String(activity.assignee.crmId);
          }
        }

        // Buscar el createdBy por _id, id o crmId - CRÍTICO: debe existir
        let createdById = null;
        if (activity.createdBy) {
          if (typeof activity.createdBy === 'string') {
            createdById = activity.createdBy;
          } else if (activity.createdBy._id) {
            createdById = activity.createdBy._id.toString();
          } else if (activity.createdBy.id) {
            createdById = activity.createdBy.id.toString();
          } else if (activity.createdBy.crmId) {
            createdById = String(activity.createdBy.crmId);
          }
        }

        // Quién completó el pedido (cronómetro)
        let completedById = null;
        if (activity.completedBy) {
          if (typeof activity.completedBy === 'string') {
            completedById = activity.completedBy;
          } else if (activity.completedBy._id) {
            completedById = activity.completedBy._id.toString();
          } else if (activity.completedBy.id) {
            completedById = activity.completedBy.id.toString();
          } else if (activity.completedBy.crmId) {
            completedById = String(activity.completedBy.crmId);
          }
        }

        // Logging para las primeras 3 actividades
        if (index < 3) {
          console.log(`[BACKUP IMPORT] Preparando actividad ${index + 1}/${activities.length}:`, {
            title: activity.title,
            listId: listId,
            createdById: createdById,
            assigneeId: assigneeId,
            completedById: completedById,
            elapsedMs: activity.elapsedMs,
            durationMs: activity.durationMs,
            listOriginal: activity.list,
            createdByOriginal: activity.createdBy
          });
        }

        return {
          list: listId,
          title: activity.title?.trim() || '',
          description: activity.description?.trim() || undefined,
          status: activity.status || 'pendiente',
          priority: activity.priority || 'media',
          assignee: assigneeId || undefined,
          labels: Array.isArray(activity.labels) ? activity.labels.map(l => String(l).trim()).filter(l => l) : [],
          dueDate: activity.dueDate ? new Date(activity.dueDate) : null,
          order: activity.order !== undefined ? Number(activity.order) : 0,
          createdBy: createdById,
          // Cronómetro (compatibilidad con backups viejos sin estos campos)
          startedAt: activity.startedAt ? new Date(activity.startedAt) : null,
          completedAt: activity.completedAt ? new Date(activity.completedAt) : null,
          completedBy: completedById || undefined,
          durationMs: typeof activity.durationMs === 'number' ? activity.durationMs : null,
          elapsedMs: typeof activity.elapsedMs === 'number' ? activity.elapsedMs : 0,
          isDeleted: Boolean(activity.isDeleted),
          deletedAt: activity.deletedAt ? new Date(activity.deletedAt) : null
        };
      }).filter(a => {
        // Filtrar solo actividades con título válido
        const tieneTitulo = a.title && a.title.trim().length > 0;
        if (!tieneTitulo) {
          console.warn(`[BACKUP IMPORT] Actividad omitida: sin título válido`);
          return false;
        }
        // Advertir si falta list o createdBy, pero no filtrar todavía (se manejará en la importación)
        if (!a.list) {
          console.warn(`[BACKUP IMPORT] ⚠️ Actividad "${a.title}" sin lista - se intentará importar usando lista por defecto`);
        }
        if (!a.createdBy) {
          console.warn(`[BACKUP IMPORT] ⚠️ Actividad "${a.title}" sin createdBy - se omitirá (requerido)`);
          return false;
        }
        return true;
      });
      
      const actividadesFiltradas = activities.length - activitiesPreparadas.length;
      if (actividadesFiltradas > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ${actividadesFiltradas} actividades fueron filtradas (sin título o sin createdBy)`);
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${activitiesPreparadas.length} actividades preparadas para importar (de ${activities.length} en el backup)`);
      
      // Logging detallado de las primeras 3 actividades preparadas
      if (activitiesPreparadas.length > 0) {
        console.log(`[BACKUP IMPORT] [${timestamp}] Primeras 3 actividades preparadas:`, activitiesPreparadas.slice(0, 3).map((a, i) => ({
          index: i + 1,
          title: a.title,
          list: a.list,
          createdBy: a.createdBy,
          status: a.status
        })));
      }
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ No se prepararon actividades: tieneActivities=${tieneActivities}, activities.length=${activities?.length || 0}, esArray=${Array.isArray(activities)}`);
    }
    
    // Preparar Informes ANTES de borrar (después de actividades)
    console.log(`[BACKUP IMPORT] [${timestamp}] Preparando informes: tieneInformes=${tieneInformes}, informes.length=${informes?.length || 0}, esArray=${Array.isArray(informes)}`);
    
    if (tieneInformes && Array.isArray(informes) && informes.length > 0) {
      informesPreparados = informes.map(informe => ({
        reportId: informe.reportId || `report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        clienteNombre: informe.clienteNombre?.trim() || '',
        clienteEmail: informe.clienteEmail?.trim() || undefined,
        titulo: informe.titulo?.trim() || '',
        periodo: {
          from: informe.periodo?.from ? new Date(informe.periodo.from) : new Date(),
          to: informe.periodo?.to ? new Date(informe.periodo.to) : new Date()
        },
        moneda: informe.moneda || 'ARS',
        porcentajeImpuestos: informe.porcentajeImpuestos ? Number(informe.porcentajeImpuestos) : 0,
        estado: informe.estado || 'borrador',
        createdBy: informe.createdBy || '',
        sections: Array.isArray(informe.sections) ? informe.sections : [],
        reportNotes: informe.reportNotes || {},
        share: informe.share || { enabled: false }
      })).filter(r => r.clienteNombre && r.clienteNombre.trim().length > 0 && r.titulo && r.titulo.trim().length > 0);
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ${informesPreparados.length} informes preparados para importar (de ${informes.length} en el backup)`);
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ No se prepararon informes: tieneInformes=${tieneInformes}, informes.length=${informes?.length || 0}, esArray=${Array.isArray(informes)}`);
    }
    
    // VALIDACIÓN FINAL ANTES DE BORRAR: Verificar que tenemos al menos algunos datos válidos
    const totalDatosPreparados = clientesPreparados.length + pagosPreparados.length + gastosPreparados.length + ingresosPreparados.length + presupuestosPreparados.length + reunionesPreparadas.length + tareasPreparadas.length + equipoPreparado.length + activityListsPreparadas.length + activitiesPreparadas.length + informesPreparados.length;
    if (totalDatosPreparados === 0) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ERROR CRÍTICO: No hay datos válidos preparados. NO se borrará nada.`);
      return NextResponse.json(
        { success: false, error: 'Error crítico: No hay datos válidos para importar después de preparar. Los datos existentes NO fueron borrados.' },
        { status: 400 }
      );
    }
    
    // PROTECCIÓN ADICIONAL: Si hay datos existentes y el backup tiene menos datos, requerir confirmación explícita
    const totalDatosExistentes = documentosExistentes.clientes + documentosExistentes.pagos + 
                                 documentosExistentes.gastos + documentosExistentes.ingresos +
                                 documentosExistentes.presupuestos + documentosExistentes.reuniones +
                                 documentosExistentes.tareas + documentosExistentes.equipo +
                                 documentosExistentes.activityLists + documentosExistentes.activities + documentosExistentes.informes;
    
    if (totalDatosExistentes > 0 && totalDatosPreparados < totalDatosExistentes) {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: El backup tiene MENOS datos (${totalDatosPreparados}) que los existentes (${totalDatosExistentes})`);
      if (!body.confirmDataLoss || body.confirmDataLoss !== true) {
        return NextResponse.json(
          {
            success: false,
            error: `ADVERTENCIA: El backup contiene MENOS datos (${totalDatosPreparados} items) que los existentes (${totalDatosExistentes} items). Si continúas, perderás información. Para continuar, agrega "confirmDataLoss": true además de las otras confirmaciones.`,
            requiereConfirmacion: true,
            advertencias: [
              `El backup tiene ${totalDatosPreparados} items pero existen ${totalDatosExistentes} items en la base de datos`,
              `Pérdida estimada: ${totalDatosExistentes - totalDatosPreparados} items`
            ],
            datosExistentes: documentosExistentes,
            datosPreparados: {
              clientes: clientesPreparados.length,
              pagos: pagosPreparados.length,
              gastos: gastosPreparados.length,
              ingresos: ingresosPreparados.length,
              presupuestos: presupuestosPreparados.length,
              reuniones: reunionesPreparadas.length,
              tareas: tareasPreparadas.length,
              equipo: equipoPreparado.length,
              activityLists: activityListsPreparadas.length,
              activities: activitiesPreparadas.length,
              informes: informesPreparados.length
            }
          },
          { status: 400 }
        );
      }
    }
    
    // PROTECCIÓN ADICIONAL: Si hay datos existentes, requerir doble confirmación
    const hayDatosExistentes = documentosExistentes.clientes > 0 || documentosExistentes.pagos > 0 || 
                               documentosExistentes.gastos > 0 || documentosExistentes.ingresos > 0 ||
                               documentosExistentes.presupuestos > 0 || documentosExistentes.reuniones > 0 ||
                               documentosExistentes.tareas > 0 || documentosExistentes.equipo > 0 ||
                               documentosExistentes.activityLists > 0 || documentosExistentes.activities > 0 ||
                               documentosExistentes.informes > 0;
    
    if (hayDatosExistentes) {
      // Requerir confirmación doble si hay datos existentes
      if (!body.confirmDeleteAll || body.confirmDeleteAll !== true) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ERROR: Hay datos existentes (${documentosExistentes.clientes} clientes, ${documentosExistentes.pagos} pagos, etc.) y se requiere confirmación doble.`);
        return NextResponse.json(
          { 
            success: false, 
            error: `ADVERTENCIA: Hay datos existentes en la base de datos (${documentosExistentes.clientes} clientes, ${documentosExistentes.pagos} pagos, etc.). Para borrar todos los datos existentes, debes agregar "confirmDeleteAll": true además de "confirmDelete": true. Esto es una protección adicional.`,
            datosExistentes: documentosExistentes
          },
          { status: 400 }
        );
      }
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: Se borrarán datos existentes. Confirmación doble recibida.`);
    }
    
    console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Validación final exitosa. Total de datos preparados: ${totalDatosPreparados}`);
    
    // Contar documentos que se van a importar (después de prepararlos)
    const documentosAImportar = {
      clientes: clientesPreparados.length,
      pagos: pagosPreparados.length,
      gastos: gastosPreparados.length,
      ingresos: ingresosPreparados.length,
      presupuestos: presupuestosPreparados.length,
      reuniones: reunionesPreparadas.length,
      tareas: tareasPreparadas.length,
      equipo: equipoPreparado.length,
      activityLists: activityListsPreparadas.length,
      activities: activitiesPreparadas.length,
      informes: informesPreparados.length
    };
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Documentos que se importarán:`, documentosAImportar);
    
    // PROTECCIÓN CRÍTICA: Advertir si el backup tiene MENOS datos que los existentes
    let hayPerdidaPotencial = false;
    let advertenciasPerdida = [];
    
    if (documentosExistentes.clientes > 0 && documentosAImportar.clientes < documentosExistentes.clientes) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Clientes: Tienes ${documentosExistentes.clientes} pero el backup solo tiene ${documentosAImportar.clientes} (pérdida de ${documentosExistentes.clientes - documentosAImportar.clientes} clientes)`);
    }
    
    if (documentosExistentes.pagos > 0 && documentosAImportar.pagos < documentosExistentes.pagos) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Pagos: Tienes ${documentosExistentes.pagos} pero el backup solo tiene ${documentosAImportar.pagos} (pérdida de ${documentosExistentes.pagos - documentosAImportar.pagos} pagos)`);
    }
    
    if (documentosExistentes.presupuestos > 0 && documentosAImportar.presupuestos < documentosExistentes.presupuestos) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Presupuestos: Tienes ${documentosExistentes.presupuestos} pero el backup solo tiene ${documentosAImportar.presupuestos} (pérdida de ${documentosExistentes.presupuestos - documentosAImportar.presupuestos} presupuestos)`);
    }
    
    if (documentosExistentes.reuniones > 0 && documentosAImportar.reuniones < documentosExistentes.reuniones) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Reuniones: Tienes ${documentosExistentes.reuniones} pero el backup solo tiene ${documentosAImportar.reuniones} (pérdida de ${documentosExistentes.reuniones - documentosAImportar.reuniones} reuniones)`);
    }
    
    if (documentosExistentes.tareas > 0 && documentosAImportar.tareas < documentosExistentes.tareas) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Tareas: Tienes ${documentosExistentes.tareas} pero el backup solo tiene ${documentosAImportar.tareas} (pérdida de ${documentosExistentes.tareas - documentosAImportar.tareas} tareas)`);
    }
    
    if (documentosExistentes.equipo > 0 && documentosAImportar.equipo < documentosExistentes.equipo) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Equipo: Tienes ${documentosExistentes.equipo} pero el backup solo tiene ${documentosAImportar.equipo} (pérdida de ${documentosExistentes.equipo - documentosAImportar.equipo} miembros)`);
    }
    
    if (documentosExistentes.activityLists > 0 && documentosAImportar.activityLists < documentosExistentes.activityLists) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Listas de Actividades: Tienes ${documentosExistentes.activityLists} pero el backup solo tiene ${documentosAImportar.activityLists} (pérdida de ${documentosExistentes.activityLists - documentosAImportar.activityLists} listas)`);
    }
    
    if (documentosExistentes.activities > 0 && documentosAImportar.activities < documentosExistentes.activities) {
      hayPerdidaPotencial = true;
      advertenciasPerdida.push(`Actividades: Tienes ${documentosExistentes.activities} pero el backup solo tiene ${documentosAImportar.activities} (pérdida de ${documentosExistentes.activities - documentosAImportar.activities} actividades)`);
    }
    
    // Si hay pérdida potencial significativa, requerir confirmación adicional
    if (hayPerdidaPotencial) {
      console.error(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA CRÍTICA: El backup tiene MENOS datos que los existentes!`);
      advertenciasPerdida.forEach(adv => console.error(`[BACKUP IMPORT] [${timestamp}]   - ${adv}`));
      
      // Requerir confirmación adicional específica para pérdida de datos
      if (!body.confirmDataLoss || body.confirmDataLoss !== true) {
        return NextResponse.json(
          {
            success: false,
            error: 'ADVERTENCIA: El backup contiene MENOS datos que los existentes. Esto causará pérdida de información.',
            advertencias: advertenciasPerdida,
            datosExistentes: documentosExistentes,
            datosAImportar: documentosAImportar,
            requiereConfirmacion: 'Para proceder, debes agregar "confirmDataLoss": true además de las otras confirmaciones. Esto indica que entiendes que se perderán datos.'
          },
          { status: 400 }
        );
      }
      
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Usuario confirmó pérdida de datos. Procediendo con advertencia...`);
    }
    
    // PROTECCIÓN CRÍTICA: Crear backup automático ANTES de borrar cualquier cosa
    console.log(`[BACKUP IMPORT] [${timestamp}] 🔒 Creando backup automático de seguridad antes de importar...`);
    try {
      const [clientesExistentes, pagosExistentes, gastosExistentes, ingresosExistentes, presupuestosExistentes, reunionesExistentes, tareasExistentes, equipoExistentes, activityListsExistentes, activitiesExistentes] = await Promise.all([
        Client.find({}).lean(),
        MonthlyPayment.find({}).lean(),
        Expense.find({}).lean(),
        Income.find({}).lean(),
        Budget.find({}).lean(),
        Meeting.find({}).lean(),
        Task.find({}).lean(),
        TeamMember.find({}).lean(),
        ActivityList.find({}).lean(),
        Activity.find({})
          .populate('assignee', 'nombre email crmId')
          .populate('createdBy', 'nombre email crmId')
          .populate({ path: 'completedBy', select: 'nombre email crmId', strictPopulate: false })
          .populate('list', 'name color')
          .lean()
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
        observaciones: c.observaciones,
        etiquetas: c.etiquetas || []
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
          montoPagado: typeof pago.montoPagado === 'number' ? pago.montoPagado : 0,
          clienteNombre: pago.clienteNombre || undefined,
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
      
      // Formatear equipo
      const equipoBackup = equipoExistentes.map(m => ({
        id: m.crmId || m._id.toString(),
        crmId: m.crmId || m._id.toString(),
        nombre: m.nombre,
        cargo: m.cargo || undefined,
        email: m.email || undefined,
        telefono: m.telefono || undefined,
        calificacion: m.calificacion || 0,
        comentarios: m.comentarios || [],
        habilidades: m.habilidades || [],
        activo: m.activo !== undefined ? m.activo : true,
        createdAt: m.createdAt || null,
        updatedAt: m.updatedAt || null
      }));
      
      // Formatear ActivityLists
      const activityListsBackup = activityListsExistentes.map(list => ({
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
      
      // Formatear Activities (incluye cronómetro)
      const formatUserRefBackup = (user) => {
        if (!user) return undefined;
        if (typeof user === 'string') return user;
        return {
          _id: user._id?.toString() || user.id?.toString(),
          id: user._id?.toString() || user.id?.toString(),
          crmId: user.crmId,
          nombre: user.nombre,
          email: user.email
        };
      };
      const activitiesBackup = activitiesExistentes.map(activity => ({
        id: activity._id.toString(),
        list: activity.list?._id?.toString() || activity.list?.toString() || activity.list,
        title: activity.title,
        description: activity.description || undefined,
        status: activity.status || 'pendiente',
        priority: activity.priority || 'media',
        assignee: formatUserRefBackup(activity.assignee),
        labels: activity.labels || [],
        dueDate: activity.dueDate || null,
        order: activity.order || 0,
        createdBy: formatUserRefBackup(activity.createdBy) || activity.createdBy?.toString() || activity.createdBy,
        startedAt: activity.startedAt || null,
        completedAt: activity.completedAt || null,
        completedBy: formatUserRefBackup(activity.completedBy),
        durationMs: typeof activity.durationMs === 'number' ? activity.durationMs : null,
        elapsedMs: typeof activity.elapsedMs === 'number' ? activity.elapsedMs : 0,
        isDeleted: Boolean(activity.isDeleted),
        deletedAt: activity.deletedAt || null,
        createdAt: activity.createdAt || null,
        updatedAt: activity.updatedAt || null
      }));
      
      backupAutomatico = {
        clientes: JSON.stringify(clientesBackup),
        pagosMensuales: JSON.stringify(pagosMensualesBackup),
        gastos: JSON.stringify(gastosBackup),
        ingresos: JSON.stringify(ingresosBackup),
        presupuestos: JSON.stringify(presupuestosBackup),
        reuniones: JSON.stringify(reunionesBackup),
        tareas: JSON.stringify(tareasBackup),
        equipo: JSON.stringify(equipoBackup),
        activityLists: JSON.stringify(activityListsBackup),
        activities: JSON.stringify(activitiesBackup),
        fechaExportacion: new Date().toISOString(),
        version: '2.6',
        tipo: 'backup_automatico_pre_importacion'
      };
      
      const totalItems = clientesBackup.length + Object.keys(pagosMensualesBackup).length + 
                         Object.keys(gastosBackup).length + Object.keys(ingresosBackup).length + 
                         presupuestosBackup.length + reunionesBackup.length + tareasBackup.length + equipoBackup.length +
                         activityListsBackup.length + activitiesBackup.length;
      
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Backup automático creado:`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${clientesBackup.length} clientes`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(pagosMensualesBackup).length} meses de pagos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(gastosBackup).length} periodos de gastos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${Object.keys(ingresosBackup).length} periodos de ingresos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${presupuestosBackup.length} presupuestos`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${reunionesBackup.length} reuniones`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${tareasBackup.length} tareas`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${equipoBackup.length} miembros del equipo`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${activityListsBackup.length} listas de actividades`);
      console.log(`[BACKUP IMPORT] [${timestamp}]   - ${activitiesBackup.length} actividades`);
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
    
    // PROTECCIÓN FINAL: Verificar una última vez que tenemos datos válidos antes de borrar
    const totalDatosValidos = 
      (tieneClientes ? clientesPreparados.length : 0) +
      (tienePagos ? pagosPreparados.length : 0) +
      (tieneGastos ? gastosPreparados.length : 0) +
      (tieneIngresos ? ingresosPreparados.length : 0) +
      (tienePresupuestos ? presupuestosPreparados.length : 0) +
      (tieneReuniones ? reunionesPreparadas.length : 0) +
      (tieneTareas ? tareasPreparadas.length : 0);
    
    if (totalDatosValidos === 0) {
      const errorMsg = 'ERROR CRÍTICO: No hay datos válidos para importar. Se canceló la operación para prevenir borrado sin datos.';
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ${errorMsg}`);
      logOperation('IMPORT_BLOCKED_NO_DATA', {
        timestamp,
        totalDatosValidos,
        userAgent,
        referer,
        ip,
        countsBefore
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          countsBefore,
          backupAutomatico: backupAutomatico
        },
        { status: 400 }
      );
    }
    
    // SOLO AHORA borrar colecciones existentes (después de crear backup y validar todo)
    // IMPORTANTE: Solo borramos si tenemos datos válidos preparados para insertar
    if (tieneClientes && clientesPreparados.length > 0) {
      const countAntes = documentosExistentes.clientes;
      // LOG DE AUDITORÍA: Registrar antes de borrar
      const dbName = mongoose.connection.db?.databaseName || 'N/A';
      logDeleteOperation('Client', countAntes, 'Importación de backup', {
        clientesPreparados: clientesPreparados.length,
        database: dbName,
        userAgent,
        referer,
        timestamp,
        backupAutomatico: backupAutomatico ? 'disponible' : 'no disponible'
      });
      
      await Client.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Clientes eliminados: ${countAntes} (se importarán ${clientesPreparados.length})`);
    }
    if (tienePagos && pagosPreparados.length > 0) {
      const countAntes = documentosExistentes.pagos;
      logDeleteOperation('MonthlyPayment', countAntes, 'Importación de backup', {
        pagosPreparados: pagosPreparados.length,
        timestamp
      });
      await MonthlyPayment.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Pagos eliminados: ${countAntes} (se importarán ${pagosPreparados.length})`);
    }
    if (tieneGastos && gastosPreparados.length > 0) {
      const countAntes = documentosExistentes.gastos;
      logDeleteOperation('Expense', countAntes, 'Importación de backup', {
        gastosPreparados: gastosPreparados.length,
        timestamp
      });
      await Expense.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Gastos eliminados: ${countAntes} (se importarán ${gastosPreparados.length})`);
    }
    if (tieneIngresos && ingresosPreparados.length > 0) {
      const countAntes = documentosExistentes.ingresos;
      logDeleteOperation('Income', countAntes, 'Importación de backup', {
        ingresosPreparados: ingresosPreparados.length,
        timestamp
      });
      await Income.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Ingresos eliminados: ${countAntes} (se importarán ${ingresosPreparados.length})`);
    }
    if (tienePresupuestos && presupuestosPreparados.length > 0) {
      const countAntes = documentosExistentes.presupuestos;
      logDeleteOperation('Budget', countAntes, 'Importación de backup', {
        presupuestosPreparados: presupuestosPreparados.length,
        timestamp
      });
      await Budget.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Presupuestos eliminados: ${countAntes} (se importarán ${presupuestosPreparados.length})`);
    }
    if (tieneReuniones && reunionesPreparadas.length > 0) {
      const countAntes = documentosExistentes.reuniones;
      logDeleteOperation('Meeting', countAntes, 'Importación de backup', {
        reunionesPreparadas: reunionesPreparadas.length,
        timestamp
      });
      await Meeting.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Reuniones eliminadas: ${countAntes} (se importarán ${reunionesPreparadas.length})`);
    }
    if (tieneTareas && tareasPreparadas.length > 0) {
      const countAntes = documentosExistentes.tareas;
      logDeleteOperation('Task', countAntes, 'Importación de backup', {
        tareasPreparadas: tareasPreparadas.length,
        timestamp
      });
      await Task.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Tareas eliminadas: ${countAntes} (se importarán ${tareasPreparadas.length})`);
    }
    if (tieneEquipo && equipoPreparado.length > 0) {
      const countAntes = documentosExistentes.equipo;
      logDeleteOperation('TeamMember', countAntes, 'Importación de backup', {
        equipoPreparado: equipoPreparado.length,
        timestamp
      });
      await TeamMember.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Equipo eliminado: ${countAntes} (se importarán ${equipoPreparado.length})`);
    }
    if (tieneActivityLists && activityListsPreparadas.length > 0) {
      const countAntes = documentosExistentes.activityLists;
      logDeleteOperation('ActivityList', countAntes, 'Importación de backup', {
        activityListsPreparadas: activityListsPreparadas.length,
        timestamp
      });
      await ActivityList.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Listas de actividades eliminadas: ${countAntes} (se importarán ${activityListsPreparadas.length})`);
    }
    if (tieneActivities && activitiesPreparadas.length > 0) {
      const countAntes = documentosExistentes.activities;
      logDeleteOperation('Activity', countAntes, 'Importación de backup', {
        activitiesPreparadas: activitiesPreparadas.length,
        timestamp
      });
      await Activity.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Actividades eliminadas: ${countAntes} (se importarán ${activitiesPreparadas.length})`);
    }
    if (tieneInformes && informesPreparados.length > 0) {
      const countAntes = documentosExistentes.informes;
      logDeleteOperation('Report', countAntes, 'Importación de backup', {
        informesPreparados: informesPreparados.length,
        timestamp
      });
      await Report.deleteMany({});
      console.log(`[BACKUP IMPORT] [${timestamp}] ⚠️ Informes eliminados: ${countAntes} (se importarán ${informesPreparados.length})`);
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
      tareas: 0,
      equipo: 0,
      activityLists: 0,
      activities: 0,
      informes: 0
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
              setDefaultsOnInsert: true,
              // PROTECCIÓN: Asegurar que se escriba correctamente
              writeConcern: { w: 'majority', wtimeout: 5000 }
            }
          );
          
          // Verificar que realmente se guardó
          if (!resultado || !resultado._id) {
            throw new Error('El documento no se guardó correctamente (sin _id)');
          }
          
          // PROTECCIÓN ADICIONAL: Verificar inmediatamente que el documento existe en la BD
          const verificado = await Client.findById(resultado._id).lean();
          if (!verificado) {
            throw new Error(`Cliente insertado pero no encontrado en BD inmediatamente después (crmId: ${cliente.crmId})`);
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
      
      // PROTECCIÓN CRÍTICA: Verificar cuántos clientes hay después de insertar
      // Esperar un momento para que MongoDB persista los cambios
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verificar múltiples veces para asegurar persistencia
      let countDespues = await Client.countDocuments({});
      let intentos = 0;
      while (countDespues < countAntes + insertados && intentos < 3) {
        await new Promise(resolve => setTimeout(resolve, 200));
        countDespues = await Client.countDocuments({});
        intentos++;
      }
      
      console.log(`[BACKUP IMPORT] [${timestamp}] Clientes en BD: ${countAntes} antes → ${countDespues} después (esperados: ${countAntes + insertados})`);
      
      // PROTECCIÓN: Verificar que la base de datos sea la correcta
      const dbNameVerificacion = mongoose.connection.db?.databaseName || 'N/A';
      if (dbNameVerificacion !== dbName) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: Base de datos cambió durante la inserción: ${dbName} → ${dbNameVerificacion}`);
        logOperation('IMPORT_DB_CHANGED', {
          timestamp,
          dbNameBefore: dbName,
          dbNameAfter: dbNameVerificacion
        });
      }
      
      resultados.clientes = insertados + actualizados;
      clientesInsertadosExitosamente = resultados.clientes > 0;
      
      // PROTECCIÓN: Si no se insertaron los clientes esperados, registrar advertencia
      if (countDespues < countAntes + insertados) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: Se insertaron ${insertados} clientes pero solo ${countDespues - countAntes} están en la BD`);
        logOperation('IMPORT_CLIENT_COUNT_MISMATCH', {
          timestamp,
          insertados,
          countAntes,
          countDespues,
          esperados: countAntes + insertados,
          database: dbNameVerificacion
        });
      }
      
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

    // Importar equipo (usar los ya preparados)
    if (equipoPreparado.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${equipoPreparado.length} miembros del equipo usando upsert...`);
      let insertados = 0;
      let actualizados = 0;
      let errores = 0;
      
      for (let i = 0; i < equipoPreparado.length; i++) {
        const miembro = equipoPreparado[i];
        try {
          // Validar que tenga los campos requeridos
          if (!miembro.crmId || !miembro.nombre || miembro.nombre.trim().length === 0) {
            console.warn(`[BACKUP IMPORT] Miembro ${i + 1} omitido: faltan campos requeridos`, miembro);
            errores++;
            continue;
          }
          
          // Verificar si el miembro ya existe
          const existeAntes = await TeamMember.findOne({ crmId: miembro.crmId }).select('_id').lean();
          const eraNuevo = !existeAntes;
          
          // Excluir crmId del update para evitar conflictos
          const { crmId, ...miembroParaActualizar } = miembro;
          
          const resultado = await TeamMember.findOneAndUpdate(
            { crmId: miembro.crmId },
            { $set: miembroParaActualizar },
            { upsert: true, new: true, runValidators: true }
          );
          
          // Verificar que se guardó
          if (!resultado || !resultado._id) {
            throw new Error('El miembro no se guardó correctamente (sin _id)');
          }
          
          if (eraNuevo) {
            insertados++;
          } else {
            actualizados++;
          }
          
          if ((insertados + actualizados) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesados ${insertados + actualizados}/${equipoPreparado.length} miembros...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar miembro [${i + 1}]:`, e.message);
          }
        }
      }
      
      resultados.equipo = insertados + actualizados;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Equipo importado: ${insertados} insertados, ${actualizados} actualizados, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar equipo`);
      }
    }

    // Importar ActivityLists (usar las ya preparadas)
    // IMPORTANTE: Importar ActivityLists ANTES de Activities porque Activities tienen referencia a ActivityLists
    if (activityListsPreparadas.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Insertando ${activityListsPreparadas.length} listas de actividades usando upsert...`);
      let insertadas = 0;
      let actualizadas = 0;
      let errores = 0;
      
      // Crear un mapa de IDs antiguos a nuevos para actualizar referencias en Activities
      const activityListIdMap = new Map();
      
      for (let i = 0; i < activityListsPreparadas.length; i++) {
        const list = activityListsPreparadas[i];
        try {
          // Validar que tenga los campos requeridos
          if (!list.name || !list.owner) {
            console.warn(`[BACKUP IMPORT] Lista ${i + 1} omitida: faltan campos requeridos`, list);
            errores++;
            continue;
          }
          
          // Convertir owner a ObjectId si es necesario
          let ownerObjectId;
          if (mongoose.Types.ObjectId.isValid(list.owner)) {
            ownerObjectId = new mongoose.Types.ObjectId(list.owner);
          } else {
            // Buscar por crmId
            const ownerUser = await User.findOne({ crmId: list.owner }).select('_id').lean();
            if (ownerUser) {
              ownerObjectId = ownerUser._id;
            } else {
              console.warn(`[BACKUP IMPORT] Lista ${i + 1} omitida: owner no encontrado`, list.owner);
              errores++;
              continue;
            }
          }
          
          // Convertir members a ObjectIds
          const membersObjectIds = [];
          for (const memberId of (list.members || [])) {
            if (mongoose.Types.ObjectId.isValid(memberId)) {
              membersObjectIds.push(new mongoose.Types.ObjectId(memberId));
            } else {
              const memberUser = await User.findOne({ crmId: memberId }).select('_id').lean();
              if (memberUser) {
                membersObjectIds.push(memberUser._id);
              }
            }
          }
          
          // Buscar lista existente por nombre y owner (o crear nueva)
          const listData = {
            name: list.name,
            description: list.description,
            color: list.color,
            owner: ownerObjectId,
            members: membersObjectIds,
            isArchived: list.isArchived
          };
          
          // Buscar si existe una lista con el mismo nombre y owner
          const listaExistente = await ActivityList.findOne({ 
            name: list.name,
            owner: ownerObjectId
          }).select('_id').lean();
          
          let resultado;
          if (listaExistente) {
            // Actualizar lista existente
            resultado = await ActivityList.findByIdAndUpdate(
              listaExistente._id,
              { $set: listData },
              { new: true, runValidators: true }
            );
            activityListIdMap.set(i, resultado._id.toString());
            actualizadas++;
          } else {
            // Crear nueva lista
            resultado = await ActivityList.create(listData);
            activityListIdMap.set(i, resultado._id.toString());
            insertadas++;
          }
          
          if ((insertadas + actualizadas) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesadas ${insertadas + actualizadas}/${activityListsPreparadas.length} listas...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar lista [${i + 1}]:`, e.message);
          }
        }
      }
      
      resultados.activityLists = insertadas + actualizadas;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ ActivityLists importadas: ${insertadas} insertadas, ${actualizadas} actualizadas, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar listas de actividades`);
      }
    }

    // Importar Activities (independientemente de si hay ActivityLists o no)
    // IMPORTANTE: Las actividades pueden tener referencias a listas que ya existen en la BD
    console.log(`[BACKUP IMPORT] [${timestamp}] 🔍 Verificando actividades para importar: activitiesPreparadas.length=${activitiesPreparadas.length}, tieneActivities=${tieneActivities}`);
    
    if (activitiesPreparadas && activitiesPreparadas.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Insertando ${activitiesPreparadas.length} actividades usando upsert...`);
      let insertadas = 0;
      let actualizadas = 0;
      let errores = 0;
      
      for (let i = 0; i < activitiesPreparadas.length; i++) {
        const activity = activitiesPreparadas[i];
        try {
          // Validar que tenga los campos requeridos
          if (!activity.title) {
            console.warn(`[BACKUP IMPORT] Actividad ${i + 1} omitida: falta título`, activity);
            errores++;
            continue;
          }
          
          if (!activity.createdBy) {
            console.warn(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}) omitida: falta createdBy`, activity);
            errores++;
            continue;
          }
          
          // La lista puede no estar especificada, intentaremos encontrarla o usar una por defecto
          // Convertir list a ObjectId
          let listObjectId = null;
          
          if (activity.list) {
            // Intentar convertir directamente si es un ObjectId válido
            if (mongoose.Types.ObjectId.isValid(activity.list)) {
              // Verificar que la lista existe
              const listExists = await ActivityList.findById(activity.list).select('_id name').lean();
              if (listExists) {
                listObjectId = new mongoose.Types.ObjectId(activity.list);
                console.log(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}): Lista encontrada "${listExists.name}" (${listObjectId})`);
              } else {
                console.warn(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}): Lista con ID ${activity.list} no encontrada, buscando alternativa...`);
              }
            } else {
              // Buscar lista - puede ser un string que necesita ser convertido
              const list = await ActivityList.findById(activity.list).select('_id name').lean();
              if (list) {
                listObjectId = list._id;
                console.log(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}): Lista encontrada "${list.name}" (${listObjectId})`);
              }
            }
          }
          
          // Si no se encontró la lista, usar la primera lista disponible como fallback
          if (!listObjectId) {
            const allLists = await ActivityList.find({}).select('_id name').limit(1).lean();
            if (allLists.length > 0) {
              listObjectId = allLists[0]._id;
              console.warn(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}): Lista original no encontrada, usando "${allLists[0].name}" (${listObjectId}) como fallback`);
            } else {
              // Si no hay listas, crear una lista por defecto para las actividades
              console.warn(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}): No hay listas disponibles, creando lista por defecto...`);
              try {
                // Buscar el usuario actual para crear la lista
                const firstUser = await User.findOne({}).select('_id').lean();
                if (firstUser) {
                  const defaultList = await ActivityList.create({
                    name: 'Lista Importada',
                    description: 'Lista creada automáticamente durante la importación',
                    color: '#22c55e',
                    owner: firstUser._id,
                    members: [],
                    isArchived: false
                  });
                  listObjectId = defaultList._id;
                  console.log(`[BACKUP IMPORT] Lista por defecto creada: ${listObjectId}`);
                } else {
                  console.error(`[BACKUP IMPORT] No se puede crear lista por defecto: no hay usuarios en la BD`);
                  errores++;
                  continue;
                }
              } catch (createError) {
                console.error(`[BACKUP IMPORT] Error al crear lista por defecto:`, createError);
                errores++;
                continue;
              }
            }
          }
          
          // Resolver refs de usuario (string ObjectId, crmId u objeto exportado)
          const resolverUserObjectId = async (ref) => {
            if (!ref) return null;
            const raw = typeof ref === 'object'
              ? (ref._id || ref.id || ref.crmId || null)
              : ref;
            if (!raw) return null;
            const asString = String(raw);
            if (mongoose.Types.ObjectId.isValid(asString) && String(new mongoose.Types.ObjectId(asString)) === asString) {
              return new mongoose.Types.ObjectId(asString);
            }
            const byCrmId = await User.findOne({ crmId: asString }).select('_id').lean();
            return byCrmId?._id || null;
          };

          const assigneeObjectId = await resolverUserObjectId(activity.assignee);
          const createdByObjectId = await resolverUserObjectId(activity.createdBy);
          if (!createdByObjectId) {
            console.warn(`[BACKUP IMPORT] Actividad ${i + 1} (${activity.title}) omitida: createdBy no encontrado`, activity.createdBy);
            errores++;
            continue;
          }
          const completedByObjectId = await resolverUserObjectId(activity.completedBy);
          
          const activityData = {
            list: listObjectId,
            title: activity.title,
            description: activity.description,
            status: activity.status,
            priority: activity.priority,
            assignee: assigneeObjectId || undefined,
            labels: activity.labels,
            dueDate: activity.dueDate,
            order: activity.order,
            createdBy: createdByObjectId,
            // Cronómetro del pedido
            startedAt: activity.startedAt || null,
            completedAt: activity.completedAt || null,
            completedBy: completedByObjectId || undefined,
            durationMs: typeof activity.durationMs === 'number' ? activity.durationMs : null,
            elapsedMs: typeof activity.elapsedMs === 'number' ? activity.elapsedMs : 0,
            isDeleted: Boolean(activity.isDeleted),
            deletedAt: activity.deletedAt || null
          };
          
          // Usar upsert basado en una combinación única de título, lista y createdBy
          // Esto evita duplicados pero permite múltiples actividades con el mismo título en la misma lista
          // si fueron creadas por diferentes usuarios
          const actividadExistente = await Activity.findOne({
            title: activity.title,
            list: listObjectId,
            createdBy: createdByObjectId
          }).select('_id').lean();
          
          if (actividadExistente) {
            // Actualizar actividad existente
            await Activity.findByIdAndUpdate(
              actividadExistente._id,
              { $set: activityData },
              { new: true, runValidators: true }
            );
            actualizadas++;
          } else {
            // Crear nueva actividad (siempre crear nueva para preservar todas las actividades del backup)
            await Activity.create(activityData);
            insertadas++;
          }
          
          if ((insertadas + actualizadas) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesadas ${insertadas + actualizadas}/${activitiesPreparadas.length} actividades...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar actividad [${i + 1}]:`, e.message);
          }
        }
      }
      
      resultados.activities = insertadas + actualizadas;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Activities importadas: ${insertadas} insertadas, ${actualizadas} actualizadas, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar actividades`);
      }
      
      if (insertadas === 0 && actualizadas === 0 && errores === 0) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ERROR CRÍTICO: No se importó ninguna actividad aunque había ${activitiesPreparadas.length} preparadas`);
      }
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ No se importaron actividades: activitiesPreparadas.length=${activitiesPreparadas?.length || 0}, tieneActivities=${tieneActivities}`);
    }

    // Importar informes (usar los ya preparados)
    if (informesPreparados.length > 0) {
      console.log(`[BACKUP IMPORT] [${timestamp}] Importando ${informesPreparados.length} informes...`);
      let insertadas = 0;
      let actualizadas = 0;
      let errores = 0;
      
      for (let i = 0; i < informesPreparados.length; i++) {
        const informe = informesPreparados[i];
        try {
          // Normalizar reportNotes
          const reportNotesNormalizado = {
            observaciones: informe.reportNotes?.observaciones || informe.reportNotes?.observaciones || '',
            recomendaciones: informe.reportNotes?.recomendaciones || informe.reportNotes?.recomendaciones || ''
          };
          
          // Normalizar share
          const shareNormalizado = {
            enabled: Boolean(informe.share?.enabled),
            token: informe.share?.token || undefined,
            expiresAt: informe.share?.expiresAt ? new Date(informe.share.expiresAt) : undefined
          };
          
          const informeData = {
            reportId: informe.reportId,
            clienteNombre: informe.clienteNombre.trim(),
            clienteEmail: informe.clienteEmail?.trim() || undefined,
            titulo: informe.titulo.trim(),
            periodo: {
              from: informe.periodo.from,
              to: informe.periodo.to
            },
            moneda: informe.moneda || 'ARS',
            porcentajeImpuestos: Number(informe.porcentajeImpuestos) || 0,
            estado: informe.estado || 'borrador',
            createdBy: informe.createdBy.trim(),
            sections: Array.isArray(informe.sections) ? informe.sections : [],
            reportNotes: reportNotesNormalizado,
            share: shareNormalizado
          };
          
          // Verificar si el informe ya existe
          const informeExistente = await Report.findOne({ reportId: informe.reportId }).select('_id').lean();
          
          if (informeExistente) {
            // Actualizar informe existente
            await Report.findByIdAndUpdate(
              informeExistente._id,
              { $set: informeData },
              { new: true, runValidators: true }
            );
            actualizadas++;
          } else {
            // Crear nuevo informe
            await Report.create(informeData);
            insertadas++;
          }
          
          if ((insertadas + actualizadas) % 50 === 0) {
            console.log(`[BACKUP IMPORT] [${timestamp}] Procesados ${insertadas + actualizadas}/${informesPreparados.length} informes...`);
          }
        } catch (e) {
          errores++;
          if (errores <= 5) {
            console.error(`[BACKUP IMPORT] Error al insertar informe [${i + 1}] (${informe.titulo}):`, e.message);
          }
        }
      }
      
      resultados.informes = insertadas + actualizadas;
      console.log(`[BACKUP IMPORT] [${timestamp}] ✅ Informes importados: ${insertadas} insertados, ${actualizadas} actualizados, ${errores} errores`);
      
      if (errores > 0) {
        console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Hubo ${errores} errores al importar informes`);
      }
      
      if (insertadas === 0 && actualizadas === 0 && errores === 0) {
        console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ERROR CRÍTICO: No se importó ningún informe aunque había ${informesPreparados.length} preparados`);
      }
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ No se importaron informes: informesPreparados.length=${informesPreparados?.length || 0}, tieneInformes=${tieneInformes}`);
    }

    // PROTECCIÓN CRÍTICA: Esperar un momento para que MongoDB persista todos los cambios
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verificar que la base de datos sea la correcta ANTES de verificar los datos
    const dbNameFinal = mongoose.connection.db?.databaseName || 'N/A';
    if (dbNameFinal !== dbName) {
      const errorMsg = `ERROR CRÍTICO: La base de datos cambió durante la importación. Inicial: ${dbName}, Final: ${dbNameFinal}`;
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ${errorMsg}`);
      logOperation('IMPORT_DB_CHANGED_CRITICAL', {
        timestamp,
        dbNameBefore: dbName,
        dbNameAfter: dbNameFinal,
        countsBefore,
        backupAutomatico: backupAutomatico ? 'disponible' : 'no disponible'
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          backupAutomatico: backupAutomatico
        },
        { status: 500 }
      );
    }
    
    // Verificar que los datos se insertaron correctamente
    // Verificar múltiples veces para asegurar persistencia
    let clientesVerificados = await Client.countDocuments();
    let pagosVerificados = await MonthlyPayment.countDocuments();
    
    // Si los conteos no coinciden, esperar y verificar de nuevo
    if (clientesVerificados < resultados.clientes || pagosVerificados < resultados.pagosMensuales) {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ Conteos iniciales bajos, esperando persistencia...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      clientesVerificados = await Client.countDocuments();
      pagosVerificados = await MonthlyPayment.countDocuments();
    }
    
    console.log(`[BACKUP IMPORT] [${timestamp}] Verificación final (Base de datos: ${dbNameFinal}):`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - Clientes en BD: ${clientesVerificados} (esperados: ${resultados.clientes}, preparados: ${clientesPreparados.length})`);
    console.log(`[BACKUP IMPORT] [${timestamp}] - Pagos en BD: ${pagosVerificados} (esperados: ${resultados.pagosMensuales}, preparados: ${pagosPreparados.length})`);
    
    // Listar algunos clientes para verificación
    if (clientesVerificados > 0) {
      const algunosClientes = await Client.find({}).select('nombre crmId').limit(5).lean();
      console.log(`[BACKUP IMPORT] [${timestamp}] Primeros clientes en BD:`, algunosClientes.map(c => `${c.nombre} (${c.crmId})`).join(', '));
    } else {
      console.warn(`[BACKUP IMPORT] [${timestamp}] ⚠️ ADVERTENCIA: No hay clientes en la BD después de la importación`);
    }
    
    // PROTECCIÓN CRÍTICA: Registrar estado final de la base de datos
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
    logDatabaseState('AFTER_IMPORT', countsAfter);
    
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
    
    // PROTECCIÓN CRÍTICA: Verificación final después de un delay adicional
    // Esperar más tiempo para asegurar que MongoDB persista todos los cambios
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificar una última vez que los datos siguen ahí
    const verificacionFinal = await getDatabaseCounts(connectDB, {
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
      Activity
    });
    
    // Comparar con countsAfter
    const perdidaDespues = Object.keys(countsAfter).some(key => {
      if (typeof countsAfter[key] === 'number' && typeof verificacionFinal[key] === 'number') {
        return verificacionFinal[key] < countsAfter[key];
      }
      return false;
    });
    
    if (perdidaDespues) {
      const errorMsg = 'ERROR CRÍTICO: Se detectó pérdida de datos DESPUÉS de la importación exitosa';
      console.error(`[BACKUP IMPORT] [${timestamp}] ❌ ${errorMsg}`);
      console.error(`[BACKUP IMPORT] [${timestamp}] Estado después de importar:`, countsAfter);
      console.error(`[BACKUP IMPORT] [${timestamp}] Estado en verificación final:`, verificacionFinal);
      logOperation('IMPORT_DATA_LOSS_AFTER_SUCCESS', {
        timestamp,
        countsAfter,
        verificacionFinal,
        database: dbName,
        backupAutomatico: backupAutomatico ? 'disponible' : 'no disponible'
      });
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          details: {
            afterImport: countsAfter,
            finalCheck: verificacionFinal
          },
          backupAutomatico: backupAutomatico
        },
        { status: 500 }
      );
    }
    
    // Registrar éxito en auditoría
    logOperation('IMPORT_SUCCESS', {
      timestamp,
      countsBefore,
      countsAfter,
      verificacionFinal,
      resultados: resultados,
      database: dbName,
      exitoCompleto
    });
    
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
    
    // Registrar error en auditoría
    logOperation('IMPORT_ERROR', {
      timestamp: errorTimestamp,
      error: error.message,
      stack: error.stack,
      database: mongoose.connection.db?.databaseName || 'N/A',
      backupAutomatico: backupAutomatico ? 'disponible' : 'no disponible'
    });
    
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

