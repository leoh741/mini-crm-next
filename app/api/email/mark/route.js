// API route para marcar correos como leídos/no leídos
// POST /api/email/mark

import { NextResponse } from "next/server";
import { marcarComoLeido } from "../../../../lib/emailRead.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, carpeta, leido } = body;

    if (uid === undefined || !carpeta || leido === undefined) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid, carpeta y leido son obligatorios" },
        { status: 400 }
      );
    }

    await marcarComoLeido(uid, carpeta, leido);

    return NextResponse.json(
      {
        success: true,
        message: `Correo marcado como ${leido ? "leído" : "no leído"}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/mark:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al marcar el correo",
      },
      { status: 500 }
    );
  }
}

