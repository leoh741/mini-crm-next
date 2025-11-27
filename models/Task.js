import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema({
  tareaId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  titulo: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  descripcion: {
    type: String,
    trim: true
  },
  fechaVencimiento: {
    type: Date,
    index: true
  },
  prioridad: {
    type: String,
    enum: ['baja', 'media', 'alta', 'urgente'],
    default: 'media',
    index: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'en_progreso', 'completada', 'cancelada'],
    default: 'pendiente',
    index: true
  },
  cliente: {
    nombre: String,
    crmId: String
  },
  etiquetas: [{
    type: String,
    trim: true
  }],
  asignados: [{
    type: String,
    trim: true
  }],
  completada: {
    type: Boolean,
    default: false,
    index: true
  },
  fechaCompletada: {
    type: Date
  }
}, {
  timestamps: true
});

TaskSchema.index({ estado: 1, fechaVencimiento: 1 });
TaskSchema.index({ prioridad: 1, fechaVencimiento: 1 });
TaskSchema.index({ completada: 1, createdAt: -1 });

// Los IDs se generan en el código antes de crear la instancia
// Se eliminaron los hooks pre() para evitar conflictos con Mongoose 9
// La lógica de actualización de completada se maneja en el código de la API

// Limpiar el modelo si existe para evitar hooks cacheados
if (mongoose.models.Task) {
  delete mongoose.models.Task;
}

export default mongoose.model('Task', TaskSchema);

