import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';

export async function POST(req) {
  try {
    console.log('[IMPORT CLIENTS] Iniciando importación...');
    await connectDB();
    console.log('[IMPORT CLIENTS] Conectado a MongoDB');

    const body = await req.json();
    const { data } = body;
    console.log('[IMPORT CLIENTS] Datos recibidos, cantidad:', Array.isArray(data) ? data.length : 'NO ES ARRAY');
    
    // "data" debe ser un array de clientes provenientes del JSON
    if (!Array.isArray(data)) {
      console.error('[IMPORT CLIENTS] Error: data no es un array, tipo:', typeof data);
      return NextResponse.json(
        { ok: false, message: 'El payload "data" debe ser un array', error: `Tipo recibido: ${typeof data}` },
        { status: 400 }
      );
    }

    if (data.length === 0) {
      console.warn('[IMPORT CLIENTS] Array vacío recibido');
      return NextResponse.json(
        { ok: false, message: 'El array de clientes está vacío' },
        { status: 400 }
      );
    }

    // Normalizar los datos de clientes para MongoDB
    const clientesImportados = data.map(cliente => ({
      crmId: cliente.id || cliente.crmId || `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      nombre: cliente.nombre,
      rubro: cliente.rubro,
      ciudad: cliente.ciudad,
      email: cliente.email,
      montoPago: cliente.montoPago,
      fechaPago: cliente.fechaPago,
      pagado: cliente.pagado || false,
      pagoUnico: cliente.pagoUnico || false,
      pagoMesSiguiente: cliente.pagoMesSiguiente || false,
      servicios: cliente.servicios || [],
      observaciones: cliente.observaciones
    }));

    // OPCIONAL: limpiar la colección antes de importar
    // Descomentar si quieres que la importación siempre reemplace todo:
    // await Client.deleteMany({});

    // Intentar insertar los clientes en MongoDB
    console.log('[IMPORT CLIENTS] Preparando insertar', clientesImportados.length, 'clientes');
    try {
      const result = await Client.insertMany(clientesImportados, { ordered: false });
      console.log('[IMPORT CLIENTS] Insertados:', result.length, 'clientes');

      return NextResponse.json({
        ok: true,
        inserted: result.length,
        message: `Se importaron ${result.length} clientes correctamente`
      });
    } catch (insertError) {
      console.error('[IMPORT CLIENTS] Error en insertMany:', insertError);
      // Si hay errores de duplicados, intentar uno por uno con upsert
      if (insertError.code === 11000 || insertError.name === 'BulkWriteError') {
        console.log('[IMPORT CLIENTS] Intentando insertar uno por uno debido a duplicados...');
        let insertados = 0;
        let actualizados = 0;
        for (const cliente of clientesImportados) {
          try {
            const resultado = await Client.findOneAndUpdate(
              { crmId: cliente.crmId },
              cliente,
              { upsert: true, new: true, runValidators: true }
            );
            // Verificar si fue insertado o actualizado
            const fueInsertado = !resultado.createdAt || resultado.createdAt.getTime() === resultado.updatedAt.getTime();
            if (fueInsertado) {
              insertados++;
            } else {
              actualizados++;
            }
          } catch (e) {
            console.warn('[IMPORT CLIENTS] Error al insertar/actualizar cliente:', e.message);
          }
        }
        console.log('[IMPORT CLIENTS] Resultado final - Insertados:', insertados, 'Actualizados:', actualizados);
        
        return NextResponse.json({
          ok: true,
          inserted: insertados,
          updated: actualizados,
          message: `Se importaron ${insertados} clientes nuevos y se actualizaron ${actualizados} existentes`
        });
      }
      // Si no es error de duplicado, relanzar el error
      throw insertError;
    }
  } catch (error) {
    console.error('[IMPORT CLIENTS] Error importando clientes:', error);
    console.error('[IMPORT CLIENTS] Stack:', error.stack);

    return NextResponse.json(
      { ok: false, message: 'Error al importar clientes', error: String(error) },
      { status: 500 }
    );
  }
}

