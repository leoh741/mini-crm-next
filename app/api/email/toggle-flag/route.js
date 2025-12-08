// API route para alternar flags en correos
// POST /api/email/toggle-flag

import { NextResponse } from "next/server";
import { toggleFlag } from "../../../../lib/emailSync.js";
import { ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let uid, carpeta, flag, activar;
  
  try {
    const body = await request.json();
    uid = body.uid;
    carpeta = body.carpeta;
    flag = body.flag;
    activar = body.activar;

    console.log(`📥 API /api/email/toggle-flag - Request recibido: UID=${uid}, Carpeta=${carpeta}, Flag=${flag}, Activar=${activar}`);

    // Validar parámetros
    if (uid === undefined || uid === null || !carpeta || !flag) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros: uid, carpeta y flag son obligatorios" },
        { status: 400 }
      );
    }

    // Validar y convertir UID a número
    const uidNumero = Number(uid);
    if (!uidNumero || !Number.isFinite(uidNumero)) {
      return NextResponse.json(
        { success: false, error: `UID inválido: ${uid}` },
        { status: 400 }
      );
    }

    // Validar que el flag sea válido
    const flagsValidos = ["\\Seen", "\\Flagged", "\\Deleted", "\\Answered", "\\Draft"];
    if (!flagsValidos.includes(flag)) {
      return NextResponse.json(
        { success: false, error: `Flag inválido. Flags válidos: ${flagsValidos.join(", ")}` },
        { status: 400 }
      );
    }

    // Llamar a toggleFlag con UID numérico
    const resultado = await toggleFlag(uidNumero, carpeta, flag, activar);

    // Si IMAP está offline, devolver respuesta offline (NO 500)
    if (resultado.offline || !resultado.success) {
      console.warn(`>>> toggle-flag API - IMAP offline o error: ${JSON.stringify(resultado)}`);
      return NextResponse.json(
        {
          success: false,
          offline: true,
          message: "IMAP temporalmente offline, se reintentará automáticamente",
          important: resultado.important ?? (flag === "\\Flagged" ? (activar !== null ? activar : null) : null),
          flags: resultado.flags,
          uid: uidNumero,
        },
        { status: 503 }
      );
    }

    // Si fue exitoso, devolver los datos actualizados
    const flagsActualizados = resultado.flags || [];
    const important = flag === "\\Flagged" ? (resultado.important ?? flagsActualizados.includes("\\Flagged")) : null;

    console.log(`✅ toggle-flag API - Respuesta exitosa: uid=${uidNumero}, flag=${flag}, important=${important}, flags=${JSON.stringify(flagsActualizados)}`);

    return NextResponse.json(
      {
        success: true,
        message: `Flag ${flag} ${flagsActualizados.includes(flag) ? 'activado' : 'desactivado'}`,
        flag,
        activo: flagsActualizados.includes(flag),
        important: important, // Para flag \Flagged, devolver el estado de important
        flags: flagsActualizados, // Devolver flags actualizados como fuente de verdad
        uid: uidNumero,
        carpeta,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/toggle-flag:", error);
    console.error("❌ Stack:", error.stack);
    
    // Si es error de conexión IMAP o timeout, devolver respuesta offline (NO 500)
    if (error instanceof ConnectionNotAvailableError || 
        error.code === 'ETIMEOUT' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes("Connection") || 
        error.message?.includes("ETIMEDOUT") ||
        error.message?.includes("ETIMEOUT") ||
        error.message?.includes("timeout") ||
        error.message?.includes("Socket timeout")) {
      return NextResponse.json(
        {
          success: false,
          offline: true,
          message: "IMAP temporalmente offline, se reintentará automáticamente",
          important: flag === "\\Flagged" ? (activar !== null ? activar : null) : null,
          flags: null,
          uid: uid ? Number(uid) : null,
        },
        { status: 503 }
      );
    }
    
    // Solo errores realmente inesperados devuelven 500
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al alternar el flag",
        uid: uid ? Number(uid) : null,
      },
      { status: 500 }
    );
  }
}

