import Link from "next/link";
import { memo, useState, useMemo } from "react";
import QuickTagManager from "./QuickTagManager";
import { getTagColor, asignarColoresUnicos } from "../lib/tagColors";

function ClientList({ clientes, todosLosClientes, onClientUpdate }) {
  const [panelAbiertoIndex, setPanelAbiertoIndex] = useState(null);
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
    <div className="space-y-2">
      {clientes.map((cliente, index) => {
        const clienteId = cliente.id || cliente._id || cliente.crmId;
        const esPanelAbierto = panelAbiertoIndex === index;
        const esSiguienteCliente = panelAbiertoIndex !== null && (index === panelAbiertoIndex + 1 || index === panelAbiertoIndex + 2);
        return (
        <div
          key={clienteId}
          className="relative p-4 pr-12 sm:pr-12 border border-slate-700 rounded hover:bg-slate-800 transition"
          style={{ overflow: 'visible', zIndex: esPanelAbierto ? 10 : 1 }}
        >
          <Link
            href={`/clientes/${clienteId}`}
            prefetch={true}
            className="block"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{cliente.nombre}</h3>
                {cliente.rubro && <p className="text-sm text-slate-400 mt-1">{cliente.rubro}</p>}
                {cliente.etiquetas && cliente.etiquetas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cliente.etiquetas.slice(0, 5).map((etiqueta, index) => (
                      <span
                        key={index}
                        className={`px-2 py-0.5 rounded text-xs border ${getTagColor(etiqueta, todasLasEtiquetas)}`}
                      >
                        {capitalizarEtiqueta(etiqueta)}
                      </span>
                    ))}
                    {cliente.etiquetas.length > 5 && (
                      <span className="px-2 py-0.5 rounded text-xs border border-slate-700 text-slate-400">
                        +{cliente.etiquetas.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Link>
          <div className={`absolute top-2 right-2 z-10 ${esSiguienteCliente && !esPanelAbierto ? 'opacity-0 pointer-events-none' : ''}`}>
            <QuickTagManager
              cliente={cliente}
              todasLasEtiquetas={todasLasEtiquetas}
              todosLosClientes={clientesParaEtiquetas}
              onUpdate={onClientUpdate}
              onPanelToggle={(abierto) => {
                setPanelAbiertoIndex(abierto ? index : null);
              }}
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

