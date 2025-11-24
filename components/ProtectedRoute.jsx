"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { estaAutenticado, login } from "../lib/authUtils";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const [autenticado, setAutenticado] = useState(() => {
    if (typeof window !== 'undefined') {
      return estaAutenticado();
    }
    return false;
  });
  const [cargando, setCargando] = useState(!autenticado);

  useEffect(() => {
    const hacerLoginAutomatico = async () => {
      // Si ya está autenticado, no hacer nada
      if (estaAutenticado()) {
        setAutenticado(true);
        setCargando(false);
        return;
      }

      // Hacer login automático con las credenciales por defecto
      try {
        await login('leoh741@gmail.com', 'Leonel1234');
        setAutenticado(true);
        setCargando(false);
      } catch (error) {
        console.error('Error en login automático:', error);
        // Si falla el login automático, redirigir al login manual
        router.push("/login");
      }
    };

    hacerLoginAutomatico();
  }, [router]);

  // Mostrar carga mientras se autentica
  if (cargando || !autenticado) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-300">Cargando...</div>
      </div>
    );
  }

  return <>{children}</>;
}

