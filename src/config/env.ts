import { z } from 'zod';

/**
 * Environment variable schema with strict validation
 * All required fields must be present or app will fail to start
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Redis
  REDIS_URL: z.string().startsWith('redis://'),

  // Polymarket
  POLYMARKET_WS_URL: z
    .string()
    .url()
    .startsWith('wss://')
    .default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  POLYMARKET_API_URL: z.string().url().default('https://clob.polymarket.com'),

  // Blockchain RPC
  ALCHEMY_API_KEY: z.string().min(1),
  POLYGONSCAN_API_KEY: z.string().min(1),

  // Notifications (at least one required in production)
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables
 * Throws detailed error if validation fails
 */
export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Environment variable validation failed:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid environment variables');
  }

  const env = parsed.data;

  // Additional production checks
  if (env.NODE_ENV === 'production') {
    const hasNotification =
      env.SLACK_WEBHOOK_URL !== undefined ||
      (env.TELEGRAM_BOT_TOKEN !== undefined &&
        env.TELEGRAM_CHAT_ID !== undefined);

    if (!hasNotification) {
      throw new Error(
        'Production requires at least one notification channel (Slack or Telegram)'
      );
    }
  }

  return env;
}

/**
 * Singleton environment configuration
 * Validates on first access
 */
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv === null) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}
