// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX

import { NextResponse } from "next/server";
import { obtenerCorreoPorUID } from "../../../../lib/emailRead.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uidParam = searchParams.get("uid");
    const carpeta = searchParams.get("carpeta") || "INBOX";

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

    const mensaje = await obtenerCorreoPorUID(uid, carpeta);

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
    console.error("❌ Error en API /api/email/message:", error);
    
    // Mensaje de error más descriptivo
    let mensajeError = error.message || "Error desconocido al obtener el correo";
    
    // Si el error es "Command failed", proporcionar más contexto
    if (mensajeError.includes("Command failed") || mensajeError.includes("NoConnection")) {
      mensajeError = "Error de conexión con el servidor de correo. Por favor, intenta nuevamente.";
    } else if (mensajeError.includes("no existe")) {
      mensajeError = `La carpeta especificada no existe en el servidor.`;
    } else if (mensajeError.includes("no encontrado")) {
      mensajeError = "El correo solicitado no se encontró en la carpeta especificada.";
    }
    
    return NextResponse.json(
      {
        success: false,
        error: mensajeError,
      },
      { status: 500 }
    );
  }
}

