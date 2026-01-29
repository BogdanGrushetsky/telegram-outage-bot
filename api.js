import express from 'express';
import mongoose from 'mongoose';

const app = express();

/**
 * Initialize Express server with health check endpoint
 */
export function initializeAPI(port) {
  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      // Check database connection
      const dbStatus = mongoose.connection.readyState;

      if (dbStatus === 1) {
        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: 'connected',
        });
      } else {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        message: error.message,
      });
    }
  });

  // Liveness probe
  app.get('/live', (req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  // Readiness probe
  app.get('/ready', async (req, res) => {
    const dbStatus = mongoose.connection.readyState;

    if (dbStatus === 1) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.listen(port, () => {
    console.log(`[API] Health check server running on port ${port}`);
  });

  return app;
}
