// API route para obtener correos de una carpeta
// GET /api/email/inbox?carpeta=INBOX&limit=20
// SIEMPRE retorna desde la base de datos (ultra-rápido)
// La sincronización se hace en segundo plano automáticamente

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos } from "../../../../lib/emailRead.js";
import { obtenerListaDelCache, limpiarCacheListaCarpeta } from "../../../../lib/emailListCache.js";
import { imapManager, ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";
import { syncLockManager } from "../../../../lib/syncLockManager.js";

/**
 * Valida que un correo tenga metadata mínima
 * Helper para filtrar correos "fantasma" (sin remitente, sin asunto, sin fecha)
 */
function tieneMetadataMinima(mensaje) {
  if (!mensaje) return false;
  
  // Debe tener AL MENOS uno de estos campos con valor real:
  const tieneRemitente = mensaje.from && 
                         mensaje.from.trim() !== '' && 
                         mensaje.from !== 'Sin remitente';
  
  const tieneAsunto = mensaje.subject && 
                      mensaje.subject.trim() !== '' && 
                      mensaje.subject !== '(Sin asunto)';
  
  const tieneFecha = mensaje.date && 
                     (mensaje.date instanceof Date && !isNaN(mensaje.date.getTime())) ||
                     (typeof mensaje.date === 'string' && !isNaN(new Date(mensaje.date).getTime()));
  
  // Debe tener al menos uno de los tres
  return tieneRemitente || tieneAsunto || tieneFecha;
}

/**
 * Deduplica correos por UID antes de retornar
 * Evita warnings de React sobre keys duplicadas
 * También filtra correos sin metadata válida
 */
function deduplicarCorreos(correos) {
  if (!Array.isArray(correos)) return [];
  
  const uniqueMap = new Map();
  let descartadosPorMetadata = 0;
  
  for (const correo of correos) {
    if (correo && correo.uid != null) {
      // 🔴 VALIDACIÓN: Filtrar correos sin metadata válida
      if (!tieneMetadataMinima(correo)) {
        descartadosPorMetadata++;
        continue; // Saltar correos "fantasma"
      }
      
      // Si ya existe, mantener el primero (o el más reciente según updatedAt si existe)
      if (!uniqueMap.has(correo.uid)) {
        uniqueMap.set(correo.uid, correo);
      }
    }
  }
  
  if (descartadosPorMetadata > 0) {
    console.log(`🚫 ${descartadosPorMetadata} correo(s) sin metadata válida descartado(s) en deduplicación`);
  }
  
  return Array.from(uniqueMap.values());
}

// Función para sincronizar carpeta en segundo plano (no bloquea)
// MEJORADO: Usa sync incremental por UID (ultra-rápido)
async function sincronizarCarpetaEnSegundoPlano(carpeta, limit) {
  try {
    // Verificar si ya hay una sync en curso
    const lockResult = await syncLockManager.acquireLock(carpeta);
    
    if (!lockResult.acquired) {
      // Ya hay una sync en curso, no iniciar otra
      console.log(`⏳ Sync ya en curso para ${carpeta}, omitiendo sincronización en segundo plano`);
      return null;
    }
    
    console.log(`🔄 Iniciando sincronización incremental en segundo plano para ${carpeta}...`);
    
    // Importar función de sync incremental
    const { sincronizarCarpetaIncremental } = await import('../../../../lib/emailSync.js');
    
    // Crear promesa de sync incremental
    const syncPromise = sincronizarCarpetaIncremental(carpeta, limit)
      .then(resultado => {
        syncLockManager.releaseLock(carpeta, resultado);
        console.log(`✅ Sync incremental completada para ${carpeta}: ${resultado.nuevos} nuevos mensajes`);
        return resultado;
      })
      .catch(err => {
        syncLockManager.releaseLock(carpeta, null);
        throw err;
      });
    
    syncLockManager.setSyncPromise(carpeta, syncPromise);
    
    // Ejecutar en segundo plano (no await)
    syncPromise.catch(err => {
      console.warn(`⚠️ Error en sincronización incremental en segundo plano: ${err.message}`);
    });
    
    return null; // No retornar nada, se ejecuta en segundo plano
  } catch (err) {
    console.warn(`⚠️ Error iniciando sincronización en segundo plano: ${err.message}`);
    // No lanzar error, solo loguear para no romper el flujo
    return null;
  }
}

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

/**
 * Obtiene los últimos correos de una carpeta específica
 * Query params: 
 *   - carpeta (string, por defecto INBOX)
 *   - limit (número, por defecto 20)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 10; // Reducido a 10 para carga más rápida
    const cacheOnly = searchParams.get("cacheOnly") === "true";
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    // Validar que limit sea un número válido
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'limit' debe ser un número entre 1 y 100" },
        { status: 400 }
      );
    }

    // Si se solicita solo cache, intentar obtener solo del cache (ultra-rápido)
    if (cacheOnly) {
      try {
        const mensajesCache = await obtenerListaDelCache(carpeta, limit);
        
        if (mensajesCache && mensajesCache.length > 0) {
          // Deduplicar antes de retornar
          const mensajesDeduplicados = deduplicarCorreos(mensajesCache);
          
          console.log(`✅ Cache encontrado para carpeta ${carpeta}: ${mensajesDeduplicados.length} correos (${mensajesCache.length - mensajesDeduplicados.length} duplicados eliminados)`);
          return NextResponse.json(
            {
              success: true,
              mensajes: mensajesDeduplicados,
              carpeta,
              total: mensajesDeduplicados.length,
              fromCache: true,
            },
            { status: 200 }
          );
        }
      } catch (cacheError) {
        // Si hay error, no es crítico, solo significa que no hay cache
        console.warn(`⚠️ Error al obtener cache: ${cacheError.message}`);
      }
      
      // Si no hay cache, retornar vacío (no es un error, status 200)
      return NextResponse.json(
        {
          success: true,
          mensajes: [],
          carpeta,
          total: 0,
          fromCache: true,
          mensaje: "No hay correos en cache",
        },
        { status: 200 }
      );
    }

    // Si se solicita forceRefresh, limpiar el cache y forzar sincronización inmediata
    if (forceRefresh) {
      // 🔴 NUEVO: si el manager está offline, NO intentamos sincronizar
      if (!imapManager.isConnectionAvailable()) {
        console.warn('⚠️ forceRefresh pedido pero IMAP está offline. Devolviendo solo cache.');
        
        const correosDesdeCache = await obtenerListaDelCache(carpeta, limit);
        // Deduplicar antes de retornar
        const correosDeduplicados = deduplicarCorreos(correosDesdeCache || []);
        
        return NextResponse.json({
          success: true,
          status: 'offline-cache',
          mensajes: correosDeduplicados,
          carpeta,
          total: correosDeduplicados.length,
          fromCache: true,
          warning: 'Servidor IMAP no disponible, mostrando datos en modo offline.',
        });
      }
      
      console.log(`🔄 Forzando actualización desde servidor para carpeta ${carpeta}`);
      try {
        // Limpiar cache de la lista para forzar recarga desde servidor
        await limpiarCacheListaCarpeta(carpeta);
        console.log(`🧹 Cache limpiado para carpeta ${carpeta}`);
      } catch (clearError) {
        console.warn(`⚠️ Error limpiando cache: ${clearError.message}`);
      }
      
      // ✅ Sincronizar inmediatamente desde el servidor (esto actualizará el cache con flags reales de IMAP)
      try {
        console.log(`🔄 Sincronizando desde IMAP para obtener flags actuales (seen/important)...`);
        const mensajes = await obtenerUltimosCorreos(carpeta, limit, true); // true = forzar desde servidor (IMAP es fuente de verdad)
        // Deduplicar antes de retornar
        const mensajesDeduplicados = deduplicarCorreos(mensajes);
        
        console.log(`✅ Sincronización forzada completada: ${mensajesDeduplicados.length} correos con flags actualizados desde IMAP`);
        return NextResponse.json(
          {
            success: true,
            mensajes: mensajesDeduplicados,
            carpeta,
            total: mensajesDeduplicados.length,
            fromCache: false,
            forceRefreshed: true,
          },
          { status: 200 }
        );
      } catch (syncError) {
        console.error(`❌ Error en sincronización forzada: ${syncError.message}`);
        
        // Si es error de conexión IMAP, retornar modo offline
        if (syncError instanceof ConnectionNotAvailableError || syncError.message?.includes("Connection") || syncError.message?.includes("ETIMEDOUT")) {
          const mensajesCache = await obtenerListaDelCache(carpeta, limit);
          return NextResponse.json(
            {
              success: true,
              status: 'offline-cache',
              mensajes: mensajesCache || [],
              carpeta,
              total: mensajesCache?.length || 0,
              fromCache: true,
              warning: 'No se pudo conectar al servidor IMAP, mostrando datos en modo offline.',
            },
            { status: 200 }
          );
        }
        
        // Si falla, intentar retornar desde cache si existe
        const mensajesCache = await obtenerListaDelCache(carpeta, limit);
        if (mensajesCache && mensajesCache.length > 0) {
          // Deduplicar antes de retornar
          const mensajesDeduplicados = deduplicarCorreos(mensajesCache);
          
          return NextResponse.json(
            {
              success: true,
              mensajes: mensajesDeduplicados,
              carpeta,
              total: mensajesDeduplicados.length,
              fromCache: true,
            },
            { status: 200 }
          );
        }
        throw syncError;
      }
    }
    
    // CACHE-FIRST TOTAL: Siempre retornar desde cache primero (ultra-rápido)
    // La sincronización se hace en segundo plano automáticamente
    try {
      const mensajesCache = await obtenerListaDelCache(carpeta, limit);
      
      if (mensajesCache && mensajesCache.length > 0) {
        // Deduplicar antes de retornar
        const mensajesDeduplicados = deduplicarCorreos(mensajesCache);
        
        console.log(`✅ Emails desde cache: ${carpeta} - ${mensajesDeduplicados.length} correos`);
        
        // Sincronizar en segundo plano para actualizar (no bloquea)
        sincronizarCarpetaEnSegundoPlano(carpeta, limit).catch(err => {
          console.warn(`⚠️ Error sincronizando en segundo plano: ${err.message}`);
        });
        
        return NextResponse.json(
          {
            success: true,
            mensajes: mensajesDeduplicados,
            carpeta,
            total: mensajesDeduplicados.length,
            fromCache: true,
          },
          { status: 200 }
        );
      }
      
      // Si no hay cache, retornar vacío inmediatamente (nunca bloquear)
      // La sync se hace en segundo plano
      console.log(`⚠️ No hay cache para carpeta ${carpeta}, retornando vacío (sync en segundo plano)`);
      
      // Sincronizar en segundo plano (no bloquea)
      sincronizarCarpetaEnSegundoPlano(carpeta, limit).catch(err => {
        console.warn(`⚠️ Error sincronizando: ${err.message}`);
      });
      
      return NextResponse.json(
        {
          success: true,
          mensajes: [],
          carpeta,
          total: 0,
          fromCache: false,
          sincronizando: true,
          mensaje: "Sincronizando correos desde el servidor...",
        },
        { status: 200 }
      );
    } catch (cacheError) {
      console.warn(`⚠️ Error al obtener cache: ${cacheError.message}`);
      
      // Si falla el cache, retornar vacío (nunca bloquear)
      return NextResponse.json(
        {
          success: true,
          mensajes: [],
          carpeta,
          total: 0,
          fromCache: false,
          sincronizando: true,
          mensaje: "Sincronizando correos desde el servidor...",
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("❌ Error en API /api/email/inbox:", error);
    
    // Si es error de conexión IMAP, retornar modo offline
    if (error instanceof ConnectionNotAvailableError || error.message?.includes("Connection") || error.message?.includes("ETIMEDOUT")) {
      try {
        const { searchParams } = new URL(request.url);
        const carpeta = searchParams.get("carpeta") || "INBOX";
        const limitParam = searchParams.get("limit");
        const limit = limitParam ? Number(limitParam) : 10;
        
        const mensajesCache = await obtenerListaDelCache(carpeta, limit);
        // Deduplicar antes de retornar
        const mensajesDeduplicados = deduplicarCorreos(mensajesCache || []);
        
        return NextResponse.json(
          {
            success: true,
            status: 'offline-cache',
            mensajes: mensajesDeduplicados,
            carpeta,
            total: mensajesDeduplicados.length,
            fromCache: true,
            warning: 'No se pudo conectar al servidor IMAP, mostrando datos en modo offline.',
          },
          { status: 200 }
        );
      } catch (cacheError) {
        // Si también falla el cache, retornar error
        return NextResponse.json(
          {
            success: false,
            status: 'error-imap',
            error: 'No se pudo conectar al servidor de correo. Intenta nuevamente.',
          },
          { status: 503 }
        );
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al obtener los correos",
      },
      { status: 500 }
    );
  }
}

