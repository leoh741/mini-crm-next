// API route para obtener correos de una carpeta
// GET /api/email/inbox?carpeta=INBOX&limit=20

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos } from "../../../../lib/emailRead.js";

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
    const limit = limitParam ? Number(limitParam) : 15; // Reducido a 15 para carga más rápida

    // Validar que limit sea un número válido
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'limit' debe ser un número entre 1 y 100" },
        { status: 400 }
      );
    }

    // Obtener los correos
    try {
      const mensajes = await obtenerUltimosCorreos(carpeta, limit);

      return NextResponse.json(
        {
          success: true,
          mensajes,
          carpeta,
          total: mensajes.length,
        },
        { status: 200 }
      );
    } catch (error) {
      // Si la carpeta no existe, retornar array vacío en lugar de error
      if (error.message && error.message.includes("no existe")) {
        return NextResponse.json(
          {
            success: true,
            mensajes: [],
            carpeta,
            total: 0,
            mensaje: `La carpeta "${carpeta}" no existe en el servidor`,
          },
          { status: 200 }
        );
      }
      throw error;
    }
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

