// API route para mover correos entre carpetas
// POST /api/email/move

import { NextResponse } from "next/server";
import { moveMail } from "../../../../lib/emailSync.js";

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, carpetaOrigen, carpetaDestino } = body;

    console.log(`📥 API /api/email/move - Request recibido: UID=${uid}, Origen=${carpetaOrigen}, Destino=${carpetaDestino}`);

    if (uid === undefined || !carpetaOrigen || !carpetaDestino) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid, carpetaOrigen y carpetaDestino son obligatorios" },
        { status: 400 }
      );
    }

    await moveMail(uid, carpetaOrigen, carpetaDestino);

    return NextResponse.json(
      {
        success: true,
        message: `Correo movido de ${carpetaOrigen} a ${carpetaDestino}`,
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
