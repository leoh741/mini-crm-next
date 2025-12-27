// API route para sincronizar emails (GET o POST, no bloqueante)
// GET /api/email/sync?carpeta=INBOX&limit=50
// POST /api/email/sync
// Body: { carpeta: "INBOX", limit: 50 }
// Usa sync incremental por UID (ultra-rápido)
// NO bloquea la UI - responde inmediatamente y ejecuta sync en segundo plano

import { NextResponse } from "next/server";
import { sincronizarCarpetaIncremental } from "../../../../lib/emailSync.js";
import { syncLockManager } from "../../../../lib/syncLockManager.js";
import { imapManager, ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";

export const dynamic = 'force-dynamic';

// Tiempo mínimo entre syncs (60 segundos) - evita syncs demasiado seguidas
const MIN_SYNC_INTERVAL = 60 * 1000;
const lastSyncTimes = new Map(); // carpeta -> timestamp

/**
 * Función compartida para sincronizar (usada por GET y POST)
 */
async function handleSync(carpeta, limit) {

  // Validar que limit sea un número válido
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { ok: false, error: "El parámetro 'limit' debe ser un número entre 1 y 100" },
      { status: 400 }
    );
  }

  // Verificar si ya hubo una sync reciente (evitar syncs demasiado seguidas)
  const lastSync = lastSyncTimes.get(carpeta);
  const now = Date.now();
  if (lastSync && (now - lastSync) < MIN_SYNC_INTERVAL) {
    console.log(`⏭️ Sync omitida para ${carpeta} (última sync hace ${Math.round((now - lastSync) / 1000)}s)`);
    return NextResponse.json({
      ok: true,
      carpeta,
      synced: false,
      skipped: true,
      reason: 'Sync reciente, omitida',
    });
  }

  // Verificar si hay una sync en curso
  const lockResult = await syncLockManager.acquireLock(carpeta);
  
  if (!lockResult.acquired) {
    console.log(`⏳ Sync ya en curso para ${carpeta}`);
    return NextResponse.json({
      ok: true,
      carpeta,
      synced: false,
      skipped: true,
      reason: 'Sync en curso',
    });
  }

  // Verificar si IMAP está disponible
  if (!imapManager.isConnectionAvailable()) {
    syncLockManager.releaseLock(carpeta, null);
    console.warn(`⚠️ IMAP offline para ${carpeta}`);
    return NextResponse.json({
      ok: true,
      carpeta,
      synced: false,
      skipped: true,
      reason: 'IMAP offline',
    });
  }

  console.log(`🔄 Iniciando sync incremental para ${carpeta}`);

  // Ejecutar sync incremental (no bloqueante para la UI)
  const syncPromise = sincronizarCarpetaIncremental(carpeta, limit)
    .then(resultado => {
      lastSyncTimes.set(carpeta, Date.now());
      syncLockManager.releaseLock(carpeta, resultado);
      console.log(`✅ Sync incremental completada para ${carpeta}: ${resultado.nuevos} nuevos`);
      return resultado;
    })
    .catch(err => {
      syncLockManager.releaseLock(carpeta, { error: err.message });
      console.error(`❌ Error en sync incremental: ${err.message}`);
      throw err;
    });

  syncLockManager.setSyncPromise(carpeta, syncPromise);

  // NO esperar a que termine - responder rápido
  syncPromise.catch(err => {
    console.warn(`⚠️ Error en sync incremental (en segundo plano): ${err.message}`);
  });

  // Responder inmediatamente (la sync corre en segundo plano)
  return NextResponse.json({
    ok: true,
    carpeta,
    synced: true,
    message: 'Sincronización iniciada en segundo plano',
  });
}

/**
 * Sincroniza emails usando sync incremental por UID (GET, no bloqueante)
 * Query params: ?carpeta=INBOX&limit=50
 * Responde inmediatamente y ejecuta sync en segundo plano
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;

    return await handleSync(carpeta, limit);
  } catch (error) {
    console.error("❌ Error en API /api/email/sync (GET):", error);
    
    return NextResponse.json({
      ok: false,
      error: error.message || "Error desconocido al sincronizar",
    }, { status: 500 });
  }
}

/**
 * Sincroniza emails usando sync incremental por UID (POST, no bloqueante)
 * Body: { carpeta: "INBOX", limit: 50 }
 * Responde inmediatamente y ejecuta sync en segundo plano
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const carpeta = body.carpeta || "INBOX";
    const limit = body.limit || 50;

    return await handleSync(carpeta, limit);
  } catch (error) {
    console.error("❌ Error en API /api/email/sync (POST):", error);
    
    return NextResponse.json({
      ok: false,
      error: error.message || "Error desconocido al sincronizar",
    }, { status: 500 });
  }
}
