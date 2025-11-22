// Helper para obtener el total de un cliente
// Compatible con clientes que tienen montoPago (antiguos) o servicios (nuevos)
export function getTotalCliente(cliente) {
  if (cliente.servicios && Array.isArray(cliente.servicios)) {
    return cliente.servicios.reduce((sum, servicio) => sum + (servicio.precio || 0), 0);
  }
  // Compatibilidad con clientes antiguos que tienen montoPago
  return cliente.montoPago || 0;
}

