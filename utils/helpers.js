import crypto from 'crypto';

/**
 * Generate a hash from the schedule data for comparison
 * @param {Object} schedule - The schedule object to hash
 * @returns {string} SHA256 hash of the schedule
 */
export function hashSchedule(schedule) {
  const json = JSON.stringify(schedule);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Check if power is currently off for a given queue
 * @param {Object} schedule - The schedule object
 * @returns {boolean} True if power is currently off
 */
export function isPowerOffNow(schedule) {
  if (!schedule || !schedule.data) {
    return false;
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // Check if current time falls within any blackout period
  for (const period of schedule.data) {
    if (!period.from || !period.to) {
      continue;
    }

    const [fromHour, fromMin] = period.from.split(':').map(Number);
    const [toHour, toMin] = period.to.split(':').map(Number);

    const fromTime = fromHour * 60 + fromMin;
    const toTime = toHour * 60 + toMin;

    if (toTime < fromTime) {
      // Period spans midnight
      if (currentTime >= fromTime || currentTime < toTime) {
        return true;
      }
    } else if (currentTime >= fromTime && currentTime < toTime) {
      return true;
    }
  }

  return false;
}

/**
 * Generate event ID for tracking notifications
 * @param {string} queue - Queue identifier
 * @param {string} time - Start or end time of the outage
 * @param {string} date - Optional date (e.g., "29.01.2026")
 * @returns {string} Unique event ID
 */
export function generateEventId(queue, time, date = '') {
  if (date) {
    return `${queue}_${time}_${date}`;
  }
  return `${queue}_${time}`;
}

/**
 * Format schedule data for user display (supports multi-day schedules)
 * @param {Object|Array} rawSchedule - The raw schedule data from API (array format)
 * @param {string} queue - Queue identifier
 * @returns {string} Formatted schedule text
 */
export function formatScheduleText(rawSchedule, queue) {
  // Handle new API format (array with queues object) - MULTI-DAY SUPPORT
  if (Array.isArray(rawSchedule) && rawSchedule.length > 0) {
    let fullText = `⚡ Черга ${queue}:\n\n`;

    // Sort schedule by date
    const sortedSchedule = sortScheduleByDate(rawSchedule);

    for (const daySchedule of sortedSchedule) {
      if (!daySchedule || !daySchedule.queues || !daySchedule.queues[queue]) {
        continue;
      }

      const scheduleForQueue = daySchedule.queues[queue];
      const eventDate = daySchedule.eventDate || 'Сьогодні';

      fullText += `📅 ${eventDate}\n`;

      // Check if there are any outages for this day
      if (!Array.isArray(scheduleForQueue) || scheduleForQueue.length === 0) {
        fullText += `🟢 Відключення не заплановані\n`;
      } else {
        // Format outages
        scheduleForQueue.forEach((outage) => {
          const status = outage.status === OUTAGE_STATUS.SCHEDULED ? '🔴' : '🟢';
          const time = outage.shutdownHours || `${outage.from}-${outage.to}`;
          fullText += `${status} ${time}\n`;
        });
      }

      if (daySchedule.scheduleApprovedSince) {
        fullText += `✅ Затверджено: ${daySchedule.scheduleApprovedSince}\n`;
      }

      fullText += '\n';
    }

    return fullText.trim();
  }

  // Handle old format (for backward compatibility)
  if (rawSchedule && rawSchedule.data && Array.isArray(rawSchedule.data)) {
    if (rawSchedule.data.length === 0) {
      return `⚡ Черга ${queue}: Відключення не заплановані`;
    }

    let text = `⚡ Черга ${queue}:\n\n`;

    for (const period of rawSchedule.data) {
      if (period.from && period.to) {
        text += `🔴 ${period.from} - ${period.to}\n`;
      }
    }

    return text;
  }

  return `⚡ Черга ${queue}: Немає доступних даних`;
}

import { VALID_QUEUES, OUTAGE_STATUS } from '../config/constants.js';
import { sortScheduleByDate } from './dateUtils.js';

/**
 * Validate queue identifier
 * @param {string} queue - Queue to validate
 * @returns {boolean} True if queue is valid
 */
export function isValidQueue(queue) {
  return VALID_QUEUES.includes(queue);
}

/**
 * Filter valid queues from an array
 * @param {string[]} queues - Array of queue identifiers
 * @returns {string[]} Array of valid queues
 */
export function filterValidQueues(queues) {
  return queues.filter(isValidQueue);
}

/**
 * Get all valid queues
 * @returns {string[]} Array of all valid queue identifiers
 */
export function getAllValidQueues() {
  return [...VALID_QUEUES];
}