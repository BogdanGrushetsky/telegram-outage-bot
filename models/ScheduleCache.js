import mongoose from 'mongoose';

const scheduleCacheSchema = new mongoose.Schema(
  {
    queue: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'],
    },
    hash: {
      type: String,
      default: null,
    },
    rawSchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: false,
      updatedAt: 'updatedAt',
    },
  }
);

export default mongoose.model('ScheduleCache', scheduleCacheSchema);
