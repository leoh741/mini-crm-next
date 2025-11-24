"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getClientes } from "../../lib/clientesUtils";
import ClientList from "../../components/ClientList";
import ProtectedRoute from "../../components/ProtectedRoute";

function ClientesPageContent() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarClientes = async (forceRefresh = false) => {
      try {
        setLoading(true);
        // Si se fuerza la recarga, pasar el parámetro a getClientes
        const clientesData = await getClientes(forceRefresh);
        setClientes(clientesData || []);
        setError("");
      } catch (err) {
        console.error('Error al cargar clientes:', err);
        setError('Error al cargar los clientes. Por favor, recarga la página.');
        setClientes([]);
      } finally {
        setLoading(false);
      }
    };
    
    // Cargar clientes al montar
    cargarClientes();
    
    // Escuchar eventos de actualización (por ejemplo, después de importar)
    const handleStorageChange = (e) => {
      // Si se detecta que se limpió el caché, recargar
      if (e.key === 'crm_clientes_cache' && e.newValue === null) {
        cargarClientes(true); // Forzar recarga desde servidor
      }
    };
    
    // Escuchar cambios en localStorage
    window.addEventListener('storage', handleStorageChange);
    
    // También escuchar eventos personalizados
    const handleForceRefresh = () => {
      cargarClientes(true);
    };
    window.addEventListener('clientes:force-refresh', handleForceRefresh);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('clientes:force-refresh', handleForceRefresh);
    };
  }, []);

  // Filtrar clientes basado en la búsqueda (memoizado)
  const clientesFiltrados = useMemo(() => {
    if (!busqueda.trim()) return clientes;
    
    const termino = busqueda.toLowerCase();
    return clientes.filter(cliente => {
      const nombreMatch = cliente.nombre?.toLowerCase().includes(termino);
      const rubroMatch = cliente.rubro?.toLowerCase().includes(termino);
      return nombreMatch || rubroMatch;
    });
  }, [clientes, busqueda]);

  // Debounce para la búsqueda (mejora rendimiento)
  const handleBusquedaChange = useCallback((e) => {
    setBusqueda(e.target.value);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando clientes...</div>
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
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-lg md:text-xl">Clientes</h2>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {busqueda.trim() 
              ? `${clientesFiltrados.length} de ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`
              : `Total: ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`
            }
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          prefetch={true}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-center"
        >
          + Agregar Cliente
        </Link>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          value={busqueda}
          onChange={handleBusquedaChange}
          placeholder="Buscar por nombre o rubro..."
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
        />
      </div>

      {clientesFiltrados.length === 0 && busqueda.trim() ? (
        <div className="text-center py-8">
          <p className="text-slate-400">No se encontraron clientes que coincidan con "{busqueda}"</p>
        </div>
      ) : (
        <ClientList clientes={clientesFiltrados} />
      )}
    </div>
  );
}

export default function ClientesPage() {
  return (
    <ProtectedRoute>
      <ClientesPageContent />
    </ProtectedRoute>
  );
}

