import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/mongo';
import Client from '../../../../models/Client';

export async function POST(req) {
  try {
    await connectDB();

    const { data } = await req.json();
    // "data" debe ser un array de clientes provenientes del JSON

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { ok: false, message: 'El payload "data" debe ser un array' },
        { status: 400 }
      );
    }

    if (data.length === 0) {
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
    try {
      await Client.insertMany(clientesImportados, { ordered: false });

      return NextResponse.json({
        ok: true,
        inserted: clientesImportados.length,
        message: `Se importaron ${clientesImportados.length} clientes correctamente`
      });
    } catch (insertError) {
      // Si hay errores de duplicados, intentar uno por uno con upsert
      if (insertError.code === 11000 || insertError.name === 'BulkWriteError') {
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
            console.warn('Error al insertar/actualizar cliente:', e.message);
          }
        }
        
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
    console.error('Error importando clientes:', error);

    return NextResponse.json(
      { ok: false, message: 'Error al importar clientes: ' + error.message },
      { status: 500 }
    );
  }
}

