/**
 * Application-wide constants and configuration
 */

// Timing constants
export const TIMING = {
  INITIAL_STARTUP_DELAY: 5000, // 5 seconds
  API_REQUEST_DELAY: 500, // 500ms between API requests
  NOTIFICATION_DELAY: 100, // 100ms between notifications
  POWER_RETURN_CHECK_WINDOW: 2, // 2 minutes window for power return
  NOTIFICATION_RETENTION_HOURS: 48, // Keep notifications for 48 hours
  MIDNIGHT_HOUR: 0, // Midnight transition hour
  EARLY_MORNING_CUTOFF: 1, // 1 AM cutoff for midnight transitions
};

// Notification timers (in minutes)
export const DEFAULT_TIMERS = [5, 10, 15, 30];
export const AVAILABLE_TIMERS = [5, 10, 15, 30];

// Valid electricity queues
export const VALID_QUEUES = [
  '1.1', '1.2', 
  '2.1', '2.2', 
  '3.1', '3.2', 
  '4.1', '4.2', 
  '5.1', '5.2', 
  '6.1', '6.2'
];

// Batch processing
export const BATCH_SIZE = {
  USERS: 50, // Process users in batches of 50
  QUEUES: 3, // Process queues in batches of 3
};

// Event types
export const EVENT_TYPES = {
  OUTAGE_START: 'outage_start',
  POWER_RETURN: 'power_return',
};

// Log prefixes
export const LOG_PREFIX = {
  SCHEDULER: '[Scheduler]',
  NOTIFICATION: '[Notification]',
  API: '[API]',
  DATABASE: '[Database]',
  BOT: '[Bot]',
};

// Outage status
export const OUTAGE_STATUS = {
  SCHEDULED: 1,
  NO_OUTAGE: 0,
};

export default {
  TIMING,
  DEFAULT_TIMERS,
  AVAILABLE_TIMERS,
  VALID_QUEUES,
  BATCH_SIZE,
  EVENT_TYPES,
  LOG_PREFIX,
  OUTAGE_STATUS,
};
