"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getActivityLists, createActivityList, updateActivityList, deleteActivityList } from "../../lib/activitiesUtils";
import { getActivities, createActivity, updateActivity, deleteActivity } from "../../lib/activitiesUtils";
import { getUsuarioActual, puedeGestionarActividades, esAdmin } from "../../lib/authUtils";
import { getUsuarios } from "../../lib/usuariosUtils";
import ProtectedRoute from "../../components/ProtectedRoute";
import { Icons } from "../../components/Icons";

function ActivitiesPageContent() {
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("pendiente");
  const [searchKeyword, setSearchKeyword] = useState("");
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

  useEffect(() => {
    if (selectedListId) {
      loadActivities(selectedListId);
    } else {
      setActivities([]);
    }
  }, [selectedListId, filterStatus]);

  // Recargar actividades periódicamente para sincronización en tiempo real
  useEffect(() => {
    if (!selectedListId) return;

    // Recargar actividades cada 5 segundos para mantener sincronización casi en tiempo real
    const activitiesInterval = setInterval(() => {
      loadActivities(selectedListId);
    }, 5000);

    return () => clearInterval(activitiesInterval);
  }, [selectedListId, filterStatus]);

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
      const errorMessage = err.message || "Error al cargar las listas de actividades. Verifica tu conexión e intenta nuevamente.";
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

  const loadActivities = async (listId) => {
    try {
      setError("");
      const filters = {};
      // Si el filtro es "pendiente", no enviarlo al backend para que cargue todas las actividades
      // y luego el frontend filtrará pendiente y en_proceso juntos
      if (filterStatus && filterStatus !== "pendiente") {
        filters.status = filterStatus;
      }
      // Note: assigneeId filter can be added later if needed
      const activitiesData = await getActivities(listId, filters);
      setActivities(activitiesData);
    } catch (err) {
      console.error('Error al cargar actividades:', err);
      setError(err.message || "Error al cargar las actividades");
    }
  };

  const selectedList = useMemo(() => {
    return lists.find(l => l.id === selectedListId);
  }, [lists, selectedListId]);

  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Filtrar por estado
    if (filterStatus) {
      if (filterStatus === "pendiente") {
        // Incluir pendiente y en_proceso como subestados de pendiente
        filtered = filtered.filter(a => a.status === "pendiente" || a.status === "en_proceso");
      } else {
        filtered = filtered.filter(a => a.status === filterStatus);
      }
    }

    // Filtrar por búsqueda (palabra clave)
    if (searchKeyword.trim()) {
      const keywordLower = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter(a => {
        // Buscar en título
        if (a.title?.toLowerCase().includes(keywordLower)) return true;
        // Buscar en descripción
        if (a.description?.toLowerCase().includes(keywordLower)) return true;
        // Buscar en nombre del responsable
        if (a.assignee?.nombre?.toLowerCase().includes(keywordLower)) return true;
        if (a.assignee?.name?.toLowerCase().includes(keywordLower)) return true;
        // Buscar en etiquetas
        if (a.labels?.some(label => label.toLowerCase().includes(keywordLower))) return true;
        return false;
      });
    }

    return filtered.sort((a, b) => {
      // Sort by order first, then by creation date
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [activities, filterStatus, searchKeyword]);

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
        await updateActivity(editingActivity.id, activityData);
      } else {
        console.log('[Activities] Creando nueva actividad');
        await createActivity(activityData);
      }
      
      console.log('[Activities] Actividad guardada, recargando lista...');
      await loadActivities(selectedListId);
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
      setError(err.message || "Error al guardar la actividad. Verifica la consola para más detalles.");
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
      await deleteActivity(deletingActivityId);
      await loadActivities(selectedListId);
      setDeletingActivityId(null);
    } catch (err) {
      setError(err.message || "Error al eliminar la actividad");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeActivityStatus = async (activity, newStatus) => {
    try {
      await updateActivity(activity.id, { status: newStatus });
      await loadActivities(selectedListId);
    } catch (err) {
      setError(err.message || "Error al cambiar el estado de la actividad");
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

  const handleDragStart = (e, activity) => {
    if (!puedeGestionar) return;
    setDraggedActivityId(activity.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', activity.id);
    // Hacer el elemento semi-transparente mientras se arrastra
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '';
    setDraggedActivityId(null);
    setDragOverActivityId(null);
  };

  const handleDragOver = (e, activity) => {
    if (!puedeGestionar || draggedActivityId === activity.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverActivityId(activity.id);
  };

  const handleDragLeave = (e) => {
    setDragOverActivityId(null);
  };

  const handleDrop = async (e, targetActivity) => {
    if (!puedeGestionar || !draggedActivityId || draggedActivityId === targetActivity.id) {
      setDragOverActivityId(null);
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const draggedIndex = filteredActivities.findIndex(a => a.id === draggedActivityId);
      const targetIndex = filteredActivities.findIndex(a => a.id === targetActivity.id);
      
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        setDragOverActivityId(null);
        return;
      }

      // Calcular nuevo orden basado en la posición
      // Si movemos hacia abajo, el nuevo order será mayor que el target
      // Si movemos hacia arriba, el nuevo order será menor que el target
      const movedDown = draggedIndex < targetIndex;
      
      let newOrder;
      if (movedDown) {
        // Moviendo hacia abajo: poner después de la actividad objetivo
        // Usar el order de la siguiente actividad o targetOrder + 1000
        const nextIndex = targetIndex + 1;
        if (nextIndex < filteredActivities.length) {
          const nextActivity = filteredActivities[nextIndex];
          const nextOrder = nextActivity.order || 0;
          const targetOrder = targetActivity.order || 0;
          // Calcular un order intermedio
          newOrder = Math.floor((targetOrder + nextOrder) / 2);
          // Si es el mismo, incrementar
          if (newOrder === targetOrder) {
            newOrder = targetOrder + 500;
          }
        } else {
          // Es la última, usar un order mayor
          const targetOrder = targetActivity.order || 0;
          newOrder = targetOrder + 1000;
        }
      } else {
        // Moviendo hacia arriba: poner antes de la actividad objetivo
        // Usar el order de la actividad anterior o targetOrder - 1000
        const prevIndex = targetIndex - 1;
        if (prevIndex >= 0) {
          const prevActivity = filteredActivities[prevIndex];
          const prevOrder = prevActivity.order || 0;
          const targetOrder = targetActivity.order || 0;
          // Calcular un order intermedio
          newOrder = Math.floor((prevOrder + targetOrder) / 2);
          // Si es el mismo o menor, decrementar
          if (newOrder >= targetOrder || newOrder <= 0) {
            newOrder = Math.max(1, targetOrder - 500);
          }
        } else {
          // Es la primera, usar un order menor
          const targetOrder = targetActivity.order || 1000;
          newOrder = Math.max(1, targetOrder - 1000);
        }
      }
      
      // Asegurar que el order sea positivo
      if (newOrder <= 0) {
        newOrder = 1;
      }
      
      console.log('[Activities] Moviendo actividad:', {
        draggedId: draggedActivityId,
        targetId: targetActivity.id,
        draggedIndex,
        targetIndex,
        movedDown,
        newOrder,
        targetOrder: targetActivity.order
      });
      
      // Actualizar el order de la actividad arrastrada
      await updateActivity(draggedActivityId, { order: newOrder });
      
      // Recargar actividades para reflejar el nuevo orden
      await loadActivities(selectedListId);
      
      setDragOverActivityId(null);
      setDraggedActivityId(null);
    } catch (err) {
      console.error('Error al mover actividad:', err);
      setError(err.message || "Error al mover la actividad");
      setDragOverActivityId(null);
      setDraggedActivityId(null);
    }
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
    const date = new Date(dateString);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${date.getDate()} ${months[date.getMonth()]}`;
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
          <div className="text-slate-300 text-lg">Cargando actividades...</div>
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
                + Nueva Actividad
              </button>
              )}
            </div>

            {/* Búsqueda y Filtros */}
            <div className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Búsqueda por palabras clave */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Buscar actividades
                  </label>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Buscar por título, descripción, responsable o etiquetas..."
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
                    <option value="">Todos</option>
                    <option value="pendiente">Pendiente/En Proceso</option>
                    <option value="completada">Completada</option>
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Lista de Actividades */}
            <div className="space-y-1">
              {filteredActivities.length === 0 ? (
                <p className="text-slate-400 text-center py-8">
                  {activities.length === 0
                    ? "No hay actividades en esta lista"
                    : searchKeyword.trim() || filterStatus
                    ? "No hay actividades que coincidan con los filtros o búsqueda"
                    : "No hay actividades"}
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
                    className={`relative px-4 py-2.5 rounded-lg border transition-all ${
                      activity.status === "completada"
                        ? "bg-slate-800/50 border-slate-700 opacity-60"
                        : esActividadAsignada(activity)
                        ? "bg-slate-800 border-violet-500 border-2"
                        : "bg-slate-800 border-slate-700"
                    } ${
                      puedeGestionar ? "cursor-move hover:border-blue-600" : ""
                    } ${
                      draggedActivityId === activity.id ? "opacity-30" : ""
                    } ${
                      dragOverActivityId === activity.id ? "border-blue-500 border-2 bg-blue-900/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icono de arrastre */}
                      {puedeGestionar && (
                        <div className="text-slate-500 opacity-40 flex-shrink-0">
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
                      {(puedeGestionar || puedePonerEnProceso(activity) || puedePausarActividad(activity)) && (
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
                              {/* Botón completar - solo admin/coordinador */}
                              {puedeGestionar && (
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
                  No hay listas de actividades. {esAdmin() ? 'Crea una nueva lista para comenzar.' : 'Contacta a un administrador para crear listas.'}
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
                Selecciona una lista de actividades del panel lateral
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

      {/* Modal - Nueva/Editar Actividad */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center p-4 pb-20 md:pb-4 md:items-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg max-h-[calc(100vh-120px)] md:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 pb-6 pt-6">
              <h3 className="text-xl font-semibold mb-6">
                {editingActivity ? "Editar Actividad" : "Nueva Actividad"}
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
              ¿Estás seguro de que deseas eliminar esta actividad?
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
              ¿Estás seguro de que deseas eliminar esta lista? Esta acción también eliminará todas las actividades asociadas y no se puede deshacer.
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
        <h1 className="text-2xl font-semibold">Actividades</h1>
        <ActivitiesPageContent />
      </div>
    </ProtectedRoute>
  );
}
