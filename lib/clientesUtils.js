import { clientes as clientesIniciales } from './clientes';

const STORAGE_KEY = 'crm_clientes';
const PAGOS_MENSUALES_KEY = 'crm_pagos_mensuales';

// Obtener clave para un mes específico
function getMesKey(mes, año) {
  return `${año}-${String(mes + 1).padStart(2, '0')}`;
}

// Obtener estado de pago de un cliente para un mes específico
export function getEstadoPagoMes(clienteId, mes, año) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const pagosMensuales = JSON.parse(localStorage.getItem(PAGOS_MENSUALES_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    const pagosDelMes = pagosMensuales[mesKey] || {};
    return pagosDelMes[clienteId] || null;
  } catch (error) {
    console.error('Error al leer estado de pago mensual:', error);
    return null;
  }
}

// Guardar estado de pago de un cliente para un mes específico
export function guardarEstadoPagoMes(clienteId, mes, año, pagado) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const pagosMensuales = JSON.parse(localStorage.getItem(PAGOS_MENSUALES_KEY) || '{}');
    const mesKey = getMesKey(mes, año);
    
    if (!pagosMensuales[mesKey]) {
      pagosMensuales[mesKey] = {};
    }
    
    pagosMensuales[mesKey][clienteId] = {
      pagado,
      fechaActualizacion: new Date().toISOString()
    };
    
    localStorage.setItem(PAGOS_MENSUALES_KEY, JSON.stringify(pagosMensuales));
    return true;
  } catch (error) {
    console.error('Error al guardar estado de pago mensual:', error);
    return false;
  }
}

// Obtener todos los meses con registros
export function getMesesConRegistros() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const pagosMensuales = JSON.parse(localStorage.getItem(PAGOS_MENSUALES_KEY) || '{}');
    return Object.keys(pagosMensuales).sort().reverse(); // Más recientes primero
  } catch (error) {
    console.error('Error al leer meses con registros:', error);
    return [];
  }
}

// Obtener todos los clientes (combinando iniciales con los guardados)
export function getClientes() {
  if (typeof window === 'undefined') {
    return clientesIniciales;
  }

  try {
    const clientesGuardados = localStorage.getItem(STORAGE_KEY);
    const eliminadosKey = 'crm_clientes_eliminados';
    const eliminados = JSON.parse(localStorage.getItem(eliminadosKey) || '[]');
    
    // Filtrar clientes iniciales eliminados
    const clientesInicialesFiltrados = clientesIniciales.filter(c => !eliminados.includes(c.id));
    
    if (clientesGuardados) {
      const parsed = JSON.parse(clientesGuardados);
      // Combinar clientes iniciales (no eliminados) con los guardados, evitando duplicados por ID
      const todosClientes = [...clientesInicialesFiltrados];
      parsed.forEach(cliente => {
        if (!todosClientes.find(c => c.id === cliente.id)) {
          todosClientes.push(cliente);
        }
      });
      return todosClientes;
    }
    
    return clientesInicialesFiltrados;
  } catch (error) {
    console.error('Error al leer clientes de localStorage:', error);
  }

  return clientesIniciales;
}

// Guardar un nuevo cliente
export function agregarCliente(cliente) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const clientesGuardados = localStorage.getItem(STORAGE_KEY);
    let nuevosClientes = [];
    
    if (clientesGuardados) {
      nuevosClientes = JSON.parse(clientesGuardados);
    }

    // Generar ID único
    const maxId = Math.max(
      ...clientesIniciales.map(c => parseInt(c.id)),
      ...nuevosClientes.map(c => parseInt(c.id)),
      0
    );
    
    const nuevoCliente = {
      ...cliente,
      id: (maxId + 1).toString(),
      pagado: cliente.pagado || false
    };

    nuevosClientes.push(nuevoCliente);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevosClientes));
    return true;
  } catch (error) {
    console.error('Error al guardar cliente:', error);
    return false;
  }
}

// Obtener cliente por ID
export function getClienteById(id) {
  const todosClientes = getClientes();
  return todosClientes.find((c) => c.id === id);
}

// Actualizar un cliente completo
export function actualizarCliente(id, datosActualizados) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const clientesGuardados = localStorage.getItem(STORAGE_KEY);
    let clientes = [];
    
    if (clientesGuardados) {
      clientes = JSON.parse(clientesGuardados);
    }

    // Buscar si el cliente está en localStorage
    const index = clientes.findIndex(c => c.id === id);
    
    if (index !== -1) {
      // Actualizar cliente en localStorage
      clientes[index] = { ...clientes[index], ...datosActualizados };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
      return true;
    }
    
    // Si no está en localStorage, es un cliente inicial, copiarlo y actualizarlo
    const clienteInicial = clientesIniciales.find(c => c.id === id);
    if (clienteInicial) {
      const clienteActualizado = { ...clienteInicial, ...datosActualizados };
      clientes.push(clienteActualizado);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    return false;
  }
}

// Eliminar un cliente
export function eliminarCliente(id) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const clientesGuardados = localStorage.getItem(STORAGE_KEY);
    let clientes = [];
    
    if (clientesGuardados) {
      clientes = JSON.parse(clientesGuardados);
    }

    // Buscar si el cliente está en localStorage
    const index = clientes.findIndex(c => c.id === id);
    
    if (index !== -1) {
      // Eliminar cliente de localStorage
      clientes.splice(index, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
      return true;
    }
    
    // Si no está en localStorage, es un cliente inicial
    // Guardarlo en una lista de eliminados para no mostrarlo
    const clienteInicial = clientesIniciales.find(c => c.id === id);
    if (clienteInicial) {
      const eliminadosKey = 'crm_clientes_eliminados';
      const eliminados = JSON.parse(localStorage.getItem(eliminadosKey) || '[]');
      if (!eliminados.includes(id)) {
        eliminados.push(id);
        localStorage.setItem(eliminadosKey, JSON.stringify(eliminados));
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    return false;
  }
}

// Actualizar estado de pago de un cliente
export function actualizarEstadoPago(id, pagado) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const clientesGuardados = localStorage.getItem(STORAGE_KEY);
    if (clientesGuardados) {
      const clientes = JSON.parse(clientesGuardados);
      const index = clientes.findIndex(c => c.id === id);
      
      if (index !== -1) {
        clientes[index].pagado = pagado;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
        return true;
      }
    }
    
    // Si no está en localStorage, es un cliente inicial, agregarlo
    const clienteInicial = clientesIniciales.find(c => c.id === id);
    if (clienteInicial) {
      const clientesGuardados = localStorage.getItem(STORAGE_KEY) || '[]';
      const clientes = JSON.parse(clientesGuardados);
      clientes.push({ ...clienteInicial, pagado });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error al actualizar estado de pago:', error);
    return false;
  }
}

