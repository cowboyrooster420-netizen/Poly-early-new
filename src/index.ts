import 'dotenv/config';

import Fastify from 'fastify';

import { registerHealthRoutes } from './api/health.js';
import { getEnv } from './config/env.js';
import { db } from './services/database/prisma.js';
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

  // Initialize database connection
  try {
    await db.connect();
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // TODO: Initialize Redis connection
  // TODO: Initialize WebSocket connection to Polymarket
  // TODO: Start background jobs (BullMQ)

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

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      // Close HTTP server
      await app.close();
      logger.info('HTTP server closed');

      // Close database connection
      await db.disconnect();

      // TODO: Close WebSocket connections
      // TODO: Close Redis connections
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

  // Handle uncaught errors
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

// Start the application
main().catch((error: Error) => {
  logger.fatal({ error }, 'Fatal error during startup');
  process.exit(1);
});
