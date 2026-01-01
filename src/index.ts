import 'dotenv/config';

console.log('[STARTUP] Application starting...');

// Test Telegram connectivity at startup (before axios)
import https from 'https';
const tgToken = process.env['TELEGRAM_BOT_TOKEN'];
if (tgToken) {
  console.log('[STARTUP] Testing Telegram connectivity...');
  https
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

import Fastify from 'fastify';

import { registerHealthRoutes } from './api/health.js';
import { registerMarketRoutes } from './api/markets.js';
import { getEnv } from './config/env.js';
import { redis } from './services/cache/redis.js';
import { db } from './services/database/prisma.js';
import { marketService } from './services/polymarket/market-service.js';
import { tradeService } from './services/polymarket/trade-service.js';
import { polymarketWs } from './services/polymarket/websocket.js';
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

      // Close WebSocket connection
      await polymarketWs.disconnect();

      // Close database connection
      await db.disconnect();

      // Close Redis connection
      await redis.disconnect();

      // TODO: Drain job queues

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
    if (telegramNotifier.isConfigured()) {
      telegramNotifier
        .sendMessage(
          `💀 BOT CRASHED!\n\nError: ${error.message}\n\nStack: ${error.stack?.slice(0, 500) || 'N/A'}`
        )
        .catch(() => {
          /* ignore */
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

    logger.fatal(
      {
        reason,
        message: errorMessage,
        stack: errorStack,
      },
      '💀 CRASH: Unhandled promise rejection'
    );

    // Try to send Telegram notification before dying
    if (telegramNotifier.isConfigured()) {
      telegramNotifier
        .sendMessage(
          `💀 BOT CRASHED!\n\nUnhandled Rejection: ${errorMessage}\n\nStack: ${String(errorStack).slice(0, 500)}`
        )
        .catch(() => {
          /* ignore */
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
