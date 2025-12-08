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
  // Asegurar que carpetaActual siempre se inicialice con INBOX si no hay parámetro
  const carpetaInicial = carpetaParam || "INBOX";
  const [carpetaActual, setCarpetaActual] = useState(carpetaInicial);
  const [emails, setEmails] = useState([]);
  const [emailSeleccionado, setEmailSeleccionado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [accionando, setAccionando] = useState(false);
  const [sidebarAbierto, setSidebarAbierto] = useState(true); // Abierto por defecto
  const [sincronizando, setSincronizando] = useState(false);
  const [showOnlyImportant, setShowOnlyImportant] = useState(false);
  
  // Cache local en memoria del cliente para acceso ultra-rápido
  const [localEmailCache, setLocalEmailCache] = useState(new Map());
  
  // Refs para controlar el estado de carga y prevenir race conditions
  const carpetaCargandoRef = useRef(carpetaInicial);
  const cargaEnProgresoRef = useRef(false);
  const timeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const cargaInicialRef = useRef(false);
  const emailCargandoRef = useRef(null); // Para evitar cargar el mismo email múltiples veces
  const updatingImportantUidRef = useRef(null); // Para evitar doble clicks en toggle importante

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

  // Función auxiliar para marcar como leído al abrir (solo se ejecuta UNA vez)
  // ✅ CRÍTICO: Solo actualiza UI si realmente se marcó en IMAP
  const marcarComoLeidoAlAbrir = async (uid, carpetaParaBuscar) => {
    console.log(`>>> FRONTEND - marcarComoLeidoAlAbrir: UID=${uid}, Carpeta=${carpetaParaBuscar}`);
    
    try {
      // Crear AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
      
      const openRes = await fetch(`/api/email/${uid}/open?carpeta=${encodeURIComponent(carpetaParaBuscar)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log(`>>> FRONTEND - Respuesta /open recibida, status: ${openRes.status}`);
      
      if (!openRes.ok) {
        console.error(`>>> FRONTEND - Error HTTP: ${openRes.status} ${openRes.statusText}`);
        // ✅ CRÍTICO: Si hay error, NO marcar como leído
        return { success: false, error: `HTTP ${openRes.status}` };
      }
      
      const openData = await openRes.json();
      console.log(`>>> FRONTEND - Datos /open recibidos:`, openData);
      
      // ✅ CRÍTICO: Solo actualizar UI si realmente se marcó en IMAP (success = true)
      // Si hay warning (timeout/offline), NO actualizar UI - el correo debe seguir como no leído
      if (!openData.success || openData.warning) {
        console.warn(`>>> FRONTEND - No se pudo marcar como leído en IMAP: ${openData.error || openData.warning}`);
        return { success: false, error: openData.error || openData.warning };
      }
      
      // ✅ Solo actualizar UI si realmente se marcó en IMAP
      // Actualizar estado local con los datos del servidor
      setEmails(prev => {
        const actualizada = prev.map((e) => 
          e.uid === uid 
            ? { ...e, leido: openData.seen, seen: openData.seen, flags: openData.flags || e.flags || [] }
            : e
        );
        return actualizada;
      });
      
      // Actualizar email seleccionado si es el mismo
      setEmailSeleccionado(prev => {
        if (prev && prev.uid === uid) {
          return {
            ...prev,
            leido: openData.seen,
            seen: openData.seen,
            flags: openData.flags || prev.flags || []
          };
        }
        return prev;
      });
      
      // Actualizar cache local
      const cacheKey = `${uid}-${carpetaParaBuscar}`;
      setLocalEmailCache(prev => {
        const newCache = new Map(prev);
        const cached = newCache.get(cacheKey);
        if (cached) {
          newCache.set(cacheKey, {
            ...cached,
            mensaje: {
              ...cached.mensaje,
              leido: openData.seen,
              seen: openData.seen,
              flags: openData.flags || cached.mensaje.flags || []
            }
          });
        }
        return newCache;
      });
      
      return openData;
    } catch (err) {
      // ✅ CRÍTICO: Si hay error o timeout, NO marcar como leído
      console.error('>>> FRONTEND - Error en marcarComoLeidoAlAbrir:', err);
      return { success: false, error: err.message || 'Error desconocido' };
    }
  };

  // Cargar correo individual
  const fetchEmail = async (uid, carpeta = carpetaActual) => {
    const carpetaParaBuscar = carpeta || carpetaActual;
    const cacheKey = `${uid}-${carpetaParaBuscar}`;
    
    console.log(`>>> FRONTEND - fetchEmail llamado: UID=${uid}, Carpeta=${carpetaParaBuscar}`);
    
    // ✅ CRÍTICO: Limpiar ref ANTES de cualquier verificación para evitar bloqueos
    if (emailCargandoRef.current === cacheKey) {
      console.log(`>>> FRONTEND - fetchEmail: Limpiando carga previa bloqueada para UID ${uid}`);
      emailCargandoRef.current = null;
      // Pequeña pausa para permitir que cualquier operación anterior termine
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // ✅ MEJORADO: Si el correo ya está seleccionado y es el mismo, solo refrescar si es necesario
    // Pero SIEMPRE permitir que se abra si el usuario hace click
    if (emailSeleccionado && emailSeleccionado.uid === uid) {
      console.log(`>>> FRONTEND - fetchEmail: Email UID ${uid} ya está seleccionado`);
      // Verificar si tiene contenido completo, si no, cargarlo
      const cachedLocal = localEmailCache.get(cacheKey);
      if (cachedLocal && cachedLocal.contenidoCompleto) {
        console.log(`>>> FRONTEND - Email ya cargado con contenido completo, no recargar`);
        return; // Ya está cargado, no hacer nada
      }
      // Si no tiene contenido completo, continuar para cargarlo
      console.log(`>>> FRONTEND - Email seleccionado pero sin contenido completo, cargando...`);
    }
    
    // ✅ CRÍTICO: Establecer ref ANTES de cualquier operación asíncrona
    emailCargandoRef.current = cacheKey;
    
    try {
      setError("");
      
      // Verificar cache local primero
      const cachedLocal = localEmailCache.get(cacheKey);
      if (cachedLocal && cachedLocal.contenidoCompleto) {
        console.log(`>>> FRONTEND - Email encontrado en cache local, UID: ${uid}`);
        setEmailSeleccionado(cachedLocal.mensaje);
        setLoading(false);
        
        // ✅ CRÍTICO: Marcar como leído al abrir SOLO si no está ya marcado como leído
        // Y verificar que realmente se marcó en IMAP antes de actualizar UI
        if (!cachedLocal.mensaje.seen && !cachedLocal.mensaje.leido) {
          const resultado = await marcarComoLeidoAlAbrir(uid, carpetaParaBuscar);
          // Si falla, NO actualizar UI - el correo debe seguir como no leído
          if (!resultado || !resultado.success) {
            console.warn(`>>> FRONTEND - No se pudo marcar como leído en IMAP, manteniendo estado original`);
          }
        }
        return;
      }
      
      // Cargar desde API con timeout
      console.log(`>>> FRONTEND - Email no en cache, cargando desde API...`);
      setLoading(true);
      
      // Crear AbortController para timeout
      // Aumentado a 30s para dar más tiempo al servidor (especialmente si IMAP es lento)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout
      
      try {
        const res = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Error al cargar el correo");
      }

        if (data.mensaje) {
          console.log(`>>> FRONTEND - Email cargado desde API, UID: ${uid}, seen=${data.mensaje.seen}, leido=${data.mensaje.leido}`);
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
          
          // ✅ CRÍTICO: Marcar como leído al abrir SOLO si no está ya marcado como leído
          // Y verificar que realmente se marcó en IMAP antes de actualizar UI
          if (!data.mensaje.seen && !data.mensaje.leido) {
            marcarComoLeidoAlAbrir(uid, carpetaParaBuscar).then(resultado => {
              // Si falla, revertir el cambio optimista
              if (!resultado || !resultado.success) {
                console.warn(`>>> FRONTEND - No se pudo marcar como leído en IMAP, revirtiendo estado`);
                setEmails(prev => prev.map((e) => 
                  e.uid === uid ? { ...e, leido: false, seen: false } : e
                ));
                if (emailSeleccionado && emailSeleccionado.uid === uid) {
                  setEmailSeleccionado({ ...emailSeleccionado, leido: false, seen: false });
                }
              }
            }).catch(err => {
              console.warn(`>>> FRONTEND - Error marcando como leído: ${err.message}`);
              // Revertir cambio optimista si falla
              setEmails(prev => prev.map((e) => 
                e.uid === uid ? { ...e, leido: false, seen: false } : e
              ));
              if (emailSeleccionado && emailSeleccionado.uid === uid) {
                setEmailSeleccionado({ ...emailSeleccionado, leido: false, seen: false });
              }
            });
          }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Si es timeout o abort, intentar desde cache
        if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
          console.warn(`>>> FRONTEND - Timeout cargando correo, intentando desde cache...`);
          try {
            const cacheRes = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&cacheOnly=true`);
            const cacheData = await cacheRes.json();
            if (cacheData.success && cacheData.mensaje) {
              setEmailSeleccionado(cacheData.mensaje);
              // ✅ NO mostrar error - el correo se cargó exitosamente desde cache
              // Esto es un comportamiento normal (fallback a cache), no un error
              console.log(`✅ Correo cargado desde cache después de timeout (comportamiento normal)`);
              setError(""); // Limpiar cualquier error previo
              return;
            }
          } catch (cacheErr) {
            console.error(">>> FRONTEND - Error cargando desde cache:", cacheErr);
            // Solo mostrar error si realmente falla el cache también
            setError("No se pudo cargar el correo (servidor y cache no disponibles)");
          }
        }
        
        throw fetchError;
      }
    } catch (err) {
      console.error(">>> FRONTEND - Error cargando correo:", err);
      setError(err.message || "Error al cargar el correo");
      
      // ✅ CRÍTICO: Intentar cargar desde cache como fallback
      try {
        const cachedLocal = localEmailCache.get(cacheKey);
        if (cachedLocal && cachedLocal.mensaje) {
          console.log(`>>> FRONTEND - Usando cache local como fallback para UID ${uid}`);
          setEmailSeleccionado(cachedLocal.mensaje);
          setError(""); // Limpiar error si se pudo cargar desde cache
        }
      } catch (cacheErr) {
        console.warn(`>>> FRONTEND - Error cargando desde cache: ${cacheErr.message}`);
      }
    } finally {
      setLoading(false);
      // ✅ CRÍTICO: Limpiar el ref SIEMPRE para permitir cargar el mismo email de nuevo
      if (emailCargandoRef.current === cacheKey) {
        emailCargandoRef.current = null;
      }
    }
  };

  // Marcar como leído/no leído (toggle manual)
  // IMPORTANTE: Esta función SOLO se debe usar cuando el usuario hace click en el botón de toggle
  // NO se debe llamar al abrir un correo - para eso usar /api/email/[uid]/open en fetchEmail
  // Esta función usa /api/email/mark para sincronización bidireccional
  const marcarComoLeido = async (uid, leido) => {
    console.log(`>>> FRONTEND - marcarComoLeido llamado: UID=${uid}, Leido=${leido}`);
    console.trace(`>>> FRONTEND - Stack trace de marcarComoLeido:`); // Para ver desde dónde se llama
    
    try {
      setAccionando(true);
      
      // Actualizar UI localmente primero (optimistic update)
      // Usar 'seen' como campo principal, mantener 'leido' para compatibilidad
      setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido, seen: leido } : e)));
      if (emailSeleccionado && emailSeleccionado.uid === uid) {
        setEmailSeleccionado({ ...emailSeleccionado, leido, seen: leido });
      }
      
      // Actualizar cache local
      const cacheKey = `${uid}-${carpetaActual}`;
      setLocalEmailCache(prev => {
        const newCache = new Map(prev);
        const cached = newCache.get(cacheKey);
        if (cached) {
          newCache.set(cacheKey, {
            ...cached,
            mensaje: { ...cached.mensaje, leido, seen: leido }
          });
        }
        return newCache;
      });
      
      // Aplicar en IMAP (con flujo estable: UI → IMAP → espera → relectura → cache → verificación)
      // Agregar timeout de 30 segundos para evitar que se quede esperando indefinidamente
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
      
      let res;
      try {
        res = await fetch("/api/email/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, carpeta: carpetaActual, leido }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("La operación tardó demasiado. El correo puede haberse marcado correctamente en el servidor.");
        }
        throw fetchError;
      }

      const data = await res.json();
      
      if (data.success) {
        // Si hay warning (timeout), solo loguear, no mostrar error al usuario
        if (data.warning) {
          console.warn("⚠️ Warning en marcarComoLeido:", data.warning);
        }
        
        // Actualizar estado con los datos del servidor si están disponibles
        // Priorizar 'seen' sobre 'leido' si está disponible
        const seenValue = data.seen !== undefined ? data.seen : (data.leido !== undefined ? data.leido : leido);
        if (seenValue !== undefined) {
          setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido: seenValue, seen: seenValue } : e)));
          if (emailSeleccionado && emailSeleccionado.uid === uid) {
            setEmailSeleccionado({ ...emailSeleccionado, leido: seenValue, seen: seenValue });
          }
          
          // Actualizar cache local con el valor del servidor
          const cacheKey = `${uid}-${carpetaActual}`;
          setLocalEmailCache(prev => {
            const newCache = new Map(prev);
            const cached = newCache.get(cacheKey);
            if (cached) {
              newCache.set(cacheKey, {
                ...cached,
                mensaje: { ...cached.mensaje, leido: seenValue, seen: seenValue }
              });
            }
            return newCache;
          });
        }
        
        // ✅ CRÍTICO: Actualizar lista después de operación IMAP para reflejar cambios
        // El servidor ya hizo: IMAP → espera → relectura → cache → verificación
        // Forzar refresh para asegurar que se vea el cambio (especialmente al marcar como no leído)
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            // ✅ IMPORTANTE: Forzar refresh para asegurar que el cambio se refleje
            // Especialmente crítico cuando se marca como no leído (debe aparecer el indicador azul)
            console.log(`>>> FRONTEND - Actualizando lista después de marcar como ${leido ? 'leído' : 'no leído'}`);
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 300); // Reducido a 300ms para respuesta más rápida
      } else {
        // Si falla realmente, revertir el cambio optimista
        const revertedSeen = !leido;
        setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido: revertedSeen, seen: revertedSeen } : e)));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ ...emailSeleccionado, leido: revertedSeen, seen: revertedSeen });
        }
        // Solo loguear errores críticos, no mostrar alert al usuario
        console.error("❌ Error al marcar el correo:", data.error || "Error desconocido");
      }
    } catch (err) {
      // Solo loguear errores de red críticos, no mostrar alert
      console.error("❌ Error de red al marcar correo:", err);
      
      // Si es un error de timeout del fetch, asumir que puede haberse completado
      if (err.name === 'AbortError' || err.message?.includes('tardó demasiado')) {
        console.warn("⚠️ Timeout detectado, pero la operación puede haberse completado en el servidor");
        // No revertir el cambio optimista en caso de timeout
      } else {
        // Para otros errores de red, revertir el cambio optimista
        const revertedSeen = !leido;
        setEmails(prev => prev.map((e) => (e.uid === uid ? { ...e, leido: revertedSeen, seen: revertedSeen } : e)));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ ...emailSeleccionado, leido: revertedSeen, seen: revertedSeen });
        }
      }
    } finally {
      setAccionando(false);
    }
  };

  // Marcar/desmarcar como importante
  const toggleImportant = async (uid, important) => {
    // Evitar doble clicks en el mismo UID
    if (updatingImportantUidRef.current === uid) {
      console.log(`>>> FRONTEND - toggleImportant: Ya hay una operación en curso para UID ${uid}, ignorando`);
      return;
    }
    
    console.log(`>>> FRONTEND - toggleImportant: UID=${uid}, important=${important}`);
    
    // Marcar este UID como en proceso
    updatingImportantUidRef.current = uid;
    setAccionando(true);
    
    // Guardar estado anterior para revertir en caso de error
    const emailAnterior = emails.find(e => e.uid === uid);
    const estadoAnterior = emailAnterior?.important ?? false;
    
    // Actualizar UI localmente INMEDIATAMENTE (optimistic update)
    const flagsOptimistas = important
      ? [...new Set([...(emailAnterior?.flags || []), "\\Flagged"])]
      : (emailAnterior?.flags || []).filter(f => f !== "\\Flagged");
    
    setEmails(prev => prev.map((e) => {
      if (e.uid === uid) {
        return { ...e, important, flags: flagsOptimistas };
      }
      return e;
    }));
    
    if (emailSeleccionado && emailSeleccionado.uid === uid) {
      setEmailSeleccionado({ ...emailSeleccionado, important, flags: flagsOptimistas });
    }
    
    // Actualizar cache local inmediatamente
    const cacheKey = `${uid}-${carpetaActual}`;
    setLocalEmailCache(prev => {
      const newCache = new Map(prev);
      const cached = newCache.get(cacheKey);
      if (cached) {
        newCache.set(cacheKey, {
          ...cached,
          mensaje: { ...cached.mensaje, important, flags: flagsOptimistas }
        });
      }
      return newCache;
    });
    
    try {
      // Aplicar en IMAP
      const res = await fetch("/api/email/toggle-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          uid, 
          carpeta: carpetaActual, 
          flag: "\\Flagged",
          activar: important
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      // Si IMAP está offline, mostrar mensaje pero mantener estado optimista
      if (data.offline || !data.success) {
        console.warn(`⚠️ FRONTEND - IMAP offline: ${data.error || 'Servidor temporalmente offline'}`);
        // Mostrar mensaje al usuario (opcional, puedes usar un toast/notificación)
        setError("IMAP temporalmente offline, se reintentará automáticamente");
        // Mantener el estado optimista - no revertir
        // El sistema reintentará automáticamente cuando IMAP vuelva online
        return;
      }
      
      // Solo actualizar UI si success es true
      if (data.success && data.important !== undefined && data.flags) {
        // Usar la respuesta del servidor como fuente de verdad
        console.log(`>>> FRONTEND - Respuesta del servidor: important=${data.important}, flags=${JSON.stringify(data.flags)}`);
        
        setEmails(prev => prev.map((e) => 
          e.uid === uid 
            ? { ...e, important: data.important, flags: data.flags }
            : e
        ));
        
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ ...emailSeleccionado, important: data.important, flags: data.flags });
        }
        
        // Actualizar cache local con el valor del servidor (fuente de verdad)
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          const cached = newCache.get(cacheKey);
          if (cached) {
            newCache.set(cacheKey, {
              ...cached,
              mensaje: { ...cached.mensaje, important: data.important, flags: data.flags }
            });
          }
          return newCache;
        });
        
        console.log(`✅ FRONTEND - toggleImportant completado: UID=${uid}, important=${data.important}`);
        
        // Limpiar error si había uno
        setError("");
        
        // ✅ Sincronización mejorada: Actualizar lista después de operación IMAP
        // Solo actualizar en background sin bloquear la UI
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: false, mostrarLoading: false });
          }
        }, 500); // Actualizar lista después de 500ms
      } else {
        // Si la respuesta no tiene los datos esperados, mantener el estado optimista
        console.warn(`⚠️ FRONTEND - Respuesta sin datos completos, manteniendo estado optimista`);
      }
    } catch (err) {
      console.error("❌ FRONTEND - Error de red al marcar como importante:", err);
      
      // Revertir el cambio optimista solo si es un error crítico
      if (!err.message?.includes('timeout') && !err.name?.includes('Abort')) {
        console.log(`>>> FRONTEND - Revirtiendo cambio optimista para UID=${uid}`);
        
        setEmails(prev => prev.map((e) => 
          e.uid === uid 
            ? { ...e, important: estadoAnterior, flags: emailAnterior?.flags || [] }
            : e
        ));
        
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ 
            ...emailSeleccionado, 
            important: estadoAnterior, 
            flags: emailAnterior?.flags || [] 
          });
        }
        
        // Revertir cache local
        setLocalEmailCache(prev => {
          const newCache = new Map(prev);
          const cached = newCache.get(cacheKey);
          if (cached && emailAnterior) {
            newCache.set(cacheKey, {
              ...cached,
              mensaje: { ...cached.mensaje, important: estadoAnterior, flags: emailAnterior.flags || [] }
            });
          }
          return newCache;
        });
      }
    } finally {
      setAccionando(false);
      updatingImportantUidRef.current = null; // Liberar el ref
    }
  };

  // Mover correo a otra carpeta (ahora usa sincronización bidireccional)
  const moverCorreo = async (uid, carpetaDestino) => {
    try {
      setAccionando(true);
      
      // Actualizar UI localmente primero (optimistic update)
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
      
      // Aplicar en IMAP (con flujo estable)
      const res = await fetch("/api/email/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, carpetaOrigen: carpetaActual, carpetaDestino }),
      });

      const data = await res.json();
      if (data.success) {
        // Esperar un momento para que se complete la sincronización bidireccional
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 1000); // Aumentado para dar tiempo a la sincronización completa
      } else {
        // Si falla, recargar la carpeta para revertir el cambio optimista
        cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
        alert("Error al mover el correo: " + (data.error || "Error desconocido"));
      }
    } catch (err) {
      console.error("Error moviendo correo:", err);
      // Si falla, recargar la carpeta
      cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
      alert("Error al mover el correo: " + err.message);
    } finally {
      setAccionando(false);
    }
  };

  // Eliminar correo
  const eliminarCorreo = async (uid) => {
    // 🔴 VALIDACIÓN DEFENSIVA: Verificar que uid y carpeta existan antes de llamar a la API
    if (!uid) {
      console.error("❌ Intento de borrar correo sin uid", { uid, carpeta: carpetaActual });
      alert("Error: No se pudo identificar el correo a eliminar. Por favor, recarga la página.");
      return;
    }

    if (!carpetaActual) {
      console.error("❌ Intento de borrar correo sin carpeta", { uid, carpeta: carpetaActual });
      alert("Error: No se pudo identificar la carpeta. Por favor, recarga la página.");
      return;
    }

    if (!confirm("¿Estás seguro de que quieres mover este correo a la papelera?")) {
      return;
    }

    try {
      setAccionando(true);
      
      // Actualizar UI localmente primero (optimistic update)
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
      
      // Mover a TRASH en IMAP
      // 🔴 IMPORTANTE: Siempre enviar body JSON válido con headers correctos
      const res = await fetch("/api/email/delete", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
          uid: Number(uid), // Asegurar que sea número
          carpeta: carpetaActual 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(errorData.error || `Error HTTP: ${res.status}`);
      }

      const data = await res.json();
      
      // Compatibilidad con ambas respuestas (ok o success)
      if (data.success || data.ok) {
        console.log(`✅ Correo ${uid} movido a papelera exitosamente`);
        // Refrescar después de un momento para asegurar sincronización
        setTimeout(() => {
          if (carpetaCargandoRef.current === carpetaActual) {
            cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
          }
        }, 500);
      } else {
        // Si falla, recargar la carpeta para revertir el cambio optimista
        console.error("❌ Error moviendo correo a papelera:", data.error);
        cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
        alert("Error al mover el correo a la papelera: " + (data.error || "Error desconocido"));
      }
    } catch (err) {
      console.error("❌ Error de red al mover correo a papelera:", err);
      // Recargar la carpeta para revertir el cambio optimista
      cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
      alert("Error al mover el correo a la papelera: " + err.message);
    } finally {
      setAccionando(false);
    }
  };

  // Función auxiliar para validar y eliminar correo de forma segura
  const handleDeleteEmail = (email) => {
    // 🔴 VALIDACIÓN DEFENSIVA: Verificar que el correo tenga uid y carpeta antes de eliminar
    if (!email || !email.uid) {
      console.error("❌ Intento de borrar correo sin uid", { email });
      alert("Error: No se pudo identificar el correo. Por favor, recarga la página.");
      return;
    }

    if (!carpetaActual) {
      console.error("❌ Intento de borrar correo sin carpeta", { email, carpeta: carpetaActual });
      alert("Error: No se pudo identificar la carpeta. Por favor, recarga la página.");
      return;
    }

    eliminarCorreo(email.uid);
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

  // Refresh manual - Optimizado para ser rápido y sincronizar flags desde IMAP
  const handleRefresh = async () => {
    console.log(`>>> FRONTEND - handleRefresh: Iniciando refresh manual para ${carpetaActual}`);
    setRefreshing(true);
    setSincronizando(true);
    
    try {
      // ✅ CRÍTICO: Forzar sincronización desde IMAP para obtener flags actuales (seen/important)
      // Usar AbortController para tener mejor control del timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos máximo
      
      try {
        // Primero sincronizar desde IMAP para actualizar flags
        const syncRes = await fetch(`/api/email/sync?carpeta=${encodeURIComponent(carpetaActual)}&limit=20`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          console.log(`✅ Sincronización completada: ${syncData.sincronizados || 0} correos, flags actualizados desde IMAP`);
        }
      } catch (syncErr) {
        clearTimeout(timeoutId);
        if (syncErr.name === 'AbortError') {
          console.warn('⚠️ Timeout en sincronización (8s), continuando con cache...');
        } else {
          console.warn('⚠️ Error en sincronización, continuando con cache:', syncErr.message);
        }
        // Continuar con cache si falla o timeout
      }
      
      // ✅ CRÍTICO: Cargar lista con forceRefresh=true para obtener flags actualizados desde IMAP
      // Esto asegura que los flags (seen/important) se actualicen correctamente
      await cargarCarpeta(carpetaActual, { forzarRefresh: true, mostrarLoading: false });
    } catch (err) {
      console.error('❌ Error en refresh:', err);
      // Continuar con cache si falla todo
      await cargarCarpeta(carpetaActual, { forzarRefresh: false, mostrarLoading: false });
    } finally {
      // ✅ Limpiar estados después de un breve delay para que se vea el feedback
      setTimeout(() => {
        setRefreshing(false);
        setSincronizando(false);
      }, 500);
    }
  };

  // Efectos
  useEffect(() => {
    fetchCarpetas();
  }, []);

  // CRÍTICO: Cargar la carpeta inicial al montar el componente
  useEffect(() => {
    if (!cargaInicialRef.current) {
      cargaInicialRef.current = true;
      // Normalizar carpeta: si no hay parámetro o es inválido, usar INBOX
      const carpetaParaCargar = carpetaInicial;
      
      // Asegurar que carpetaActual esté sincronizada
      setCarpetaActual(carpetaParaCargar);
      carpetaCargandoRef.current = carpetaParaCargar;
      
      // Si no hay parámetro en la URL, actualizar la URL para que sea explícita
      if (!carpetaParam || carpetaParam === "INBOX") {
        router.replace(`/email/inbox?carpeta=${encodeURIComponent(carpetaParaCargar)}`);
      }
      
      // Pequeño delay para asegurar que el componente esté completamente montado
      setTimeout(() => {
        console.log(`>>> FRONTEND - Carga inicial: carpeta=${carpetaParaCargar} (carpetaParam=${carpetaParam})`);
        cargarCarpeta(carpetaParaCargar, { forzarRefresh: false, mostrarLoading: true });
      }, 100);
    }
  }, []); // Solo al montar

  // Efecto para cambiar de carpeta cuando cambia el parámetro de URL
  useEffect(() => {
    // Solo cargar si la carpeta realmente cambió y ya se hizo la carga inicial
    // Y asegurarse de que no sea la carga inicial (ya manejada arriba)
    if (cargaInicialRef.current && carpetaParam !== carpetaActual && carpetaParam) {
      console.log(`>>> FRONTEND - Cambio de carpeta desde URL: ${carpetaActual} -> ${carpetaParam}`);
      cambiarCarpeta(carpetaParam);
    }
  }, [carpetaParam]); // Solo dependencia de carpetaParam

  // Efecto para polling automático y listener IMAP (solo INBOX)
  // OPTIMIZADO: Solo se ejecuta una vez al montar, no en cada cambio de estado
  const listenerConfiguradoRef = useRef(false);
  
  useEffect(() => {
    if (carpetaActual !== 'INBOX') return;
    
    // Solo configurar listener una vez (singleton)
    if (listenerConfiguradoRef.current) {
      return;
    }
    
    listenerConfiguradoRef.current = true;
    
    // Configurar listener IMAP para detectar cambios remotos (solo una vez)
    const configurarListener = async () => {
      try {
        const res = await fetch("/api/email/listener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ carpeta: 'INBOX' }),
        });
        
        if (res.ok) {
          console.log("✅ Listener IMAP configurado para INBOX (una sola vez)");
        }
      } catch (err) {
        console.warn("⚠️ Error configurando listener IMAP:", err);
        listenerConfiguradoRef.current = false; // Permitir reintento si falla
      }
    };
    
    configurarListener();
    
    // Polling periódico como respaldo (cada 30 segundos)
    const pollingInterval = setInterval(() => {
      if (!loading && !refreshing && carpetaCargandoRef.current === 'INBOX') {
        sincronizarEnSegundoPlano('INBOX');
      }
    }, 30000);

    return () => {
      clearInterval(pollingInterval);
      // Remover listener al desmontar
      fetch("/api/email/listener?carpeta=INBOX", { method: "DELETE" }).catch(() => {});
      listenerConfiguradoRef.current = false;
    };
  }, []); // Solo ejecutar una vez al montar

  // Efecto para cargar correo individual cuando cambia uidParam
  // IMPORTANTE: No recargar si el email ya está seleccionado y es el mismo UID
  useEffect(() => {
    if (uidParam) {
      const uidNumero = Number(uidParam);
      // ✅ MEJORADO: Solo cargar si el email seleccionado es diferente o no existe
      // Y si no hay una carga en progreso para ese UID
      const carpetaParaBuscar = carpetaParam || carpetaActual;
      const cacheKey = `${uidNumero}-${carpetaParaBuscar}`;
      const estaCargando = emailCargandoRef.current === cacheKey;
      
      if (!emailSeleccionado || emailSeleccionado.uid !== uidNumero) {
        if (!estaCargando) {
          console.log(`>>> FRONTEND - useEffect: Cargando email UID ${uidNumero} (email seleccionado actual: ${emailSeleccionado?.uid})`);
          fetchEmail(uidNumero, carpetaParam);
        } else {
          console.log(`>>> FRONTEND - useEffect: Email UID ${uidNumero} ya se está cargando, esperando...`);
        }
      } else {
        console.log(`>>> FRONTEND - useEffect: Email UID ${uidNumero} ya está seleccionado, no recargar`);
      }
    } else {
      // Si no hay uidParam, limpiar selección
      if (emailSeleccionado) {
        console.log(`>>> FRONTEND - useEffect: Limpiando email seleccionado (no hay uidParam)`);
        setEmailSeleccionado(null);
      }
    }
  }, [uidParam, carpetaParam]); // No incluir emailSeleccionado en dependencias para evitar loops

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

  // Carpetas comunes (sin Sent Items ni Promociones)
  const carpetasComunes = [
    { name: "INBOX", label: "Bandeja de entrada", icon: Icons.Folder },
    { name: "SPAM", label: "Spam", icon: Icons.X },
    { name: "TRASH", label: "Papelera", icon: Icons.Trash },
    { name: "Drafts", label: "Borradores", icon: Icons.Pencil },
  ];
  
  // Filtrar carpetas no deseadas: Sent Items, Promociones y sus variaciones
  const carpetasFiltradas = carpetas.filter(c => {
    const nombreLower = c.name?.toLowerCase() || '';
    return !nombreLower.includes('sent') && 
           !nombreLower.includes('promociones') &&
           !nombreLower.includes('promotions') &&
           c.name !== 'Sent Items' &&
           c.name !== 'SentItems';
  });
  
  const todasLasCarpetas = [
    ...carpetasComunes,
    ...carpetasFiltradas.filter(c => 
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
              <h1 className="text-2xl font-semibold">Correos</h1>
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
                className="px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2 text-sm md:text-base"
              >
                <Icons.Plus className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">Nuevo</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-73px)]">
          {/* Sidebar - Colapsable en mobile y desktop */}
          <div className={`${sidebarAbierto ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden bg-slate-800 border-r border-slate-700`}>
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
                    <span className={`${sidebarAbierto ? 'block' : 'hidden'} truncate`}>
                      {carpeta.label || carpeta.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contenido principal */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Lista de correos - Ocultar en mobile cuando hay correo seleccionado */}
            <div className={`${emailSeleccionado ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r border-slate-700 overflow-y-auto bg-slate-800 flex-col`}>
              {/* Header de la lista con nombre de carpeta */}
              <div className="p-4 border-b border-slate-700 bg-slate-800 sticky top-0 z-10">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold text-white">
                    {carpetasComunes.find(c => c.name === carpetaActual)?.label || carpetaActual}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowOnlyImportant((v) => !v)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      showOnlyImportant 
                        ? "bg-yellow-500/20 border-yellow-400 text-yellow-300" 
                        : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                    }`}
                    title={showOnlyImportant ? "Ver todos" : "Ver solo importantes"}
                  >
                    {showOnlyImportant ? "★ Todos" : "☆ Importantes"}
                  </button>
                </div>
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

              {emails.length > 0 && (() => {
                // ============================================
                // PASO 1: Normalizar y validar array de emails
                // ============================================
                const normalizedEmails = Array.isArray(emails) 
                  ? emails.filter(e => e && e.uid != null) 
                  : [];
                
                // ============================================
                // PASO 2: Deduplicar por UID (evita warning de React sobre keys duplicadas)
                // ============================================
                const uniqueEmailsMap = new Map();
                for (const email of normalizedEmails) {
                  if (!email?.uid) continue;
                  // Si ya existe ese uid, no lo volvemos a agregar (mantener el primero)
                  if (!uniqueEmailsMap.has(email.uid)) {
                    uniqueEmailsMap.set(email.uid, email);
                  }
                }
                const uniqueEmails = Array.from(uniqueEmailsMap.values());
                
                // ============================================
                // PASO 3: Log defensivo para detectar duplicados (solo en dev)
                // ============================================
                if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                  const counts = new Map();
                  for (const email of normalizedEmails) {
                    const uid = email?.uid;
                    if (!uid) continue;
                    counts.set(uid, (counts.get(uid) || 0) + 1);
                  }
                  
                  const duplicatedUids = Array.from(counts.entries())
                    .filter(([_, count]) => count > 1)
                    .map(([uid]) => uid);
                  
                  if (duplicatedUids.length > 0) {
                    console.warn('[InboxContent] UIDs duplicados detectados en emails:', duplicatedUids);
                    console.warn('[InboxContent] Total emails antes de deduplicar:', normalizedEmails.length);
                    console.warn('[InboxContent] Total emails después de deduplicar:', uniqueEmails.length);
                  }
                }
                
                // ============================================
                // PASO 4: FILTRO DE SEGURIDAD: Excluir correos "fantasma"
                // ============================================
                // Esto previene mostrar correos vacíos que aparecen cuando hay errores de conexión IMAP
                const emailsSinFantasma = uniqueEmails.filter(email => {
                  const tieneRemitente = email.from && 
                                         email.from.trim() !== '' && 
                                         email.from !== 'Sin remitente';
                  const tieneAsunto = email.subject && 
                                     email.subject.trim() !== '' && 
                                     email.subject !== '(Sin asunto)';
                  const tieneFecha = email.date && 
                                    (email.date instanceof Date || typeof email.date === 'string');
                  
                  // Debe tener al menos uno de los tres para ser válido
                  return tieneRemitente || tieneAsunto || tieneFecha;
                });
                
                // ============================================
                // PASO 5: Filtrar correos si showOnlyImportant está activo
                // ============================================
                const filteredEmails = showOnlyImportant
                  ? emailsSinFantasma.filter((e) => e.important === true)
                  : emailsSinFantasma;
                
                if (filteredEmails.length === 0 && showOnlyImportant) {
                  return (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-slate-400">
                        <Icons.Star className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay correos importantes en esta carpeta</p>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div className="flex-1 overflow-y-auto">
                    <div className="divide-y divide-slate-700">
                      {filteredEmails.map((email) => {
                        const isImportant = email.important === true;
                        const isSeen = email.seen !== undefined ? email.seen : email.leido;
                        
                        return (
                          <div
                            key={email.uid}
                            className={`block p-4 hover:bg-slate-700/50 cursor-pointer transition-colors border-l-4 ${
                              emailSeleccionado?.uid === email.uid 
                                ? "bg-slate-700 border-blue-500" 
                                : !isSeen
                                ? `border-blue-400 ${isImportant ? "bg-yellow-500/10 border-yellow-400/50" : "bg-slate-800/50"}` 
                                : isImportant
                                ? "bg-yellow-500/10 border-yellow-400/50"
                                : "border-transparent"
                            }`}
                          >
                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log(`>>> FRONTEND - Click en email UID ${email.uid}`);
                                
                                // ✅ CRÍTICO: Limpiar ref y estados ANTES de cargar para evitar bloqueos
                                const cacheKey = `${email.uid}-${carpetaActual}`;
                                if (emailCargandoRef.current === cacheKey) {
                                  console.log(`>>> FRONTEND - Limpiando ref bloqueado para UID ${email.uid}`);
                                  emailCargandoRef.current = null;
                                }
                                
                                // ✅ CRÍTICO: Limpiar loading state para permitir nueva carga
                                setLoading(false);
                                setError("");
                                
                                // Navegación fluida: actualizar URL y cargar correo sin recargar página
                                router.push(`/email/inbox?carpeta=${encodeURIComponent(carpetaActual)}&uid=${email.uid}`, { scroll: false });
                                
                                // ✅ CRÍTICO: Llamar fetchEmail inmediatamente con manejo robusto de errores
                                // Usar setTimeout mínimo para asegurar que el router.push se complete
                                setTimeout(() => {
                                  fetchEmail(email.uid, carpetaActual).catch(err => {
                                    console.error(`>>> FRONTEND - Error al cargar email UID ${email.uid}:`, err);
                                    // Si falla, intentar desde cache
                                    const cachedLocal = localEmailCache.get(cacheKey);
                                    if (cachedLocal && cachedLocal.mensaje) {
                                      console.log(`>>> FRONTEND - Usando cache local como fallback para UID ${email.uid}`);
                                      setEmailSeleccionado(cachedLocal.mensaje);
                                    } else {
                                      setError(`Error al cargar el correo: ${err.message}`);
                                    }
                                    setLoading(false);
                                    emailCargandoRef.current = null;
                                  });
                                }, 10); // Delay mínimo para router.push
                              }}
                              className="flex items-start justify-between gap-3 cursor-pointer"
                            >
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleImportant(email.uid, !isImportant);
                                  }}
                                  className="p-1 text-lg leading-none flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                                  title={isImportant ? "Quitar importante" : "Marcar como importante"}
                                  disabled={accionando}
                                >
                                  <span className={isImportant ? "text-yellow-400" : "text-slate-500"}>
                                    {isImportant ? "★" : "☆"}
                                  </span>
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {!isSeen && (
                                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                                    )}
                                    <p className={`truncate text-sm ${!isSeen ? "text-white font-semibold" : "text-slate-300"}`}>
                                      {email.from}
                                    </p>
                                    {email.attachments && email.attachments.length > 0 && (
                                      <Icons.PaperClip className="w-4 h-4 text-slate-400 flex-shrink-0" title={`${email.attachments.length} adjunto(s)`} />
                                    )}
                                  </div>
                                  <p className={`truncate text-sm ${!isSeen ? "text-white font-semibold" : "text-slate-400"}`}>
                                    {email.subject || "(Sin asunto)"}
                                  </p>
                                  {email.text && (
                                    <p className="truncate text-xs text-slate-500 mt-1 line-clamp-1">
                                      {email.text.replace(/<[^>]*>/g, '').substring(0, 60)}...
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-slate-500 flex-shrink-0">
                                {formatearFecha(email.date)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Vista de correo - Mostrar en mobile cuando hay correo seleccionado */}
            <div className={`${emailSeleccionado ? 'flex' : 'hidden md:flex'} w-full md:w-2/3 bg-slate-900 overflow-y-auto flex-col`}>
              {emailSeleccionado ? (
                <div className="w-full flex flex-col">
                  {/* Header del correo */}
                  <div className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-10">
                    {/* Botón volver en mobile */}
                    <button
                      onClick={() => {
                        // Navegación fluida: limpiar estado sin recargar
                        setEmailSeleccionado(null);
                        setLoading(false);
                        setError("");
                        // Actualizar URL sin recargar página
                        router.replace(`/email/inbox?carpeta=${encodeURIComponent(carpetaActual)}`, { scroll: false });
                      }}
                      className="md:hidden mb-3 flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                    >
                      <Icons.ArrowUturnLeft className="w-5 h-5" />
                      <span>Volver a la lista</span>
                    </button>
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <h2 className="text-lg md:text-xl font-bold text-white flex-1 pr-2 break-words">
                        {emailSeleccionado.subject || "(Sin asunto)"}
                      </h2>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const currentSeen = emailSeleccionado.seen !== undefined ? emailSeleccionado.seen : emailSeleccionado.leido;
                            console.log(`>>> FRONTEND - Click en botón toggle leído/no leído para UID ${emailSeleccionado.uid}, estado actual: seen=${currentSeen}`);
                            marcarComoLeido(emailSeleccionado.uid, !currentSeen);
                          }}
                          disabled={accionando}
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                          title={(emailSeleccionado.seen !== undefined ? emailSeleccionado.seen : emailSeleccionado.leido) ? "Marcar como no leído" : "Marcar como leído"}
                        >
                          {(emailSeleccionado.seen !== undefined ? emailSeleccionado.seen : emailSeleccionado.leido) ? <Icons.Mail className="w-5 h-5" /> : <Icons.MailOpen className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const currentImportant = emailSeleccionado.important ?? 
                                                   (emailSeleccionado.flags?.includes("\\Flagged") || false);
                            toggleImportant(emailSeleccionado.uid, !currentImportant);
                          }}
                          disabled={accionando}
                          className={`p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 ${
                            (emailSeleccionado.important ?? emailSeleccionado.flags?.includes("\\Flagged")) ? "text-yellow-400" : "text-slate-400"
                          }`}
                          title={(emailSeleccionado.important ?? emailSeleccionado.flags?.includes("\\Flagged")) ? "Quitar marca importante" : "Marcar como importante"}
                        >
                          <Icons.Star className={`w-5 h-5 ${(emailSeleccionado.important ?? emailSeleccionado.flags?.includes("\\Flagged")) ? "fill-yellow-400" : ""}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteEmail(emailSeleccionado)}
                          disabled={accionando}
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 text-red-400"
                          title="Mover a papelera"
                        >
                          <Icons.Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs md:text-sm">
                      <p className="text-slate-300 break-words">
                        <span className="text-slate-500">De:</span> {emailSeleccionado.from}
                      </p>
                      {emailSeleccionado.to && (
                        <p className="text-slate-300 break-words">
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
                  <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
