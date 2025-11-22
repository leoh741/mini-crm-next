"use client";

import { useState, useEffect } from "react";
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
    const cargarClientes = async () => {
      try {
        setLoading(true);
        const clientesData = await getClientes();
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
    cargarClientes();
  }, []);

  // Filtrar clientes basado en la búsqueda
  const clientesFiltrados = clientes.filter(cliente => {
    if (!busqueda.trim()) return true;
    
    const termino = busqueda.toLowerCase();
    const nombreMatch = cliente.nombre?.toLowerCase().includes(termino);
    const rubroMatch = cliente.rubro?.toLowerCase().includes(termino);
    
    return nombreMatch || rubroMatch;
  });

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
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl">Clientes</h2>
          <p className="text-sm text-slate-400 mt-1">
            {busqueda.trim() 
              ? `${clientesFiltrados.length} de ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`
              : `Total: ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`
            }
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
        >
          + Agregar Cliente
        </Link>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
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

