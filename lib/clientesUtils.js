// Utilidades para gestionar clientes usando la API de MongoDB

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener estado de pago de un cliente para un mes específico
export async function getEstadoPagoMes(clienteId, mes, año) {
  try {
    const mesKey = getMesKey(mes, año);
    // Buscar por crmClientId (que puede ser el id original o el _id de MongoDB)
    const response = await fetch(`/api/pagos?mes=${mesKey}&crmClientId=${clienteId}`, {
      next: { revalidate: 60 } // Cache por 60 segundos
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
export async function getEstadosPagoMes(clientesIds, mes, año) {
  try {
    const mesKey = getMesKey(mes, año);
    // Convertir array de IDs a string separado por comas
    const idsString = Array.isArray(clientesIds) ? clientesIds.join(',') : clientesIds;
    
    const response = await fetch(`/api/pagos?mes=${mesKey}&clientesIds=${idsString}`, {
      next: { revalidate: 60 } // Cache por 60 segundos
    });
    
    if (!response.ok) {
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
      return estadosMap;
    }
    return {};
  } catch (error) {
    console.error('Error al leer estados de pago mensuales:', error);
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
      })
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al guardar estado de pago mensual:', error);
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
const CACHE_DURATION = 30000; // 30 segundos

// Obtener todos los clientes
export async function getClientes() {
  try {
    // Verificar cache
    const now = Date.now();
    if (clientesCache && (now - clientesCacheTime) < CACHE_DURATION) {
      return clientesCache;
    }

    const response = await fetch('/api/clientes', {
      next: { revalidate: 30 } // Revalidar cada 30 segundos
    });
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
      body: JSON.stringify(clienteData)
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al guardar cliente:', error);
    return false;
  }
}

// Obtener cliente por ID (buscando por crmId o _id)
export async function getClienteById(id) {
  try {
    // Primero intentar buscar por _id de MongoDB
    const response = await fetch(`/api/clientes/${id}`);
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
        pagado: cliente.pagado,
        pagoUnico: cliente.pagoUnico,
        pagoMesSiguiente: cliente.pagoMesSiguiente,
        servicios: cliente.servicios || [],
        observaciones: cliente.observaciones
      };
    }
    
    // Si no se encuentra por _id, buscar por crmId en todos los clientes
    const todosClientes = await getClientes();
    return todosClientes.find(c => c.id === id || c.crmId === id);
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    return null;
  }
}

// Actualizar un cliente completo
export async function actualizarCliente(id, datosActualizados) {
  limpiarCacheClientes(); // Limpiar cache al actualizar
  try {
    // Primero obtener el cliente para saber su _id de MongoDB
    const cliente = await getClienteById(id);
    if (!cliente || !cliente._id) {
      return false;
    }
    
    const response = await fetch(`/api/clientes/${cliente._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados)
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    return false;
  }
}

// Eliminar un cliente
export async function eliminarCliente(id) {
  limpiarCacheClientes(); // Limpiar cache al eliminar
  try {
    // Primero obtener el cliente para saber su _id de MongoDB
    const cliente = await getClienteById(id);
    if (!cliente || !cliente._id) {
      return false;
    }
    
    const response = await fetch(`/api/clientes/${cliente._id}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    return false;
  }
}
