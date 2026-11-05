import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import SocialClient from '../../../../../models/SocialClient';
import SocialPost from '../../../../../models/SocialPost';
import User from '../../../../../models/User';
import { requireRedesUser, normalizarDrive, puedeSerResponsable } from '../../../../../lib/redesAccess';

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

async function cargarPropio(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const cliente = await SocialClient.findById(id);
  if (!cliente) return null;
  if (user.rol !== 'admin' && cliente.owner.toString() !== user._id.toString()) return 'ajeno';
  return cliente;
}

export async function PATCH(request, { params }) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    if (acceso.rol !== 'admin') {
      return NextResponse.json({ success: false, error: 'Solo un administrador puede editar clientes de redes' }, { status: 403 });
    }
    const { id } = await params;
    const cliente = await cargarPropio(id, acceso.user);
    if (cliente === 'ajeno') {
      return NextResponse.json({ success: false, error: 'No podés editar un cliente de otro CM' }, { status: 403 });
    }
    if (!cliente) {
      return NextResponse.json({ success: false, error: 'Cliente no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    if (body.nombre !== undefined) {
      const nombre = String(body.nombre || '').trim();
      if (!nombre) {
        return NextResponse.json({ success: false, error: 'El nombre es requerido' }, { status: 400 });
      }
      cliente.nombre = nombre;
    }
    if (body.notas !== undefined) cliente.notas = String(body.notas || '').trim();
    if (body.driveUrl !== undefined) {
      const drive = normalizarDrive(body.driveUrl);
      if (drive.error) {
        return NextResponse.json({ success: false, error: drive.error }, { status: 400 });
      }
      cliente.driveUrl = drive.url;
    }
    if (body.activo !== undefined) cliente.activo = Boolean(body.activo);

    if (body.ownerId && mongoose.Types.ObjectId.isValid(body.ownerId)) {
      const cm = await User.findById(body.ownerId).select('rol').lean();
      if (!cm || !puedeSerResponsable(cm.rol)) {
        return NextResponse.json({ success: false, error: 'El responsable tiene que ser un community manager o un administrador' }, { status: 400 });
      }
      cliente.owner = cm._id;
      await SocialPost.updateMany({ cliente: cliente._id }, { owner: cm._id });
    }

    await cliente.save();
    const poblado = await SocialClient.findById(cliente._id).populate('owner', 'nombre email').lean();
    return NextResponse.json({ success: true, data: serializar(poblado) });
  } catch (error) {
    console.error('[RRSS clientes PATCH]', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar el cliente' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    if (acceso.rol !== 'admin') {
      return NextResponse.json({ success: false, error: 'Solo un administrador puede eliminar clientes de redes' }, { status: 403 });
    }
    const { id } = await params;
    const cliente = await cargarPropio(id, acceso.user);
    if (cliente === 'ajeno') {
      return NextResponse.json({ success: false, error: 'No podés eliminar un cliente de otro CM' }, { status: 403 });
    }
    if (!cliente) {
      return NextResponse.json({ success: false, error: 'Cliente no encontrado' }, { status: 404 });
    }
    await SocialPost.deleteMany({ cliente: cliente._id });
    await cliente.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RRSS clientes DELETE]', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar el cliente' }, { status: 500 });
  }
}
