// API route para eliminar correos
// POST /api/email/delete

import { NextResponse } from "next/server";
import { eliminarCorreo } from "../../../../lib/emailRead.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, carpeta } = body;

    if (!uid || !carpeta) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid y carpeta son obligatorios" },
        { status: 400 }
      );
    }

    await eliminarCorreo(uid, carpeta);

    return NextResponse.json(
      {
        success: true,
        message: "Correo eliminado exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/delete:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al eliminar el correo",
      },
      { status: 500 }
    );
  }
}

