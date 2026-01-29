import cron from 'node-cron';
import User from './models/User.js';
import ScheduleCache from './models/ScheduleCache.js';
import { fetchSchedule } from './utils/api.js';
import { hashSchedule, formatScheduleText, generateEventId, getAllValidQueues } from './utils/helpers.js';

/**
 * Initialize scheduler to update schedules and send notifications
 */
export function initializeScheduler(bot) {
  const intervalMinutes = parseInt(process.env.SCHEDULE_UPDATE_INTERVAL || '900000') / 60000;
  
  console.log(`[Scheduler] Setting up schedule updates every ${intervalMinutes} minutes`);
  
  // Run every X minutes based on SCHEDULE_UPDATE_INTERVAL
  const cronExpression = `*/${intervalMinutes} * * * *`;
  
  cron.schedule(cronExpression, async () => {
    console.log('[Scheduler] Running schedule update cycle...');
    await updateAllSchedules(bot);
  });

  // Run immediately on startup to populate cache
  setTimeout(() => {
    console.log('[Scheduler] Running initial schedule update...');
    updateAllSchedules(bot);
  }, 5000);

  console.log('[Scheduler] Scheduler initialized');
}

/**
 * Update all schedules for ALL queues and notify users only if schedule changed
 */
async function updateAllSchedules(bot) {
  const startTime = Date.now();
  
  try {
    const allQueues = getAllValidQueues();
    console.log(`[Scheduler] Starting update cycle for ALL ${allQueues.length} queues:`, allQueues);

    let changedQueues = [];

    for (const queue of allQueues) {
      try {
        console.log(`[Scheduler] Fetching schedule for queue ${queue}...`);
        const newSchedule = await fetchSchedule(queue);

        if (!newSchedule) {
          console.warn(`[Scheduler] ❌ Failed to fetch schedule for queue ${queue}`);
          continue;
        }

        console.log(`[Scheduler] ✅ Fetched schedule for queue ${queue}`);
        
        const newHash = hashSchedule(newSchedule);
        const cacheEntry = await ScheduleCache.findOne({ queue });

        if (cacheEntry && cacheEntry.hash === newHash) {
          console.log(`[Scheduler] ✓ No changes for queue ${queue} (hash match)`);
          continue;
        }

        const isFirstTime = !cacheEntry;
        console.log(`[Scheduler] 📢 Schedule ${isFirstTime ? 'initialized' : 'CHANGED'} for queue ${queue}`);

        const updatedCache = await ScheduleCache.findOneAndUpdate(
          { queue },
          { queue, hash: newHash, rawSchedule: newSchedule, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        
        console.log(`[Scheduler] Cache updated for queue ${queue}, ID:`, updatedCache._id);

        if (!isFirstTime) {
          changedQueues.push(queue);
        }

      } catch (error) {
        console.error(`[Scheduler] Error processing queue ${queue}:`, error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (changedQueues.length > 0) {
      console.log(`[Scheduler] 📨 Notifying users about ${changedQueues.length} changed queues:`, changedQueues);
      await notifyUsersAboutChanges(bot, changedQueues);
    } else {
      console.log(`[Scheduler] ✓ No schedule changes detected`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Scheduler] ✅ Schedule update cycle completed in ${duration}ms`);
  } catch (error) {
    console.error('[Scheduler] Error in updateAllSchedules:', error);
  }
}

/**
 * Notify users about schedule changes for specific queues
 */
async function notifyUsersAboutChanges(bot, changedQueues) {
  try {
    const users = await User.find({ notificationsEnabled: true });
    console.log(`[Scheduler] Found ${users.length} users with notifications enabled`);

    let notificationsSent = 0;

    for (const user of users) {
      const userChangedQueues = user.queues.filter(q => changedQueues.includes(q));
      
      if (userChangedQueues.length === 0) {
        continue;
      }

      console.log(`[Scheduler] User ${user.telegramId} subscribed to ${userChangedQueues.length} changed queues:`, userChangedQueues);

      for (const queue of userChangedQueues) {
        try {
          const cache = await ScheduleCache.findOne({ queue });
          
          if (!cache || !cache.rawSchedule) {
            console.warn(`[Scheduler] No cache found for queue ${queue}`);
            continue;
          }

          const scheduleText = formatScheduleText(cache.rawSchedule, queue);
          const message = `📢 Оновлення графіку відключень\n\n${scheduleText}`;

          await bot.sendMessage(user.telegramId, message, { parse_mode: 'HTML' });
          notificationsSent++;
          console.log(`[Scheduler] ✉️ Sent update notification to user ${user.telegramId} for queue ${queue}`);

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[Scheduler] Error sending message to user ${user.telegramId}:`, error.message);
        }
      }
    }

    console.log(`[Scheduler] ✅ Sent ${notificationsSent} notifications`);
  } catch (error) {
    console.error('[Scheduler] Error in notifyUsersAboutChanges:', error);
  }
}

/**
 * Send notification X minutes before an outage
 */
export async function checkAndNotifyUpcomingOutages(bot) {
  try {
    const users = await User.find({ notificationsEnabled: true });
    console.log(`[Scheduler] Checking upcoming outages for ${users.length} users`);

    let notificationsSent = 0;

    for (const user of users) {
      if (user.queues.length === 0 || user.timers.length === 0) {
        continue;
      }

      for (const queue of user.queues) {
        const cacheEntry = await ScheduleCache.findOne({ queue });

        if (!cacheEntry || !cacheEntry.rawSchedule) {
          continue;
        }

        let allPeriodsToCheck = [];
        
        if (Array.isArray(cacheEntry.rawSchedule)) {
          for (const daySchedule of cacheEntry.rawSchedule) {
            if (daySchedule && daySchedule.queues && daySchedule.queues[queue]) {
              const periods = daySchedule.queues[queue];
              const eventDate = daySchedule.eventDate || '';
              
              periods.forEach(period => {
                allPeriodsToCheck.push({
                  ...period,
                  eventDate: eventDate
                });
              });
            }
          }
        } else if (cacheEntry.rawSchedule.data) {
          allPeriodsToCheck = cacheEntry.rawSchedule.data;
        }

        if (allPeriodsToCheck.length === 0) {
          continue;
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (const period of allPeriodsToCheck) {
          let startTime = null;

          if (period.from) {
            startTime = period.from;
          } else if (period.shutdownHours) {
            const match = period.shutdownHours.match(/^(\d{2}:\d{2})/);
            if (match) {
              startTime = match[1];
            }
          }

          if (!startTime) {
            continue;
          }

          const [hour, min] = startTime.split(':').map(Number);
          const periodMinutes = hour * 60 + min;
          const diffMinutes = periodMinutes - currentMinutes;

          if (user.timers.includes(diffMinutes)) {
            const eventId = generateEventId(queue, startTime, period.eventDate);

            if (user.notifiedEvents.includes(eventId)) {
              continue;
            }

            const dateInfo = period.eventDate ? `\n📅 Дата: ${period.eventDate}` : '';
            const message = `⏰ Увага! Відключення світла\n\n⚡ Черга: ${queue}${dateInfo}\n🕐 Початок: ${startTime}\n⏳ Залишилось: ${diffMinutes} хв`;

            try {
              await bot.sendMessage(user.telegramId, message);

              user.notifiedEvents.push(eventId);
              await user.save();
              
              notificationsSent++;
              console.log(`[Scheduler] ⏰ Sent upcoming outage notification to user ${user.telegramId} for queue ${queue} at ${startTime}`);
            } catch (error) {
              console.error(`[Scheduler] Error sending upcoming notification to ${user.telegramId}:`, error.message);
            }
          }
        }
      }
    }

    if (notificationsSent > 0) {
      console.log(`[Scheduler] ✅ Sent ${notificationsSent} upcoming outage notifications`);
    }
  } catch (error) {
    console.error('[Scheduler] Error in checkAndNotifyUpcomingOutages:', error);
  }
}

/**
 * Check and notify when power returns (outage ends)
 */
export async function checkAndNotifyPowerReturns(bot) {
  try {
    const users = await User.find({ notificationsEnabled: true });
    console.log(`[Scheduler] Checking power returns for ${users.length} users`);

    let notificationsSent = 0;

    for (const user of users) {
      if (user.queues.length === 0) {
        continue;
      }

      for (const queue of user.queues) {
        const cacheEntry = await ScheduleCache.findOne({ queue });

        if (!cacheEntry || !cacheEntry.rawSchedule) {
          continue;
        }

        let allPeriodsToCheck = [];
        
        if (Array.isArray(cacheEntry.rawSchedule)) {
          for (const daySchedule of cacheEntry.rawSchedule) {
            if (daySchedule && daySchedule.queues && daySchedule.queues[queue]) {
              const periods = daySchedule.queues[queue];
              const eventDate = daySchedule.eventDate || '';
              
              periods.forEach(period => {
                allPeriodsToCheck.push({
                  ...period,
                  eventDate: eventDate
                });
              });
            }
          }
        } else if (cacheEntry.rawSchedule.data) {
          allPeriodsToCheck = cacheEntry.rawSchedule.data;
        }

        if (allPeriodsToCheck.length === 0) {
          continue;
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (const period of allPeriodsToCheck) {
          let endTime = null;

          if (period.to) {
            endTime = period.to;
          } else if (period.shutdownHours) {
            const match = period.shutdownHours.match(/-(\d{2}:\d{2})$/);
            if (match) {
              endTime = match[1];
            }
          }

          if (!endTime) {
            continue;
          }

          const [hour, min] = endTime.split(':').map(Number);
          const endMinutes = hour * 60 + min;
          
          const diffMinutes = currentMinutes - endMinutes;
          
          if (diffMinutes >= 0 && diffMinutes <= 2) {
            const eventId = `power_return_${generateEventId(queue, endTime, period.eventDate)}`;

            if (user.notifiedEvents.includes(eventId)) {
              continue;
            }

            const dateInfo = period.eventDate ? `\n📅 Дата: ${period.eventDate}` : '';
            const message = `✅ Світло повернулось!\n\n⚡ Черга: ${queue}${dateInfo}\n🕐 Час: ${endTime}\n💡 Відключення завершено`;

            try {
              await bot.sendMessage(user.telegramId, message);

              user.notifiedEvents.push(eventId);
              await user.save();
              
              notificationsSent++;
              console.log(`[Scheduler] 💡 Sent power return notification to user ${user.telegramId} for queue ${queue} at ${endTime}`);
            } catch (error) {
              console.error(`[Scheduler] Error sending power return notification to ${user.telegramId}:`, error.message);
            }
          }
        }
      }
    }

    if (notificationsSent > 0) {
      console.log(`[Scheduler] ✅ Sent ${notificationsSent} power return notifications`);
    }
  } catch (error) {
    console.error('[Scheduler] Error in checkAndNotifyPowerReturns:', error);
  }
}

/**
 * Clean old notified events periodically (keep only last 48 hours)
 */
export async function cleanOldNotifications() {
  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const result = await User.updateMany(
      { updatedAt: { $lt: twoDaysAgo } },
      { $set: { notifiedEvents: [] } }
    );

    console.log(`[Scheduler] Cleaned old notifications for ${result.modifiedCount} users`);
  } catch (error) {
    console.error('[Scheduler] Error in cleanOldNotifications:', error);
  }
}