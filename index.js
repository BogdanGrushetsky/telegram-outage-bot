import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initializeBot } from './bot.js';
import { initializeScheduler, checkAndNotifyUpcomingOutages, checkAndNotifyPowerReturns, cleanOldNotifications } from './scheduler.js';
import { initializeAPI } from './api.js';
import cron from 'node-cron';

dotenv.config();

// Silence verbose logs in production — errors and warnings still show
if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
}

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/power-outage-bot';
const API_PORT = parseInt(process.env.API_PORT || '3000');
const SCHEDULE_UPDATE_INTERVAL = parseInt(process.env.SCHEDULE_UPDATE_INTERVAL || '900000');

/**
 * Validate environment variables
 */
function validateConfig() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI is not set, using default localhost');
  }

  console.log('✅ Configuration validated');
  console.log(`   - Schedule update interval: ${SCHEDULE_UPDATE_INTERVAL / 60000} minutes`);
}

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

/**
 * Main application startup
 */
async function start() {
  console.log('\n========================================');
  console.log('🚀 STARTING UKRAINE POWER OUTAGE BOT');
  console.log('========================================\n');

  console.log('[Main] Configuration validation...');
  validateConfig();
  
  console.log('[Main] Connecting to database...');
  await connectDatabase();

  // Initialize bot
  console.log('[Main] Initializing Telegram bot...');
  const bot = initializeBot(TELEGRAM_BOT_TOKEN);

  // Initialize API server
  console.log('[Main] Starting health check API...');
  initializeAPI(API_PORT);

  // Initialize scheduler (updates ALL queues every SCHEDULE_UPDATE_INTERVAL)
  console.log('[Main] Initializing scheduler for schedule updates...');
  initializeScheduler(bot);

  // Check for upcoming outages every 5 minutes
  console.log('[Main] Setting up cron job for outage notifications (every 5 minutes)...');
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Main] Running outage notification check...');
    await checkAndNotifyUpcomingOutages(bot);
  });

  // Check for power returns every 2 minutes
  console.log('[Main] Setting up cron job for power return notifications (every 2 minutes)...');
  cron.schedule('*/2 * * * *', async () => {
    console.log('[Main] Running power return check...');
    await checkAndNotifyPowerReturns(bot);
  });

  // Clean old notifications every day at 00:00
  console.log('[Main] Setting up cron job for notification cleanup (daily at 00:00)...');
  cron.schedule('0 0 * * *', async () => {
    console.log('[Main] Running notification cleanup...');
    await cleanOldNotifications();
  });

  console.log('\n========================================');
  console.log('✅ BOT FULLY INITIALIZED AND RUNNING');
  console.log('========================================\n');
  console.log('📋 Available Commands:');
  console.log('  /start    - Ініціалізувати бота та вибрати черги');
  console.log('  /queues   - Керувати вашими чергами електроживлення');
  console.log('  /timers   - Керувати таймерами сповіщень');
  console.log('  /status   - Перевірити поточний статус');
  console.log('  /settings - Налаштування бота\n');
  const maskedUri = MONGODB_URI.replace(/:([^@/]+)@/, ':****@');
  console.log(`[Main] Bot token: ${TELEGRAM_BOT_TOKEN.substring(0, 10)}...`);
  console.log(`[Main] Database: ${maskedUri}`);
  console.log(`[Main] API Port: ${API_PORT}`);
  console.log(`[Main] Update interval: ${SCHEDULE_UPDATE_INTERVAL / 60000} minutes\n`);
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Main] Received SIGINT, shutting down gracefully...');
  await mongoose.connection.close();
  console.log('[Main] Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Main] Received SIGTERM, shutting down gracefully...');
  await mongoose.connection.close();
  console.log('[Main] Database connection closed');
  process.exit(0);
});

// Start the application
start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});