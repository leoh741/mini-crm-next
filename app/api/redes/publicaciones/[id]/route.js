import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import SocialPost from '../../../../../models/SocialPost';
import SocialClient from '../../../../../models/SocialClient';
import { requireRedesUser } from '../../../../../lib/redesAccess';

function serializar(post) {
  const cliente = post.cliente && typeof post.cliente === 'object'
    ? { id: post.cliente._id?.toString(), nombre: post.cliente.nombre, driveUrl: post.cliente.driveUrl || '' }
    : { id: post.cliente?.toString?.() || null };
  const owner = post.owner && typeof post.owner === 'object'
    ? { id: post.owner._id?.toString(), nombre: post.owner.nombre }
    : { id: post.owner?.toString?.() || null };
  const completedBy = post.completedBy && typeof post.completedBy === 'object'
    ? { id: post.completedBy._id?.toString(), nombre: post.completedBy.nombre }
    : post.completedBy
      ? { id: post.completedBy.toString() }
      : null;
  return {
    id: post._id.toString(),
    cliente,
    owner,
    tipo: post.tipo,
    plataforma: post.plataforma,
    fecha: post.fecha,
    hora: post.hora || '09:00',
    titulo: post.titulo,
    copy: post.copy || '',
    linkMaterial: post.linkMaterial || '',
    estado: post.estado,
    completedAt: post.completedAt || null,
    completedBy,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

async function cargarPropio(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const post = await SocialPost.findById(id);
  if (!post) return null;
  if (user.rol !== 'admin' && post.owner.toString() !== user._id.toString()) return 'ajeno';
  return post;
}

export async function PATCH(request, { params }) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    const { id } = await params;
    const post = await cargarPropio(id, acceso.user);
    if (post === 'ajeno') {
      return NextResponse.json({ success: false, error: 'No podés editar una publicación de otro CM' }, { status: 403 });
    }
    if (!post) {
      return NextResponse.json({ success: false, error: 'Publicación no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    if (body.titulo !== undefined) {
      const titulo = String(body.titulo || '').trim();
      if (!titulo) {
        return NextResponse.json({ success: false, error: 'El título es requerido' }, { status: 400 });
      }
      post.titulo = titulo;
    }
    if (body.tipo) post.tipo = body.tipo;
    if (body.plataforma) post.plataforma = body.plataforma;
    if (body.hora !== undefined) post.hora = String(body.hora || '09:00').trim();
    if (body.copy !== undefined) post.copy = String(body.copy || '').trim();
    if (body.linkMaterial !== undefined) post.linkMaterial = String(body.linkMaterial || '').trim();
    if (body.fecha) {
      const fecha = new Date(body.fecha);
      if (!Number.isNaN(fecha.getTime())) post.fecha = fecha;
    }
    if (body.clienteId && mongoose.Types.ObjectId.isValid(body.clienteId)) {
      const cliente = await SocialClient.findById(body.clienteId);
      if (!cliente) {
        return NextResponse.json({ success: false, error: 'Cliente no encontrado' }, { status: 404 });
      }
      if (acceso.rol !== 'admin' && cliente.owner.toString() !== acceso.user._id.toString()) {
        return NextResponse.json({ success: false, error: 'Ese cliente no es de tu cartera' }, { status: 403 });
      }
      post.cliente = cliente._id;
      post.owner = cliente.owner;
    }
    if (body.estado === 'hecho' || body.estado === 'programado') {
      post.estado = body.estado;
      if (body.estado === 'hecho') {
        post.completedAt = new Date();
        post.completedBy = acceso.user._id;
      } else {
        post.completedAt = null;
        post.completedBy = null;
      }
    }

    await post.save();
    const poblado = await SocialPost.findById(post._id).populate('cliente', 'nombre driveUrl').populate('owner', 'nombre').populate('completedBy', 'nombre').lean();
    return NextResponse.json({ success: true, data: serializar(poblado) });
  } catch (error) {
    console.error('[RRSS publicaciones PATCH]', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar la publicación' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    const { id } = await params;
    const post = await cargarPropio(id, acceso.user);
    if (post === 'ajeno') {
      return NextResponse.json({ success: false, error: 'No podés eliminar una publicación de otro CM' }, { status: 403 });
    }
    if (!post) {
      return NextResponse.json({ success: false, error: 'Publicación no encontrada' }, { status: 404 });
    }
    await post.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RRSS publicaciones DELETE]', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar la publicación' }, { status: 500 });
  }
}
