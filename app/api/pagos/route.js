import { NextResponse } from 'next/server';
import connectDB from '../../../lib/mongo';
import MonthlyPayment from '../../../models/MonthlyPayment';
import Client from '../../../models/Client';
import mongoose from 'mongoose';

function getMesActualKey() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
}

function esMesPasadoKey(mes) {
  if (!mes) return false;
  const [año, mesNum] = mes.split('-').map(Number);
  const ahora = new Date();
  return año < ahora.getFullYear() ||
    (año === ahora.getFullYear() && mesNum < (ahora.getMonth() + 1));
}

function calcularMontoPagado(cliente, pagado, serviciosPagados) {
  if (!cliente) return 0;

  const servicios = Array.isArray(cliente.servicios) ? cliente.servicios : null;
  if (servicios && servicios.length > 0) {
    const mapa = serviciosPagados && typeof serviciosPagados === 'object'
      ? (serviciosPagados instanceof Map ? Object.fromEntries(serviciosPagados) : serviciosPagados)
      : {};
    return servicios.reduce((sum, servicio, index) => {
      if (mapa[index] === true || mapa[String(index)] === true) {
        return sum + (Number(servicio.precio) || 0);
      }
      return sum;
    }, 0);
  }

  if (pagado) {
    return Number(cliente.montoPago) || 0;
  }
  return 0;
}

async function findClienteByCrmId(crmClientId) {
  if (!crmClientId || crmClientId === '__month_init__') return null;
  if (mongoose.Types.ObjectId.isValid(crmClientId)) {
    const byId = await Client.findById(crmClientId).lean();
    if (byId) return byId;
  }
  return Client.findOne({ crmId: crmClientId }).lean();
}

/** Al iniciar un mes nuevo, todos los clientes vuelven a impago (flag vivo). */
async function ensureNewMonthClientReset(mesKey) {
  if (!mesKey || mesKey !== getMesActualKey()) return;

  const markerId = '__month_init__';
  const marker = await MonthlyPayment.findOne({ mes: mesKey, crmClientId: markerId }).lean();
  if (marker) return;

  await Client.updateMany({ pagado: true }, { $set: { pagado: false } });
  await MonthlyPayment.findOneAndUpdate(
    { mes: mesKey, crmClientId: markerId },
    {
      $set: {
        pagado: false,
        montoPagado: 0,
        clienteNombre: '__month_init__',
        fechaActualizacion: new Date()
      }
    },
    { upsert: true }
  );
}

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const crmClientId = searchParams.get('crmClientId');
    const clientesIds = searchParams.get('clientesIds');
    const incluirTodos = searchParams.get('incluirTodos') === 'true';

    if (mes) {
      await ensureNewMonthClientReset(mes);
    }

    const query = {};
    if (mes) query.mes = mes;

    if (incluirTodos) {
      query.crmClientId = { $ne: '__month_init__' };
    } else if (crmClientId) {
      query.crmClientId = crmClientId;
    } else if (clientesIds) {
      query.crmClientId = {
        $in: clientesIds.split(',').filter(id => id && id !== '__month_init__')
      };
    } else {
      query.crmClientId = { $ne: '__month_init__' };
    }

    const pagos = await MonthlyPayment.find(query)
      .select('mes crmClientId pagado serviciosPagados montoPagado clienteNombre fechaActualizacion createdAt updatedAt')
      .sort({ mes: -1, createdAt: -1 })
      .lean()
      .maxTimeMS(15000);

    pagos.forEach(pago => {
      if (pago.serviciosPagados && pago.serviciosPagados instanceof Map) {
        pago.serviciosPagados = Object.fromEntries(pago.serviciosPagados);
      }
      // Compatibilidad: si no hay snapshot, intentar calcularlo con el cliente vivo
      if ((pago.montoPagado === undefined || pago.montoPagado === null) && pago.pagado) {
        pago.montoPagado = undefined; // se completa abajo si hace falta
      }
    });

    // Backfill lazy de montoPagado para registros viejos (solo si el cliente aún existe)
    const sinMonto = pagos.filter(p =>
      (p.montoPagado === undefined || p.montoPagado === null) &&
      (p.pagado || (p.serviciosPagados && Object.values(p.serviciosPagados).some(Boolean)))
    );
    if (sinMonto.length > 0) {
      await Promise.all(sinMonto.map(async (pago) => {
        const cliente = await findClienteByCrmId(pago.crmClientId);
        if (!cliente) {
          pago.montoPagado = pago.montoPagado || 0;
          return;
        }
        const monto = calcularMontoPagado(cliente, pago.pagado, pago.serviciosPagados);
        pago.montoPagado = monto;
        pago.clienteNombre = pago.clienteNombre || cliente.nombre;
        // Persistir snapshot para próximas lecturas
        MonthlyPayment.updateOne(
          { mes: pago.mes, crmClientId: pago.crmClientId },
          { $set: { montoPagado: monto, clienteNombre: cliente.nombre } }
        ).catch(() => {});
      }));
    }

    return NextResponse.json({ success: true, data: pagos, esMesPasado: esMesPasadoKey(mes) }, {
      headers: {
        'Cache-Control': 'no-store',
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
    const pago = await MonthlyPayment.create(body, {
      runValidators: true,
      maxTimeMS: 5000
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

    if (!mes || !crmClientId) {
      return NextResponse.json(
        { success: false, error: 'mes y crmClientId son requeridos' },
        { status: 400 }
      );
    }

    const updateData = {
      fechaActualizacion: fechaActualizacion || new Date(),
      updatedAt: new Date()
    };

    if (pagado !== undefined) {
      updateData.pagado = pagado;
    }

    if (serviciosPagados !== undefined) {
      updateData.serviciosPagados = serviciosPagados;
    }

    // Snapshot de monto + nombre para congelar ingresos del mes
    const cliente = await findClienteByCrmId(crmClientId);
    const pagadoFinal = pagado !== undefined
      ? pagado
      : (serviciosPagados
          ? Object.values(serviciosPagados).some(Boolean)
          : false);
    const montoPagado = calcularMontoPagado(cliente, pagadoFinal, serviciosPagados);
    updateData.montoPagado = montoPagado;
    if (cliente?.nombre) {
      updateData.clienteNombre = cliente.nombre;
    }

    const pago = await MonthlyPayment.findOneAndUpdate(
      { mes, crmClientId },
      { $set: updateData },
      {
        new: true,
        upsert: true,
        lean: true,
        runValidators: true,
        maxTimeMS: 5000
      }
    ).select('-__v -__t');

    if (pago && pago.serviciosPagados && pago.serviciosPagados instanceof Map) {
      pago.serviciosPagados = Object.fromEntries(pago.serviciosPagados);
    }

    // Mantener flag vivo del cliente alineado SOLO para el mes actual
    if (cliente && mes === getMesActualKey()) {
      const todosPagados = Array.isArray(cliente.servicios) && cliente.servicios.length > 0
        ? cliente.servicios.every((_, idx) => {
            const mapa = serviciosPagados || {};
            return mapa[idx] === true || mapa[String(idx)] === true;
          })
        : !!pagadoFinal;
      await Client.updateOne(
        { _id: cliente._id },
        { $set: { pagado: todosPagados } }
      );
    }

    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
