import 'dotenv/config';

// Remove startup console logs in production
/* eslint-disable no-console */
if (process.env['NODE_ENV'] !== 'production') {
  console.log('[STARTUP] Application starting...');

  // Test Telegram connectivity at startup (before axios)
  void import('https').then((https) => {
    const tgToken = process.env['TELEGRAM_BOT_TOKEN'];
    if (tgToken) {
      console.log('[STARTUP] Testing Telegram connectivity...');
      https.default
        .get(`https://api.telegram.org/bot${tgToken}/getMe`, (res) => {
          console.log('[STARTUP] TG STATUS:', res.statusCode);
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => console.log('[STARTUP] TG BODY:', data));
        })
        .on('error', (err) => {
          console.error('[STARTUP] TG ERROR:', err.message);
        });
    }
  });
}
/* eslint-enable no-console */

import Fastify from 'fastify';

import { registerHealthRoutes } from './api/health.js';
import { registerMarketRoutes } from './api/markets.js';
import { getEnv } from './config/env.js';
import { redis } from './services/cache/redis.js';
import { db } from './services/database/prisma.js';
import { marketService } from './services/polymarket/market-service.js';
import { tradeService } from './services/polymarket/trade-service.js';
import { polymarketWs } from './services/polymarket/websocket.js';
import { tradePoller } from './services/polymarket/trade-poller.js';
import { telegramNotifier } from './services/notifications/telegram-notifier.js';
import { telegramCommands } from './services/notifications/telegram-commands.js';
import { cleanupService } from './services/database/cleanup-service.js';
import { logger } from './utils/logger.js';

/**
 * Application entry point
 * Sets up HTTP server, WebSocket connections, and graceful shutdown
 */
async function main(): Promise<void> {
  logger.info('🚀 Starting Polymarket Insider Bot...');

  // Validate environment on startup
  const env = getEnv();
  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
    },
    'Environment validated'
  );

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own logger
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  // Register hooks for request logging
  app.addHook('onRequest', async (request) => {
    logger.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Incoming request'
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.getResponseTime(),
      },
      'Request completed'
    );
  });

  // Register health check routes
  await registerHealthRoutes(app);

  // Register market management routes
  await registerMarketRoutes(app);

  // Initialize database connection
  try {
    await db.connect();
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Initialize Redis connection
  try {
    await redis.connect(env.REDIS_URL);
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to Redis');
    process.exit(1);
  }

  // Initialize WebSocket connection to Polymarket
  try {
    await polymarketWs.connect();
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to Polymarket WebSocket');
    process.exit(1);
  }

  // Register trade handler
  polymarketWs.onTrade((trade) => {
    void tradeService.processTrade(trade);
  });

  // Initialize market service and subscribe to markets
  try {
    await marketService.initialize();
  } catch (error) {
    logger.fatal({ error }, 'Failed to initialize market service');
    process.exit(1);
  }

  // Start database cleanup service (prunes old trades daily)
  cleanupService.start();

  // Start trade polling service (fetches trades from subgraph)
  // This is needed because WebSocket doesn't provide user addresses
  tradePoller.start();
  logger.info('🔄 Trade polling service started (fetching from subgraph)');

  // Start HTTP server
  try {
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0', // Required for Docker
    });

    logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
      },
      '✅ Server started successfully'
    );
  } catch (error) {
    logger.error({ error }, '❌ Failed to start server');
    process.exit(1);
  }

  // Send startup notification to Telegram
  if (telegramNotifier.isConfigured()) {
    await telegramNotifier.sendTestMessage();
    logger.info('📨 Startup notification sent to Telegram');

    // Set up hourly heartbeat
    const ONE_HOUR = 60 * 60 * 1000;
    setInterval(() => {
      const now = new Date().toISOString();
      telegramNotifier
        .sendHeartbeat()
        .then((success) => {
          if (success) {
            logger.info({ timestamp: now }, '💓 Hourly heartbeat sent');
          }
        })
        .catch((err) => {
          logger.error({ error: err }, 'Failed to send hourly heartbeat');
        });
    }, ONE_HOUR);
    logger.info('⏰ Hourly Telegram heartbeat scheduled');

    // Start Telegram command listener
    await telegramCommands.start();
  }

  // Set up periodic OI refresh (every 10 minutes)
  const TEN_MINUTES = 10 * 60 * 1000;

  // Run initial refresh after 30 seconds
  setTimeout(() => {
    marketService.refreshOpenInterest().catch((err) => {
      logger.error({ error: err }, 'Failed initial OI refresh');
    });
  }, 30000);

  // Then refresh every 10 minutes
  setInterval(() => {
    marketService.refreshOpenInterest().catch((err) => {
      logger.error({ error: err }, 'Failed periodic OI refresh');
    });
  }, TEN_MINUTES);
  logger.info('📊 OI refresh scheduled (every 10 minutes)');

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      // Close HTTP server
      await app.close();
      logger.info('HTTP server closed');

      // Stop Telegram command listener
      telegramCommands.stop();

      // Stop cleanup service
      cleanupService.stop();

      // Stop trade poller
      tradePoller.stop();

      // Stop accepting new trades
      await polymarketWs.disconnect();

      // Wait for trade queue to drain (with timeout)
      logger.info('Draining trade queue...');
      const drainStart = Date.now();
      const DRAIN_TIMEOUT_MS = 30000; // 30 seconds max

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const stats = tradeService.getQueueStats();

        if (stats.mainQueue === 0 && !stats.isProcessing) {
          logger.info(
            {
              processedDuringShutdown: stats.totalProcessed,
              drainTimeMs: Date.now() - drainStart,
            },
            'Trade queue drained successfully'
          );
          break;
        }

        if (Date.now() - drainStart > DRAIN_TIMEOUT_MS) {
          logger.warn(
            {
              remainingInQueue: stats.mainQueue,
              deadLetterQueue: stats.deadLetterQueue,
            },
            'Trade queue drain timeout - some trades may be lost'
          );
          break;
        }

        // Check every 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Close database connection
      await db.disconnect();

      // Close Redis connection
      await redis.disconnect();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught errors - log details and notify before exit
  process.on('uncaughtException', (error: Error) => {
    logger.fatal(
      {
        error,
        stack: error.stack,
        message: error.message,
        name: error.name,
      },
      '💀 CRASH: Uncaught exception'
    );

    // Try to send Telegram notification before dying
    // Note: Only send error message, not stack trace (security best practice)
    if (telegramNotifier.isConfigured()) {
      telegramNotifier
        .sendMessage(
          `💀 BOT CRASHED!\n\nError: ${error.name}: ${error.message}\n\nCheck server logs for details.`
        )
        .catch((notifError) => {
          logger.error(
            { notifError },
            'Failed to send crash notification via Telegram'
          );
        })
        .finally(() => {
          process.exit(1);
        });
      // Give it 3 seconds to send
      setTimeout(() => process.exit(1), 3000);
    } else {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const errorMessage =
      reason instanceof Error ? reason.message : String(reason);
    const errorStack = reason instanceof Error ? reason.stack : 'N/A';
    const errorName =
      reason instanceof Error ? reason.name : 'UnhandledRejection';

    logger.fatal(
      {
        reason,
        message: errorMessage,
        stack: errorStack,
      },
      '💀 CRASH: Unhandled promise rejection'
    );

    // Try to send Telegram notification before dying
    // Note: Only send error message, not stack trace (security best practice)
    if (telegramNotifier.isConfigured()) {
      telegramNotifier
        .sendMessage(
          `💀 BOT CRASHED!\n\nUnhandled Rejection: ${errorName}: ${errorMessage}\n\nCheck server logs for details.`
        )
        .catch((notifError) => {
          logger.error(
            { notifError },
            'Failed to send crash notification via Telegram'
          );
        })
        .finally(() => {
          process.exit(1);
        });
      // Give it 3 seconds to send
      setTimeout(() => process.exit(1), 3000);
    } else {
      process.exit(1);
    }
  });
}

// Start the application
main().catch((error: Error) => {
  logger.fatal({ error }, 'Fatal error during startup');
  process.exit(1);
});
