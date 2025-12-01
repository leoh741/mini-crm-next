"use client";

import { useState, useEffect, useRef } from "react";
import { actualizarCliente, limpiarCacheClientes } from "../lib/clientesUtils";
import { Icons } from "./Icons";

export default function QuickTagManager({ cliente, onUpdate, todasLasEtiquetas = [], todosLosClientes = [] }) {
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [etiquetasCliente, setEtiquetasCliente] = useState(cliente.etiquetas || []);
  const [actualizando, setActualizando] = useState(false);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [creandoEtiqueta, setCreandoEtiqueta] = useState(false);
  const panelRef = useRef(null);

  // Capitalizar primera letra
  const capitalizarEtiqueta = (etiqueta) => {
    if (!etiqueta) return '';
    return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
  };

  // Colores para etiquetas
  const getTagColor = (tag) => {
    const colors = [
      'bg-blue-900/30 text-blue-400 border-blue-700',
      'bg-purple-900/30 text-purple-400 border-purple-700',
      'bg-green-900/30 text-green-400 border-green-700',
      'bg-yellow-900/30 text-yellow-400 border-yellow-700',
      'bg-pink-900/30 text-pink-400 border-pink-700',
      'bg-indigo-900/30 text-indigo-400 border-indigo-700',
      'bg-teal-900/30 text-teal-400 border-teal-700',
      'bg-orange-900/30 text-orange-400 border-orange-700',
    ];
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

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
          setMostrarPanel(!mostrarPanel);
        }}
        className={`p-1.5 hover:bg-slate-700 rounded transition-colors relative ${mostrarPanel ? 'z-[200]' : 'z-20'}`}
        title="Gestionar etiquetas"
      >
        <Icons.Tag className="text-slate-400 hover:text-blue-400" />
      </button>

      {mostrarPanel && (
        <>
          {/* Overlay para cerrar al hacer click fuera y cubrir otros elementos */}
          <div 
            className="fixed inset-0 z-[150] bg-transparent"
            onClick={() => setMostrarPanel(false)}
          />
          <div className="absolute right-0 sm:right-0 top-full mt-2 z-[200] w-64 max-w-[calc(100vw-1rem)] sm:max-w-none bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-3 transform sm:transform-none -translate-x-0 sm:translate-x-0" style={{ backgroundColor: 'rgb(30 41 55)', position: 'relative' }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-200">Etiquetas</h4>
            <button
              onClick={() => setMostrarPanel(false)}
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

