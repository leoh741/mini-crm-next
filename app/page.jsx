"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { descargarBackup, cargarBackup } from "../lib/backupUtils";
import ProtectedRoute from "../components/ProtectedRoute";
import { esAdmin } from "../lib/authUtils";
import { getReuniones } from "../lib/reunionesUtils";
import { getTareas } from "../lib/tareasUtils";
import { Icons } from "../components/Icons";

function HomePageContent() {
  const [dateTime, setDateTime] = useState(new Date());
  const [isAdmin, setIsAdmin] = useState(false);
  const [reunionesProximas, setReunionesProximas] = useState([]);
  const [tareasPendientes, setTareasPendientes] = useState([]);
  const [mostrarInputImportar, setMostrarInputImportar] = useState(false);

  useEffect(() => {
    setIsAdmin(esAdmin());
    // Cargar datos iniciales
    cargarReunionesProximas();
    cargarTareasPendientes();
    
    // Optimización: Actualizar cada 2 minutos en lugar de cada minuto para reducir carga
    const interval = setInterval(() => {
      cargarReunionesProximas();
      cargarTareasPendientes();
    }, 120000); // Actualizar cada 2 minutos (reducido de 1 minuto)
    
    return () => clearInterval(interval);
  }, []);

  const cargarReunionesProximas = async () => {
    try {
      // Obtener reuniones del día actual
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaHoy = hoy.toISOString().split('T')[0]; // Formato YYYY-MM-DD
      
      console.log('[Home] Cargando reuniones para:', fechaHoy, 'Fecha local:', hoy.toLocaleDateString('es-AR'));
      
      // Obtener reuniones del día actual (sin filtrar por completada en el API)
      const reunionesHoy = await getReuniones(fechaHoy, null, false, false);
      console.log('[Home] Reuniones del día obtenidas:', reunionesHoy.length, reunionesHoy);
      
      // Obtener reuniones próximas (próximas 24 horas desde ahora, no completadas)
      const reunionesProximas = await getReuniones(null, false, true, false);
      console.log('[Home] Reuniones próximas obtenidas:', reunionesProximas.length, reunionesProximas);
      
      // Combinar y eliminar duplicados de forma eficiente
      const todasReuniones = [...reunionesHoy, ...reunionesProximas];
      const reunionesMap = new Map();
      
      todasReuniones.forEach(reunion => {
        if (reunion.reunionId && !reunionesMap.has(reunion.reunionId)) {
          // Solo incluir reuniones no completadas
          if (!reunion.completada) {
            reunionesMap.set(reunion.reunionId, reunion);
          } else {
            console.log('[Home] Reunión completada excluida:', reunion.titulo, reunion.fecha);
          }
        }
      });
      
      console.log('[Home] Total reuniones después de filtrar completadas:', reunionesMap.size);
      
      // Ordenar por fecha y hora
      const reunionesOrdenadas = Array.from(reunionesMap.values()).sort((a, b) => {
        const fechaA = new Date(a.fecha);
        const fechaB = new Date(b.fecha);
        if (fechaA.getTime() !== fechaB.getTime()) {
          return fechaA - fechaB;
        }
        // Si es el mismo día, ordenar por hora
        const horaA = a.hora ? a.hora.split(':').map(Number) : [0, 0];
        const horaB = b.hora ? b.hora.split(':').map(Number) : [0, 0];
        const minutosA = horaA[0] * 60 + horaA[1];
        const minutosB = horaB[0] * 60 + horaB[1];
        return minutosA - minutosB;
      });
      
      console.log('[Home] Reuniones finales ordenadas:', reunionesOrdenadas.length, reunionesOrdenadas.map(r => ({
        titulo: r.titulo,
        fecha: r.fecha,
        hora: r.hora,
        completada: r.completada
      })));
      
      setReunionesProximas(reunionesOrdenadas);
    } catch (err) {
      console.error('Error al cargar reuniones próximas:', err);
      setReunionesProximas([]); // Asegurar que siempre haya un array
    }
  };

  const cargarTareasPendientes = async () => {
    try {
      const tareas = await getTareas(null, null, false, true);
      // Ordenar: primero las en proceso, luego por prioridad y fecha
      const tareasOrdenadas = tareas.sort((a, b) => {
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
        return 0;
      });
      setTareasPendientes(tareasOrdenadas);
    } catch (err) {
      console.error('Error al cargar tareas pendientes:', err);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const formatearHoraReunion = (fecha, hora) => {
    const date = new Date(fecha);
    const [h, m] = hora.split(':');
    return `${h}:${m}`;
  };

  const formatearFechaReunion = (fecha) => {
    const date = new Date(fecha);
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    
    if (date.toDateString() === hoy.toDateString()) {
      return 'Hoy';
    } else if (date.toDateString() === manana.toDateString()) {
      return 'Mañana';
    } else {
      return date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    }
  };

  const formatearFechaTarea = (fecha) => {
    if (!fecha) return null;
    const date = new Date(fecha);
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    
    if (date.toDateString() === hoy.toDateString()) {
      return 'Hoy';
    } else if (date.toDateString() === manana.toDateString()) {
      return 'Mañana';
    } else {
      return date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    }
  };

  const getPrioridadColor = (prioridad) => {
    switch (prioridad) {
      case 'urgente':
        return 'bg-red-900/30 text-red-400 border-red-700';
      case 'alta':
        return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'media':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'baja':
        return 'bg-green-900/30 text-green-400 border-green-700';
      default:
        return 'bg-slate-900/30 text-slate-400 border-slate-700';
    }
  };

  const capitalizarPrioridad = (prioridad) => {
    if (!prioridad) return '';
    return prioridad.charAt(0).toUpperCase() + prioridad.slice(1);
  };

  return (
    <div className="flex flex-col space-y-3" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg md:text-xl font-semibold">
              Bienvenido 👋
            </h2>
            <p className="text-xs md:text-sm text-slate-400">
              Digital Space CRM
            </p>
          </div>
          <div className="px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 w-full sm:w-auto">
            <p className="text-xs text-slate-300 font-medium text-center sm:text-left" suppressHydrationWarning>
              {formatDate(dateTime)}
            </p>
          </div>
        </div>
      </div>

      {/* Alertas de reuniones próximas */}
      {reunionesProximas.length > 0 && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icons.Bell className="text-lg" />
              <h3 className="font-semibold text-blue-300">Reuniones Próximas</h3>
            </div>
            <Link 
              href="/reuniones"
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors duration-200 flex-shrink-0 text-white"
            >
              Ver Reuniones
            </Link>
          </div>
          <div className="space-y-2">
            {reunionesProximas.slice(0, 3).map((reunion) => (
              <div key={reunion.reunionId} className="bg-slate-800/50 rounded p-2 border border-blue-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-blue-200 truncate">{reunion.titulo}</p>
                    <p className="text-xs text-blue-300/80">
                      {formatearFechaReunion(reunion.fecha)} a las {formatearHoraReunion(reunion.fecha, reunion.hora)}
                      {reunion.tipo === 'meet' ? <Icons.VideoCamera className="inline ml-1" /> : <Icons.OfficeBuilding className="inline ml-1" />}
                    </p>
                    {reunion.cliente?.nombre && (
                      <p className="text-xs text-blue-300/70">Cliente: {reunion.cliente.nombre}</p>
                    )}
                    {reunion.asignados?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-xs text-blue-300/70 mr-1 flex items-center gap-1"><Icons.User className="inline" /> Asignados:</span>
                        {reunion.asignados.map((asignado, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-purple-900/30 text-purple-300 text-xs rounded border border-purple-700">{asignado}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {reunionesProximas.length > 3 && (
              <Link href="/reuniones" className="text-xs text-blue-400 hover:text-blue-300 underline block text-center pt-1">
                Ver todas las reuniones próximas ({reunionesProximas.length})
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Alertas de tareas pendientes */}
      {tareasPendientes.length > 0 && (
        <div className="bg-indigo-900/30 border border-indigo-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icons.CheckCircle className="text-lg" />
              <h3 className="font-semibold text-indigo-300">Tareas Pendientes</h3>
            </div>
            <Link 
              href="/tareas"
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium transition-colors duration-200 flex-shrink-0 text-white"
            >
              Ver Tareas
            </Link>
          </div>
          <div className="space-y-2">
            {tareasPendientes.slice(0, 3).map((tarea) => {
              const fechaVenc = tarea.fechaVencimiento ? new Date(tarea.fechaVencimiento) : null;
              const esVencida = fechaVenc && fechaVenc < new Date();
              return (
                <div key={tarea.tareaId || tarea.id} className={`bg-slate-800/50 rounded p-2 border ${esVencida ? 'border-red-800' : 'border-indigo-800'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-medium text-sm text-indigo-200 truncate">{tarea.titulo}</p>
                        <span className={`px-2 py-0.5 rounded text-xs border ${getPrioridadColor(tarea.prioridad)}`}>
                          {capitalizarPrioridad(tarea.prioridad)}
                        </span>
                        {tarea.estado === 'en_progreso' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700">
                            <Icons.Refresh className="inline mr-1" /> En Proceso
                          </span>
                        )}
                      </div>
                      {tarea.descripcion && (
                        <p className="text-xs text-indigo-300/80 mb-1 line-clamp-2">{tarea.descripcion}</p>
                      )}
                      {tarea.fechaVencimiento && (
                        <p className={`text-xs ${esVencida ? 'text-red-400 font-medium' : 'text-indigo-300/80'}`}>
                          <span className="flex items-center gap-1"><Icons.Calendar className="inline" /> Vence: {formatearFechaTarea(tarea.fechaVencimiento)}</span>
                        </p>
                      )}
                      {tarea.cliente?.nombre && (
                        <p className="text-xs text-indigo-300/70">Cliente: {tarea.cliente.nombre}</p>
                      )}
                      {tarea.asignados?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-xs text-indigo-300/70 mr-1 flex items-center gap-1"><Icons.User className="inline" /> Asignados:</span>
                          {tarea.asignados.map((asignado, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-purple-900/30 text-purple-300 text-xs rounded border border-purple-700">{asignado}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {tareasPendientes.length > 3 && (
              <Link href="/tareas" className="text-xs text-indigo-400 hover:text-indigo-300 underline block text-center pt-1">
                Ver todas las tareas pendientes ({tareasPendientes.length})
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxWidth: '100%' }}>
        <Link href="/clientes" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-blue-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.Users className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-blue-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Clientes</h3>
              <p className="text-xs text-blue-100/90">Ver lista de clientes</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/pagos" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-green-600 via-green-700 to-green-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-green-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.CurrencyDollar className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-green-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Pagos</h3>
              <p className="text-xs text-green-100/90">Métricas y gestión</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/clientes/nuevo" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-purple-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.Plus className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-purple-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Agregar Cliente</h3>
              <p className="text-xs text-purple-100/90">Registrar nuevo</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/balance" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-orange-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.ChartBar className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-orange-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Balance</h3>
              <p className="text-xs text-orange-100/90">Gastos y utilidad</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/reuniones" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-cyan-600 via-cyan-700 to-cyan-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-cyan-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.Calendar className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-cyan-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Reuniones</h3>
              <p className="text-xs text-cyan-100/90">Agendar y gestionar</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>

        <Link href="/tareas" className="group" prefetch={true}>
          <div className="relative w-full min-h-[130px] p-4 bg-gradient-to-br from-pink-600 via-pink-700 to-pink-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-pink-500/20 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
              <Icons.CheckCircle className="text-3xl group-hover:scale-110 transition-transform duration-300" />
              <div className="w-1.5 h-1.5 bg-pink-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Tareas</h3>
              <p className="text-xs text-pink-100/90">Gestionar pendientes</p>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12 group-hover:scale-150 transition-transform duration-500"></div>
          </div>
        </Link>
      </div>

      <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Presupuestos</h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <Link
              href="/presupuestos/nuevo"
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-teal-500/30 overflow-hidden text-center"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icons.Clipboard className="text-sm" />
                <span>Nuevo Presupuesto</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
            <Link
              href="/presupuestos"
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-teal-500/30 overflow-hidden text-center"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icons.Folder className="text-sm" />
                <span>Ver Presupuestos</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Respaldo</h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={descargarBackup}
              className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-indigo-500/30 overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icons.Download className="text-sm" />
                <span>Exportar</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </button>
            <label className="group relative flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-indigo-500/30 cursor-pointer overflow-hidden">
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icons.Upload className="text-sm" />
                <span>Importar</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const archivo = e.target.files[0];
                  if (!archivo) {
                    e.target.value = '';
                    return;
                  }
                  
                  // PROTECCIÓN MÁXIMA: Requerir triple confirmación antes de importar
                  const confirmacion1 = window.prompt(
                    '⚠️⚠️⚠️ ADVERTENCIA MÁXIMA ⚠️⚠️⚠️\n\n' +
                    'Esta operación BORRARÁ PERMANENTEMENTE TODOS los datos existentes.\n\n' +
                    'Esto incluye:\n' +
                    '- Todos los clientes\n' +
                    '- Todos los pagos\n' +
                    '- Todos los gastos e ingresos\n' +
                    '- Todos los presupuestos\n' +
                    '- Todas las reuniones\n' +
                    '- Todas las tareas\n\n' +
                    'Para continuar, escribe exactamente: BORRAR TODO\n\n' +
                    'Esta acción NO se puede deshacer.'
                  );
                  
                  if (confirmacion1 !== 'BORRAR TODO') {
                    alert('Operación cancelada. Debes escribir exactamente "BORRAR TODO" para continuar.');
                    e.target.value = '';
                    return;
                  }
                  
                  const confirmacion2 = window.prompt(
                    '⚠️ SEGUNDA CONFIRMACIÓN ⚠️\n\n' +
                    'Estás a punto de ELIMINAR PERMANENTEMENTE todos los datos.\n\n' +
                    'Escribe exactamente: CONFIRMO BORRAR'
                  );
                  
                  if (confirmacion2 !== 'CONFIRMO BORRAR') {
                    alert('Operación cancelada. Debes escribir exactamente "CONFIRMO BORRAR" para continuar.');
                    e.target.value = '';
                    return;
                  }
                  
                  const confirmacion3 = window.confirm(
                    '⚠️ ÚLTIMA CONFIRMACIÓN ⚠️\n\n' +
                    'Esta es tu última oportunidad para cancelar.\n\n' +
                    '¿Estás ABSOLUTAMENTE SEGURO de que quieres BORRAR TODOS los datos?\n\n' +
                    'Esta acción es IRREVERSIBLE.'
                  );
                  
                  if (!confirmacion3) {
                    alert('Operación cancelada.');
                    e.target.value = '';
                    return;
                  }
                  
                  // Solo después de las 3 confirmaciones, proceder con la importación
                  try {
                    const resultado = await cargarBackup(archivo);
                    const mensaje = resultado?.resultados 
                      ? `Datos importados correctamente:\n- Clientes: ${resultado.resultados.clientes}\n- Pagos: ${resultado.resultados.pagosMensuales}\n- Gastos: ${resultado.resultados.gastos}\n- Ingresos: ${resultado.resultados.ingresos}\n- Presupuestos: ${resultado.resultados.presupuestos || 0}\n- Reuniones: ${resultado.resultados.reuniones || 0}\n- Tareas: ${resultado.resultados.tareas || 0}\n- Usuarios: ${resultado.resultados.usuarios} (${resultado.resultados.usuariosMantenidos || 0} mantenidos)\n\nRecarga la página para ver los cambios.`
                      : 'Datos importados correctamente. Recarga la página para ver los cambios.';
                    alert(mensaje);
                    window.location.reload();
                  } catch (error) {
                    alert('Error al importar: ' + error.message);
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t border-slate-700">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-300">Usuarios</h3>
            <Link
              href="/admin/usuarios"
              className="group relative w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 rounded-lg text-xs font-medium text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 border border-violet-500/30 overflow-hidden text-center flex items-center justify-center"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icons.User className="text-sm" />
                <span>Gestionar Usuarios</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomePageContent />
    </ProtectedRoute>
  );
}

