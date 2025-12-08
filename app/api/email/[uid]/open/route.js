// API route para marcar un correo como abierto/leído
// POST /api/email/:uid/open
// Marca el correo como leído en IMAP, relee los flags, actualiza cache y retorna el estado actualizado

import { NextResponse } from "next/server";
import { imapManager, ConnectionNotAvailableError } from "../../../../../lib/imapConnectionManager.js";
import { obtenerCorreoDelCache, guardarCorreoEnCache } from "../../../../../lib/emailCache.js";
import { limpiarCacheListaCarpeta } from "../../../../../lib/emailListCache.js";
import { markAsSeen } from "../../../../../lib/emailSync.js";

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  // Logs inmediatos para verificar que el endpoint se ejecuta
  console.log('>>> OPEN EMAIL API HIT - INICIO');
  
  try {
    // En Next.js 14, params puede ser una Promise en algunos casos
    const resolvedParams = params instanceof Promise ? await params : params;
    console.log('>>> OPEN EMAIL API HIT - resolvedParams:', resolvedParams);
    
    const { uid } = resolvedParams;
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta") || "INBOX";

    console.log(`>>> OPEN EMAIL API - UID: ${uid}, Carpeta: ${carpeta}`);
    console.log(`>>> OPEN EMAIL API - Request URL: ${request.url}`);

    if (!uid || isNaN(Number(uid))) {
      console.error(`>>> OPEN EMAIL API - UID inválido: ${uid}`);
      return NextResponse.json(
        { success: false, error: "UID inválido" },
        { status: 400 }
      );
    }

    const uidNumero = Number(uid);
    console.log(`>>> OPEN EMAIL API - UID numérico: ${uidNumero}`);

    // Usar markAsSeen que ya maneja todo el flujo con el manager
    // OPTIMIZACIÓN: Aplicar timeout de 5 segundos para evitar que tarde demasiado
    console.log(`>>> OPEN EMAIL API - Llamando a markAsSeen para UID: ${uidNumero}`);
    try {
      const OPEN_TIMEOUT = 5000; // 5 segundos máximo
      
      const seen = await Promise.race([
        markAsSeen(uidNumero, carpeta, true),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout marcando como leído (5s)")), OPEN_TIMEOUT)
        )
      ]);
      
      // Obtener flags actualizados del cache
      const correoCache = await obtenerCorreoDelCache(uidNumero, carpeta, true);
      const flagsReales = correoCache?.flags || ["\\Seen"];
      
      console.log(`>>> OPEN EMAIL API - markAsSeen completado: seen=${seen}, flags=${JSON.stringify(flagsReales)}`);
      
      return NextResponse.json(
        {
          success: true,
          uid: uidNumero,
          seen: seen,
          flags: flagsReales,
          carpeta,
        },
        { status: 200 }
      );
    } catch (markError) {
      // ✅ CRÍTICO: Si markAsSeen falla o hay timeout, NO marcar como leído
      // Retornar success: false para que el frontend NO actualice la UI
      if (markError.message?.includes("Timeout") || 
          markError instanceof ConnectionNotAvailableError || 
          markError.message?.includes("Connection") || 
          markError.message?.includes("ETIMEDOUT")) {
        console.warn(`>>> OPEN EMAIL API - IMAP offline o timeout, NO marcando como leído`);
        
        // NO actualizar cache local - el correo debe seguir como no leído
        // Solo retornar error para que el frontend no actualice la UI
        return NextResponse.json(
          {
            success: false,
            uid: uidNumero,
            seen: false,
            carpeta,
            error: markError.message?.includes("Timeout") 
              ? "La operación tardó demasiado. No se pudo marcar como leído en IMAP." 
              : "IMAP offline. No se pudo marcar como leído en IMAP.",
          },
          { status: 200 } // 200 para que no se trate como error HTTP, pero success: false
        );
      }
      
      // Para otros errores, también retornar success: false
      console.error(`>>> OPEN EMAIL API - Error en markAsSeen: ${markError.message}`);
      return NextResponse.json(
        {
          success: false,
          uid: uidNumero,
          seen: false,
          carpeta,
          error: markError.message || "Error al marcar como leído en IMAP",
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error(">>> OPEN EMAIL API ERROR:", error);
    console.error(">>> OPEN EMAIL API ERROR - Message:", error.message);
    console.error(">>> OPEN EMAIL API ERROR - Stack:", error.stack);
    
    // Obtener parámetros para el manejo de errores
    let uidNumero, carpeta;
    try {
      const resolvedParams = params instanceof Promise ? await params : params;
      uidNumero = Number(resolvedParams.uid);
      const { searchParams } = new URL(request.url);
      carpeta = searchParams.get("carpeta") || "INBOX";
    } catch (e) {
      // Si no podemos obtener los parámetros, devolver error genérico
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Error desconocido al abrir el correo",
        },
        { status: 500 }
      );
    }
    
    // Si es error de conexión, actualizar solo cache local
    if (error instanceof ConnectionNotAvailableError || error.message?.includes("Connection") || error.message?.includes("ETIMEDOUT")) {
      console.warn(`>>> OPEN EMAIL API - Error de conexión, actualizando solo cache local`);
      
      try {
        const correoCache = await obtenerCorreoDelCache(uidNumero, carpeta, true);
        if (correoCache) {
          const correoActualizado = {
            ...correoCache,
            flags: [...new Set([...(correoCache.flags || []), "\\Seen"])],
            leido: true,
            seen: true,
          };
          await guardarCorreoEnCache(uidNumero, carpeta, correoActualizado, correoCache.html ? true : false);
        }
        
        return NextResponse.json(
          {
            success: true,
            uid: uidNumero,
            seen: true,
            flags: correoCache?.flags || ["\\Seen"],
            carpeta,
            warning: "IMAP offline, actualizado solo en cache local",
          },
          { status: 200 }
        );
      } catch (cacheError) {
        console.error(`>>> OPEN EMAIL API - Error actualizando cache: ${cacheError.message}`);
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al abrir el correo",
      },
      { status: 500 }
    );
  }
}
