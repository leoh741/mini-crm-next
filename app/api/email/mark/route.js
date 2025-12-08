// API route para marcar correos como leídos/no leídos
// POST /api/email/mark
// Ahora usa el flujo estable de sincronización bidireccional

import { NextResponse } from "next/server";
import { markAsSeen } from "../../../../lib/emailSync.js";
import { ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, carpeta, leido } = body;

    console.log(`📥 API /api/email/mark - Request recibido: UID=${uid}, Carpeta=${carpeta}, Leido=${leido}`);

    if (uid === undefined || !carpeta || leido === undefined) {
      console.warn(`⚠️ Faltan parámetros: uid=${uid}, carpeta=${carpeta}, leido=${leido}`);
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid, carpeta y leido son obligatorios" },
        { status: 400 }
      );
    }

    console.log(`🔄 Llamando a markAsSeen(${uid}, ${carpeta}, ${leido})...`);
    
    try {
      const seen = await markAsSeen(uid, carpeta, leido);
      console.log(`✅ markAsSeen completado exitosamente para UID=${uid}, seen=${seen}`);

      return NextResponse.json(
        {
          success: true,
          message: `Correo marcado como ${seen ? "leído" : "no leído"}`,
          uid,
          seen, // Usar 'seen' en lugar de 'leido' para consistencia
          leido: seen, // Mantener 'leido' para compatibilidad
        },
        { status: 200 }
      );
    } catch (error) {
      // Si es un timeout, devolver success: true con warning en lugar de error
      if (error.message && error.message.includes("tardó demasiado")) {
        console.warn(`⚠️ Timeout en markAsSeen para UID=${uid}, pero la operación puede haberse completado`);
        return NextResponse.json(
          {
            success: true,
            message: `Correo marcado como ${leido ? "leído" : "no leído"}`,
            uid,
            seen: leido, // Usar el valor esperado en caso de timeout
            leido: leido, // Mantener para compatibilidad
            warning: "Timeout al confirmar flags, pero la operación puede haberse aplicado en el servidor.",
          },
          { status: 200 }
        );
      }
      
      // Para otros errores, propagar el error
      throw error;
    }
    } catch (error) {
      console.error("❌ Error en API /api/email/mark:", error);
      console.error("❌ Stack:", error.stack);
      
      // Si es error de conexión IMAP, no modificar el estado en Mongo
      if (error instanceof ConnectionNotAvailableError || error.message?.includes("Connection") || error.message?.includes("ETIMEDOUT")) {
        return NextResponse.json(
          {
            success: false,
            status: 'error-imap',
            error: 'No se pudo conectar al servidor de correo. Intenta nuevamente.',
          },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Error desconocido al marcar el correo",
        },
        { status: 500 }
      );
    }
}

