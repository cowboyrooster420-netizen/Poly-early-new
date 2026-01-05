/**
 * Production-grade distributed lock using Redis
 */

import { randomUUID } from 'crypto';
import { redis } from '../services/cache/redis.js';
import { logger } from './logger.js';

export interface LockOptions {
  ttl: number; // Lock TTL in milliseconds
  retryDelay: number; // Delay between retries in milliseconds
  maxRetries: number; // Maximum number of retries
  refreshInterval?: number; // Auto-refresh interval (optional)
}

export const DEFAULT_LOCK_OPTIONS: LockOptions = {
  ttl: 30000, // 30 seconds
  retryDelay: 100, // 100ms
  maxRetries: 50, // 5 seconds total
};

export class LockError extends Error {
  public readonly key: string;
  public readonly holder: string | undefined;

  constructor(message: string, key: string, holder?: string) {
    super(message);
    this.name = 'LockError';
    this.key = key;
    this.holder = holder;
  }
}

export class DistributedLock {
  private readonly key: string;
  private readonly value: string;
  private readonly options: LockOptions;
  private refreshTimer: NodeJS.Timeout | undefined;
  private isReleased = false;

  constructor(key: string, options: Partial<LockOptions> = {}) {
    this.key = `lock:${key}`;
    this.value = randomUUID();
    this.options = { ...DEFAULT_LOCK_OPTIONS, ...options };
  }

  /**
   * Acquire the lock
   */
  async acquire(): Promise<void> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.options.maxRetries) {
      try {
        // Try to acquire lock with SET NX
        const acquired = await redis
          .getClient()
          .set(this.key, this.value, 'PX', this.options.ttl, 'NX');

        if (acquired === 'OK') {
          logger.debug(
            {
              key: this.key,
              attempts: attempts + 1,
              duration: Date.now() - startTime,
            },
            'Lock acquired'
          );

          // Start auto-refresh if configured
          if (
            this.options.refreshInterval &&
            this.options.refreshInterval < this.options.ttl
          ) {
            this.startRefresh();
          }

          return;
        }

        // Lock is held by someone else
        const currentHolder = await redis.get(this.key);

        logger.debug(
          {
            key: this.key,
            attempts: attempts + 1,
            holder: currentHolder,
          },
          'Lock is held, retrying'
        );

        // Wait before retrying
        await this.sleep(this.options.retryDelay);
        attempts++;
      } catch (error) {
        logger.error(
          {
            error,
            key: this.key,
            attempts,
          },
          'Error acquiring lock'
        );
        throw new LockError(
          `Failed to acquire lock: ${String(error)}`,
          this.key
        );
      }
    }

    // Max retries exceeded
    const currentHolder = await redis.get(this.key);
    throw new LockError(
      `Failed to acquire lock after ${attempts} attempts`,
      this.key,
      currentHolder || undefined
    );
  }

  /**
   * Release the lock
   */
  async release(): Promise<void> {
    if (this.isReleased) {
      return;
    }

    try {
      // Stop refresh timer
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
      }

      // Use Lua script to ensure we only delete our own lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = (await redis
        .getClient()
        .eval(script, 1, this.key, this.value)) as number;

      if (result === 1) {
        this.isReleased = true;
        logger.debug({ key: this.key }, 'Lock released');
      } else {
        logger.warn({ key: this.key }, 'Lock was already released or expired');
      }
    } catch (error) {
      logger.error(
        {
          error,
          key: this.key,
        },
        'Error releasing lock'
      );
      throw new LockError(`Failed to release lock: ${String(error)}`, this.key);
    }
  }

  /**
   * Extend the lock TTL
   */
  async extend(ttl?: number): Promise<void> {
    const newTtl = ttl || this.options.ttl;

    try {
      // Use Lua script to ensure we only extend our own lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = (await redis
        .getClient()
        .eval(script, 1, this.key, this.value, newTtl)) as number;

      if (result === 1) {
        logger.debug({ key: this.key, ttl: newTtl }, 'Lock extended');
      } else {
        throw new Error('Lock is no longer held');
      }
    } catch (error) {
      logger.error(
        {
          error,
          key: this.key,
        },
        'Error extending lock'
      );
      throw new LockError(`Failed to extend lock: ${String(error)}`, this.key);
    }
  }

  /**
   * Start auto-refresh timer
   */
  private startRefresh(): void {
    if (!this.options.refreshInterval) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void (async (): Promise<void> => {
        try {
          await this.extend();
        } catch (error) {
          logger.error(
            {
              error,
              key: this.key,
            },
            'Failed to refresh lock'
          );

          // Stop refreshing if we can't extend
          if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
          }
        }
      })();
    }, this.options.refreshInterval);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if a lock exists
   */
  static async exists(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    return await redis.exists(lockKey);
  }

  /**
   * Force release a lock (use with caution!)
   */
  static async forceRelease(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await redis.del(lockKey);
    logger.warn({ key: lockKey }, 'Lock force released');
  }
}

/**
 * Execute a function with distributed lock protection
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: Partial<LockOptions> = {}
): Promise<T> {
  const lock = new DistributedLock(key, options);

  try {
    await lock.acquire();
    return await fn();
  } finally {
    try {
      await lock.release();
    } catch (error) {
      // Log but don't throw - the operation succeeded
      logger.error({ error, key }, 'Failed to release lock after operation');
    }
  }
}

/**
 * Try to execute a function with lock, but don't wait if locked
 */
export async function tryWithLock<T>(
  key: string,
  fn: () => Promise<T>,
  defaultValue: T,
  options: Partial<LockOptions> = {}
): Promise<T> {
  const lock = new DistributedLock(key, {
    ...options,
    maxRetries: 0, // Don't retry
  });

  try {
    await lock.acquire();

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  } catch (error) {
    if (error instanceof LockError) {
      logger.debug({ key }, 'Lock is held, returning default value');
      return defaultValue;
    }
    throw error;
  }
}
