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
  clearPendingEstadoPagoUpdate
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
      return {
        pagado: data.data[0].pagado,
        fechaActualizacion: data.data[0].fechaActualizacion
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
          fechaActualizacion: pago.fechaActualizacion
        };
        // Guardar en localStorage
        saveEstadoPagoToLocal(mesKey, pago.crmClientId, {
          pagado: pago.pagado,
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
          fechaActualizacion: pago.fechaActualizacion
        };
        saveEstadoPagoToLocal(mesKey, pago.crmClientId, {
          pagado: pago.pagado,
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

// Guardar estado de pago de un cliente para un mes específico
export async function guardarEstadoPagoMes(clienteId, mes, año, pagado) {
  const mesKey = getMesKey(mes, año);
  
  // ACTUALIZACIÓN OPTIMISTA: Guardar en localStorage inmediatamente
  saveEstadoPagoToLocal(mesKey, clienteId, {
    pagado,
    fechaActualizacion: new Date()
  });
  
  // Agregar a cola de sincronización
  addPendingEstadoPagoUpdate(mesKey, clienteId, pagado);
  
  // Limpiar caché en memoria relacionado
  Object.keys(estadosPagoCache).forEach(key => {
    if (key.includes(mesKey) && key.includes(clienteId)) {
      delete estadosPagoCache[key];
    }
  });
  
  // Sincronizar con MongoDB en background (no esperar)
  syncEstadoPagoToServer(clienteId, mes, año, pagado, mesKey).catch(err => {
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

// Sincronizar estado de pago con el servidor en background
async function syncEstadoPagoToServer(clienteId, mes, año, pagado, mesKey) {
  try {
    const response = await fetch('/api/pagos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mes: mesKey,
        crmClientId: clienteId,
        pagado,
        fechaActualizacion: new Date()
      }),
      signal: AbortSignal.timeout(8000)
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingEstadoPagoUpdate(mesKey, clienteId);
    } else {
      throw new Error('Error al sincronizar estado de pago');
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

// Cache simple en memoria (solo para desarrollo, en producción usar Redis o similar)
let clientesCache = null;
let clientesCacheTime = 0;
const CACHE_DURATION = 120000; // 2 minutos - reducir llamadas a MongoDB

// Cache para estados de pago mensual
let estadosPagoCache = {};
let estadosPagoCacheTime = 0;
const ESTADOS_PAGO_CACHE_DURATION = 60000; // 1 minuto

// Obtener todos los clientes
export async function getClientes() {
  try {
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

    // 3. Si no hay localStorage, obtener del servidor
    let response;
    try {
      response = await fetch('/api/clientes', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('Request timeout al obtener clientes, usando caché si existe');
        if (clientesCache) return applyPendingUpdates(clientesCache);
        if (localClientes) return applyPendingUpdates(localClientes);
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
      if (localClientes) {
        console.warn('Error al obtener clientes, usando localStorage');
        return applyPendingUpdates(localClientes);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Convertir de formato MongoDB a formato esperado por el frontend
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
      
      // Actualizar cachés
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
      signal: AbortSignal.timeout(10000)
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
      signal: AbortSignal.timeout(8000)
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

// Obtener cliente por ID (buscando por crmId o _id)
export async function getClienteById(id, useCache = true) {
  try {
    // 1. Intentar obtener de localStorage primero (más rápido)
    if (useCache) {
      const localClientes = getClientesFromLocal();
      if (localClientes) {
        let cliente = localClientes.find(c => c.id === id || c._id === id || c.crmId === id);
        if (cliente) {
          // Aplicar cambios pendientes
          const pending = getPendingClienteUpdates();
          const pendingUpdate = pending.find(p => 
            p.clienteId === id && p.operation === 'update'
          );
          if (pendingUpdate) {
            cliente = { ...cliente, ...pendingUpdate.data };
          }
          // Sincronizar en background sin esperar
          syncClienteByIdFromServer(id).catch(err => {
            console.warn('Error al sincronizar cliente en background:', err);
          });
          return cliente;
        }
      }
    }
    
    // 2. Si no está en localStorage, obtener del servidor
    const response = await fetch(`/api/clientes/${id}`, {
      cache: useCache ? 'force-cache' : 'no-store',
      next: useCache ? { revalidate: 60 } : undefined,
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      // Si falla, intentar buscar en todos los clientes del localStorage
      const localClientes = getClientesFromLocal();
      if (localClientes) {
        const cliente = localClientes.find(c => c.id === id || c._id === id || c.crmId === id);
        if (cliente) return cliente;
      }
      return null;
    }
    
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
        pagado: Boolean(cliente.pagado), // Asegurar que sea booleano
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      };
      
      // Actualizar en localStorage
      if (useCache) {
        const localClientes = getClientesFromLocal() || [];
        const index = localClientes.findIndex(c => c.id === id || c._id === id || c.crmId === id);
        if (index !== -1) {
          localClientes[index] = clienteFormateado;
        } else {
          localClientes.push(clienteFormateado);
        }
        saveClientesToLocal(localClientes);
      }
      
      return clienteFormateado;
    }
    
    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Timeout al obtener cliente, intentando desde localStorage');
      const localClientes = getClientesFromLocal();
      if (localClientes) {
        return localClientes.find(c => c.id === id || c._id === id || c.crmId === id) || null;
      }
    }
    console.error('Error al obtener cliente:', error);
    return null;
  }
}

// Sincronizar cliente específico desde el servidor en background
async function syncClienteByIdFromServer(id) {
  try {
    const response = await fetch(`/api/clientes/${id}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
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
  // Obtener cliente actual para guardar estado anterior (por si necesitamos revertir)
  const clienteActual = await getClienteById(id, true);
  if (!clienteActual || !clienteActual._id) {
    console.error('No se pudo obtener el cliente para actualizar:', id);
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
}

// Sincronizar actualización de cliente con el servidor en background
async function syncClienteUpdateToServer(mongoId, datosActualizados, clienteId, clienteAnterior) {
  try {
    const response = await fetch(`/api/clientes/${mongoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados),
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Limpiar de la cola de sincronización
      clearPendingClienteUpdates(clienteId);
      // Actualizar caché con datos del servidor si están disponibles
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
        updateClienteInLocal(clienteId, clienteActualizado);
      }
    } else {
      throw new Error('Error en respuesta de API');
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
  // Obtener cliente actual para poder revertir si falla
  const cliente = await getClienteById(id, true);
  if (!cliente || !cliente._id) {
    console.error('No se pudo obtener el cliente para eliminar:', id);
    return false;
  }
  
  // ACTUALIZACIÓN OPTIMISTA: Eliminar de localStorage inmediatamente
  removeClienteFromLocal(id);
  
  // Eliminar de caché de memoria también
  if (clientesCache) {
    clientesCache = clientesCache.filter(c => c.id !== id && c._id !== id);
    clientesCacheTime = Date.now();
  }
  
  // Agregar a cola de sincronización
  addPendingClienteUpdate('delete', id, cliente);
  
  // Limpiar caché de estados de pago relacionados
  limpiarCacheEstadosPago();
  
  // Sincronizar con MongoDB en background (no esperar)
  syncDeleteClienteToServer(cliente._id, id, cliente).catch(err => {
    console.error('Error al sincronizar eliminación de cliente:', err);
    // Revertir cambio en localStorage si falla
    addClienteToLocal(cliente);
    clearPendingClienteUpdates(id);
  });
  
  // Retornar éxito inmediatamente (actualización optimista)
  return true;
}

// Sincronizar eliminación de cliente con el servidor en background
async function syncDeleteClienteToServer(mongoId, clienteId, clienteOriginal) {
  try {
    const response = await fetch(`/api/clientes/${mongoId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(8000)
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
