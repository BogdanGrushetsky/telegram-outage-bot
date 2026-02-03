import axios from 'axios';
import { LOG_PREFIX } from '../config/constants.js';

const API_BASE_URL = 'https://be-svitlo.oe.if.ua';
const API_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch schedule from the official API
 * @param {string} queue - Queue identifier (e.g., "5.2")
 * @returns {Promise<Object|null>} Schedule data or null if request fails
 */
export async function fetchSchedule(queue) {
  try {
    console.log(`${LOG_PREFIX.API} Fetching schedule from ${API_BASE_URL}/schedule-by-queue?queue=${queue}`);
    const startTime = Date.now();

    const response = await axios.get(`${API_BASE_URL}/schedule-by-queue`, {
      params: { queue },
      timeout: API_TIMEOUT,
      headers: {
        'User-Agent': 'Ukraine-Power-Outage-Bot/1.0',
      },
    });

    const duration = Date.now() - startTime;
    console.log(`${LOG_PREFIX.API} ✅ Response received for queue ${queue} (${duration}ms), status: ${response.status}`);

    if (response.status === 200 && response.data) {
      return response.data;
    }

    console.warn(`${LOG_PREFIX.API} ⚠️ Invalid response for queue ${queue}: status ${response.status}`);
    return null;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      console.error(`${LOG_PREFIX.API} ❌ Server error for queue ${queue}: ${error.response.status}`);
    } else if (error.request) {
      // No response received
      console.error(`${LOG_PREFIX.API} ❌ No response from server for queue ${queue}`);
    } else {
      // Request setup error
      console.error(`${LOG_PREFIX.API} ❌ Request error for queue ${queue}:`, error.message);
    }
    return null;
  }
}

/**
 * Fetch schedules for multiple queues
 * @param {string[]} queues - Array of queue identifiers
 * @returns {Promise<Object>} Object with queue as key and schedule as value
 */
export async function fetchMultipleSchedules(queues) {
  const results = {};

  console.log(`${LOG_PREFIX.API} Fetching schedules for ${queues.length} queues:`, queues);

  // Fetch in parallel
  const promises = queues.map((queue) =>
    fetchSchedule(queue).then((schedule) => {
      results[queue] = schedule;
      console.log(`${LOG_PREFIX.API} Result for ${queue}:`, schedule ? 'success' : 'failed');
    })
  );

  await Promise.all(promises);

  console.log(`${LOG_PREFIX.API} All fetches completed`);
  return results;
}

/**
 * Parse schedule data and extract outage periods
 * @param {Object} schedule - Raw schedule data from API
 * @returns {Object} Parsed schedule with formatted periods
 */
export function parseSchedule(schedule) {
  if (!schedule || !schedule.data) {
    return { data: [] };
  }

  return {
    data: schedule.data.map((period) => ({
      from: period.from || null,
      to: period.to || null,
      note: period.note || null,
    })),
  };
}
