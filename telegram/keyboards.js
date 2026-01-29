import { getAllValidQueues } from '../utils/helpers.js';

/**
 * Generate inline keyboard for queue selection (multi-select)
 * @param {string[]} selectedQueues - Currently selected queues
 * @returns {Object} Inline keyboard markup
 */
export function getQueueSelectionKeyboard(selectedQueues = []) {
  const allQueues = getAllValidQueues();
  const keyboard = [];
  const buttonsPerRow = 2;

  for (let i = 0; i < allQueues.length; i += buttonsPerRow) {
    const row = [];
    for (let j = 0; j < buttonsPerRow && i + j < allQueues.length; j++) {
      const queue = allQueues[i + j];
      const isSelected = selectedQueues.includes(queue);
      const text = isSelected ? `✅ ${queue}` : `⬜️ ${queue}`;

      row.push({
        text: text,
        callback_data: `queue_${queue}`,
      });
    }
    keyboard.push(row);
  }

  keyboard.push([
    {
      text: selectedQueues.length > 0 ? '❌ Скасувати всі' : '✅ Вибрати всі',
      callback_data: selectedQueues.length > 0 ? 'queue_clear_all' : 'queue_select_all',
    },
  ]);

  keyboard.push([
    {
      text: '✔️ Підтвердити',
      callback_data: 'queue_done',
    },
    {
      text: '↩️ Скасувати',
      callback_data: 'queue_cancel',
    },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Generate inline keyboard for notification timer selection
 * @param {number[]} selectedTimers - Currently selected timers
 * @returns {Object} Inline keyboard markup
 */
export function getTimerSelectionKeyboard(selectedTimers = []) {
  const timerOptions = [5, 10, 15, 30];
  const keyboard = [];
  const buttonsPerRow = 2;

  for (let i = 0; i < timerOptions.length; i += buttonsPerRow) {
    const row = [];
    for (let j = 0; j < buttonsPerRow && i + j < timerOptions.length; j++) {
      const timer = timerOptions[i + j];
      const isSelected = selectedTimers.includes(timer);
      const text = isSelected ? `✅ ⏰ ${timer}хв` : `⬜️ ⏰ ${timer}хв`;

      row.push({
        text: text,
        callback_data: `timer_${timer}`,
      });
    }
    keyboard.push(row);
  }

  keyboard.push([
    {
      text: selectedTimers.length > 0 ? '❌ Очистити' : '✅ Всі таймери',
      callback_data: selectedTimers.length > 0 ? 'timer_clear_all' : 'timer_select_all',
    },
  ]);

  keyboard.push([
    {
      text: '✔️ Підтвердити',
      callback_data: 'timer_done',
    },
    {
      text: '↩️ Скасувати',
      callback_data: 'timer_cancel',
    },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Generate inline keyboard for notification settings
 * @param {boolean} notificationsEnabled - Current notification status
 * @returns {Object} Inline keyboard markup
 */
export function getSettingsKeyboard(notificationsEnabled = true) {
  const notificationButton = notificationsEnabled 
    ? '🔕 Вимкнути сповіщення' 
    : '🔔 Увімкнути сповіщення';
  const callbackData = notificationsEnabled 
    ? 'settings_disable_notifications' 
    : 'settings_enable_notifications';

  return {
    inline_keyboard: [
      [{ text: notificationButton, callback_data: callbackData }],
      [
        { text: '⚙️ Налаштування черг', callback_data: 'settings_queues' },
        { text: '⏱ Налаштування таймерів', callback_data: 'settings_timers' }
      ],
      [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }],
    ],
  };
}

/**
 * Generate main menu keyboard
 * @returns {Object} Reply keyboard markup
 */
export function getMainMenuKeyboard() {
  return {
    keyboard: [
      [
        { text: '📊 Поточний статус' },
        { text: '⚙️ Налаштування' }
      ],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    persistent: true,
  };
}

/**
 * Hide keyboard
 * @returns {Object} Reply keyboard hide markup
 */
export function getHideKeyboard() {
  return {
    remove_keyboard: true,
  };
}