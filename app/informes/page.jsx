"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getReports } from "../../lib/reportsUtils";
import ProtectedRoute from "../../components/ProtectedRoute";
import { Icons } from "../../components/Icons";

function InformesPageContent() {
  const [informes, setInformes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroPlataforma, setFiltroPlataforma] = useState("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarInformes = async () => {
      try {
        setLoading(true);
        setError("");
        const datos = await getReports({}, false);
        setInformes(datos || []);
      } catch (err) {
        console.error('Error al cargar informes:', err);
        setError("Error al cargar los informes. Por favor, intenta nuevamente.");
      } finally {
        setLoading(false);
      }
    };
    cargarInformes();
  }, []);

  const informesFiltrados = useMemo(() => {
    let filtrados = informes;

    // Filtrar por búsqueda (clienteNombre o título)
    if (busqueda.trim()) {
      const busquedaLower = busqueda.toLowerCase();
      filtrados = filtrados.filter(r => 
        r.clienteNombre?.toLowerCase().includes(busquedaLower) ||
        r.titulo?.toLowerCase().includes(busquedaLower)
      );
    }

    // Filtrar por estado
    if (filtroEstado !== "todos") {
      filtrados = filtrados.filter(r => r.estado === filtroEstado);
    }

    // Filtrar por plataforma
    if (filtroPlataforma !== "todos") {
      filtrados = filtrados.filter(r => {
        if (!r.sections || !Array.isArray(r.sections)) return false;
        return r.sections.some(s => s.platform === filtroPlataforma);
      });
    }

    // Filtrar por rango de fechas
    if (filtroFechaDesde) {
      const desde = new Date(filtroFechaDesde);
      filtrados = filtrados.filter(r => {
        if (!r.periodo?.to) return false;
        return new Date(r.periodo.to) >= desde;
      });
    }

    if (filtroFechaHasta) {
      const hasta = new Date(filtroFechaHasta);
      filtrados = filtrados.filter(r => {
        if (!r.periodo?.from) return false;
        return new Date(r.periodo.from) <= hasta;
      });
    }

    // Ordenar por fecha de creación (más recientes primero)
    filtrados = [...filtrados].sort((a, b) => {
      const fechaA = new Date(a.createdAt || 0);
      const fechaB = new Date(b.createdAt || 0);
      return fechaB - fechaA;
    });

    return filtrados;
  }, [informes, busqueda, filtroEstado, filtroPlataforma, filtroFechaDesde, filtroFechaHasta]);

  const formatearMoneda = (monto, moneda = 'ARS') => {
    if (!monto && monto !== 0) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
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

  const formatearPeriodo = (periodo) => {
    if (!periodo || !periodo.from || !periodo.to) return '-';
    const from = formatearFecha(periodo.from);
    const to = formatearFecha(periodo.to);
    return `${from} - ${to}`;
  };

  const getEstadoColor = (estado) => {
    const colores = {
      borrador: 'bg-gray-900/30 text-gray-400 border-gray-700',
      publicado: 'bg-green-900/30 text-green-400 border-green-700'
    };
    return colores[estado] || colores.borrador;
  };

  const getEstadoTexto = (estado) => {
    const textos = {
      borrador: 'Borrador',
      publicado: 'Publicado'
    };
    return textos[estado] || estado;
  };

  const getPlataformaNombre = (platform) => {
    const nombres = {
      meta: 'Meta Ads',
      google: 'Google Ads',
      otro: 'Otro'
    };
    return nombres[platform] || platform;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando informes...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Informes</h1>
        <Link
          href="/informes/nuevo"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium whitespace-nowrap text-center inline-flex items-center justify-center gap-2"
        >
          <Icons.Plus className="w-4 h-4" />
          Nuevo Informe
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
            placeholder="Buscar por cliente o título..."
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
            <option value="publicado">Publicado</option>
          </select>
          <select
            value={filtroPlataforma}
            onChange={(e) => setFiltroPlataforma(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="todos">Todas las plataformas</option>
            <option value="meta">Meta Ads</option>
            <option value="google">Google Ads</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="date"
            value={filtroFechaDesde}
            onChange={(e) => setFiltroFechaDesde(e.target.value)}
            placeholder="Fecha desde"
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            placeholder="Fecha hasta"
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Lista de informes */}
      {informesFiltrados.length === 0 ? (
        <div className="text-center py-12">
          <Icons.DocumentReport className="w-16 h-16 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 mb-4">
            {busqueda.trim() || filtroEstado !== "todos" || filtroPlataforma !== "todos" || filtroFechaDesde || filtroFechaHasta
              ? "No se encontraron informes con los filtros seleccionados"
              : "No hay informes creados aún"}
          </p>
          {!busqueda.trim() && filtroEstado === "todos" && filtroPlataforma === "todos" && !filtroFechaDesde && !filtroFechaHasta && (
            <Link
              href="/informes/nuevo"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
            >
              Crear primer informe
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {informesFiltrados.map((informe) => {
            const spendTotal = informe.computed?.totalsGlobal?.spend || 0;
            const plataformas = informe.sections?.map(s => s.platform) || [];
            const plataformasUnicas = [...new Set(plataformas)];

            return (
              <Link
                key={informe._id || informe.reportId}
                href={`/informes/${informe._id || informe.reportId}`}
                className="block p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-600 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-lg font-semibold text-slate-100">
                        {informe.titulo}
                      </h3>
                      <span className={`px-2 py-1 rounded text-xs border ${getEstadoColor(informe.estado)}`}>
                        {getEstadoTexto(informe.estado)}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">
                      <span className="font-medium">{informe.clienteNombre}</span>
                      {informe.clienteEmail && (
                        <span className="text-slate-500"> • {informe.clienteEmail}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Icons.Calendar className="w-4 h-4" />
                        {formatearPeriodo(informe.periodo)}
                      </span>
                      {plataformasUnicas.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Icons.ChartBar className="w-4 h-4" />
                          {plataformasUnicas.map(p => getPlataformaNombre(p)).join(', ')}
                        </span>
                      )}
                      {spendTotal > 0 && (
                        <span className="flex items-center gap-1 font-medium text-slate-300">
                          <Icons.CurrencyDollar className="w-4 h-4" />
                          {formatearMoneda(spendTotal, informe.moneda)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {informe.share?.enabled && (
                      <span className="px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-700 rounded text-xs">
                        <Icons.Share className="w-3 h-3 inline mr-1" />
                        Compartido
                      </span>
                    )}
                    <Icons.Folder className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InformesPage() {
  return (
    <ProtectedRoute>
      <InformesPageContent />
    </ProtectedRoute>
  );
}

