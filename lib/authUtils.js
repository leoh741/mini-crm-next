// Utilidades para autenticación

import { getUsuarioByEmail } from './usuariosUtils';

const SESSION_KEY = 'crm_session';

export async function login(email, password) {
  if (typeof window === 'undefined') return null;
  
  try {
    // Limpiar espacios en blanco del email
    const emailLimpio = email.trim().toLowerCase();
    
    const usuario = await getUsuarioByEmail(emailLimpio);
    
    if (!usuario) {
      console.error('Login: Usuario no encontrado para email:', emailLimpio);
      throw new Error('Usuario o contraseña incorrectos');
    }
    
    // Comparar contraseñas (sin espacios)
    const passwordLimpio = password.trim();
    if (usuario.password !== passwordLimpio) {
      console.error('Login: Contraseña incorrecta para usuario:', emailLimpio);
      throw new Error('Usuario o contraseña incorrectos');
    }
    
    // Crear sesión (en producción debería ser un token JWT)
    const sesion = {
      usuarioId: usuario.id || usuario._id || usuario.crmId,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol || 'usuario',
      fechaLogin: new Date().toISOString()
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    return sesion;
  } catch (error) {
    console.error('Error en login:', error);
    
    // Si el error ya tiene un mensaje descriptivo, usarlo
    if (error.message.includes('MONGODB_URI') || error.message.includes('Error del servidor')) {
      throw error;
    }
    
    // Si es un error de red o conexión, dar un mensaje más específico
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
      throw new Error('Error de conexión con el servidor. Verifica tu conexión a internet y que la base de datos esté configurada correctamente.');
    }
    
    throw error;
  }
}

export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function getSesionActual() {
  if (typeof window === 'undefined') return null;
  
  const sesion = localStorage.getItem(SESSION_KEY);
  if (!sesion) return null;
  
  try {
    return JSON.parse(sesion);
  } catch {
    return null;
  }
}

export function estaAutenticado() {
  return getSesionActual() !== null;
}

export function esAdmin() {
  const sesion = getSesionActual();
  return sesion && sesion.rol === 'admin';
}

export function getUsuarioActual() {
  return getSesionActual();
}
