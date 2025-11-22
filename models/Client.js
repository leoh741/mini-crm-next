import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema({
  crmId: {
    type: String,
    required: true,
    unique: true
  },
  nombre: {
    type: String,
    required: true
  },
  rubro: String,
  ciudad: String,
  email: String,
  montoPago: Number,
  fechaPago: Number,
  pagado: {
    type: Boolean,
    default: false
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

export default mongoose.models.Client || mongoose.model('Client', ClientSchema);

