// Utilidades para manejar tareas

export async function getTareas(estado = null, prioridad = null, completada = null, pendientes = false, useCache = true) {
  try {
    const params = new URLSearchParams();
    if (estado) params.append('estado', estado);
    if (prioridad) params.append('prioridad', prioridad);
    if (completada !== null) params.append('completada', completada);
    if (pendientes) params.append('pendientes', 'true');
    
    const url = `/api/tareas${params.toString() ? `?${params.toString()}` : ''}`;
    
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
      return data.data.map(tarea => ({
        id: tarea.tareaId || tarea._id?.toString() || tarea._id,
        _id: tarea._id?.toString() || tarea._id,
        tareaId: tarea.tareaId,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        fechaVencimiento: tarea.fechaVencimiento,
        prioridad: tarea.prioridad || 'media',
        estado: tarea.estado || 'pendiente',
        cliente: tarea.cliente,
        etiquetas: tarea.etiquetas || [],
        asignados: tarea.asignados || [],
        completada: tarea.completada || false,
        fechaCompletada: tarea.fechaCompletada,
        createdAt: tarea.createdAt,
        updatedAt: tarea.updatedAt
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al obtener tareas:', error);
    return [];
  }
}

export async function getTareaById(id, useCache = true) {
  if (!id) {
    console.error('getTareaById: ID no proporcionado');
    return null;
  }
  
  try {
    const response = await fetch(`/api/tareas/${id}`, {
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
      const tarea = data.data;
      return {
        id: tarea.tareaId || tarea._id?.toString() || tarea._id,
        _id: tarea._id?.toString() || tarea._id,
        tareaId: tarea.tareaId,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        fechaVencimiento: tarea.fechaVencimiento,
        prioridad: tarea.prioridad || 'media',
        estado: tarea.estado || 'pendiente',
        cliente: tarea.cliente,
        etiquetas: tarea.etiquetas || [],
        asignados: tarea.asignados || [],
        completada: tarea.completada || false,
        fechaCompletada: tarea.fechaCompletada,
        createdAt: tarea.createdAt,
        updatedAt: tarea.updatedAt
      };
    }
    return null;
  } catch (error) {
    console.error('Error al obtener tarea:', error);
    return null;
  }
}

export async function crearTarea(tareaData) {
  try {
    // Log para debugging
    console.log('[Frontend] Enviando datos de tarea:', JSON.stringify(tareaData, null, 2));
    
    const bodyStr = JSON.stringify(tareaData);
    console.log('[Frontend] JSON stringificado:', bodyStr);
    
    const response = await fetch('/api/tareas', {
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
    console.error('Error al crear tarea:', error);
    throw error;
  }
}

export async function actualizarTarea(id, tareaData) {
  try {
    const response = await fetch(`/api/tareas/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tareaData),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    throw error;
  }
}

export async function eliminarTarea(id) {
  try {
    const response = await fetch(`/api/tareas/${id}`, {
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
    console.error('Error al eliminar tarea:', error);
    throw error;
  }
}

