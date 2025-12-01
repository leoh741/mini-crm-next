import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import MonthlyPayment from '../../../models/MonthlyPayment';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const crmClientId = searchParams.get('crmClientId');
    const clientesIds = searchParams.get('clientesIds'); // Para obtener múltiples estados a la vez
    
    const query = {};
    if (mes) query.mes = mes;
    if (crmClientId) query.crmClientId = crmClientId;
    // Si se pasan múltiples IDs, buscar todos a la vez
    if (clientesIds) {
      const idsArray = clientesIds.split(',');
      query.crmClientId = { $in: idsArray };
    }
    
    // Verificar si es un mes pasado para aplicar lógica de "congelamiento" de ingresos
    let esMesPasado = false;
    let fechaFinMes = null;
    if (mes) {
      const [año, mesNum] = mes.split('-').map(Number);
      fechaFinMes = new Date(año, mesNum, 0, 23, 59, 59, 999); // Último día del mes
      
      // Verificar si es un mes pasado (no el mes actual)
      const ahora = new Date();
      esMesPasado = año < ahora.getFullYear() || 
                   (año === ahora.getFullYear() && mesNum < (ahora.getMonth() + 1));
    }
    
    let pagos;
    
    if (esMesPasado && mes) {
      // Para meses pasados, usar agregación para obtener el estado de pago tal como estaba al final del mes
      // Esto "congela" los ingresos al valor que tenían al cerrar el mes
      const pipeline = [
        { $match: query },
        // PRIMERO filtrar para mantener solo los pagos actualizados durante o antes del mes consultado
        {
          $match: {
            $or: [
              { fechaActualizacion: { $lte: fechaFinMes } },
              { fechaActualizacion: { $exists: false } } // Para pagos sin fechaActualizacion (compatibilidad)
            ]
          }
        },
        // Ordenar por fechaActualizacion descendente para obtener el estado más reciente dentro del mes
        { $sort: { fechaActualizacion: -1 } },
        // Agrupar por crmClientId y tomar el primer documento (el más reciente dentro del mes)
        {
          $group: {
            _id: '$crmClientId',
            mes: { $first: '$mes' },
            pagado: { $first: '$pagado' },
            serviciosPagados: { $first: '$serviciosPagados' },
            fechaActualizacion: { $first: '$fechaActualizacion' },
            createdAt: { $first: '$createdAt' },
            updatedAt: { $first: '$updatedAt' }
          }
        },
        // Restaurar el campo crmClientId
        {
          $addFields: {
            crmClientId: '$_id'
          }
        },
        { $project: { _id: 0 } }
      ];
      
      pagos = await MonthlyPayment.aggregate(pipeline)
        .maxTimeMS(15000); // Timeout aumentado para agregación
    } else {
      // Para el mes actual, usar query normal (más rápido)
      // Optimización para VPS: usar lean() y seleccionar solo campos necesarios
      // El índice compuesto { mes: 1, crmClientId: 1 } hace esta query muy rápida
      pagos = await MonthlyPayment.find(query)
        .select('mes crmClientId pagado serviciosPagados fechaActualizacion createdAt updatedAt')
        .sort({ mes: -1, createdAt: -1 })
        .lean()
        .maxTimeMS(10000); // Timeout optimizado para VPS (10 segundos)
    }
    
    // Convertir Map de serviciosPagados a objeto plano para JSON
    pagos.forEach(pago => {
      if (pago.serviciosPagados && pago.serviciosPagados instanceof Map) {
        pago.serviciosPagados = Object.fromEntries(pago.serviciosPagados);
      }
    });
    
    return NextResponse.json({ success: true, data: pagos }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240', // Cache más largo para servidor local
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    // Optimizado para servidor local: validadores habilitados
    const pago = await MonthlyPayment.create(body, { 
      runValidators: true, // Habilitar validadores para integridad
      maxTimeMS: 5000 // Timeout adecuado para servidor local
    });
    return NextResponse.json({ success: true, data: pago }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { mes, crmClientId, pagado, serviciosPagados, fechaActualizacion } = body;
    
    // Preparar objeto de actualización
    const updateData = {
      fechaActualizacion: fechaActualizacion || new Date(),
      updatedAt: new Date()
    };
    
    // Si viene pagado, actualizar (para compatibilidad con código antiguo)
    if (pagado !== undefined) {
      updateData.pagado = pagado;
    }
    
    // Si viene serviciosPagados, actualizar estados por servicio
    if (serviciosPagados !== undefined) {
      updateData.serviciosPagados = serviciosPagados;
    }
    
    // Optimización: usar lean() y el índice compuesto para update rápido
    // Optimizado para MongoDB Free: sin validadores, timeout reducido
    const pago = await MonthlyPayment.findOneAndUpdate(
      { mes, crmClientId }, // Usa el índice compuesto { mes: 1, crmClientId: 1 }
      { $set: updateData },
      { 
        new: true, 
        upsert: true, 
        lean: true,
        runValidators: true, // Habilitar validadores para servidor local
        maxTimeMS: 5000 // Timeout adecuado para servidor local
      }
    ).select('-__v -__t'); // Excluir campos innecesarios
    
    // Convertir Map de serviciosPagados a objeto plano para JSON
    if (pago && pago.serviciosPagados && pago.serviciosPagados instanceof Map) {
      pago.serviciosPagados = Object.fromEntries(pago.serviciosPagados);
    }
    
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

