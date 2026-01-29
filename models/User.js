import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      default: null,
    },
    queues: {
      type: [String],
      default: [],
      enum: ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'],
    },
    timers: {
      type: [Number],
      default: [5, 10, 15, 30],
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    notifiedEvents: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', userSchema);
