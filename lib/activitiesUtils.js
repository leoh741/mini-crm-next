// Utilidades para manejar actividades
import { getUsuarioActual } from './authUtils';

function getAuthHeaders() {
  const user = getUsuarioActual();
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (user && user.usuarioId) {
    // Send user ID in header for server-side authentication
    // Convert to string if it's not already
    headers['X-User-Id'] = String(user.usuarioId);
  } else {
    console.warn('[Activities Utils] Usuario no autenticado o usuarioId faltante');
  }
  
  return headers;
}

// Función para actualizar lastSeen del usuario (heartbeat)
async function updateUserHeartbeat() {
  try {
    const headers = getAuthHeaders();
    await fetch('/api/users/heartbeat', {
      method: 'POST',
      headers: headers,
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    // Silenciar errores de heartbeat para no interrumpir el flujo principal
    console.debug('[Activities Utils] Error en heartbeat (ignorado):', error);
  }
}

export async function getActivityLists() {
  try {
    // Actualizar heartbeat del usuario
    updateUserHeartbeat();
    
    const response = await fetch('/api/activity-lists', {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Activities Utils] Error al obtener listas:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error || errorData
      });
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[Activities Utils] Listas recibidas:', data.success ? data.data.length : 0, 'listas');
    
    if (data.success) {
      return data.data.map(list => ({
        id: list._id?.toString() || list._id,
        _id: list._id?.toString() || list._id,
        name: list.name,
        description: list.description,
        color: list.color,
        owner: list.owner,
        members: list.members || [],
        isArchived: list.isArchived,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al obtener listas de actividades:', error);
    throw error;
  }
}

export async function createActivityList(listData) {
  try {
    const response = await fetch('/api/activity-lists', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(listData),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        id: data.data._id?.toString() || data.data._id,
        _id: data.data._id?.toString() || data.data._id,
        ...data.data
      };
    }
    throw new Error('Error al crear lista');
  } catch (error) {
    console.error('Error al crear lista de actividades:', error);
    throw error;
  }
}

export async function updateActivityList(listId, updates) {
  try {
    const response = await fetch('/api/activity-lists', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: listId, ...updates }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        id: data.data._id?.toString() || data.data._id,
        _id: data.data._id?.toString() || data.data._id,
        ...data.data
      };
    }
    throw new Error('Error al actualizar lista');
  } catch (error) {
    console.error('Error al actualizar lista de actividades:', error);
    throw error;
  }
}

export async function deleteActivityList(listId) {
  try {
    const response = await fetch('/api/activity-lists', {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: listId }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return true;
    }
    throw new Error('Error al eliminar lista');
  } catch (error) {
    console.error('Error al eliminar lista de actividades:', error);
    throw error;
  }
}

export async function getActivities(listId = null, filters = {}) {
  try {
    const params = new URLSearchParams();
    if (listId) params.append('listId', listId);
    if (filters.status) params.append('status', filters.status);
    if (filters.assigneeId) params.append('assigneeId', filters.assigneeId);
    
    const url = `/api/activities${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(activity => ({
        id: activity._id?.toString() || activity._id,
        _id: activity._id?.toString() || activity._id,
        list: activity.list,
        title: activity.title,
        description: activity.description,
        status: activity.status || 'pendiente',
        priority: activity.priority || 'media',
        assignee: activity.assignee,
        labels: activity.labels || [],
        dueDate: activity.dueDate,
        order: activity.order || 0,
        createdBy: activity.createdBy,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al obtener actividades:', error);
    throw error;
  }
}

export async function createActivity(activityData) {
  try {
    const headers = getAuthHeaders();
    console.log('[Activities Utils] Headers de autenticación:', headers['X-User-Id'] ? 'Presente' : 'Faltante');
    console.log('[Activities Utils] Datos de actividad a crear:', activityData);
    
    const response = await fetch('/api/activities', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(activityData),
      signal: AbortSignal.timeout(10000)
    });
    
    console.log('[Activities Utils] Respuesta del servidor:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Activities Utils] Error del servidor:', errorData);
      throw new Error(errorData.error || `Error HTTP: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[Activities Utils] Respuesta exitosa:', data.success);
    
    if (data.success) {
      return {
        id: data.data._id?.toString() || data.data._id,
        _id: data.data._id?.toString() || data.data._id,
        ...data.data
      };
    }
    throw new Error(data.error || 'Error al crear actividad');
  } catch (error) {
    console.error('[Activities Utils] Error completo al crear actividad:', error);
    throw error;
  }
}

export async function updateActivity(activityId, updates) {
  try {
    const response = await fetch('/api/activities', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: activityId, ...updates }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        id: data.data._id?.toString() || data.data._id,
        _id: data.data._id?.toString() || data.data._id,
        ...data.data
      };
    }
    throw new Error('Error al actualizar actividad');
  } catch (error) {
    console.error('Error al actualizar actividad:', error);
    throw error;
  }
}

export async function deleteActivity(activityId) {
  try {
    const response = await fetch('/api/activities', {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: activityId }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return true;
    }
    throw new Error('Error al eliminar actividad');
  } catch (error) {
    console.error('Error al eliminar actividad:', error);
    throw error;
  }
}
