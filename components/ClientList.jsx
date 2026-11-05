import Link from "next/link";
import { memo, useMemo } from "react";
import QuickTagManager from "./QuickTagManager";
import { getTagColor, asignarColoresUnicos } from "../lib/tagColors";

function ClientList({ clientes, todosLosClientes, onClientUpdate }) {
  // Capitalizar primera letra de una etiqueta
  const capitalizarEtiqueta = (etiqueta) => {
    if (!etiqueta) return '';
    return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
  };

  // Obtener todas las etiquetas de todos los clientes (usar todosLosClientes si está disponible, sino usar clientes)
  const clientesParaEtiquetas = todosLosClientes && todosLosClientes.length > 0 ? todosLosClientes : clientes;
  const todasLasEtiquetas = useMemo(() => {
    return clientesParaEtiquetas
      .map(c => c.etiquetas || [])
      .flat()
      .filter(Boolean);
  }, [clientesParaEtiquetas]);

  // Asignar colores únicos a todas las etiquetas
  useMemo(() => {
    if (todasLasEtiquetas.length > 0) {
      asignarColoresUnicos(todasLasEtiquetas);
    }
  }, [todasLasEtiquetas]);

  return (
    <div className="space-y-1">
      {clientes.map((cliente) => {
        const clienteId = cliente.id || cliente._id || cliente.crmId;
        return (
        <div
          key={clienteId}
          className="relative flex items-center border border-slate-700 rounded-md px-3 py-1.5 pr-10 hover:bg-slate-800 transition"
        >
          <Link
            href={`/clientes/${clienteId}`}
            prefetch={true}
            className="block min-w-0 flex-1"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-medium text-slate-100">{cliente.nombre}</h3>
              {cliente.rubro && (
                <span className="text-xs text-slate-400">{cliente.rubro}</span>
              )}
              {cliente.etiquetas && cliente.etiquetas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {cliente.etiquetas.slice(0, 5).map((etiqueta, etiquetaIndex) => (
                    <span
                      key={etiquetaIndex}
                      className={`px-1.5 py-0.5 rounded text-[11px] leading-none border ${getTagColor(etiqueta, todasLasEtiquetas)}`}
                    >
                      {capitalizarEtiqueta(etiqueta)}
                    </span>
                  ))}
                  {cliente.etiquetas.length > 5 && (
                    <span className="px-1.5 py-0.5 rounded text-[11px] leading-none border border-slate-700 text-slate-400">
                      +{cliente.etiquetas.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
          <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
            <QuickTagManager
              cliente={cliente}
              todasLasEtiquetas={todasLasEtiquetas}
              todosLosClientes={clientesParaEtiquetas}
              onUpdate={onClientUpdate}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

// Memoizar para evitar re-renders innecesarios
export default memo(ClientList);

