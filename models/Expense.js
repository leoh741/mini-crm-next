import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  periodo: {
    type: String,
    required: true,
    index: true
  },
  crmId: {
    type: String,
    required: true
  },
  descripcion: {
    type: String,
    required: true
  },
  monto: {
    type: Number,
    required: true
  },
  fecha: Date,
  categoria: String,
  fechaCreacion: Date
}, {
  timestamps: true
});

export default mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

