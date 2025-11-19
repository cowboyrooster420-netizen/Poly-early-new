import pino from 'pino';

import { getEnv } from '../config/env.js';

/**
 * Production-grade structured logger using Pino
 * Automatically configures based on environment
 */
function createLogger(): pino.Logger {
  const env = getEnv();

  const baseConfig: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: env.NODE_ENV,
      service: 'polymarket-insider-bot',
    },
  };

  // Pretty print in development, JSON in production
  if (env.NODE_ENV === 'development') {
    return pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    });
  }

  return pino(baseConfig);
}

export const logger = createLogger();

/**
 * Create a child logger with additional context
 * Useful for tagging logs by service/module
 */
export function createChildLogger(
  context: Record<string, unknown>
): pino.Logger {
  return logger.child(context);
}
