import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  periodo: {
    type: String,
    required: true,
    index: true
  },
  crmId: {
    type: String,
    required: true,
    index: true // Índice para búsquedas por crmId
  },
  descripcion: {
    type: String,
    required: true
  },
  monto: {
    type: Number,
    required: true
  },
  fecha: {
    type: Date,
    index: true // Índice para ordenamiento por fecha
  },
  categoria: {
    type: String,
    index: true // Índice para filtros por categoría
  },
  fechaCreacion: Date
}, {
  timestamps: true
});

// Índice compuesto para queries comunes (por período y fecha)
ExpenseSchema.index({ periodo: 1, fecha: -1 });
// Índice compuesto para queries por período y categoría
ExpenseSchema.index({ periodo: 1, categoria: 1 });

export default mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

