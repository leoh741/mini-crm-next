"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/authUtils";
import { estaAutenticado } from "../../lib/authUtils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Prevenir scroll en el body
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Si ya está autenticado, redirigir al inicio
    if (estaAutenticado()) {
      router.push("/");
    }
    
    // Cleanup: restaurar scroll al desmontar
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error('Error en login:', err);
      setError(err.message || "Error al iniciar sesión. Verifica tu conexión a internet y que la base de datos esté configurada.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 h-screen w-screen flex items-center justify-center bg-slate-900 overflow-hidden px-4" style={{ overflow: 'hidden' }}>
      <div className="w-full max-w-md p-6 md:p-8 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">Digital Space CRM</h1>
          <p className="text-slate-400">Inicia sesión para continuar</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center">
            Digital Space CRM Copyright © 2025 - Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}

