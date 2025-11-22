import Link from "next/link";

export default function ClientList({ clientes }) {
  return (
    <div className="space-y-2">
      {clientes.map((cliente) => (
        <Link
          key={cliente.id}
          href={`/clientes/${cliente.id}`}
          className="block p-4 border border-slate-700 rounded hover:bg-slate-800 transition"
        >
          <h3 className="font-semibold">{cliente.nombre}</h3>
          {cliente.rubro && <p className="text-sm text-slate-400">{cliente.rubro}</p>}
        </Link>
      ))}
    </div>
  );
}

