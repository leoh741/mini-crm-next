// API route para obtener lista de correos SOLO desde cache
// GET /api/email/list?carpeta=INBOX&limit=50
// NUNCA ejecuta sincronización pesada si ya hay cache
// Solo usa sync inicial si no hay datos en cache

import { NextResponse } from "next/server";
import { obtenerListaDelCache } from "../../../../lib/emailListCache.js";
import { obtenerUltimosCorreos } from "../../../../lib/emailRead.js";

export const dynamic = 'force-dynamic';

/**
 * Valida que un correo tenga metadata mínima
 */
function tieneMetadataMinima(mensaje) {
  if (!mensaje) return false;
  
  const tieneRemitente = mensaje.from && 
                         mensaje.from.trim() !== '' && 
                         mensaje.from !== 'Sin remitente';
  
  const tieneAsunto = mensaje.subject && 
                      mensaje.subject.trim() !== '' && 
                      mensaje.subject !== '(Sin asunto)';
  
  const tieneFecha = mensaje.date && 
                     (mensaje.date instanceof Date && !isNaN(mensaje.date.getTime())) ||
                     (typeof mensaje.date === 'string' && !isNaN(new Date(mensaje.date).getTime()));
  
  return tieneRemitente || tieneAsunto || tieneFecha;
}

/**
 * Deduplica correos por UID
 */
function deduplicarCorreos(correos) {
  if (!Array.isArray(correos)) return [];
  
  const uniqueMap = new Map();
  let descartadosPorMetadata = 0;
  
  for (const correo of correos) {
    if (correo && correo.uid != null) {
      if (!tieneMetadataMinima(correo)) {
        descartadosPorMetadata++;
        continue;
      }
      
      if (!uniqueMap.has(correo.uid)) {
        uniqueMap.set(correo.uid, correo);
      }
    }
  }
  
  if (descartadosPorMetadata > 0) {
    console.log(`🚫 ${descartadosPorMetadata} correo(s) sin metadata válida descartado(s)`);
  }
  
  return Array.from(uniqueMap.values());
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const carpeta = searchParams.get("carpeta") || "INBOX";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 50;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { ok: false, error: "El parámetro 'limit' debe ser un número entre 1 y 100" },
        { status: 400 }
      );
    }

    // 1) Intentar leer SOLO desde cache persistente (Mongo) / memoria
    const lista = await obtenerListaDelCache(carpeta, limit);

    if (lista && lista.length > 0) {
      // 2) SI HAY CACHE → devolver inmediatamente
      const correosDeduplicados = deduplicarCorreos(lista);
      
      console.log(`✅ Lista desde cache para ${carpeta}: ${correosDeduplicados.length} correos`);
      
      return NextResponse.json({
        ok: true,
        fromCache: true,
        sincronizando: false,
        correos: correosDeduplicados,
      });
    }

    // 3) SI NO HAY NADA EN CACHE → recurre al flujo "bootstrap" / sync inicial
    // Aquí SÍ puede llamar a la lógica de sync inicial porque es la primera vez
    console.log(`⚠️ No hay cache para ${carpeta}, ejecutando sync inicial (bootstrap)`);
    
    try {
      const correos = await obtenerUltimosCorreos(carpeta, limit, true); // true = forzar sync inicial
      const correosDeduplicados = deduplicarCorreos(correos || []);
      
      return NextResponse.json({
        ok: true,
        fromCache: false,
        sincronizando: false,
        correos: correosDeduplicados,
      });
    } catch (syncError) {
      console.error(`❌ Error en sync inicial: ${syncError.message}`);
      // Si falla, retornar vacío
      return NextResponse.json({
        ok: true,
        fromCache: false,
        sincronizando: false,
        correos: [],
        error: syncError.message,
      });
    }
  } catch (error) {
    console.error("❌ Error en API /api/email/list:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error desconocido al obtener la lista",
      },
      { status: 500 }
    );
  }
}

