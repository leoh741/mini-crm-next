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
    index: true // Índice para filtros por estado de pago (mantenido para compatibilidad)
  },
  // Nuevo: estados de pago por servicio (índice del servicio -> estado pagado)
  serviciosPagados: {
    type: Map,
    of: Boolean,
    default: {}
  },
  fechaActualizacion: {
    type: Date,
    index: true // Índice para ordenamiento por fecha
  }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas rápidas (CRÍTICO para performance)
MonthlyPaymentSchema.index({ mes: 1, crmClientId: 1 }, { unique: true });
// Índice compuesto para queries comunes
MonthlyPaymentSchema.index({ mes: 1, pagado: 1 });
MonthlyPaymentSchema.index({ crmClientId: 1, mes: 1, pagado: 1 });

export default mongoose.models.MonthlyPayment || mongoose.model('MonthlyPayment', MonthlyPaymentSchema);

