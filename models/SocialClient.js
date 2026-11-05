import mongoose from 'mongoose';

const SocialClientSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  notas: {
    type: String,
    trim: true
  },
  driveUrl: {
    type: String,
    trim: true,
    default: ''
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  activo: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

SocialClientSchema.index({ owner: 1, nombre: 1 });

if (mongoose.models.SocialClient) {
  mongoose.deleteModel('SocialClient');
}

export default mongoose.model('SocialClient', SocialClientSchema);
