import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import SocialPost, { datosAgenda, normalizarAgenda, normalizarPlataformas, normalizarTipos, plataformasDe, tiposDe } from '../../../../../models/SocialPost';
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
    tipo: tiposDe(post)[0],
    tipos: tiposDe(post),
    plataforma: plataformasDe(post)[0],
    plataformas: plataformasDe(post),
    fecha: post.fecha,
    ...datosAgenda(post),
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
    if (Array.isArray(body.tipos) || body.tipo) {
      const tipos = normalizarTipos(body.tipos, body.tipo);
      if (!tipos.length) {
        return NextResponse.json({ success: false, error: 'Elegí al menos un formato' }, { status: 400 });
      }
      post.tipos = tipos;
      post.tipo = tipos[0];
    }
    if (Array.isArray(body.plataformas) || body.plataforma) {
      const plataformas = normalizarPlataformas(body.plataformas, body.plataforma);
      if (!plataformas.length) {
        return NextResponse.json({ success: false, error: 'Elegí al menos una red' }, { status: 400 });
      }
      post.plataformas = plataformas;
      post.plataforma = plataformas[0];
    }
    if (body.hora !== undefined) post.hora = String(body.hora || '09:00').trim();
    if (body.copy !== undefined) post.copy = String(body.copy || '').trim();
    if (body.linkMaterial !== undefined) post.linkMaterial = String(body.linkMaterial || '').trim();
    if (body.fecha) {
      const fecha = new Date(body.fecha);
      if (!Number.isNaN(fecha.getTime())) post.fecha = fecha;
    }
    if (body.repeticion !== undefined || body.diasSemana !== undefined || body.fechas !== undefined) {
      const agenda = normalizarAgenda({
        repeticion: body.repeticion !== undefined ? body.repeticion : post.repeticion,
        diasSemana: body.diasSemana !== undefined ? body.diasSemana : post.diasSemana,
        fechas: body.fechas !== undefined ? body.fechas : post.fechas
      });
      if (agenda.repeticion === 'fija' && agenda.diasSemana.length === 0) {
        return NextResponse.json({ success: false, error: 'Elegí al menos un día de la semana' }, { status: 400 });
      }
      if (agenda.repeticion === 'dias' && agenda.fechas.length === 0) {
        return NextResponse.json({ success: false, error: 'Sumá al menos otro día' }, { status: 400 });
      }
      post.repeticion = agenda.repeticion;
      post.diasSemana = agenda.diasSemana;
      post.fechas = agenda.fechas;
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
      const serie = post.repeticion === 'dias' || post.repeticion === 'fija';
      const dia = typeof body.dia === 'string' ? body.dia.slice(0, 10) : '';
      if (serie && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        const hechas = (post.hechas || []).filter((marca) => marca.dia !== dia);
        if (body.estado === 'hecho') {
          hechas.push({ dia, at: new Date(), by: acceso.user._id });
        }
        post.hechas = hechas;
      } else {
        post.estado = body.estado;
        if (body.estado === 'hecho') {
          post.completedAt = new Date();
          post.completedBy = acceso.user._id;
        } else {
          post.completedAt = null;
          post.completedBy = null;
        }
      }
    }

    await post.save();
    const poblado = await SocialPost.findById(post._id).populate('cliente', 'nombre driveUrl').populate('owner', 'nombre').populate('completedBy', 'nombre').populate('hechas.by', 'nombre').lean();
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
