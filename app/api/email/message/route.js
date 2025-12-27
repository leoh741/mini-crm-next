// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX&contenido=true
// 
// ESTRATEGIA "CACHE ONLY" - Estilo Gmail - Ultra-rápido:
// 1. SIEMPRE lee desde cache (memoria o MongoDB)
// 2. NUNCA va a IMAP (eso se hace en background)
// 3. Si no hay contenido, devuelve metadata + bodyStatus: "loading"
// 4. El body se descarga en background automáticamente

import { NextResponse } from "next/server";
import { obtenerCorreoPorUID } from "../../../../lib/emailRead.js";

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
    // CACHE ONLY - Estilo Gmail - NUNCA va a IMAP
    // ============================================
    // obtenerCorreoPorUID ahora NUNCA va a IMAP, solo lee desde cache
    // Si no hay contenido, devuelve bodyStatus: "loading" y dispara descarga en background
    try {
      const mensaje = await obtenerCorreoPorUID(uid, carpeta, incluirContenido);
      
      if (!mensaje) {
        // Si no está en cache, retornar error (el correo no existe en cache)
        // No ir a IMAP - eso se hace durante sync incremental
        const tiempoTranscurrido = Date.now() - inicioTiempo;
        console.log(`[/api/email/message] ⚠️ Correo no encontrado en cache. UID: ${uid} (${tiempoTranscurrido}ms)`);
        
        return NextResponse.json(
          {
            success: false,
            error: "Correo no encontrado en cache. Puede que aún no se haya sincronizado.",
            fromCache: true,
          },
          { status: 404 }
        );
      }
      
      const tiempoTranscurrido = Date.now() - inicioTiempo;
      const tieneBody = mensaje.html || mensaje.text;
      
      // Determinar bodyStatus: usar el del mensaje, o calcularlo
      let bodyStatus = mensaje.bodyStatus;
      if (!bodyStatus) {
        bodyStatus = tieneBody ? "ready" : "loading";
      }
      
      // Asegurar que el mensaje siempre tenga bodyStatus, lastBodyAttemptAt y lastBodyError
      const mensajeConBodyStatus = {
        ...mensaje,
        bodyStatus: bodyStatus,
        // Incluir lastBodyAttemptAt y lastBodyError si existen
        ...(mensaje.lastBodyAttemptAt && { lastBodyAttemptAt: mensaje.lastBodyAttemptAt }),
        ...(mensaje.lastBodyError && { lastBodyError: mensaje.lastBodyError }),
      };
      
      console.log(`[/api/email/message] ✅ Correo devuelto desde cache. UID: ${uid}, bodyStatus: ${bodyStatus}, Tiempo: ${tiempoTranscurrido}ms`);
      
      return NextResponse.json(
        {
          success: true,
          mensaje: mensajeConBodyStatus,
          fromCache: true,
        },
        { status: 200 }
      );
    } catch (error) {
      const tiempoTranscurrido = Date.now() - inicioTiempo;
      console.warn(`[/api/email/message] ⚠️ Error obteniendo correo después de ${tiempoTranscurrido}ms: ${error.message}`);
      
      // Retornar error sin ir a IMAP
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Error al obtener el correo desde cache",
          fromCache: true,
        },
        { status: 500 }
      );
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

