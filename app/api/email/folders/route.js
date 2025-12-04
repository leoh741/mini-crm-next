// API route para obtener las carpetas disponibles
// GET /api/email/folders

import { NextResponse } from "next/server";
import { obtenerCarpetas } from "../../../../lib/emailRead.js";

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
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al obtener las carpetas",
      },
      { status: 500 }
    );
  }
}

