"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { descargarBackup, cargarBackup } from "../lib/backupUtils";
import ProtectedRoute from "../components/ProtectedRoute";
import { esAdmin } from "../lib/authUtils";

function HomePageContent() {
  const [dateTime, setDateTime] = useState(new Date());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(esAdmin());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    return date.toLocaleDateString('es-ES', options);
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg md:text-xl font-semibold">Bienvenido 👋</h2>
            <p className="text-xs md:text-sm text-slate-400">
              Digital Space CRM
            </p>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 w-full sm:w-auto">
            <p className="text-xs text-slate-300 font-medium text-center sm:text-left" suppressHydrationWarning>
              {formatDate(dateTime)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/clientes" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-blue-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div className="text-3xl group-hover:scale-110 transition-transform duration-300">👥</div>
              <div className="w-1.5 h-1.5 bg-blue-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Clientes</h3>
              <p className="text-xs text-blue-100/90">Ver lista de clientes</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/pagos" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-green-600 via-green-700 to-green-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-green-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div className="text-3xl group-hover:scale-110 transition-transform duration-300">💰</div>
              <div className="w-1.5 h-1.5 bg-green-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Pagos</h3>
              <p className="text-xs text-green-100/90">Métricas y gestión</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/clientes/nuevo" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-purple-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div className="text-3xl group-hover:scale-110 transition-transform duration-300">➕</div>
              <div className="w-1.5 h-1.5 bg-purple-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Agregar Cliente</h3>
              <p className="text-xs text-purple-100/90">Registrar nuevo</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/balance" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-orange-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <div className="text-3xl group-hover:scale-110 transition-transform duration-300">📊</div>
              <div className="w-1.5 h-1.5 bg-orange-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Balance</h3>
              <p className="text-xs text-orange-100/90">Gastos y utilidad</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>
      </div>

      <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Presupuestos</h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <Link
              href="/presupuestos/nuevo"
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-cyan-500/30 overflow-hidden text-center"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span className="text-sm">📋</span>
                <span>Nuevo Presupuesto</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
            <Link
              href="/presupuestos"
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-cyan-500/30 overflow-hidden text-center"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span className="text-sm">📑</span>
                <span>Ver Presupuestos</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Respaldo</h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={descargarBackup}
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-indigo-500/30 overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span className="text-sm">📥</span>
                <span>Exportar</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </button>
            <label className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-indigo-500/30 cursor-pointer overflow-hidden">
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span className="text-sm">📤</span>
                <span>Importar</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const archivo = e.target.files[0];
                  if (archivo) {
                    if (confirm('¿Estás seguro? Esto reemplazará todos los datos actuales.')) {
                      try {
                        const resultado = await cargarBackup(archivo);
                        const mensaje = resultado?.resultados 
                          ? `Datos importados correctamente:\n- Clientes: ${resultado.resultados.clientes}\n- Pagos: ${resultado.resultados.pagosMensuales}\n- Gastos: ${resultado.resultados.gastos}\n- Ingresos: ${resultado.resultados.ingresos}\n- Usuarios: ${resultado.resultados.usuarios}\n\nRecarga la página para ver los cambios.`
                          : 'Datos importados correctamente. Recarga la página para ver los cambios.';
                        alert(mensaje);
                        window.location.reload();
                      } catch (error) {
                        alert('Error al importar: ' + error.message);
                      }
                    }
                  }
                  e.target.value = ''; // Reset input
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-300">Usuarios</h3>
            <Link
              href="/admin/usuarios"
              className="group relative w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-pink-500/30 overflow-hidden text-center"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                <span className="text-sm">👤</span>
                <span>Gestionar Usuarios</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomePageContent />
    </ProtectedRoute>
  );
}

