"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { crearMiembro, getMiembrosEquipo } from "../../../lib/equipoUtils";
import { getTagColor, capitalizarEtiqueta, asignarColoresUnicos } from "../../../lib/tagColors";
import ProtectedRoute from "../../../components/ProtectedRoute";

function NuevoMiembroPageContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    nombre: "",
    cargo: "",
    email: "",
    telefono: "",
    calificacion: "",
    activo: true
  });
  const [habilidades, setHabilidades] = useState([]);
  const [nuevaHabilidad, setNuevaHabilidad] = useState("");
  const [todasLasHabilidades, setTodasLasHabilidades] = useState([]);

  // Cargar todas las habilidades para asignar colores únicos
  useEffect(() => {
    const cargarHabilidades = async () => {
      try {
        const miembros = await getMiembrosEquipo(false);
        if (miembros && miembros.length > 0) {
          const habilidades = miembros
            .map(m => m.habilidades || [])
            .flat()
            .filter(Boolean);
          setTodasLasHabilidades(Array.from(new Set(habilidades)));
          asignarColoresUnicos(Array.from(new Set(habilidades)));
        }
      } catch (err) {
        console.error('Error al cargar habilidades:', err);
      }
    };
    cargarHabilidades();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const agregarHabilidad = () => {
    const habilidad = nuevaHabilidad.trim().toLowerCase();
    if (habilidad && !habilidades.includes(habilidad)) {
      setHabilidades([...habilidades, habilidad]);
      setNuevaHabilidad("");
    }
  };

  const eliminarHabilidad = (index) => {
    setHabilidades(habilidades.filter((_, i) => i !== index));
  };

  const handleNuevaHabilidadKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarHabilidad();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validar campos requeridos
      if (!formData.nombre.trim()) {
        setError("El nombre es requerido");
        setLoading(false);
        return;
      }

      // Limpiar y preparar datos antes de enviar
      const datos = {
        nombre: formData.nombre.trim(),
        habilidades: habilidades.map(h => h.trim().toLowerCase()).filter(h => h)
      };
      
      // Solo agregar campos si tienen valor
      if (formData.cargo && formData.cargo.trim()) {
        datos.cargo = formData.cargo.trim();
      }
      if (formData.email && formData.email.trim()) {
        datos.email = formData.email.trim();
      }
      if (formData.telefono && formData.telefono.trim()) {
        datos.telefono = formData.telefono.trim();
      }
      if (formData.calificacion && formData.calificacion !== '') {
        datos.calificacion = parseFloat(formData.calificacion);
      }
      if (formData.activo !== undefined) {
        datos.activo = formData.activo;
      }

      console.log('[Nuevo Miembro] Datos a enviar:', JSON.stringify(datos, null, 2));

      const resultado = await crearMiembro(datos);
      
      if (resultado) {
        router.push(`/equipo/${resultado._id || resultado.id || resultado.crmId}`);
      } else {
        setError("Error al crear el miembro del equipo");
      }
    } catch (err) {
      console.error('Error al crear miembro:', err);
      setError(err.message || "Error al crear el miembro del equipo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl md:text-2xl font-bold">Nuevo Miembro del Equipo</h2>
        <p className="text-sm text-slate-400 mt-1">Agrega un nuevo miembro al equipo</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-300 mb-2">
              Nombre *
            </label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="cargo" className="block text-sm font-medium text-slate-300 mb-2">
              Cargo
            </label>
            <input
              type="text"
              id="cargo"
              name="cargo"
              value={formData.cargo}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="telefono" className="block text-sm font-medium text-slate-300 mb-2">
              Teléfono
            </label>
            <input
              type="text"
              id="telefono"
              name="telefono"
              value={formData.telefono}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="calificacion" className="block text-sm font-medium text-slate-300 mb-2">
              Calificación Inicial (0-10)
            </label>
            <input
              type="number"
              id="calificacion"
              name="calificacion"
              value={formData.calificacion}
              onChange={handleChange}
              min="0"
              max="10"
              step="0.1"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="activo"
              name="activo"
              checked={formData.activo}
              onChange={handleChange}
              className="w-4 h-4 bg-slate-800 border-slate-700 rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="activo" className="ml-2 text-sm font-medium text-slate-300">
              Miembro activo
            </label>
          </div>
        </div>

        {/* Campo de Habilidades */}
        <div>
          <label htmlFor="habilidades" className="block text-sm font-medium text-slate-300 mb-2">
            Habilidades
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {habilidades.map((habilidad, index) => {
              const colorClass = getTagColor(habilidad, todasLasHabilidades);
              return (
                <span key={index} className={`px-3 py-1 rounded text-xs border ${colorClass} flex items-center gap-2`}>
                  {capitalizarEtiqueta(habilidad)}
                  <button
                    type="button"
                    onClick={() => eliminarHabilidad(index)}
                    className="hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              id="nuevaHabilidad"
              value={nuevaHabilidad}
              onChange={(e) => setNuevaHabilidad(e.target.value)}
              onKeyDown={handleNuevaHabilidadKeyDown}
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
              placeholder="Escribe una habilidad y presiona Enter"
            />
            <button
              type="button"
              onClick={agregarHabilidad}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
            >
              Agregar
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Presiona Enter o el botón "Agregar" para añadir habilidades.</p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
          >
            {loading ? "Guardando..." : "Crear Miembro"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NuevoMiembroPage() {
  return (
    <ProtectedRoute>
      <NuevoMiembroPageContent />
    </ProtectedRoute>
  );
}

