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
    default: false,
    index: true
  },
  serviciosPagados: {
    type: Map,
    of: Boolean,
    default: {}
  },
  // Snapshot del monto cobrado en este mes (congela ingresos aunque se borre/edite el cliente)
  montoPagado: {
    type: Number,
    default: 0,
    min: 0
  },
  clienteNombre: {
    type: String,
    trim: true
  },
  fechaActualizacion: {
    type: Date,
    index: true
  }
}, {
  timestamps: true
});

MonthlyPaymentSchema.index({ mes: 1, crmClientId: 1 }, { unique: true });
MonthlyPaymentSchema.index({ mes: 1, pagado: 1 });
MonthlyPaymentSchema.index({ crmClientId: 1, mes: 1, pagado: 1 });

export default mongoose.models.MonthlyPayment || mongoose.model('MonthlyPayment', MonthlyPaymentSchema);
