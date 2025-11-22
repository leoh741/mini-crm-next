import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema({
  crmId: {
    type: String,
    required: true,
    unique: true,
    index: true // Índice para búsquedas rápidas por crmId
  },
  nombre: {
    type: String,
    required: true,
    index: true // Índice para búsquedas por nombre
  },
  rubro: {
    type: String,
    index: true // Índice para filtros por rubro
  },
  ciudad: String,
  email: String,
  montoPago: Number,
  fechaPago: Number,
  pagado: {
    type: Boolean,
    default: false,
    index: true // Índice para filtros por estado de pago
  },
  pagoUnico: {
    type: Boolean,
    default: false
  },
  pagoMesSiguiente: {
    type: Boolean,
    default: false
  },
  servicios: [{
    nombre: String,
    precio: Number
  }],
  observaciones: String
}, {
  timestamps: true
});

// Índice compuesto para búsquedas comunes
ClientSchema.index({ pagado: 1, createdAt: -1 });
ClientSchema.index({ rubro: 1, pagado: 1 });

export default mongoose.models.Client || mongoose.model('Client', ClientSchema);

