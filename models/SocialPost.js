import mongoose from 'mongoose';

const TIPOS = ['reel', 'story', 'post', 'carrusel', 'tiktok', 'otro'];
const PLATAFORMAS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'otra'];
const ESTADOS = ['programado', 'hecho'];

const SocialPostSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialClient',
    required: true,
    index: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: TIPOS,
    default: 'post',
    index: true
  },
  tipos: [{
    type: String,
    enum: TIPOS
  }],
  plataforma: {
    type: String,
    enum: PLATAFORMAS,
    default: 'instagram',
    index: true
  },
  plataformas: [{
    type: String,
    enum: PLATAFORMAS
  }],
  fecha: {
    type: Date,
    required: true,
    index: true
  },
  repeticion: {
    type: String,
    enum: ['unica', 'dias', 'fija'],
    default: 'unica'
  },
  diasSemana: [{
    type: Number,
    min: 0,
    max: 6
  }],
  fechas: [{
    type: Date
  }],
  hechas: [{
    dia: { type: String, trim: true },
    at: { type: Date },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  hora: {
    type: String,
    default: '09:00',
    trim: true
  },
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  copy: {
    type: String,
    trim: true
  },
  linkMaterial: {
    type: String,
    trim: true
  },
  estado: {
    type: String,
    enum: ESTADOS,
    default: 'programado',
    index: true
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

SocialPostSchema.index({ owner: 1, fecha: 1, estado: 1 });
SocialPostSchema.index({ cliente: 1, fecha: 1 });

export const SOCIAL_POST_TIPOS = TIPOS;
export const SOCIAL_POST_PLATAFORMAS = PLATAFORMAS;
export const SOCIAL_POST_ESTADOS = ESTADOS;

export function normalizarTipos(valor, legado) {
  const lista = Array.isArray(valor) ? valor : [];
  const extra = typeof legado === 'string' && legado ? [legado] : [];
  const elegidos = new Set([...lista, ...extra]);
  return TIPOS.filter((item) => elegidos.has(item));
}

export function tiposDe(post) {
  const validos = normalizarTipos(post?.tipos, post?.tipo);
  return validos.length ? validos : ['post'];
}

export function normalizarPlataformas(valor, legado) {
  const lista = Array.isArray(valor) ? valor : [];
  const extra = typeof legado === 'string' && legado ? [legado] : [];
  const validas = [];
  for (const item of [...lista, ...extra]) {
    if (PLATAFORMAS.includes(item) && !validas.includes(item)) validas.push(item);
  }
  return validas;
}

export function plataformasDe(post) {
  const validas = normalizarPlataformas(post?.plataformas, post?.plataforma);
  return validas.length ? validas : ['instagram'];
}

export function normalizarAgenda(body) {
  const repeticion = body?.repeticion === 'dias' || body?.repeticion === 'fija' ? body.repeticion : 'unica';
  const diasSemana = [...new Set(
    (Array.isArray(body?.diasSemana) ? body.diasSemana : [])
      .map(Number)
      .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)
  )];
  const fechas = (Array.isArray(body?.fechas) ? body.fechas : [])
    .map((valor) => new Date(valor))
    .filter((fecha) => !Number.isNaN(fecha.getTime()));
  return {
    repeticion,
    diasSemana: repeticion === 'fija' ? diasSemana : [],
    fechas: repeticion === 'dias' ? fechas : []
  };
}

function fechaValida(valor) {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function idTexto(valor) {
  if (!valor) return null;
  if (typeof valor === 'object') {
    if (typeof valor.toHexString === 'function') return valor.toHexString();
    const id = valor._id || valor.id;
    return id ? idTexto(id) : null;
  }
  const texto = String(valor);
  return texto && texto !== '[object Object]' ? texto : null;
}

export function serializarPostBackup(post) {
  const tipos = tiposDe(post);
  const plataformas = plataformasDe(post);
  const agenda = normalizarAgenda(post);
  const hechas = agenda.repeticion === 'unica' ? [] : (Array.isArray(post?.hechas) ? post.hechas : [])
    .map((marca) => ({
      dia: String(marca?.dia || '').slice(0, 10),
      at: fechaValida(marca?.at),
      by: idTexto(marca?.by)
    }))
    .filter((marca) => /^\d{4}-\d{2}-\d{2}$/.test(marca.dia));
  return {
    id: idTexto(post?._id) || idTexto(post?.id),
    cliente: idTexto(post?.cliente),
    owner: idTexto(post?.owner),
    tipo: tipos[0],
    tipos,
    plataforma: plataformas[0],
    plataformas,
    fecha: post?.fecha || null,
    repeticion: agenda.repeticion,
    diasSemana: agenda.diasSemana,
    fechas: agenda.fechas,
    hechas,
    hora: post?.hora || '09:00',
    titulo: post?.titulo || '',
    copy: post?.copy || '',
    linkMaterial: post?.linkMaterial || '',
    estado: post?.estado === 'hecho' ? 'hecho' : 'programado',
    completedAt: fechaValida(post?.completedAt),
    completedBy: idTexto(post?.completedBy),
    createdAt: post?.createdAt || null,
    updatedAt: post?.updatedAt || null
  };
}

export function prepararPostBackup(post, objectIdDe) {
  const cliente = objectIdDe(post?.cliente);
  const owner = objectIdDe(post?.owner);
  const titulo = String(post?.titulo || '').trim();
  const fecha = fechaValida(post?.fecha);
  if (!titulo || !cliente || !owner || !fecha) return null;
  const formatos = normalizarTipos(post?.tipos, post?.tipo);
  const tipos = formatos.length ? formatos : ['post'];
  const redes = normalizarPlataformas(post?.plataformas, post?.plataforma);
  const plataformas = redes.length ? redes : ['instagram'];
  const agenda = normalizarAgenda(post);
  const hechas = agenda.repeticion === 'unica' ? [] : (Array.isArray(post?.hechas) ? post.hechas : [])
    .map((marca) => ({
      dia: String(marca?.dia || '').slice(0, 10),
      at: fechaValida(marca?.at),
      by: objectIdDe(marca?.by)
    }))
    .filter((marca) => /^\d{4}-\d{2}-\d{2}$/.test(marca.dia));
  const doc = {
    cliente,
    owner,
    tipo: tipos[0],
    tipos,
    plataforma: plataformas[0],
    plataformas,
    fecha,
    repeticion: agenda.repeticion,
    diasSemana: agenda.diasSemana,
    fechas: agenda.fechas,
    hechas,
    hora: String(post?.hora || '09:00').trim(),
    titulo,
    copy: String(post?.copy || '').trim(),
    linkMaterial: String(post?.linkMaterial || '').trim(),
    estado: post?.estado === 'hecho' ? 'hecho' : 'programado',
    completedAt: fechaValida(post?.completedAt),
    completedBy: objectIdDe(post?.completedBy)
  };
  const id = objectIdDe(post?.id || post?._id);
  if (id) doc._id = id;
  const creado = fechaValida(post?.createdAt);
  const actualizado = fechaValida(post?.updatedAt);
  if (creado) doc.createdAt = creado;
  if (actualizado) doc.updatedAt = actualizado;
  return doc;
}

export function datosAgenda(post) {
  const agenda = normalizarAgenda(post);
  const hechas = (Array.isArray(post?.hechas) ? post.hechas : []).map((marca) => ({
    dia: marca?.dia || '',
    at: marca?.at || null,
    by: marca?.by && typeof marca.by === 'object'
      ? { id: marca.by._id?.toString(), nombre: marca.by.nombre || '' }
      : marca?.by
        ? { id: String(marca.by) }
        : null
  })).filter((marca) => marca.dia);
  return {
    ...agenda,
    hechas: agenda.repeticion === 'unica' ? [] : hechas
  };
}

if (mongoose.models.SocialPost) {
  mongoose.deleteModel('SocialPost');
}

export default mongoose.model('SocialPost', SocialPostSchema);
