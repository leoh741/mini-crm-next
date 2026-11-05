"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { getActivityLists, createActivityList, updateActivityList, deleteActivityList } from "../../lib/activitiesUtils";
import { getActivities, createActivity, updateActivity, deleteActivity, reorderActivities } from "../../lib/activitiesUtils";
import { getUsuarioActual, puedeGestionarActividades, esAdmin } from "../../lib/authUtils";
import { actividadCaeEnRango } from "../../lib/fechaActividad";
import { coincideBusqueda } from "../../lib/textoBusqueda";
import { getUsuarios } from "../../lib/usuariosUtils";
import ProtectedRoute from "../../components/ProtectedRoute";
import { Icons } from "../../components/Icons";

function LivePedidoTimer({ baseMs = 0, runStartedAt = null, formatDuration }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!runStartedAt) return undefined;
    // Solo fuerza re-render; el tiempo se calcula siempre con Date.now() (sin estado viejo)
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [runStartedAt]);

  const base = Math.max(0, Number(baseMs) || 0);
  const segment = runStartedAt ? Math.max(0, Date.now() - runStartedAt) : 0;
  const elapsed = base + segment;

  if (!runStartedAt && base <= 0) return null;

  return (
    <div
      className="flex items-center gap-1 text-[10px] md:text-xs text-amber-300 whitespace-nowrap font-mono"
      title="Tiempo en curso"
    >
      <Icons.Refresh className="w-3 h-3 md:w-3.5 md:h-3.5 animate-spin" style={{ animationDuration: '2s' }} />
      <span>{formatDuration(elapsed)}</span>
    </div>
  );
}

function ActivitiesPageContent() {
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("pendiente");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  
  // Modal states
  const [showListModal, setShowListModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [deletingActivityId, setDeletingActivityId] = useState(null);
  const [editingList, setEditingList] = useState(null);
  const [deletingListId, setDeletingListId] = useState(null);
  
  // Form states
  const [listFormData, setListFormData] = useState({
    name: "",
    description: "",
    color: "#22c55e"
  });
  
  const [activityFormData, setActivityFormData] = useState({
    title: "",
    description: "",
    priority: "media",
    status: "pendiente",
    dueDate: "",
    assignee: "",
    labels: []
  });
  
  const [newLabel, setNewLabel] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [usersLastSeen, setUsersLastSeen] = useState({});
  const [draggedActivityId, setDraggedActivityId] = useState(null);
  const [dragOverActivityId, setDragOverActivityId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after'
  const draggedActivityIdRef = useRef(null);
  const dragOverKeyRef = useRef(null);
  const dropPositionRef = useRef(null);
  const activitiesBeforeDragRef = useRef(null);
  const activitiesRef = useRef(activities);
  const isSavingOrderRef = useRef(false);
  const didDropRef = useRef(false);
  const activitiesLoadIdRef = useRef(0);
  const activitiesLoadingRef = useRef(false);
  // Cronómetro client-side (autoritativo en pantalla). El server solo persiste.
  // baseMs = acumulado al pausar; runStartedAt = Date.now() del tramo actual en curso
  const timerMemoryRef = useRef({});
  activitiesRef.current = activities;

  const getTimerMem = (activityId) => timerMemoryRef.current[activityId] || null;

  const setTimerMem = (activityId, next) => {
    if (!activityId) return;
    timerMemoryRef.current[activityId] = next;
  };

  const hydrateTimerFromActivity = (activity) => {
    if (!activity?.id) return activity;
    const mem = getTimerMem(activity.id);

    // Si hay un tramo local en curso, no dejar que el server pise el reloj
    if (mem?.runStartedAt) {
      return {
        ...activity,
        elapsedMs: mem.baseMs,
        startedAt: new Date(mem.runStartedAt).toISOString()
      };
    }

    const serverElapsed = typeof activity.elapsedMs === 'number' ? activity.elapsedMs : 0;
    const baseMs = Math.max(serverElapsed, mem?.baseMs || 0);

    // Hidratar desde server solo si no hay memoria local activa
    if (!mem) {
      if (activity.status === 'en_proceso' && activity.startedAt) {
        setTimerMem(activity.id, {
          baseMs: serverElapsed,
          runStartedAt: new Date(activity.startedAt).getTime()
        });
      } else {
        setTimerMem(activity.id, { baseMs: serverElapsed, runStartedAt: null });
      }
    } else if (serverElapsed > (mem.baseMs || 0) && !mem.runStartedAt) {
      setTimerMem(activity.id, { baseMs: serverElapsed, runStartedAt: null });
    }

    const finalMem = getTimerMem(activity.id);
    return {
      ...activity,
      elapsedMs: finalMem?.baseMs ?? baseMs,
      startedAt: finalMem?.runStartedAt ? new Date(finalMem.runStartedAt).toISOString() : null
    };
  };

  const isTransientFetchError = (err) => {
    if (!err) return false;
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
    const msg = String(err.message || '').toLowerCase();
    return msg.includes('aborted') || msg.includes('abort') || msg.includes('timeout');
  };

  useEffect(() => {
    // Verificar permisos al cargar el componente
    const puedeGestionarValue = puedeGestionarActividades() || esAdmin();
    console.log('[Activities] Verificando permisos:', {
      puedeGestionarActividades: puedeGestionarActividades(),
      esAdmin: esAdmin(),
      puedeGestionar: puedeGestionarValue,
      usuarioActual: getUsuarioActual()
    });
    setPuedeGestionar(puedeGestionarValue);
    loadData();
    
    // Actualizar heartbeat del usuario actual al cargar la página
    const updateMyHeartbeat = async () => {
      try {
        const user = getUsuarioActual();
        if (user && user.usuarioId) {
          const headers = {
            'Content-Type': 'application/json',
            'X-User-Id': String(user.usuarioId)
          };
          
          await fetch('/api/users/heartbeat', {
            method: 'POST',
            headers: headers,
            signal: AbortSignal.timeout(5000)
          });
          console.log('[Activities] Heartbeat actualizado para usuario:', user.usuarioId);
        }
      } catch (error) {
        console.error('[Activities] Error al actualizar heartbeat:', error);
      }
    };
    
    // Marcar usuario como offline cuando cierra la pestaña
    const markUserOffline = () => {
      const user = getUsuarioActual();
      if (user && user.usuarioId) {
        const userId = String(user.usuarioId);
        
        // Usar fetch con keepalive para asegurar que se envíe incluso si la página se cierra
        // keepalive es más confiable que sendBeacon para peticiones con headers personalizados
        const offlineRequest = fetch('/api/users/offline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId
          },
          body: JSON.stringify({}),
          keepalive: true // Crítico: permite que la petición continúe después de cerrar la pestaña
        });
        
        // También intentar con sendBeacon como respaldo (aunque no soporta headers personalizados bien)
        // El servidor debería poder obtener el userId del header X-User-Id
        offlineRequest.catch(err => {
          console.debug('[Activities] Error al marcar como offline con fetch, intentando sendBeacon:', err);
          // Si fetch falla, intentar con sendBeacon (aunque es menos confiable con headers)
          if (navigator.sendBeacon) {
            try {
              const formData = new FormData();
              formData.append('userId', userId);
              navigator.sendBeacon('/api/users/offline', formData);
            } catch (beaconErr) {
              console.debug('[Activities] Error al marcar como offline con sendBeacon:', beaconErr);
            }
          }
        });
      }
    };
    
    updateMyHeartbeat();
    
    // Actualizar heartbeat cada 30 segundos mientras estés en la página
    // Esto asegura que incluso si la pestaña está minimizada, el heartbeat continúe
    const heartbeatInterval = setInterval(updateMyHeartbeat, 30000);
    
    // Detectar cuando la pestaña se oculta o vuelve a ser visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Cuando vuelve a ser visible, actualizar heartbeat inmediatamente
        updateMyHeartbeat();
      }
      // NO marcar como offline cuando se oculta, porque puede estar minimizada
      // El heartbeat continuará funcionando y el sistema detectará offline solo si
      // el lastSeen es mayor a 5 minutos
    };
    
    // Detectar cuando el usuario cierra la pestaña o navega fuera
    const handleBeforeUnload = (e) => {
      markUserOffline();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // También marcar como offline cuando el componente se desmonta
      markUserOffline();
    };
  }, []);

  // Debounce de búsqueda: evita pedir historial en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchKeyword.trim()), 350);
    return () => clearTimeout(t);
  }, [searchKeyword]);

  useEffect(() => {
    if (selectedListId) {
      loadActivities(selectedListId);
    } else {
      setActivities([]);
    }
  }, [selectedListId, filterStatus, debouncedSearch, filterDateFrom, filterDateTo]);

  // Recargar actividades periódicamente para sincronización en tiempo real
  useEffect(() => {
    if (!selectedListId) return;

    // Recargar actividades cada 15 s (silencioso: no mostrar error si falla un poll)
    const activitiesInterval = setInterval(() => {
      loadActivities(selectedListId, { silent: true });
    }, 15000);

    return () => clearInterval(activitiesInterval);
  }, [selectedListId, filterStatus, debouncedSearch, filterDateFrom, filterDateTo]);

  // Actualizar lastSeen de usuarios periódicamente
  useEffect(() => {
    const updateUsersLastSeen = async () => {
      try {
        // Primero actualizar heartbeat del usuario actual
        const user = getUsuarioActual();
        if (user && user.usuarioId) {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'X-User-Id': String(user.usuarioId)
            };
            await fetch('/api/users/heartbeat', {
              method: 'POST',
              headers: headers,
              signal: AbortSignal.timeout(5000)
            });
          } catch (hbError) {
            console.debug('[Activities] Error en heartbeat (continuando):', hbError);
          }
        }
        
        // Luego obtener la lista actualizada de usuarios
        const response = await fetch('/api/usuarios', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const lastSeenMap = {};
            data.data.forEach(user => {
              if (user._id || user.id) {
                const userId = user._id?.toString() || user.id;
                lastSeenMap[userId] = user.lastSeen;
              }
            });
            setUsersLastSeen(lastSeenMap);
          }
        }
      } catch (error) {
        console.error('Error al actualizar lastSeen de usuarios:', error);
      }
    };

    // Actualizar inmediatamente
    updateUsersLastSeen();
    
    // Actualizar cada 5 segundos para detectar cambios de estado más rápido
    const interval = setInterval(updateUsersLastSeen, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      
      console.log('[Activities] Cargando datos...');
      
      // Load lists and users in parallel
      const [listsData, usersData] = await Promise.all([
        getActivityLists().catch(err => {
          console.error('[Activities] Error al cargar listas:', err);
          // Si el error es de permisos, retornar array vacío en lugar de lanzar error
          if (err.message?.includes('permisos') || err.message?.includes('403')) {
            console.warn('[Activities] Sin permisos para ver listas, retornando array vacío');
            return [];
          }
          throw new Error(`Error al cargar listas: ${err.message}`);
        }),
        getUsuarios().catch(err => {
          console.error('[Activities] Error al cargar usuarios:', err);
          // No lanzar error para usuarios, solo retornar array vacío
          return [];
        })
      ]);
      
      console.log('[Activities] Listas cargadas:', listsData?.length || 0);
      console.log('[Activities] Usuarios cargados:', usersData?.length || 0);
      
      setLists(listsData || []);
      setAllUsers(usersData || []);
      
      // Inicializar lastSeen de usuarios
      const lastSeenMap = {};
      (usersData || []).forEach(user => {
        if (user._id || user.id) {
          const userId = user._id?.toString() || user.id;
          lastSeenMap[userId] = user.lastSeen;
        }
      });
      setUsersLastSeen(lastSeenMap);
      
      // Select first list if available
      if (listsData && listsData.length > 0 && !selectedListId) {
        setSelectedListId(listsData[0].id);
      }
      
      // Limpiar cualquier error previo si la carga fue exitosa
      setError("");
    } catch (err) {
      console.error('[Activities] Error completo al cargar datos:', err);
      if (isTransientFetchError(err)) {
        console.debug('[Activities] Carga inicial omitida (timeout/abort)');
        return;
      }
      const errorMessage = err.message || "Error al cargar las listas de pedidos. Verifica tu conexión e intenta nuevamente.";
      setError(errorMessage);
      // Asegurar que los estados estén inicializados
      setLists([]);
      setAllUsers([]);
    } finally {
      // Siempre desactivar loading después de un pequeño delay para evitar parpadeos
      setTimeout(() => {
        setLoading(false);
      }, 100);
    }
  };

  const toLocalISODate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const setMonthRange = (offsetMonths = 0) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
    setFilterDateFrom(toLocalISODate(start));
    setFilterDateTo(toLocalISODate(end));
    if (filterStatus !== "completada") setFilterStatus("completada");
  };

  const clearDateRange = () => {
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const buildActivityFilters = () => {
    const filters = {};
    const hasSearch = Boolean(debouncedSearch);
    const hasDateRange = Boolean(filterDateFrom || filterDateTo);

    // Con búsqueda o rango: consultar historial (incluye completadas antiguas)
    if (hasSearch) filters.q = debouncedSearch;
    if (hasDateRange) {
      if (filterDateFrom) filters.dateFrom = filterDateFrom;
      if (filterDateTo) filters.dateTo = filterDateTo;
      // Completadas: filtrar por fecha de completado; resto: por vencimiento
      filters.dateField = filterStatus === "completada" ? "completedAt" : "dueDate";
    }
    if (hasSearch || hasDateRange) {
      filters.history = true;
      if (filterStatus === "completada") filters.status = "completada";
      else if (filterStatus === "pendiente") filters.status = "pendiente";
      return filters;
    }

    if (filterStatus === "pendiente") {
      // Tablero: solo activas (no carga historial de completadas)
      filters.status = "pendiente";
    } else if (filterStatus === "completada") {
      filters.status = "completada";
      filters.completedDays = 30;
    } else {
      // "Todos": activas + completadas recientes
      filters.completedDays = 14;
    }

    return filters;
  };

  const applyActivityInList = (activity) => {
    if (!activity?.id) return;
    const merged = hydrateTimerFromActivity(activity);
    setActivities((prev) => {
      const idx = prev.findIndex((a) => a.id === activity.id);
      if (idx === -1) return [merged, ...prev];
      const current = prev[idx];
      const next = [...prev];
      const mem = getTimerMem(activity.id);
      next[idx] = {
        ...current,
        ...merged,
        // Mantener valores locales del cronómetro si hay tramo en curso
        elapsedMs: mem?.baseMs ?? merged.elapsedMs,
        startedAt: mem?.runStartedAt ? new Date(mem.runStartedAt).toISOString() : merged.startedAt
      };
      return next;
    });
  };

  const removeActivityFromList = (activityId) => {
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
  };

  const loadActivities = async (listId, { silent = false } = {}) => {
    if (!listId) return;
    if (silent && activitiesLoadingRef.current) return;

    const requestId = ++activitiesLoadIdRef.current;
    activitiesLoadingRef.current = true;

    try {
      if (!silent) {
        setError("");
        setCargandoPedidos(true);
      }
      const activitiesData = await getActivities(listId, buildActivityFilters());

      // Ignorar respuestas obsoletas si el usuario cambió de lista/filtro
      if (requestId !== activitiesLoadIdRef.current) return;

      // Fusionar cronómetro local para que el poll no reinicie el contador
      setActivities(activitiesData.map(hydrateTimerFromActivity));
    } catch (err) {
      if (requestId !== activitiesLoadIdRef.current) return;

      if (isTransientFetchError(err)) {
        console.debug('[Activities] Recarga omitida (timeout/abort):', err.message);
        return;
      }

      console.error('Error al cargar actividades:', err);
      if (!silent) {
        setError(err.message || "Error al cargar los pedidos");
      }
    } finally {
      if (requestId === activitiesLoadIdRef.current) {
        activitiesLoadingRef.current = false;
        if (!silent) setCargandoPedidos(false);
      }
    }
  };

  const selectedList = useMemo(() => {
    return lists.find(l => l.id === selectedListId);
  }, [lists, selectedListId]);

  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Refuerzo local (la API ya filtra; con búsqueda/rango no ocultamos resultados del servidor)
    const searching = Boolean(searchKeyword.trim() || filterDateFrom || filterDateTo);
    if (!searching && filterStatus === "pendiente") {
      filtered = filtered.filter(a => a.status === "pendiente" || a.status === "en_proceso");
    } else if (filterStatus === "completada") {
      filtered = filtered.filter(a => a.status === "completada");
    }

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim();
      filtered = filtered.filter(a => {
        if (coincideBusqueda(a.title, keyword)) return true;
        if (coincideBusqueda(a.description, keyword)) return true;
        if (coincideBusqueda(a.assignee?.nombre || a.assignee?.name, keyword)) return true;
        if (a.labels?.some((label) => coincideBusqueda(label, keyword))) return true;
        return false;
      });
    }

    if (filterDateFrom || filterDateTo) {
      const useCompletedAt = filterStatus === "completada";

      filtered = filtered.filter(a => {
        if (!useCompletedAt) return actividadCaeEnRango(a, filterDateFrom, filterDateTo);
        const raw = a.completedAt || a.updatedAt || a.createdAt;
        if (!raw) return false;
        const ms = new Date(raw).getTime();
        if (Number.isNaN(ms)) return false;
        const fromMs = filterDateFrom ? Date.parse(`${filterDateFrom}T00:00:00.000Z`) : null;
        const toMs = filterDateTo ? Date.parse(`${filterDateTo}T23:59:59.999Z`) : null;
        if (fromMs !== null && ms < fromMs) return false;
        if (toMs !== null && ms > toMs) return false;
        return true;
      });
    }

    return filtered.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [activities, filterStatus, searchKeyword, filterDateFrom, filterDateTo]);

  const busquedaPendiente = searchKeyword.trim() !== debouncedSearch;
  const mostrandoCarga = cargandoPedidos || busquedaPendiente;

  // Función helper para calcular si un usuario está online
  const calculateUserIsOnline = (user, usersLastSeenMap) => {
    const currentUser = getUsuarioActual();
    const currentUserId = currentUser?.usuarioId ? String(currentUser.usuarioId) : null;
    const userId = user._id?.toString() || user.id;
    const lastSeen = usersLastSeenMap[userId] || user.lastSeen;
    
    const userMongoId = user._id?.toString();
    const userCrmId = user.id || (user.crmId ? String(user.crmId) : null);
    const isCurrentUser = 
      (currentUserId && (userMongoId === currentUserId || userCrmId === currentUserId)) ||
      (currentUser?.email && user.email && user.email.toLowerCase() === currentUser.email.toLowerCase());
    
    if (isCurrentUser) return true;
    if (!lastSeen) return false;
    try {
      const lastSeenDate = new Date(lastSeen);
      const now = new Date();
      const diffMinutes = (now - lastSeenDate) / (1000 * 60);
      // Aumentar el umbral a 6 minutos para dar más margen cuando la pestaña está minimizada
      // El heartbeat se actualiza cada 30 segundos, así que 6 minutos es un margen seguro
      return !isNaN(diffMinutes) && diffMinutes <= 6;
    } catch {
      return false;
    }
  };

  // Ordenar usuarios: primero online, luego offline
  const sortedUsers = useMemo(() => {
    return [...allUsers].sort((a, b) => {
      const isOnlineA = calculateUserIsOnline(a, usersLastSeen);
      const isOnlineB = calculateUserIsOnline(b, usersLastSeen);
      
      // Si uno está online y el otro no, el online va primero
      if (isOnlineA && !isOnlineB) return -1;
      if (!isOnlineA && isOnlineB) return 1;
      
      // Si ambos tienen el mismo estado, ordenar por nombre
      return (a.nombre || '').localeCompare(b.nombre || '');
    });
  }, [allUsers, usersLastSeen]);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!listFormData.name.trim()) {
      setError("El nombre de la lista es requerido");
      return;
    }

    try {
      setSaving(true);
      setError("");
      
      if (editingList) {
        await updateActivityList(editingList.id, listFormData);
      } else {
        await createActivityList(listFormData);
      }
      
      await loadData();
      setShowListModal(false);
      setEditingList(null);
      setListFormData({ name: "", description: "", color: "#22c55e" });
    } catch (err) {
      setError(err.message || "Error al guardar la lista");
    } finally {
      setSaving(false);
    }
  };

  const handleEditList = (list) => {
    setEditingList(list);
    setListFormData({
      name: list.name,
      description: list.description || "",
      color: list.color || "#22c55e"
    });
    setShowListModal(true);
  };

  const handleDeleteList = async () => {
    if (!deletingListId) return;

    try {
      setSaving(true);
      setError("");
      await deleteActivityList(deletingListId);
      await loadData();
      if (selectedListId === deletingListId) {
        setSelectedListId(null);
      }
      setDeletingListId(null);
    } catch (err) {
      setError(err.message || "Error al eliminar la lista");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateActivity = async (e) => {
    e.preventDefault();
    
    // Verificar autenticación antes de continuar
    const user = getUsuarioActual();
    if (!user || !user.usuarioId) {
      setError("No estás autenticado. Por favor, inicia sesión nuevamente.");
      return;
    }
    
    if (!activityFormData.title.trim()) {
      setError("El título es requerido");
      return;
    }

    if (!selectedListId) {
      setError("Debes seleccionar una lista");
      return;
    }

    try {
      setSaving(true);
      setError("");
      
      console.log('[Activities] Creando actividad con datos:', {
        listId: selectedListId,
        title: activityFormData.title,
        editingActivity: editingActivity?.id
      });
      
      const activityData = {
        listId: selectedListId,
        title: activityFormData.title.trim(),
        description: activityFormData.description?.trim() || "",
        priority: activityFormData.priority || "media",
        status: activityFormData.status || "pendiente",
        dueDate: activityFormData.dueDate || null,
        assignee: activityFormData.assignee || null,
        labels: activityFormData.labels || []
      };

      if (editingActivity) {
        console.log('[Activities] Actualizando actividad:', editingActivity.id);
        const updated = await updateActivity(editingActivity.id, activityData);
        if (updated) applyActivityInList(updated);
      } else {
        console.log('[Activities] Creando nueva actividad');
        const created = await createActivity(activityData);
        if (created) applyActivityInList(created);
      }
      
      setShowActivityModal(false);
      setEditingActivity(null);
      setActivityFormData({
        title: "",
        description: "",
        priority: "media",
        status: "pendiente",
        dueDate: "",
        assignee: "",
        labels: []
      });
      setNewLabel("");
      setError(""); // Limpiar errores anteriores
    } catch (err) {
      console.error('[Activities] Error al guardar actividad:', err);
      setError(err.message || "Error al guardar el pedido. Verifica la consola para más detalles.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditActivity = (activity) => {
    setEditingActivity(activity);
    setActivityFormData({
      title: activity.title,
      description: activity.description || "",
      priority: activity.priority || "media",
      status: activity.status || "pendiente",
      dueDate: activity.dueDate ? new Date(activity.dueDate).toISOString().split('T')[0] : "",
      assignee: activity.assignee?._id?.toString() || activity.assignee?.id || "",
      labels: activity.labels || []
    });
    setShowActivityModal(true);
  };

  const handleDeleteActivity = async () => {
    if (!deletingActivityId) return;

    try {
      setSaving(true);
      setError("");
      const idToDelete = deletingActivityId;
      await deleteActivity(idToDelete);
      removeActivityFromList(idToDelete);
      setDeletingActivityId(null);
    } catch (err) {
      setError(err.message || "Error al eliminar el pedido");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeActivityStatus = async (activity, newStatus) => {
    const previous = {
      status: activity.status,
      startedAt: activity.startedAt,
      completedAt: activity.completedAt,
      completedBy: activity.completedBy,
      durationMs: activity.durationMs,
      elapsedMs: activity.elapsedMs
    };
    const previousMem = getTimerMem(activity.id)
      ? { ...getTimerMem(activity.id) }
      : null;

    const now = Date.now();
    const mem = getTimerMem(activity.id) || {
      baseMs: typeof activity.elapsedMs === 'number' ? activity.elapsedMs : 0,
      runStartedAt: activity.startedAt ? new Date(activity.startedAt).getTime() : null
    };

    const optimistic = { ...activity, status: newStatus };

    if (newStatus === "en_proceso") {
      // Iniciar / reanudar: el reloj local manda
      const baseMs = Math.max(0, mem.baseMs || 0);
      setTimerMem(activity.id, { baseMs, runStartedAt: now });
      optimistic.startedAt = new Date(now).toISOString();
      optimistic.elapsedMs = baseMs;
      optimistic.completedAt = null;
      optimistic.completedBy = null;
      optimistic.durationMs = null;
    } else if (newStatus === "completada") {
      const segmentMs = mem.runStartedAt ? Math.max(0, now - mem.runStartedAt) : 0;
      const totalMs = Math.max(0, (mem.baseMs || 0) + segmentMs);
      setTimerMem(activity.id, { baseMs: totalMs, runStartedAt: null });
      optimistic.startedAt = null;
      optimistic.completedAt = new Date(now).toISOString();
      optimistic.durationMs = totalMs;
      optimistic.elapsedMs = totalMs;
      const user = getUsuarioActual();
      optimistic.completedBy = user
        ? { _id: user.usuarioId, nombre: user.nombre || user.email || "Usuario" }
        : null;
    } else if (newStatus === "pendiente") {
      if (activity.status === "en_proceso") {
        // Pausar: congelar baseMs con el tramo actual
        const segmentMs = mem.runStartedAt ? Math.max(0, now - mem.runStartedAt) : 0;
        const frozen = Math.max(0, (mem.baseMs || 0) + segmentMs);
        setTimerMem(activity.id, { baseMs: frozen, runStartedAt: null });
        optimistic.elapsedMs = frozen;
        optimistic.startedAt = null;
        optimistic.completedAt = null;
        optimistic.completedBy = null;
        optimistic.durationMs = null;
      } else if (activity.status === "completada") {
        setTimerMem(activity.id, { baseMs: 0, runStartedAt: null });
        optimistic.startedAt = null;
        optimistic.completedAt = null;
        optimistic.completedBy = null;
        optimistic.durationMs = null;
        optimistic.elapsedMs = 0;
      } else {
        optimistic.startedAt = null;
        optimistic.completedAt = null;
        optimistic.completedBy = null;
        optimistic.durationMs = null;
      }
    }

    setActivities((prev) =>
      prev.map((a) => (a.id === activity.id ? optimistic : a))
    );

    try {
      const updated = await updateActivity(activity.id, { status: newStatus });
      // Persistir en server, pero NO dejar que pise el reloj local en curso
      if (updated) applyActivityInList({
        ...updated,
        elapsedMs: getTimerMem(activity.id)?.baseMs ?? updated.elapsedMs,
        startedAt: getTimerMem(activity.id)?.runStartedAt
          ? new Date(getTimerMem(activity.id).runStartedAt).toISOString()
          : updated.startedAt
      });

      // Si el filtro actual ya no debería mostrar esta actividad, quitarla del listado
      if (filterStatus === "pendiente" && newStatus === "completada") {
        removeActivityFromList(activity.id);
      } else if (filterStatus === "completada" && newStatus !== "completada") {
        removeActivityFromList(activity.id);
      }
    } catch (err) {
      if (previousMem) setTimerMem(activity.id, previousMem);
      else delete timerMemoryRef.current[activity.id];
      setActivities((prev) =>
        prev.map((a) => (a.id === activity.id ? { ...a, ...previous } : a))
      );
      setError(err.message || "Error al cambiar el estado del pedido");
    }
  };

  const handleCompleteActivity = async (activity) => {
    await handleChangeActivityStatus(activity, "completada");
  };

  const handleStartActivity = async (activity) => {
    await handleChangeActivityStatus(activity, "en_proceso");
  };

  const handleResetActivity = async (activity) => {
    await handleChangeActivityStatus(activity, "pendiente");
  };

  // Verificar si una actividad está asignada al usuario actual
  const esActividadAsignada = useCallback((activity) => {
    if (!activity.assignee) return false;

    const usuarioActual = getUsuarioActual();
    if (!usuarioActual || !usuarioActual.usuarioId) {
      return false;
    }

    // Obtener el _id de MongoDB del usuario actual desde allUsers
    const currentUserMongoId = allUsers.find(u => {
      const userId = u._id?.toString() || u.id?.toString();
      const userCrmId = u.crmId ? String(u.crmId) : null;
      const currentUserId = String(usuarioActual.usuarioId);
      return userId === currentUserId || userCrmId === currentUserId ||
             (usuarioActual.email && u.email && usuarioActual.email.toLowerCase() === u.email.toLowerCase());
    })?._id?.toString();

    const assigneeId = activity.assignee._id?.toString() || activity.assignee.id?.toString();
    const assigneeCrmId = activity.assignee.crmId?.toString();
    const currentUserId = String(usuarioActual.usuarioId);
    const currentUserCrmId = usuarioActual.crmId ? String(usuarioActual.crmId) : null;

    let isAssigned = false;
    if (currentUserMongoId && assigneeId) {
      isAssigned = currentUserMongoId === assigneeId;
    }

    if (!isAssigned) {
      isAssigned = assigneeCrmId === currentUserId ||
                   (currentUserCrmId && assigneeCrmId === currentUserCrmId);
    }

    if (!isAssigned && usuarioActual.email && activity.assignee.email) {
      isAssigned = usuarioActual.email.toLowerCase() === activity.assignee.email.toLowerCase();
    }

    return isAssigned;
  }, [allUsers]);

  // Verificar si el usuario puede poner la actividad "en proceso"
  const puedePonerEnProceso = (activity) => {
    // Admin y coordinador pueden hacerlo siempre
    if (puedeGestionar) return true;
    
    // Usuario normal solo puede si la actividad está asignada a él
    const usuarioActual = getUsuarioActual();
    if (!usuarioActual || !usuarioActual.usuarioId) {
      console.log('[Activities] puedePonerEnProceso: No hay usuario actual');
      return false;
    }
    
    if (!activity.assignee) {
      console.log('[Activities] puedePonerEnProceso: Actividad sin asignado');
      return false;
    }
    
    const assigneeId = activity.assignee._id?.toString() || activity.assignee.id?.toString();
    const assigneeCrmId = activity.assignee.crmId?.toString();
    const currentUserId = String(usuarioActual.usuarioId);
    const currentUserCrmId = usuarioActual.crmId ? String(usuarioActual.crmId) : null;
    
    // Obtener el _id de MongoDB del usuario actual desde allUsers
    const currentUserInList = allUsers.find(u => {
      const userCrmId = u.crmId ? String(u.crmId) : null;
      const userId = u._id?.toString() || u.id?.toString();
      // Comparar por crmId primero (más común)
      if (userCrmId === currentUserId) return true;
      // Comparar por _id si coincide
      if (userId === currentUserId) return true;
      // Comparar por email como fallback
      if (usuarioActual.email && u.email && usuarioActual.email.toLowerCase() === u.email.toLowerCase()) return true;
      return false;
    });
    
    const currentUserMongoId = currentUserInList?._id?.toString();
    
    // Comparar por _id de MongoDB (la forma más confiable)
    let canStart = false;
    if (currentUserMongoId && assigneeId) {
      canStart = currentUserMongoId === assigneeId;
    }
    
    // Si no coincide por _id, comparar por crmId
    if (!canStart && assigneeCrmId) {
      canStart = assigneeCrmId === currentUserId;
    }
    
    // Si no coincide por ID, intentar comparar por email como fallback
    if (!canStart && usuarioActual.email && activity.assignee.email) {
      canStart = usuarioActual.email.toLowerCase() === activity.assignee.email.toLowerCase();
    }
    
    console.log('[Activities] puedePonerEnProceso:', {
      assigneeId,
      assigneeCrmId,
      currentUserId,
      currentUserCrmId,
      currentUserMongoId,
      currentUserInList: currentUserInList ? { _id: currentUserInList._id?.toString(), crmId: currentUserInList.crmId, email: currentUserInList.email } : null,
      assigneeEmail: activity.assignee.email,
      currentUserEmail: usuarioActual.email,
      canStart,
      activityId: activity.id,
      allUsersCount: allUsers.length
    });
    
    return canStart;
  };

  // Verificar si el usuario puede pausar (volver a pendiente) una actividad en proceso
  const puedePausarActividad = (activity) => {
    // Admin y coordinador pueden hacerlo siempre
    if (puedeGestionar) return true;
    
    // Usuario normal solo puede si la actividad está asignada a él y está en proceso
    if (activity.status !== "en_proceso") return false;
    
    const usuarioActual = getUsuarioActual();
    if (!usuarioActual || !usuarioActual.usuarioId) {
      return false;
    }
    
    if (!activity.assignee) {
      return false;
    }
    
    const assigneeId = activity.assignee._id?.toString() || activity.assignee.id?.toString();
    const assigneeCrmId = activity.assignee.crmId?.toString();
    const currentUserId = String(usuarioActual.usuarioId);
    const currentUserCrmId = usuarioActual.crmId ? String(usuarioActual.crmId) : null;
    
    // Obtener el _id de MongoDB del usuario actual desde allUsers
    const currentUserInList = allUsers.find(u => {
      const userCrmId = u.crmId ? String(u.crmId) : null;
      const userId = u._id?.toString() || u.id?.toString();
      if (userCrmId === currentUserId) return true;
      if (userId === currentUserId) return true;
      if (usuarioActual.email && u.email && usuarioActual.email.toLowerCase() === u.email.toLowerCase()) return true;
      return false;
    });
    
    const currentUserMongoId = currentUserInList?._id?.toString();
    
    // Comparar por _id de MongoDB
    let canPause = false;
    if (currentUserMongoId && assigneeId) {
      canPause = currentUserMongoId === assigneeId;
    }
    
    // Si no coincide por _id, comparar por crmId
    if (!canPause && assigneeCrmId) {
      canPause = assigneeCrmId === currentUserId;
    }
    
    // Si no coincide por ID, intentar comparar por email como fallback
    if (!canPause && usuarioActual.email && activity.assignee.email) {
      canPause = usuarioActual.email.toLowerCase() === activity.assignee.email.toLowerCase();
    }
    
    return canPause;
  };

  const sortActivitiesByOrder = (list) => {
    return [...list].sort((a, b) => {
      if (a.order !== b.order) return (a.order || 0) - (b.order || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  };

  const resetDragState = () => {
    draggedActivityIdRef.current = null;
    dragOverKeyRef.current = null;
    dropPositionRef.current = null;
    setDraggedActivityId(null);
    setDragOverActivityId(null);
    setDropPosition(null);
  };

  const moveActivityInList = (list, fromId, toId, placeAfter) => {
    const sorted = sortActivitiesByOrder(list);
    const fromIndex = sorted.findIndex(a => a.id === fromId);
    const toIndex = sorted.findIndex(a => a.id === toId);
    if (fromIndex === -1 || toIndex === -1) return null;

    let insertIndex = placeAfter ? toIndex + 1 : toIndex;
    const next = [...sorted];
    const [item] = next.splice(fromIndex, 1);
    if (fromIndex < insertIndex) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(insertIndex, next.length));

    if (insertIndex === fromIndex) return null;
    next.splice(insertIndex, 0, item);

    if (next.every((a, i) => a.id === sorted[i].id)) return null;
    return next.map((a, i) => ({ ...a, order: (i + 1) * 1000 }));
  };

  const persistActivityOrders = async (orderedList, previousList) => {
    if (isSavingOrderRef.current) return;
    isSavingOrderRef.current = true;
    try {
      const previousOrders = new Map((previousList || []).map(a => [a.id, a.order || 0]));
      const changed = orderedList.filter(a => previousOrders.get(a.id) !== a.order);
      if (changed.length === 0) return;

      // Una sola petición en lugar de N en paralelo (evita Failed to fetch)
      await reorderActivities(changed.map(a => ({ id: a.id, order: a.order })));
    } catch (err) {
      console.error('Error al guardar orden de actividades:', err);
      if (previousList) setActivities(previousList);
      // Error local, no tumbar toda la página
      alert(err.message || "Error al guardar el orden de los pedidos");
    } finally {
      isSavingOrderRef.current = false;
    }
  };

  const handleDragStart = (e, activity) => {
    if (!puedeGestionar) {
      e.preventDefault();
      return;
    }
    didDropRef.current = false;
    activitiesBeforeDragRef.current = activitiesRef.current;
    draggedActivityIdRef.current = activity.id;
    dragOverKeyRef.current = null;
    dropPositionRef.current = null;
    setDraggedActivityId(activity.id);
    setDragOverActivityId(null);
    setDropPosition(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', activity.id);
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '';
    // Si se canceló el drag (sin drop), no hay nada que revertir en UI
    // porque el orden solo cambia al soltar
    activitiesBeforeDragRef.current = null;
    didDropRef.current = false;
    resetDragState();
  };

  const handleDragOver = (e, activity) => {
    if (!puedeGestionar) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const fromId = draggedActivityIdRef.current;
    if (!fromId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const placeAfter = e.clientY > rect.top + rect.height / 2;
    const position = placeAfter ? 'after' : 'before';
    const key = `${activity.id}:${position}`;

    if (dragOverKeyRef.current === key) return;
    dragOverKeyRef.current = key;
    dropPositionRef.current = fromId === activity.id ? null : position;
    setDragOverActivityId(activity.id);
    setDropPosition(fromId === activity.id ? null : position);
  };

  const handleDragLeave = (e) => {
    // Evitar parpadeo al pasar por hijos del mismo card
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverActivityId(null);
    setDropPosition(null);
    dropPositionRef.current = null;
  };

  const handleDrop = async (e, targetActivity) => {
    e.preventDefault();
    e.stopPropagation();

    const fromId = draggedActivityIdRef.current;
    if (!puedeGestionar || !fromId) {
      resetDragState();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const placeAfter = dropPositionRef.current === 'after'
      || (dropPositionRef.current !== 'before' && e.clientY > rect.top + rect.height / 2);
    const previous = activitiesBeforeDragRef.current || activitiesRef.current;
    const current = activitiesRef.current;

    let nextList = current;
    if (fromId !== targetActivity.id) {
      const reordered = moveActivityInList(current, fromId, targetActivity.id, placeAfter);
      if (reordered) {
        nextList = reordered;
        setActivities(reordered);
      }
    }

    didDropRef.current = true;
    activitiesBeforeDragRef.current = null;
    resetDragState();

    await persistActivityOrders(nextList, previous);
  };

  const addLabel = () => {
    if (newLabel.trim() && !activityFormData.labels.includes(newLabel.trim())) {
      setActivityFormData({
        ...activityFormData,
        labels: [...activityFormData.labels, newLabel.trim()]
      });
      setNewLabel("");
    }
  };

  const removeLabel = (label) => {
    setActivityFormData({
      ...activityFormData,
      labels: activityFormData.labels.filter(l => l !== label)
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    // dueDate es una fecha de calendario guardada en UTC: leerla en UTC evita mostrar el día anterior
    const date = new Date(dateString);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
  };

  const formatDuration = (ms) => {
    if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      baja: "bg-green-900/30 text-green-400 border-green-700",
      media: "bg-yellow-900/30 text-yellow-400 border-yellow-700",
      alta: "bg-orange-900/30 text-orange-400 border-orange-700"
    };
    return colors[priority] || colors.media;
  };

  const getStatusColor = (status) => {
    const colors = {
      pendiente: "bg-slate-900/30 text-slate-400 border-slate-700",
      en_proceso: "bg-blue-900/30 text-blue-400 border-blue-700",
      completada: "bg-green-900/30 text-green-400 border-green-700"
    };
    return colors[status] || colors.pendiente;
  };

  // Mostrar solo el overlay si está cargando Y no hay datos cargados previamente
  const showLoadingOverlay = loading && lists.length === 0 && allUsers.length === 0;

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-200px)]">
      {showLoadingOverlay && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/90 z-50">
          <div className="text-slate-300 text-lg">Cargando pedidos...</div>
        </div>
      )}

      {/* Header - Listas y Usuarios */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Sección de Listas */}
        <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Listas</h2>
            {esAdmin() && (
              <button
                onClick={() => setShowListModal(true)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
              >
                + Nueva
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[120px]">
            {lists.length === 0 ? (
              <div className="w-full text-center py-2">
                <p className="text-xs text-slate-400 mb-2">No hay listas</p>
                {esAdmin() && (
                  <button
                    onClick={() => setShowListModal(true)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
                  >
                    Crear lista
                  </button>
                )}
              </div>
            ) : (
              lists.map((list) => (
                <div
                  key={list.id}
                  className="relative group"
                >
                  <button
                    onClick={() => setSelectedListId(list.id)}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors text-sm whitespace-nowrap w-full ${
                      selectedListId === list.id
                        ? "bg-blue-900/50 border border-blue-700"
                        : "bg-slate-700/50 hover:bg-slate-700 border border-slate-600"
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: list.color }}
                    />
                    <span className="flex-1 text-left">{list.name}</span>
                  </button>
                  {esAdmin() && (
                    <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditList(list);
                        }}
                        className="p-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                        title="Editar lista"
                      >
                        <Icons.Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingListId(list.id);
                        }}
                        className="p-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                        title="Borrar lista"
                      >
                        <Icons.Trash className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sección de Usuarios */}
        <div className="flex-1 md:flex-[2] bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Usuarios Activos</h2>
          <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[120px]">
            {sortedUsers.map((user) => {
              const userId = user._id?.toString() || user.id;
              const isOnline = calculateUserIsOnline(user, usersLastSeen);
              
              return (
                <div
                  key={userId}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isOnline ? "bg-green-500" : "bg-red-500"
                    }`}
                    title={isOnline ? "Online" : "Offline"}
                  />
                  <span className="text-sm text-slate-300 whitespace-nowrap">
                    {user.nombre}
                  </span>
                </div>
              );
            })}
            {allUsers.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2 w-full">
                No hay usuarios
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Panel de Actividades - Ocupa todo el ancho */}
      <div className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 overflow-y-auto min-h-[400px]">
        {error && !loading && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            <p className="font-semibold mb-1">Error:</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => loadData()}
              className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
            >
              Reintentar
            </button>
          </div>
        )}
        
        {selectedList ? (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedList.color }}
                />
                <h2 className="text-xl font-semibold truncate">{selectedList.name}</h2>
              </div>
              {puedeGestionar && (
                <button
                  onClick={() => {
                    setEditingActivity(null);
                    setActivityFormData({
                      title: "",
                      description: "",
                    priority: "media",
                    status: "pendiente",
                    dueDate: "",
                    assignee: "",
                    labels: []
                  });
                  setNewLabel("");
                  setShowActivityModal(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium flex-shrink-0"
              >
                + Nuevo Pedido
              </button>
              )}
            </div>

            {/* Búsqueda y Filtros */}
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Búsqueda por palabras clave */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Buscar pedidos
                  </label>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Título, descripción, etiquetas..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
                  />
                </div>
                
                {/* Filtro de Estado */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Estado
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                  >
                    <option value="">Todos (recientes)</option>
                    <option value="pendiente">Pendiente/En Proceso</option>
                    <option value="completada">Completada</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <p className="text-[11px] text-slate-500 md:pb-2">
                    {filterStatus === "completada"
                      ? "El rango filtra por fecha de completado (historial incluido)"
                      : "El rango filtra por vencimiento. Si no tiene, usa la fecha del nombre (05 11 = 05/11) o la de creación"}
                  </p>
                </div>
              </div>

              {/* Rango de fechas */}
              <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Desde</label>
                      <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Hasta</label>
                      <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        min={filterDateFrom || undefined}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMonthRange(0)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs text-slate-200"
                    >
                      Este mes
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthRange(-1)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs text-slate-200"
                    >
                      Mes anterior
                    </button>
                    {mostrandoCarga && (
                      <button
                        type="button"
                        disabled
                        className="px-3 py-2 bg-blue-900/70 border border-blue-600 rounded-lg text-xs text-blue-100 cursor-wait"
                      >
                        Cargando...
                      </button>
                    )}
                    {(filterDateFrom || filterDateTo) && (
                      <button
                        type="button"
                        onClick={clearDateRange}
                        className="px-3 py-2 bg-slate-700 hover:bg-red-900/40 border border-slate-600 rounded-lg text-xs text-slate-300"
                      >
                        Limpiar fechas
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Lista de Actividades */}
            <div
              className="space-y-1"
              onDragOver={(e) => {
                if (!puedeGestionar || !draggedActivityIdRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
            >
              {mostrandoCarga ? (
                <p className="text-blue-200 text-center py-8">Cargando...</p>
              ) : filteredActivities.length === 0 ? (
                <p className="text-slate-400 text-center py-8">
                  {searchKeyword.trim() || filterDateFrom || filterDateTo
                    ? "No hay pedidos que coincidan con la búsqueda"
                    : activities.length === 0
                    ? "No hay pedidos en esta lista"
                    : "No hay pedidos que coincidan con el filtro"}
                </p>
              ) : (
                filteredActivities.map((activity) => (
                  <div
                    key={activity.id}
                    draggable={puedeGestionar}
                    onDragStart={(e) => handleDragStart(e, activity)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, activity)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, activity)}
                    className={`relative px-4 py-2.5 rounded-lg border transition-colors ${
                      activity.status === "completada"
                        ? "bg-slate-800/50 border-slate-700 opacity-60"
                        : esActividadAsignada(activity)
                        ? "bg-slate-800 border-violet-500 border-2"
                        : "bg-slate-800 border-slate-700"
                    } ${
                      puedeGestionar ? "cursor-grab active:cursor-grabbing hover:border-blue-600" : ""
                    } ${
                      draggedActivityId === activity.id ? "opacity-40 scale-[0.99]" : ""
                    } ${
                      dragOverActivityId === activity.id && draggedActivityId !== activity.id
                        ? "border-blue-500 bg-blue-900/10"
                        : ""
                    }`}
                  >
                    {/* Indicador de posición de drop */}
                    {dragOverActivityId === activity.id && dropPosition === 'before' && draggedActivityId !== activity.id && (
                      <div className="absolute -top-0.5 left-2 right-2 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] z-10 pointer-events-none" />
                    )}
                    {dragOverActivityId === activity.id && dropPosition === 'after' && draggedActivityId !== activity.id && (
                      <div className="absolute -bottom-0.5 left-2 right-2 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] z-10 pointer-events-none" />
                    )}
                    <div className="flex items-center gap-3">
                      {/* Icono de arrastre */}
                      {puedeGestionar && (
                        <div className="text-slate-500 opacity-40 flex-shrink-0 pointer-events-none">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"></path>
                          </svg>
                        </div>
                      )}
                      
                      {/* Contenido principal - diseño horizontal */}
                      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                        {/* Título */}
                        <div className="flex-1 min-w-[200px]">
                          <h3
                            className={`font-medium text-xs md:text-sm ${
                              activity.status === "completada"
                                ? "line-through text-slate-400"
                                : "text-slate-200"
                            }`}
                          >
                            {activity.title}
                          </h3>
                          {activity.description && (
                            <p className="text-[10px] md:text-xs text-slate-400 truncate mt-0.5">
                              {activity.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Etiquetas (chips) */}
                        {activity.labels && activity.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {activity.labels.slice(0, 3).map((label, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 text-[10px] md:text-xs rounded border border-blue-700"
                              >
                                {label}
                              </span>
                            ))}
                            {activity.labels.length > 3 && (
                              <span className="px-1.5 py-0.5 text-slate-500 text-[10px] md:text-xs">
                                +{activity.labels.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Responsable */}
                        {activity.assignee && (() => {
                          const assigneeId = activity.assignee._id?.toString() || activity.assignee.id?.toString();
                          // Buscar el usuario completo en allUsers para obtener lastSeen
                          const assigneeUser = allUsers.find(u => {
                            const userId = u._id?.toString() || u.id?.toString();
                            return userId === assigneeId || 
                                   (u.email && activity.assignee.email && u.email.toLowerCase() === activity.assignee.email.toLowerCase());
                          });
                          const isOnline = assigneeUser ? calculateUserIsOnline(assigneeUser, usersLastSeen) : false;
                          
                          return (
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 whitespace-nowrap">
                              <div
                                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  isOnline ? "bg-green-500" : "bg-red-500"
                                }`}
                                title={isOnline ? "Online" : "Offline"}
                              />
                              <Icons.User className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="truncate max-w-[120px]">
                                {activity.assignee.nombre || activity.assignee.name}
                              </span>
                            </div>
                          );
                        })()}
                        
                        {/* Fecha límite */}
                        {activity.dueDate && (
                          <div className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 whitespace-nowrap">
                            <Icons.Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span>{formatDate(activity.dueDate)}</span>
                          </div>
                        )}

                        {/* Cronómetro en curso */}
                        {activity.status === "en_proceso" && (() => {
                          const mem = getTimerMem(activity.id);
                          const baseMs = mem?.baseMs ?? (activity.elapsedMs || 0);
                          const runStartedAt = mem?.runStartedAt
                            ?? (activity.startedAt ? new Date(activity.startedAt).getTime() : null);
                          if (!runStartedAt && baseMs <= 0) return null;
                          return (
                            <LivePedidoTimer
                              key={`${activity.id}-${runStartedAt || 'paused'}-${baseMs}`}
                              baseMs={baseMs}
                              runStartedAt={runStartedAt}
                              formatDuration={formatDuration}
                            />
                          );
                        })()}
                        {activity.status === "pendiente" && (() => {
                          const mem = getTimerMem(activity.id);
                          const frozen = mem?.baseMs ?? activity.elapsedMs ?? 0;
                          if (frozen <= 0) return null;
                          return (
                            <div
                              className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 whitespace-nowrap font-mono"
                              title="Tiempo acumulado (pausado)"
                            >
                              <Icons.Pause className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span>{formatDuration(frozen)}</span>
                            </div>
                          );
                        })()}

                        {/* Demora + quién completó */}
                        {activity.status === "completada" && (
                          <div
                            className="flex items-center gap-1.5 text-[10px] md:text-xs text-emerald-300/90 whitespace-nowrap"
                            title={
                              activity.completedAt
                                ? `Completado: ${new Date(activity.completedAt).toLocaleString('es-AR')}`
                                : "Pedido completado"
                            }
                          >
                            <span className="font-mono">
                              {formatDuration(
                                typeof activity.durationMs === "number"
                                  ? activity.durationMs
                                  : activity.startedAt && activity.completedAt
                                  ? new Date(activity.completedAt) - new Date(activity.startedAt)
                                  : null
                              )}
                            </span>
                            {(activity.completedBy?.nombre || activity.completedBy?.name) && (
                              <span className="text-slate-400">
                                · {activity.completedBy.nombre || activity.completedBy.name}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Prioridad */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] md:text-xs border whitespace-nowrap ${getPriorityColor(
                            activity.priority
                          )}`}
                        >
                          {activity.priority.charAt(0).toUpperCase() +
                            activity.priority.slice(1)}
                        </span>
                        
                        {/* Estado */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] md:text-xs border whitespace-nowrap ${getStatusColor(
                            activity.status
                          )}`}
                        >
                          {activity.status === "completada"
                            ? "Completada"
                            : activity.status === "en_proceso"
                            ? "En Proceso"
                            : "Pendiente"}
                        </span>
                      </div>
                      
                      {/* Botones de acción */}
                      {(puedeGestionar || puedePonerEnProceso(activity) || puedePausarActividad(activity) || (activity.status === "en_proceso" && esActividadAsignada(activity))) && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Botón "En Proceso" - visible para admin/coordinador o usuario asignado cuando está pendiente */}
                          {activity.status === "pendiente" && puedePonerEnProceso(activity) && (
                            <button
                              onClick={() => handleStartActivity(activity)}
                              className="px-1.5 py-0.5 md:px-2 md:py-1 bg-purple-600 hover:bg-purple-700 rounded text-[10px] md:text-xs font-medium"
                              title="En Proceso"
                            >
                              <Icons.Play className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            </button>
                          )}
                          {/* Botones cuando está en proceso */}
                          {activity.status === "en_proceso" && (
                            <>
                              {/* Botón pausar - visible para admin/coordinador o usuario asignado */}
                              {(puedeGestionar || puedePausarActividad(activity)) && (
                                <button
                                  onClick={() => handleResetActivity(activity)}
                                  className="px-1.5 py-0.5 md:px-2 md:py-1 bg-slate-600 hover:bg-slate-700 rounded text-[10px] md:text-xs font-medium"
                                  title="Volver a Pendiente"
                                >
                                  <Icons.Pause className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                </button>
                              )}
                              {/* Completar: admin/coordinador o usuario asignado */}
                              {(puedeGestionar || esActividadAsignada(activity)) && (
                                <button
                                  onClick={() => handleCompleteActivity(activity)}
                                  className="px-1.5 py-0.5 md:px-2 md:py-1 bg-green-600 hover:bg-green-700 rounded text-[10px] md:text-xs font-medium"
                                  title="Completar"
                                >
                                  <Icons.Check className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                          {/* Botón reabrir - solo admin/coordinador cuando está completada */}
                          {activity.status === "completada" && puedeGestionar && (
                            <button
                              onClick={() => handleResetActivity(activity)}
                              className="px-1.5 py-0.5 md:px-2 md:py-1 bg-slate-600 hover:bg-slate-700 rounded text-[10px] md:text-xs font-medium"
                              title="Reabrir"
                            >
                              <Icons.Refresh className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            </button>
                          )}
                          {/* Botones de editar y eliminar - solo admin/coordinador */}
                          {puedeGestionar && (
                            <>
                              <button
                                onClick={() => handleEditActivity(activity)}
                                className="px-1.5 py-0.5 md:px-2 md:py-1 bg-blue-600 hover:bg-blue-700 rounded text-[10px] md:text-xs font-medium"
                                title="Editar"
                              >
                                <Icons.Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingActivityId(activity.id)}
                                className="px-1.5 py-0.5 md:px-2 md:py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] md:text-xs font-medium"
                                title="Eliminar"
                              >
                                <Icons.Trash className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm max-w-md">
                {error}
              </div>
            )}
            {lists.length === 0 ? (
              <div className="text-center">
                <p className="text-slate-400 mb-4">
                  No hay listas de pedidos. {esAdmin() ? 'Crea una nueva lista para comenzar.' : 'Contacta a un administrador para crear listas.'}
                </p>
                {esAdmin() && (
                  <button
                    onClick={() => setShowListModal(true)}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
                  >
                    + Crear Primera Lista
                  </button>
                )}
              </div>
            ) : (
              <p className="text-slate-400">
                Selecciona una lista de pedidos del panel lateral
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modal - Nueva/Editar Lista */}
      {showListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">
                {editingList ? "Editar Lista" : "Nueva Lista"}
              </h3>
              <form onSubmit={handleCreateList} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={listFormData.name}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={listFormData.description}
                    onChange={(e) =>
                      setListFormData({
                        ...listFormData,
                        description: e.target.value
                      })
                    }
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Color</label>
                  <input
                    type="color"
                    value={listFormData.color}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, color: e.target.value })
                    }
                    className="w-full h-10 bg-slate-700 border border-slate-600 rounded-lg"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowListModal(false);
                      setEditingList(null);
                      setListFormData({ name: "", description: "", color: "#22c55e" });
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : editingList ? "Actualizar" : "Crear"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Nueva/Editar Pedido */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center p-4 pb-20 md:pb-4 md:items-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg max-h-[calc(100vh-120px)] md:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 pb-6 pt-6">
              <h3 className="text-xl font-semibold mb-6">
                {editingActivity ? "Editar Pedido" : "Nuevo Pedido"}
              </h3>
              {error && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleCreateActivity} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={activityFormData.title}
                    onChange={(e) =>
                      setActivityFormData({
                        ...activityFormData,
                        title: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={activityFormData.description}
                    onChange={(e) =>
                      setActivityFormData({
                        ...activityFormData,
                        description: e.target.value
                      })
                    }
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Prioridad
                    </label>
                    <select
                      value={activityFormData.priority}
                      onChange={(e) =>
                        setActivityFormData({
                          ...activityFormData,
                          priority: e.target.value
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Estado
                    </label>
                    <select
                      value={activityFormData.status}
                      onChange={(e) =>
                        setActivityFormData({
                          ...activityFormData,
                          status: e.target.value
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="completada">Completada</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Fecha Límite
                  </label>
                  <input
                    type="date"
                    value={activityFormData.dueDate}
                    onChange={(e) =>
                      setActivityFormData({
                        ...activityFormData,
                        dueDate: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Responsable
                  </label>
                  <select
                    value={activityFormData.assignee}
                    onChange={(e) =>
                      setActivityFormData({
                        ...activityFormData,
                        assignee: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {allUsers.map((user) => (
                      <option
                        key={user.id || user._id}
                        value={user._id || user.id}
                      >
                        {user.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Etiquetas
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
                      placeholder="Agregar etiqueta"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addLabel}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm whitespace-nowrap"
                    >
                      Agregar
                    </button>
                  </div>
                  {activityFormData.labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {activityFormData.labels.map((label, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-700 flex items-center gap-1"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => removeLabel(label)}
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
                  <button
                    type="button"
                    onClick={() => {
                      setShowActivityModal(false);
                      setEditingActivity(null);
                      setActivityFormData({
                        title: "",
                        description: "",
                        priority: "media",
                        status: "pendiente",
                        dueDate: "",
                        assignee: "",
                        labels: []
                      });
                      setNewLabel("");
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving
                      ? "Guardando..."
                      : editingActivity
                      ? "Actualizar"
                      : "Crear"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Confirmar Eliminación de Actividad */}
      {deletingActivityId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg border border-red-700 p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-red-400 mb-2">
              Confirmar eliminación
            </h3>
            <p className="text-slate-300 mb-4">
              ¿Estás seguro de que deseas eliminar este pedido?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingActivityId(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteActivity}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Confirmar Eliminación de Lista */}
      {deletingListId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg border border-red-700 p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-red-400 mb-2">
              Confirmar eliminación
            </h3>
            <p className="text-slate-300 mb-4">
              ¿Estás seguro de que deseas eliminar esta lista? Esta acción también eliminará todos los pedidos asociados y no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingListId(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteList}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <ActivitiesPageContent />
      </div>
    </ProtectedRoute>
  );
}
