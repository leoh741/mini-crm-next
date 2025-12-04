// API route para mover correos entre carpetas
// POST /api/email/move

import { NextResponse } from "next/server";
import { moverCorreo } from "../../../../lib/emailRead.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, carpetaOrigen, carpetaDestino } = body;

    if (!uid || !carpetaOrigen || !carpetaDestino) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid, carpetaOrigen y carpetaDestino son obligatorios" },
        { status: 400 }
      );
    }

    await moverCorreo(uid, carpetaOrigen, carpetaDestino);

    return NextResponse.json(
      {
        success: true,
        message: "Correo movido exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/move:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al mover el correo",
      },
      { status: 500 }
    );
  }
}

