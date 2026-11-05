import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import SocialClient from '../../../../models/SocialClient';
import User from '../../../../models/User';
import { requireRedesUser, filtroOwner, normalizarDrive, puedeSerResponsable } from '../../../../lib/redesAccess';

function serializar(cliente) {
  const owner = cliente.owner && typeof cliente.owner === 'object'
    ? { id: cliente.owner._id?.toString(), nombre: cliente.owner.nombre, email: cliente.owner.email }
    : { id: cliente.owner?.toString?.() || null };
  return {
    id: cliente._id.toString(),
    nombre: cliente.nombre,
    notas: cliente.notas || '',
    driveUrl: cliente.driveUrl || '',
    activo: cliente.activo !== false,
    owner,
    createdAt: cliente.createdAt,
    updatedAt: cliente.updatedAt
  };
}

export async function GET(request) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;

    const { searchParams } = new URL(request.url);
    const owner = filtroOwner(acceso.user, searchParams.get('ownerId'));
    const query = owner ? { owner } : {};
    const clientes = await SocialClient.find(query)
      .populate('owner', 'nombre email')
      .sort({ nombre: 1 })
      .lean();

    return NextResponse.json({ success: true, data: clientes.map(serializar) });
  } catch (error) {
    console.error('[RRSS clientes GET]', error);
    return NextResponse.json({ success: false, error: 'Error al cargar clientes de redes' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    if (acceso.rol !== 'admin') {
      return NextResponse.json({ success: false, error: 'Solo un administrador puede crear clientes de redes' }, { status: 403 });
    }

    const body = await request.json();
    const nombre = String(body.nombre || '').trim();
    if (!nombre) {
      return NextResponse.json({ success: false, error: 'El nombre es requerido' }, { status: 400 });
    }
    const drive = normalizarDrive(body.driveUrl);
    if (drive.error) {
      return NextResponse.json({ success: false, error: drive.error }, { status: 400 });
    }
    if (!body.ownerId || !mongoose.Types.ObjectId.isValid(body.ownerId)) {
      return NextResponse.json({ success: false, error: 'Elegí el responsable' }, { status: 400 });
    }
    const cm = await User.findById(body.ownerId).select('rol').lean();
    if (!cm || !puedeSerResponsable(cm.rol)) {
      return NextResponse.json({ success: false, error: 'El responsable tiene que ser un community manager o un administrador' }, { status: 400 });
    }

    const cliente = await SocialClient.create({
      nombre,
      notas: String(body.notas || '').trim(),
      driveUrl: drive.url,
      owner: cm._id,
      activo: body.activo !== false
    });
    const poblado = await SocialClient.findById(cliente._id).populate('owner', 'nombre email').lean();
    return NextResponse.json({ success: true, data: serializar(poblado) }, { status: 201 });
  } catch (error) {
    console.error('[RRSS clientes POST]', error);
    return NextResponse.json({ success: false, error: 'Error al crear el cliente de redes' }, { status: 500 });
  }
}
