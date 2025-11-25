// Sistema de caché local con localStorage para actualizaciones optimistas
// Permite actualizaciones instantáneas en la UI mientras se sincroniza con MongoDB

const STORAGE_KEYS = {
  CLIENTES: 'crm_clientes_cache',
  CLIENTES_PENDING: 'crm_clientes_pending',
  ESTADOS_PAGO: 'crm_estados_pago_cache',
  ESTADOS_PAGO_PENDING: 'crm_estados_pago_pending',
  LAST_SYNC: 'crm_last_sync'
};

// ==================== CLIENTES ====================

/**
 * Guardar clientes en localStorage
 */
export function saveClientesToLocal(clientes) {
  try {
    if (typeof window === 'undefined') return;
    const data = {
      clientes,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(data));
  } catch (error) {
    console.warn('Error al guardar clientes en localStorage:', error);
  }
}

/**
 * Obtener clientes desde localStorage
 * IMPORTANTE: El caché NO expira para proteger los datos del usuario.
 * Si la base de datos está vacía, siempre se usará el caché local como respaldo.
 */
export function getClientesFromLocal() {
  try {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTES);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Cache NO expira - los datos son valiosos y deben preservarse
    // Solo se actualiza cuando hay datos frescos del servidor
    return parsed.clientes;
  } catch (error) {
    console.warn('Error al leer clientes de localStorage:', error);
    return null;
  }
}

/**
 * Actualizar un cliente específico en localStorage
 */
export function updateClienteInLocal(clienteId, updates) {
  try {
    if (typeof window === 'undefined') return false;
    const clientes = getClientesFromLocal();
    if (!clientes) return false;
    
    const index = clientes.findIndex(c => c.id === clienteId || c._id === clienteId);
    if (index !== -1) {
      clientes[index] = { ...clientes[index], ...updates };
      saveClientesToLocal(clientes);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Error al actualizar cliente en localStorage:', error);
    return false;
  }
}

/**
 * Agregar un cliente en localStorage
 */
export function addClienteToLocal(cliente) {
  try {
    if (typeof window === 'undefined') return false;
    const clientes = getClientesFromLocal() || [];
    clientes.push(cliente);
    saveClientesToLocal(clientes);
    return true;
  } catch (error) {
    console.warn('Error al agregar cliente en localStorage:', error);
    return false;
  }
}

/**
 * Eliminar un cliente de localStorage
 */
export function removeClienteFromLocal(clienteId) {
  try {
    if (typeof window === 'undefined') return false;
    const clientes = getClientesFromLocal();
    if (!clientes) return false;
    
    const filtered = clientes.filter(c => c.id !== clienteId && c._id !== clienteId);
    saveClientesToLocal(filtered);
    return true;
  } catch (error) {
    console.warn('Error al eliminar cliente de localStorage:', error);
    return false;
  }
}

/**
 * Agregar cambio pendiente a la cola de sincronización
 */
export function addPendingClienteUpdate(operation, clienteId, data) {
  try {
    if (typeof window === 'undefined') return;
    const pending = getPendingClienteUpdates();
    pending.push({
      operation, // 'update', 'create', 'delete'
      clienteId,
      data,
      timestamp: Date.now()
    });
    localStorage.setItem(STORAGE_KEYS.CLIENTES_PENDING, JSON.stringify(pending));
  } catch (error) {
    console.warn('Error al agregar cambio pendiente:', error);
  }
}

/**
 * Obtener cambios pendientes de clientes
 */
export function getPendingClienteUpdates() {
  try {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTES_PENDING);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.warn('Error al leer cambios pendientes:', error);
    return [];
  }
}

/**
 * Limpiar cambios pendientes de clientes
 */
export function clearPendingClienteUpdates(clienteId = null) {
  try {
    if (typeof window === 'undefined') return;
    if (clienteId) {
      const pending = getPendingClienteUpdates();
      const filtered = pending.filter(p => p.clienteId !== clienteId);
      localStorage.setItem(STORAGE_KEYS.CLIENTES_PENDING, JSON.stringify(filtered));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLIENTES_PENDING);
    }
  } catch (error) {
    console.warn('Error al limpiar cambios pendientes:', error);
  }
}

// ==================== ESTADOS DE PAGO ====================

/**
 * Guardar estado de pago en localStorage
 */
export function saveEstadoPagoToLocal(mesKey, clienteId, estado) {
  try {
    if (typeof window === 'undefined') return;
    const estados = getEstadosPagoFromLocal();
    const key = `${mesKey}-${clienteId}`;
    estados[key] = {
      ...estado,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.ESTADOS_PAGO, JSON.stringify(estados));
  } catch (error) {
    console.warn('Error al guardar estado de pago en localStorage:', error);
  }
}

/**
 * Obtener estado de pago desde localStorage
 * IMPORTANTE: El caché NO expira para proteger los datos del usuario.
 */
export function getEstadoPagoFromLocal(mesKey, clienteId) {
  try {
    if (typeof window === 'undefined') return null;
    const estados = getEstadosPagoFromLocal();
    const key = `${mesKey}-${clienteId}`;
    const estado = estados[key];
    if (!estado) return null;
    // Cache NO expira - los datos son valiosos y deben preservarse
    return estado;
  } catch (error) {
    console.warn('Error al leer estado de pago de localStorage:', error);
    return null;
  }
}

/**
 * Obtener todos los estados de pago desde localStorage
 */
function getEstadosPagoFromLocal() {
  try {
    if (typeof window === 'undefined') return {};
    const data = localStorage.getItem(STORAGE_KEYS.ESTADOS_PAGO);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.warn('Error al leer estados de pago de localStorage:', error);
    return {};
  }
}

/**
 * Agregar cambio pendiente de estado de pago
 */
export function addPendingEstadoPagoUpdate(mesKey, clienteId, pagado, serviciosPagados = null) {
  try {
    if (typeof window === 'undefined') return;
    const pending = getPendingEstadoPagoUpdates();
    const key = `${mesKey}-${clienteId}`;
    pending[key] = {
      mesKey,
      clienteId,
      pagado,
      serviciosPagados: serviciosPagados || {},
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.ESTADOS_PAGO_PENDING, JSON.stringify(pending));
  } catch (error) {
    console.warn('Error al agregar cambio pendiente de estado de pago:', error);
  }
}

/**
 * Obtener cambios pendientes de estados de pago
 */
export function getPendingEstadoPagoUpdates() {
  try {
    if (typeof window === 'undefined') return {};
    const data = localStorage.getItem(STORAGE_KEYS.ESTADOS_PAGO_PENDING);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.warn('Error al leer cambios pendientes de estados de pago:', error);
    return {};
  }
}

/**
 * Limpiar cambio pendiente de estado de pago
 */
export function clearPendingEstadoPagoUpdate(mesKey, clienteId) {
  try {
    if (typeof window === 'undefined') return;
    const pending = getPendingEstadoPagoUpdates();
    const key = `${mesKey}-${clienteId}`;
    delete pending[key];
    localStorage.setItem(STORAGE_KEYS.ESTADOS_PAGO_PENDING, JSON.stringify(pending));
  } catch (error) {
    console.warn('Error al limpiar cambio pendiente:', error);
  }
}

// ==================== UTILIDADES ====================

/**
 * Limpiar todo el caché local
 */
export function clearAllLocalCache() {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.CLIENTES);
    localStorage.removeItem(STORAGE_KEYS.ESTADOS_PAGO);
    // NO limpiar pendientes, se procesan después
  } catch (error) {
    console.warn('Error al limpiar caché local:', error);
  }
}

/**
 * Limpiar solo los datos, manteniendo pendientes
 */
export function clearLocalData() {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.CLIENTES);
    localStorage.removeItem(STORAGE_KEYS.ESTADOS_PAGO);
  } catch (error) {
    console.warn('Error al limpiar datos locales:', error);
  }
}

