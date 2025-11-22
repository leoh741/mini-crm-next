"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { estaAutenticado } from "../lib/authUtils";

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  // Verificación inicial síncrona para evitar delay visual
  const [autenticado, setAutenticado] = useState(() => {
    if (typeof window !== 'undefined') {
      return estaAutenticado();
    }
    return false;
  });

  useEffect(() => {
    // Verificación adicional en el cliente
    const autenticadoActual = estaAutenticado();
    if (!autenticadoActual) {
      router.push("/login");
      return;
    }
    // Solo actualizar si cambió el estado
    if (!autenticado) {
      setAutenticado(true);
    }
  }, [router, autenticado]);

  // Evitar render innecesario si no está autenticado
  if (!autenticado) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-300">Verificando...</div>
      </div>
    );
  }

  return <>{children}</>;
}

