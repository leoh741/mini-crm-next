// Utilidades para autenticación

import { getUsuarioByEmail } from './usuariosUtils';

const SESSION_KEY = 'crm_session';

export function login(email, password) {
  if (typeof window === 'undefined') return null;
  
  const usuario = getUsuarioByEmail(email);
  
  if (!usuario) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  
  if (usuario.password !== password) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  
  // Crear sesión (en producción debería ser un token JWT)
  const sesion = {
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    fechaLogin: new Date().toISOString()
  };
  
  localStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
  return sesion;
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

