"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { actualizarMiembro } from "../lib/equipoUtils";
import { Icons } from "./Icons";
import { getTagColor, capitalizarEtiqueta, asignarColoresUnicos } from "../lib/tagColors";

export default function QuickHabilidadesManager({ miembro, onUpdate, todasLasHabilidades = [], todosLosMiembros = [], onTogglePanel }) {
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [habilidadesMiembro, setHabilidadesMiembro] = useState(miembro.habilidades || []);
  const [actualizando, setActualizando] = useState(false);
  const [nuevaHabilidad, setNuevaHabilidad] = useState("");
  const [creandoHabilidad, setCreandoHabilidad] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const panelContentRef = useRef(null);

  // Obtener todas las habilidades para asignar colores únicos
  const todasLasHabilidadesParaColores = useMemo(() => {
    const habilidades = [...todasLasHabilidades];
    if (todosLosMiembros.length > 0) {
      const habilidadesDeMiembros = todosLosMiembros
        .map(m => m.habilidades || [])
        .flat()
        .filter(Boolean);
      habilidades.push(...habilidadesDeMiembros);
    }
    return Array.from(new Set(habilidades));
  }, [todasLasHabilidades, todosLosMiembros]);

  // Asignar colores únicos cuando cambian las habilidades
  useMemo(() => {
    if (todasLasHabilidadesParaColores.length > 0) {
      asignarColoresUnicos(todasLasHabilidadesParaColores);
    }
  }, [todasLasHabilidadesParaColores]);

  // Obtener habilidades únicas de todos los miembros
  let habilidadesDisponibles = Array.from(new Set(todasLasHabilidades.flat())).sort();
  
  if (habilidadesDisponibles.length === 0 && todosLosMiembros.length > 0) {
    const habilidadesDeTodos = todosLosMiembros
      .map(m => m.habilidades || [])
      .flat()
      .filter(Boolean);
    habilidadesDisponibles = Array.from(new Set(habilidadesDeTodos)).sort();
  }

  // Cerrar panel al hacer click fuera (solo si el panel no está en un portal)
  // Como estamos usando un portal, este efecto no es necesario, pero lo dejamos por si acaso
  useEffect(() => {
    if (!mostrarPanel) return;
    
    const handleClickOutside = (event) => {
      // Si el clic fue en el botón, no cerrar
      if (buttonRef.current && buttonRef.current.contains(event.target)) {
        return;
      }
      // Si el clic fue en el panel, no cerrar
      if (panelContentRef.current && panelContentRef.current.contains(event.target)) {
        return;
      }
      // Si el clic fue fuera de ambos, cerrar
      setMostrarPanel(false);
    };

    // Usar un pequeño delay para evitar que se cierre inmediatamente al abrir
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mostrarPanel]);

  // Actualizar habilidades cuando cambia el miembro
  useEffect(() => {
    setHabilidadesMiembro(miembro.habilidades || []);
  }, [miembro.habilidades]);

  const toggleHabilidad = async (e, habilidad) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (actualizando || creandoHabilidad) return;

    const habilidadesActuales = habilidadesMiembro.length > 0 ? habilidadesMiembro : (miembro.habilidades || []);
    const habilidadLower = habilidad.toLowerCase();
    const tieneHabilidad = habilidadesActuales.includes(habilidadLower);
    
    let nuevasHabilidades;
    if (tieneHabilidad) {
      nuevasHabilidades = habilidadesActuales.filter(h => h !== habilidadLower);
    } else {
      nuevasHabilidades = [...habilidadesActuales, habilidadLower];
    }

    setHabilidadesMiembro(nuevasHabilidades);
    setActualizando(true);

    try {
      const miembroId = miembro._id || miembro.id || miembro.crmId;
      console.log('[QuickHabilidadesManager] Toggle habilidad - Miembro completo:', miembro);
      console.log('[QuickHabilidadesManager] ID del miembro:', miembroId);
      console.log('[QuickHabilidadesManager] Nuevas habilidades:', nuevasHabilidades);
      
      if (!miembroId) {
        console.error('[QuickHabilidadesManager] Error: No se pudo obtener el ID del miembro');
        alert('Error: No se pudo identificar al miembro. Por favor, recarga la página.');
        setHabilidadesMiembro(miembro.habilidades || []);
        setActualizando(false);
        return;
      }
      
      const resultado = await actualizarMiembro(miembroId, { habilidades: nuevasHabilidades }, true);
      
      console.log('[QuickHabilidadesManager] Resultado de actualización:', resultado);

      if (resultado && resultado.habilidades) {
        // Actualizar el estado local con el resultado del servidor
        setHabilidadesMiembro(resultado.habilidades);
        setTimeout(() => {
          if (onUpdate) {
            onUpdate();
          }
        }, 300);
      } else {
        console.error('[QuickHabilidadesManager] Error: resultado es null o no tiene habilidades');
        setHabilidadesMiembro(miembro.habilidades || []);
        alert('Error al actualizar la habilidad. Por favor, intenta nuevamente.');
      }
    } catch (error) {
      console.error('Error al actualizar habilidad:', error);
      console.error('Error completo:', error.message);
      setHabilidadesMiembro(miembro.habilidades || []);
      alert(`Error al actualizar la habilidad: ${error.message}`);
    } finally {
      setActualizando(false);
    }
  };

  const crearYAgregarHabilidad = async () => {
    if (!nuevaHabilidad.trim() || creandoHabilidad || actualizando) return;

    const habilidadLower = nuevaHabilidad.trim().toLowerCase();

    if (habilidadesMiembro.includes(habilidadLower)) {
      alert('Esta habilidad ya está aplicada a este miembro');
      setNuevaHabilidad("");
      return;
    }

    setCreandoHabilidad(true);
    const nuevasHabilidades = [...habilidadesMiembro, habilidadLower];

    setHabilidadesMiembro(nuevasHabilidades);
    setNuevaHabilidad("");

    try {
      const miembroId = miembro._id || miembro.id || miembro.crmId;
      console.log('[QuickHabilidadesManager] Crear habilidad - Miembro completo:', miembro);
      console.log('[QuickHabilidadesManager] ID del miembro:', miembroId);
      console.log('[QuickHabilidadesManager] Nuevas habilidades:', nuevasHabilidades);
      
      if (!miembroId) {
        console.error('[QuickHabilidadesManager] Error: No se pudo obtener el ID del miembro');
        alert('Error: No se pudo identificar al miembro. Por favor, recarga la página.');
        setHabilidadesMiembro(miembro.habilidades || []);
        setCreandoHabilidad(false);
        return;
      }
      
      const resultado = await actualizarMiembro(miembroId, { habilidades: nuevasHabilidades }, true);

      console.log('[QuickHabilidadesManager] Resultado de actualización:', resultado);

      if (resultado && resultado.habilidades) {
        // Actualizar el estado local con el resultado del servidor
        setHabilidadesMiembro(resultado.habilidades);
        setTimeout(() => {
          if (onUpdate) {
            onUpdate();
          }
        }, 300);
      } else {
        console.error('[QuickHabilidadesManager] Error: resultado es null o no tiene habilidades');
        setHabilidadesMiembro(miembro.habilidades || []);
        alert('Error al crear la habilidad. Por favor, intenta nuevamente.');
      }
    } catch (error) {
      console.error('Error al crear habilidad:', error);
      console.error('Error completo:', error.message);
      setHabilidadesMiembro(miembro.habilidades || []);
      alert(`Error al crear la habilidad: ${error.message}`);
    } finally {
      setCreandoHabilidad(false);
    }
  };

  const handleNuevaHabilidadKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      crearYAgregarHabilidad();
    }
  };

  useEffect(() => {
    if (onTogglePanel) {
      onTogglePanel(mostrarPanel);
    }
  }, [mostrarPanel, onTogglePanel]);

  return (
    <div className={`relative ${mostrarPanel ? 'z-[200]' : 'z-30'}`} ref={panelRef} style={mostrarPanel ? { zIndex: 200, position: 'relative', overflow: 'visible' } : { overflow: 'visible' }}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMostrarPanel(!mostrarPanel);
        }}
        className={`p-1.5 hover:bg-slate-700 rounded transition-colors relative ${mostrarPanel ? 'z-[200]' : 'z-20'}`}
        title="Gestionar habilidades"
      >
        <Icons.Tag className="text-slate-400 hover:text-blue-400" />
      </button>

      {mostrarPanel && typeof window !== 'undefined' && buttonRef.current && createPortal(
        <>
          {/* Overlay para cerrar al hacer click fuera */}
          <div
            className="fixed inset-0 z-[150] bg-transparent"
            onClick={(e) => {
              // Solo cerrar si el clic fue directamente en el overlay, no en el panel
              if (e.target === e.currentTarget && (!panelContentRef.current || !panelContentRef.current.contains(e.target))) {
                setMostrarPanel(false);
              }
            }}
            onMouseDown={(e) => {
              // Prevenir que el clic en el overlay cierre el panel si se hace clic en el panel
              if (panelContentRef.current && panelContentRef.current.contains(e.target)) {
                e.stopPropagation();
              }
            }}
            style={{ zIndex: 150 }}
          />
          <div 
            ref={panelContentRef}
            className="fixed w-64 max-w-[calc(100vw-2rem)] sm:max-w-none border border-slate-700 rounded-lg shadow-2xl p-3 bg-slate-800" 
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'rgb(30 41 55)', 
              background: 'rgb(30 41 55)',
              zIndex: 200, 
              position: 'fixed',
              top: `${buttonRef.current.getBoundingClientRect().bottom + 8}px`,
              right: `${window.innerWidth - buttonRef.current.getBoundingClientRect().right}px`,
              opacity: 1,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)'
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-200">Habilidades</h4>
              <button
                onClick={() => setMostrarPanel(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <Icons.X className="text-sm" />
              </button>
            </div>

            {/* Campo para crear nueva habilidad */}
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-2">Crear nueva habilidad:</p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={nuevaHabilidad}
                  onChange={(e) => setNuevaHabilidad(e.target.value)}
                  onKeyDown={handleNuevaHabilidadKeyDown}
                  placeholder="Escribe y presiona Enter"
                  className="flex-1 min-w-0 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
                  disabled={creandoHabilidad || actualizando}
                />
                <button
                  onClick={crearYAgregarHabilidad}
                  disabled={!nuevaHabilidad.trim() || creandoHabilidad || actualizando}
                  className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {creandoHabilidad ? '...' : '+'}
                </button>
              </div>
            </div>

            {habilidadesDisponibles.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-2">Habilidades disponibles:</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto relative z-10 bg-slate-800" style={{ backgroundColor: 'rgb(30 41 55)' }}>
                  {habilidadesDisponibles.map((habilidad) => {
                    const tieneHabilidad = habilidadesMiembro.includes(habilidad.toLowerCase());
                    return (
                      <button
                        key={habilidad}
                        onClick={(e) => toggleHabilidad(e, habilidad)}
                        disabled={actualizando || creandoHabilidad}
                        className={`px-2 py-1 rounded text-xs border transition-all relative z-10 ${
                          tieneHabilidad
                            ? `${getTagColor(habilidad, todasLasHabilidades)} ring-2 ring-blue-500`
                            : `${getTagColor(habilidad, todasLasHabilidades)} opacity-60 hover:opacity-100`
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={tieneHabilidad ? 'Click para remover' : 'Click para agregar'}
                      >
                        {capitalizarEtiqueta(habilidad)}
                        {tieneHabilidad && <span className="ml-1">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-xs text-slate-400 pt-2 border-t border-slate-700">
              <p>Click en una habilidad para aplicarla o removerla</p>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

