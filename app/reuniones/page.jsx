"use client";

import { useState, useEffect, useMemo } from "react";
import { getReuniones, crearReunion, eliminarReunion, actualizarReunion } from "../../lib/reunionesUtils";
import ProtectedRoute from "../../components/ProtectedRoute";

function ReunionesPageContent() {
  const [reuniones, setReuniones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [reunionEditando, setReunionEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(null);

  const [formData, setFormData] = useState({
    titulo: "",
    fecha: "",
    hora: "",
    tipo: "meet",
    cliente: { nombre: "" },
    linkMeet: "",
    observaciones: "",
    asignados: []
  });
  const [nuevoAsignado, setNuevoAsignado] = useState("");

  useEffect(() => {
    cargarReuniones();
  }, []);

  const cargarReuniones = async () => {
    try {
      setLoading(true);
      setError("");
      const datos = await getReuniones(null, null, false, false);
      setReuniones(datos);
    } catch (err) {
      console.error('Error al cargar reuniones:', err);
      setError("Error al cargar las reuniones.");
    } finally {
      setLoading(false);
    }
  };

  const reunionesFiltradas = useMemo(() => {
    let filtradas = [...reuniones]; // No filtrar completadas por defecto para poder verlas

    if (fechaFiltro) {
      const fechaFiltroDate = new Date(fechaFiltro);
      filtradas = filtradas.filter(r => {
        const fechaReunion = new Date(r.fecha);
        return fechaReunion.toDateString() === fechaFiltroDate.toDateString();
      });
    }

    if (tipoFiltro !== "todos") {
      filtradas = filtradas.filter(r => r.tipo === tipoFiltro);
    }

    return filtradas.sort((a, b) => {
      const fechaA = new Date(a.fecha);
      const fechaB = new Date(b.fecha);
      if (fechaA.getTime() !== fechaB.getTime()) return fechaA - fechaB;
      const horaA = a.hora.split(':').map(Number);
      const horaB = b.hora.split(':').map(Number);
      return (horaA[0] * 60 + horaA[1]) - (horaB[0] * 60 + horaB[1]);
    });
  }, [reuniones, fechaFiltro, tipoFiltro]);

  const toggleCompletada = async (reunion) => {
    try {
      await actualizarReunion(reunion.reunionId, { completada: !reunion.completada });
      await cargarReuniones();
    } catch (err) {
      setError(err.message || "Error al actualizar estado");
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
  };

  const abrirFormulario = () => {
    const hoy = new Date().toISOString().split('T')[0];
    setFormData({
      titulo: "",
      fecha: hoy,
      hora: "",
      tipo: "meet",
      cliente: { nombre: "" },
      linkMeet: "",
      observaciones: "",
      asignados: []
    });
    setNuevoAsignado("");
    setReunionEditando(null);
    setMostrarFormulario(true);
  };

  const abrirEdicion = (reunion) => {
    setReunionEditando(reunion);
    setFormData({
      titulo: reunion.titulo || "",
      fecha: new Date(reunion.fecha).toISOString().split('T')[0],
      hora: reunion.hora || "",
      tipo: reunion.tipo || "meet",
      cliente: reunion.cliente || { nombre: "" },
      linkMeet: reunion.linkMeet || "",
      observaciones: reunion.observaciones || "",
      asignados: reunion.asignados || []
    });
    setNuevoAsignado("");
    setMostrarFormulario(true);
  };

  const agregarAsignado = () => {
    if (nuevoAsignado.trim() && !formData.asignados.includes(nuevoAsignado.trim())) {
      setFormData({ ...formData, asignados: [...formData.asignados, nuevoAsignado.trim()] });
      setNuevoAsignado("");
    }
  };

  const eliminarAsignado = (asignado) => {
    setFormData({ ...formData, asignados: formData.asignados.filter(a => a !== asignado) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.titulo.trim() || !formData.fecha || !formData.hora) {
      setError("Todos los campos requeridos deben completarse");
      return;
    }

    try {
      setGuardando(true);
      setError("");
      
      // Asegurarse de que todos los campos requeridos estén presentes
      if (!formData.titulo || !formData.fecha || !formData.hora || !formData.tipo) {
        setError("Todos los campos requeridos deben completarse");
        setGuardando(false);
        return;
      }
      
      // Construir objeto con todos los campos requeridos
      const reunionData = {
        titulo: String(formData.titulo || '').trim(),
        fecha: String(formData.fecha || ''),
        hora: String(formData.hora || '').trim(),
        tipo: String(formData.tipo || 'meet'),
      };
      
      // Validar que los campos requeridos no estén vacíos
      if (!reunionData.titulo || !reunionData.fecha || !reunionData.hora || !reunionData.tipo) {
        setError("Todos los campos requeridos deben completarse");
        setGuardando(false);
        return;
      }
      
      // Agregar campos opcionales solo si tienen valor
      if (formData.cliente?.nombre && formData.cliente.nombre.trim()) {
        reunionData.cliente = {
          nombre: String(formData.cliente.nombre).trim(),
          ...(formData.cliente.crmId && { crmId: String(formData.cliente.crmId).trim() })
        };
      }
      
      if (formData.linkMeet && formData.linkMeet.trim()) {
        reunionData.linkMeet = String(formData.linkMeet).trim();
      }
      
      if (formData.observaciones && formData.observaciones.trim()) {
        reunionData.observaciones = String(formData.observaciones).trim();
      }
      
      if (formData.asignados && Array.isArray(formData.asignados) && formData.asignados.length > 0) {
        reunionData.asignados = formData.asignados
          .filter(a => a && String(a).trim())
          .map(a => String(a).trim());
      }

      if (reunionEditando) {
        await actualizarReunion(reunionEditando.reunionId, reunionData);
      } else {
        await crearReunion(reunionData);
      }
      await cargarReuniones();
      setMostrarFormulario(false);
      setReunionEditando(null);
    } catch (err) {
      setError(err.message || "Error al guardar la reunión");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!mostrarConfirmacion) return;
    try {
      setGuardando(true);
      await eliminarReunion(mostrarConfirmacion);
      await cargarReuniones();
      setMostrarConfirmacion(null);
    } catch (err) {
      setError(err.message || "Error al eliminar");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-300">Cargando reuniones...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Reuniones</h1>
        <button onClick={abrirFormulario} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">
          + Nueva Reunión
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="filtro-fecha-reuniones" className="block text-sm font-medium text-slate-300 mb-1">
            Filtrar por fecha
          </label>
          <input
            id="filtro-fecha-reuniones"
            name="filtroFecha"
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            placeholder="Seleccionar fecha"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm w-full"
            style={{ 
              color: '#f1f5f9 !important',
              fontSize: '14px',
              fontWeight: '400',
              WebkitAppearance: 'none',
              MozAppearance: 'textfield'
            }}
          />
          {!fechaFiltro && (
            <p className="text-xs text-slate-400 mt-1">Selecciona una fecha para filtrar</p>
          )}
        </div>
        <div>
          <label htmlFor="filtro-tipo-reuniones" className="block text-sm font-medium text-slate-300 mb-1">
            Filtrar por tipo
          </label>
          <select
            id="filtro-tipo-reuniones"
            name="filtroTipo"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm w-full"
            style={{ 
              color: '#f1f5f9 !important',
              WebkitAppearance: 'menulist',
              MozAppearance: 'menulist',
              appearance: 'menulist',
              fontSize: '14px',
              fontWeight: '400'
            }}
          >
            <option value="todos" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Todos los tipos</option>
            <option value="meet" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Meet</option>
            <option value="oficina" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Presencial</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {reunionesFiltradas.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No hay reuniones programadas</p>
        ) : (
          reunionesFiltradas.map((reunion) => {
            const fechaReunion = new Date(reunion.fecha);
            const esHoy = fechaReunion.toDateString() === new Date().toDateString();
            return (
              <div key={reunion.reunionId} className={`p-4 rounded-lg border ${reunion.completada ? 'bg-slate-800/50 border-slate-700 opacity-60' : esHoy ? 'bg-blue-900/20 border-blue-700' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className={`font-semibold ${reunion.completada ? 'line-through text-slate-400' : ''}`}>{reunion.titulo}</h3>
                      <span className={`px-2 py-1 rounded text-xs border ${reunion.tipo === 'meet' ? 'bg-blue-900/30 text-blue-400 border-blue-700' : 'bg-green-900/30 text-green-400 border-green-700'}`}>
                        {reunion.tipo === 'meet' ? '📹 Meet' : '🏢 Presencial'}
                      </span>
                      {reunion.completada && <span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 border border-green-700">✓ Completada</span>}
                    </div>
                    <p className="text-sm text-slate-300">📅 {formatearFecha(reunion.fecha)} a las {reunion.hora}</p>
                    {reunion.cliente?.nombre && <p className="text-sm text-slate-300">👤 {reunion.cliente.nombre}</p>}
                    {reunion.linkMeet && <p className="text-sm"><a href={reunion.linkMeet} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">🔗 Link Meet</a></p>}
                    {reunion.observaciones && <p className="text-sm text-slate-400 mt-1">📝 {reunion.observaciones}</p>}
                    {reunion.asignados?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-xs text-slate-400 mr-1">👤 Asignados:</span>
                        {reunion.asignados.map((asignado, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-700">{asignado}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {!reunion.completada && (
                      <button 
                        onClick={() => toggleCompletada(reunion)} 
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors duration-200"
                      >
                        ✓ Completar
                      </button>
                    )}
                    <button 
                      onClick={() => abrirEdicion(reunion)} 
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors duration-200"
                    >
                      ✏️ Editar
                    </button>
                    <button 
                      onClick={() => setMostrarConfirmacion(reunion.reunionId)} 
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-medium transition-colors duration-200"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">{reunionEditando ? 'Editar Reunión' : 'Nueva Reunión'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reunion-titulo" className="block text-sm font-medium mb-1">Título *</label>
                  <input id="reunion-titulo" name="titulo" type="text" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reunion-fecha" className="block text-sm font-medium mb-1">Fecha *</label>
                    <input id="reunion-fecha" name="fecha" type="date" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" required />
                  </div>
                  <div>
                    <label htmlFor="reunion-hora" className="block text-sm font-medium mb-1">Hora *</label>
                    <input id="reunion-hora" name="hora" type="time" value={formData.hora} onChange={(e) => setFormData({ ...formData, hora: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" required />
                  </div>
                </div>
                <div>
                  <label htmlFor="reunion-tipo" className="block text-sm font-medium mb-1">Tipo *</label>
                  <select id="reunion-tipo" name="tipo" value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" required>
                    <option value="meet">📹 Meet</option>
                    <option value="oficina">🏢 Presencial</option>
                  </select>
                </div>
                {formData.tipo === 'meet' && (
                  <div>
                    <label htmlFor="reunion-link-meet" className="block text-sm font-medium mb-1">Link de Meet</label>
                    <input id="reunion-link-meet" name="linkMeet" type="url" value={formData.linkMeet} onChange={(e) => setFormData({ ...formData, linkMeet: e.target.value })} placeholder="https://meet.google.com/..." className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" />
                  </div>
                )}
                <div>
                  <label htmlFor="reunion-cliente" className="block text-sm font-medium mb-1">Cliente (opcional)</label>
                  <input id="reunion-cliente" name="cliente" type="text" value={formData.cliente?.nombre || ""} onChange={(e) => setFormData({ ...formData, cliente: { nombre: e.target.value } })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" />
                </div>
                <div>
                  <label htmlFor="reunion-observaciones" className="block text-sm font-medium mb-1">Observaciones</label>
                  <textarea id="reunion-observaciones" name="observaciones" value={formData.observaciones} onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })} rows={3} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 resize-none" />
                </div>
                <div>
                  <label htmlFor="reunion-asignados" className="block text-sm font-medium mb-1">Asignados</label>
                  <div className="flex gap-2 mb-2">
                    <input 
                      id="reunion-asignados" 
                      name="asignados" 
                      type="text" 
                      value={nuevoAsignado} 
                      onChange={(e) => setNuevoAsignado(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAsignado())}
                      placeholder="Nombre de la persona"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" 
                    />
                    <button 
                      type="button"
                      onClick={agregarAsignado}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
                    >
                      Agregar
                    </button>
                  </div>
                  {formData.asignados.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.asignados.map((asignado, i) => (
                        <span key={i} className="px-2 py-1 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-700 flex items-center gap-1">
                          {asignado}
                          <button 
                            type="button"
                            onClick={() => eliminarAsignado(asignado)}
                            className="text-purple-300 hover:text-purple-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => { setMostrarFormulario(false); setReunionEditando(null); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm" disabled={guardando}>Cancelar</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50" disabled={guardando}>{guardando ? 'Guardando...' : reunionEditando ? 'Actualizar' : 'Crear'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {mostrarConfirmacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg border border-red-700 p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-red-400 mb-2">Confirmar eliminación</h3>
            <p className="text-slate-300 mb-4">¿Estás seguro de que deseas eliminar esta reunión?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setMostrarConfirmacion(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm" disabled={guardando}>Cancelar</button>
              <button onClick={handleEliminar} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm disabled:opacity-50" disabled={guardando}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReunionesPage() {
  return (
    <ProtectedRoute>
      <ReunionesPageContent />
    </ProtectedRoute>
  );
}

