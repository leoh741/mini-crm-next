// API route para enviar correos electrónicos
// POST /api/email/send

import { NextResponse } from "next/server";
import { enviarCorreo } from "../../../../lib/emailSend.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

/**
 * Maneja el envío de correos electrónicos
 * Requiere: { to, subject, text?, html? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { to, subject, text, html } = body;

    // Validar parámetros obligatorios
    if (!to || !subject) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: 'to' y 'subject' son obligatorios" },
        { status: 400 }
      );
    }

    // Enviar el correo
    const info = await enviarCorreo({ to, subject, text, html });

    return NextResponse.json(
      {
        success: true,
        messageId: info.messageId,
        message: "Correo enviado exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/send:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al enviar el correo",
      },
      { status: 500 }
    );
  }
}

