// API route para sincronizar emails nuevos automáticamente
// GET /api/email/sync?carpeta=INBOX&limit=10
// Esta función verifica emails nuevos y los guarda en la base de datos con contenido completo
// 
// MEJORAS IMPLEMENTADAS:
// - Sistema de locks por carpeta para evitar syncs simultáneas
// - Timeout controlado (15s máximo)
// - Respuesta rápida si ya hay una sync en curso (espera resultado)

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos, obtenerCorreoPorUID } from "../../../../lib/emailRead.js";
import { imapManager, ConnectionNotAvailableError } from "../../../../lib/imapConnectionManager.js";
import { obtenerListaDelCache } from "../../../../lib/emailListCache.js";
import { syncLockManager } from "../../../../lib/syncLockManager.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

// Timeout máximo para sincronizaciones (15 segundos)
const SYNC_TIMEOUT = 15000;

/**
 * Sincroniza los emails nuevos: obtiene la lista y guarda cada uno con contenido completo en la DB
 * Query params: 
 *   - carpeta (string, por defecto INBOX)
 *   - limit (número, por defecto 10)
 * 
 * MEJORAS:
 * - Usa locks para evitar syncs simultáneas
 * - Timeout controlado (15s)
 * - Si hay sync en curso, espera su resultado en lugar de iniciar otra
 */
export async function GET(request) {
  const inicioTiempo = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 10;

    // Validar que limit sea un número válido
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        { success: false, error: "El parámetro 'limit' debe ser un número entre 1 y 50" },
        { status: 400 }
      );
    }

    // ============================================
    // PASO 1: Verificar si hay una sync en curso para esta carpeta
    // ============================================
    const lockResult = await syncLockManager.acquireLock(carpeta);
    
    if (!lockResult.acquired) {
      // Ya hay una sync en curso, esperar su resultado o retornar cache
      console.log(`⏳ Sync en curso para ${carpeta}, esperando resultado...`);
      
      try {
        // Esperar el resultado de la sync en curso con timeout más corto (10s)
        const WAIT_TIMEOUT = 10000; // 10 segundos para esperar resultado de sync en curso
        
        const resultado = await Promise.race([
          lockResult.waitForResult,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout esperando resultado de sync")), WAIT_TIMEOUT)
          )
        ]);
        
        if (resultado && !resultado.error) {
          const tiempoTranscurrido = Date.now() - inicioTiempo;
          console.log(`✅ Resultado obtenido de sync en curso para ${carpeta} (espera: ${tiempoTranscurrido}ms)`);
          return NextResponse.json({
            ...resultado,
            fromExistingSync: true,
            waitTime: tiempoTranscurrido
          });
        }
      } catch (waitError) {
        console.warn(`⚠️ Timeout esperando resultado de sync en curso para ${carpeta}, retornando cache`);
        // NO continuar con nueva sync - retornar cache en su lugar
        const correosDesdeCache = await obtenerListaDelCache(carpeta, limit);
        return NextResponse.json({
          success: true,
          status: 'sync-in-progress',
          mensajes: correosDesdeCache || [],
          carpeta,
          sincronizados: 0,
          total: correosDesdeCache?.length || 0,
          warning: 'Hay una sincronización en curso. Mostrando datos en cache.',
        });
      }
    }

    // ============================================
    // PASO 2: Verificar si IMAP está disponible
    // ============================================
    if (!imapManager.isConnectionAvailable()) {
      console.warn('⚠️ /api/email/sync llamado mientras IMAP está offline. Devolviendo solo cache.');
      syncLockManager.releaseLock(carpeta, null);
      
      const correosDesdeCache = await obtenerListaDelCache(carpeta, limit);
      
      return NextResponse.json({
        success: true,
        status: 'offline-cache',
        mensajes: correosDesdeCache || [],
        carpeta,
        sincronizados: 0,
        total: correosDesdeCache?.length || 0,
        warning: 'Servidor IMAP no disponible, mostrando datos en modo offline.',
      });
    }

    console.log(`🔄 Iniciando sincronización de emails - Carpeta: ${carpeta}, Límite: ${limit}`);

    // ============================================
    // PASO 3: Ejecutar sincronización con timeout
    // ============================================
    const syncPromise = ejecutarSincronizacion(carpeta, limit);
    syncLockManager.setSyncPromise(carpeta, syncPromise);
    
    // Aplicar timeout a la sincronización
    let resultado;
    let timeoutOcurrido = false;
    
    try {
      resultado = await Promise.race([
        syncPromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            timeoutOcurrido = true;
            reject(new Error("Timeout de sincronización (15s)"));
          }, SYNC_TIMEOUT);
        })
      ]);
      
      // Si llegamos aquí, la sync se completó a tiempo
      syncLockManager.releaseLock(carpeta, resultado);
      
      const tiempoTranscurrido = Date.now() - inicioTiempo;
      console.log(`✅ Sincronización completada para ${carpeta} en ${tiempoTranscurrido}ms`);
      
      return NextResponse.json(resultado);
    } catch (raceError) {
      // Si es timeout, NO liberar el lock todavía (la sync sigue corriendo en segundo plano)
      // Solo retornar cache y dejar que la sync termine en segundo plano
      if (timeoutOcurrido) {
        console.warn(`⚠️ Timeout en sync para ${carpeta}, retornando cache. Sync continúa en segundo plano.`);
        
        // La syncPromise sigue corriendo, pero no esperamos su resultado
        // Asegurar que el lock se libere cuando la sync termine (o expire después de MAX_LOCK_AGE)
        syncPromise
          .then((resultado) => {
            // Si la sync termina exitosamente después del timeout, liberar el lock
            syncLockManager.releaseLock(carpeta, resultado);
            console.log(`✅ Sync completada después del timeout para ${carpeta}`);
          })
          .catch((error) => {
            // Si la sync falla después del timeout, liberar el lock
            syncLockManager.releaseLock(carpeta, { error: error.message });
            console.warn(`⚠️ Sync falló después del timeout para ${carpeta}: ${error.message}`);
          });
        
        // Retornar cache inmediatamente
        const correosDesdeCache = await obtenerListaDelCache(carpeta, limit);
        return NextResponse.json({
          success: true,
          status: 'timeout-cache',
          mensajes: correosDesdeCache || [],
          carpeta,
          sincronizados: 0,
          total: correosDesdeCache?.length || 0,
          warning: 'La sincronización tardó demasiado. Mostrando datos en cache.',
        });
      }
      
      // Si no es timeout, liberar el lock y lanzar el error
      syncLockManager.releaseLock(carpeta, { error: raceError.message });
      throw raceError;
    }
    
  } catch (error) {
    const carpeta = new URL(request.url).searchParams.get("carpeta") || "INBOX";
    syncLockManager.releaseLock(carpeta, { error: error.message });
    
    const tiempoTranscurrido = Date.now() - inicioTiempo;
    console.error(`❌ Error en API /api/email/sync después de ${tiempoTranscurrido}ms:`, error);
    
    // Si es timeout, retornar error controlado
    if (error.message?.includes("Timeout")) {
      const limitParam = new URL(request.url).searchParams.get("limit");
      const limit = limitParam ? Number(limitParam) : 10;
      
      // Intentar retornar cache como fallback
      try {
        const correosDesdeCache = await obtenerListaDelCache(carpeta, limit);
        return NextResponse.json({
          success: true,
          status: 'timeout-cache',
          mensajes: correosDesdeCache || [],
          carpeta,
          sincronizados: 0,
          total: correosDesdeCache?.length || 0,
          warning: 'La sincronización tardó demasiado. Mostrando datos en cache.',
        });
      } catch (cacheError) {
        return NextResponse.json({
          success: false,
          error: 'La sincronización tardó demasiado y no hay datos en cache.',
        }, { status: 504 });
      }
    }
    
    // Si es error de conexión IMAP, retornar cache si existe
    if (error instanceof ConnectionNotAvailableError || error.message?.includes("Connection") || error.message?.includes("ETIMEDOUT")) {
      try {
        const { searchParams } = new URL(request.url);
        const carpeta = searchParams.get("carpeta") || "INBOX";
        const limitParam = searchParams.get("limit");
        const limit = limitParam ? Number(limitParam) : 10;
        
        const mensajesCache = await obtenerListaDelCache(carpeta, limit);
        return NextResponse.json({
          success: true,
          status: 'offline-cache',
          mensajes: mensajesCache || [],
          carpeta,
          sincronizados: 0,
          total: mensajesCache?.length || 0,
          warning: 'No se pudo conectar al servidor IMAP, mostrando datos en modo offline.',
        }, { status: 200 });
      } catch (cacheError) {
        return NextResponse.json({
          success: false,
          status: 'error-imap',
          error: 'No se pudo conectar al servidor de correo. Intenta nuevamente.',
        }, { status: 503 });
      }
    }
    
    return NextResponse.json({
      success: false,
      error: error.message || "Error desconocido al sincronizar los correos",
    }, { status: 500 });
  }
}

/**
 * Ejecuta la sincronización real (separado para aplicar timeout)
 */
async function ejecutarSincronizacion(carpeta, limit) {

  // Obtener la lista de correos (solo metadatos, rápido)
  // IMPORTANTE: Forzar desde servidor para sincronizar correctamente
  let mensajes;
  try {
    mensajes = await obtenerUltimosCorreos(carpeta, limit, true);
  } catch (error) {
    // Si la carpeta no existe, retornar array vacío
    if (error.message && error.message.includes("no existe")) {
      return {
        success: true,
        mensajes: [],
        carpeta,
        sincronizados: 0,
        total: 0,
        mensaje: `La carpeta "${carpeta}" no existe en el servidor`,
      };
    }
    throw error;
  }

  if (mensajes.length === 0) {
    return {
      success: true,
      mensajes: [],
      carpeta,
      sincronizados: 0,
      total: 0,
      mensaje: "No hay correos para sincronizar",
    };
  }

  console.log(`📧 Encontrados ${mensajes.length} correos para sincronizar`);

  // ============================================
  // OPTIMIZACIÓN CRÍTICA: Solo sincronizar metadatos (sin contenido completo)
  // El contenido completo se descarga solo cuando se abre un correo específico
  // Esto hace que la sync sea rápida (< 5s) en lugar de lenta (> 15s)
  // ============================================
  
  // Los mensajes ya vienen con metadatos desde obtenerUltimosCorreos
  // No necesitamos descargar contenido completo aquí
  const exitosos = mensajes; // Ya tienen metadatos completos
  const errores = [];

  console.log(`✅ Sincronización de metadatos completada: ${exitosos.length} correos`);
  
  // El contenido completo se descargará en segundo plano (no bloquea)
  // descargarContenidoCompletoEnSegundoPlano ya se ejecuta desde obtenerUltimosCorreos

  // Determinar status final
  const status = !imapManager.isConnectionAvailable() ? 'offline-cache' : 'online';
  
  // Si quedó offline o no hay correos exitosos, usar cache
  const correosFinales = exitosos.length > 0 ? exitosos : (await obtenerListaDelCache(carpeta, limit) || []);

  console.log(`🎉 Sincronización de metadatos completada - Exitosos: ${exitosos.length}, Fallidos: ${errores.length}, Status: ${status}`);

  return {
    success: true,
    status,
    mensajes: correosFinales,
    carpeta,
    sincronizados: exitosos.length,
    fallidos: errores.length,
    total: correosFinales.length,
    errores: errores.length > 0 ? errores : undefined,
    warning: status === 'offline-cache' ? 'Servidor IMAP no disponible, mostrando datos en modo offline.' : undefined,
  };
}

