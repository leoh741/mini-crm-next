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
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

ActivitySchema.index({ list: 1, order: 1, createdAt: -1 });
ActivitySchema.index({ list: 1, status: 1 });
ActivitySchema.index({ assignee: 1, status: 1 });

export default mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);
