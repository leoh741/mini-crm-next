// Utilidades para gestionar usuarios usando la API de MongoDB

export async function getUsuarios() {
  try {
    const response = await fetch('/api/usuarios');
    const data = await response.json();
    
    if (data.success) {
      return data.data.map(usuario => ({
        id: usuario.crmId || usuario._id.toString(),
        _id: usuario._id.toString(),
        nombre: usuario.nombre,
        email: usuario.email,
        password: usuario.password,
        rol: usuario.rol,
        fechaCreacion: usuario.fechaCreacion
      }));
    }
    return [];
  } catch (error) {
    console.error('Error al leer usuarios:', error);
    return [];
  }
}

export async function getUsuarioById(id) {
  try {
    // Intentar buscar por _id de MongoDB
    const response = await fetch(`/api/usuarios/${id}`);
    const data = await response.json();
    
    if (data.success && data.data) {
      const usuario = data.data;
      return {
        id: usuario.crmId || usuario._id.toString(),
        _id: usuario._id.toString(),
        nombre: usuario.nombre,
        email: usuario.email,
        password: usuario.password,
        rol: usuario.rol,
        fechaCreacion: usuario.fechaCreacion
      };
    }
    
    // Si no se encuentra, buscar por crmId en todos los usuarios
    const todosUsuarios = await getUsuarios();
    return todosUsuarios.find(u => u.id === id || u.crmId === id);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return null;
  }
}

export async function getUsuarioByEmail(email) {
  try {
    // Optimización: buscar directamente por email en la API
    const response = await fetch(`/api/usuarios?email=${encodeURIComponent(email)}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Usuario no encontrado
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      const usuario = data.data;
      return {
        id: usuario.crmId || usuario._id.toString(),
        _id: usuario._id.toString(),
        nombre: usuario.nombre,
        email: usuario.email,
        password: usuario.password,
        rol: usuario.rol,
        fechaCreacion: usuario.fechaCreacion
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error al buscar usuario por email:', error);
    return null;
  }
}

export async function crearUsuario(usuario) {
  try {
    const usuarioData = {
      crmId: usuario.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nombre: usuario.nombre,
      email: usuario.email,
      password: usuario.password,
      rol: usuario.rol || 'usuario',
      fechaCreacion: new Date()
    };
    
    const response = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usuarioData)
    });
    
    const data = await response.json();
    if (data.success) {
      return {
        id: data.data.crmId || data.data._id.toString(),
        _id: data.data._id.toString(),
        nombre: data.data.nombre,
        email: data.data.email,
        password: data.data.password,
        rol: data.data.rol,
        fechaCreacion: data.data.fechaCreacion
      };
    }
    throw new Error(data.error || 'Error al crear usuario');
  } catch (error) {
    console.error('Error al crear usuario:', error);
    throw error;
  }
}

export async function actualizarUsuario(id, datosActualizados) {
  try {
    // Primero obtener el usuario para saber su _id de MongoDB
    const usuario = await getUsuarioById(id);
    if (!usuario || !usuario._id) {
      throw new Error('Usuario no encontrado');
    }
    
    const response = await fetch(`/api/usuarios/${usuario._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosActualizados)
    });
    
    const data = await response.json();
    if (data.success) {
      return {
        id: data.data.crmId || data.data._id.toString(),
        _id: data.data._id.toString(),
        nombre: data.data.nombre,
        email: data.data.email,
        password: data.data.password,
        rol: data.data.rol,
        fechaCreacion: data.data.fechaCreacion
      };
    }
    throw new Error(data.error || 'Error al actualizar usuario');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    throw error;
  }
}

export async function eliminarUsuario(id) {
  try {
    // Primero obtener el usuario para saber su _id de MongoDB
    const usuario = await getUsuarioById(id);
    if (!usuario || !usuario._id) {
      throw new Error('Usuario no encontrado');
    }
    
    // Verificar que no sea el último admin
    const usuarios = await getUsuarios();
    const usuariosAdmin = usuarios.filter(u => u.rol === 'admin');
    if (usuario.rol === 'admin' && usuariosAdmin.length === 1) {
      throw new Error('No se puede eliminar el último administrador');
    }
    
    const response = await fetch(`/api/usuarios/${usuario._id}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Error al eliminar usuario');
    }
    return true;
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    throw error;
  }
}

export async function cambiarPassword(id, nuevaPassword) {
  try {
    return await actualizarUsuario(id, { password: nuevaPassword });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    throw error;
  }
}
