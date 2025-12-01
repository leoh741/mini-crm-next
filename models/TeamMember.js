import mongoose from 'mongoose';

const TeamMemberSchema = new mongoose.Schema({
  crmId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  nombre: {
    type: String,
    required: true,
    index: true
  },
  cargo: {
    type: String,
    index: true
  },
  email: String,
  telefono: String,
  calificacion: {
    type: Number,
    min: 0,
    max: 10,
    default: 0
  },
  comentarios: [{
    texto: {
      type: String,
      required: true
    },
    autor: {
      type: String,
      required: true
    },
    fecha: {
      type: Date,
      default: Date.now
    },
    calificacion: {
      type: Number,
      min: 0,
      max: 10
    }
  }],
  activo: {
    type: Boolean,
    default: true,
    index: true
  },
  habilidades: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true
});

// Índice compuesto para búsquedas comunes
TeamMemberSchema.index({ activo: 1, nombre: 1 });
TeamMemberSchema.index({ activo: 1, cargo: 1 });
TeamMemberSchema.index({ habilidades: 1 }); // Índice para búsquedas por habilidades

export default mongoose.models.TeamMember || mongoose.model('TeamMember', TeamMemberSchema);

