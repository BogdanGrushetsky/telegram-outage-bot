/**
 * Schedule processing service
 * Handles schedule fetching, parsing, filtering, and comparison
 */

import ScheduleCache from '../models/ScheduleCache.js';
import { fetchSchedule } from '../utils/api.js';
import { hashSchedule } from '../utils/helpers.js';
import { isTodayOrFuture, getTodayString, sortScheduleByDate } from '../utils/dateUtils.js';
import { LOG_PREFIX, TIMING, VALID_QUEUES } from '../config/constants.js';

/**
 * Extract only outage data from schedule (excluding metadata)
 * This prevents false positives when metadata like scheduleApprovedSince changes
 * @param {Array} schedule - Schedule array
 * @returns {Array} Schedule with only essential outage data
 */
export function extractOutageDataOnly(schedule) {
  if (!Array.isArray(schedule)) {
    return schedule;
  }

  return schedule.map(day => {
    if (!day.eventDate || !day.queues) {
      return day;
    }

    const cleanDay = {
      eventDate: day.eventDate,
      queues: {}
    };

    for (const [queueId, periods] of Object.entries(day.queues)) {
      if (!Array.isArray(periods)) {
        cleanDay.queues[queueId] = periods;
        continue;
      }

      cleanDay.queues[queueId] = periods.map(period => ({
        from: period.from,
        to: period.to,
        shutdownHours: period.shutdownHours,
        status: period.status
      }));
    }

    return cleanDay;
  });
}

/**
 * Filter schedule to only include today and future days
 * @param {Array} schedule - Raw schedule array
 * @returns {Array} Filtered schedule
 */
export function filterFutureDays(schedule) {
  if (!Array.isArray(schedule)) {
    return schedule;
  }

  const todayStr = getTodayString();
  console.log(`${LOG_PREFIX.SCHEDULER} Filtering schedule, today is: ${todayStr}`);

  const filtered = schedule.filter(day => {
    if (!day.eventDate) {
      console.log(`${LOG_PREFIX.SCHEDULER} Day without eventDate, keeping it`);
      return true;
    }

    const isFuture = isTodayOrFuture(day.eventDate);

    if (isFuture) {
      console.log(`${LOG_PREFIX.SCHEDULER} ✓ Date ${day.eventDate}: keeping (today or future)`);
    } else {
      console.log(`${LOG_PREFIX.SCHEDULER} ✗ Date ${day.eventDate}: filtering out (past)`);
    }

    return isFuture;
  });

  console.log(`${LOG_PREFIX.SCHEDULER} Filtered ${schedule.length} days to ${filtered.length} days`);

  if (filtered.length === 0 && schedule.length > 0) {
    console.warn(`${LOG_PREFIX.SCHEDULER} ⚠️ WARNING: All days were filtered out!`);
    console.warn(`${LOG_PREFIX.SCHEDULER} Original dates:`, schedule.map(d => d.eventDate));
  }

  return filtered;
}

/**
 * Process a single queue schedule
 * @param {string} queue - Queue ID
 * @returns {Promise<Object>} Result object with queue, schedule, hash, and changed flag
 */
export async function processQueueSchedule(queue) {
  const result = {
    queue,
    schedule: null,
    hash: null,
    changed: false,
    isFirstTime: false,
    error: null,
  };

  try {
    console.log(`${LOG_PREFIX.SCHEDULER} Fetching schedule for queue ${queue}...`);
    const newSchedule = await fetchSchedule(queue);

    if (!newSchedule) {
      console.warn(`${LOG_PREFIX.SCHEDULER} ❌ Failed to fetch schedule for queue ${queue}`);
      result.error = 'Failed to fetch';
      return result;
    }

    console.log(`${LOG_PREFIX.SCHEDULER} ✅ Fetched schedule for queue ${queue}`);

    const filteredSchedule = filterFutureDays(newSchedule);

    if (Array.isArray(filteredSchedule) && filteredSchedule.length === 0) {
      console.warn(`${LOG_PREFIX.SCHEDULER} ⚠️ No future days in schedule for queue ${queue}!`);
      result.error = 'No future days';
      return result;
    }

    const outageDataOnly = extractOutageDataOnly(filteredSchedule);
    const newHash = hashSchedule(outageDataOnly);

    console.log(`${LOG_PREFIX.SCHEDULER} Computing hash from outage data only`);

    const cacheEntry = await ScheduleCache.findOne({ queue });

    // Compare hashes correctly by filtering old cache too
    if (cacheEntry && cacheEntry.rawSchedule) {
      // Filter old cached schedule with current date to avoid false positives at midnight
      const oldFilteredSchedule = filterFutureDays(cacheEntry.rawSchedule);
      const oldOutageDataOnly = extractOutageDataOnly(oldFilteredSchedule);
      const oldHash = hashSchedule(oldOutageDataOnly);

      if (oldHash === newHash) {
        console.log(`${LOG_PREFIX.SCHEDULER} ✓ No changes for queue ${queue} (hash match after filtering)`);

        // Update rawSchedule and hash with new data
        await ScheduleCache.findOneAndUpdate(
          { queue },
          { rawSchedule: newSchedule, hash: newHash, updatedAt: new Date() }
        );

        result.schedule = newSchedule;
        result.hash = newHash;
        result.changed = false;
        return result;
      }
    }

    const isFirstTime = !cacheEntry;
    const oldHash = cacheEntry ? cacheEntry.hash?.substring(0, 8) : 'none';
    const newHashShort = newHash.substring(0, 8);

    // Check if we're in midnight window (00:00 - 00:20) to avoid false positives
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isMidnightWindow = currentHour === 0 && currentMinute < 20;

    console.log(`${LOG_PREFIX.SCHEDULER} 📢 Schedule ${isFirstTime ? 'initialized' : 'CHANGED'} for queue ${queue}`);
    console.log(`${LOG_PREFIX.SCHEDULER} Hash: ${oldHash}... → ${newHashShort}...`);

    const updatedCache = await ScheduleCache.findOneAndUpdate(
      { queue },
      { queue, hash: newHash, rawSchedule: newSchedule, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`${LOG_PREFIX.SCHEDULER} Cache updated for queue ${queue}`);

    // If we're in midnight window, don't mark as changed to avoid false notifications
    if (isMidnightWindow && !isFirstTime) {
      console.log(`${LOG_PREFIX.SCHEDULER} ⏰ Midnight window detected - suppressing change notification`);
      result.schedule = newSchedule;
      result.hash = newHash;
      result.changed = false;
      result.isFirstTime = false;
    } else {
      result.schedule = newSchedule;
      result.hash = newHash;
      result.changed = !isFirstTime;
      result.isFirstTime = isFirstTime;
    }

  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error processing queue ${queue}:`, error.message);
    result.error = error.message;
  }

  return result;
}

/**
 * Process multiple queues with delay between requests
 * @param {Array} queues - Array of queue IDs
 * @returns {Promise<Array>} Array of results
 */
export async function processMultipleQueues(queues) {
  const results = [];

  for (const queue of queues) {
    const result = await processQueueSchedule(queue);
    results.push(result);

    // Delay between API requests to avoid rate limiting
    await delay(TIMING.API_REQUEST_DELAY);
  }

  return results;
}

/**
 * Get all queues that changed (excluding first-time initializations)
 * @param {Array} results - Array of process results
 * @returns {Array} Array of changed queue IDs
 */
export function getChangedQueues(results) {
  return results
    .filter(r => r.changed && !r.isFirstTime)
    .map(r => r.queue);
}

/**
 * Get cached schedule for a queue
 * @param {string} queue - Queue ID
 * @returns {Promise<Object|null>} Cached schedule or null
 */
export async function getCachedSchedule(queue) {
  try {
    const cache = await ScheduleCache.findOne({ queue });
    return cache?.rawSchedule || null;
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error fetching cached schedule for ${queue}:`, error);
    return null;
  }
}

/**
 * Extract periods for a specific queue and date from schedule
 * @param {Object|Array} schedule - Raw schedule data
 * @param {string} queue - Queue ID
 * @param {string} targetDate - Target date string
 * @returns {Array} Array of periods
 */
export function extractPeriodsForQueueAndDate(schedule, queue, targetDate) {
  const periods = [];

  if (Array.isArray(schedule)) {
    for (const daySchedule of schedule) {
      if (daySchedule?.eventDate === targetDate && daySchedule.queues?.[queue]) {
        const dayPeriods = daySchedule.queues[queue];
        if (Array.isArray(dayPeriods)) {
          dayPeriods.forEach(period => {
            periods.push({
              ...period,
              eventDate: targetDate,
            });
          });
        }
      }
    }
  } else if (schedule?.data) {
    // Old format support
    periods.push(...schedule.data.map(p => ({ ...p, eventDate: targetDate })));
  }

  return periods;
}

/**
 * Extract start time from period
 * @param {Object} period - Period object
 * @returns {string|null} Start time or null
 */
export function extractStartTime(period) {
  if (period.from) {
    return period.from;
  }

  if (period.shutdownHours) {
    const match = period.shutdownHours.match(/^(\d{2}:\d{2})/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract end time from period
 * @param {Object} period - Period object
 * @returns {string|null} End time or null
 */
export function extractEndTime(period) {
  if (period.to) {
    return period.to;
  }

  if (period.shutdownHours) {
    const match = period.shutdownHours.match(/-(\d{2}:\d{2})$/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Delay utility
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get all valid queues
 * @returns {Array} Array of all valid queue IDs
 */
export function getAllQueues() {
  return [...VALID_QUEUES];
}

export default {
  extractOutageDataOnly,
  filterFutureDays,
  processQueueSchedule,
  processMultipleQueues,
  getChangedQueues,
  getCachedSchedule,
  extractPeriodsForQueueAndDate,
  extractStartTime,
  extractEndTime,
  getAllQueues,
};
