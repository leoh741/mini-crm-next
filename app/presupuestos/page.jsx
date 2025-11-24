"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getPresupuestos } from "../../lib/presupuestosUtils";
import ProtectedRoute from "../../components/ProtectedRoute";

function PresupuestosPageContent() {
  const [presupuestos, setPresupuestos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarPresupuestos = async () => {
      try {
        setLoading(true);
        setError("");
        const datos = await getPresupuestos(true);
        setPresupuestos(datos);
      } catch (err) {
        console.error('Error al cargar presupuestos:', err);
        setError("Error al cargar los presupuestos. Por favor, intenta nuevamente.");
      } finally {
        setLoading(false);
      }
    };
    cargarPresupuestos();
  }, []);

  const presupuestosFiltrados = useMemo(() => {
    let filtrados = presupuestos;

    // Filtrar por búsqueda
    if (busqueda.trim()) {
      const busquedaLower = busqueda.toLowerCase();
      filtrados = filtrados.filter(p => 
        p.cliente?.nombre?.toLowerCase().includes(busquedaLower) ||
        p.numero?.toString().includes(busqueda) ||
        p.presupuestoId?.toLowerCase().includes(busquedaLower)
      );
    }

    // Filtrar por estado
    if (filtroEstado !== "todos") {
      filtrados = filtrados.filter(p => p.estado === filtroEstado);
    }

    return filtrados;
  }, [presupuestos, busqueda, filtroEstado]);

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getEstadoColor = (estado) => {
    const colores = {
      borrador: 'bg-gray-900/30 text-gray-400 border-gray-700',
      enviado: 'bg-blue-900/30 text-blue-400 border-blue-700',
      aceptado: 'bg-green-900/30 text-green-400 border-green-700',
      rechazado: 'bg-red-900/30 text-red-400 border-red-700',
      vencido: 'bg-orange-900/30 text-orange-400 border-orange-700'
    };
    return colores[estado] || colores.borrador;
  };

  const getEstadoTexto = (estado) => {
    const textos = {
      borrador: 'Borrador',
      enviado: 'Enviado',
      aceptado: 'Aceptado',
      rechazado: 'Rechazado',
      vencido: 'Vencido'
    };
    return textos[estado] || estado;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando presupuestos...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        <Link
          href="/presupuestos/nuevo"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium whitespace-nowrap text-center"
        >
          + Nuevo Presupuesto
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Buscar por cliente, número o ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="todos">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="enviado">Enviado</option>
            <option value="aceptado">Aceptado</option>
            <option value="rechazado">Rechazado</option>
            <option value="vencido">Vencido</option>
          </select>
        </div>
      </div>

      {/* Lista de presupuestos */}
      {presupuestosFiltrados.length === 0 ? (
        <div className="p-8 bg-slate-800 rounded-lg border border-slate-700 text-center">
          <p className="text-slate-400">
            {presupuestos.length === 0 
              ? "No hay presupuestos creados aún." 
              : "No se encontraron presupuestos con los filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {presupuestosFiltrados.map((presupuesto) => (
            <Link
              key={presupuesto.id}
              href={`/presupuestos/${presupuesto.id}`}
              className="block p-4 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-750 transition"
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">Presupuesto #{presupuesto.numero}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getEstadoColor(presupuesto.estado)}`}>
                      {getEstadoTexto(presupuesto.estado)}
                    </span>
                  </div>
                  <p className="text-slate-300 font-medium mb-1">{presupuesto.cliente?.nombre || 'Sin cliente'}</p>
                  {presupuesto.cliente?.rubro && (
                    <p className="text-sm text-slate-400 mb-2">{presupuesto.cliente.rubro}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                    <span>Fecha: {formatearFecha(presupuesto.fecha)}</span>
                    {presupuesto.validez && (
                      <span>Validez: {presupuesto.validez} días</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-100">
                    {formatearMoneda(presupuesto.total)}
                  </p>
                  {presupuesto.descuento > 0 && (
                    <p className="text-sm text-slate-400 line-through">
                      {formatearMoneda(presupuesto.subtotal)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PresupuestosPage() {
  return (
    <ProtectedRoute>
      <PresupuestosPageContent />
    </ProtectedRoute>
  );
}

