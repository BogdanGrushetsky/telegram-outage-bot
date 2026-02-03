/**
 * Date and time utility functions
 */

/**
 * Parse date string in DD.MM.YYYY format to Date object
 * @param {string} dateStr - Date string in format "DD.MM.YYYY"
 * @returns {Date} Parsed date with time set to 00:00:00
 */
export function parseDateString(dateStr) {
  if (!dateStr) {
    return null;
  }

  const [day, month, year] = dateStr.split('.').map(Number);
  if (!day || !month || !year) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Format current date to DD.MM.YYYY
 * @param {Date} [date=new Date()] - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateString(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Get today's date string in DD.MM.YYYY format
 * @returns {string} Today's date
 */
export function getTodayString() {
  return formatDateString(new Date());
}

/**
 * Get yesterday's date string in DD.MM.YYYY format
 * @returns {string} Yesterday's date
 */
export function getYesterdayString() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateString(yesterday);
}

/**
 * Check if a date string represents today
 * @param {string} dateStr - Date string in format "DD.MM.YYYY"
 * @returns {boolean} True if date is today
 */
export function isToday(dateStr) {
  return dateStr === getTodayString();
}

/**
 * Check if a date string represents yesterday
 * @param {string} dateStr - Date string in format "DD.MM.YYYY"
 * @returns {boolean} True if date is yesterday
 */
export function isYesterday(dateStr) {
  return dateStr === getYesterdayString();
}

/**
 * Check if a date is today or in the future
 * @param {string} dateStr - Date string in format "DD.MM.YYYY"
 * @returns {boolean} True if date is today or future
 */
export function isTodayOrFuture(dateStr) {
  if (!dateStr) {
    return false;
  }

  const eventDate = parseDateString(dateStr);
  if (!eventDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return eventDate >= today;
}

/**
 * Parse time string to minutes since midnight
 * @param {string} timeStr - Time string in format "HH:MM"
 * @returns {number|null} Minutes since midnight, or null if invalid
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const [hour, minute] = parts.map(Number);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

/**
 * Format minutes since midnight to HH:MM string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in format "HH:MM"
 */
export function formatMinutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Get current time in minutes since midnight
 * @param {Date} [date=new Date()] - Date to get time from
 * @returns {number} Minutes since midnight
 */
export function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Format current time as HH:MM
 * @param {Date} [date=new Date()] - Date to format
 * @returns {string} Time string in format "HH:MM"
 */
export function formatCurrentTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Check if event is relevant for power return check
 * Handles midnight transitions correctly
 * @param {string} eventDate - Event date string
 * @param {string} todayStr - Today's date string
 * @param {number} currentHour - Current hour (0-23)
 * @returns {boolean} True if event is relevant
 */
export function isRelevantForPowerReturn(eventDate, todayStr, currentHour) {
  if (!eventDate) {
    return true;
  }

  if (eventDate === todayStr) {
    return true;
  }

  // Check for midnight transition (events from yesterday that end after midnight)
  if (isYesterday(eventDate) && currentHour === 0) {
    return true;
  }

  return false;
}

/**
 * Check if time is within a window (for notifications)
 * @param {number} targetMinutes - Target time in minutes
 * @param {number} currentMinutes - Current time in minutes
 * @param {number} windowMinutes - Window size in minutes
 * @returns {boolean} True if within window
 */
export function isWithinTimeWindow(targetMinutes, currentMinutes, windowMinutes) {
  const diff = targetMinutes - currentMinutes;
  return diff >= 0 && diff <= windowMinutes;
}

/**
 * Calculate difference between two times in minutes
 * @param {string} targetTime - Target time "HH:MM"
 * @param {string} currentTime - Current time "HH:MM"
 * @returns {number|null} Difference in minutes, or null if invalid
 */
export function getTimeDifferenceMinutes(targetTime, currentTime) {
  const targetMins = parseTimeToMinutes(targetTime);
  const currentMins = parseTimeToMinutes(currentTime);

  if (targetMins === null || currentMins === null) {
    return null;
  }

  return targetMins - currentMins;
}

/**
 * Check if time is in early morning (for midnight transition handling)
 * @param {number} minutes - Minutes since midnight
 * @param {number} cutoff - Cutoff in minutes (default 60 for 1 AM)
 * @returns {boolean} True if in early morning
 */
export function isEarlyMorning(minutes, cutoff = 60) {
  return minutes <= cutoff;
}

/**
 * Sort schedule array by date
 * @param {Array} schedule - Schedule array with eventDate property
 * @returns {Array} Sorted schedule array
 */
export function sortScheduleByDate(schedule) {
  if (!Array.isArray(schedule)) {
    return schedule;
  }

  return [...schedule].sort((a, b) => {
    if (!a.eventDate || !b.eventDate) {
      return 0;
    }

    const dateA = parseDateString(a.eventDate);
    const dateB = parseDateString(b.eventDate);

    if (!dateA || !dateB) {
      return 0;
    }

    return dateA - dateB;
  });
}

export default {
  parseDateString,
  formatDateString,
  getTodayString,
  getYesterdayString,
  isToday,
  isYesterday,
  isTodayOrFuture,
  parseTimeToMinutes,
  formatMinutesToTime,
  getCurrentMinutes,
  formatCurrentTime,
  isRelevantForPowerReturn,
  isWithinTimeWindow,
  getTimeDifferenceMinutes,
  isEarlyMorning,
  sortScheduleByDate,
};
