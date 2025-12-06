"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getMiembrosEquipo } from "../../lib/equipoUtils";
import { getTagColor, capitalizarEtiqueta, asignarColoresUnicos } from "../../lib/tagColors";
import QuickHabilidadesManager from "../../components/QuickHabilidadesManager";
import ProtectedRoute from "../../components/ProtectedRoute";

function EquipoPageContent() {
  const [miembros, setMiembros] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("todos"); // "todos", "activos", "inactivos"
  const [filtroHabilidad, setFiltroHabilidad] = useState(null);
  const [todasLasHabilidades, setTodasLasHabilidades] = useState([]);
  const [openPanelIndex, setOpenPanelIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarMiembros = async () => {
      try {
        setLoading(true);
        setError("");
        const miembrosData = await getMiembrosEquipo(true);
        setMiembros(miembrosData || []);
        
        // Extraer todas las habilidades únicas
        const habilidadesUnicas = Array.from(new Set(
          miembrosData.map(m => m.habilidades || []).flat().filter(Boolean)
        )).sort();
        setTodasLasHabilidades(habilidadesUnicas);
        // Asignar colores únicos - esto asegura que no haya duplicados
        asignarColoresUnicos(habilidadesUnicas);
      } catch (err) {
        console.error('Error al cargar miembros del equipo:', err);
        setError('Error al cargar los miembros del equipo. Por favor, recarga la página.');
        setMiembros([]);
      } finally {
        setLoading(false);
      }
    };

    cargarMiembros();
  }, []);

  // Efecto para asegurar que los colores sean únicos cuando cambien las habilidades
  useEffect(() => {
    if (todasLasHabilidades.length > 0) {
      asignarColoresUnicos(todasLasHabilidades);
    }
  }, [todasLasHabilidades]);

  const miembrosFiltrados = useMemo(() => {
    let miembrosResult = miembros;

    // Aplicar filtro de estado
    if (filtroActivo === "activos") {
      miembrosResult = miembrosResult.filter(m => m.activo !== false);
    } else if (filtroActivo === "inactivos") {
      miembrosResult = miembrosResult.filter(m => m.activo === false);
    }

    // Aplicar filtro de búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      miembrosResult = miembrosResult.filter(miembro => {
        const nombreMatch = miembro.nombre?.toLowerCase().includes(termino);
        const cargoMatch = miembro.cargo?.toLowerCase().includes(termino);
        const emailMatch = miembro.email?.toLowerCase().includes(termino);
        return nombreMatch || cargoMatch || emailMatch;
      });
    }

    // Aplicar filtro por habilidad
    if (filtroHabilidad) {
      miembrosResult = miembrosResult.filter(miembro =>
        miembro.habilidades && miembro.habilidades.includes(filtroHabilidad.toLowerCase())
      );
    }

    return miembrosResult;
  }, [miembros, busqueda, filtroActivo, filtroHabilidad]);

  const formatearCalificacion = (calificacion) => {
    if (calificacion === undefined || calificacion === null) return "N/A";
    return calificacion.toFixed(1);
  };

  const getColorCalificacion = (calificacion) => {
    if (calificacion === undefined || calificacion === null) return "text-slate-400";
    if (calificacion >= 8) return "text-green-400";
    if (calificacion >= 6) return "text-yellow-400";
    return "text-red-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando miembros del equipo...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
        <p className="text-red-200">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
        >
          Recargar página
        </button>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'visible' }}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Equipo</h2>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {busqueda.trim() || filtroActivo !== "todos"
              ? `${miembrosFiltrados.length} de ${miembros.length} ${miembros.length === 1 ? 'miembro' : 'miembros'}`
              : `Total: ${miembros.length} ${miembros.length === 1 ? 'miembro' : 'miembros'}`
            }
          </p>
        </div>
        <Link
          href="/equipo/nuevo"
          prefetch={true}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-center"
        >
          + Agregar Miembro
        </Link>
      </div>

      {/* Buscador y filtros */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cargo o email..."
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroActivo("todos")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filtroActivo === "todos"
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroActivo("activos")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filtroActivo === "activos"
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setFiltroActivo("inactivos")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filtroActivo === "inactivos"
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Inactivos
          </button>
        </div>
        
        {/* Filtro por habilidades */}
        {todasLasHabilidades.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => setFiltroHabilidad(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filtroHabilidad === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Todas las habilidades
            </button>
            {todasLasHabilidades.map((habilidad) => {
              const isActive = filtroHabilidad === habilidad;
              const colorClass = getTagColor(habilidad, todasLasHabilidades);
              return (
                <button
                  key={habilidad}
                  onClick={() => setFiltroHabilidad(isActive ? null : habilidad)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? `${colorClass} ring-2 ring-blue-500`
                      : `${colorClass} opacity-70 hover:opacity-100`
                  }`}
                >
                  {capitalizarEtiqueta(habilidad)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {miembrosFiltrados.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-400">
            {busqueda.trim() || filtroActivo !== "todos"
              ? "No se encontraron miembros que coincidan con los filtros"
              : "No hay miembros del equipo registrados"}
          </p>
        </div>
      ) : (
        <div className="space-y-2" style={{ position: 'relative', zIndex: 1, overflow: 'visible' }}>
          {miembrosFiltrados.map((miembro, index) => {
            const miembroId = miembro.id || miembro._id || miembro.crmId;
            const calificacionPromedio = miembro.comentarios && miembro.comentarios.length > 0
              ? miembro.comentarios.reduce((sum, c) => sum + (c.calificacion || 0), 0) / miembro.comentarios.length
              : miembro.calificacion || 0;
            const esSiguienteMiembro = openPanelIndex !== null && (index === openPanelIndex + 1 || index === openPanelIndex + 2);
            const tienePanelAbierto = openPanelIndex === index;

            return (
              <div
                key={miembroId}
                className={`relative p-4 pr-12 sm:pr-12 border border-slate-700 rounded hover:bg-slate-800 transition ${
                  !miembro.activo ? 'opacity-60' : ''
                } ${tienePanelAbierto ? 'z-[200]' : 'z-10'}`}
                style={tienePanelAbierto ? { zIndex: 200, position: 'relative', overflow: 'visible', isolation: 'isolate' } : { overflow: 'visible' }}
              >
                <Link
                  href={`/equipo/${miembroId}`}
                  prefetch={true}
                  className="block"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{miembro.nombre}</h3>
                        {!miembro.activo && (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-300 border border-red-700">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {miembro.cargo && (
                        <p className="text-sm text-slate-400 mt-1">{miembro.cargo}</p>
                      )}
                      {miembro.email && (
                        <p className="text-xs text-slate-500 mt-1">{miembro.email}</p>
                      )}
                      {miembro.habilidades && miembro.habilidades.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {miembro.habilidades.slice(0, 5).map((habilidad, habIndex) => (
                            <span
                              key={habIndex}
                              className={`px-2 py-0.5 rounded text-xs border ${getTagColor(habilidad, todasLasHabilidades)}`}
                            >
                              {capitalizarEtiqueta(habilidad)}
                            </span>
                          ))}
                          {miembro.habilidades.length > 5 && (
                            <span className="px-2 py-0.5 rounded text-xs border border-slate-700 text-slate-400">
                              +{miembro.habilidades.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400">Calificación:</span>
                          <span className={`text-sm font-medium ${getColorCalificacion(calificacionPromedio)}`}>
                            {formatearCalificacion(calificacionPromedio)}/10
                          </span>
                        </div>
                        {miembro.comentarios && miembro.comentarios.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400">Comentarios:</span>
                            <span className="text-sm text-slate-300">{miembro.comentarios.length}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
                <div className={`absolute top-2 right-2 z-10 ${esSiguienteMiembro && !tienePanelAbierto ? 'opacity-0 pointer-events-none' : ''}`}>
                  <QuickHabilidadesManager
                    miembro={{ ...miembro, _id: miembro._id || miembro.id || miembro.crmId, id: miembroId }}
                    todasLasHabilidades={todasLasHabilidades}
                    todosLosMiembros={miembros}
                    onUpdate={() => {
                      const cargarMiembros = async () => {
                        try {
                          const miembrosData = await getMiembrosEquipo(true);
                          setMiembros(miembrosData || []);
                          const habilidadesUnicas = Array.from(new Set(
                            miembrosData.map(m => m.habilidades || []).flat().filter(Boolean)
                          )).sort();
                          setTodasLasHabilidades(habilidadesUnicas);
                          asignarColoresUnicos(habilidadesUnicas);
                        } catch (err) {
                          console.error('Error al recargar miembros:', err);
                        }
                      };
                      cargarMiembros();
                    }}
                    onTogglePanel={(isOpen) => setOpenPanelIndex(isOpen ? index : null)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EquipoPage() {
  return (
    <ProtectedRoute>
      <EquipoPageContent />
    </ProtectedRoute>
  );
}

