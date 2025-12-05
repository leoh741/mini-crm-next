// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX

import { NextResponse } from "next/server";
import { obtenerCorreoPorUID } from "../../../../lib/emailRead.js";

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

    // Si se solicita solo cache, intentar obtener solo del cache
    if (cacheOnly) {
      const { obtenerCorreoDelCache } = await import("../../../../lib/emailCache.js");
      const mensajeCache = await obtenerCorreoDelCache(uid, carpeta, incluirContenido);
      
      if (mensajeCache) {
        console.log(`✅ Correo encontrado en cache! UID: ${uid}`);
        return NextResponse.json(
          {
            success: true,
            mensaje: mensajeCache,
            fromCache: true,
          },
          { status: 200 }
        );
      }
      
      // Si no hay cache, retornar null
      return NextResponse.json(
        {
          success: false,
          error: "Correo no encontrado en cache",
          fromCache: true,
        },
        { status: 404 }
      );
    }

    console.log(`📥 Llamando a obtenerCorreoPorUID con UID: ${uid}, Carpeta: ${carpeta}, Contenido: ${incluirContenido}`);
    const mensaje = await obtenerCorreoPorUID(uid, carpeta, incluirContenido);
    console.log(`✅ Correo obtenido exitosamente`);

    if (!mensaje) {
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

