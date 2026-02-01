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
        
        const filteredSchedule = filterFutureDays(newSchedule);
        
        if (Array.isArray(filteredSchedule) && filteredSchedule.length === 0) {
          console.warn(`[Scheduler] ⚠️ No future days in schedule for queue ${queue}!`);
          continue;
        }
        
        const outageDataOnly = extractOutageDataOnly(filteredSchedule);
        const newHash = hashSchedule(outageDataOnly);
        
        console.log(`[Scheduler] Computing hash from outage data only (excluding metadata)`);
        
        const cacheEntry = await ScheduleCache.findOne({ queue });

        if (cacheEntry && cacheEntry.hash === newHash) {
          console.log(`[Scheduler] ✓ No changes for queue ${queue} (hash match: ${newHash.substring(0, 8)}...)`);
          
          await ScheduleCache.findOneAndUpdate(
            { queue },
            { rawSchedule: newSchedule, updatedAt: new Date() }
          );
          
          console.log(`[Scheduler] Updated rawSchedule for queue ${queue} (keeping same hash)`);
          continue;
        }

        const isFirstTime = !cacheEntry;
        const oldHash = cacheEntry ? cacheEntry.hash?.substring(0, 8) : 'none';
        const newHashShort = newHash.substring(0, 8);
        
        console.log(`[Scheduler] 📢 Schedule ${isFirstTime ? 'initialized' : 'CHANGED'} for queue ${queue}`);
        console.log(`[Scheduler] Hash: ${oldHash}... → ${newHashShort}...`);

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
 * Extract only outage data from schedule (excluding metadata)
 * This prevents false positives when metadata like scheduleApprovedSince changes
 * @param {Array} schedule - Filtered schedule array
 * @returns {Array} Schedule with only essential outage data
 */
function extractOutageDataOnly(schedule) {
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
 * This prevents false positives when yesterday's data is removed
 */
function filterFutureDays(schedule) {
  if (!Array.isArray(schedule)) {
    return schedule;
  }

  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  
  console.log(`[Scheduler] Filtering schedule, today is: ${todayStr}`);

  const filtered = schedule.filter(day => {
    if (!day.eventDate) {
      console.log(`[Scheduler] Day without eventDate, keeping it`);
      return true;
    }
    
    const [dayNum, monthNum, yearNum] = day.eventDate.split('.').map(Number);
    const eventDate = new Date(yearNum, monthNum - 1, dayNum);
    eventDate.setHours(0, 0, 0, 0);
    
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    todayDate.setHours(0, 0, 0, 0);
    
    const isFuture = eventDate >= todayDate;
    
    if (isFuture) {
      console.log(`[Scheduler] ✓ Date ${day.eventDate}: keeping (today or future)`);
    } else {
      console.log(`[Scheduler] ✗ Date ${day.eventDate}: filtering out (past)`);
    }
    
    return isFuture;
  });

  console.log(`[Scheduler] Filtered ${schedule.length} days to ${filtered.length} days (kept: ${filtered.map(d => d.eventDate).join(', ')})`);
  
  if (filtered.length === 0 && schedule.length > 0) {
    console.warn(`[Scheduler] ⚠️ WARNING: All days were filtered out! This might indicate a problem with date parsing.`);
    console.warn(`[Scheduler] Original dates:`, schedule.map(d => d.eventDate));
  }
  
  return filtered;
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

    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    
    console.log(`[Scheduler] Today is: ${todayStr}, current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);

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
              const eventDate = daySchedule.eventDate || '';
              
              if (eventDate !== todayStr) {
                console.log(`[Scheduler] Skipping upcoming outage check for ${eventDate} (not today: ${todayStr})`);
                continue;
              }
              
              const periods = daySchedule.queues[queue];
              
              periods.forEach(period => {
                allPeriodsToCheck.push({
                  ...period,
                  eventDate: eventDate
                });
              });
              
              console.log(`[Scheduler] Found ${periods.length} periods for today (${eventDate}) in queue ${queue}`);
            }
          }
        } else if (cacheEntry.rawSchedule.data) {
          allPeriodsToCheck = cacheEntry.rawSchedule.data.map(p => ({...p, eventDate: todayStr}));
        }

        if (allPeriodsToCheck.length === 0) {
          console.log(`[Scheduler] No outages scheduled for TODAY (${todayStr}) in queue ${queue}`);
          continue;
        }

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

          console.log(`[Scheduler] Queue ${queue}, start: ${startTime}, current: ${now.getHours()}:${now.getMinutes()}, diff: ${diffMinutes}min`);

          if (user.timers.includes(diffMinutes)) {
            const eventId = generateEventId(queue, startTime, period.eventDate);

            if (user.notifiedEvents.includes(eventId)) {
              console.log(`[Scheduler] Already notified about ${eventId}`);
              continue;
            }

            const dateInfo = period.eventDate ? `\n📅 Дата: ${period.eventDate}` : '';
            const message = `⏰ Увага! Відключення світла\n\n⚡ Черга: ${queue}${dateInfo}\n🕐 Початок: ${startTime}\n⏳ Залишилось: ${diffMinutes} хв`;

            try {
              await bot.sendMessage(user.telegramId, message);

              user.notifiedEvents.push(eventId);
              await user.save();
              
              notificationsSent++;
              console.log(`[Scheduler] ⏰ Sent upcoming outage notification to user ${user.telegramId} for queue ${queue} at ${startTime} (${diffMinutes}min before)`);
            } catch (error) {
              console.error(`[Scheduler] Error sending upcoming notification to ${user.telegramId}:`, error.message);
            }
          }
        }
      }
    }

    if (notificationsSent > 0) {
      console.log(`[Scheduler] ✅ Sent ${notificationsSent} upcoming outage notifications`);
    } else {
      console.log(`[Scheduler] ✓ No upcoming outages to notify about`);
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

    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

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
              
              const shouldCheck = isEventRelevantForPowerReturn(eventDate, todayStr);
              
              if (!shouldCheck) {
                console.log(`[Scheduler] Skipping power return check for ${eventDate} (not relevant for today)`);
                continue;
              }
              
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
          
          let shouldNotify = false;
          
          if (endMinutes <= 60) {
            const diffMinutes = currentMinutes - endMinutes;
            
            if (diffMinutes >= 0 && diffMinutes <= 2) {
              shouldNotify = true;
              console.log(`[Scheduler] Midnight transition detected: end=${endTime}, current=${now.getHours()}:${now.getMinutes()}, diff=${diffMinutes}min`);
            }
          } else {
            const diffMinutes = currentMinutes - endMinutes;
            
            if (diffMinutes >= 0 && diffMinutes <= 2) {
              shouldNotify = true;
            }
          }
          
          if (shouldNotify) {
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
 * Check if event is relevant for power return check today
 * Handles midnight transitions correctly
 */
function isEventRelevantForPowerReturn(eventDate, todayStr) {
  if (!eventDate) return true;
  
  if (eventDate === todayStr) {
    return true;
  }
  
  const [todayDay, todayMonth, todayYear] = todayStr.split('.').map(Number);
  const [eventDay, eventMonth, eventYear] = eventDate.split('.').map(Number);
  
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
  const eventDateObj = new Date(eventYear, eventMonth - 1, eventDay);
  
  const yesterday = new Date(todayDate);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const isYesterday = eventDateObj.getTime() === yesterday.getTime();
  
  if (isYesterday) {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (currentHour === 0) {
      console.log(`[Scheduler] Event from yesterday (${eventDate}) is relevant - checking for midnight transitions`);
      return true;
    }
  }
  
  return false;
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