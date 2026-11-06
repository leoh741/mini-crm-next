"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { actualizarCliente, limpiarCacheClientes } from "../lib/clientesUtils";
import { Icons } from "./Icons";
import { getTagColor, asignarColoresUnicos } from "../lib/tagColors";

export default function QuickTagManager({ cliente, onUpdate, todasLasEtiquetas = [], todosLosClientes = [], onPanelToggle }) {
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [etiquetasCliente, setEtiquetasCliente] = useState(cliente.etiquetas || []);
  const [actualizando, setActualizando] = useState(false);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [creandoEtiqueta, setCreandoEtiqueta] = useState(false);
  const panelRef = useRef(null);
  const panelContentRef = useRef(null);

  // Capitalizar primera letra
  const capitalizarEtiqueta = (etiqueta) => {
    if (!etiqueta) return '';
    return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
  };

  // Obtener todas las etiquetas para asignar colores únicos
  const todasLasEtiquetasParaColores = useMemo(() => {
    const etiquetas = [...todasLasEtiquetas];
    if (todosLosClientes.length > 0) {
      const etiquetasDeClientes = todosLosClientes
        .map(c => c.etiquetas || [])
        .flat()
        .filter(Boolean);
      etiquetas.push(...etiquetasDeClientes);
    }
    return Array.from(new Set(etiquetas));
  }, [todasLasEtiquetas, todosLosClientes]);

  // Asignar colores únicos cuando cambian las etiquetas
  useMemo(() => {
    if (todasLasEtiquetasParaColores.length > 0) {
      asignarColoresUnicos(todasLasEtiquetasParaColores);
    }
  }, [todasLasEtiquetasParaColores]);

  // Obtener etiquetas únicas de todos los clientes
  // Si todasLasEtiquetas está vacío pero tenemos todosLosClientes, extraer de ahí
  let etiquetasDisponibles = Array.from(new Set(todasLasEtiquetas.flat())).sort();
  
  // Si no hay etiquetas disponibles pero tenemos la lista de clientes, extraerlas
  if (etiquetasDisponibles.length === 0 && todosLosClientes.length > 0) {
    const etiquetasDeTodos = todosLosClientes
      .map(c => c.etiquetas || [])
      .flat()
      .filter(Boolean);
    etiquetasDisponibles = Array.from(new Set(etiquetasDeTodos)).sort();
  }

  const cerrarPanel = () => {
    setMostrarPanel(false);
    if (onPanelToggle) onPanelToggle(false);
  };

  // El panel se dibuja en un portal, fuera del botón. Si no se tiene en
  // cuenta, el clic en una etiqueta se interpreta como "afuera" y el panel
  // se cierra antes de que la selección llegue a aplicarse.
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dentroDelBoton = panelRef.current?.contains(event.target);
      const dentroDelPanel = panelContentRef.current?.contains(event.target);
      if (!dentroDelBoton && !dentroDelPanel) {
        cerrarPanel();
      }
    };

    if (mostrarPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mostrarPanel]);

  // Actualizar etiquetas cuando cambia el cliente
  useEffect(() => {
    setEtiquetasCliente(cliente.etiquetas || []);
  }, [cliente.etiquetas]);

  const colocarPanel = () => {
    const ancla = panelRef.current;
    const panel = panelContentRef.current;
    if (!ancla || !panel) return;

    const boton = ancla.getBoundingClientRect();
    const margen = 12;
    const espacioHeader = 76;
    const espacioFooter = 64;
    const separacion = 6;
    const ancho = Math.min(256, window.innerWidth - margen * 2);
    let izquierda = boton.right - ancho;
    izquierda = Math.max(margen, Math.min(izquierda, window.innerWidth - ancho - margen));

    const espacioAbajo = window.innerHeight - boton.bottom - separacion - espacioFooter;
    const espacioArriba = boton.top - separacion - espacioHeader;
    const abrirArriba = espacioAbajo < 200 && espacioArriba > espacioAbajo;

    panel.style.position = "fixed";
    panel.style.width = `${ancho}px`;
    panel.style.left = `${izquierda}px`;
    panel.style.right = "auto";
    panel.style.transform = "none";
    panel.style.margin = "0";
    panel.style.zIndex = "200";
    panel.style.overflowY = "auto";

    const libre = Math.max(0, abrirArriba ? espacioArriba : espacioAbajo);

    if (abrirArriba) {
      panel.style.top = "auto";
      panel.style.bottom = `${window.innerHeight - boton.top + separacion}px`;
    } else {
      panel.style.bottom = "auto";
      panel.style.top = `${boton.bottom + separacion}px`;
    }
    panel.style.maxHeight = `${Math.min(320, libre)}px`;
  };

  useLayoutEffect(() => {
    if (!mostrarPanel) return undefined;

    colocarPanel();
    const actualizar = () => colocarPanel();
    window.addEventListener("resize", actualizar);
    window.addEventListener("scroll", actualizar, true);
    return () => {
      window.removeEventListener("resize", actualizar);
      window.removeEventListener("scroll", actualizar, true);
    };
  }, [mostrarPanel]);

  const normalizarEtiquetas = (lista) => Array.from(new Set(
    (lista || [])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  ));

  const toggleEtiqueta = async (e, etiqueta) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (actualizando || creandoEtiqueta) return;

    const etiquetasActuales = normalizarEtiquetas(etiquetasCliente);
    const etiquetaLower = String(etiqueta || "").trim().toLowerCase();
    if (!etiquetaLower) return;
    const tieneEtiqueta = etiquetasActuales.includes(etiquetaLower);
    
    const nuevasEtiquetas = tieneEtiqueta
      ? etiquetasActuales.filter((item) => item !== etiquetaLower)
      : [...etiquetasActuales, etiquetaLower];

    // Actualización optimista inmediata
    setEtiquetasCliente(nuevasEtiquetas);
    setActualizando(true);

    try {
      const clienteId = cliente.id || cliente._id || cliente.crmId;
      const resultado = await actualizarCliente(clienteId, { etiquetas: nuevasEtiquetas }, true);
      
      if (resultado) {
        limpiarCacheClientes();
        if (onUpdate) {
          onUpdate(clienteId, nuevasEtiquetas);
        }
      } else {
        // Revertir si falla
        setEtiquetasCliente(cliente.etiquetas || []);
        alert('Error al actualizar la etiqueta. Por favor, intenta nuevamente.');
      }
    } catch (error) {
      console.error('Error al actualizar etiqueta:', error);
      // Revertir si falla
      setEtiquetasCliente(cliente.etiquetas || []);
      alert('Error al actualizar la etiqueta. Por favor, intenta nuevamente.');
    } finally {
      setActualizando(false);
    }
  };

  const crearYAgregarEtiqueta = async () => {
    if (!nuevaEtiqueta.trim() || creandoEtiqueta) return;

    const etiquetaLower = nuevaEtiqueta.trim().toLowerCase();
    
    // Verificar si ya existe
    if (etiquetasCliente.includes(etiquetaLower)) {
      alert('Esta etiqueta ya está aplicada a este cliente');
      setNuevaEtiqueta("");
      return;
    }

    setCreandoEtiqueta(true);
    const nuevasEtiquetas = normalizarEtiquetas([...etiquetasCliente, etiquetaLower]);
    
    // Actualización optimista
    setEtiquetasCliente(nuevasEtiquetas);
    setNuevaEtiqueta("");

    try {
      const clienteId = cliente.id || cliente._id || cliente.crmId;
      const resultado = await actualizarCliente(clienteId, { etiquetas: nuevasEtiquetas }, true);
      
      if (resultado) {
        limpiarCacheClientes();
        if (onUpdate) {
          onUpdate(clienteId, nuevasEtiquetas);
        }
      } else {
        // Revertir si falla
        setEtiquetasCliente(cliente.etiquetas || []);
        alert('Error al crear la etiqueta. Por favor, intenta nuevamente.');
      }
    } catch (error) {
      console.error('Error al crear etiqueta:', error);
      // Revertir si falla
      setEtiquetasCliente(cliente.etiquetas || []);
      alert('Error al crear la etiqueta. Por favor, intenta nuevamente.');
    } finally {
      setCreandoEtiqueta(false);
    }
  };

  const handleNuevaEtiquetaKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      crearYAgregarEtiqueta();
    }
  };

  return (
    <div className={`relative ${mostrarPanel ? 'z-[200]' : 'z-30'}`} ref={panelRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const nuevoEstado = !mostrarPanel;
          setMostrarPanel(nuevoEstado);
          if (onPanelToggle) {
            onPanelToggle(nuevoEstado);
          }
        }}
        className="p-1.5 hover:bg-slate-700 rounded transition-colors relative z-20"
        title="Gestionar etiquetas"
        style={{ position: 'relative' }}
      >
        <Icons.Tag className="text-slate-400 hover:text-blue-400" />
      </button>

      {mostrarPanel && typeof document !== "undefined" && createPortal(
        <>
          {/* Overlay para cerrar al hacer click fuera y cubrir otros elementos */}
          <div 
            className="fixed inset-0 z-[150] bg-transparent"
            onMouseDown={(e) => {
              e.preventDefault();
              cerrarPanel();
            }}
          />
          <div 
            ref={panelContentRef}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-[200] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-3" 
            style={{ 
              backgroundColor: 'rgb(30 41 55)', 
              zIndex: 200, 
              opacity: 1,
              visibility: 'visible',
              display: 'block'
            }}
          >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-200">Etiquetas</h4>
            <button
              onClick={() => {
                setMostrarPanel(false);
                if (onPanelToggle) {
                  onPanelToggle(false);
                }
              }}
              className="text-slate-400 hover:text-slate-200"
            >
              <Icons.X className="text-sm" />
            </button>
          </div>

          {/* Campo para crear nueva etiqueta */}
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-2">Crear nueva etiqueta:</p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={nuevaEtiqueta}
                onChange={(e) => setNuevaEtiqueta(e.target.value)}
                onKeyDown={handleNuevaEtiquetaKeyDown}
                placeholder="Escribe y presiona Enter"
                className="flex-1 min-w-0 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
                disabled={creandoEtiqueta || actualizando}
              />
              <button
                onClick={crearYAgregarEtiqueta}
                disabled={!nuevaEtiqueta.trim() || creandoEtiqueta || actualizando}
                className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors whitespace-nowrap"
              >
                {creandoEtiqueta ? '...' : '+'}
              </button>
            </div>
          </div>

          {etiquetasDisponibles.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-2">Etiquetas disponibles:</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto relative z-10 bg-slate-800 rounded">
                {etiquetasDisponibles.map((etiqueta) => {
                  const tieneEtiqueta = normalizarEtiquetas(etiquetasCliente).includes(String(etiqueta).trim().toLowerCase());
                  return (
                    <button
                      type="button"
                      key={etiqueta}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => toggleEtiqueta(e, etiqueta)}
                      disabled={actualizando || creandoEtiqueta}
                      className={`px-2 py-1 rounded text-xs border transition-all relative z-10 ${
                        tieneEtiqueta
                          ? `${getTagColor(etiqueta)} ring-2 ring-blue-500`
                          : `${getTagColor(etiqueta)} opacity-60 hover:opacity-100`
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={tieneEtiqueta ? 'Click para remover' : 'Click para agregar'}
                    >
                      {capitalizarEtiqueta(etiqueta)}
                      {tieneEtiqueta && <span className="ml-1">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 pt-2 border-t border-slate-700">
            <p>Click en una etiqueta para aplicarla o removerla</p>
          </div>
        </div>
        </>,
        document.body
      )}
    </div>
  );
}


