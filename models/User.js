import mongoose from 'mongoose';
import { VALID_QUEUES, DEFAULT_TIMERS } from '../config/constants.js';

/**
 * User Schema
 * Stores user preferences and notification settings
 */
const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
      description: 'Telegram user ID',
    },
    username: {
      type: String,
      default: null,
      description: 'Telegram username',
    },
    queues: {
      type: [String],
      default: [],
      enum: VALID_QUEUES,
      description: 'Subscribed electricity queues',
    },
    timers: {
      type: [Number],
      default: DEFAULT_TIMERS,
      description: 'Notification timers in minutes',
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
      index: true,
      description: 'Whether notifications are enabled',
    },
    notifiedEvents: {
      type: [String],
      default: [],
      description: 'List of event IDs user has been notified about',
    },
  },
  {
    timestamps: true,
  }
);

// Add compound index for efficient queries
userSchema.index({ notificationsEnabled: 1, queues: 1 });

export default mongoose.model('User', userSchema);
