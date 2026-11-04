import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivityList',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pendiente', 'en_proceso', 'completada'],
    default: 'pendiente',
    index: true
  },
  priority: {
    type: String,
    enum: ['baja', 'media', 'alta'],
    default: 'media',
    index: true
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  labels: [{
    type: String,
    trim: true
  }],
  dueDate: {
    type: Date,
    index: true
  },
  order: {
    type: Number,
    default: 0,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Cronómetro del pedido
  startedAt: {
    type: Date,
    index: true
  },
  completedAt: {
    type: Date,
    index: true
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  durationMs: {
    type: Number,
    min: 0
  },
  // Tiempo acumulado al pausar (para reanudar el cronómetro sin volver a 0)
  elapsedMs: {
    type: Number,
    min: 0,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true,
  strictPopulate: false
});

ActivitySchema.index({ list: 1, order: 1, createdAt: -1 });
ActivitySchema.index({ list: 1, status: 1 });
ActivitySchema.index({ assignee: 1, status: 1 });
ActivitySchema.index({ list: 1, completedAt: -1 });

// Hot-reload: asegurar campos del cronómetro en el modelo cacheado
if (mongoose.models.Activity) {
  const cachedSchema = mongoose.models.Activity.schema;
  cachedSchema.add({
    startedAt: { type: Date, index: true },
    completedAt: { type: Date, index: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    durationMs: { type: Number, min: 0 },
    elapsedMs: { type: Number, min: 0, default: 0 }
  });
  cachedSchema.set('strictPopulate', false);
}

export default mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);
