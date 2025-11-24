"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { estaAutenticado } from "../lib/authUtils";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [autenticado, setAutenticado] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Verificar autenticación
    const verificarAutenticacion = () => {
      if (typeof window === 'undefined') {
        return;
      }

      const estaAuth = estaAutenticado();
      setAutenticado(estaAuth);
      setCargando(false);

      // Si no está autenticado y no está en login o registro, redirigir
      if (!estaAuth && pathname !== '/login' && pathname !== '/registro') {
        router.push("/login");
      }
    };

    verificarAutenticacion();
  }, [router, pathname]);

  // Mostrar carga solo mientras se verifica
  if (cargando) {
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

