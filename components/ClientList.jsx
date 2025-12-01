import Link from "next/link";
import { memo } from "react";
import QuickTagManager from "./QuickTagManager";

function ClientList({ clientes, todosLosClientes, onClientUpdate }) {
  // Capitalizar primera letra de una etiqueta
  const capitalizarEtiqueta = (etiqueta) => {
    if (!etiqueta) return '';
    return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
  };

  // Obtener todas las etiquetas de todos los clientes (usar todosLosClientes si está disponible, sino usar clientes)
  const clientesParaEtiquetas = todosLosClientes && todosLosClientes.length > 0 ? todosLosClientes : clientes;
  const todasLasEtiquetas = clientesParaEtiquetas
    .map(c => c.etiquetas || [])
    .flat()
    .filter(Boolean);

  // Colores predefinidos para etiquetas
  const getTagColor = (tag, index) => {
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
    // Usar hash del tag para asignar color consistente
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="space-y-2">
      {clientes.map((cliente) => {
        const clienteId = cliente.id || cliente._id || cliente.crmId;
        return (
        <div
          key={clienteId}
          className="relative p-4 pr-12 border border-slate-700 rounded hover:bg-slate-800 transition"
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
                        className={`px-2 py-0.5 rounded text-xs border ${getTagColor(etiqueta, index)}`}
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
          <div className="absolute top-2 right-2 z-10">
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

