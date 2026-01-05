import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  clienteNombre: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  clienteEmail: {
    type: String,
    trim: true
  },
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  periodo: {
    from: {
      type: Date,
      required: true,
      index: true
    },
    to: {
      type: Date,
      required: true,
      index: true
    }
  },
  moneda: {
    type: String,
    enum: ['ARS', 'USD', 'EUR'],
    default: 'ARS'
  },
  porcentajeImpuestos: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  estado: {
    type: String,
    enum: ['borrador', 'publicado'],
    default: 'borrador',
    index: true
  },
  createdBy: {
    type: String,
    required: true,
    index: true
  },
  sections: [{
    platform: {
      type: String,
      enum: ['meta', 'google', 'otro'],
      required: true
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    items: [{
      campaignName: {
        type: String,
        required: true,
        trim: true
      },
      objective: {
        type: String,
        trim: true
      },
      template: {
        type: String,
        enum: ['meta_conversaciones', 'google_search', 'custom'],
        default: 'custom'
      },
      metrics: {
        type: Map,
        of: Number,
        default: {}
      },
      notes: {
        type: String,
        trim: true
      }
    }]
  }],
  reportNotes: {
    observaciones: {
      type: String,
      trim: true
    },
    recomendaciones: {
      type: String,
      trim: true
    }
  },
  share: {
    enabled: {
      type: Boolean,
      default: false
    },
    token: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    expiresAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Índices compuestos para búsquedas comunes
ReportSchema.index({ estado: 1, createdAt: -1 });
ReportSchema.index({ clienteNombre: 1, createdAt: -1 });
ReportSchema.index({ 'periodo.from': 1, 'periodo.to': 1 });
ReportSchema.index({ 'share.token': 1, 'share.enabled': 1 });

// Limpiar el modelo si existe para evitar hooks cacheados
if (mongoose.models.Report) {
  delete mongoose.models.Report;
}

export default mongoose.model('Report', ReportSchema);

