import mongoose from 'mongoose';

const BudgetSchema = new mongoose.Schema({
  presupuestoId: {
    type: String,
    required: true,
    unique: true,
    index: true // Índice para búsquedas rápidas por presupuestoId
  },
  numero: {
    type: Number,
    required: true,
    index: true // Índice para búsquedas por número de presupuesto
  },
  cliente: {
    nombre: {
      type: String,
      required: true,
      index: true
    },
    rubro: String,
    ciudad: String,
    email: String,
    telefono: String
  },
  fecha: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  validez: {
    type: Number,
    default: 30 // Días de validez del presupuesto
  },
  items: [{
    descripcion: {
      type: String,
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      default: 1
    },
    precioUnitario: {
      type: Number,
      required: true
    },
    subtotal: {
      type: Number,
      required: true
    }
  }],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  descuento: {
    type: Number,
    default: 0
  },
  porcentajeDescuento: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    default: 0
  },
  estado: {
    type: String,
    enum: ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'],
    default: 'borrador',
    index: true
  },
  observaciones: String,
  notasInternas: String
}, {
  timestamps: true
});

// Índice compuesto para búsquedas comunes
BudgetSchema.index({ estado: 1, createdAt: -1 });
BudgetSchema.index({ 'cliente.nombre': 1, estado: 1 });
BudgetSchema.index({ fecha: -1, estado: 1 });

export default mongoose.models.Budget || mongoose.model('Budget', BudgetSchema);

