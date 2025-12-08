// API route para configurar listeners IMAP
// POST /api/email/listener - Configurar listener
// DELETE /api/email/listener - Remover listener

import { NextResponse } from "next/server";
import { configurarListenerIMAP, cerrarClienteIMAPPersistente } from "../../../../lib/emailSync.js";

export const dynamic = 'force-dynamic';

// Almacenar listeners activos
const listenersActivos = new Map();

export async function POST(request) {
  try {
    const body = await request.json();
    const { carpeta } = body;

    if (!carpeta) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'carpeta'" },
        { status: 400 }
      );
    }

    // Crear callback que notifica al cliente (usando Server-Sent Events o polling)
    const callback = (carpetaActualizada) => {
      console.log(`📬 Listener activado para carpeta: ${carpetaActualizada}`);
      // En una implementación real, esto podría usar Server-Sent Events o WebSockets
      // Por ahora, el cliente debe hacer polling o usar la API de sync
    };

    const desactivar = await configurarListenerIMAP(carpeta, callback);
    listenersActivos.set(carpeta, desactivar);

    return NextResponse.json(
      {
        success: true,
        message: `Listener configurado para carpeta ${carpeta}`,
        carpeta,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/listener:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al configurar el listener",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta");

    if (!carpeta) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'carpeta'" },
        { status: 400 }
      );
    }

    const desactivar = listenersActivos.get(carpeta);
    if (desactivar) {
      desactivar();
      listenersActivos.delete(carpeta);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Listener removido para carpeta ${carpeta}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/listener (DELETE):", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al remover el listener",
      },
      { status: 500 }
    );
  }
}

