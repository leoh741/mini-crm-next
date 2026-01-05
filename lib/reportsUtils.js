// Utilidades para manejar informes

// Obtener todos los informes con filtros opcionales
export async function getReports(filters = {}, useCache = true) {
  try {
    const params = new URLSearchParams();
    
    if (filters.clienteNombre) params.append('clienteNombre', filters.clienteNombre);
    if (filters.estado) params.append('estado', filters.estado);
    if (filters.plataforma) params.append('plataforma', filters.plataforma);
    if (filters.fechaDesde) params.append('fechaDesde', filters.fechaDesde);
    if (filters.fechaHasta) params.append('fechaHasta', filters.fechaHasta);
    
    const url = `/api/reports${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      cache: useCache ? 'default' : 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return data.data || [];
    }
    return [];
  } catch (error) {
    console.error('Error al obtener informes:', error);
    return [];
  }
}

// Obtener informe por ID
export async function getReportById(id, useCache = true) {
  if (!id) return null;
  
  try {
    const response = await fetch(`/api/reports/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      cache: useCache ? 'default' : 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al obtener informe:', error);
    return null;
  }
}

// Crear nuevo informe
export async function createReport(reportData) {
  try {
    const userId = getUserIdFromSession();
    
    if (!userId || userId.trim() === '') {
      throw new Error('No estás autenticado. Por favor, inicia sesión nuevamente.');
    }

    // Validar que los datos requeridos estén presentes
    if (!reportData || typeof reportData !== 'object') {
      throw new Error('Los datos del informe son requeridos');
    }

    if (!reportData.titulo || !reportData.titulo.trim()) {
      throw new Error('El título del informe es requerido');
    }

    if (!reportData.clienteNombre || !reportData.clienteNombre.trim()) {
      throw new Error('El nombre del cliente es requerido');
    }

    if (!reportData.periodo || !reportData.periodo.from || !reportData.periodo.to) {
      throw new Error('El período (fecha desde y hasta) es requerido');
    }

    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
      body: JSON.stringify(reportData),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `Error HTTP: ${response.status}`;
      console.error('Error del servidor al crear informe:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Error al crear el informe');
    }
    
    return data.data || null;
  } catch (error) {
    console.error('Error al crear informe:', error);
    throw error;
  }
}

// Actualizar informe
export async function updateReport(id, reportData) {
  try {
    const response = await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      body: JSON.stringify(reportData),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al actualizar informe:', error);
    throw error;
  }
}

// Eliminar informe
export async function deleteReport(id) {
  try {
    const response = await fetch(`/api/reports/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar informe:', error);
    throw error;
  }
}

// Duplicar informe
export async function duplicateReport(id) {
  try {
    const response = await fetch(`/api/reports/${id}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al duplicar informe:', error);
    throw error;
  }
}

// Compartir informe (enable/disable)
export async function shareReport(id, enabled = true) {
  try {
    const response = await fetch(`/api/reports/${id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserIdFromSession()
      },
      body: JSON.stringify({ enabled }),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al compartir informe:', error);
    throw error;
  }
}

// Obtener informe compartido por token (sin auth)
export async function getSharedReport(token) {
  if (!token) return null;
  
  try {
    const response = await fetch(`/api/reports/shared/${token}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al obtener informe compartido:', error);
    return null;
  }
}

// Helper para obtener userId de la sesión
function getUserIdFromSession() {
  if (typeof window === 'undefined') {
    console.warn('[reportsUtils] getUserIdFromSession: window is undefined (server-side)');
    return '';
  }
  
  try {
    const session = localStorage.getItem('crm_session');
    if (!session) {
      console.warn('[reportsUtils] getUserIdFromSession: No hay sesión en localStorage');
      return '';
    }
    
    const sessionData = JSON.parse(session);
    const userId = sessionData.usuarioId || sessionData.id || sessionData._id || '';
    
    if (!userId) {
      console.warn('[reportsUtils] getUserIdFromSession: No se encontró usuarioId en la sesión:', sessionData);
    }
    
    return userId;
  } catch (error) {
    console.error('[reportsUtils] Error al obtener userId de sesión:', error);
    return '';
  }
}

