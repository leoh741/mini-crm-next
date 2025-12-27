// API route para reintentar descargar el body de un correo
// POST /api/email/fetch-body
// Body: { uid: number, carpeta: string }

import { NextResponse } from "next/server";
import { enqueueFetchBody } from "../../../../lib/emailBodyFetcher.js";
import { obtenerCorreoDelCache } from "../../../../lib/emailCache.js";

// Forzar que esta ruta sea dinámica
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const inicioTiempo = Date.now();
  console.log("[/api/email/fetch-body] Request recibido");
  
  try {
    const body = await request.json();
    const { uid, carpeta } = body;

    if (!uid) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'uid'" },
        { status: 400 }
      );
    }

    if (!carpeta) {
      return NextResponse.json(
        { success: false, error: "Falta el parámetro 'carpeta'" },
        { status: 400 }
      );
    }

    const uidNumero = Number(uid);
    if (isNaN(uidNumero)) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'uid' debe ser un número" },
        { status: 400 }
      );
    }

    // Verificar que el correo existe en cache
    const correo = await obtenerCorreoDelCache(uidNumero, carpeta, false);
    if (!correo) {
      return NextResponse.json(
        {
          success: false,
          error: "Correo no encontrado en cache. Debe sincronizarse primero.",
        },
        { status: 404 }
      );
    }

    // Encolar descarga con forzarReintento=true
    enqueueFetchBody(uidNumero, carpeta, true);

    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.log(`[/api/email/fetch-body] ✅ Descarga de body encolada para UID ${uidNumero} (${tiempoTranscurrido}ms)`);

    return NextResponse.json(
      {
        success: true,
        message: "Descarga de body encolada. El contenido se actualizará automáticamente cuando esté listo.",
        uid: uidNumero,
        carpeta: carpeta,
      },
      { status: 200 }
    );
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`[/api/email/fetch-body] ❌ Error después de ${tiempoTranscurrido}ms:`, error.message);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al encolar descarga de body",
      },
      { status: 500 }
    );
  }
}

