// Helper para obtener el total de un cliente
// Compatible con clientes que tienen montoPago (antiguos) o servicios (nuevos)
export function getTotalCliente(cliente) {
  if (cliente.servicios && Array.isArray(cliente.servicios)) {
    return cliente.servicios.reduce((sum, servicio) => sum + (servicio.precio || 0), 0);
  }
  // Compatibilidad con clientes antiguos que tienen montoPago
  return cliente.montoPago || 0;
}

// Helper para obtener el total pagado de un cliente (solo servicios pagados)
export function getTotalPagadoCliente(cliente, serviciosPagados = {}) {
  if (!cliente.servicios || !Array.isArray(cliente.servicios)) {
    // Compatibilidad: si no tiene servicios, usar el estado pagado general
    return cliente.pagado ? getTotalCliente(cliente) : 0;
  }
  
  return cliente.servicios.reduce((sum, servicio, index) => {
    // Si el servicio está marcado como pagado (true), sumar su precio
    if (serviciosPagados[index] === true) {
      return sum + (servicio.precio || 0);
    }
    return sum;
  }, 0);
}

// Helper para obtener el total pendiente de un cliente (solo servicios no pagados)
export function getTotalPendienteCliente(cliente, serviciosPagados = {}) {
  if (!cliente.servicios || !Array.isArray(cliente.servicios)) {
    // Compatibilidad: si no tiene servicios, usar el estado pagado general
    return cliente.pagado ? 0 : getTotalCliente(cliente);
  }
  
  return cliente.servicios.reduce((sum, servicio, index) => {
    // Si el servicio NO está marcado como pagado (false o undefined), sumar su precio
    if (serviciosPagados[index] !== true) {
      return sum + (servicio.precio || 0);
    }
    return sum;
  }, 0);
}

// Helper para verificar si todos los servicios están pagados
export function todosLosServiciosPagados(cliente, serviciosPagados = {}) {
  if (!cliente.servicios || !Array.isArray(cliente.servicios) || cliente.servicios.length === 0) {
    // Compatibilidad: si no tiene servicios, usar el estado pagado general
    return cliente.pagado === true;
  }
  
  return cliente.servicios.every((_, index) => serviciosPagados[index] === true);
}

// Helper para verificar si algún servicio está pagado
export function algunServicioPagado(cliente, serviciosPagados = {}) {
  if (!cliente.servicios || !Array.isArray(cliente.servicios) || cliente.servicios.length === 0) {
    // Compatibilidad: si no tiene servicios, usar el estado pagado general
    return cliente.pagado === true;
  }
  
  return cliente.servicios.some((_, index) => serviciosPagados[index] === true);
}

