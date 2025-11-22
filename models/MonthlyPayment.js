import mongoose from 'mongoose';

const MonthlyPaymentSchema = new mongoose.Schema({
  mes: {
    type: String,
    required: true,
    index: true
  },
  crmClientId: {
    type: String,
    required: true,
    index: true
  },
  pagado: {
    type: Boolean,
    default: false
  },
  fechaActualizacion: Date
}, {
  timestamps: true
});

// Índice compuesto para búsquedas rápidas
MonthlyPaymentSchema.index({ mes: 1, crmClientId: 1 }, { unique: true });

export default mongoose.models.MonthlyPayment || mongoose.model('MonthlyPayment', MonthlyPaymentSchema);

