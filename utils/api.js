import axios from 'axios';

const API_BASE_URL = 'https://be-svitlo.oe.if.ua';

/**
 * Fetch schedule from the official API
 * @param {string} queue - Queue identifier (e.g., "5.2")
 * @returns {Promise<Object>} Schedule data or null if request fails
 */
export async function fetchSchedule(queue) {
  try {
    console.log(`[API] Fetching schedule from ${API_BASE_URL}/schedule-by-queue?queue=${queue}`);
    const startTime = Date.now();
    
    const response = await axios.get(`${API_BASE_URL}/schedule-by-queue`, {
      params: { queue },
      timeout: 10000,
    });

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Response received for queue ${queue} (${duration}ms), status: ${response.status}`);
    console.log(`[API] Response data:`, JSON.stringify(response.data).substring(0, 200));

    if (response.status === 200 && response.data) {
      return response.data;
    }

    console.warn(`[API] ⚠️ Invalid response for queue ${queue}: status ${response.status}`);
    return null;
  } catch (error) {
    console.error(`[API] ❌ Error fetching schedule for queue ${queue}:`, error.message);
    console.error(`[API] Error code:`, error.code);
    console.error(`[API] Full error:`, error);
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

  console.log(`[API] Fetching schedules for ${queues.length} queues:`, queues);

  // Fetch in parallel with a small delay to avoid hammering the API
  const promises = queues.map((queue) =>
    fetchSchedule(queue).then((schedule) => {
      results[queue] = schedule;
      console.log(`[API] Queued result for ${queue}:`, schedule ? 'success' : 'failed');
    })
  );

  await Promise.all(promises);

  console.log(`[API] All fetches completed, results:`, Object.keys(results));
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
