// API route para marcar correos como leídos/no leídos
// POST /api/email/mark

import { NextResponse } from "next/server";
import { marcarComoLeido } from "../../../../lib/emailRead.js";

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

    console.log(`🔄 Llamando a marcarComoLeido(${uid}, ${carpeta}, ${leido})...`);
    await marcarComoLeido(uid, carpeta, leido);
    console.log(`✅ marcarComoLeido completado exitosamente para UID=${uid}`);

    return NextResponse.json(
      {
        success: true,
        message: `Correo marcado como ${leido ? "leído" : "no leído"}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/mark:", error);
    console.error("❌ Stack:", error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al marcar el correo",
      },
      { status: 500 }
    );
  }
}

