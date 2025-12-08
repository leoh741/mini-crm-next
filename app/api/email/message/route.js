// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX&contenido=true
// 
// ESTRATEGIA "CACHE FIRST" - Optimizado para respuesta rápida:
// 1. Siempre intenta primero desde MongoDB (cache persistente) con contenido completo
// 2. Solo si NO existe en cache, obtiene SOLO ese UID desde IMAP (sin disparar sync masiva)
// 3. NO llama a funciones de sync masiva que descargan 20 correos

import { NextResponse } from "next/server";
import { obtenerCorreoSoloUID } from "../../../../lib/emailRead.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache } from "../../../../lib/emailCache.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const inicioTiempo = Date.now();
  console.log("[/api/email/message] Request recibido");
  
  try {
    const { searchParams } = new URL(request.url);
    const uidParam = searchParams.get("uid");
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const incluirContenido = searchParams.get("contenido") === "true";
    const cacheOnly = searchParams.get("cacheOnly") === "true";

    if (!uidParam) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'uid'" },
        { status: 400 }
      );
    }

    const uid = Number(uidParam);
    if (isNaN(uid)) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'uid' debe ser un número" },
        { status: 400 }
      );
    }

    // ============================================
    // PASO 1: CACHE FIRST - Buscar en MongoDB con contenido completo
    // ============================================
    // Esto es ultra-rápido (~10-50ms) y evita llamadas a IMAP innecesarias
    try {
      const mensajeCache = await obtenerCorreoDelCache(uid, carpeta, incluirContenido);
      
      if (mensajeCache) {
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[/api/email/message] ✅ Devuelto desde cache con contenido. UID: ${uid}, Tiempo: ${tiempoTranscurrido}ms`);
        
        // Si se solicita solo cache, retornar inmediatamente
        if (cacheOnly) {
          return NextResponse.json(
            {
              success: true,
              mensaje: mensajeCache,
              fromCache: true,
            },
            { status: 200 }
          );
        }
        
        // Si no es cacheOnly, retornar desde cache inmediatamente
        // NO actualizar en segundo plano para evitar syncs pesadas
        return NextResponse.json(
          {
            success: true,
            mensaje: mensajeCache,
            fromCache: true,
          },
          { status: 200 }
        );
      }
    } catch (cacheError) {
      console.warn(`[/api/email/message] ⚠️ Error al buscar en cache: ${cacheError.message}`);
    }
    
    // Si se solicita solo cache y no se encontró, retornar error
    if (cacheOnly) {
      return NextResponse.json(
        {
          success: false,
          error: "Correo no encontrado en cache",
          fromCache: true,
        },
        { status: 200 }
      );
    }

    // ============================================
    // PASO 2: Si NO está en cache, obtener SOLO ese UID desde IMAP
    // ============================================
    // IMPORTANTE: Usar obtenerCorreoSoloUID que NO dispara sync masiva
    // Solo obtiene ese UID específico sin descargar 20 correos
    console.log(`[/api/email/message] 📥 No encontrado en cache, obteniendo SOLO UID ${uid} desde IMAP...`);
    
    try {
      // Esta función solo obtiene UN correo, no dispara sync masiva
      const mensaje = await obtenerCorreoSoloUID(uid, carpeta, incluirContenido);
      
      if (!mensaje) {
        // Si no se encontró en IMAP, intentar cache sin contenido completo como fallback
        const mensajeFallback = await obtenerCorreoDelCache(uid, carpeta, false);
        if (mensajeFallback) {
          const tiempoTranscurrido = Date.now() - inicioTiempo;
          console.log(`[/api/email/message] ✅ Usando cache sin contenido como fallback. Tiempo: ${tiempoTranscurrido}ms`);
          return NextResponse.json(
            {
              success: true,
              mensaje: mensajeFallback,
              fromCache: true,
            },
            { status: 200 }
          );
        }
        
        return NextResponse.json(
          { success: false, error: "Correo no encontrado" },
          { status: 404 }
        );
      }

      // Guardar en cache para próximas consultas (rápido)
      if (mensaje) {
        await guardarCorreoEnCache(uid, carpeta, mensaje, incluirContenido).catch(err => {
          console.warn(`[/api/email/message] ⚠️ Error guardando en cache (no crítico): ${err.message}`);
        });
      }

      const tiempoTranscurrido = Date.now() - inicioTiempo;
      console.log(`[/api/email/message] ✅ Devuelto desde IMAP solo UID ${uid}. Tiempo: ${tiempoTranscurrido}ms`);

      return NextResponse.json(
        {
          success: true,
          mensaje,
          fromCache: false,
        },
        { status: 200 }
      );
    } catch (imapError) {
      // Si falla IMAP, intentar obtener desde cache sin contenido completo como fallback
      console.warn(`[/api/email/message] ⚠️ Error obteniendo desde IMAP, intentando cache como fallback: ${imapError.message}`);
      
      try {
        const mensajeFallback = await obtenerCorreoDelCache(uid, carpeta, false);
        if (mensajeFallback) {
          const tiempoTranscurrido = Date.now() - inicioTiempo;
          console.log(`[/api/email/message] ✅ Usando cache sin contenido como fallback después de error IMAP. Tiempo: ${tiempoTranscurrido}ms`);
          return NextResponse.json(
            {
              success: true,
              mensaje: mensajeFallback,
              fromCache: true,
              warning: "Correo obtenido desde cache. El contenido completo no está disponible debido a problemas de conexión.",
            },
            { status: 200 }
          );
        }
      } catch (fallbackError) {
        console.warn(`[/api/email/message] ⚠️ Error en fallback de cache: ${fallbackError.message}`);
      }
      
      // Si también falla el fallback, lanzar el error original
      throw imapError;
    }
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`[/api/email/message] ❌ Error después de ${tiempoTranscurrido}ms:`, error.message);
    
    // Mensaje de error más descriptivo
    let mensajeError = error.message || "Error desconocido al obtener el correo";
    
    // Detectar diferentes tipos de errores
    if (mensajeError.includes("Command failed") || 
        mensajeError.includes("NoConnection") ||
        mensajeError.includes("Connection") ||
        mensajeError.includes("ECONNREFUSED") ||
        mensajeError.includes("ETIMEDOUT") ||
        mensajeError.includes("timeout") ||
        error.code === "NoConnection" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT") {
      mensajeError = "Error de conexión con el servidor de correo. Por favor, intenta nuevamente.";
    } else if (mensajeError.includes("no existe")) {
      mensajeError = `La carpeta especificada no existe en el servidor.`;
    } else if (mensajeError.includes("no encontrado") || mensajeError.includes("not found")) {
      mensajeError = "El correo solicitado no se encontró en la carpeta especificada.";
    }
    
    return NextResponse.json(
      {
        success: false,
        error: mensajeError,
        // En desarrollo, incluir más detalles del error
        ...(process.env.NODE_ENV === 'development' && {
          details: {
            type: error.constructor.name,
            code: error.code,
            originalMessage: error.message,
          }
        })
      },
      { status: 500 }
    );
  }
}

