"use client";

import { useState, useEffect, useMemo } from "react";
import { getTareas, crearTarea, eliminarTarea, actualizarTarea } from "../../lib/tareasUtils";
import ProtectedRoute from "../../components/ProtectedRoute";

function TareasPageContent() {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [tareaEditando, setTareaEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(null);

  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    fechaVencimiento: "",
    prioridad: "media",
    cliente: { nombre: "" },
    etiquetas: [],
    asignados: []
  });
  const [nuevoAsignado, setNuevoAsignado] = useState("");

  useEffect(() => {
    cargarTareas();
  }, []);

  const cargarTareas = async () => {
    try {
      setLoading(true);
      setError("");
      const datos = await getTareas(null, null, null, false, false);
      setTareas(datos);
    } catch (err) {
      console.error('Error al cargar tareas:', err);
      setError("Error al cargar las tareas.");
    } finally {
      setLoading(false);
    }
  };

  const tareasFiltradas = useMemo(() => {
    let filtradas = tareas;

    // Filtrar por estado
    if (filtroEstado === "pendientes") {
      filtradas = filtradas.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada');
    } else if (filtroEstado !== "todos") {
      filtradas = filtradas.filter(t => t.estado === filtroEstado);
    }

    // Filtrar por fecha de vencimiento
    if (fechaFiltro) {
      const fechaFiltroDate = new Date(fechaFiltro);
      filtradas = filtradas.filter(t => {
        if (!t.fechaVencimiento) return false;
        const fechaVenc = new Date(t.fechaVencimiento);
        return fechaVenc.toDateString() === fechaFiltroDate.toDateString();
      });
    }

    // Filtrar por búsqueda (palabra clave)
    if (busqueda.trim()) {
      const busquedaLower = busqueda.toLowerCase().trim();
      filtradas = filtradas.filter(t => {
        // Buscar en título
        if (t.titulo?.toLowerCase().includes(busquedaLower)) return true;
        // Buscar en descripción
        if (t.descripcion?.toLowerCase().includes(busquedaLower)) return true;
        // Buscar en nombre del cliente
        if (t.cliente?.nombre?.toLowerCase().includes(busquedaLower)) return true;
        // Buscar en asignados
        if (t.asignados?.some(asignado => asignado.toLowerCase().includes(busquedaLower))) return true;
        // Buscar en etiquetas
        if (t.etiquetas?.some(etiqueta => etiqueta.toLowerCase().includes(busquedaLower))) return true;
        return false;
      });
    }

    return filtradas.sort((a, b) => {
      // Priorizar tareas en progreso primero
      const estadoOrder = { en_progreso: 3, pendiente: 2, completada: 1, cancelada: 0 };
      if (estadoOrder[a.estado] !== estadoOrder[b.estado]) {
        return estadoOrder[b.estado] - estadoOrder[a.estado];
      }
      // Luego por prioridad
      const prioridadOrder = { urgente: 4, alta: 3, media: 2, baja: 1 };
      if (prioridadOrder[a.prioridad] !== prioridadOrder[b.prioridad]) {
        return prioridadOrder[b.prioridad] - prioridadOrder[a.prioridad];
      }
      // Luego por fecha de vencimiento
      if (a.fechaVencimiento && b.fechaVencimiento) {
        return new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento);
      }
      // Finalmente por fecha de creación
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [tareas, filtroEstado, fechaFiltro, busqueda]);

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getPrioridadColor = (prioridad) => {
    const colores = {
      urgente: 'bg-red-900/30 text-red-400 border-red-700',
      alta: 'bg-orange-900/30 text-orange-400 border-orange-700',
      media: 'bg-yellow-900/30 text-yellow-400 border-yellow-700',
      baja: 'bg-green-900/30 text-green-400 border-green-700'
    };
    return colores[prioridad] || colores.media;
  };

  const abrirFormulario = () => {
    setFormData({
      titulo: "",
      descripcion: "",
      fechaVencimiento: "",
      prioridad: "media",
      cliente: { nombre: "" },
      etiquetas: [],
      asignados: []
    });
    setNuevoAsignado("");
    setTareaEditando(null);
    setMostrarFormulario(true);
  };

  const abrirEdicion = (tarea) => {
    setTareaEditando(tarea);
    setFormData({
      titulo: tarea.titulo || "",
      descripcion: tarea.descripcion || "",
      fechaVencimiento: tarea.fechaVencimiento ? new Date(tarea.fechaVencimiento).toISOString().split('T')[0] : "",
      prioridad: tarea.prioridad || "media",
      cliente: tarea.cliente || { nombre: "" },
      etiquetas: tarea.etiquetas || [],
      asignados: tarea.asignados || []
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
    if (!formData.titulo.trim()) {
      setError("El título es requerido");
      return;
    }

    try {
      setGuardando(true);
      setError("");
      
      // Asegurarse de que el título esté presente
      if (!formData.titulo || !formData.titulo.trim()) {
        setError("El título es requerido");
        setGuardando(false);
        return;
      }
      
      // Construir objeto con todos los campos requeridos
      const tareaData = {
        titulo: String(formData.titulo || '').trim(),
        prioridad: String(formData.prioridad || 'media'),
        estado: String(formData.estado || 'pendiente'),
      };
      
      // Validar que el título no esté vacío
      if (!tareaData.titulo) {
        setError("El título es requerido");
        setGuardando(false);
        return;
      }
      
      // Agregar campos opcionales solo si tienen valor
      if (formData.descripcion && formData.descripcion.trim()) {
        tareaData.descripcion = String(formData.descripcion).trim();
      }
      
      if (formData.fechaVencimiento && formData.fechaVencimiento.trim()) {
        tareaData.fechaVencimiento = String(formData.fechaVencimiento);
      }
      
      if (formData.cliente?.nombre && formData.cliente.nombre.trim()) {
        tareaData.cliente = {
          nombre: String(formData.cliente.nombre).trim(),
          ...(formData.cliente.crmId && { crmId: String(formData.cliente.crmId).trim() })
        };
      }
      
      if (formData.etiquetas && Array.isArray(formData.etiquetas) && formData.etiquetas.length > 0) {
        tareaData.etiquetas = formData.etiquetas
          .filter(et => et && String(et).trim())
          .map(et => String(et).trim());
      }
      
      if (formData.asignados && Array.isArray(formData.asignados) && formData.asignados.length > 0) {
        tareaData.asignados = formData.asignados
          .filter(a => a && String(a).trim())
          .map(a => String(a).trim());
      }

      if (tareaEditando) {
        await actualizarTarea(tareaEditando.tareaId, tareaData);
      } else {
        await crearTarea(tareaData);
      }
      await cargarTareas();
      setMostrarFormulario(false);
      setTareaEditando(null);
    } catch (err) {
      setError(err.message || "Error al guardar la tarea");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!mostrarConfirmacion) return;
    try {
      setGuardando(true);
      await eliminarTarea(mostrarConfirmacion);
      await cargarTareas();
      setMostrarConfirmacion(null);
    } catch (err) {
      setError(err.message || "Error al eliminar");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (tarea, nuevoEstado) => {
    try {
      await actualizarTarea(tarea.tareaId, { estado: nuevoEstado });
      await cargarTareas();
    } catch (err) {
      setError(err.message || "Error al actualizar estado");
    }
  };

  const toggleCompletar = async (tarea) => {
    const nuevoEstado = tarea.estado === 'completada' ? 'pendiente' : 'completada';
    await cambiarEstado(tarea, nuevoEstado);
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-300">Cargando tareas...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Tareas</h1>
        <button onClick={abrirFormulario} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">
          + Nueva Tarea
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="busqueda-tareas" className="block text-sm font-medium text-slate-300 mb-1">
            Buscar
          </label>
          <input
            id="busqueda-tareas"
            name="busqueda"
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por palabra clave"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm"
          />
        </div>
        <div>
          <label htmlFor="filtro-fecha-tareas" className="block text-sm font-medium text-slate-300 mb-1">
            Filtrar por fecha de vencimiento
          </label>
          <div className="relative">
            <input
              id="filtro-fecha-tareas"
              name="filtroFecha"
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm w-full"
              style={{ 
                color: fechaFiltro ? '#f1f5f9' : 'transparent',
                fontSize: '14px',
                fontWeight: '400',
                WebkitAppearance: 'none',
                MozAppearance: 'textfield'
              }}
            />
            {!fechaFiltro && (
              <div 
                className="absolute inset-0 px-3 py-2 pointer-events-none flex items-center text-slate-400 text-sm"
                style={{ 
                  color: '#94a3b8',
                  fontSize: '14px'
                }}
              >
                dd/mm/aaaa
              </div>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="filtro-estado-tareas" className="block text-sm font-medium text-slate-300 mb-1">
            Filtrar por estado
          </label>
          <select
            id="filtro-estado-tareas"
            name="filtroEstado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
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
            <option value="pendientes" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Pendientes</option>
            <option value="en_progreso" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>En Proceso</option>
            <option value="completada" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Completadas</option>
            <option value="todos" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', padding: '8px' }}>Todas</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {tareasFiltradas.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No hay tareas</p>
        ) : (
          tareasFiltradas.map((tarea) => {
            const fechaVenc = tarea.fechaVencimiento ? new Date(tarea.fechaVencimiento) : null;
            const esVencida = fechaVenc && fechaVenc < new Date() && tarea.estado !== 'completada';
            return (
              <div key={tarea.tareaId} className={`p-4 rounded-lg border ${tarea.estado === 'completada' ? 'bg-slate-800/50 border-slate-700 opacity-60' : esVencida ? 'bg-red-900/20 border-red-700' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className={`font-semibold ${tarea.estado === 'completada' ? 'line-through text-slate-400' : ''}`}>{tarea.titulo}</h3>
                      <span className={`px-2 py-1 rounded text-xs border ${getPrioridadColor(tarea.prioridad)}`}>
                        {tarea.prioridad}
                      </span>
                      {tarea.estado === 'completada' && <span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 border border-green-700">✓ Completada</span>}
                      {tarea.estado === 'en_progreso' && <span className="px-2 py-1 rounded text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700">🔄 En Proceso</span>}
                    </div>
                    {tarea.descripcion && <p className="text-sm text-slate-300 mb-1">{tarea.descripcion}</p>}
                    {tarea.fechaVencimiento && (
                      <p className={`text-sm ${esVencida ? 'text-red-400 font-medium' : 'text-slate-300'}`}>
                        📅 Vence: {formatearFecha(tarea.fechaVencimiento)}
                      </p>
                    )}
                    {tarea.cliente?.nombre && <p className="text-sm text-slate-300">👤 {tarea.cliente.nombre}</p>}
                    {tarea.etiquetas?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tarea.etiquetas.map((et, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-700">{et}</span>
                        ))}
                      </div>
                    )}
                    {tarea.asignados?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-xs text-slate-400 mr-1">👤 Asignados:</span>
                        {tarea.asignados.map((asignado, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-700">{asignado}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {tarea.estado !== 'completada' && (
                      <button 
                        onClick={() => toggleCompletar(tarea)} 
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors duration-200"
                      >
                        ✓ Completar
                      </button>
                    )}
                    {tarea.estado !== 'en_progreso' && tarea.estado !== 'completada' && (
                      <button 
                        onClick={() => cambiarEstado(tarea, 'en_progreso')} 
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-xs font-medium transition-colors duration-200"
                      >
                        🔄 En Proceso
                      </button>
                    )}
                    {tarea.estado === 'en_progreso' && (
                      <button 
                        onClick={() => cambiarEstado(tarea, 'pendiente')} 
                        className="px-3 py-1 bg-slate-600 hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors duration-200"
                      >
                        ⏸️ Pendiente
                      </button>
                    )}
                    <button 
                      onClick={() => abrirEdicion(tarea)} 
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors duration-200"
                    >
                      ✏️ Editar
                    </button>
                    <button 
                      onClick={() => setMostrarConfirmacion(tarea.tareaId)} 
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
            <div className="p-4 sm:p-6">
              <h3 className="text-xl font-semibold mb-4">{tareaEditando ? 'Editar Tarea' : 'Nueva Tarea'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="tarea-titulo" className="block text-sm font-medium mb-1">Título *</label>
                  <input id="tarea-titulo" name="titulo" type="text" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" required />
                </div>
                <div>
                  <label htmlFor="tarea-descripcion" className="block text-sm font-medium mb-1">Descripción</label>
                  <textarea id="tarea-descripcion" name="descripcion" value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} rows={3} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tarea-fecha-vencimiento" className="block text-sm font-medium mb-1">Fecha Vencimiento</label>
                    <input id="tarea-fecha-vencimiento" name="fechaVencimiento" type="date" value={formData.fechaVencimiento} onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" />
                  </div>
                  <div>
                    <label htmlFor="tarea-prioridad" className="block text-sm font-medium mb-1">Prioridad</label>
                    <select id="tarea-prioridad" name="prioridad" value={formData.prioridad} onChange={(e) => setFormData({ ...formData, prioridad: e.target.value })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100">
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="tarea-cliente" className="block text-sm font-medium mb-1">Cliente (opcional)</label>
                  <input id="tarea-cliente" name="cliente" type="text" value={formData.cliente?.nombre || ""} onChange={(e) => setFormData({ ...formData, cliente: { nombre: e.target.value } })} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" />
                </div>
                <div>
                  <label htmlFor="tarea-asignados" className="block text-sm font-medium mb-1">Asignados</label>
                  <div className="flex gap-2 mb-2">
                    <input 
                      id="tarea-asignados" 
                      name="asignados" 
                      type="text" 
                      value={nuevoAsignado} 
                      onChange={(e) => setNuevoAsignado(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAsignado())}
                      placeholder="Nombre de la persona"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100" 
                    />
                    <button 
                      type="button"
                      onClick={agregarAsignado}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm whitespace-nowrap flex-shrink-0"
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
                  <button type="button" onClick={() => { setMostrarFormulario(false); setTareaEditando(null); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm" disabled={guardando}>Cancelar</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50" disabled={guardando}>{guardando ? 'Guardando...' : tareaEditando ? 'Actualizar' : 'Crear'}</button>
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
            <p className="text-slate-300 mb-4">¿Estás seguro de que deseas eliminar esta tarea?</p>
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

export default function TareasPage() {
  return (
    <ProtectedRoute>
      <TareasPageContent />
    </ProtectedRoute>
  );
}

