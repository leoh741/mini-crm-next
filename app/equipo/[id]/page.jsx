"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getMiembroById, actualizarMiembro, eliminarMiembro, agregarComentario, eliminarComentario, actualizarComentario, getMiembrosEquipo } from "../../../lib/equipoUtils";
import { getUsuarioActual } from "../../../lib/authUtils";
import { getTagColor, capitalizarEtiqueta, asignarColoresUnicos } from "../../../lib/tagColors";
import ProtectedRoute from "../../../components/ProtectedRoute";

function MiembroDetailPageContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;
  
  const [miembro, setMiembro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mostrarFormComentario, setMostrarFormComentario] = useState(false);
  const [editandoComentario, setEditandoComentario] = useState(null);
  const [comentarioEditando, setComentarioEditando] = useState({ texto: "", calificacion: "" });
  
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
  
  const [nuevoComentario, setNuevoComentario] = useState({
    texto: "",
    calificacion: ""
  });

  useEffect(() => {
    const cargarMiembro = async () => {
      try {
        setLoading(true);
        setError("");
        const miembroData = await getMiembroById(id, true);
        
        if (!miembroData) {
          setError("Miembro del equipo no encontrado");
          setLoading(false);
          return;
        }
        
        setMiembro(miembroData);
        setFormData({
          nombre: miembroData.nombre || "",
          cargo: miembroData.cargo || "",
          email: miembroData.email || "",
          telefono: miembroData.telefono || "",
          calificacion: miembroData.calificacion || "",
          activo: miembroData.activo !== undefined ? miembroData.activo : true
        });
        setHabilidades(miembroData.habilidades || []);
        
        // Cargar todas las habilidades para asignar colores
        const todosLosMiembros = await getMiembrosEquipo(false);
        if (todosLosMiembros && todosLosMiembros.length > 0) {
          const habilidades = todosLosMiembros
            .map(m => m.habilidades || [])
            .flat()
            .filter(Boolean);
          setTodasLasHabilidades(Array.from(new Set(habilidades)));
          asignarColoresUnicos(Array.from(new Set(habilidades)));
        }
      } catch (err) {
        console.error('Error al cargar miembro:', err);
        setError('Error al cargar el miembro del equipo');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      cargarMiembro();
    }
  }, [id]);

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

  const handleGuardar = async () => {
    setGuardando(true);
    setError("");

    try {
      const datos = {
        ...formData,
        calificacion: formData.calificacion ? parseFloat(formData.calificacion) : 0,
        habilidades: habilidades.map(h => h.trim().toLowerCase()).filter(h => h)
      };

      const resultado = await actualizarMiembro(id, datos, true);
      
      if (resultado) {
        setMiembro(resultado);
        setEditando(false);
        // Recargar datos
        const miembroData = await getMiembroById(id, true);
        if (miembroData) {
          setMiembro(miembroData);
          setFormData({
            nombre: miembroData.nombre || "",
            cargo: miembroData.cargo || "",
            email: miembroData.email || "",
            telefono: miembroData.telefono || "",
            calificacion: miembroData.calificacion || "",
            activo: miembroData.activo !== undefined ? miembroData.activo : true
          });
          setHabilidades(miembroData.habilidades || []);
        }
      } else {
        setError("Error al actualizar el miembro del equipo");
      }
    } catch (err) {
      console.error('Error al guardar:', err);
      setError(err.message || "Error al actualizar el miembro del equipo");
    } finally {
      setGuardando(false);
    }
  };

  const handleAgregarComentario = async () => {
    if (!nuevoComentario.texto.trim()) {
      alert("El comentario no puede estar vacío");
      return;
    }

    try {
      const usuario = getUsuarioActual();
      const comentario = {
        texto: nuevoComentario.texto,
        autor: usuario?.nombre || "Usuario",
        calificacion: nuevoComentario.calificacion ? parseFloat(nuevoComentario.calificacion) : undefined
      };

      const resultado = await agregarComentario(id, comentario);
      
      if (resultado) {
        setMiembro(resultado);
        setNuevoComentario({ texto: "", calificacion: "" });
        setMostrarFormComentario(false);
        // Recargar datos
        const miembroData = await getMiembroById(id, true);
        if (miembroData) {
          setMiembro(miembroData);
        }
      } else {
        alert("Error al agregar el comentario");
      }
    } catch (err) {
      console.error('Error al agregar comentario:', err);
      alert("Error al agregar el comentario");
    }
  };

  const handleEliminarComentario = async (index) => {
    if (!confirm("¿Estás seguro de eliminar este comentario?")) {
      return;
    }

    try {
      const resultado = await eliminarComentario(id, index);
      
      if (resultado) {
        setMiembro(resultado);
        // Recargar datos
        const miembroData = await getMiembroById(id, true);
        if (miembroData) {
          setMiembro(miembroData);
          setHabilidades(miembroData.habilidades || []);
        }
      } else {
        alert("Error al eliminar el comentario");
      }
    } catch (err) {
      console.error('Error al eliminar comentario:', err);
      alert("Error al eliminar el comentario");
    }
  };

  const handleEditarComentario = async (index, texto, calificacion) => {
    try {
      const resultado = await actualizarComentario(id, index, {
        texto,
        calificacion: calificacion ? parseFloat(calificacion) : undefined
      });
      
      if (resultado) {
        setMiembro(resultado);
        setEditandoComentario(null);
        // Recargar datos
        const miembroData = await getMiembroById(id, true);
        if (miembroData) {
          setMiembro(miembroData);
          setHabilidades(miembroData.habilidades || []);
        }
      } else {
        alert("Error al actualizar el comentario");
      }
    } catch (err) {
      console.error('Error al actualizar comentario:', err);
      alert("Error al actualizar el comentario");
    }
  };

  const handleEliminar = async () => {
    if (!confirm(`¿Estás seguro de eliminar a ${miembro.nombre}? Esta acción no se puede deshacer.`)) {
      return;
    }

    // Segunda confirmación
    if (!confirm(`⚠️ ÚLTIMA CONFIRMACIÓN ⚠️\n\nEstás a punto de eliminar permanentemente a ${miembro.nombre}.\n\n¿Confirmas que quieres proceder?`)) {
      return;
    }

    try {
      setGuardando(true);
      const resultado = await eliminarMiembro(id);
      
      if (resultado) {
        // Redirigir a la lista de equipo
        router.push('/equipo');
      } else {
        alert("Error al eliminar el miembro del equipo");
        setGuardando(false);
      }
    } catch (err) {
      console.error('Error al eliminar miembro:', err);
      alert("Error al eliminar el miembro del equipo: " + (err.message || "Error desconocido"));
      setGuardando(false);
    }
  };

  const formatearCalificacion = (calificacion) => {
    if (calificacion === undefined || calificacion === null) return "N/A";
    return calificacion.toFixed(1);
  };

  const getColorCalificacion = (calificacion) => {
    if (calificacion === undefined || calificacion === null) return "text-slate-400";
    if (calificacion >= 8) return "text-green-400";
    if (calificacion >= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const calcularCalificacionPromedio = () => {
    if (!miembro || !miembro.comentarios || miembro.comentarios.length === 0) {
      return miembro?.calificacion || 0;
    }
    const calificaciones = miembro.comentarios
      .map(c => c.calificacion)
      .filter(c => c !== undefined && c !== null);
    
    if (calificaciones.length === 0) {
      return miembro.calificacion || 0;
    }
    
    const suma = calificaciones.reduce((sum, c) => sum + c, 0);
    return suma / calificaciones.length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-300">Cargando miembro del equipo...</div>
      </div>
    );
  }

  if (error && !miembro) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
        <p className="text-red-200">{error}</p>
        <Link href="/equipo" className="mt-2 inline-block px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm">
          Volver al equipo
        </Link>
      </div>
    );
  }

  if (!miembro) {
    return null;
  }

  const calificacionPromedio = calcularCalificacionPromedio();

  return (
    <div>
      <div className="mb-6">
        <Link href="/equipo" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
          ← Volver al equipo
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">{miembro.nombre}</h2>
            {miembro.cargo && <p className="text-sm text-slate-400 mt-1">{miembro.cargo}</p>}
          </div>
          {!editando && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditando(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
              >
                Editar
              </button>
              <button
                onClick={handleEliminar}
                disabled={guardando}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
              >
                {guardando ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Información del miembro */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Información del Miembro</h3>
        
        {editando ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-300 mb-2">Cargo</label>
                <input
                  type="text"
                  name="cargo"
                  value={formData.cargo}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 break-all"
                  style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-300 mb-2">Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-300 mb-2">Calificación (0-10)</label>
                <input
                  type="number"
                  name="calificacion"
                  value={formData.calificacion}
                  onChange={handleChange}
                  min="0"
                  max="10"
                  step="0.1"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center min-w-0">
                <input
                  type="checkbox"
                  name="activo"
                  checked={formData.activo}
                  onChange={handleChange}
                  className="w-4 h-4 bg-slate-900 border-slate-700 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <label className="ml-2 text-sm font-medium text-slate-300">Miembro activo</label>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => {
                  setEditando(false);
                  setFormData({
                    nombre: miembro.nombre || "",
                    cargo: miembro.cargo || "",
                    email: miembro.email || "",
                    telefono: miembro.telefono || "",
                    calificacion: miembro.calificacion || "",
                    activo: miembro.activo !== undefined ? miembro.activo : true
                  });
                  setHabilidades(miembro.habilidades || []);
                }}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400">Nombre</p>
                <p className="text-slate-100">{miembro.nombre}</p>
              </div>
              {miembro.cargo && (
                <div>
                  <p className="text-sm text-slate-400">Cargo</p>
                  <p className="text-slate-100">{miembro.cargo}</p>
                </div>
              )}
              {miembro.email && (
                <div>
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="text-slate-100">{miembro.email}</p>
                </div>
              )}
              {miembro.telefono && (
                <div>
                  <p className="text-sm text-slate-400">Teléfono</p>
                  <p className="text-slate-100">{miembro.telefono}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-slate-400">Calificación Promedio</p>
                <p className={`text-lg font-semibold ${getColorCalificacion(calificacionPromedio)}`}>
                  {formatearCalificacion(calificacionPromedio)}/10
                </p>
              </div>
              {miembro.habilidades && miembro.habilidades.length > 0 && (
                <div className="col-span-2">
                  <p className="text-sm text-slate-400 mb-2">Habilidades</p>
                  <div className="flex flex-wrap gap-2">
                    {miembro.habilidades.map((habilidad, index) => {
                      const colorClass = getTagColor(habilidad, todasLasHabilidades);
                      return (
                        <span
                          key={index}
                          className={`px-3 py-1 rounded text-xs border ${colorClass}`}
                        >
                          {capitalizarEtiqueta(habilidad)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-slate-400">Estado</p>
                <p className={miembro.activo ? "text-green-400" : "text-red-400"}>
                  {miembro.activo ? "Activo" : "Inactivo"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comentarios */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Comentarios ({miembro.comentarios?.length || 0})</h3>
          {!mostrarFormComentario && (
            <button
              onClick={() => setMostrarFormComentario(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
            >
              + Agregar Comentario
            </button>
          )}
        </div>

        {mostrarFormComentario && (
          <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 className="text-sm font-semibold mb-3">Nuevo Comentario</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Comentario *</label>
                <textarea
                  value={nuevoComentario.texto}
                  onChange={(e) => setNuevoComentario({ ...nuevoComentario, texto: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  placeholder="Escribe tu comentario..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Calificación (0-10, opcional)</label>
                <input
                  type="number"
                  value={nuevoComentario.calificacion}
                  onChange={(e) => setNuevoComentario({ ...nuevoComentario, calificacion: e.target.value })}
                  min="0"
                  max="10"
                  step="0.1"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAgregarComentario}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
                >
                  Agregar
                </button>
                <button
                  onClick={() => {
                    setMostrarFormComentario(false);
                    setNuevoComentario({ texto: "", calificacion: "" });
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {miembro.comentarios && miembro.comentarios.length > 0 ? (
          <div className="space-y-4">
            {miembro.comentarios.map((comentario, index) => (
              <div key={index} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                {editandoComentario === index ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Comentario</label>
                      <textarea
                        value={comentarioEditando.texto}
                        onChange={(e) => setComentarioEditando({ ...comentarioEditando, texto: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Calificación (0-10)</label>
                      <input
                        type="number"
                        value={comentarioEditando.calificacion}
                        onChange={(e) => setComentarioEditando({ ...comentarioEditando, calificacion: e.target.value })}
                        min="0"
                        max="10"
                        step="0.1"
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          handleEditarComentario(
                            index,
                            comentarioEditando.texto,
                            comentarioEditando.calificacion
                          );
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => {
                          setEditandoComentario(null);
                          setComentarioEditando({ texto: "", calificacion: "" });
                        }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-slate-300">{comentario.autor}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(comentario.fecha).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      {comentario.calificacion !== undefined && comentario.calificacion !== null && (
                        <span className={`text-sm font-semibold ${getColorCalificacion(comentario.calificacion)}`}>
                          {formatearCalificacion(comentario.calificacion)}/10
                        </span>
                      )}
                    </div>
                    <p className="text-slate-200 mb-3 whitespace-pre-wrap">{comentario.texto}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditandoComentario(index);
                          setComentarioEditando({
                            texto: comentario.texto,
                            calificacion: comentario.calificacion !== undefined && comentario.calificacion !== null ? comentario.calificacion.toString() : ""
                          });
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleEliminarComentario(index)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-center py-4">No hay comentarios aún</p>
        )}
      </div>
    </div>
  );
}

export default function MiembroDetailPage() {
  return (
    <ProtectedRoute>
      <MiembroDetailPageContent />
    </ProtectedRoute>
  );
}

