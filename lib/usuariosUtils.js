// Utilidades para gestionar usuarios del sistema

const USUARIOS_KEY = 'crm_usuarios';
const USUARIO_ADMIN_DEFAULT = {
  id: 'admin-default',
  nombre: 'Administrador',
  email: 'admin@digitalspace.com',
  password: 'admin123', // Se debe cambiar en producción
  rol: 'admin',
  fechaCreacion: new Date().toISOString()
};

// Inicializar con usuario admin por defecto si no existe ninguno
function inicializarUsuarios() {
  if (typeof window === 'undefined') return;
  
  const usuarios = localStorage.getItem(USUARIOS_KEY);
  if (!usuarios) {
    // Crear usuario admin por defecto
    const usuariosIniciales = [USUARIO_ADMIN_DEFAULT];
    localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuariosIniciales));
    return usuariosIniciales;
  }
  return JSON.parse(usuarios);
}

export function getUsuarios() {
  if (typeof window === 'undefined') return [];
  inicializarUsuarios();
  const usuarios = localStorage.getItem(USUARIOS_KEY);
  return usuarios ? JSON.parse(usuarios) : [];
}

export function getUsuarioById(id) {
  const usuarios = getUsuarios();
  return usuarios.find(u => u.id === id);
}

export function getUsuarioByEmail(email) {
  const usuarios = getUsuarios();
  return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function crearUsuario(usuario) {
  if (typeof window === 'undefined') return null;
  
  const usuarios = getUsuarios();
  
  // Verificar que el email no esté en uso
  if (getUsuarioByEmail(usuario.email)) {
    throw new Error('El email ya está en uso');
  }
  
  const nuevoUsuario = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    nombre: usuario.nombre,
    email: usuario.email,
    password: usuario.password, // En producción debería estar hasheado
    rol: usuario.rol || 'usuario',
    fechaCreacion: new Date().toISOString()
  };
  
  usuarios.push(nuevoUsuario);
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
  return nuevoUsuario;
}

export function actualizarUsuario(id, datosActualizados) {
  if (typeof window === 'undefined') return null;
  
  const usuarios = getUsuarios();
  const indice = usuarios.findIndex(u => u.id === id);
  
  if (indice === -1) {
    throw new Error('Usuario no encontrado');
  }
  
  // Si se actualiza el email, verificar que no esté en uso por otro usuario
  if (datosActualizados.email && datosActualizados.email !== usuarios[indice].email) {
    if (getUsuarioByEmail(datosActualizados.email)) {
      throw new Error('El email ya está en uso');
    }
  }
  
  usuarios[indice] = {
    ...usuarios[indice],
    ...datosActualizados,
    fechaActualizacion: new Date().toISOString()
  };
  
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
  return usuarios[indice];
}

export function eliminarUsuario(id) {
  if (typeof window === 'undefined') return false;
  
  const usuarios = getUsuarios();
  
  // No permitir eliminar el último usuario admin
  const usuariosAdmin = usuarios.filter(u => u.rol === 'admin');
  const usuarioAEliminar = usuarios.find(u => u.id === id);
  
  if (usuarioAEliminar && usuarioAEliminar.rol === 'admin' && usuariosAdmin.length === 1) {
    throw new Error('No se puede eliminar el último administrador');
  }
  
  const usuariosFiltrados = usuarios.filter(u => u.id !== id);
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuariosFiltrados));
  return true;
}

export function cambiarPassword(id, nuevaPassword) {
  if (typeof window === 'undefined') return false;
  
  const usuarios = getUsuarios();
  const indice = usuarios.findIndex(u => u.id === id);
  
  if (indice === -1) {
    throw new Error('Usuario no encontrado');
  }
  
  usuarios[indice].password = nuevaPassword; // En producción debería estar hasheado
  usuarios[indice].fechaActualizacion = new Date().toISOString();
  
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
  return true;
}

