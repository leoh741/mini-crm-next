// API route para sincronizar emails nuevos automáticamente
// GET /api/email/sync?carpeta=INBOX&limit=10
// Esta función verifica emails nuevos y los guarda en la base de datos con contenido completo

import { NextResponse } from "next/server";
import { obtenerUltimosCorreos, obtenerCorreoPorUID } from "../../../../lib/emailRead.js";

// Forzar que esta ruta sea dinámica (no pre-renderizada durante el build)
export const dynamic = 'force-dynamic';

/**
 * Sincroniza los emails nuevos: obtiene la lista y guarda cada uno con contenido completo en la DB
 * Query params: 
 *   - carpeta (string, por defecto INBOX)
 *   - limit (número, por defecto 10)
 */
export async function GET(request) {
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

    console.log(`🔄 Iniciando sincronización de emails - Carpeta: ${carpeta}, Límite: ${limit}`);

    // Obtener la lista de correos (solo metadatos, rápido)
    let mensajes;
    try {
      mensajes = await obtenerUltimosCorreos(carpeta, limit);
    } catch (error) {
      // Si la carpeta no existe, retornar array vacío
      if (error.message && error.message.includes("no existe")) {
        return NextResponse.json(
          {
            success: true,
            mensajes: [],
            carpeta,
            sincronizados: 0,
            total: 0,
            mensaje: `La carpeta "${carpeta}" no existe en el servidor`,
          },
          { status: 200 }
        );
      }
      throw error;
    }

    if (mensajes.length === 0) {
      return NextResponse.json(
        {
          success: true,
          mensajes: [],
          carpeta,
          sincronizados: 0,
          total: 0,
          mensaje: "No hay correos para sincronizar",
        },
        { status: 200 }
      );
    }

    console.log(`📧 Encontrados ${mensajes.length} correos para sincronizar`);

    // Sincronizar cada correo: cargar con contenido completo (esto lo guarda automáticamente en DB)
    const resultados = {
      exitosos: 0,
      fallidos: 0,
      errores: [],
    };

    // Procesar en secuencia para no saturar el servidor
    for (let i = 0; i < mensajes.length; i++) {
      const mensaje = mensajes[i];
      
      try {
        // Cargar el correo con contenido completo
        // Esto automáticamente lo guarda en MongoDB gracias al sistema de cache
        await obtenerCorreoPorUID(mensaje.uid, carpeta, true); // true = incluir contenido completo
        
        resultados.exitosos++;
        console.log(`✅ Sincronizado correo ${i + 1}/${mensajes.length} - UID: ${mensaje.uid}`);
        
        // Pequeña pausa entre correos para no saturar (reducida para sincronización más rápida)
        if (i < mensajes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms entre correos (reducido de 200ms)
        }
      } catch (error) {
        resultados.fallidos++;
        resultados.errores.push({
          uid: mensaje.uid,
          error: error.message || "Error desconocido",
        });
        console.warn(`⚠️ Error sincronizando correo UID ${mensaje.uid}: ${error.message}`);
        // Continuar con el siguiente correo aunque este falle
      }
    }

    console.log(`🎉 Sincronización completada - Exitosos: ${resultados.exitosos}, Fallidos: ${resultados.fallidos}`);

    return NextResponse.json(
      {
        success: true,
        mensajes,
        carpeta,
        sincronizados: resultados.exitosos,
        fallidos: resultados.fallidos,
        total: mensajes.length,
        errores: resultados.errores.length > 0 ? resultados.errores : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error en API /api/email/sync:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al sincronizar los correos",
      },
      { status: 500 }
    );
  }
}

