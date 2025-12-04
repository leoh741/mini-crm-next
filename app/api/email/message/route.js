// API route para obtener un correo específico
// GET /api/email/message?uid=123&carpeta=INBOX

import { NextResponse } from "next/server";
import { obtenerCorreoPorUID } from "../../../../lib/emailRead.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uidParam = searchParams.get("uid");
    const carpeta = searchParams.get("carpeta") || "INBOX";

    if (!uidParam) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'uid'" },
        { status: 400 }
      );
    }

    const uid = Number(uidParam);
    if (isNaN(uid)) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'uid' debe ser un número" },
        { status: 400 }
      );
    }

    const mensaje = await obtenerCorreoPorUID(uid, carpeta);

    if (!mensaje) {
      return NextResponse.json(
        { success: false, error: "Correo no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        mensaje,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/message:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al obtener el correo",
      },
      { status: 500 }
    );
  }
}

