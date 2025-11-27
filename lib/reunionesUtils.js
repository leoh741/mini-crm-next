// Utilidades para manejar reuniones

export async function getReuniones(fecha = null, completada = null, proximas = false, useCache = true) {
  try {
    const params = new URLSearchParams();
    if (fecha) params.append('fecha', fecha);
    if (completada !== null) params.append('completada', completada);
    if (proximas) params.append('proximas', 'true');
    
    const url = `/api/reuniones${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: useCache ? 'default' : 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(reunion => ({
        id: reunion.reunionId || reunion._id?.toString() || reunion._id,
        _id: reunion._id?.toString() || reunion._id,
        reunionId: reunion.reunionId,
        titulo: reunion.titulo,
        fecha: reunion.fecha,
        hora: reunion.hora,
        tipo: reunion.tipo,
        cliente: reunion.cliente,
        linkMeet: reunion.linkMeet,
        observaciones: reunion.observaciones,
        asignados: reunion.asignados || [],
        completada: reunion.completada || false,
        createdAt: reunion.createdAt,
        updatedAt: reunion.updatedAt
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al obtener reuniones:', error);
    return [];
  }
}

export async function getReunionById(id, useCache = true) {
  if (!id) {
    console.error('getReunionById: ID no proporcionado');
    return null;
  }
  
  try {
    const response = await fetch(`/api/reuniones/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: useCache ? 'default' : 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.success && data.data) {
      const reunion = data.data;
      return {
        id: reunion.reunionId || reunion._id?.toString() || reunion._id,
        _id: reunion._id?.toString() || reunion._id,
        reunionId: reunion.reunionId,
        titulo: reunion.titulo,
        fecha: reunion.fecha,
        hora: reunion.hora,
        tipo: reunion.tipo,
        cliente: reunion.cliente,
        linkMeet: reunion.linkMeet,
        observaciones: reunion.observaciones,
        asignados: reunion.asignados || [],
        completada: reunion.completada || false,
        createdAt: reunion.createdAt,
        updatedAt: reunion.updatedAt
      };
    }
    return null;
  } catch (error) {
    console.error('Error al obtener reunión:', error);
    return null;
  }
}

export async function crearReunion(reunionData) {
  try {
    // Log para debugging
    console.log('[Frontend] Enviando datos de reunión:', JSON.stringify(reunionData, null, 2));
    
    const bodyStr = JSON.stringify(reunionData);
    console.log('[Frontend] JSON stringificado:', bodyStr);
    
    const response = await fetch('/api/reuniones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: bodyStr,
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al crear reunión:', error);
    throw error;
  }
}

export async function actualizarReunion(id, reunionData) {
  try {
    const response = await fetch(`/api/reuniones/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reunionData),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al actualizar reunión:', error);
    throw error;
  }
}

export async function eliminarReunion(id) {
  try {
    const response = await fetch(`/api/reuniones/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar reunión:', error);
    throw error;
  }
}

