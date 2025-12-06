"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";
import Link from "next/link";

// Hacer la página dinámica para evitar pre-renderizado
export const dynamic = 'force-dynamic';

// Componente interno que usa useSearchParams
function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const carpetaParam = searchParams.get("carpeta") || "INBOX";
  const uidParam = searchParams.get("uid");

  const [carpetas, setCarpetas] = useState([]);
  const [carpetaActual, setCarpetaActual] = useState(carpetaParam);
  const [emails, setEmails] = useState([]);
  const [emailSeleccionado, setEmailSeleccionado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [accionando, setAccionando] = useState(false);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  
  // Cache local en memoria del cliente para acceso ultra-rápido
  const [localEmailCache, setLocalEmailCache] = useState(new Map());
  
  // Refs para controlar el estado de carga y prevenir race conditions
  const carpetaCargandoRef = useRef(carpetaParam);
  const cargaEnProgresoRef = useRef(false);
  const timeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const cargaInicialRef = useRef(false);

  // Cargar carpetas disponibles
  const fetchCarpetas = async () => {
    try {
      const res = await fetch("/api/email/folders");
      const data = await res.json();
      if (data.success) {
        setCarpetas(data.carpetas || []);
      }
    } catch (err) {
      console.error("Error cargando carpetas:", err);
      setCarpetas([]);
    }
  };

  /**
   * Sincroniza una carpeta en segundo plano sin bloquear la UI
   */
  const sincronizarEnSegundoPlano = useCallback((carpeta) => {
    // Usar timeout para evitar múltiples sincronizaciones simultáneas
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(async () => {
      try {
        const syncRes = await fetch(`/api/email/sync?carpeta=${encodeURIComponent(carpeta)}&limit=20`);
        const syncData = await syncRes.json();
        
        if (syncData.success && carpetaCargandoRef.current === carpeta) {
          // Actualizar lista si hay cambios
          const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20&forceRefresh=true`);
          const data = await res.json();
          
          if (data.success && data.mensajes && carpetaCargandoRef.current === carpeta) {
            setEmails(data.mensajes);
            console.log(`✅ Lista actualizada en segundo plano: ${data.mensajes.length} correos`);
          }
        }
      } catch (err) {
        console.warn('Error en sincronización en segundo plano:', err);
      }
    }, 1000); // Esperar 1 segundo antes de sincronizar
  }, []);

  /**
   * Función centralizada y robusta para cargar correos de una carpeta
   * Maneja todo el flujo: caché, sincronización y actualización
   */
  const cargarCarpeta = useCallback(async (carpeta, opciones = {}) => {
    const { forzarRefresh = false, mostrarLoading = true } = opciones;
    
    // Prevenir múltiples cargas simultáneas de la misma carpeta
    if (cargaEnProgresoRef.current && carpetaCargandoRef.current === carpeta && !forzarRefresh) {
      console.log(`⚠️ Carga ya en progreso para ${carpeta}, ignorando llamada duplicada`);
      return;
    }

    // Cancelar cualquier carga anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Actualizar refs y estado
    carpetaCargandoRef.current = carpeta;
    cargaEnProgresoRef.current = true;
    abortControllerRef.current = new AbortController();
    
    setError("");
    if (mostrarLoading) {
      setLoading(true);
    }

    try {
      // Paso 1: Intentar cargar desde caché (ultra-rápido, solo si no se fuerza refresh)
      if (!forzarRefresh) {
        try {
          const cacheRes = await fetch(
            `/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20&cacheOnly=true`,
            { signal: abortControllerRef.current.signal }
          );
          
          if (!abortControllerRef.current.signal.aborted && cacheRes.ok) {
            const cacheData = await cacheRes.json();
            
            // Mostrar caché incluso si está vacío (para evitar pantalla en blanco)
            if (cacheData.success && carpetaCargandoRef.current === carpeta) {
              setEmails(cacheData.mensajes || []);
              setLoading(false);
              
              if (cacheData.mensajes && cacheData.mensajes.length > 0) {
                console.log(`✅ Emails cargados desde caché: ${cacheData.mensajes.length} correos`);
              } else {
                console.log(`✅ Caché vacío para ${carpeta}, sincronizando...`);
              }
              
              // Sincronizar en segundo plano para actualizar (sin bloquear)
              sincronizarEnSegundoPlano(carpeta);
              
              // Si hay datos en caché, retornar (ya se mostraron)
              // Si no hay datos, continuar con sincronización inmediata
              if (cacheData.mensajes && cacheData.mensajes.length > 0) {
                return;
              }
            }
          }
        } catch (cacheError) {
          if (cacheError.name !== 'AbortError') {
            console.warn('Error cargando desde caché:', cacheError);
          }
        }
      }

      // Paso 2: Si no hay caché o se fuerza refresh, sincronizar y cargar desde servidor
      if (carpetaCargandoRef.current === carpeta) {
        // Asegurar que siempre hay algo mostrado (incluso si es vacío)
        if (emails.length === 0) {
          setEmails([]);
        }
        setSincronizando(true);
        
        // Limpiar caché si se fuerza refresh
        if (forzarRefresh) {
          try {
            await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20&forceRefresh=true`, {
              signal: abortControllerRef.current.signal
            });
          } catch (e) {
            // Ignorar errores de limpieza
          }
        }

        // Sincronizar desde servidor
        try {
          const syncRes = await fetch(
            `/api/email/sync?carpeta=${encodeURIComponent(carpeta)}&limit=20`,
            { signal: abortControllerRef.current.signal }
          );
          
          if (!abortControllerRef.current.signal.aborted && syncRes.ok) {
            const syncData = await syncRes.json();
            
            if (syncData.success && carpetaCargandoRef.current === carpeta) {
              console.log(`✅ Sincronización completada: ${syncData.sincronizados || 0} correos`);
              
              // Obtener lista actualizada
              const res = await fetch(
                `/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20&forceRefresh=true`,
                { signal: abortControllerRef.current.signal }
              );
              
              if (!abortControllerRef.current.signal.aborted && res.ok) {
                const data = await res.json();
                
                if (data.success && carpetaCargandoRef.current === carpeta) {
                  setEmails(data.mensajes || []);
                  setSincronizando(false);
                  setLoading(false);
                  console.log(`✅ Lista actualizada: ${data.mensajes?.length || 0} correos`);
                  return;
                }
              }
            }
          }
        } catch (syncError) {
          if (syncError.name === 'AbortError') {
            return; // Carga cancelada
          }
          console.warn('Error sincronizando:', syncError);
        }

        // Paso 3: Fallback - intentar cargar desde API sin sincronizar
        // Esto asegura que siempre se muestre algo, incluso si la sincronización falla
        try {
          const res = await fetch(
            `/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20`,
            { signal: abortControllerRef.current.signal }
          );
          
          if (!abortControllerRef.current.signal.aborted && res.ok) {
            const data = await res.json();
            
            if (data.success && carpetaCargandoRef.current === carpeta) {
              // CRÍTICO: Siempre mostrar algo, incluso si está vacío
              setEmails(data.mensajes || []);
              setSincronizando(data.sincronizando || false);
              setLoading(false);
              
              // Si está sincronizando, esperar y verificar periódicamente
              if (data.sincronizando) {
                // Llamar directamente sin usar la función del callback para evitar dependencias circulares
                let intentos = 0;
                const maxIntentos = 20;
                
                const intervalo = setInterval(async () => {
                  intentos++;
                  
                  if (carpetaCargandoRef.current !== carpeta) {
                    clearInterval(intervalo);
                    setSincronizando(false);
                    return;
                  }
                  
                  try {
                    const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpeta)}&limit=20&forceRefresh=true`);
                    const data = await res.json();
                    
                    if (data.success && carpetaCargandoRef.current === carpeta) {
                      if (data.mensajes && data.mensajes.length > 0) {
                        setEmails(data.mensajes);
                        setSincronizando(false);
                        clearInterval(intervalo);
                        console.log(`✅ Sincronización completada: ${data.mensajes.length} correos`);
                        return;
                      }
                      
                      if (intentos >= 5) {
                        setEmails([]);
                        setSincronizando(false);
                        clearInterval(intervalo);
                        console.log(`✅ Sincronización completada: carpeta vacía`);
                        return;
                      }
                    }
                  } catch (err) {
                    console.warn(`⚠️ Error en intento ${intentos}:`, err);
                  }
                  
                  if (intentos >= maxIntentos) {
                    setSincronizando(false);
                    clearInterval(intervalo);
                  }
                }, 500);
              } else {
                // Si no está sincronizando y no hay mensajes, puede estar vacía
                console.log(`✅ Carpeta ${carpeta} cargada: ${data.mensajes?.length || 0} correos`);
              }
            }
          }
        } catch (apiError) {
          if (apiError.name !== 'AbortError' && carpetaCargandoRef.current === carpeta) {
            // Si falla todo, al menos mostrar array vacío
            setEmails([]);
            setLoading(false);
            setSincronizando(false);
            console.warn('Error cargando desde API:', apiError);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError' && carpetaCargandoRef.current === carpeta) {
        console.error("Error cargando correos:", err);
        setError(err.message || "Error desconocido al cargar los correos");
        setLoading(false);
        setSincronizando(false);
      }
    } finally {
      if (carpetaCargandoRef.current === carpeta) {
        cargaEnProgresoRef.current = false;
      }
    }
  }, [emails.length]);

  // Cargar correo individual
  const fetchEmail = async (uid, carpeta = carpetaActual) => {
    try {
      setError("");
      const carpetaParaBuscar = carpeta || carpetaActual;
      const cacheKey = `${uid}-${carpetaParaBuscar}`;
      
      // Verificar cache local primero
      const cachedLocal = localEmailCache.get(cacheKey);
      if (cachedLocal && cachedLocal.contenidoCompleto) {
        setEmailSeleccionado(cachedLocal.mensaje);
        setLoading(false);
        
        // Marcar como leído automáticamente si no lo está
        if (!cachedLocal.mensaje.leido) {
          fetch("/api/email/mark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const correoActualizado = { ...cachedLocal.mensaje, leido: true };
              setEmailSeleccionado(correoActualizado);
              setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
              
              setLocalEmailCache(prev => {
                const newCache = new Map(prev);
                newCache.set(cacheKey, {
                  mensaje: correoActualizado,
                  contenidoCompleto: true,
                  timestamp: Date.now()
                });
                return newCache;
              });
            }
          })
          .catch(err => console.warn('Error marcando como leído:', err));
        }
        return;
      }
      
      // Cargar desde API
      setLoading(true);
      const res = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Error al cargar el correo");
      }

      if (data.mensaje) {
        setEmailSeleccionado(data.mensaje);
        
        // Guardar en cache local
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, {
            mensaje: data.mensaje,
            contenidoCompleto: true,
            timestamp: Date.now()
          });
          if (newCache.size > 20) {
            const firstKey = newCache.keys().next().value;
            newCache.delete(firstKey);
          }
          return newCache;
        });
        
        // Marcar como leído automáticamente
        if (!data.mensaje.leido) {
          fetch("/api/email/mark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
          })
          .then(res => res.json())
          .then(markData => {
            if (markData.success) {
              const correoActualizado = { ...data.mensaje, leido: true };
              setEmailSeleccionado(correoActualizado);
              setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
            }
          })
          .catch(err => console.warn('Error marcando como leído:', err));
        }
      }
    } catch (err) {
      console.error("Error cargando correo:", err);
      setError(err.message || "Error al cargar el correo");
    } finally {
      setLoading(false);
    }
  };

  // Marcar como leído/no leído
  const marcarComoLeido = async (uid, leido) => {
    try {
      setAccionando(true);
      const res = await fetch("/api/email/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, carpeta: carpetaActual, leido }),
      });

      const data = await res.json();
      if (data.success) {
        // Actualizar estado local inmediatamente
        setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido } : e)));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ ...emailSeleccionado, leido });
        }
        
        // Actualizar cache local
        const cacheKey = `${uid}-${carpetaActual}`;
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          const cached = newCache.get(cacheKey);
          if (cached) {
            newCache.set(cacheKey, {
              ...cached,
              mensaje: { ...cached.mensaje, leido }
            });
          }
          return newCache;
        });
        
        // Refrescar después de un momento
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 800);
      }
    } catch (err) {
      console.error("Error marcando correo:", err);
    } finally {
      setAccionando(false);
    }
  };

  // Mover correo a otra carpeta
  const moverCorreo = async (uid, carpetaDestino) => {
    try {
      setAccionando(true);
      const res = await fetch("/api/email/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, carpetaOrigen: carpetaActual, carpetaDestino }),
      });

      const data = await res.json();
      if (data.success) {
        // Remover de la lista
        setEmails(prev => prev.filter((e) => e.uid !== uid));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado(null);
        }
        
        // Limpiar cache local
        const cacheKey = `${uid}-${carpetaActual}`;
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(cacheKey);
          return newCache;
        });
        
        // Refrescar después de un momento
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 500);
      }
    } catch (err) {
      console.error("Error moviendo correo:", err);
      alert("Error al mover el correo: " + err.message);
    } finally {
      setAccionando(false);
    }
  };

  // Eliminar correo
  const eliminarCorreo = async (uid) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este correo?")) {
      return;
    }

    try {
      setAccionando(true);
      const res = await fetch("/api/email/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, carpeta: carpetaActual }),
      });

      const data = await res.json();
      if (data.success) {
        // Remover de la lista
        setEmails(prev => prev.filter((e) => e.uid !== uid));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado(null);
        }
        
        // Limpiar cache local
        const cacheKey = `${uid}-${carpetaActual}`;
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(cacheKey);
          return newCache;
        });
        
        // Refrescar después de un momento
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 1000);
      }
    } catch (err) {
      console.error("Error eliminando correo:", err);
      alert("Error al eliminar el correo: " + err.message);
    } finally {
      setAccionando(false);
    }
  };

  // Cambiar de carpeta
  const cambiarCarpeta = async (nuevaCarpeta) => {
    // Cancelar cualquier carga en progreso
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Actualizar refs y estado inmediatamente
    carpetaCargandoRef.current = nuevaCarpeta;
    setCarpetaActual(nuevaCarpeta);
    setEmailSeleccionado(null);
    setEmails([]);
    setSincronizando(false);
    setError("");
    
    // Actualizar URL
    router.push(`/email/inbox?carpeta=${encodeURIComponent(nuevaCarpeta)}`);
    
    // Cargar la nueva carpeta
    cargarCarpeta(nuevaCarpeta, { forzarRefresh: false, mostrarLoading: true });
  };

  // Refresh manual
  const handleRefresh = () => {
    setRefreshing(true);
    cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Efectos
  useEffect(() => {
    fetchCarpetas();
  }, []);

  // CRÍTICO: Cargar la carpeta inicial al montar el componente
  useEffect(() => {
    if (!cargaInicialRef.current) {
      cargaInicialRef.current = true;
      // Pequeño delay para asegurar que el componente esté completamente montado
      setTimeout(() => {
        cargarCarpeta(carpetaParam, { forzarRefresh: false, mostrarLoading: true });
      }, 100);
    }
  }, []); // Solo al montar

  // Efecto para cambiar de carpeta cuando cambia el parámetro de URL
  useEffect(() => {
    // Solo cargar si la carpeta realmente cambió y ya se hizo la carga inicial
    if (cargaInicialRef.current && carpetaParam !== carpetaActual) {
      cambiarCarpeta(carpetaParam);
    }
  }, [carpetaParam]); // Solo dependencia de carpetaParam

  // Efecto para polling automático (solo INBOX)
  useEffect(() => {
    if (carpetaActual !== 'INBOX') return;
    
    const pollingInterval = setInterval(() => {
      if (!loading && !refreshing && carpetaCargandoRef.current === 'INBOX') {
        sincronizarEnSegundoPlano('INBOX');
      }
    }, 30000); // Cada 30 segundos

    return () => clearInterval(pollingInterval);
  }, [carpetaActual, loading, refreshing, sincronizarEnSegundoPlano]);

  // Efecto para cargar correo individual cuando cambia uidParam
  useEffect(() => {
    if (uidParam) {
      fetchEmail(Number(uidParam), carpetaParam);
    } else {
      setEmailSeleccionado(null);
    }
  }, [uidParam, carpetaParam]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const formatearFecha = (fecha) => {
    if (!fecha) return "";
    try {
      const date = new Date(fecha);
      const hoy = new Date();
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);

      if (date.toDateString() === hoy.toDateString()) {
        return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      }
      if (date.toDateString() === ayer.toDateString()) {
        return "Ayer";
      }
      const diasDiferencia = Math.floor((hoy - date) / (1000 * 60 * 60 * 24));
      if (diasDiferencia < 7) {
        return date.toLocaleDateString("es-AR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) {
      return "";
    }
  };

  // Carpetas comunes
  const carpetasComunes = [
    { name: "INBOX", label: "Bandeja de entrada", icon: Icons.Folder },
    { name: "SPAM", label: "Spam", icon: Icons.X },
    { name: "TRASH", label: "Papelera", icon: Icons.Trash },
    { name: "Sent", label: "Enviados", icon: Icons.Document },
    { name: "Drafts", label: "Borradores", icon: Icons.Pencil },
  ];
  
  const todasLasCarpetas = [
    ...carpetasComunes,
    ...carpetas.filter(c => 
      !carpetasComunes.some(cc => cc.name.toLowerCase() === c.name.toLowerCase())
    )
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarAbierto(!sidebarAbierto)}
                className="p-2 hover:bg-slate-700 rounded"
              >
                {sidebarAbierto ? <Icons.X className="w-6 h-6" /> : <Icons.Menu className="w-6 h-6" />}
              </button>
              <h1 className="text-2xl font-bold">Correos</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="p-2 hover:bg-slate-700 rounded disabled:opacity-50"
                title="Actualizar"
              >
                <Icons.Refresh className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <Link
                href="/email/send"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
              >
                <Icons.Plus className="w-5 h-5" />
                Nuevo
              </Link>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-73px)]">
          {/* Sidebar - Siempre visible en desktop, colapsable en mobile */}
          <div className={`${sidebarAbierto ? 'w-64' : 'w-16 md:w-64'} transition-all duration-300 overflow-hidden bg-slate-800 border-r border-slate-700`}>
            <div className="p-4 space-y-2">
              {todasLasCarpetas.map((carpeta) => {
                const IconComponent = carpeta.icon;
                return (
                  <button
                    key={carpeta.name}
                    onClick={() => cambiarCarpeta(carpeta.name)}
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${
                      carpetaActual === carpeta.name
                        ? "bg-blue-600 text-white shadow-lg"
                        : "hover:bg-slate-700 text-slate-300"
                    }`}
                    title={carpeta.label || carpeta.name}
                  >
                    {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
                    <span className={`${sidebarAbierto ? 'block' : 'hidden md:block'} truncate`}>
                      {carpeta.label || carpeta.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contenido principal */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Lista de correos */}
            <div className="w-full md:w-1/3 border-r border-slate-700 overflow-y-auto bg-slate-800 flex flex-col">
              {/* Header de la lista con nombre de carpeta */}
              <div className="p-4 border-b border-slate-700 bg-slate-800 sticky top-0 z-10">
                <h2 className="text-lg font-semibold text-white">
                  {carpetasComunes.find(c => c.name === carpetaActual)?.label || carpetaActual}
                </h2>
                {sincronizando && (
                  <p className="text-xs text-blue-400 mt-1 flex items-center gap-2">
                    <Icons.Refresh className="w-3 h-3 animate-spin" />
                    Sincronizando...
                  </p>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-600/20 border-l-4 border-red-600 text-red-200 m-4 rounded">
                  <p className="font-semibold">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {loading && !sincronizando && emails.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Icons.Refresh className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
                    <p className="text-slate-400">Cargando correos...</p>
                  </div>
                </div>
              )}

              {!loading && !sincronizando && emails.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <Icons.Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay correos en esta carpeta</p>
                  </div>
                </div>
              )}

              {emails.length > 0 && (
                <div className="flex-1 overflow-y-auto">
                  <div className="divide-y divide-slate-700">
                    {emails.map((email) => (
                      <Link
                        key={email.uid}
                        href={`/email/inbox?carpeta=${encodeURIComponent(carpetaActual)}&uid=${email.uid}`}
                        className={`block p-4 hover:bg-slate-700/50 cursor-pointer transition-colors border-l-4 ${
                          emailSeleccionado?.uid === email.uid 
                            ? "bg-slate-700 border-blue-500" 
                            : !email.leido 
                            ? "border-blue-400 bg-slate-800/50" 
                            : "border-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {!email.leido && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                              )}
                              <p className={`truncate text-sm ${!email.leido ? "text-white font-semibold" : "text-slate-300"}`}>
                                {email.from}
                              </p>
                              {email.attachments && email.attachments.length > 0 && (
                                <Icons.PaperClip className="w-4 h-4 text-slate-400 flex-shrink-0" title={`${email.attachments.length} adjunto(s)`} />
                              )}
                            </div>
                            <p className={`truncate text-sm ${!email.leido ? "text-white font-semibold" : "text-slate-400"}`}>
                              {email.subject || "(Sin asunto)"}
                            </p>
                            {email.text && (
                              <p className="truncate text-xs text-slate-500 mt-1 line-clamp-1">
                                {email.text.replace(/<[^>]*>/g, '').substring(0, 60)}...
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            {formatearFecha(email.date)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Vista de correo */}
            <div className="hidden md:flex md:w-2/3 bg-slate-900 overflow-y-auto">
              {emailSeleccionado ? (
                <div className="w-full flex flex-col">
                  {/* Header del correo */}
                  <div className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-10">
                    <div className="flex items-start justify-between mb-3">
                      <h2 className="text-xl font-bold text-white flex-1 pr-4">
                        {emailSeleccionado.subject || "(Sin asunto)"}
                      </h2>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => marcarComoLeido(emailSeleccionado.uid, !emailSeleccionado.leido)}
                          disabled={accionando}
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                          title={emailSeleccionado.leido ? "Marcar como no leído" : "Marcar como leído"}
                        >
                          {emailSeleccionado.leido ? <Icons.Mail className="w-5 h-5" /> : <Icons.MailOpen className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => moverCorreo(emailSeleccionado.uid, "TRASH")}
                          disabled={accionando}
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 text-red-400"
                          title="Eliminar"
                        >
                          <Icons.Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-slate-300">
                        <span className="text-slate-500">De:</span> {emailSeleccionado.from}
                      </p>
                      {emailSeleccionado.to && (
                        <p className="text-slate-300">
                          <span className="text-slate-500">Para:</span> {emailSeleccionado.to}
                        </p>
                      )}
                      <p className="text-slate-400 text-xs">
                        {formatearFecha(emailSeleccionado.date)}
                      </p>
                    </div>
                    
                    {/* Archivos adjuntos */}
                    {emailSeleccionado.attachments && emailSeleccionado.attachments.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                          <Icons.PaperClip className="w-4 h-4" />
                          Archivos adjuntos ({emailSeleccionado.attachments.length})
                        </p>
                        <div className="space-y-2">
                          {emailSeleccionado.attachments.map((attachment, index) => {
                            const formatFileSize = (bytes) => {
                              if (!bytes) return "0 B";
                              if (bytes < 1024) return bytes + " B";
                              if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
                              return (bytes / (1024 * 1024)).toFixed(2) + " MB";
                            };
                            
                            const descargarAdjunto = () => {
                              if (attachment.content) {
                                // Convertir base64 a blob
                                const byteCharacters = atob(attachment.content);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                const blob = new Blob([byteArray], { type: attachment.contentType || 'application/octet-stream' });
                                
                                // Crear URL y descargar
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = attachment.filename || `adjunto-${index + 1}`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(url);
                              } else {
                                // Si no hay contenido (archivo muy grande), intentar descargar desde el servidor
                                alert(`El archivo "${attachment.filename}" es muy grande y no está disponible para descarga directa.`);
                              }
                            };
                            
                            return (
                              <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <Icons.Document className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate font-medium">
                                      {attachment.filename || `Adjunto ${index + 1}`}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {formatFileSize(attachment.size)} • {attachment.contentType || 'Tipo desconocido'}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={descargarAdjunto}
                                  className="p-2 hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                                  title="Descargar"
                                  disabled={!attachment.content}
                                >
                                  <Icons.Download className={`w-5 h-5 ${attachment.content ? 'text-blue-400' : 'text-slate-500'}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Contenido del correo */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {emailSeleccionado.html ? (
                      <div
                        className="prose prose-invert prose-slate max-w-none"
                        dangerouslySetInnerHTML={{ __html: emailSeleccionado.html }}
                      />
                    ) : (
                      <div className="prose prose-invert prose-slate max-w-none">
                        <pre className="whitespace-pre-wrap font-sans text-slate-300">
                          {emailSeleccionado.text || "Sin contenido"}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full w-full">
                  <div className="text-center text-slate-400">
                    <Icons.Mail className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">Selecciona un correo para verlo</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

// Componente wrapper con Suspense para cumplir con Next.js 14
function InboxPageContent() {
  return (
    <Suspense fallback={
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
          <div className="text-center">
            <Icons.Refresh className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-slate-400">Cargando correos...</p>
          </div>
        </div>
      </ProtectedRoute>
    }>
      <InboxContent />
    </Suspense>
  );
}

export default InboxPageContent;
