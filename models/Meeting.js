import mongoose from 'mongoose';

const MeetingSchema = new mongoose.Schema({
  reunionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  titulo: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fecha: {
    type: Date,
    required: true,
    index: true
  },
  hora: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'La hora debe estar en formato HH:MM (24 horas)'
    }
  },
  tipo: {
    type: String,
    enum: ['meet', 'oficina'],
    required: true,
    index: true
  },
  cliente: {
    nombre: String,
    crmId: String
  },
  linkMeet: {
    type: String,
    trim: true
  },
  observaciones: {
    type: String,
    trim: true
  },
  asignados: [{
    type: String,
    trim: true
  }],
  completada: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

MeetingSchema.index({ fecha: 1, hora: 1 });
MeetingSchema.index({ completada: 1, fecha: 1 });
MeetingSchema.index({ tipo: 1, fecha: 1 });

// Los IDs se generan en el código antes de crear la instancia
// Se eliminaron los hooks pre() para evitar conflictos con Mongoose 9

// Limpiar el modelo si existe para evitar hooks cacheados
if (mongoose.models.Meeting) {
  delete mongoose.models.Meeting;
}

export default mongoose.model('Meeting', MeetingSchema);

