import mongoose from 'mongoose';

const TIPOS = ['reel', 'story', 'post', 'carrusel', 'tiktok', 'otro'];
const PLATAFORMAS = ['instagram', 'facebook', 'tiktok', 'otra'];
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
  plataforma: {
    type: String,
    enum: PLATAFORMAS,
    default: 'instagram',
    index: true
  },
  fecha: {
    type: Date,
    required: true,
    index: true
  },
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

export default mongoose.models.SocialPost || mongoose.model('SocialPost', SocialPostSchema);
