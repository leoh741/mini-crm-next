import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  crmId: {
    type: String,
    required: true,
    unique: true
  },
  nombre: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  rol: {
    type: String,
    default: 'usuario'
  },
  fechaCreacion: Date,
  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

export default mongoose.models.User || mongoose.model('User', UserSchema);

