// API route para obtener correos de una carpeta
// GET /api/email/inbox?carpeta=INBOX&limit=20
// SIEMPRE retorna desde la base de datos (ultra-rápido)
// La sincronización se hace en segundo plano automáticamente

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos } from "../../../../lib/emailRead.js";
import { obtenerListaDelCache, limpiarCacheListaCarpeta } from "../../../../lib/emailListCache.js";

// Función para sincronizar carpeta en segundo plano (no bloquea)
async function sincronizarCarpetaEnSegundoPlano(carpeta, limit) {
  try {
    console.log(`🔄 Iniciando sincronización en segundo plano para ${carpeta}...`);
    const mensajes = await obtenerUltimosCorreos(carpeta, limit);
    console.log(`✅ Sincronización completada para ${carpeta}: ${mensajes.length} correos en DB`);
    return mensajes;
  } catch (err) {
    console.warn(`⚠️ Error en sincronización en segundo plano: ${err.message}`);
    throw err;
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
          console.log(`✅ Cache encontrado para carpeta ${carpeta}: ${mensajesCache.length} correos`);
          return NextResponse.json(
            {
              success: true,
              mensajes: mensajesCache,
              carpeta,
              total: mensajesCache.length,
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
      console.log(`🔄 Forzando actualización desde servidor para carpeta ${carpeta}`);
      try {
        // Limpiar cache de la lista para forzar recarga desde servidor
        await limpiarCacheListaCarpeta(carpeta);
        console.log(`🧹 Cache limpiado para carpeta ${carpeta}`);
      } catch (clearError) {
        console.warn(`⚠️ Error limpiando cache: ${clearError.message}`);
      }
      
      // Sincronizar inmediatamente desde el servidor (esto actualizará el cache)
      try {
        const mensajes = await obtenerUltimosCorreos(carpeta, limit, true); // true = forzar desde servidor
        console.log(`✅ Sincronización forzada completada: ${mensajes.length} correos`);
        return NextResponse.json(
          {
            success: true,
            mensajes,
            carpeta,
            total: mensajes.length,
            fromCache: false,
            forceRefreshed: true,
          },
          { status: 200 }
        );
      } catch (syncError) {
        console.error(`❌ Error en sincronización forzada: ${syncError.message}`);
        // Si falla, intentar retornar desde cache si existe
        const mensajesCache = await obtenerListaDelCache(carpeta, limit);
        if (mensajesCache && mensajesCache.length > 0) {
          return NextResponse.json(
            {
              success: true,
              mensajes: mensajesCache,
              carpeta,
              total: mensajesCache.length,
              fromCache: true,
            },
            { status: 200 }
          );
        }
        throw syncError;
      }
    }
    
    // CRÍTICO: SIEMPRE retornar desde la base de datos (nunca bloquear con IMAP)
    // La sincronización se hace en segundo plano automáticamente
    try {
      const mensajesCache = await obtenerListaDelCache(carpeta, limit);
      
      if (mensajesCache && mensajesCache.length > 0) {
        console.log(`✅ Emails desde DB: ${carpeta} - ${mensajesCache.length} correos`);
        
        // Sincronizar en segundo plano para actualizar (no bloquea)
        sincronizarCarpetaEnSegundoPlano(carpeta, limit).catch(err => {
          console.warn(`⚠️ Error sincronizando en segundo plano: ${err.message}`);
        });
        
        return NextResponse.json(
          {
            success: true,
            mensajes: mensajesCache,
            carpeta,
            total: mensajesCache.length,
            fromCache: true,
          },
          { status: 200 }
        );
      }
    } catch (cacheError) {
      console.warn(`⚠️ Error al obtener cache: ${cacheError.message}`);
    }
    
    // Si no hay caché, intentar sincronizar inmediatamente para carpetas importantes (INBOX, Sent, SPAM)
    // Para otras carpetas, sincronizar en segundo plano
    const carpetasImportantes = ["INBOX", "Sent", "sent", "SENT", "Enviados", "enviados", "SPAM", "spam", "Spam", "Junk", "JUNK", "junk"];
    const esCarpetaImportante = carpetasImportantes.includes(carpeta);
    
    if (esCarpetaImportante) {
      console.log(`🔄 No hay cache para carpeta importante ${carpeta}, sincronizando inmediatamente...`);
      
      // Intentar sincronizar inmediatamente (con timeout para no bloquear demasiado)
      try {
        const mensajes = await Promise.race([
          obtenerUltimosCorreos(carpeta, limit, true), // true = forzar desde servidor
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout sincronización")), 5000) // Timeout de 5 segundos
          )
        ]);
        
        if (mensajes && mensajes.length > 0) {
          console.log(`✅ Sincronización inmediata completada: ${mensajes.length} correos`);
          return NextResponse.json(
            {
              success: true,
              mensajes,
              carpeta,
              total: mensajes.length,
              fromCache: false,
              sincronizado: true,
            },
            { status: 200 }
          );
        } else {
          // Si no hay correos, retornar vacío pero sincronizado
          return NextResponse.json(
            {
              success: true,
              mensajes: [],
              carpeta,
              total: 0,
              fromCache: false,
              sincronizado: true,
              mensaje: "No hay correos en esta carpeta",
            },
            { status: 200 }
          );
        }
      } catch (syncError) {
        // Si falla la sincronización inmediata, continuar con sincronización en segundo plano
        console.warn(`⚠️ Error en sincronización inmediata, continuando en segundo plano: ${syncError.message}`);
      }
    }
    
    // Para carpetas no importantes o si falló la sincronización inmediata, sincronizar en segundo plano
    console.log(`⚠️ No hay cache para carpeta ${carpeta}, iniciando sincronización en segundo plano`);
    
    // Sincronizar en segundo plano (no bloquea)
    sincronizarCarpetaEnSegundoPlano(carpeta, limit).catch(err => {
      console.warn(`⚠️ Error sincronizando: ${err.message}`);
    });
    
    // Retornar vacío inmediatamente (nunca bloquear)
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
  } catch (error) {
    console.error("❌ Error en API /api/email/inbox:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al obtener los correos",
      },
      { status: 500 }
    );
  }
}

