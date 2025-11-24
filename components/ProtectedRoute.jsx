"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { estaAutenticado } from "../lib/authUtils";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [autenticado, setAutenticado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Marcar que el componente está montado en el cliente
    setMounted(true);
    
    // Timeout de seguridad: si después de 3 segundos aún está cargando, forzar detención
    const timeoutId = setTimeout(() => {
      console.warn('ProtectedRoute: Timeout de carga alcanzado, forzando detención');
      setCargando(false);
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // Solo verificar autenticación cuando el componente esté montado en el cliente
    if (typeof window === 'undefined') {
      // Si estamos en el servidor, marcar como no cargando inmediatamente
      setCargando(false);
      return;
    }

    // Esperar a que el componente esté montado
    if (!mounted) {
      return;
    }

    // Verificar autenticación
    try {
      const estaAuth = estaAutenticado();
      setAutenticado(estaAuth);
      
      // Si no está autenticado y no está en login o registro, redirigir
      if (!estaAuth && pathname !== '/login' && pathname !== '/registro') {
        router.push("/login");
      }
    } catch (error) {
      console.error('Error al verificar autenticación:', error);
      // En caso de error, asumir no autenticado y redirigir
      setAutenticado(false);
      if (pathname !== '/login' && pathname !== '/registro') {
        router.push("/login");
      }
    } finally {
      // Siempre marcar como no cargando después de verificar
      setCargando(false);
    }
  }, [router, pathname, mounted]);

  // Si aún no está montado en el cliente, mostrar carga
  if (!mounted || cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-300">Cargando...</div>
      </div>
    );
  }

  // Si no está autenticado, no mostrar el contenido (ya se redirigió)
  if (!autenticado) {
    return null;
  }

  return <>{children}</>;
}

