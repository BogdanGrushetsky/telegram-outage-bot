import TelegramBot from 'node-telegram-bot-api';
import ScheduleCache from './models/ScheduleCache.js';
import { LOG_PREFIX } from './config/constants.js';
import {
  handleStart,
  handleQueues,
  handleTimers,
  handleStatus,
  handleSettings,
  handleQueueCallback,
  handleTimerCallback,
  handleSettingsCallback,
} from './telegram/handlers.js';

/**
 * Initialize Telegram bot with all handlers
 * @param {string} token - Telegram bot token
 * @returns {Object} Bot instance
 */
export function initializeBot(token) {
  const bot = new TelegramBot(token, { 
    polling: {
      autoStart: true,
      params: {
        timeout: 10,
      },
    },
  });

  console.log(`${LOG_PREFIX.BOT} Telegram bot initialized`);

  // Register commands
  bot.onText(/\/start/, (msg) => handleStart(bot, msg));
  bot.onText(/\/queues/, (msg) => handleQueues(bot, msg));
  bot.onText(/\/timers/, (msg) => handleTimers(bot, msg));
  bot.onText(/\/status/, (msg) => handleStatus(bot, msg, ScheduleCache));
  bot.onText(/\/settings/, (msg) => handleSettings(bot, msg));

  // Handle keyboard button texts (Ukrainian)
  bot.onText(/📊 Поточний статус/, (msg) => handleStatus(bot, msg, ScheduleCache));
  bot.onText(/⚙️ Налаштування/, (msg) => handleSettings(bot, msg));

  // Handle callback queries (button clicks)
  bot.on('callback_query', async (query) => {
    const callbackData = query.data;
    console.log(`${LOG_PREFIX.BOT} Callback query received: ${callbackData}`);

    try {
      if (callbackData.startsWith('queue_')) {
        await handleQueueCallback(bot, query, callbackData);
      } else if (callbackData.startsWith('timer_')) {
        await handleTimerCallback(bot, query, callbackData);
      } else if (callbackData.startsWith('settings_') || callbackData === 'back_to_menu') {
        await handleSettingsCallback(bot, query, callbackData);
      } else {
        console.warn(`${LOG_PREFIX.BOT} Unknown callback data: ${callbackData}`);
        await bot.answerCallbackQuery(query.id, '❌ Невідома команда');
      }
    } catch (error) {
      console.error(`${LOG_PREFIX.BOT} Error handling callback query:`, error);
      await bot.answerCallbackQuery(query.id, '❌ Сталася помилка').catch(() => {});
    }
  });

  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error(`${LOG_PREFIX.BOT} Polling error:`, error.message);
  });

  // Handle webhook errors (if using webhooks)
  bot.on('webhook_error', (error) => {
    console.error(`${LOG_PREFIX.BOT} Webhook error:`, error.message);
  });

  console.log(`${LOG_PREFIX.BOT} All commands registered`);
  console.log(`${LOG_PREFIX.BOT} Commands: /start, /queues, /timers, /status, /settings`);
  console.log(`${LOG_PREFIX.BOT} Keyboard buttons: 📊 Поточний статус, ⚙️ Налаштування`);

  return bot;
}