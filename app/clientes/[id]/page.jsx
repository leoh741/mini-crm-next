"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getClienteById, eliminarCliente } from "../../../lib/clientesUtils";
import { getTotalCliente } from "../../../lib/clienteHelpers";
import { generarResumenPagoPDF } from "../../../lib/pdfGenerator";
import Link from "next/link";
import ProtectedRoute from "../../../components/ProtectedRoute";

function ClienteDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  const [cliente, setCliente] = useState(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const fromPagos = searchParams.get('from') === 'pagos';

  useEffect(() => {
    const cargarCliente = async () => {
      try {
        setLoading(true);
        // Limpiar caché y obtener datos frescos
        const { limpiarCacheClientes } = await import('../../../lib/clientesUtils');
        limpiarCacheClientes();
        // Obtener sin caché para asegurar datos actualizados
        const clienteData = await getClienteById(id, false);
        if (clienteData) {
          setCliente(clienteData);
          setError("");
        } else {
          setError("Cliente no encontrado");
        }
      } catch (err) {
        console.error('Error al cargar cliente:', err);
        setError('Error al cargar el cliente. Por favor, intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    };
    cargarCliente();
  }, [id, searchParams]);

  const handleEliminar = async () => {
    setEliminando(true);
    const resultado = await eliminarCliente(id);
    
    if (resultado) {
      router.push(fromPagos ? "/pagos" : "/clientes");
    } else {
      alert("Error al eliminar el cliente. Por favor, intenta nuevamente.");
      setEliminando(false);
      setMostrarConfirmacion(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando cliente...</div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div>
        <p className="text-red-400 mb-4">{error || "Cliente no encontrado."}</p>
        <Link href={fromPagos ? "/pagos" : "/clientes"} className="text-blue-400 hover:text-blue-300">
          ← Volver
        </Link>
      </div>
    );
  }

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(monto);
  };

  return (
    <div>
      <Link href={fromPagos ? "/pagos" : "/clientes"} className="text-sm text-slate-400 hover:text-slate-200">
        ← Volver {fromPagos ? "a Pagos" : "a Clientes"}
      </Link>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-semibold break-words pr-2">{cliente.nombre}</h2>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              onClick={() => generarResumenPagoPDF(cliente)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              📄 PDF
            </button>
            <Link
              href={`/clientes/${id}/editar`}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap text-center"
            >
              ✏️ Editar
            </Link>
            <button
              onClick={() => setMostrarConfirmacion(true)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              🗑️ Eliminar
            </button>
          </div>
        </div>

        {mostrarConfirmacion && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400 font-medium mb-2">
              ¿Estás seguro de que deseas eliminar a "{cliente.nombre}"?
            </p>
            <p className="text-sm text-slate-400 mb-4">
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEliminar}
                disabled={eliminando}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                onClick={() => {
                  setMostrarConfirmacion(false);
                  setEliminando(false);
                }}
                disabled={eliminando}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          {cliente.rubro && (
            <p><strong className="text-slate-300">Rubro:</strong> <span className="text-slate-200">{cliente.rubro}</span></p>
          )}
          {cliente.ciudad && (
            <p><strong className="text-slate-300">Ciudad:</strong> <span className="text-slate-200">{cliente.ciudad}</span></p>
          )}
          {cliente.email && (
            <p><strong className="text-slate-300">Email:</strong> <span className="text-slate-200">{cliente.email}</span></p>
          )}
          <div>
            <p className="text-slate-300 font-medium mb-2">Servicios:</p>
            {cliente.servicios && Array.isArray(cliente.servicios) && cliente.servicios.length > 0 ? (
              <div className="space-y-2">
                {cliente.servicios.map((servicio, index) => (
                  <div key={index} className="p-2 bg-slate-700 rounded flex justify-between items-center">
                    <span className="text-slate-200">{servicio.nombre}</span>
                    <span className="text-slate-200 font-semibold">{formatearMoneda(servicio.precio)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-600 flex justify-between items-center">
                  <span className="text-slate-300 font-semibold">Total:</span>
                  <span className="text-slate-100 font-bold text-lg">{formatearMoneda(getTotalCliente(cliente))}</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Sin servicios cargados</p>
            )}
          </div>
          {cliente.pagoUnico ? (
            <p><strong className="text-slate-300">Tipo de Pago:</strong> 
              <span className="ml-2 px-2 py-1 rounded text-xs font-medium bg-purple-900/30 text-purple-400 border border-purple-700">
                Pago Único
              </span>
            </p>
          ) : (
            <div>
              <p><strong className="text-slate-300">Fecha de Pago:</strong> 
                <span className="text-slate-200">
                  {cliente.pagoMesSiguiente 
                    ? ` Día ${cliente.fechaPago} del mes siguiente`
                    : ` Día ${cliente.fechaPago} de cada mes`
                  }
                </span>
              </p>
              {cliente.pagoMesSiguiente && (
                <p className="text-xs text-slate-400 mt-1">
                  El pago corresponde al mes siguiente, no aparecerá como vencido
                </p>
              )}
            </div>
          )}
          <p><strong className="text-slate-300">Estado:</strong> 
            <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
              cliente.pagado 
                ? "bg-green-900/30 text-green-400 border border-green-700" 
                : "bg-orange-900/30 text-orange-400 border border-orange-700"
            }`}>
              {cliente.pagado ? "Pagado" : "Pendiente"}
            </span>
          </p>
          {cliente.observaciones && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-slate-300 font-medium mb-2">Observaciones:</p>
              <p className="text-slate-200 whitespace-pre-wrap">{cliente.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClienteDetailPage() {
  return (
    <ProtectedRoute>
      <ClienteDetailPageContent />
    </ProtectedRoute>
  );
}

