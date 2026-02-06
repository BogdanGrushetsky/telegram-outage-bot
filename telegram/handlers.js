import User from '../models/User.js';
import {
  getQueueSelectionKeyboard,
  getTimerSelectionKeyboard,
  getSettingsKeyboard,
  getMainMenuKeyboard,
} from './keyboards.js';
import { isValidQueue, formatScheduleText, getAllValidQueues } from '../utils/helpers.js';

/**
 * Handle /start command - initialize user
 */
export async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const username = msg.from.username || null;

  try {
    console.log(`[Handlers] /start called by user ${telegramId} (${username})`);
    
    const user = await User.findOneAndUpdate(
      { telegramId },
      { telegramId, username, notificationsEnabled: true },
      { upsert: true, new: true }
    );
    
    console.log(`[Handlers] User ${telegramId} created/updated:`, user._id);

    const welcomeText = `👋 Ласкаво просимо до бота сповіщень про відключення світла!

Цей бот допоможе вам отримувати сповіщення про графіки відключення електроенергії у вашому районі.

Для початку виберіть вашу чергу(и) електроживлення:`;

    await bot.sendMessage(chatId, welcomeText, {
      reply_markup: getQueueSelectionKeyboard([]),
    });
    
    console.log(`[Handlers] Welcome message sent to ${chatId}`);
  } catch (error) {
    console.error('[Handlers] Error in handleStart:', error);
    await bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте ще раз.');
  }
}

/**
 * Handle /queues command - manage queue subscriptions
 */
export async function handleQueues(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    console.log(`[Handlers] /queues called by user ${telegramId}`);
    
    const user = await User.findOne({ telegramId });
    const selectedQueues = user?.queues || [];
    
    console.log(`[Handlers] User ${telegramId} has ${selectedQueues.length} queues selected:`, selectedQueues);

    const text = '📍 Виберіть вашу чергу(и) електроживлення:\n\n(Ви можете вибрати кілька черг)';

    await bot.sendMessage(chatId, text, {
      reply_markup: getQueueSelectionKeyboard(selectedQueues),
    });
  } catch (error) {
    console.error('[Handlers] Error in handleQueues:', error);
    await bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте ще раз.');
  }
}

/**
 * Handle /timers command - manage notification timers
 */
export async function handleTimers(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    console.log(`[Handlers] /timers called by user ${telegramId}`);
    
    const user = await User.findOne({ telegramId });
    const selectedTimers = user?.timers || [5, 10, 15, 30];
    
    console.log(`[Handlers] User ${telegramId} has timers:`, selectedTimers);

    const text = '⏰ Виберіть таймери сповіщень:\n\n(Отримуйте сповіщення за X хвилин до відключення)';

    await bot.sendMessage(chatId, text, {
      reply_markup: getTimerSelectionKeyboard(selectedTimers),
    });
  } catch (error) {
    console.error('[Handlers] Error in handleTimers:', error);
    await bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте ще раз.');
  }
}

/**
 * Handle /status command - show current power state
 */
export async function handleStatus(bot, msg, scheduleCache) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    console.log(`[Handlers] /status called by user ${telegramId}`);
    
    const user = await User.findOne({ telegramId });

    if (!user || user.queues.length === 0) {
      console.log(`[Handlers] User ${telegramId} has no queues selected`);
      await bot.sendMessage(
        chatId, 
        '❌ Спочатку виберіть вашу чергу за допомогою /queues',
        {
          reply_markup: getMainMenuKeyboard(),
        }
      );
      return;
    }

    console.log(`[Handlers] Fetching status for user ${telegramId}, queues:`, user.queues);

    let statusText = '📊 Поточний статус електроживлення:\n\n';

    for (const queue of user.queues) {
      const cache = await scheduleCache.findOne({ queue });
      console.log(`[Handlers] Cache for queue ${queue}:`, cache ? 'found' : 'not found');
      
      if (cache && cache.rawSchedule) {
        statusText += formatScheduleText(cache.rawSchedule, queue) + '\n\n';
      } else {
        statusText += `⚡ Черга ${queue}: Немає доступних даних\n\n`;
      }
    }

    await bot.sendMessage(chatId, statusText.trim(), {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    console.error('[Handlers] Error in handleStatus:', error);
    await bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте ще раз.');
  }
}

/**
 * Handle /settings command - show settings menu
 */
export async function handleSettings(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    console.log(`[Handlers] /settings called by user ${telegramId}`);
    
    const user = await User.findOne({ telegramId });
    const notificationsEnabled = user?.notificationsEnabled ?? true;
    
    const text = '⚙️ Налаштування бота:';

    await bot.sendMessage(chatId, text, {
      reply_markup: getSettingsKeyboard(notificationsEnabled),
    });
  } catch (error) {
    console.error('[Handlers] Error in handleSettings:', error);
    await bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте ще раз.');
  }
}

/**
 * Handle queue selection callback
 */
export async function handleQueueCallback(bot, query, callbackData) {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;

  try {
    if (callbackData === 'queue_select_all') {
      const allQueues = getAllValidQueues();
      await User.findOneAndUpdate({ telegramId }, { queues: allQueues });
      
      await bot.editMessageReplyMarkup(getQueueSelectionKeyboard(allQueues), {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id, '✅ Всі черги вибрані');
      return;
    }

    if (callbackData === 'queue_clear_all') {
      await User.findOneAndUpdate({ telegramId }, { queues: [] });
      
      await bot.editMessageReplyMarkup(getQueueSelectionKeyboard([]), {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id, '❌ Всі черги скасовані');
      return;
    }

    if (callbackData === 'queue_cancel') {
      await bot.editMessageText('❌ Вибір черг скасовано', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (callbackData === 'queue_done') {
      const user = await User.findOne({ telegramId });
      console.log(`[Handlers] Queue selection done for user ${telegramId}, selected:`, user?.queues);
      
      if (!user || user.queues.length === 0) {
        await bot.answerCallbackQuery(query.id, '❌ Виберіть принаймні одну чергу', true);
        return;
      }

      await bot.editMessageText('✅ Черги збережені! Тепер виберіть таймери сповіщень:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getTimerSelectionKeyboard(user.timers),
      });
      
      await bot.answerCallbackQuery(query.id);
      return;
    }

    const queue = callbackData.replace('queue_', '');
    console.log(`[Handlers] Queue callback for user ${telegramId}, queue:`, queue);

    if (!isValidQueue(queue)) {
      await bot.answerCallbackQuery(query.id, '❌ Невірна черга', true);
      return;
    }

    const user = await User.findOne({ telegramId });
    const selectedQueues = user?.queues || [];
    const isSelected = selectedQueues.includes(queue);

    if (isSelected) {
      selectedQueues.splice(selectedQueues.indexOf(queue), 1);
      console.log(`[Handlers] Removed queue ${queue}`);
    } else {
      selectedQueues.push(queue);
      console.log(`[Handlers] Added queue ${queue}`);
    }

    await User.findOneAndUpdate({ telegramId }, { queues: selectedQueues });

    await bot.editMessageReplyMarkup(getQueueSelectionKeyboard(selectedQueues), {
      chat_id: chatId,
      message_id: query.message.message_id,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('[Handlers] Error in handleQueueCallback:', error);
    await bot.answerCallbackQuery(query.id, '❌ Сталася помилка', true);
  }
}

/**
 * Handle timer selection callback
 */
export async function handleTimerCallback(bot, query, callbackData) {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;

  try {
    if (callbackData === 'timer_select_all') {
      const allTimers = [5, 10, 15, 30];
      await User.findOneAndUpdate({ telegramId }, { timers: allTimers });
      
      await bot.editMessageReplyMarkup(getTimerSelectionKeyboard(allTimers), {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id, '✅ Всі таймери вибрані');
      return;
    }

    if (callbackData === 'timer_clear_all') {
      await User.findOneAndUpdate({ telegramId }, { timers: [] });
      
      await bot.editMessageReplyMarkup(getTimerSelectionKeyboard([]), {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id, '❌ Всі таймери очищені');
      return;
    }

    if (callbackData === 'timer_cancel') {
      await bot.editMessageText('❌ Вибір таймерів скасовано', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (callbackData === 'timer_done') {
      const user = await User.findOne({ telegramId });
      console.log(`[Handlers] Timer selection done for user ${telegramId}, selected:`, user?.timers);
      
      if (!user || user.timers.length === 0) {
        await bot.answerCallbackQuery(query.id, '❌ Виберіть принаймні один таймер', true);
        return;
      }

      await bot.editMessageText(
        '✅ Налаштування збережені!\n\nВикористовуйте команди нижче:',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );

      await bot.sendMessage(
        chatId,
        '📱 Оберіть команду:',
        {
          reply_markup: getMainMenuKeyboard(),
        }
      );
      
      await bot.answerCallbackQuery(query.id);
      return;
    }

    const timer = parseInt(callbackData.replace('timer_', ''));
    console.log(`[Handlers] Timer callback for user ${telegramId}, timer:`, timer);

    if (isNaN(timer) || ![5, 10, 15, 30].includes(timer)) {
      await bot.answerCallbackQuery(query.id, '❌ Невірний таймер', true);
      return;
    }

    const user = await User.findOne({ telegramId });
    const selectedTimers = user?.timers || [];
    const isSelected = selectedTimers.includes(timer);

    if (isSelected) {
      selectedTimers.splice(selectedTimers.indexOf(timer), 1);
      console.log(`[Handlers] Removed timer ${timer}хв`);
    } else {
      selectedTimers.push(timer);
      console.log(`[Handlers] Added timer ${timer}хв`);
    }

    await User.findOneAndUpdate({ telegramId }, { timers: selectedTimers });

    await bot.editMessageReplyMarkup(getTimerSelectionKeyboard(selectedTimers), {
      chat_id: chatId,
      message_id: query.message.message_id,
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('[Handlers] Error in handleTimerCallback:', error);
    await bot.answerCallbackQuery(query.id, '❌ Сталася помилка', true);
  }
}

/**
 * Handle settings callback
 */
export async function handleSettingsCallback(bot, query, callbackData) {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;

  try {
    if (callbackData === 'settings_enable_notifications') {
      console.log(`[Handlers] Enabling notifications for user ${telegramId}`);
      await User.findOneAndUpdate({ telegramId }, { notificationsEnabled: true });
      await bot.editMessageText('🔔 Сповіщення увімкнені!', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getSettingsKeyboard(true),
      });
      await bot.answerCallbackQuery(query.id, '✅ Сповіщення увімкнені');
      return;
    }

    if (callbackData === 'settings_disable_notifications') {
      console.log(`[Handlers] Disabling notifications for user ${telegramId}`);
      await User.findOneAndUpdate({ telegramId }, { notificationsEnabled: false });
      await bot.editMessageText('🔕 Сповіщення вимкнені!', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getSettingsKeyboard(false),
      });
      await bot.answerCallbackQuery(query.id, '✅ Сповіщення вимкнені');
      return;
    }

    if (callbackData === 'settings_queues') {
      const user = await User.findOne({ telegramId });
      const selectedQueues = user?.queues || [];
      
      await bot.editMessageText('📍 Виберіть вашу чергу(и) електроживлення:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getQueueSelectionKeyboard(selectedQueues),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (callbackData === 'settings_timers') {
      const user = await User.findOne({ telegramId });
      const selectedTimers = user?.timers || [5, 10, 15, 30];
      
      await bot.editMessageText('⏰ Виберіть таймери сповіщень:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: getTimerSelectionKeyboard(selectedTimers),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (callbackData === 'back_to_menu') {
      await bot.editMessageText('🏠 Головне меню', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      await bot.sendMessage(chatId, '📱 Оберіть команду:', {
        reply_markup: getMainMenuKeyboard(),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('[Handlers] Error in handleSettingsCallback:', error);
    await bot.answerCallbackQuery(query.id, '❌ Сталася помилка', true);
  }
}

// Verify all exports are present
console.log('[Handlers] Module loaded with exports:', {
  handleStart: typeof handleStart,
  handleQueues: typeof handleQueues,
  handleTimers: typeof handleTimers,
  handleStatus: typeof handleStatus,
  handleSettings: typeof handleSettings,
  handleQueueCallback: typeof handleQueueCallback,
  handleTimerCallback: typeof handleTimerCallback,
  handleSettingsCallback: typeof handleSettingsCallback,
});