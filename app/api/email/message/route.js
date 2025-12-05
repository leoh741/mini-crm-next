// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX

import { NextResponse } from "next/server";
import { obtenerCorreoPorUID } from "../../../../lib/emailRead.js";
import { obtenerCorreoDelCache } from "../../../../lib/emailCache.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function GET(request) {
  console.log("📥 API /api/email/message - Request recibido");
  
  try {
    const { searchParams } = new URL(request.url);
    const uidParam = searchParams.get("uid");
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const incluirContenido = searchParams.get("contenido") === "true";
    const cacheOnly = searchParams.get("cacheOnly") === "true";

    console.log(`📥 Parámetros recibidos - UID: ${uidParam}, Carpeta: ${carpeta}, CacheOnly: ${cacheOnly}`);

    if (!uidParam) {
      console.error("❌ Falta el parámetro 'uid'");
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'uid'" },
        { status: 400 }
      );
    }

    const uid = Number(uidParam);
    if (isNaN(uid)) {
      console.error(`❌ UID inválido: ${uidParam}`);
      return NextResponse.json(
        { success: false, error: "El parámetro 'uid' debe ser un número" },
        { status: 400 }
      );
    }

    // CRÍTICO: SIEMPRE intentar obtener desde cache primero (ultra-rápido)
    // Esto asegura que después de F5, los correos se abran instantáneamente desde la DB
    try {
      const mensajeCache = await obtenerCorreoDelCache(uid, carpeta, incluirContenido);
      
      if (mensajeCache) {
        console.log(`✅ Correo encontrado en cache persistente! UID: ${uid}`);
        
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
        
        // Si no es cacheOnly, retornar desde cache pero actualizar en segundo plano
        // Esto hace que la respuesta sea instantánea pero los datos estén actualizados
        obtenerCorreoPorUID(uid, carpeta, incluirContenido).catch(err => {
          console.warn(`⚠️ Error actualizando correo desde IMAP en segundo plano: ${err.message}`);
        });
        
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
      console.warn(`⚠️ Error al buscar en cache: ${cacheError.message}`);
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

    // Si no hay cache, intentar obtener desde IMAP
    // Pero si falla, intentar obtener desde cache sin contenido completo como fallback
    console.log(`📥 Llamando a obtenerCorreoPorUID con UID: ${uid}, Carpeta: ${carpeta}, Contenido: ${incluirContenido}`);
    
    try {
      const mensaje = await obtenerCorreoPorUID(uid, carpeta, incluirContenido);
      console.log(`✅ Correo obtenido exitosamente desde IMAP`);

      if (!mensaje) {
        // Si no se encontró, intentar cache sin contenido completo como fallback
        const mensajeFallback = await obtenerCorreoDelCache(uid, carpeta, false);
        if (mensajeFallback) {
          console.log(`✅ Usando cache sin contenido completo como fallback`);
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

      return NextResponse.json(
        {
          success: true,
          mensaje,
        },
        { status: 200 }
      );
    } catch (imapError) {
      // Si falla IMAP, intentar obtener desde cache sin contenido completo como fallback
      console.warn(`⚠️ Error obteniendo desde IMAP, intentando cache como fallback: ${imapError.message}`);
      
      try {
        const mensajeFallback = await obtenerCorreoDelCache(uid, carpeta, false);
        if (mensajeFallback) {
          console.log(`✅ Usando cache sin contenido completo como fallback después de error IMAP`);
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
        console.warn(`⚠️ Error en fallback de cache: ${fallbackError.message}`);
      }
      
      // Si también falla el fallback, lanzar el error original
      throw imapError;
    }
  } catch (error) {
    console.error("❌ Error en API /api/email/message:");
    console.error("  - Tipo:", error.constructor.name);
    console.error("  - Código:", error.code);
    console.error("  - Mensaje:", error.message);
    console.error("  - Stack:", error.stack);
    
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

