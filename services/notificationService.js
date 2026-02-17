/**
 * Notification service for sending messages to users
 */

import User from '../models/User.js';
import { LOG_PREFIX, TIMING } from '../config/constants.js';

/**
 * Send notification to a single user with error handling
 * @param {Object} bot - Telegram bot instance
 * @param {number} telegramId - User's Telegram ID
 * @param {string} message - Message to send
 * @param {Object} [options={}] - Additional options for sendMessage
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendNotification(bot, telegramId, message, options = {}) {
  try {
    await bot.sendMessage(telegramId, message, options);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX.NOTIFICATION} Failed to send message to ${telegramId}:`, error.message);
    return false;
  }
}

/**
 * Send notifications to multiple users with rate limiting
 * @param {Object} bot - Telegram bot instance
 * @param {Array} notifications - Array of {telegramId, message, options} objects
 * @returns {Promise<Object>} Result with sent and failed counts
 */
export async function sendBatchNotifications(bot, notifications) {
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    const success = await sendNotification(
      bot,
      notification.telegramId,
      notification.message,
      notification.options || {}
    );

    if (success) {
      sent++;
    } else {
      failed++;
    }

    // Rate limiting - delay between messages
    await delay(TIMING.NOTIFICATION_DELAY);
  }

  return { sent, failed };
}

/**
 * Mark event as notified for a user
 * @param {Object} user - User document
 * @param {string} eventId - Event ID to mark as notified
 * @returns {Promise<Object>} Updated user document
 */
export async function markEventAsNotified(user, eventId) {
  if (!user.notifiedEvents.includes(eventId)) {
    user.notifiedEvents.push(eventId);
    await user.save();
  }
  return user;
}

/**
 * Check if user was already notified about an event
 * @param {Object} user - User document
 * @param {string} eventId - Event ID to check
 * @returns {boolean} True if already notified
 */
export function isEventNotified(user, eventId) {
  return user.notifiedEvents.includes(eventId);
}

/**
 * Clean old notified events from all users
 * @param {number} hoursToKeep - How many hours of events to keep
 * @returns {Promise<number>} Number of users cleaned
 */
export async function cleanOldNotifications(hoursToKeep = 48) {
  try {
    const cutoffDate = new Date(Date.now() - hoursToKeep * 60 * 60 * 1000);

    const result = await User.updateMany(
      { updatedAt: { $lt: cutoffDate } },
      { $set: { notifiedEvents: [] } }
    );

    console.log(`${LOG_PREFIX.NOTIFICATION} Cleaned old notifications for ${result.modifiedCount} users`);
    return result.modifiedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX.NOTIFICATION} Error cleaning old notifications:`, error);
    return 0;
  }
}

/**
 * Clean notified events older than specified hours from ALL users
 * This is more aggressive and runs on startup to ensure clean state
 * @param {number} hoursToKeep - How many hours of events to keep (default: 24)
 * @returns {Promise<number>} Number of users updated
 */
export async function cleanOldNotifiedEvents(hoursToKeep = 24) {
  try {
    console.log(`${LOG_PREFIX.NOTIFICATION} Cleaning notified events older than ${hoursToKeep} hours...`);
    
    // Parse event IDs to extract timestamps and filter old ones
    const users = await User.find({ notifiedEvents: { $exists: true, $ne: [] } });
    let updatedCount = 0;

    for (const user of users) {
      const originalCount = user.notifiedEvents.length;
      
      // Filter out events that are clearly old based on date in event ID
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - hoursToKeep * 60 * 60 * 1000);
      
      user.notifiedEvents = user.notifiedEvents.filter(eventId => {
        // Try to extract date from event ID (format: queue_time_date or power_return_queue_time_date)
        const dateMatch = eventId.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const eventDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return eventDate >= cutoffDate;
        }
        // Keep events without date (shouldn't happen but safe default)
        return true;
      });

      if (user.notifiedEvents.length !== originalCount) {
        await user.save();
        updatedCount++;
        console.log(`${LOG_PREFIX.NOTIFICATION} Cleaned ${originalCount - user.notifiedEvents.length} old events for user ${user.telegramId}`);
      }
    }

    console.log(`${LOG_PREFIX.NOTIFICATION} ✅ Cleaned notified events for ${updatedCount} users`);
    return updatedCount;
  } catch (error) {
    console.error(`${LOG_PREFIX.NOTIFICATION} Error cleaning old notified events:`, error);
    return 0;
  }
}

/**
 * Get users with notifications enabled
 * @param {Object} [filter={}] - Additional filter criteria
 * @returns {Promise<Array>} Array of user documents
 */
export async function getNotificationEnabledUsers(filter = {}) {
  try {
    const users = await User.find({
      notificationsEnabled: true,
      ...filter,
    });
    return users;
  } catch (error) {
    console.error(`${LOG_PREFIX.NOTIFICATION} Error fetching users:`, error);
    return [];
  }
}

/**
 * Filter users by queues
 * @param {Array} users - Array of user documents
 * @param {Array} queues - Array of queue IDs to filter by
 * @returns {Array} Filtered users who are subscribed to any of the queues
 */
export function filterUsersByQueues(users, queues) {
  return users.filter(user => {
    const userQueues = user.queues || [];
    return userQueues.some(q => queues.includes(q));
  });
}

/**
 * Get user's subscribed queues from a list of changed queues
 * @param {Object} user - User document
 * @param {Array} changedQueues - Array of changed queue IDs
 * @returns {Array} User's queues that are in changedQueues
 */
export function getUserChangedQueues(user, changedQueues) {
  return user.queues.filter(q => changedQueues.includes(q));
}

/**
 * Delay utility for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create notification message for schedule update
 * @param {string} scheduleText - Formatted schedule text
 * @returns {string} Notification message
 */
export function createScheduleUpdateMessage(scheduleText) {
  return `📢 <b>Оновлення графіку відключень</b>\n\n${scheduleText}`;
}

/**
 * Create notification message for upcoming outage
 * @param {string} queue - Queue ID
 * @param {string} startTime - Start time
 * @param {number} minutesBefore - Minutes before outage
 * @param {string} [dateInfo=''] - Optional date information
 * @returns {string} Notification message
 */
export function createUpcomingOutageMessage(queue, startTime, minutesBefore, dateInfo = '') {
  const dateLine = dateInfo ? `\n📅 Дата: <code>${dateInfo}</code>` : '';
  return `⏰ <b>Увага! Відключення світла</b>\n━━━━━━━━━━━━━━━━\n\n⚡️ Черга: <b>${queue}</b>${dateLine}\n🕐 Початок: <code>${startTime}</code>\n⏳ Залишилось: <b>${minutesBefore} хв</b>`;
}

/**
 * Create notification message for power return
 * @param {string} queue - Queue ID
 * @param {string} endTime - End time
 * @param {string} [dateInfo=''] - Optional date information
 * @returns {string} Notification message
 */
export function createPowerReturnMessage(queue, endTime, dateInfo = '') {
  const dateLine = dateInfo ? `\n📅 Дата: <code>${dateInfo}</code>` : '';
  return `✅ <b>Світло повернулось!</b>\n━━━━━━━━━━━━━━━━\n\n⚡️ Черга: <b>${queue}</b>${dateLine}\n🕐 Час: <code>${endTime}</code>\n💡 <i>Відключення завершено</i>`;
}

export default {
  sendNotification,
  sendBatchNotifications,
  markEventAsNotified,
  isEventNotified,
  cleanOldNotifications,
  cleanOldNotifiedEvents,
  getNotificationEnabledUsers,
  filterUsersByQueues,
  getUserChangedQueues,
  createScheduleUpdateMessage,
  createUpcomingOutageMessage,
  createPowerReturnMessage,
};
