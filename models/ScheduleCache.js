import mongoose from 'mongoose';
import { VALID_QUEUES } from '../config/constants.js';

/**
 * ScheduleCache Schema
 * Stores cached electricity outage schedules for each queue
 */
const scheduleCacheSchema = new mongoose.Schema(
  {
    queue: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: VALID_QUEUES,
      description: 'Electricity queue identifier',
    },
    hash: {
      type: String,
      default: null,
      description: 'Hash of schedule data for change detection',
    },
    rawSchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      description: 'Raw schedule data from API',
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
