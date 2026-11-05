import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import SocialPost from '../../../../models/SocialPost';
import SocialClient from '../../../../models/SocialClient';
import { requireRedesUser, filtroOwner } from '../../../../lib/redesAccess';

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

export async function GET(request) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;

    const { searchParams } = new URL(request.url);
    const query = {};
    const owner = filtroOwner(acceso.user, searchParams.get('ownerId'));
    if (owner) query.owner = owner;

    const clienteId = searchParams.get('clienteId');
    if (clienteId && mongoose.Types.ObjectId.isValid(clienteId)) {
      query.cliente = clienteId;
    }
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    if (desde || hasta) {
      query.fecha = {};
      if (desde) query.fecha.$gte = new Date(desde);
      if (hasta) query.fecha.$lte = new Date(hasta);
    }
    const estado = searchParams.get('estado');
    if (estado === 'programado' || estado === 'hecho') query.estado = estado;

    const posts = await SocialPost.find(query)
      .populate('cliente', 'nombre driveUrl')
      .populate('owner', 'nombre')
      .populate('completedBy', 'nombre')
      .sort({ fecha: 1, hora: 1 })
      .lean();

    return NextResponse.json({ success: true, data: posts.map(serializar) });
  } catch (error) {
    console.error('[RRSS publicaciones GET]', error);
    return NextResponse.json({ success: false, error: 'Error al cargar publicaciones' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const acceso = await requireRedesUser(request);
    if (acceso.error) return acceso.error;
    const body = await request.json();

    if (!mongoose.Types.ObjectId.isValid(body.clienteId)) {
      return NextResponse.json({ success: false, error: 'Elegí un cliente' }, { status: 400 });
    }
    const cliente = await SocialClient.findById(body.clienteId);
    if (!cliente) {
      return NextResponse.json({ success: false, error: 'Cliente no encontrado' }, { status: 404 });
    }
    if (acceso.rol !== 'admin' && cliente.owner.toString() !== acceso.user._id.toString()) {
      return NextResponse.json({ success: false, error: 'Ese cliente no es de tu cartera' }, { status: 403 });
    }

    const titulo = String(body.titulo || '').trim();
    if (!titulo) {
      return NextResponse.json({ success: false, error: 'El título es requerido' }, { status: 400 });
    }
    const fecha = body.fecha ? new Date(body.fecha) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) {
      return NextResponse.json({ success: false, error: 'La fecha es requerida' }, { status: 400 });
    }

    const post = await SocialPost.create({
      cliente: cliente._id,
      owner: cliente.owner,
      tipo: body.tipo || 'post',
      plataforma: body.plataforma || 'instagram',
      fecha,
      hora: String(body.hora || '09:00').trim(),
      titulo,
      copy: String(body.copy || '').trim(),
      linkMaterial: String(body.linkMaterial || '').trim(),
      estado: 'programado'
    });
    const poblado = await SocialPost.findById(post._id).populate('cliente', 'nombre driveUrl').populate('owner', 'nombre').populate('completedBy', 'nombre').lean();
    return NextResponse.json({ success: true, data: serializar(poblado) }, { status: 201 });
  } catch (error) {
    console.error('[RRSS publicaciones POST]', error);
    return NextResponse.json({ success: false, error: 'Error al crear la publicación' }, { status: 500 });
  }
}
