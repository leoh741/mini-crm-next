"use client";

import { useState, useEffect, useRef } from "react";
import { actualizarCliente, limpiarCacheClientes } from "../lib/clientesUtils";
import { Icons } from "./Icons";

export default function QuickTagManager({ cliente, onUpdate, todasLasEtiquetas = [] }) {
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [etiquetasCliente, setEtiquetasCliente] = useState(cliente.etiquetas || []);
  const [actualizando, setActualizando] = useState(false);
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
  const etiquetasDisponibles = Array.from(new Set(todasLasEtiquetas.flat())).sort();

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

  const toggleEtiqueta = async (etiqueta) => {
    if (actualizando) return;

    const etiquetaLower = etiqueta.toLowerCase();
    const tieneEtiqueta = etiquetasCliente.includes(etiquetaLower);
    
    let nuevasEtiquetas;
    if (tieneEtiqueta) {
      // Remover etiqueta
      nuevasEtiquetas = etiquetasCliente.filter(e => e !== etiquetaLower);
    } else {
      // Agregar etiqueta
      nuevasEtiquetas = [...etiquetasCliente, etiquetaLower];
    }

    // Actualización optimista
    setEtiquetasCliente(nuevasEtiquetas);
    setActualizando(true);

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

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMostrarPanel(!mostrarPanel);
        }}
        className="p-1.5 hover:bg-slate-700 rounded transition-colors"
        title="Gestionar etiquetas"
      >
        <Icons.Tag className="text-slate-400 hover:text-blue-400" />
      </button>

      {mostrarPanel && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-200">Etiquetas</h4>
            <button
              onClick={() => setMostrarPanel(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <Icons.X className="text-sm" />
            </button>
          </div>

          {etiquetasDisponibles.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-2">Etiquetas disponibles:</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {etiquetasDisponibles.map((etiqueta) => {
                  const tieneEtiqueta = etiquetasCliente.includes(etiqueta.toLowerCase());
                  return (
                    <button
                      key={etiqueta}
                      onClick={() => toggleEtiqueta(etiqueta)}
                      disabled={actualizando}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
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
      )}
    </div>
  );
}

