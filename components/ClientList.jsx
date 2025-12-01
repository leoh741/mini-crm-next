import Link from "next/link";
import { memo } from "react";

function ClientList({ clientes }) {
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
        <Link
          key={clienteId}
          href={`/clientes/${clienteId}`}
          prefetch={true}
          className="block p-4 border border-slate-700 rounded hover:bg-slate-800 transition"
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
                      {etiqueta}
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
        );
      })}
    </div>
  );
}

// Memoizar para evitar re-renders innecesarios
export default memo(ClientList);

