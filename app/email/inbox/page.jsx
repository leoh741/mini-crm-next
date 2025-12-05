"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { Icons } from "../../../components/Icons";
import Link from "next/link";

function InboxPageContent() {
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
      // Si falla, al menos mostrar las carpetas comunes
      setCarpetas([]);
    }
  };

  // Cargar correos de la carpeta actual
  const fetchEmails = async (carpeta = null, forzarRefresh = false) => {
    try {
      setError("");
      const carpetaParaUsar = carpeta || carpetaActual;
      
      // Si se solicita forzar refresh (por ejemplo, después de enviar un correo o F5 en Sent)
      // o si es la carpeta Sent y se está refrescando, hacer forceRefresh
      const esSent = carpetaParaUsar.toLowerCase() === 'sent' || 
                     carpetaParaUsar.toLowerCase() === 'enviados' ||
                     carpetaParaUsar.toLowerCase() === 'sent items';
      
      if (forzarRefresh || (esSent && !loading)) {
        console.log(`🔄 Forzando refresh de carpeta ${carpetaParaUsar}...`);
        setLoading(true);
        try {
          const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=20&forceRefresh=true`);
          const data = await res.json();
          if (data.success && data.mensajes) {
            setEmails(data.mensajes);
            setLoading(false);
            console.log(`✅ Emails refrescados desde servidor: ${data.mensajes.length}`);
            return;
          }
        } catch (refreshError) {
          console.warn('Error en refresh forzado:', refreshError);
        }
      }
      
      // OPTIMIZACIÓN: Primero intentar cargar desde cache SIN mostrar loading (ultra-rápido)
      // Si hay emails en cache, mostrarlos inmediatamente sin mostrar "cargando"
      try {
        // Usar AbortController para timeout rápido si el cache tarda mucho
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 100); // Timeout muy corto para respuesta instantánea
        
        const cacheRes = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10&cacheOnly=true`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.mensajes && cacheData.mensajes.length > 0) {
            // Mostrar emails del cache inmediatamente SIN mostrar loading
            setEmails(cacheData.mensajes);
            setLoading(false);
            console.log(`✅ Emails cargados desde cache instantáneamente: ${cacheData.mensajes.length}`);
            
            // Pre-cargar contenido completo en segundo plano (no bloquea la UI)
            // Esto asegura que cuando se abra un email, esté disponible rápidamente
            Promise.all(
              cacheData.mensajes.map(async (mail) => {
                try {
                  // Intentar cargar desde cache primero (muy rápido)
                  const cacheMsgRes = await fetch(`/api/email/message?uid=${mail.uid}&carpeta=${encodeURIComponent(carpetaParaUsar)}&contenido=true&cacheOnly=true`);
                  if (cacheMsgRes.ok) {
                    const emailData = await cacheMsgRes.json();
                    if (emailData.success && emailData.mensaje) {
                      // Guardar en cache local para acceso instantáneo
                      const cacheKey = `${mail.uid}-${carpetaParaUsar}`;
                      setLocalEmailCache(prev => {
                        const newCache = new Map(prev);
                        newCache.set(cacheKey, {
                          mensaje: emailData.mensaje,
                          contenidoCompleto: true,
                          timestamp: Date.now()
                        });
                        if (newCache.size > 20) {
                          const firstKey = newCache.keys().next().value;
                          newCache.delete(firstKey);
                        }
                        return newCache;
                      });
                    }
                  }
                } catch (err) {
                  // Los errores de pre-carga no son críticos
                }
              })
            ).catch(() => {});
            
            // Actualizar lista desde servidor en segundo plano (sin bloquear)
            // Solo actualizar si hay cambios (no hacer polling innecesario)
            setTimeout(async () => {
              try {
                const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10`);
                const data = await res.json();
                if (data.success && data.mensajes) {
                  // Solo actualizar si hay más emails o si cambió algo
                  setEmails(prev => {
                    if (data.mensajes.length !== prev.length || 
                        data.mensajes.some((m, i) => !prev[i] || m.uid !== prev[i].uid)) {
                      return data.mensajes;
                    }
                    return prev;
                  });
                }
              } catch (err) {
                console.warn('Error actualizando emails en segundo plano:', err);
              }
            }, 500);
            return;
          }
        }
      } catch (cacheError) {
        // Si falla el cache (incluyendo timeout), continuar con carga normal
        if (cacheError.name !== 'AbortError') {
          console.warn('Error cargando desde cache:', cacheError);
        }
      }
      
      // Si no hay cache, cargar desde API (que ahora siempre retorna inmediatamente)
      // NO mostrar loading - la API retorna inmediatamente desde DB o vacío
      const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Error al cargar correos");
      }

      // Mostrar emails inmediatamente (puede estar vacío si no hay caché)
      setEmails(data.mensajes || []);
      setLoading(false);
      
      // Si hay mensaje de sincronización, mostrar indicador sutil y actualizar cuando termine
      if (data.sincronizando) {
        setSincronizando(true);
        console.log(`🔄 Sincronizando carpeta ${carpetaParaUsar} en segundo plano...`);
        
        // Polling optimizado: verificar caché frecuentemente para detectar cuando termina
        let intentos = 0;
        const maxIntentos = 30; // Más intentos pero con intervalo más corto
        const intervalo = setInterval(async () => {
          intentos++;
          try {
            // Verificar caché directamente (ultra-rápido)
            const cacheRes = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10&cacheOnly=true`);
            const cacheData = await cacheRes.json();
            
            // Si hay datos en caché, la sincronización terminó
            if (cacheData.success && cacheData.mensajes && cacheData.mensajes.length > 0) {
              setEmails(cacheData.mensajes);
              setSincronizando(false);
              clearInterval(intervalo);
              console.log(`✅ Emails encontrados en caché: ${cacheData.mensajes.length}`);
              return;
            }
            
            // Si no hay datos después de varios intentos, verificar estado completo
            if (intentos >= 5) {
              const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10`);
              const data = await res.json();
              
              // Si hay datos, actualizar
              if (data.success && data.mensajes && data.mensajes.length > 0) {
                setEmails(data.mensajes);
                setSincronizando(false);
                clearInterval(intervalo);
                console.log(`✅ Emails sincronizados: ${data.mensajes.length}`);
                return;
              }
              
              // Si ya no está sincronizando después de varios intentos, puede estar vacía
              if (data.success && !data.sincronizando && intentos >= 10) {
                setEmails([]);
                setSincronizando(false);
                clearInterval(intervalo);
                console.log(`✅ Sincronización completada: carpeta vacía`);
                return;
              }
            }
            
            // Si llegamos al máximo de intentos, hacer verificación final
            if (intentos >= maxIntentos) {
              const finalRes = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(carpetaParaUsar)}&limit=10`);
              const finalData = await finalRes.json();
              if (finalData.success) {
                setEmails(finalData.mensajes || []);
                setSincronizando(false);
                console.log(`✅ Verificación final: ${finalData.mensajes?.length || 0} correos`);
              }
              clearInterval(intervalo);
            }
          } catch (err) {
            console.warn(`⚠️ Error en intento ${intentos}:`, err);
            if (intentos >= maxIntentos) {
              setSincronizando(false);
              clearInterval(intervalo);
            }
          }
        }, 800); // Verificar cada 800ms (más frecuente para detección más rápida)
      } else {
        setSincronizando(false);
      }
      
      // Pre-cargar contenido completo en segundo plano (no bloquea)
      if (data.mensajes && data.mensajes.length > 0) {
        // Ejecutar en segundo plano sin bloquear
        Promise.all(
          data.mensajes.map(async (mail) => {
            try {
              const res = await fetch(`/api/email/message?uid=${mail.uid}&carpeta=${encodeURIComponent(carpetaParaUsar)}&contenido=true`);
              if (res.ok) {
                const emailData = await res.json();
                if (emailData.success && emailData.mensaje) {
                  const cacheKey = `${mail.uid}-${carpetaParaUsar}`;
                  setLocalEmailCache(prev => {
                    const newCache = new Map(prev);
                    newCache.set(cacheKey, {
                      mensaje: emailData.mensaje,
                      contenidoCompleto: true,
                      timestamp: Date.now()
                    });
                    if (newCache.size > 20) {
                      const firstKey = newCache.keys().next().value;
                      newCache.delete(firstKey);
                    }
                    return newCache;
                  });
                }
              }
            } catch (err) {
              // Los errores de pre-carga no son críticos
            }
          })
        ).catch(() => {});
      }
    } catch (err) {
      console.error("Error cargando correos:", err);
      setError(err.message || "Error desconocido al cargar los correos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Cargar correo individual (ultra-optimizado: busca primero en cache local, luego en DB)
  const fetchEmail = async (uid, carpeta = carpetaActual) => {
    try {
      setError(""); // Limpiar errores previos
      const carpetaParaBuscar = carpeta || carpetaActual;
      const cacheKey = `${uid}-${carpetaParaBuscar}`;
      
      // OPTIMIZACIÓN 1: Verificar cache local primero (instantáneo, ~0ms)
      const cachedLocal = localEmailCache.get(cacheKey);
      if (cachedLocal && cachedLocal.contenidoCompleto) {
        setEmailSeleccionado(cachedLocal.mensaje);
        setLoading(false);
        
            // Si no estaba leído, marcarlo como leído automáticamente (en segundo plano)
            if (!cachedLocal.mensaje.leido) {
              // Llamar a la API directamente para marcar como leído
              fetch("/api/email/mark", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
              }).catch(() => {}); // No bloquear si falla
              
              // Actualizar el estado local inmediatamente para reflejar el cambio
              setEmailSeleccionado({ ...cachedLocal.mensaje, leido: true });
              setEmails(emails.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
            }
        return;
      }
      
      // OPTIMIZACIÓN 2: Intentar cargar desde cache de DB SIN mostrar loading (ultra-rápido)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200); // Timeout aumentado ligeramente
        
        const cacheRes = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true&cacheOnly=true`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.mensaje) {
            // Guardar en cache local para acceso instantáneo la próxima vez
            setLocalEmailCache(prev => {
              const newCache = new Map(prev);
              newCache.set(cacheKey, {
                mensaje: cacheData.mensaje,
                contenidoCompleto: true,
                timestamp: Date.now()
              });
              if (newCache.size > 20) {
                const firstKey = newCache.keys().next().value;
                newCache.delete(firstKey);
              }
              return newCache;
            });
            
            // Mostrar correo del cache inmediatamente SIN mostrar loading
            setEmailSeleccionado(cacheData.mensaje);
            setLoading(false);
            
            // Si no estaba leído, marcarlo como leído automáticamente (en segundo plano)
            if (!cacheData.mensaje.leido) {
              // Llamar a la API directamente para marcar como leído
              fetch("/api/email/mark", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
              }).catch(() => {}); // No bloquear si falla
              
              // Actualizar el estado local inmediatamente para reflejar el cambio
              setEmailSeleccionado({ ...cacheData.mensaje, leido: true });
              setEmails(emails.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
            }
            return;
          }
        }
      } catch (cacheError) {
        // Si falla el cache, continuar con carga normal
        if (cacheError.name !== 'AbortError') {
          // No loguear, es normal que no haya cache
        }
      }
      
      // Solo mostrar loading si no hay cache disponible
      setLoading(true);
      
      // Intentar primero desde cache del servidor (ultra-rápido)
      try {
        const cacheRes = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true&cacheOnly=true`);
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.mensaje) {
            // Guardar en cache local
            setLocalEmailCache(prev => {
              const newCache = new Map(prev);
              newCache.set(cacheKey, {
                mensaje: cacheData.mensaje,
                contenidoCompleto: true,
                timestamp: Date.now()
              });
              if (newCache.size > 20) {
                const firstKey = newCache.keys().next().value;
                newCache.delete(firstKey);
              }
              return newCache;
            });
            
            setEmailSeleccionado(cacheData.mensaje);
            setLoading(false);
            
            // Si no estaba leído, marcarlo como leído automáticamente (en segundo plano)
            if (!cacheData.mensaje.leido) {
              // Llamar a la API directamente para marcar como leído
              fetch("/api/email/mark", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
              }).catch(() => {}); // No bloquear si falla
              
              // Actualizar el estado local inmediatamente para reflejar el cambio
              setEmailSeleccionado({ ...cacheData.mensaje, leido: true });
              setEmails(emails.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
            }
            
            // Actualizar desde servidor en segundo plano (sin bloquear)
            // Usar cacheOnly primero para evitar errores 500
            fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true&cacheOnly=true`)
              .then(res => {
                if (res.ok) {
                  return res.json();
                }
                return null;
              })
              .then(data => {
                if (data && data.success && data.mensaje) {
                  setLocalEmailCache(prev => {
                    const newCache = new Map(prev);
                    newCache.set(cacheKey, {
                      mensaje: data.mensaje,
                      contenidoCompleto: true,
                      timestamp: Date.now()
                    });
                    return newCache;
                  });
                  setEmailSeleccionado(data.mensaje);
                }
              })
              .catch(() => {}); // Ignorar errores de actualización en segundo plano
            
            return;
          }
        }
      } catch (cacheError) {
        // Continuar con carga normal si falla cache
      }
      
      // Si no hay cache, cargar desde servidor (esto también guarda en DB)
      try {
        const res = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=true`);
        
        if (!res.ok) {
          // Si falla, intentar cache sin contenido completo como fallback
          console.warn(`⚠️ Error ${res.status} al cargar correo, intentando cache sin contenido completo...`);
          const fallbackRes = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=false&cacheOnly=true`);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData.success && fallbackData.mensaje) {
              setLocalEmailCache(prev => {
                const newCache = new Map(prev);
                newCache.set(cacheKey, {
                  mensaje: fallbackData.mensaje,
                  contenidoCompleto: false,
                  timestamp: Date.now()
                });
                return newCache;
              });
              setEmailSeleccionado(fallbackData.mensaje);
              setLoading(false);
              setError("Correo cargado desde cache. El contenido completo no está disponible debido a problemas de conexión.");
              return;
            }
          }
          throw new Error(`Error ${res.status} al cargar el correo`);
        }
        
        const data = await res.json();

        if (data.success && data.mensaje) {
          // Guardar en cache local para acceso instantáneo la próxima vez
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
          
          setEmailSeleccionado(data.mensaje);
          
          // Si no estaba leído, marcarlo como leído automáticamente (en segundo plano)
          if (!data.mensaje.leido) {
            // Llamar a la API directamente para marcar como leído
            fetch("/api/email/mark", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid, carpeta: carpetaParaBuscar, leido: true }),
            }).catch(() => {}); // No bloquear si falla
            
            // Actualizar el estado local inmediatamente para reflejar el cambio
            setEmailSeleccionado({ ...data.mensaje, leido: true });
            setEmails(emails.map((e) => (e.uid === uid ? { ...e, leido: true } : e)));
          }
        } else {
          throw new Error(data.error || "Error al cargar el correo");
        }
      } catch (fetchError) {
        // Si falla completamente, intentar cache sin contenido como último recurso
        console.warn(`⚠️ Error al cargar correo, intentando cache sin contenido como último recurso: ${fetchError.message}`);
        try {
          const lastResortRes = await fetch(`/api/email/message?uid=${uid}&carpeta=${encodeURIComponent(carpetaParaBuscar)}&contenido=false&cacheOnly=true`);
          if (lastResortRes.ok) {
            const lastResortData = await lastResortRes.json();
            if (lastResortData.success && lastResortData.mensaje) {
              setLocalEmailCache(prev => {
                const newCache = new Map(prev);
                newCache.set(cacheKey, {
                  mensaje: lastResortData.mensaje,
                  contenidoCompleto: false,
                  timestamp: Date.now()
                });
                return newCache;
              });
              setEmailSeleccionado(lastResortData.mensaje);
              setLoading(false);
              setError("Correo cargado desde cache. El contenido completo no está disponible debido a problemas de conexión.");
              return;
            }
          }
        } catch (lastResortError) {
          // Si todo falla, lanzar el error original
        }
        throw fetchError;
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
        // Actualizar el estado local
        setEmails(emails.map((e) => (e.uid === uid ? { ...e, leido } : e)));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado({ ...emailSeleccionado, leido });
        }
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
        // Remover el correo de la lista
        setEmails(emails.filter((e) => e.uid !== uid));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado(null);
        }
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
        // Remover el correo de la lista
        setEmails(emails.filter((e) => e.uid !== uid));
        if (emailSeleccionado && emailSeleccionado.uid === uid) {
          setEmailSeleccionado(null);
        }
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
    // Limpiar email seleccionado inmediatamente
    setEmailSeleccionado(null);
    // Limpiar emails actuales para mostrar transición limpia
    setEmails([]);
    setSincronizando(false);
    setCarpetaActual(nuevaCarpeta);
    
    // Actualizar URL
    router.push(`/email/inbox?carpeta=${encodeURIComponent(nuevaCarpeta)}`);
    
    // Intentar cargar desde caché inmediatamente (sin mostrar loading)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100); // Timeout muy corto
      
      const cacheRes = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(nuevaCarpeta)}&limit=10&cacheOnly=true`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        if (cacheData.success && cacheData.mensajes && cacheData.mensajes.length > 0) {
          // Mostrar emails del caché inmediatamente
          setEmails(cacheData.mensajes);
          setLoading(false);
          console.log(`✅ Emails cargados desde caché al cambiar carpeta: ${cacheData.mensajes.length}`);
          
          // Actualizar desde servidor en segundo plano
          setTimeout(async () => {
            try {
              const res = await fetch(`/api/email/inbox?carpeta=${encodeURIComponent(nuevaCarpeta)}&limit=10`);
              const data = await res.json();
              if (data.success && data.mensajes) {
                setEmails(data.mensajes);
              }
            } catch (err) {
              console.warn('Error actualizando emails en segundo plano:', err);
            }
          }, 50);
          return;
        }
      }
    } catch (cacheError) {
      // Si no hay caché, continuar con carga normal
      if (cacheError.name !== 'AbortError') {
        // No loguear, es normal
      }
    }
    
    // Si no hay caché, cargar normalmente (esto mostrará loading)
    fetchEmails(nuevaCarpeta);
  };

  useEffect(() => {
    fetchCarpetas();
    
    // Sincronización automática en segundo plano al ingresar al módulo
    // Sincronizar INBOX, Sent y SPAM inicialmente para que estén listos
    setTimeout(() => {
      // Sincronizar INBOX
      fetch('/api/email/sync?carpeta=INBOX&limit=20')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.sincronizados > 0) {
            console.log(`✅ ${data.sincronizados} emails sincronizados automáticamente en INBOX`);
            // Refrescar la lista si estamos en INBOX
            if (carpetaActual === 'INBOX') {
              fetchEmails('INBOX');
            }
          }
        })
        .catch(err => {
          console.warn('Error en sincronización automática de INBOX:', err);
        });
      
      // Sincronizar Sent también para que esté disponible rápidamente
      fetch('/api/email/sync?carpeta=Sent&limit=20')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.sincronizados > 0) {
            console.log(`✅ ${data.sincronizados} emails sincronizados automáticamente en Sent`);
            // Refrescar la lista si estamos en Sent
            if (carpetaActual === 'Sent') {
              fetchEmails('Sent');
            }
          }
        })
        .catch(err => {
          console.warn('Error en sincronización automática de Sent:', err);
        });
      
      // Sincronizar SPAM también para que esté disponible rápidamente
      fetch('/api/email/sync?carpeta=SPAM&limit=20')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.sincronizados > 0) {
            console.log(`✅ ${data.sincronizados} emails sincronizados automáticamente en SPAM`);
            // Refrescar la lista si estamos en SPAM
            if (carpetaActual === 'SPAM') {
              fetchEmails('SPAM');
            }
          }
        })
        .catch(err => {
          console.warn('Error en sincronización automática de SPAM:', err);
        });
    }, 2000); // Esperar 2 segundos para no interferir con la carga inicial

    // Polling automático para detectar nuevos correos cada 15 segundos (solo en INBOX)
    const pollingInterval = setInterval(() => {
      if (carpetaActual === 'INBOX' && !loading && !refreshing) {
        // Sincronizar primero para detectar nuevos correos
        fetch('/api/email/sync?carpeta=INBOX&limit=20')
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const correosSincronizados = data.sincronizados || 0;
              const totalCorreos = data.total || 0;
              
              // Si hay correos sincronizados o el total es diferente, refrescar la lista
              if (correosSincronizados > 0 || (totalCorreos > 0 && totalCorreos !== emails.length)) {
                console.log(`✅ ${correosSincronizados} nuevos emails detectados, total: ${totalCorreos}, actual: ${emails.length}`);
                
                // Forzar actualización desde el servidor (ignora cache)
                fetch('/api/email/inbox?carpeta=INBOX&limit=20&forceRefresh=true')
                  .then(res => res.json())
                  .then(refreshData => {
                    if (refreshData.success && refreshData.mensajes) {
                      // Actualizar la lista con los nuevos correos
                      setEmails(refreshData.mensajes);
                      console.log(`✅ Lista actualizada con ${refreshData.mensajes.length} correos`);
                    }
                  })
                  .catch(err => {
                    console.warn('Error refrescando lista después de sincronización:', err);
                    // Si falla, intentar recargar normalmente
                    fetchEmails('INBOX');
                  });
              }
            }
          })
          .catch(err => {
            console.warn('Error en polling automático:', err);
          });
      }
    }, 15000); // Cada 15 segundos (más frecuente para detectar correos nuevos más rápido)

    return () => clearInterval(pollingInterval);
  }, [carpetaActual, loading, refreshing]);

  useEffect(() => {
    // Actualizar carpeta actual cuando cambia el parámetro
    setCarpetaActual(carpetaParam);
    // Limpiar emails inmediatamente para transición limpia
    setEmails([]);
    setEmailSeleccionado(null);
    setSincronizando(false);
    
    // Verificar si hay parámetro refresh (viene de enviar correo)
    const forceRefresh = searchParams.get('refresh') === 'true';
    const esSent = carpetaParam === 'Sent' || carpetaParam === 'sent' || carpetaParam === 'SENT' ||
                   carpetaParam === 'Enviados' || carpetaParam === 'enviados' ||
                   carpetaParam === 'Sent Items' || carpetaParam === 'sent items';
    
    // Si es Sent y viene de enviar correo, forzar actualización inmediata
    if (esSent && forceRefresh) {
      console.log(`🔄 Forzando actualización de Sent después de enviar correo...`);
      // Esperar un momento para que el correo esté guardado
      setTimeout(() => {
        fetch(`/api/email/inbox?carpeta=Sent&limit=20&forceRefresh=true`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.mensajes) {
              console.log(`✅ Sent actualizado con ${data.mensajes.length} correos (después de enviar)`);
              setEmails(data.mensajes);
              // Limpiar el parámetro refresh de la URL
              router.replace(`/email/inbox?carpeta=Sent`);
            } else {
              // Si no hay correos, cargar normalmente
              fetchEmails(carpetaParam, true); // Forzar refresh
            }
          })
          .catch(err => {
            console.warn('Error forzando actualización de Sent:', err);
            fetchEmails(carpetaParam, true); // Forzar refresh
          });
      }, 3000); // Aumentado a 3 segundos para dar más tiempo al servidor
    } else if (esSent) {
      // Si es Sent (sin parámetro refresh), también forzar refresh para asegurar que se vean los correos más recientes
      console.log(`🔄 Cargando Sent con refresh forzado para ver correos recientes...`);
      fetchEmails(carpetaParam, true); // Forzar refresh
    } else {
      // Cargar emails normalmente
      fetchEmails(carpetaParam);
    }
    
    // Sincronizar automáticamente los últimos 10 emails con contenido completo al cambiar de carpeta
    // Esto asegura que siempre estén listos para abrir instantáneamente
    // Aplicar a INBOX, Sent y SPAM para que carguen rápido
    const esSPAM = carpetaParam === 'SPAM' || carpetaParam === 'spam' || carpetaParam === 'Spam' || carpetaParam === 'Junk' || carpetaParam === 'JUNK' || carpetaParam === 'junk';
    
    if (carpetaParam === 'INBOX' || esSent || esSPAM) {
      let carpetaParaSync = 'INBOX';
      if (esSent) carpetaParaSync = 'Sent';
      else if (esSPAM) carpetaParaSync = 'SPAM';
      
      // Para Sent y SPAM, también forzar actualización desde servidor (si no se hizo antes)
      if ((esSent || esSPAM) && !forceRefresh) {
        // Forzar actualización desde servidor
        fetch(`/api/email/inbox?carpeta=${carpetaParaSync}&limit=20&forceRefresh=true`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.mensajes) {
              console.log(`✅ ${carpetaParaSync} actualizado con ${data.mensajes.length} correos`);
              setEmails(data.mensajes);
            }
          })
          .catch(err => {
            console.warn(`Error forzando actualización de ${carpetaParaSync}:`, err);
          });
      }
      
      // Luego sincronizar con contenido completo
      fetch(`/api/email/sync?carpeta=${encodeURIComponent(carpetaParaSync)}&limit=10`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.sincronizados > 0) {
            console.log(`✅ ${data.sincronizados} emails sincronizados automáticamente con contenido completo en ${carpetaParaSync}`);
          }
        })
        .catch(err => {
          console.warn('Error en sincronización automática:', err);
        });
    }
  }, [carpetaParam, searchParams]);

  useEffect(() => {
    if (uidParam) {
      // Asegurarse de que carpetaActual esté sincronizada con carpetaParam
      const carpetaParaBuscar = carpetaParam || carpetaActual;
      fetchEmail(Number(uidParam), carpetaParaBuscar);
    } else {
      setEmailSeleccionado(null);
    }
  }, [uidParam, carpetaParam, carpetaActual]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEmails();
  };

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

  // Carpetas comunes - siempre visibles
  const carpetasComunes = [
    { name: "INBOX", label: "Bandeja de entrada", icon: Icons.Folder },
    { name: "SPAM", label: "Spam", icon: Icons.X },
    { name: "TRASH", label: "Papelera", icon: Icons.Trash },
    { name: "Sent", label: "Enviados", icon: Icons.Document },
  ];
  
  // Obtener todas las carpetas disponibles (comunes + del servidor)
  const todasLasCarpetas = [
    ...carpetasComunes,
    ...carpetas.filter((c) => !carpetasComunes.find((cc) => cc.name.toUpperCase() === c.name.toUpperCase()))
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] w-full relative" style={{ maxWidth: '100vw', margin: '0 auto' }}>

      {/* Sidebar con carpetas */}
      <div className={`${sidebarAbierto ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative top-[56px] md:top-auto bottom-0 md:bottom-auto left-0 z-40 w-64 h-[calc(100vh-56px)] md:h-auto bg-slate-800 border-r border-slate-700 flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out shadow-xl md:shadow-none`}>
        <div className="p-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-100">Carpetas</h2>
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Actualizar"
            >
              <Icons.Refresh className={`text-sm text-slate-400 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-xs text-slate-400">contacto@digitalspace.com.ar</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Carpetas comunes - siempre visibles */}
          {carpetasComunes.map((carpeta) => (
            <button
              key={carpeta.name}
              onClick={() => {
                cambiarCarpeta(carpeta.name);
                setSidebarAbierto(false); // Cerrar sidebar en móvil al seleccionar carpeta
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
                carpetaActual === carpeta.name
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              <carpeta.icon className="text-sm" />
              <span>{carpeta.label}</span>
            </button>
          ))}

          {/* Separador si hay otras carpetas */}
          {carpetas.length > 0 && carpetas.some((c) => !carpetasComunes.find((cc) => cc.name.toUpperCase() === c.name.toUpperCase())) && (
            <div className="border-t border-slate-700 my-2"></div>
          )}

          {/* Otras carpetas del servidor - dinámicas */}
          {carpetas
            .filter((c) => !carpetasComunes.find((cc) => cc.name.toUpperCase() === c.name.toUpperCase()))
            .map((carpeta) => (
              <button
                key={carpeta.path || carpeta.name}
                onClick={() => {
                  cambiarCarpeta(carpeta.name);
                  setSidebarAbierto(false); // Cerrar sidebar en móvil al seleccionar carpeta
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
                  carpetaActual === carpeta.name
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Icons.Folder className="text-sm" />
                <span className="truncate">{carpeta.name}</span>
              </button>
            ))}
        </div>
      </div>

      {/* Overlay para cerrar sidebar en móvil */}
      {sidebarAbierto && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarAbierto(false)}
        />
      )}

      {/* Panel principal */}
      <div className="flex-1 flex flex-col bg-slate-900 w-full">
        {emailSeleccionado ? (
          /* Vista de correo individual */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header del correo */}
            <div className="bg-slate-800 border-b border-slate-700 p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        router.push(`/email/inbox?carpeta=${encodeURIComponent(carpetaActual)}`);
                        setEmailSeleccionado(null);
                      }}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                    >
                      <Icons.X className="text-sm text-slate-400" />
                    </button>
                    <h1 className="text-lg md:text-xl font-semibold text-slate-100 truncate">
                      {emailSeleccionado.subject || "(Sin asunto)"}
                    </h1>
                  </div>
                  <div className="text-xs md:text-sm text-slate-300 space-y-1">
                    <div className="break-words">
                      <span className="text-slate-400">De:</span> {emailSeleccionado.from || "Sin remitente"}
                    </div>
                    {emailSeleccionado.to && (
                      <div className="break-words">
                        <span className="text-slate-400">Para:</span> {emailSeleccionado.to}
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Fecha:</span>{" "}
                      {formatearFecha(emailSeleccionado.date)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      // Construir URL con parámetros para responder
                      const replySubject = emailSeleccionado.subject?.startsWith('Re:') 
                        ? emailSeleccionado.subject 
                        : `Re: ${emailSeleccionado.subject || ''}`;
                      const replyText = `\n\n--- Mensaje original ---\nDe: ${emailSeleccionado.from}\nFecha: ${new Date(emailSeleccionado.date).toLocaleString('es-AR')}\nAsunto: ${emailSeleccionado.subject || '(Sin asunto)'}\n\n${emailSeleccionado.text || emailSeleccionado.html?.replace(/<[^>]*>/g, '') || ''}`;
                      
                      router.push(
                        `/email/send?to=${encodeURIComponent(emailSeleccionado.from)}&subject=${encodeURIComponent(replySubject)}&text=${encodeURIComponent(replyText)}&replyTo=${encodeURIComponent(emailSeleccionado.from)}`
                      );
                    }}
                    disabled={accionando}
                    className="px-2 py-1.5 md:px-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 rounded text-xs text-white flex items-center gap-1"
                  >
                    <Icons.ArrowUturnLeft className="text-xs" />
                    <span className="hidden sm:inline">Responder</span>
                    <span className="sm:hidden">Re</span>
                  </button>
                  <button
                    onClick={() => marcarComoLeido(emailSeleccionado.uid, !emailSeleccionado.leido)}
                    disabled={accionando}
                    className="px-2 py-1.5 md:px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded text-xs text-white"
                  >
                    <span className="hidden sm:inline">{emailSeleccionado.leido ? "Marcar no leído" : "Marcar leído"}</span>
                    <span className="sm:hidden">{emailSeleccionado.leido ? "No leído" : "Leído"}</span>
                  </button>
                  <button
                    onClick={() => moverCorreo(emailSeleccionado.uid, "TRASH")}
                    disabled={accionando}
                    className="px-2 py-1.5 md:px-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 rounded text-xs text-white"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>

            {/* Archivos adjuntos */}
            {emailSeleccionado.attachments && emailSeleccionado.attachments.length > 0 && (
              <div className="border-b border-slate-700 bg-slate-800/50 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Icons.Document className="text-sm" />
                  Archivos adjuntos ({emailSeleccionado.attachments.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {emailSeleccionado.attachments.map((attachment, index) => {
                    const sizeKB = (attachment.size / 1024).toFixed(1);
                    const sizeMB = (attachment.size / (1024 * 1024)).toFixed(2);
                    const sizeText = attachment.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
                    
                    // Función para descargar el archivo
                    const handleDownload = async () => {
                      if (attachment.content) {
                        try {
                          // Convertir base64 a blob
                          const binaryString = atob(attachment.content);
                          const bytes = new Uint8Array(binaryString.length);
                          for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                          }
                          const blob = new Blob([bytes], { type: attachment.contentType });
                          
                          // Crear URL y descargar
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = attachment.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error("Error al descargar archivo:", error);
                          alert("Error al descargar el archivo. El archivo puede ser muy grande.");
                        }
                      } else {
                        // Si no hay contenido, el archivo es muy grande y no se puede descargar directamente
                        alert(`El archivo "${attachment.filename}" es muy grande (${sizeText}) y no se puede descargar directamente. Por favor, descárgalo desde tu cliente de correo.`);
                      }
                    };
                    
                    return (
                      <button
                        key={index}
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
                        title={`Descargar ${attachment.filename} (${sizeText})`}
                      >
                        <Icons.Document className="text-base text-blue-400" />
                        <span className="truncate max-w-[200px]">{attachment.filename}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{sizeText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contenido del correo */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {emailSeleccionado.html ? (
                <div
                  className="prose prose-invert max-w-none text-sm md:text-base"
                  dangerouslySetInnerHTML={{ __html: emailSeleccionado.html }}
                />
              ) : (
                <div className="text-slate-300 whitespace-pre-wrap text-sm md:text-base">{emailSeleccionado.text || "Sin contenido"}</div>
              )}
            </div>
          </div>
        ) : (
          /* Lista de correos */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header de la lista */}
            <div className="bg-slate-800 border-b border-slate-700 p-3 md:p-4 relative">
              <div className="flex flex-col gap-2">
                {/* Primera fila: título y botones */}
                <div className="flex items-center justify-between gap-2">
                  {/* Botón para abrir sidebar en móvil - dentro del header */}
                  <button
                    onClick={() => setSidebarAbierto(!sidebarAbierto)}
                    className="md:hidden p-2 bg-slate-700 hover:bg-slate-600 rounded-lg border border-slate-600 flex-shrink-0"
                    aria-label="Toggle menu"
                  >
                    <Icons.Folder className="text-slate-300 text-sm" />
                  </button>
                  <div className="flex-1 min-w-0">
                    {/* Título "Carpetas" en mobile cuando sidebar está cerrado */}
                    <h3 className="md:hidden text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Carpetas
                    </h3>
                    <h2 className="text-base md:text-lg font-semibold text-slate-100 truncate">
                      {carpetasComunes.find((c) => c.name === carpetaActual)?.label || carpetaActual}
                    </h2>
                  </div>
                  <Link
                    href="/email/send"
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs md:text-sm font-medium text-white flex items-center gap-1 flex-shrink-0"
                  >
                    <Icons.Plus className="text-sm" />
                    <span className="hidden sm:inline">Nuevo correo</span>
                    <span className="sm:hidden">Nuevo</span>
                  </Link>
                </div>
                {/* Segunda fila: email en mobile cuando sidebar está cerrado */}
                <div className="md:hidden">
                  <p className="text-xs text-slate-400 truncate">
                    contacto@digitalspace.com.ar
                  </p>
                </div>
              </div>
            </div>

            {/* Lista de correos */}
            <div className="flex-1 overflow-y-auto">
              {/* Indicador de sincronización sutil (no bloquea) */}
              {sincronizando && (
                <div className="bg-blue-900/20 border-b border-blue-700/30 px-4 py-2 flex items-center gap-2">
                  <Icons.Refresh className="text-xs text-blue-400 animate-spin" />
                  <span className="text-xs text-blue-300">Sincronizando correos...</span>
                </div>
              )}
              
              {/* Solo mostrar loading si realmente no hay datos y no está sincronizando */}
              {loading && emails.length === 0 && !sincronizando && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-slate-400">Cargando correos...</div>
                </div>
              )}

      {error && !error.includes("no existe") && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 m-4">
          <div className="flex items-center gap-2 text-red-400">
            <Icons.X className="text-lg" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-300 text-sm mt-2">{error}</p>
        </div>
      )}

              {!loading && !sincronizando && emails.length === 0 && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 m-4 text-center">
                  <Icons.Document className="text-4xl text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400">
                    {error && error.includes("no existe")
                      ? `La carpeta "${carpetaActual}" no existe en el servidor o está vacía`
                      : "No hay correos en esta carpeta"}
                  </p>
                  {error && error.includes("no existe") && (
                    <p className="text-slate-500 text-xs mt-2">
                      Verifica que el nombre de la carpeta sea correcto. Los nombres pueden variar según el servidor.
                    </p>
                  )}
                </div>
              )}

              {!loading &&
                !error &&
                emails.map((mail) => (
                  <div
                    key={mail.uid}
                    className={`border-b border-slate-700 p-3 md:p-4 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                      mail.leido ? "" : "bg-blue-900/10"
                    }`}
                    onClick={() => {
                      router.push(
                        `/email/inbox?carpeta=${encodeURIComponent(carpetaActual)}&uid=${mail.uid}`
                      );
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 md:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {!mail.leido && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
                          )}
                          <span className={`text-sm md:text-base font-semibold truncate ${mail.leido ? "text-slate-200" : "text-blue-300"}`}>
                            {mail.from || "Sin remitente"}
                          </span>
                        </div>
                        <h3 className={`text-sm md:text-base font-medium mb-1 ${mail.leido ? "text-slate-300" : "text-slate-100"}`}>
                          {mail.subject || "(Sin asunto)"}
                        </h3>
                        {mail.text ? (
                          <p className="text-xs md:text-sm text-slate-400 line-clamp-2">
                            {mail.text.substring(0, 100)}
                            {mail.text.length > 100 && "..."}
                          </p>
                        ) : mail.html ? (
                          <p className="text-xs md:text-sm text-slate-500 italic">(Correo con contenido HTML)</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs text-slate-500 whitespace-nowrap">{formatearFecha(mail.date)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              marcarComoLeido(mail.uid, !mail.leido);
                            }}
                            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                            title={mail.leido ? "Marcar no leído" : "Marcar leído"}
                          >
                            {mail.leido ? (
                              <Icons.Check className="text-sm text-slate-400" />
                            ) : (
                              <Icons.CheckCircle className="text-sm text-blue-400" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminarCorreo(mail.uid);
                            }}
                            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Icons.Trash className="text-sm text-slate-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <ProtectedRoute>
      <InboxPageContent />
    </ProtectedRoute>
  );
}
