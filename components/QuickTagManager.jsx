"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setMostrarPanel(false);
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

  // Ajustar posición del panel cuando se muestra
  useEffect(() => {
    if (mostrarPanel && panelRef.current && panelContentRef.current) {
      const buttonRect = panelRef.current.getBoundingClientRect();
      const footerHeight = 60;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const spaceRight = viewportWidth - buttonRect.right;
      const panelHeight = 300;
      const panelWidth = 256;
      const isMobile = viewportWidth < 640;
      const margin = 16;
      
      if (isMobile) {
        // Móvil: usar fixed para evitar problemas de overflow
        panelContentRef.current.style.position = 'fixed';
        const panelWidthActual = Math.min(panelWidth, viewportWidth - (margin * 2));
        panelContentRef.current.style.width = `${panelWidthActual}px`;
        
        // Posición horizontal: alinear con el borde derecho del botón
        let leftPos = buttonRect.right - panelWidthActual;
        
        // Si se sale por la izquierda, ajustar
        if (leftPos < margin) {
          leftPos = margin;
        }
        
        // Si se sale por la derecha, ajustar
        if (leftPos + panelWidthActual > viewportWidth - margin) {
          leftPos = viewportWidth - panelWidthActual - margin;
        }
        
        panelContentRef.current.style.left = `${leftPos}px`;
        panelContentRef.current.style.right = 'auto';
        
        // Posición vertical: SIEMPRE mostrar el panel usando solo 'top' (más confiable)
        const topMargin = 20;
        const bottomMargin = footerHeight + 20;
        const minPanelHeight = 150;
        const buttonSpacing = 8;
        
        // Calcular espacio disponible de forma más simple
        const spaceBelowUsable = Math.max(0, viewportHeight - buttonRect.bottom - buttonSpacing - bottomMargin);
        const spaceAboveUsable = Math.max(0, buttonRect.top - topMargin - buttonSpacing);
        
        let topPosition;
        let maxHeight;
        
        // Estrategia simple: intentar abajo primero, si no cabe, arriba
        if (spaceBelowUsable >= minPanelHeight) {
          // Mostrar abajo: hay espacio suficiente
          topPosition = buttonRect.bottom + buttonSpacing;
          maxHeight = spaceBelowUsable;
        } else if (spaceAboveUsable >= minPanelHeight) {
          // Mostrar arriba: no hay espacio abajo pero sí arriba
          // Posicionar el panel para que termine justo antes del botón
          maxHeight = Math.min(panelHeight, spaceAboveUsable);
          topPosition = buttonRect.top - maxHeight - buttonSpacing;
          // Asegurar que no se salga del top
          if (topPosition < topMargin) {
            topPosition = topMargin;
            maxHeight = buttonRect.top - topPosition - buttonSpacing;
          }
        } else {
          // No hay espacio suficiente en ninguna dirección
          // Usar la que tenga más espacio (aunque sea poco)
          if (spaceAboveUsable > spaceBelowUsable) {
            // Mostrar arriba con el espacio disponible
            maxHeight = Math.max(minPanelHeight, spaceAboveUsable);
            topPosition = buttonRect.top - maxHeight - buttonSpacing;
            if (topPosition < topMargin) {
              topPosition = topMargin;
              maxHeight = Math.max(minPanelHeight, buttonRect.top - topPosition - buttonSpacing);
            }
          } else {
            // Mostrar abajo con el espacio disponible
            topPosition = buttonRect.bottom + buttonSpacing;
            maxHeight = Math.max(minPanelHeight, spaceBelowUsable);
          }
        }
        
        // Verificación final: asegurar que el panel quepa en el viewport
        const maxPossibleHeight = viewportHeight - topPosition - bottomMargin;
        if (maxHeight > maxPossibleHeight) {
          maxHeight = Math.max(minPanelHeight, maxPossibleHeight);
        }
        if (topPosition + maxHeight > viewportHeight - bottomMargin) {
          maxHeight = Math.max(minPanelHeight, viewportHeight - topPosition - bottomMargin);
        }
        
        // Aplicar estilos
        panelContentRef.current.style.top = `${Math.max(topMargin, topPosition)}px`;
        panelContentRef.current.style.bottom = '';
        panelContentRef.current.style.maxHeight = `${maxHeight}px`;
        panelContentRef.current.style.overflowY = 'auto';
      } else {
        // Desktop: las clases de Tailwind (absolute right-0 top-full mt-2) ya posicionan el panel
        // Solo ajustar cuando sea necesario para evitar que se salga del viewport
        
        // Limpiar estilos inline que puedan interferir con las clases
        panelContentRef.current.style.width = '';
        panelContentRef.current.style.maxHeight = '';
        panelContentRef.current.style.overflowY = '';
        
        // Posición vertical: ajustar solo si necesitamos mostrarlo arriba
        if (spaceBelow < panelHeight + 20 && spaceAbove > spaceBelow) {
          panelContentRef.current.style.top = 'auto';
          panelContentRef.current.style.bottom = `${buttonRect.height + 8}px`;
        } else {
          // Remover estilos inline para que las clases top-full mt-2 funcionen
          panelContentRef.current.style.removeProperty('top');
          panelContentRef.current.style.removeProperty('bottom');
        }
        
        // Posición horizontal: ajustar solo si se sale por la derecha
        if (spaceRight < panelWidth && buttonRect.left > panelWidth) {
          // Mostrar a la izquierda del botón
          panelContentRef.current.style.right = 'auto';
          panelContentRef.current.style.left = '0';
          panelContentRef.current.style.transform = 'translateX(-100%)';
        } else {
          // Remover estilos inline para que la clase right-0 funcione
          panelContentRef.current.style.removeProperty('right');
          panelContentRef.current.style.removeProperty('left');
          panelContentRef.current.style.removeProperty('transform');
        }
      }
    }
  }, [mostrarPanel]);

  const toggleEtiqueta = async (e, etiqueta) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (actualizando || creandoEtiqueta) return;

    // Usar el estado actual más reciente
    const etiquetasActuales = etiquetasCliente.length > 0 ? etiquetasCliente : (cliente.etiquetas || []);
    const etiquetaLower = etiqueta.toLowerCase();
    const tieneEtiqueta = etiquetasActuales.includes(etiquetaLower);
    
    let nuevasEtiquetas;
    if (tieneEtiqueta) {
      // Remover etiqueta
      nuevasEtiquetas = etiquetasActuales.filter(e => e !== etiquetaLower);
    } else {
      // Agregar etiqueta
      nuevasEtiquetas = [...etiquetasActuales, etiquetaLower];
    }

    // Actualización optimista inmediata
    setEtiquetasCliente(nuevasEtiquetas);
    setActualizando(true);

    try {
      const clienteId = cliente.id || cliente._id || cliente.crmId;
      const resultado = await actualizarCliente(clienteId, { etiquetas: nuevasEtiquetas }, true);
      
      if (resultado) {
        limpiarCacheClientes();
        // Actualizar el cliente local para reflejar el cambio
        if (onUpdate) {
          // Pequeño delay para asegurar que el servidor procesó el cambio
          setTimeout(() => {
            onUpdate();
          }, 100);
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
    const nuevasEtiquetas = [...etiquetasCliente, etiquetaLower];
    
    // Actualización optimista
    setEtiquetasCliente(nuevasEtiquetas);
    setNuevaEtiqueta("");

    try {
      const clienteId = cliente.id || cliente._id || cliente.crmId;
      const resultado = await actualizarCliente(clienteId, { etiquetas: nuevasEtiquetas }, true);
      
      if (resultado) {
        limpiarCacheClientes();
        if (onUpdate) {
          onUpdate();
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

      {mostrarPanel && (
        <>
          {/* Overlay para cerrar al hacer click fuera y cubrir otros elementos */}
          <div 
            className="fixed inset-0 z-[150] bg-transparent"
            onClick={() => {
              setMostrarPanel(false);
              if (onPanelToggle) {
                onPanelToggle(false);
              }
            }}
          />
          <div 
            ref={panelContentRef}
            className="absolute right-0 top-full mt-2 z-[200] w-64 max-w-[calc(100vw-2rem)] sm:max-w-none bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-3 mb-4" 
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
                  const tieneEtiqueta = etiquetasCliente.includes(etiqueta.toLowerCase());
                  return (
                    <button
                      key={etiqueta}
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
        </>
      )}
    </div>
  );
}


