/**
 * Schedule comparison utilities
 * For detecting and displaying changes in schedules
 */

import { parseTimeToMinutes } from './dateUtils.js';
import { OUTAGE_STATUS } from '../config/constants.js';

/**
 * Calculate duration in minutes between two times
 * @param {string} startTime - Start time "HH:MM"
 * @param {string} endTime - End time "HH:MM"
 * @returns {number} Duration in minutes
 */
export function calculateDuration(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  
  if (start === null || end === null) {
    return 0;
  }

  // Handle midnight crossing
  if (end < start) {
    return (24 * 60 - start) + end;
  }

  return end - start;
}

/**
 * Format duration in human-readable format
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration "Xгод Yхв" or "Xхв"
 */
export function formatDuration(minutes) {
  if (minutes === 0) return '';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}хв`;
  } else if (mins === 0) {
    return `${hours} год`;
  } else {
    return `${hours} год ${mins} хв`;
  }
}

/**
 * Compare two schedules and find differences
 * @param {Array} oldSchedule - Old schedule array (filtered)
 * @param {Array} newSchedule - New schedule array (filtered)
 * @param {string} queue - Queue ID
 * @returns {Object} Object with added and removed periods by date
 */
export function compareSchedules(oldSchedule, newSchedule, queue) {
  const changes = {};

  // Create maps for easier comparison
  const oldPeriodsByDate = groupPeriodsByDate(oldSchedule, queue);
  const newPeriodsByDate = groupPeriodsByDate(newSchedule, queue);

  // Get all dates
  const allDates = new Set([
    ...Object.keys(oldPeriodsByDate),
    ...Object.keys(newPeriodsByDate)
  ]);

  for (const date of allDates) {
    const oldPeriods = oldPeriodsByDate[date] || [];
    const newPeriods = newPeriodsByDate[date] || [];

    const added = [];
    const removed = [];

    // Find removed periods
    for (const oldPeriod of oldPeriods) {
      const found = newPeriods.some(p => periodsEqual(p, oldPeriod));
      if (!found) {
        removed.push(oldPeriod);
      }
    }

    // Find added periods
    for (const newPeriod of newPeriods) {
      const found = oldPeriods.some(p => periodsEqual(p, newPeriod));
      if (!found) {
        added.push(newPeriod);
      }
    }

    if (added.length > 0 || removed.length > 0) {
      changes[date] = { added, removed };
    }
  }

  return changes;
}

/**
 * Group periods by date
 * @param {Array} schedule - Schedule array
 * @param {string} queue - Queue ID
 * @returns {Object} Periods grouped by date
 */
function groupPeriodsByDate(schedule, queue) {
  const grouped = {};

  if (!Array.isArray(schedule)) {
    return grouped;
  }

  for (const daySchedule of schedule) {
    if (!daySchedule?.eventDate || !daySchedule.queues?.[queue]) {
      continue;
    }

    const date = daySchedule.eventDate;
    const periods = daySchedule.queues[queue];

    if (Array.isArray(periods)) {
      grouped[date] = periods;
    }
  }

  return grouped;
}

/**
 * Check if two periods are equal
 * @param {Object} p1 - First period
 * @param {Object} p2 - Second period
 * @returns {boolean} True if equal
 */
function periodsEqual(p1, p2) {
  const time1 = p1.shutdownHours || `${p1.from}-${p1.to}`;
  const time2 = p2.shutdownHours || `${p2.from}-${p2.to}`;
  return time1 === time2 && p1.status === p2.status;
}

/**
 * Format schedule with changes highlighted
 * @param {Array} schedule - Schedule array
 * @param {string} queue - Queue ID
 * @param {Object} changes - Changes object from compareSchedules
 * @returns {string} Formatted schedule text with changes
 */
export function formatScheduleWithChanges(schedule, queue, changes) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return `⚡️ <b>Черга ${queue}</b>\n━━━━━━━━━━━━━━━━\n\nНемає даних`;
  }

  let fullText = `⚡️ <b>Черга ${queue}</b>\n`;
  fullText += `━━━━━━━━━━━━━━━━\n\n`;

  // Sort schedule by date
  const sortedSchedule = [...schedule].sort((a, b) => {
    if (!a.eventDate || !b.eventDate) return 0;
    const [dayA, monthA, yearA] = a.eventDate.split('.').map(Number);
    const [dayB, monthB, yearB] = b.eventDate.split('.').map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateA - dateB;
  });

  for (const daySchedule of sortedSchedule) {
    if (!daySchedule || !daySchedule.queues || !daySchedule.queues[queue]) {
      continue;
    }

    const scheduleForQueue = daySchedule.queues[queue];
    const eventDate = daySchedule.eventDate || 'Сьогодні';
    const dateChanges = changes[eventDate];

    fullText += `📅 <b>${eventDate}</b>\n\n`;

    // Check if there are any outages for this day
    if (!Array.isArray(scheduleForQueue) || scheduleForQueue.length === 0) {
      fullText += `   🟢 Відключення не заплановані\n\n`;
    } else {
      // First show removed periods (what was deleted from old schedule)
      if (dateChanges?.removed && dateChanges.removed.length > 0) {
        dateChanges.removed.forEach((removed) => {
          const time = removed.shutdownHours || `${removed.from}-${removed.to}`;
          
          // Calculate duration for removed period
          let duration = '';
          if (removed.from && removed.to) {
            const mins = calculateDuration(removed.from, removed.to);
            duration = ` – на ${formatDuration(mins)}`;
          } else if (removed.shutdownHours) {
            const match = removed.shutdownHours.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
            if (match) {
              const mins = calculateDuration(match[1], match[2]);
              duration = ` – на ${formatDuration(mins)}`;
            }
          }
          
          // Strikethrough for removed (deleted) periods
          fullText += `   ❌ <s>${time}${duration}</s>\n\n`;
        });
      }

      // Then show current/real outages (actual schedule)
      scheduleForQueue.forEach((outage) => {
        const time = outage.shutdownHours || `${outage.from}-${outage.to}`;
        
        // Calculate duration
        let duration = '';
        if (outage.from && outage.to) {
          const mins = calculateDuration(outage.from, outage.to);
          duration = ` – на ${formatDuration(mins)}`;
        } else if (outage.shutdownHours) {
          const match = outage.shutdownHours.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
          if (match) {
            const mins = calculateDuration(match[1], match[2]);
            duration = ` – на ${formatDuration(mins)}`;
          }
        }

        // All real outages get red circle
        fullText += `   🔴 ${time}${duration}\n\n`;
      });
      

      if (daySchedule.scheduleApprovedSince) {
        fullText += `✅ <i>Затверджено: ${daySchedule.scheduleApprovedSince}</i>\n\n`;
      }
    }
  }

  return fullText.trim();
}

export default {
  calculateDuration,
  formatDuration,
  compareSchedules,
  formatScheduleWithChanges,
};
