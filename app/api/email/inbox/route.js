// API route para obtener correos de una carpeta
// GET /api/email/inbox?carpeta=INBOX&limit=20

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos } from "../../../../lib/emailRead.js";
import { obtenerListaDelCache } from "../../../../lib/emailListCache.js";

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

    // Obtener los correos (normalmente desde IMAP, pero usa cache si está disponible)
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

