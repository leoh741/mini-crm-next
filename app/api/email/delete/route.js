// API route para eliminar correos
// POST /api/email/delete
// Mueve el correo a TRASH en IMAP en lugar de eliminarlo definitivamente
//
// OPTIMIZADO: Solo mueve el correo y actualiza cache, NO dispara syncs masivas
// Tiempo esperado: 1-3 segundos (no 35s)
//
// IMPLEMENTACIÓN DEFENSIVA: Maneja errores de JSON inválido o vacío

import { NextResponse } from "next/server";
import { moveMail } from "../../../../lib/emailSync.js";
import { limpiarCacheListaCarpeta } from "../../../../lib/emailListCache.js";
import { eliminarCorreoDelCache } from "../../../../lib/emailCache.js";
import { ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const inicioTiempo = Date.now();
  console.log(">>> DELETE EMAIL API - HIT");
  
  // ============================================
  // PASO 1: Parsear JSON del body de forma defensiva
  // ============================================
  let data;
  try {
    data = await request.json();
  } catch (error) {
    console.error("❌ DELETE EMAIL API - Error al parsear JSON del body:", error);
    console.error("❌ DELETE EMAIL API - Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json(
      { 
        ok: false, 
        success: false,
        error: "Body JSON inválido o vacío en /api/email/delete" 
      },
      { status: 400 }
    );
  }

  // Validar que data no sea null o undefined
  if (!data) {
    console.error("❌ DELETE EMAIL API - Body vacío");
    return NextResponse.json(
      { 
        ok: false,
        success: false,
        error: "Body vacío en /api/email/delete" 
      },
      { status: 400 }
    );
  }

  // ============================================
  // PASO 2: Validar que existan uid y carpeta
  // ============================================
  const { uid, carpeta } = data;

  if (!uid || !carpeta) {
    console.error("❌ DELETE EMAIL API - Falta uid o carpeta en el body", data);
    return NextResponse.json(
      { 
        ok: false,
        success: false,
        error: "uid y carpeta son obligatorios" 
      },
      { status: 400 }
    );
  }

  // Validar que uid sea un número válido
  const uidNumero = Number(uid);
  if (isNaN(uidNumero) || uidNumero <= 0) {
    console.error(`❌ DELETE EMAIL API - UID inválido: ${uid}`);
    return NextResponse.json(
      { 
        ok: false,
        success: false,
        error: "UID debe ser un número válido mayor a 0" 
      },
      { status: 400 }
    );
  }

  console.log(`>>> DELETE EMAIL API - Request recibido: UID=${uidNumero}, Carpeta=${carpeta}`);

  try {
    const origen = carpeta;
    const destino = "TRASH";

    console.log(`>>> DELETE EMAIL API - Moviendo correo UID ${uidNumero} de ${origen} a ${destino}`);

    // ============================================
    // PASO 3: Mover el correo a TRASH en IMAP
    // ============================================
    // moveMail ya está optimizado y NO dispara syncs masivas
    await moveMail(uidNumero, origen, destino);
    console.log("✅ DELETE EMAIL API - moveMail completado");

    // ============================================
    // PASO 4: Actualizar cache local (rápido, sin sync masiva)
    // ============================================
    // Eliminar del cache de origen (INBOX)
    try {
      await eliminarCorreoDelCache(uidNumero, origen);
      console.log(`✅ DELETE EMAIL API - Correo eliminado del cache de ${origen}`);
    } catch (cacheError) {
      console.warn(`⚠️ DELETE EMAIL API - Error eliminando de cache (no crítico): ${cacheError.message}`);
    }

    // ============================================
    // PASO 5: Invalidar cache de lista (rápido)
    // ============================================
    // Solo invalidar, NO reconstruir (eso lo hará la próxima carga de inbox)
    try {
      await limpiarCacheListaCarpeta(origen);
      await limpiarCacheListaCarpeta(destino);
      console.log(`✅ DELETE EMAIL API - Cache invalidado para ${origen} y ${destino}`);
    } catch (cacheError) {
      console.warn(`⚠️ DELETE EMAIL API - Error invalidando cache de lista (no crítico): ${cacheError.message}`);
      // No lanzar error, el correo ya fue movido en IMAP
    }

    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.log(`✅ DELETE EMAIL API - Completado en ${tiempoTranscurrido}ms. UID: ${uidNumero}`);

    return NextResponse.json(
      {
        ok: true,
        success: true,
        message: "Correo movido a papelera exitosamente",
        uid: uidNumero,
        from: origen,
        to: destino,
      },
      { status: 200 }
    );
  } catch (error) {
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`❌ DELETE EMAIL API - Error después de ${tiempoTranscurrido}ms:`, error);
    console.error(`❌ DELETE EMAIL API - Stack:`, error.stack);
    
    // Si es error de conexión IMAP, no modificar el estado en Mongo
    if (error instanceof ConnectionNotAvailableError || 
        error.message?.includes("Connection") || 
        error.message?.includes("ETIMEDOUT") ||
        error.code === "ETIMEDOUT") {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          status: 'error-imap',
          error: 'No se pudo conectar al servidor de correo. Intenta nuevamente.',
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: error.message || "Error desconocido al eliminar el correo",
      },
      { status: 500 }
    );
  }
}

