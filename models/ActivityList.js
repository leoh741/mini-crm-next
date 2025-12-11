import mongoose from 'mongoose';

const ActivityListSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#22c55e'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

ActivityListSchema.index({ owner: 1, isArchived: 1 });
ActivityListSchema.index({ members: 1, isArchived: 1 });

export default mongoose.models.ActivityList || mongoose.model('ActivityList', ActivityListSchema);
