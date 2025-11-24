// Utilidades para gestionar presupuestos usando la API de MongoDB

// Obtener todos los presupuestos
export async function getPresupuestos(forceRefresh = false) {
  try {
    const response = await fetch('/api/presupuestos', {
      cache: forceRefresh ? 'no-store' : 'force-cache',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(presupuesto => ({
        id: presupuesto.presupuestoId || presupuesto._id?.toString() || presupuesto._id,
        _id: presupuesto._id?.toString() || presupuesto._id,
        presupuestoId: presupuesto.presupuestoId,
        numero: presupuesto.numero,
        cliente: presupuesto.cliente,
        fecha: presupuesto.fecha,
        validez: presupuesto.validez,
        items: presupuesto.items || [],
        subtotal: presupuesto.subtotal || 0,
        descuento: presupuesto.descuento || 0,
        porcentajeDescuento: presupuesto.porcentajeDescuento || 0,
        total: presupuesto.total || 0,
        estado: presupuesto.estado || 'borrador',
        observaciones: presupuesto.observaciones,
        notasInternas: presupuesto.notasInternas,
        createdAt: presupuesto.createdAt,
        updatedAt: presupuesto.updatedAt
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al leer presupuestos:', error);
    return [];
  }
}

// Obtener presupuesto por ID
export async function getPresupuestoById(id, useCache = true) {
  if (!id) {
    console.error('getPresupuestoById: ID no proporcionado');
    return null;
  }

  try {
    const response = await fetch(`/api/presupuestos/${encodeURIComponent(id)}`, {
      cache: useCache ? 'force-cache' : 'no-store',
      next: useCache ? { revalidate: 60 } : undefined,
      signal: AbortSignal.timeout(10000)
    });
    
    const data = await response.json();
    
    if (response.ok && data.success && data.data) {
      const presupuesto = data.data;
      return {
        id: presupuesto.presupuestoId || presupuesto._id?.toString() || presupuesto._id,
        _id: presupuesto._id?.toString() || presupuesto._id,
        presupuestoId: presupuesto.presupuestoId,
        numero: presupuesto.numero,
        cliente: presupuesto.cliente,
        fecha: presupuesto.fecha,
        validez: presupuesto.validez,
        items: presupuesto.items || [],
        subtotal: presupuesto.subtotal || 0,
        descuento: presupuesto.descuento || 0,
        porcentajeDescuento: presupuesto.porcentajeDescuento || 0,
        total: presupuesto.total || 0,
        estado: presupuesto.estado || 'borrador',
        observaciones: presupuesto.observaciones,
        notasInternas: presupuesto.notasInternas,
        createdAt: presupuesto.createdAt,
        updatedAt: presupuesto.updatedAt
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error al obtener presupuesto:', error);
    return null;
  }
}

// Crear nuevo presupuesto
export async function crearPresupuesto(presupuesto) {
  try {
    const response = await fetch('/api/presupuestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presupuesto),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.error || 'Error al crear presupuesto');
    }
  } catch (error) {
    console.error('Error al crear presupuesto:', error);
    throw error;
  }
}

// Actualizar presupuesto
export async function actualizarPresupuesto(id, datosActualizados) {
  try {
    const response = await fetch(`/api/presupuestos/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.error || 'Error al actualizar presupuesto');
    }
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    throw error;
  }
}

// Eliminar presupuesto
export async function eliminarPresupuesto(id) {
  try {
    const response = await fetch(`/api/presupuestos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return true;
    } else {
      throw new Error(data.error || 'Error al eliminar presupuesto');
    }
  } catch (error) {
    console.error('Error al eliminar presupuesto:', error);
    throw error;
  }
}

// Calcular totales de items
export function calcularTotales(items) {
  const itemsCalculados = items.map(item => ({
    ...item,
    subtotal: (item.cantidad || 1) * (item.precioUnitario || 0)
  }));
  
  const subtotal = itemsCalculados.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  
  return {
    items: itemsCalculados,
    subtotal
  };
}

// Calcular total con descuento
export function calcularTotalConDescuento(subtotal, porcentajeDescuento) {
  const descuento = porcentajeDescuento > 0 ? (subtotal * porcentajeDescuento) / 100 : 0;
  const total = subtotal - descuento;
  
  return {
    descuento,
    total
  };
}

