# Ukraine Power Outage Telegram Bot

A production-ready Node.js Telegram bot that notifies users about electricity outage schedules in Ukraine.

## Features

- 🤖 **Telegram Bot**: Command-based interface for schedule management
- 📍 **Multi-Queue Support**: Subscribe to multiple electricity queues (1.1–6.2)
- ⏰ **Smart Notifications**: Configurable timers (5, 10, 15, 30 minutes before outage)
- 📊 **Schedule Updates**: Automatic schedule checking every 15 minutes
- 💾 **MongoDB**: Persistent user preferences and schedule caching
- 🏥 **Health Checks**: Built-in health endpoints for monitoring
- 🐳 **Docker Ready**: Full Docker and docker-compose setup
- 🔒 **Production Grade**: Error handling, async/await patterns, defensive coding

## Tech Stack

- **Node.js** (ESM modules)
- **Telegram Bot API** (node-telegram-bot-api)
- **MongoDB** (Mongoose ORM)
- **Express** (Health check server)
- **node-cron** (Scheduler)
- **Axios** (HTTP client)
- **Docker** + docker-compose

## Project Structure

```
.
├── index.js                    # Main entry point
├── bot.js                      # Bot initialization and handlers
├── scheduler.js                # Schedule update and notification logic
├── api.js                      # Express health check server
├── models/
│   ├── User.js                # User model (Mongoose schema)
│   └── ScheduleCache.js        # Schedule cache model
├── telegram/
│   ├── handlers.js            # Command and callback handlers
│   └── keyboards.js           # Telegram keyboard layouts
├── utils/
│   ├── helpers.js             # Utility functions (hashing, formatting)
│   └── api.js                 # API client for fetching schedules
├── docker-compose.yml          # Docker Compose configuration
├── Dockerfile                  # Docker image definition
├── package.json               # Dependencies
└── .env.example               # Environment variables template
```

## Installation

### Prerequisites

- Node.js 18+ or Docker
- MongoDB (or Docker)
- Telegram Bot Token (from @BotFather on Telegram)

### Option 1: Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ukraine-power-outage-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create .env file**
   ```bash
   cp .env.example .env
   ```

4. **Set environment variables**
   Edit `.env` and add your Telegram bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   MONGODB_URI=mongodb://localhost:27017/power-outage-bot
   ```

5. **Start MongoDB** (ensure MongoDB is running)

6. **Run the bot**
   ```bash
   npm start
   ```

### Option 2: Docker Setup (Recommended)

1. **Prepare environment**
   ```bash
   cp .env.example .env
   ```

2. **Add your Telegram bot token to .env**
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. **Build and start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **View logs**
   ```bash
   docker-compose logs -f bot
   ```

5. **Stop the bot**
   ```bash
   docker-compose down
   ```

## Usage

### Telegram Bot Commands

- `/start` - Initialize bot and select your electricity queue(s)
- `/queues` - Manage your subscribed queues
- `/timers` - Configure notification timers (5, 10, 15, 30 minutes)
- `/status` - View current power outage schedule for your queues

### Queue Selection

Supported queues: **1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2**

Users can subscribe to multiple queues simultaneously.

### Notification Settings

- Select multiple timer options (minutes before outage)
- Enable/disable notifications without unsubscribing
- Schedule updates are fetched every 15 minutes
- Duplicate notifications are prevented with event ID tracking

## Configuration

### Environment Variables

```env
# Telegram Bot Token (required)
TELEGRAM_BOT_TOKEN=your_token

# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/power-outage-bot

# API Server Port
API_PORT=3000

# Node Environment
NODE_ENV=production
```

## API Endpoints

### Health Check

- `GET /health` - Full system health status
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "database": "connected"
  }
  ```

- `GET /live` - Liveness probe for Kubernetes/Uptime Kuma
  ```json
  { "status": "alive" }
  ```

- `GET /ready` - Readiness probe for Kubernetes
  ```json
  { "status": "ready" }
  ```

## Database Schema

### User Model

```javascript
{
  telegramId: Number,           // Unique Telegram user ID
  username: String,             // Telegram username
  queues: [String],            // Subscribed queues
  timers: [Number],            // Notification timers (minutes)
  notificationsEnabled: Boolean, // Toggle notifications
  notifiedEvents: [String],     // Tracking already notified events
  createdAt: Date,              // User creation timestamp
  updatedAt: Date               // Last update timestamp
}
```

### ScheduleCache Model

```javascript
{
  queue: String,       // Queue identifier
  hash: String,        // Schedule hash (for change detection)
  rawSchedule: Object, // Raw schedule data from API
  updatedAt: Date      // Last update timestamp
}
```

## Scheduler Tasks

1. **Schedule Updates** (every 15 minutes)
   - Fetches latest schedules from official API
   - Detects changes using SHA256 hash comparison
   - Notifies subscribed users of schedule changes

2. **Notification Checks** (every 5 minutes)
   - Checks upcoming outages against user timers
   - Sends pre-outage notifications
   - Tracks sent notifications to prevent duplicates

3. **Cleanup** (daily at 00:00)
   - Clears old notification event IDs
   - Keeps database efficient

## Monitoring

### Docker Health Checks

The bot includes health checks for Docker and Kubernetes:

```bash
# Check bot health
docker-compose ps

# View detailed logs
docker-compose logs bot

# Check database health
docker-compose logs mongo
```

### Uptime Monitoring (e.g., Uptime Kuma)

Monitor the bot using HTTP endpoint:
- **URL**: `http://your-server:3000/health`
- **Method**: GET
- **Expected Status**: 200 OK
- **Check Interval**: 30 seconds

## API Data Source

The bot uses the official Ukraine power schedule API:
```
https://be-svitlo.oe.if.ua/schedule-by-queue?queue=5.2
```

## Error Handling

- Defensive error handling with try-catch blocks
- Graceful database connection failures
- Telegram API retry logic
- Missing environment variable validation
- Invalid queue/timer validation

## Performance Optimizations

- Efficient schedule hash comparison (avoid redundant updates)
- Parallel API requests for multiple queues
- Indexed MongoDB queries for fast lookups
- Non-blocking async/await patterns
- Connection pooling via Mongoose

## Security

- Environment variable protection
- Non-root Docker user
- Input validation for all callbacks
- No sensitive data in logs
- Database connection pooling

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `--watch` flag for automatic restart on file changes.

### Code Structure

- **Clean Architecture**: Separation of concerns (bot, scheduler, handlers, models, utils)
- **No Hardcoded Values**: All configuration via environment variables
- **Comments**: Non-obvious logic is documented
- **Error Logging**: Comprehensive error messages with context

## Troubleshooting

### Bot not responding
1. Check if `TELEGRAM_BOT_TOKEN` is set correctly
2. Verify MongoDB connection: `docker-compose logs mongo`
3. Check bot logs: `docker-compose logs bot`

### Schedules not updating
1. Ensure MongoDB is running
2. Check API endpoint availability: `curl https://be-svitlo.oe.if.ua/schedule-by-queue?queue=5.2`
3. Check scheduler logs for errors

### Notifications not sending
1. Verify user has selected queues: `/queues`
2. Ensure notifications are enabled: `/status`
3. Check if timers are configured: `/timers`

## License

MIT

## Support

For issues, feature requests, or contributions, please refer to the project repository.
