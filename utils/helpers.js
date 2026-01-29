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
 * @param {string} startTime - Start time of the outage
 * @returns {string} Unique event ID
 */
export function generateEventId(queue, startTime) {
  return `${queue}_${startTime}`;
}

/**
 * Format schedule data for user display
 * @param {Object|Array} rawSchedule - The raw schedule data from API (array format)
 * @param {string} queue - Queue identifier
 * @returns {string} Formatted schedule text
 */
export function formatScheduleText(rawSchedule, queue) {
  // Handle new API format (array with queues object)
  if (Array.isArray(rawSchedule) && rawSchedule.length > 0) {
    const today = rawSchedule[0];
    
    if (!today || !today.queues || !today.queues[queue]) {
      return `⚡ Черга ${queue}: Немає доступних даних`;
    }

    const scheduleForQueue = today.queues[queue];
    
    // Check if there are any outages
    if (!Array.isArray(scheduleForQueue) || scheduleForQueue.length === 0) {
      return `⚡ Черга ${queue}: Відключення не заплановані\n📅 Дата: ${today.eventDate || 'Сьогодні'}`;
    }

    // Format outages
    let text = `⚡ Черга ${queue}:\n`;
    text += `📅 Дата: ${today.eventDate || 'Сьогодні'}\n`;
    
    scheduleForQueue.forEach((outage, index) => {
      const status = outage.status === 1 ? '🔴' : '🟢';
      text += `${status} ${outage.shutdownHours || `${outage.from}-${outage.to}`}\n`;
    });

    if (today.scheduleApprovedSince) {
      text += `\n✅ Графік затверджено: ${today.scheduleApprovedSince}`;
    }

    return text;
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

/**
 * Validate queue identifier
 * @param {string} queue - Queue to validate
 * @returns {boolean} True if queue is valid
 */
export function isValidQueue(queue) {
  const validQueues = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
  return validQueues.includes(queue);
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
  return ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
}