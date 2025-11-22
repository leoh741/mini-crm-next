// Utilidades para gestionar clientes usando la API de MongoDB

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
    // Convertir array de IDs a string separado por comas para la key del caché
    const idsArray = Array.isArray(clientesIds) ? clientesIds : [clientesIds];
    const idsString = idsArray.join(',');
    const cacheKey = `${mesKey}-${idsArray.sort().join(',')}`;
    
    // Verificar caché si está habilitado
    if (useCache) {
      const now = Date.now();
      if (estadosPagoCache[cacheKey] && (now - estadosPagoCacheTime) < ESTADOS_PAGO_CACHE_DURATION) {
        return estadosPagoCache[cacheKey];
      }
    }
    
    const response = await fetch(`/api/pagos?mes=${mesKey}&clientesIds=${idsString}`, {
      cache: useCache ? 'force-cache' : 'no-store'
    });
    
    if (!response.ok) {
      // Si hay error pero tenemos caché, devolver caché
      if (useCache && estadosPagoCache[cacheKey]) {
        console.warn('Error al obtener estados de pago, usando caché');
        return estadosPagoCache[cacheKey];
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
      });
      
      // Guardar en caché
      if (useCache) {
        estadosPagoCache[cacheKey] = estadosMap;
        estadosPagoCacheTime = Date.now();
      }
      
      return estadosMap;
    }
    return {};
  } catch (error) {
    console.error('Error al leer estados de pago mensuales:', error);
    // Si hay error pero tenemos caché, devolver caché
    if (useCache) {
      const mesKey = getMesKey(mes, año);
      const idsArray = Array.isArray(clientesIds) ? clientesIds : [clientesIds];
      const cacheKey = `${mesKey}-${idsArray.sort().join(',')}`;
      if (estadosPagoCache[cacheKey]) {
        return estadosPagoCache[cacheKey];
      }
    }
    return {};
  }
}

// Guardar estado de pago de un cliente para un mes específico
export async function guardarEstadoPagoMes(clienteId, mes, año, pagado) {
  try {
    const mesKey = getMesKey(mes, año);
    const response = await fetch('/api/pagos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mes: mesKey,
        crmClientId: clienteId,
        pagado,
        fechaActualizacion: new Date()
      }),
      signal: AbortSignal.timeout(8000) // 8 segundos máximo
    });
    
    const data = await response.json();
    
    // Limpiar caché de estados de pago para este mes después de actualizar
    if (data.success) {
      // Limpiar cualquier caché relacionado con este mes/cliente
      Object.keys(estadosPagoCache).forEach(key => {
        if (key.includes(mesKey) && key.includes(clienteId)) {
          delete estadosPagoCache[key];
        }
      });
    }
    
    return data.success;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al guardar estado de pago mensual');
    } else {
      console.error('Error al guardar estado de pago mensual:', error);
    }
    return false;
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
    // Verificar cache
    const now = Date.now();
    if (clientesCache && (now - clientesCacheTime) < CACHE_DURATION) {
      return clientesCache;
    }

    let response;
    try {
      response = await fetch('/api/clientes', {
        cache: 'no-store', // Sin caché en fetch, pero usamos nuestro propio caché en memoria
        // Agregar timeout para evitar esperas largas
        signal: AbortSignal.timeout(10000) // 10 segundos máximo
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('Request timeout al obtener clientes, usando caché si existe');
        if (clientesCache) return clientesCache;
        throw new Error('Timeout al obtener clientes');
      }
      throw err;
    }
    
    if (!response.ok) {
      // Si hay error pero tenemos cache, devolver cache
      if (clientesCache) {
        console.warn('Error al obtener clientes, usando cache');
        return clientesCache;
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
      
      // Actualizar cache
      clientesCache = clientes;
      clientesCacheTime = now;
      
      return clientes;
    }
    return [];
  } catch (error) {
    console.error('Error al leer clientes:', error);
    // Si hay error pero tenemos cache, devolver cache
    if (clientesCache) return clientesCache;
    return [];
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
  try {
    const clienteData = {
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
    
    const response = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clienteData),
      signal: AbortSignal.timeout(8000) // 8 segundos máximo
    });
    
    const data = await response.json();
    
    // Limpiar cachés después de agregar cliente
    if (data.success) {
      limpiarCacheClientes();
    }
    
    return data.success;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al guardar cliente');
    } else {
      console.error('Error al guardar cliente:', error);
    }
    return false;
  }
}

// Obtener cliente por ID (buscando por crmId o _id)
export async function getClienteById(id, useCache = true) {
  try {
    // Primero intentar buscar por _id de MongoDB
    const response = await fetch(`/api/clientes/${id}`, {
      cache: useCache ? 'force-cache' : 'no-store',
      next: useCache ? { revalidate: 60 } : undefined
    });
    
    if (!response.ok) {
      // Si falla, NO buscar en todos los clientes (muy lento y costoso)
      // Solo retornar null - el cliente no existe o hubo un error
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      const cliente = data.data;
      return {
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
    }
    
    return null;
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    return null;
  }
}

// Actualizar un cliente completo
export async function actualizarCliente(id, datosActualizados, limpiarCache = false) {
  try {
    // Primero obtener el cliente para saber su _id de MongoDB (usar caché para ser más rápido)
    const cliente = await getClienteById(id, true);
    if (!cliente || !cliente._id) {
      console.error('No se pudo obtener el cliente para actualizar:', id);
      return false;
    }
    
    const response = await fetch(`/api/clientes/${cliente._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados),
      signal: AbortSignal.timeout(8000) // 8 segundos máximo
    });
    
    if (!response.ok) {
      console.error('Error en respuesta HTTP:', response.status);
      return false;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('Error en respuesta de API:', data);
      return false;
    }
    
    // Limpiar cachés después de actualizar cliente
    limpiarCacheClientes();
    // Si se actualizó el estado de pagado, también limpiar caché de estados de pago
    if (datosActualizados.pagado !== undefined) {
      limpiarCacheEstadosPago();
    }
    
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al actualizar cliente');
    } else {
      console.error('Error al actualizar cliente:', error);
    }
    return false;
  }
}

// Eliminar un cliente
export async function eliminarCliente(id) {
  try {
    // Primero obtener el cliente para saber su _id de MongoDB (usar caché)
    const cliente = await getClienteById(id, true);
    if (!cliente || !cliente._id) {
      console.error('No se pudo obtener el cliente para eliminar:', id);
      return false;
    }
    
    const response = await fetch(`/api/clientes/${cliente._id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(8000) // 8 segundos máximo
    });
    
    if (!response.ok) {
      console.error('Error en respuesta HTTP:', response.status);
      return false;
    }
    
    const data = await response.json();
    
    // Limpiar cachés después de eliminar cliente
    if (data.success) {
      limpiarCacheClientes();
      limpiarCacheEstadosPago(); // También limpiar estados de pago relacionados
    }
    
    return data.success;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timeout al eliminar cliente');
    } else {
      console.error('Error al eliminar cliente:', error);
    }
    return false;
  }
}
