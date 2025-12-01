// Utilidades para gestionar miembros del equipo

// Obtener todos los miembros del equipo
export async function getMiembrosEquipo(forceRefresh = false) {
  try {
    const response = await fetch('/api/equipo', {
      cache: forceRefresh ? 'no-store' : 'default',
      next: { revalidate: 60 }
    });
    
    if (!response.ok) {
      throw new Error('Error al obtener miembros del equipo');
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      return data.data.map(miembro => ({
        id: miembro._id,
        _id: miembro._id,
        crmId: miembro.crmId,
        nombre: miembro.nombre,
        cargo: miembro.cargo,
        email: miembro.email,
        telefono: miembro.telefono,
        calificacion: miembro.calificacion || 0,
        comentarios: miembro.comentarios || [],
        habilidades: miembro.habilidades || [],
        activo: miembro.activo !== undefined ? miembro.activo : true,
        createdAt: miembro.createdAt,
        updatedAt: miembro.updatedAt
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error al obtener miembros del equipo:', error);
    return [];
  }
}

// Obtener un miembro por ID
export async function getMiembroById(id, forceRefresh = false) {
  try {
    const response = await fetch(`/api/equipo/${id}`, {
      cache: forceRefresh ? 'no-store' : 'default',
      next: { revalidate: 60 }
    });
    
    if (!response.ok) {
      throw new Error('Error al obtener miembro del equipo');
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      const miembro = data.data;
      return {
        id: miembro._id,
        _id: miembro._id,
        crmId: miembro.crmId,
        nombre: miembro.nombre,
        cargo: miembro.cargo,
        email: miembro.email,
        telefono: miembro.telefono,
        calificacion: miembro.calificacion || 0,
        comentarios: miembro.comentarios || [],
        habilidades: miembro.habilidades || [],
        activo: miembro.activo !== undefined ? miembro.activo : true,
        createdAt: miembro.createdAt,
        updatedAt: miembro.updatedAt
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error al obtener miembro del equipo:', error);
    return null;
  }
}

// Crear nuevo miembro
export async function crearMiembro(datos) {
  try {
    const response = await fetch('/api/equipo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(datos)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error al crear miembro del equipo');
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al crear miembro del equipo:', error);
    throw error;
  }
}

// Actualizar miembro
export async function actualizarMiembro(id, datos, forceRefresh = false) {
  try {
    const response = await fetch(`/api/equipo/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(datos),
      cache: forceRefresh ? 'no-store' : 'default'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error al actualizar miembro del equipo');
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error al actualizar miembro del equipo:', error);
    throw error;
  }
}

// Eliminar miembro
export async function eliminarMiembro(id) {
  try {
    const response = await fetch(`/api/equipo/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error al eliminar miembro del equipo');
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error al eliminar miembro del equipo:', error);
    throw error;
  }
}

// Agregar comentario a un miembro
export async function agregarComentario(miembroId, comentario) {
  return actualizarMiembro(miembroId, {
    nuevoComentario: comentario
  }, true);
}

// Actualizar comentario
export async function actualizarComentario(miembroId, comentarioId, datos) {
  return actualizarMiembro(miembroId, {
    actualizarComentario: {
      comentarioId,
      ...datos
    }
  }, true);
}

// Eliminar comentario
export async function eliminarComentario(miembroId, comentarioId) {
  return actualizarMiembro(miembroId, {
    eliminarComentario: comentarioId
  }, true);
}

