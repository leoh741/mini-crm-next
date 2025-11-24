// Utilidades para gestionar clientes usando la API de MongoDB

import {
  saveClientesToLocal,
  getClientesFromLocal,
  updateClienteInLocal,
  addClienteToLocal,
  removeClienteFromLocal,
  addPendingClienteUpdate,
  getPendingClienteUpdates,
  clearPendingClienteUpdates,
  saveEstadoPagoToLocal,
  getEstadoPagoFromLocal,
  addPendingEstadoPagoUpdate,
  getPendingEstadoPagoUpdates,
  clearPendingEstadoPagoUpdate,
  clearAllLocalCache
} from './localStorageCache';

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener estado de pago de un cliente para un mes específico
export async function getEstadoPagoMes(clienteId, mes, año, useCache = false) {
  try {
    const mesKey = getMesKey(mes, año);
    // Buscar por crmClientId (que puede ser el id original o el _id de MongoDB)
    const response = await fetch(`/api/pagos?mes=${mesKey}&crmClientId=${clienteId}`, {
      cache: useCache ? 'force-cache' : 'no-store' // Sin caché por defecto para datos frescos
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.data && data.data.length > 0) {
      const pago = data.data[0];
      return {
        pagado: pago.pagado,
        serviciosPagados: pago.serviciosPagados || {},
        fechaActualizacion: pago.fechaActualizacion
      };
    }
    return null;
  } catch (error) {
    console.error('Error al leer estado de pago mensual:', error);
    return null;
  }
}

// Obtener estados de pago para múltiples clientes a la vez (optimización)
export async function getEstadosPagoMes(clientesIds, mes, año, useCache = true) {
  try {
    const mesKey = getMesKey(mes, año);
    const idsArray = Array.isArray(clientesIds) ? clientesIds : [clientesIds];
    const idsString = idsArray.join(',');
    const cacheKey = `${mesKey}-${idsArray.sort().join(',')}`;
    
    // 1. Verificar caché en memoria primero
    if (useCache) {
      const now = Date.now();
      if (estadosPagoCache[cacheKey] && (now - estadosPagoCacheTime) < ESTADOS_PAGO_CACHE_DURATION) {
        // Aplicar cambios pendientes de localStorage
        return applyPendingEstadosPago(estadosPagoCache[cacheKey], mesKey, idsArray);
      }
    }
    
    // 2. Intentar obtener de localStorage primero
    const estadosDesdeLocal = {};
    let tieneEstadosLocal = false;
    idsArray.forEach(clienteId => {
      const estado = getEstadoPagoFromLocal(mesKey, clienteId);
      if (estado) {
        estadosDesdeLocal[clienteId] = estado;
        tieneEstadosLocal = true;
      }
    });
    
    if (tieneEstadosLocal && useCache) {
      // Guardar en caché en memoria
      estadosPagoCache[cacheKey] = estadosDesdeLocal;
      estadosPagoCacheTime = Date.now();
      // Sincronizar en background sin esperar
      syncEstadosPagoFromServer(mesKey, idsString, idsArray).catch(err => {
        console.warn('Error al sincronizar estados de pago en background:', err);
      });
      // Aplicar cambios pendientes
      return applyPendingEstadosPago(estadosDesdeLocal, mesKey, idsArray);
    }
    
    // 3. Si no hay localStorage, obtener del servidor
    const response = await fetch(`/api/pagos?mes=${mesKey}&clientesIds=${idsString}`, {
      cache: useCache ? 'force-cache' : 'no-store'
    });
    
    if (!response.ok) {
      // Si hay error pero tenemos caché, devolver caché
      if (useCache && estadosPagoCache[cacheKey]) {
        console.warn('Error al obtener estados de pago, usando caché');
        return applyPendingEstadosPago(estadosPagoCache[cacheKey], mesKey, idsArray);
      }
      if (tieneEstadosLocal) {
        return applyPendingEstadosPago(estadosDesdeLocal, mesKey, idsArray);
      }
      return {};
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      // Convertir array a objeto con crmClientId como key
      const estadosMap = {};
      data.data.forEach(pago => {
        estadosMap[pago.crmClientId] = {
          pagado: pago.pagado,
          serviciosPagados: pago.serviciosPagados || {},
          fechaActualizacion: pago.fechaActualizacion
        };
        // Guardar en localStorage
        saveEstadoPagoToLocal(mesKey, pago.crmClientId, {
          pagado: pago.pagado,
          serviciosPagados: pago.serviciosPagados || {},
          fechaActualizacion: pago.fechaActualizacion
        });
      });
      
      // Guardar en caché en memoria
      if (useCache) {
        estadosPagoCache[cacheKey] = estadosMap;
        estadosPagoCacheTime = Date.now();
      }
      
      // Aplicar cambios pendientes
      return applyPendingEstadosPago(estadosMap, mesKey, idsArray);
    }
    return {};
  } catch (error) {
    console.error('Error al leer estados de pago mensuales:', error);
    // Si hay error pero tenemos caché, devolver caché
    if (useCache && estadosPagoCache[cacheKey]) {
      return applyPendingEstadosPago(estadosPagoCache[cacheKey], mesKey, idsArray);
    }
    // Intentar obtener de localStorage
    const estadosDesdeLocal = {};
    const idsArray = Array.isArray(clientesIds) ? clientesIds : [clientesIds];
    const mesKey = getMesKey(mes, año);
    idsArray.forEach(clienteId => {
      const estado = getEstadoPagoFromLocal(mesKey, clienteId);
      if (estado) {
        estadosDesdeLocal[clienteId] = estado;
      }
    });
    if (Object.keys(estadosDesdeLocal).length > 0) {
      return applyPendingEstadosPago(estadosDesdeLocal, mesKey, idsArray);
    }
    return {};
  }
}

// Aplicar cambios pendientes de estados de pago
function applyPendingEstadosPago(estadosMap, mesKey, clientesIds) {
  try {
    const pending = getPendingEstadoPagoUpdates();
    if (!pending || Object.keys(pending).length === 0) return estadosMap;
    
    const updatedEstados = { ...estadosMap };
    
    clientesIds.forEach(clienteId => {
      const key = `${mesKey}-${clienteId}`;
      const pendiente = pending[key];
      if (pendiente) {
        updatedEstados[clienteId] = {
          pagado: pendiente.pagado,
          serviciosPagados: pendiente.serviciosPagados || {},
          fechaActualizacion: new Date(pendiente.timestamp)
        };
      }
    });
    
    return updatedEstados;
  } catch (error) {
    console.warn('Error al aplicar cambios pendientes de estados de pago:', error);
    return estadosMap;
  }
}

// Sincronizar estados de pago desde el servidor en background
async function syncEstadosPagoFromServer(mesKey, idsString, idsArray) {
  try {
    const response = await fetch(`/api/pagos?mes=${mesKey}&clientesIds=${idsString}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.success && data.data) {
      const estadosMap = {};
      data.data.forEach(pago => {
        estadosMap[pago.crmClientId] = {
          pagado: pago.pagado,
          serviciosPagados: pago.serviciosPagados || {},
          fechaActualizacion: pago.fechaActualizacion
        };
        saveEstadoPagoToLocal(mesKey, pago.crmClientId, {
          pagado: pago.pagado,
          serviciosPagados: pago.serviciosPagados || {},
          fechaActualizacion: pago.fechaActualizacion
        });
      });
      
      const cacheKey = `${mesKey}-${idsArray.sort().join(',')}`;
      estadosPagoCache[cacheKey] = estadosMap;
      estadosPagoCacheTime = Date.now();
    }
  } catch (error) {
    console.warn('Error al sincronizar estados de pago:', error);
  }
}

// Guardar estado de pago de un cliente para un mes específico (compatibilidad con código antiguo)
export async function guardarEstadoPagoMes(clienteId, mes, año, pagado, serviciosPagados = null) {
  const mesKey = getMesKey(mes, año);
  
  // Obtener estado actual para preservar serviciosPagados si existen
  const estadoActual = getEstadoPagoFromLocal(mesKey, clienteId) || {};
  const serviciosPagadosActual = serviciosPagados !== null 
    ? serviciosPagados 
    : (estadoActual.serviciosPagados || {});
  
  // ACTUALIZACIÓN OPTIMISTA: Guardar en localStorage inmediatamente
  saveEstadoPagoToLocal(mesKey, clienteId, {
    pagado,
    serviciosPagados: serviciosPagadosActual,
    fechaActualizacion: new Date()
  });
  
  // Agregar a cola de sincronización
  addPendingEstadoPagoUpdate(mesKey, clienteId, pagado, serviciosPagadosActual);
  
  // Limpiar caché en memoria relacionado
  Object.keys(estadosPagoCache).forEach(key => {
    if (key.includes(mesKey) && key.includes(clienteId)) {
      delete estadosPagoCache[key];
    }
  });
  
  // Sincronizar con MongoDB en background (no esperar)
  syncEstadoPagoToServer(clienteId, mes, año, pagado, mesKey, serviciosPagadosActual).catch(err => {
    console.error('Error al sincronizar estado de pago:', err);
    // Revertir cambio en localStorage si falla
    const estadoAnterior = getEstadoPagoFromLocal(mesKey, clienteId);
    if (estadoAnterior && estadoAnterior.pagado === !pagado) {
      saveEstadoPagoToLocal(mesKey, clienteId, estadoAnterior);
    }
  });
  
  // Retornar éxito inmediatamente (actualización optimista)
  return true;
}

// Guardar estado de pago de un servicio específico
export async function guardarEstadoPagoServicio(clienteId, mes, año, indiceServicio, pagado) {
  const mesKey = getMesKey(mes, año);
  
  try {
    // Obtener estado actual sin caché para tener el más reciente
    const estadoActual = await getEstadoPagoMes(clienteId, mes, año, false) || {};
    const serviciosPagados = { ...(estadoActual.serviciosPagados || {}) }; // Crear copia para evitar mutaciones
    
    // Actualizar el estado del servicio específico
    serviciosPagados[indiceServicio] = pagado;
    
    // Calcular si todos los servicios están pagados (para compatibilidad)
    // Necesitamos obtener los servicios del cliente para saber cuántos hay
    const cliente = await getClienteById(clienteId, false); // Sin caché para datos frescos
    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }
    
    const todosLosServiciosPagados = cliente && cliente.servicios 
      ? cliente.servicios.every((_, idx) => serviciosPagados[idx] === true)
      : false;
    
    // Guardar en localStorage primero (actualización optimista)
    const estadoActualLocal = getEstadoPagoFromLocal(mesKey, clienteId) || {};
    saveEstadoPagoToLocal(mesKey, clienteId, {
      pagado: todosLosServiciosPagados,
      serviciosPagados: serviciosPagados,
      fechaActualizacion: new Date()
    });
    
    // Limpiar caché en memoria
    Object.keys(estadosPagoCache).forEach(key => {
      if (key.includes(mesKey) && key.includes(clienteId)) {
        delete estadosPagoCache[key];
      }
    });
    
    // Sincronizar con el servidor y ESPERAR la respuesta
    await syncEstadoPagoToServer(clienteId, mes, año, todosLosServiciosPagados, mesKey, serviciosPagados);
    
    // Limpiar de la cola de sincronización después de éxito
    clearPendingEstadoPagoUpdate(mesKey, clienteId);
    
    return true;
  } catch (error) {
    console.error('Error en guardarEstadoPagoServicio:', error);
    // Revertir cambio en localStorage si falla
    try {
      const estadoAnterior = getEstadoPagoFromLocal(mesKey, clienteId);
      if (estadoAnterior) {
        // Intentar restaurar estado anterior
        const estadoOriginal = await getEstadoPagoMes(clienteId, mes, año, false);
        if (estadoOriginal) {
          saveEstadoPagoToLocal(mesKey, clienteId, estadoOriginal);
        }
      }
    } catch (revertErr) {
      console.error('Error al revertir cambio en localStorage:', revertErr);
    }
    throw error;
  }
}

// Sincronizar estado de pago con el servidor en background
async function syncEstadoPagoToServer(clienteId, mes, año, pagado, mesKey, serviciosPagados = null) {
  try {
    const body = {
      mes: mesKey,
      crmClientId: clienteId,
      pagado,
      fechaActualizacion: new Date()
    };
    
    // Si hay serviciosPagados, incluirlos
    if (serviciosPagados !== null) {
      body.serviciosPagados = serviciosPagados;
    }
    
    const response = await fetch('/api/pagos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000) // Aumentado a 10 segundos para conexiones lentas
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error HTTP ${response.status}: ${errorText || 'Error desconocido'}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingEstadoPagoUpdate(mesKey, clienteId);
    } else {
      throw new Error(data.error || 'Error al sincronizar estado de pago');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al sincronizar estado de pago mensual');
    } else {
      console.error('Error al sincronizar estado de pago mensual:', error);
    }
    throw error;
  }
}

// Obtener todos los meses con registros
export async function getMesesConRegistros() {
  try {
    const response = await fetch('/api/pagos');
    const data = await response.json();
    
    if (data.success) {
      const meses = [...new Set(data.data.map(p => p.mes))];
      return meses.sort().reverse();
    }
    return [];
  } catch (error) {
    console.error('Error al leer meses con registros:', error);
    return [];
  }
}

// Cache optimizado para servidor VPS
let clientesCache = null;
let clientesCacheTime = 0;
const CACHE_DURATION = 180000; // 3 minutos - servidor local puede tener cache más largo

// Cache para estados de pago mensual - optimizado para servidor local
let estadosPagoCache = {};
let estadosPagoCacheTime = 0;
const ESTADOS_PAGO_CACHE_DURATION = 120000; // 2 minutos - servidor local puede tener cache más largo

// Obtener todos los clientes
export async function getClientes(forceRefresh = false) {
  try {
    // Si se fuerza la recarga, saltar cachés
    if (!forceRefresh) {
      // 1. Verificar caché en memoria primero
      const now = Date.now();
      if (clientesCache && (now - clientesCacheTime) < CACHE_DURATION) {
        // Aplicar cambios pendientes de localStorage
        return applyPendingUpdates(clientesCache);
      }

      // 2. Intentar obtener de localStorage primero (más rápido)
      const localClientes = getClientesFromLocal();
      if (localClientes && localClientes.length > 0) {
        // Actualizar caché en memoria
        clientesCache = localClientes;
        clientesCacheTime = now;
        // Aplicar cambios pendientes
        const clientesConPendientes = applyPendingUpdates(localClientes);
        // Actualizar caché en memoria con pendientes aplicados
        if (clientesConPendientes !== localClientes) {
          clientesCache = clientesConPendientes;
        }
        // Sincronizar en background sin esperar
        syncClientesFromServer().catch(err => {
          console.warn('Error al sincronizar clientes en background:', err);
        });
        return clientesConPendientes;
      }
    }

    // 3. Si no hay localStorage, obtener del servidor
    let response;
    let localClientes = null;
    if (!forceRefresh) {
      localClientes = getClientesFromLocal();
    }
    
    try {
      response = await fetch('/api/clientes', {
        cache: 'no-store', // Sin caché para obtener datos frescos
        signal: AbortSignal.timeout(30000) // Timeout aumentado a 30 segundos para servidor VPS
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('Request timeout al obtener clientes, usando caché si existe');
        if (clientesCache) return applyPendingUpdates(clientesCache);
        if (localClientes && localClientes.length > 0) return applyPendingUpdates(localClientes);
        throw new Error('Timeout al obtener clientes');
      }
      throw err;
    }
    
    if (!response.ok) {
      // Si hay error pero tenemos cache, devolver cache
      if (clientesCache) {
        console.warn('Error al obtener clientes, usando cache');
        return applyPendingUpdates(clientesCache);
      }
      if (localClientes && localClientes.length > 0) {
        console.warn('Error al obtener clientes, usando localStorage');
        return applyPendingUpdates(localClientes);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Convertir de formato MongoDB a formato esperado por el frontend
      const clientes = data.data.map(cliente => ({
        id: cliente.crmId || cliente._id?.toString() || cliente._id,
        _id: cliente._id?.toString() || cliente._id,
        crmId: cliente.crmId || cliente._id?.toString() || cliente._id,
        nombre: cliente.nombre,
        rubro: cliente.rubro,
        ciudad: cliente.ciudad,
        email: cliente.email,
        montoPago: cliente.montoPago,
        fechaPago: cliente.fechaPago,
        pagado: cliente.pagado,
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      }));
      
      // Actualizar cachés
      const now = Date.now();
      clientesCache = clientes;
      clientesCacheTime = now;
      saveClientesToLocal(clientes); // Guardar en localStorage
      
      // Aplicar cambios pendientes
      return applyPendingUpdates(clientes);
    }
    return [];
  } catch (error) {
    console.error('Error al leer clientes:', error);
    // Si hay error pero tenemos cache, devolver cache
    if (clientesCache) return applyPendingUpdates(clientesCache);
    const localClientes = getClientesFromLocal();
    if (localClientes) return applyPendingUpdates(localClientes);
    return [];
  }
}

// Aplicar cambios pendientes a los clientes
function applyPendingUpdates(clientes) {
  try {
    const pending = getPendingClienteUpdates();
    if (!pending || pending.length === 0) return clientes;

    let updatedClientes = [...clientes];
    
    pending.forEach(update => {
      if (update.operation === 'update') {
        const index = updatedClientes.findIndex(
          c => c.id === update.clienteId || c._id === update.clienteId
        );
        if (index !== -1) {
          updatedClientes[index] = { ...updatedClientes[index], ...update.data };
        }
      } else if (update.operation === 'delete') {
        updatedClientes = updatedClientes.filter(
          c => c.id !== update.clienteId && c._id !== update.clienteId
        );
      } else if (update.operation === 'create' && update.data) {
        updatedClientes.push(update.data);
      }
    });
    
    return updatedClientes;
  } catch (error) {
    console.warn('Error al aplicar cambios pendientes:', error);
    return clientes;
  }
}

// Sincronizar clientes desde el servidor en background
async function syncClientesFromServer() {
  try {
    const response = await fetch('/api/clientes', {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.success) {
      const clientes = data.data.map(cliente => ({
        id: cliente.crmId || cliente._id.toString(),
        _id: cliente._id.toString(),
        nombre: cliente.nombre,
        rubro: cliente.rubro,
        ciudad: cliente.ciudad,
        email: cliente.email,
        montoPago: cliente.montoPago,
        fechaPago: cliente.fechaPago,
        pagado: cliente.pagado,
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      }));
      
      const now = Date.now();
      clientesCache = clientes;
      clientesCacheTime = now;
      saveClientesToLocal(clientes);
    }
  } catch (error) {
    console.warn('Error al sincronizar clientes:', error);
  }
}

// Función para limpiar el cache (útil después de crear/editar/eliminar)
export function limpiarCacheClientes() {
  clientesCache = null;
  clientesCacheTime = 0;
}

// Función para limpiar el caché de estados de pago
export function limpiarCacheEstadosPago() {
  estadosPagoCache = {};
  estadosPagoCacheTime = 0;
}

// Función para limpiar todos los cachés
export function limpiarTodosLosCaches() {
  limpiarCacheClientes();
  limpiarCacheEstadosPago();
  
  // También limpiar localStorage
  if (typeof window !== 'undefined') {
    clearAllLocalCache();
  }
}

// Guardar un nuevo cliente
export async function agregarCliente(cliente) {
  const clienteData = {
    id: cliente.id || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    crmId: cliente.id || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
  
  // ACTUALIZACIÓN OPTIMISTA: Agregar a localStorage inmediatamente
  addClienteToLocal(clienteData);
  
  // Agregar a caché de memoria también
  if (clientesCache) {
    clientesCache.push(clienteData);
    clientesCacheTime = Date.now();
  }
  
  // Agregar a cola de sincronización
  addPendingClienteUpdate('create', clienteData.id, clienteData);
  
  // Sincronizar con MongoDB en background (no esperar)
  syncAddClienteToServer(clienteData).catch(err => {
    console.error('Error al sincronizar nuevo cliente:', err);
    // Revertir cambio en localStorage si falla
    removeClienteFromLocal(clienteData.id);
    clearPendingClienteUpdates(clienteData.id);
  });
  
  // Retornar éxito inmediatamente (actualización optimista)
  return true;
}

// Sincronizar nuevo cliente con el servidor en background
async function syncAddClienteToServer(cliente) {
  try {
    const clienteData = {
      crmId: cliente.crmId,
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
    
    const response = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clienteData),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingClienteUpdates(cliente.id);
      // Actualizar con datos del servidor si están disponibles
      if (data.data) {
        const clienteActualizado = {
          id: data.data.crmId || data.data._id.toString(),
          _id: data.data._id.toString(),
          nombre: data.data.nombre,
          rubro: data.data.rubro,
          ciudad: data.data.ciudad,
          email: data.data.email,
          montoPago: data.data.montoPago,
          fechaPago: data.data.fechaPago,
          pagado: data.data.pagado,
          pagoUnico: data.data.pagoUnico,
          pagoMesSiguiente: data.data.pagoMesSiguiente,
          servicios: data.data.servicios || [],
          observaciones: data.data.observaciones
        };
        // Reemplazar en localStorage con datos del servidor
        removeClienteFromLocal(cliente.id);
        addClienteToLocal(clienteActualizado);
      }
      // Limpiar caché para forzar recarga
      limpiarCacheClientes();
    } else {
      throw new Error('Error en respuesta de API');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al sincronizar nuevo cliente');
    } else {
      console.error('Error al sincronizar nuevo cliente:', error);
    }
    throw error;
  }
}

// Función auxiliar para comparar IDs de cliente
function matchClienteId(cliente, searchId) {
  if (!cliente || !searchId) return false;
  const strSearchId = String(searchId);
  const cId = String(cliente.id || '');
  const c_id = String(cliente._id || '');
  const cCrmId = String(cliente.crmId || '');
  return cId === strSearchId || c_id === strSearchId || cCrmId === strSearchId;
}

// Obtener cliente por ID (buscando por crmId o _id)
export async function getClienteById(id, useCache = true) {
  if (!id) {
    console.error('getClienteById: ID no proporcionado');
    return null;
  }

  try {
    // PRIMERO: Intentar obtener del servidor (fuente de verdad)
    const response = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
      cache: useCache ? 'force-cache' : 'no-store',
      next: useCache ? { revalidate: 60 } : undefined,
      signal: AbortSignal.timeout(30000) // Timeout aumentado a 30 segundos para servidor VPS
    });
    
    const data = await response.json();
    
    if (response.ok && data.success && data.data) {
      const cliente = data.data;
      const clienteFormateado = {
        id: cliente.crmId || cliente._id?.toString() || cliente._id,
        _id: cliente._id?.toString() || cliente._id,
        crmId: cliente.crmId || cliente._id?.toString() || cliente._id,
        nombre: cliente.nombre,
        rubro: cliente.rubro,
        ciudad: cliente.ciudad,
        email: cliente.email,
        montoPago: cliente.montoPago,
        fechaPago: cliente.fechaPago,
        pagado: Boolean(cliente.pagado),
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      };
      
      // Actualizar en localStorage como caché
      if (useCache) {
        const localClientes = getClientesFromLocal() || [];
        const index = localClientes.findIndex(c => matchClienteId(c, clienteFormateado.id));
        if (index !== -1) {
          localClientes[index] = clienteFormateado;
        } else {
          localClientes.push(clienteFormateado);
        }
        saveClientesToLocal(localClientes);
      }
      
      // Aplicar cambios pendientes si hay
      const pending = getPendingClienteUpdates();
      const pendingUpdate = pending.find(p => matchClienteId({ id: p.clienteId }, id) && p.operation === 'update');
      if (pendingUpdate && pendingUpdate.data) {
        return { ...clienteFormateado, ...pendingUpdate.data };
      }
      
      return clienteFormateado;
    } else {
      // Si la respuesta no es exitosa, loggear el error
      console.warn(`Cliente ${id} no encontrado en servidor:`, data.error || 'Error desconocido');
    }
    
    // Si falla el servidor, intentar desde localStorage como fallback
    if (useCache) {
      const localClientes = getClientesFromLocal();
      if (localClientes && Array.isArray(localClientes) && localClientes.length > 0) {
        let cliente = localClientes.find(c => matchClienteId(c, id));
        
        if (cliente) {
          console.warn(`Cliente ${id} obtenido de localStorage como fallback`);
          // Aplicar cambios pendientes
          const pending = getPendingClienteUpdates();
          const pendingUpdate = pending.find(p => matchClienteId({ id: p.clienteId }, id) && p.operation === 'update');
          if (pendingUpdate && pendingUpdate.data) {
            cliente = { ...cliente, ...pendingUpdate.data };
          }
          return cliente;
        }
      }
    }
    
    // Si no se encuentra en ningún lugar
    console.error(`Cliente ${id} no encontrado ni en servidor ni en localStorage`);
    return null;
    
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    
    // En caso de error, intentar desde localStorage como último recurso
    if (useCache) {
      const localClientes = getClientesFromLocal();
      if (localClientes && Array.isArray(localClientes) && localClientes.length > 0) {
        let cliente = localClientes.find(c => matchClienteId(c, id));
        if (cliente) {
          console.warn(`Cliente ${id} obtenido de localStorage después de error:`, error.message);
          // Aplicar cambios pendientes
          const pending = getPendingClienteUpdates();
          const pendingUpdate = pending.find(p => matchClienteId({ id: p.clienteId }, id) && p.operation === 'update');
          if (pendingUpdate && pendingUpdate.data) {
            cliente = { ...cliente, ...pendingUpdate.data };
          }
          return cliente;
        }
      }
    }
    
    return null;
  }
}

// Sincronizar cliente específico desde el servidor en background
async function syncClienteByIdFromServer(id) {
  try {
    const response = await fetch(`/api/clientes/${id}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.success && data.data) {
      const cliente = data.data;
      const clienteFormateado = {
        id: cliente.crmId || cliente._id.toString(),
        _id: cliente._id.toString(),
        nombre: cliente.nombre,
        rubro: cliente.rubro,
        ciudad: cliente.ciudad,
        email: cliente.email,
        montoPago: cliente.montoPago,
        fechaPago: cliente.fechaPago,
        pagado: Boolean(cliente.pagado),
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      };
      
      // Actualizar en localStorage
      const localClientes = getClientesFromLocal() || [];
      const index = localClientes.findIndex(c => c.id === id || c._id === id || c.crmId === id);
      if (index !== -1) {
        localClientes[index] = clienteFormateado;
      } else {
        localClientes.push(clienteFormateado);
      }
      saveClientesToLocal(localClientes);
    }
  } catch (error) {
    console.warn('Error al sincronizar cliente específico:', error);
  }
}

// Actualizar un cliente completo
export async function actualizarCliente(id, datosActualizados, limpiarCache = false) {
  try {
    // Obtener cliente actual para guardar estado anterior (por si necesitamos revertir)
    const clienteActual = await getClienteById(id, true);
    if (!clienteActual) {
      console.error('No se pudo obtener el cliente para actualizar:', id);
      return false;
    }
    
    // Si no tiene _id, intentar obtenerlo de otra forma
    if (!clienteActual._id) {
      console.warn('Cliente no tiene _id, intentando obtener desde servidor...');
      // Intentar obtener desde servidor directamente
      try {
        const response = await fetch(`/api/clientes/${id}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(30000)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            clienteActual._id = data.data._id;
          }
        }
      } catch (err) {
        console.error('Error al obtener _id del servidor:', err);
      }
    }
    
    if (!clienteActual._id) {
      console.error('No se pudo obtener el _id del cliente para actualizar:', id);
      return false;
    }
    
    // ACTUALIZACIÓN OPTIMISTA: Actualizar en localStorage inmediatamente
    updateClienteInLocal(id, datosActualizados);
    
    // Actualizar en caché de memoria también
    if (clientesCache) {
      const index = clientesCache.findIndex(c => c.id === id || c._id === id);
      if (index !== -1) {
        clientesCache[index] = { ...clientesCache[index], ...datosActualizados };
        clientesCacheTime = Date.now();
      }
    }
    
    // Agregar a cola de sincronización
    addPendingClienteUpdate('update', id, datosActualizados);
    
    // Limpiar cachés si se solicita
    if (limpiarCache) {
      limpiarCacheClientes();
      if (datosActualizados.pagado !== undefined) {
        limpiarCacheEstadosPago();
      }
    }
    
    // Sincronizar con MongoDB en background (no esperar)
    syncClienteUpdateToServer(clienteActual._id, datosActualizados, id, clienteActual).catch(err => {
      console.error('Error al sincronizar actualización de cliente:', err);
      // Revertir cambio en localStorage si falla
      updateClienteInLocal(id, clienteActual);
      clearPendingClienteUpdates(id);
    });
    
    // Retornar éxito inmediatamente (actualización optimista)
    return true;
  } catch (error) {
    console.error('Error en actualizarCliente:', error);
    return false;
  }
}

// Sincronizar actualización de cliente con el servidor en background
async function syncClienteUpdateToServer(mongoId, datosActualizados, clienteId, clienteAnterior) {
  try {
    // Intentar primero con mongoId, si no funciona, intentar con clienteId
    let response = await fetch(`/api/clientes/${mongoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados),
      signal: AbortSignal.timeout(30000) // Timeout adecuado para servidor local
    });
    
    // Si falla con mongoId, intentar con clienteId
    if (!response.ok && clienteId !== mongoId) {
      console.warn('Falló con mongoId, intentando con clienteId...');
      response = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosActualizados),
        signal: AbortSignal.timeout(30000) // Timeout adecuado para servidor local
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error en respuesta HTTP:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingClienteUpdates(clienteId);
      // Actualizar caché con datos del servidor si están disponibles
      if (data.data) {
        const clienteActualizado = {
          id: data.data.crmId || data.data._id?.toString() || data.data._id,
          _id: data.data._id?.toString() || data.data._id,
          nombre: data.data.nombre,
          rubro: data.data.rubro,
          ciudad: data.data.ciudad,
          email: data.data.email,
          montoPago: data.data.montoPago,
          fechaPago: data.data.fechaPago,
          pagado: data.data.pagado,
          pagoUnico: data.data.pagoUnico,
          pagoMesSiguiente: data.data.pagoMesSiguiente,
          servicios: data.data.servicios || [],
          observaciones: data.data.observaciones
        };
        updateClienteInLocal(clienteId, clienteActualizado);
      }
    } else {
      console.error('Error en respuesta de API:', data.error);
      throw new Error(data.error || 'Error en respuesta de API');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al sincronizar cliente');
    } else {
      console.error('Error al sincronizar cliente:', error);
    }
    throw error;
  }
}

// Eliminar un cliente
export async function eliminarCliente(id) {
  try {
    if (!id) {
      console.error('ID de cliente no proporcionado para eliminar');
      return false;
    }
    
    // Intentar eliminar del servidor (la API puede manejar tanto _id como crmId)
    const response = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30000) // Timeout de 10 segundos
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      console.error('Error al eliminar cliente del servidor:', response.status, errorData.error || 'Error desconocido');
      return false;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('Error en respuesta del servidor:', data.error || 'Error desconocido');
      return false;
    }
    
    // Si la eliminación fue exitosa, limpiar de localStorage y caché
    removeClienteFromLocal(id);
    
    // Eliminar de caché de memoria también
    if (clientesCache) {
      clientesCache = clientesCache.filter(c => {
        const cId = String(c.id || '');
        const c_id = String(c._id || '');
        const cCrmId = String(c.crmId || '');
        const searchId = String(id);
        return cId !== searchId && c_id !== searchId && cCrmId !== searchId;
      });
      clientesCacheTime = Date.now();
    }
    
    // Limpiar de la cola de sincronización si existe
    clearPendingClienteUpdates(id);
    
    // Limpiar caché de estados de pago relacionados
    limpiarCacheEstadosPago();
    
    // Retornar éxito
    return true;
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    if (error.name === 'AbortError') {
      console.error('Timeout al eliminar cliente');
    }
    return false;
  }
}

// Sincronizar eliminación de cliente con el servidor en background
async function syncDeleteClienteToServer(mongoId, clienteId, clienteOriginal) {
  try {
    const response = await fetch(`/api/clientes/${mongoId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingClienteUpdates(clienteId);
      // Limpiar cachés
      limpiarCacheClientes();
      limpiarCacheEstadosPago();
    } else {
      throw new Error('Error en respuesta de API');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al sincronizar eliminación de cliente');
    } else {
      console.error('Error al sincronizar eliminación de cliente:', error);
    }
    throw error;
  }
}
