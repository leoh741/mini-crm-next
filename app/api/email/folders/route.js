// API route para obtener las carpetas disponibles
// GET /api/email/folders

import { NextResponse } from "next/server";
import { obtenerCarpetas } from "../../../../lib/emailRead.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carpetas = await obtenerCarpetas();
    return NextResponse.json(
      {
        success: true,
        carpetas,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/folders:", error);
    
    // Si hay problemas de conexión, retornar carpetas por defecto en lugar de error 500
    const carpetasPorDefecto = [
      { name: 'INBOX', path: 'INBOX', delimiter: '/', flags: [], specialUse: null },
      { name: 'SPAM', path: 'SPAM', delimiter: '/', flags: [], specialUse: null },
      { name: 'TRASH', path: 'TRASH', delimiter: '/', flags: [], specialUse: null },
      { name: 'Sent', path: 'Sent', delimiter: '/', flags: [], specialUse: null },
      { name: 'Drafts', path: 'Drafts', delimiter: '/', flags: [], specialUse: null },
    ];
    
    // Detectar si es un error de conexión
    const esErrorConexion = error.message?.includes("ETIMEDOUT") || 
                           error.message?.includes("ECONNREFUSED") ||
                           error.message?.includes("timeout") ||
                           error.message?.includes("Connection") ||
                           error.code === "ETIMEDOUT" ||
                           error.code === "ECONNREFUSED" ||
                           error.code === "NoConnection";
    
    if (esErrorConexion) {
      console.warn("⚠️ Error de conexión IMAP, retornando carpetas por defecto");
      return NextResponse.json(
        {
          success: true,
          carpetas: carpetasPorDefecto,
          fromCache: true,
          warning: "Carpetas cargadas desde configuración por defecto debido a problemas de conexión",
        },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al obtener las carpetas",
      },
      { status: 500 }
    );
  }
}

