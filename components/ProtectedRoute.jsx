"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { estaAutenticado, esAdmin, getUsuarioActual } from "../lib/authUtils";

// Rutas públicas que no requieren autenticación
const PUBLIC_ROUTES = ['/login', '/registro'];

// Rutas accesibles solo para administradores
const ADMIN_ONLY_ROUTES = [
  '/',
  '/clientes',
  '/pagos',
  '/balance',
  '/presupuestos',
  '/reuniones',
  '/tareas',
  '/equipo',
  '/email',
  '/admin',
  '/pedidos'
];

// Rutas accesibles para todos los usuarios autenticados (incluyendo no-admin)
const ALL_USER_ROUTES = ['/activities'];

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [autenticado, setAutenticado] = useState(false);
  const [tieneAcceso, setTieneAcceso] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Marcar que el componente está montado en el cliente
    // Usar requestAnimationFrame para asegurar que se ejecute después del render inicial
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        setMounted(true);
      });
    } else {
      // Si estamos en el servidor, marcar como montado inmediatamente
      setMounted(true);
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Solo verificar autenticación cuando el componente esté montado en el cliente
    if (typeof window === 'undefined') {
      setCargando(false);
      return;
    }

    // Esperar a que el componente esté montado
    if (!mounted) {
      return;
    }

    // Verificar autenticación de forma síncrona (es rápido, solo lee localStorage)
    try {
      const estaAuth = estaAutenticado();
      setAutenticado(estaAuth);
      
      // Si no está autenticado y no está en una ruta pública, redirigir
      if (!estaAuth) {
        if (!PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
          router.push("/login");
        } else {
          setTieneAcceso(true);
        }
        setCargando(false);
        return;
      }

      // Si está autenticado, verificar permisos según la ruta
      const isAdminUser = esAdmin();
      const currentPath = pathname;
      const sesion = getUsuarioActual();
      console.log('[ProtectedRoute] Verificando acceso:', { 
        path: currentPath, 
        isAdmin: isAdminUser, 
        rol: sesion?.rol,
        autenticado: estaAuth 
      });

      // Verificar si la ruta es pública
      if (PUBLIC_ROUTES.some(route => currentPath.startsWith(route))) {
        console.log('[ProtectedRoute] Ruta pública:', currentPath);
        setTieneAcceso(true);
      }
      // Verificar si la ruta es accesible para todos los usuarios (VERIFICAR PRIMERO ANTES DE ADMIN_ONLY)
      else if (ALL_USER_ROUTES.some(route => currentPath.startsWith(route))) {
        console.log('[ProtectedRoute] Ruta accesible para todos los usuarios:', currentPath);
        setTieneAcceso(true);
      }
      // Verificar si la ruta es solo para admin
      else if (ADMIN_ONLY_ROUTES.some(route => currentPath.startsWith(route))) {
        if (isAdminUser) {
          console.log('[ProtectedRoute] Admin accediendo a ruta de admin:', currentPath);
          setTieneAcceso(true);
        } else {
          // Usuario no admin intentando acceder a ruta de admin, redirigir a activities
          console.log('[ProtectedRoute] Usuario no admin intentando acceder a ruta de admin, redirigiendo a /activities');
          router.push("/activities");
          setTieneAcceso(false);
        }
      }
      // Ruta no reconocida, por defecto solo admin
      else {
        console.log('[ProtectedRoute] Ruta no reconocida:', currentPath);
        if (isAdminUser) {
          setTieneAcceso(true);
        } else {
          console.log('[ProtectedRoute] Usuario no admin en ruta no reconocida, redirigiendo a /activities');
          router.push("/activities");
          setTieneAcceso(false);
        }
      }
    } catch (error) {
      console.error('Error al verificar autenticación:', error);
      // En caso de error, asumir no autenticado y redirigir
      setAutenticado(false);
      setTieneAcceso(false);
      if (!PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
        router.push("/login");
      }
    } finally {
      // Siempre marcar como no cargando después de verificar
      // Usar un pequeño delay para evitar parpadeos
      setTimeout(() => {
        setCargando(false);
      }, 0);
    }
  }, [router, pathname, mounted]);

  // Si aún no está montado en el cliente, mostrar carga
  if (!mounted || cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-slate-300">Cargando...</div>
      </div>
    );
  }

  // Si no está autenticado o no tiene acceso, mostrar mensaje o redirigir
  if (!autenticado) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-red-400">No estás autenticado. Redirigiendo...</div>
      </div>
    );
  }

  if (!tieneAcceso) {
    // Para /activities, siempre debería tener acceso si está autenticado
    // Si no tiene acceso, puede ser un error en la lógica
    console.warn('[ProtectedRoute] Usuario autenticado sin acceso a:', pathname);
    console.warn('[ProtectedRoute] Estado:', { autenticado, tieneAcceso, pathname, mounted, cargando });
    
    // Si es /activities y está autenticado, forzar acceso (fallback de seguridad)
    if (pathname.startsWith('/activities') && autenticado) {
      console.log('[ProtectedRoute] Fallback: Forzando acceso a /activities para usuario autenticado');
      return <>{children}</>;
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-red-400">No tienes acceso a esta página.</div>
      </div>
    );
  }

  return <>{children}</>;
}

