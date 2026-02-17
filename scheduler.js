/**
 * Scheduler module - Handles periodic updates and notifications
 * Refactored for better maintainability and separation of concerns
 */

import cron from 'node-cron';
import { formatScheduleText, generateEventId } from './utils/helpers.js';
import { compareSchedules, formatScheduleWithChanges } from './utils/scheduleComparison.js';
import { LOG_PREFIX, TIMING } from './config/constants.js';
import {
  getTodayString,
  getCurrentMinutes,
  formatCurrentTime,
  parseTimeToMinutes,
  isRelevantForPowerReturn,
  isEarlyMorning,
} from './utils/dateUtils.js';
import {
  getNotificationEnabledUsers,
  getUserChangedQueues,
  sendNotification,
  markEventAsNotified,
  isEventNotified,
  cleanOldNotifications as cleanOldNotificationsService,
  cleanOldNotifiedEvents as cleanOldNotifiedEventsService,
  createScheduleUpdateMessage,
  createUpcomingOutageMessage,
  createPowerReturnMessage,
} from './services/notificationService.js';
import {
  processMultipleQueues,
  getChangedQueues,
  getCachedSchedule,
  extractPeriodsForQueueAndDate,
  extractStartTime,
  extractEndTime,
  getAllQueues,
} from './services/scheduleService.js';

/**
 * Initialize scheduler to update schedules and send notifications
 * @param {Object} bot - Telegram bot instance
 */
export function initializeScheduler(bot) {
  const intervalMinutes = parseInt(process.env.SCHEDULE_UPDATE_INTERVAL || '900000') / 60000;

  console.log(`${LOG_PREFIX.SCHEDULER} Setting up schedule updates every ${intervalMinutes} minutes`);

  // Run every X minutes based on SCHEDULE_UPDATE_INTERVAL
  const cronExpression = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpression, async () => {
    console.log(`${LOG_PREFIX.SCHEDULER} Running schedule update cycle...`);
    await updateAllSchedules(bot);
  });

  // Clean old notified events on startup
  setTimeout(async () => {
    console.log(`${LOG_PREFIX.SCHEDULER} Cleaning old notified events on startup...`);
    await cleanOldNotifiedEventsService(TIMING.NOTIFIED_EVENTS_MAX_AGE_HOURS);
  }, 2000);

  // Run immediately on startup to populate cache
  setTimeout(() => {
    console.log(`${LOG_PREFIX.SCHEDULER} Running initial schedule update...`);
    updateAllSchedules(bot);
  }, TIMING.INITIAL_STARTUP_DELAY);

  console.log(`${LOG_PREFIX.SCHEDULER} Scheduler initialized`);
}

/**
 * Update all schedules for ALL queues and notify users only if schedule changed
 * @param {Object} bot - Telegram bot instance
 */
async function updateAllSchedules(bot) {
  const startTime = Date.now();

  try {
    const allQueues = getAllQueues();
    console.log(`${LOG_PREFIX.SCHEDULER} Starting update cycle for ALL ${allQueues.length} queues:`, allQueues);

    // Process all queues
    const results = await processMultipleQueues(allQueues);

    // Get queues that changed (excluding first-time initializations)
    const changedQueues = getChangedQueues(results);

    if (changedQueues.length > 0) {
      console.log(`${LOG_PREFIX.SCHEDULER} 📨 Notifying users about ${changedQueues.length} changed queues:`, changedQueues);
      await notifyUsersAboutChanges(bot, results);
    } else {
      console.log(`${LOG_PREFIX.SCHEDULER} ✓ No schedule changes detected`);
    }

    const duration = Date.now() - startTime;
    console.log(`${LOG_PREFIX.SCHEDULER} ✅ Schedule update cycle completed in ${duration}ms`);
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error in updateAllSchedules:`, error);
  }
}

/**
 * Notify users about schedule changes for specific queues
 * @param {Object} bot - Telegram bot instance
 * @param {Array} results - Array of processing results with oldSchedule
 */
async function notifyUsersAboutChanges(bot, results) {
  try {
    // Filter only changed queues
    const changedResults = results.filter(r => r.changed && !r.isFirstTime);
    const changedQueues = changedResults.map(r => r.queue);
    
    const users = await getNotificationEnabledUsers();
    console.log(`${LOG_PREFIX.SCHEDULER} Found ${users.length} users with notifications enabled`);

    let notificationsSent = 0;

    for (const user of users) {
      const userChangedQueues = getUserChangedQueues(user, changedQueues);

      if (userChangedQueues.length === 0) {
        continue;
      }

      console.log(`${LOG_PREFIX.SCHEDULER} User ${user.telegramId} subscribed to ${userChangedQueues.length} changed queues:`, userChangedQueues);

      for (const queue of userChangedQueues) {
        const result = changedResults.find(r => r.queue === queue);
        if (!result) continue;

        const schedule = result.schedule;
        const oldSchedule = result.oldSchedule;

        if (!schedule) {
          console.warn(`${LOG_PREFIX.SCHEDULER} No new schedule found for queue ${queue}`);
          continue;
        }

        let scheduleText;
        if (oldSchedule && Array.isArray(oldSchedule)) {
          // We have old schedule to compare
          const { filterFutureDays } = await import('./services/scheduleService.js');
          const oldFiltered = filterFutureDays(oldSchedule);
          const newFiltered = filterFutureDays(schedule);
          const changes = compareSchedules(oldFiltered, newFiltered, queue);
          scheduleText = formatScheduleWithChanges(schedule, queue, changes);
        } else {
          // No old schedule, use regular formatting
          scheduleText = formatScheduleText(schedule, queue);
        }

        const message = createScheduleUpdateMessage(scheduleText);

        const success = await sendNotification(bot, user.telegramId, message, { parse_mode: 'HTML' });

        if (success) {
          notificationsSent++;
          console.log(`${LOG_PREFIX.SCHEDULER} ✉️ Sent update notification to user ${user.telegramId} for queue ${queue}`);
        }

        // Small delay between notifications
        await delay(TIMING.NOTIFICATION_DELAY);
      }
    }

    console.log(`${LOG_PREFIX.SCHEDULER} ✅ Sent ${notificationsSent} notifications`);
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error in notifyUsersAboutChanges:`, error);
  }
}

/**
 * Send notification X minutes before an outage
 * @param {Object} bot - Telegram bot instance
 */
export async function checkAndNotifyUpcomingOutages(bot) {
  try {
    const users = await getNotificationEnabledUsers();
    console.log(`${LOG_PREFIX.SCHEDULER} Checking upcoming outages for ${users.length} users`);

    const now = new Date();
    const todayStr = getTodayString();
    const currentMinutes = getCurrentMinutes(now);
    const currentTime = formatCurrentTime(now);

    console.log(`${LOG_PREFIX.SCHEDULER} Today is: ${todayStr}, current time: ${currentTime}`);

    let notificationsSent = 0;

    for (const user of users) {
      if (user.queues.length === 0 || user.timers.length === 0) {
        continue;
      }

      for (const queue of user.queues) {
        const schedule = await getCachedSchedule(queue);

        if (!schedule) {
          continue;
        }

        // Extract today's periods
        const periods = extractPeriodsForQueueAndDate(schedule, queue, todayStr);

        if (periods.length === 0) {
          console.log(`${LOG_PREFIX.SCHEDULER} No outages scheduled for TODAY (${todayStr}) in queue ${queue}`);
          continue;
        }

        // Check each period
        for (const period of periods) {
          const startTime = extractStartTime(period);

          if (!startTime) {
            continue;
          }

          const periodMinutes = parseTimeToMinutes(startTime);
          if (periodMinutes === null) {
            continue;
          }

          const diffMinutes = periodMinutes - currentMinutes;

          console.log(`${LOG_PREFIX.SCHEDULER} Queue ${queue}, start: ${startTime}, current: ${currentTime}, diff: ${diffMinutes}min`);

          // Check if difference matches any of user's timers
          if (user.timers.includes(diffMinutes)) {
            const eventId = generateEventId(queue, startTime, period.eventDate);

            if (isEventNotified(user, eventId)) {
              console.log(`${LOG_PREFIX.SCHEDULER} Already notified about ${eventId}`);
              continue;
            }

            const dateInfo = period.eventDate || '';
            const message = createUpcomingOutageMessage(queue, startTime, diffMinutes, dateInfo);

            const success = await sendNotification(bot, user.telegramId, message, { parse_mode: 'HTML' });

            if (success) {
              await markEventAsNotified(user, eventId);
              notificationsSent++;
              console.log(`${LOG_PREFIX.SCHEDULER} ⏰ Sent upcoming outage notification to user ${user.telegramId} for queue ${queue} at ${startTime} (${diffMinutes}min before)`);
            }
          }
        }
      }
    }

    if (notificationsSent > 0) {
      console.log(`${LOG_PREFIX.SCHEDULER} ✅ Sent ${notificationsSent} upcoming outage notifications`);
    } else {
      console.log(`${LOG_PREFIX.SCHEDULER} ✓ No upcoming outages to notify about`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error in checkAndNotifyUpcomingOutages:`, error);
  }
}

/**
 * Check and notify when power returns (outage ends)
 * @param {Object} bot - Telegram bot instance
 */
export async function checkAndNotifyPowerReturns(bot) {
  try {
    const users = await getNotificationEnabledUsers();
    console.log(`${LOG_PREFIX.SCHEDULER} Checking power returns for ${users.length} users`);

    const now = new Date();
    const todayStr = getTodayString();
    const currentMinutes = getCurrentMinutes(now);
    const currentHour = now.getHours();

    let notificationsSent = 0;

    for (const user of users) {
      if (user.queues.length === 0) {
        continue;
      }

      for (const queue of user.queues) {
        const schedule = await getCachedSchedule(queue);

        if (!schedule) {
          continue;
        }

        const allPeriodsToCheck = [];

        // Extract relevant periods (today and possibly yesterday for midnight transitions)
        if (Array.isArray(schedule)) {
          for (const daySchedule of schedule) {
            if (daySchedule?.queues?.[queue]) {
              const eventDate = daySchedule.eventDate || '';

              if (!isRelevantForPowerReturn(eventDate, todayStr, currentHour)) {
                console.log(`${LOG_PREFIX.SCHEDULER} Skipping power return check for ${eventDate}`);
                continue;
              }

              const periods = daySchedule.queues[queue];
              if (Array.isArray(periods)) {
                periods.forEach(period => {
                  allPeriodsToCheck.push({
                    ...period,
                    eventDate: eventDate,
                    isYesterdayEvent: eventDate !== todayStr, // Mark if this is from yesterday
                  });
                });
              }
            }
          }
        } else if (schedule?.data) {
          // Old format support
          allPeriodsToCheck.push(...schedule.data.map(p => ({ ...p, eventDate: todayStr, isYesterdayEvent: false })));
        }

        if (allPeriodsToCheck.length === 0) {
          continue;
        }

        // Check each period
        for (const period of allPeriodsToCheck) {
          const endTime = extractEndTime(period);

          if (!endTime) {
            continue;
          }

          const endMinutes = parseTimeToMinutes(endTime);
          if (endMinutes === null) {
            continue;
          }

          let shouldNotify = false;
          let diffMinutes = 0;

          // Handle midnight transitions for yesterday's events that end after midnight
          if (period.isYesterdayEvent && isEarlyMorning(endMinutes, 60) && currentHour === 0) {
            // Outage from yesterday ends in early morning (00:00-01:00) today
            diffMinutes = currentMinutes - endMinutes;

            if (diffMinutes >= 0 && diffMinutes <= TIMING.POWER_RETURN_CHECK_WINDOW) {
              shouldNotify = true;
              console.log(`${LOG_PREFIX.SCHEDULER} Yesterday's outage midnight transition: end=${endTime}, current=${formatCurrentTime(now)}, diff=${diffMinutes}min`);
            } else if (diffMinutes > TIMING.POWER_RETURN_CHECK_WINDOW && diffMinutes <= TIMING.POWER_RETURN_MAX_DELAY) {
              console.log(`${LOG_PREFIX.SCHEDULER} ⚠️ Yesterday's outage ended ${diffMinutes}min ago (midnight) - possibly missed due to restart`);
              shouldNotify = true;
            }
          } else if (!period.isYesterdayEvent) {
            // Normal case - today's event
            diffMinutes = currentMinutes - endMinutes;

            if (diffMinutes >= 0 && diffMinutes <= TIMING.POWER_RETURN_CHECK_WINDOW) {
              shouldNotify = true;
            } else if (diffMinutes > TIMING.POWER_RETURN_CHECK_WINDOW && diffMinutes <= TIMING.POWER_RETURN_MAX_DELAY) {
              // Power returned a while ago - likely missed due to server restart
              console.log(`${LOG_PREFIX.SCHEDULER} ⚠️ Outage ended ${diffMinutes}min ago - possibly missed due to restart`);
              shouldNotify = true;
            }
          } else {
            // Yesterday's event but not in early morning window - skip
            console.log(`${LOG_PREFIX.SCHEDULER} ⏭️ Skipping yesterday's event outside midnight window`);
            shouldNotify = false;
          }

          // Additional safety check: don't notify about events that ended more than max delay ago
          if (diffMinutes > TIMING.POWER_RETURN_MAX_DELAY) {
            console.log(`${LOG_PREFIX.SCHEDULER} ⏭️ Skipping old event: ended ${diffMinutes}min ago (too old)`);
            shouldNotify = false;
          }

          if (shouldNotify) {
            // Check if another outage starts at the same time (no actual power return)
            const hasOverlappingOutage = allPeriodsToCheck.some(otherPeriod => {
              const otherStartTime = extractStartTime(otherPeriod);
              if (!otherStartTime) return false;
              
              // Check if another period starts exactly when this one ends
              return otherStartTime === endTime && otherPeriod !== period;
            });

            if (hasOverlappingOutage) {
              console.log(`${LOG_PREFIX.SCHEDULER} ⚠️ Skipping power return notification - another outage starts at ${endTime}`);
              continue;
            }

            const eventId = `power_return_${generateEventId(queue, endTime, period.eventDate)}`;

            if (isEventNotified(user, eventId)) {
              continue;
            }

            const dateInfo = period.eventDate || '';
            const message = createPowerReturnMessage(queue, endTime, dateInfo);

            const success = await sendNotification(bot, user.telegramId, message, { parse_mode: 'HTML' });

            if (success) {
              await markEventAsNotified(user, eventId);
              notificationsSent++;
              console.log(`${LOG_PREFIX.SCHEDULER} 💡 Sent power return notification to user ${user.telegramId} for queue ${queue} at ${endTime}`);
            }
          }
        }
      }
    }

    if (notificationsSent > 0) {
      console.log(`${LOG_PREFIX.SCHEDULER} ✅ Sent ${notificationsSent} power return notifications`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error in checkAndNotifyPowerReturns:`, error);
  }
}

/**
 * Clean old notified events periodically (keep only last 48 hours)
 */
export async function cleanOldNotifications() {
  try {
    await cleanOldNotificationsService(TIMING.NOTIFICATION_RETENTION_HOURS);
  } catch (error) {
    console.error(`${LOG_PREFIX.SCHEDULER} Error in cleanOldNotifications:`, error);
  }
}

/**
 * Delay utility
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
