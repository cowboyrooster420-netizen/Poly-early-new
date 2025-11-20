import { Redis as RedisConstructor } from 'ioredis';

import { logger } from '../../utils/logger.js';

type RedisClient = RedisConstructor;

/**
 * Redis cache service with connection management and health checks
 */
class RedisService {
  private static instance: RedisService | null = null;
  private client: RedisClient | null = null;
  private isConnected = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RedisService {
    if (RedisService.instance === null) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Initialize Redis connection
   */
  public async connect(redisUrl: string): Promise<void> {
    if (this.isConnected && this.client !== null) {
      logger.debug('Redis already connected');
      return;
    }

    try {
      logger.info({ redisUrl }, 'Connecting to Redis...');

      this.client = new RedisConstructor(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy: (times: number): number => {
          const delay = Math.min(times * 50, 2000);
          logger.debug({ attempt: times, delay }, 'Redis retry attempt');
          return delay;
        },
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis ready');
      });

      this.client.on('error', (error: Error) => {
        logger.error({ error }, 'Redis error');
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', (delay: number) => {
        logger.info({ delay }, 'Redis reconnecting');
      });

      // Connect
      await this.client.connect();

      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      throw new Error(
        `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client === null || !this.isConnected) {
      logger.debug('Redis not connected, skipping disconnect');
      return;
    }

    try {
      logger.info('Disconnecting from Redis...');
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from Redis');
      throw error;
    }
  }

  /**
   * Get Redis client instance
   * Throws if not connected
   */
  public getClient(): RedisClient {
    if (this.client === null || !this.isConnected) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Health check - verify Redis connectivity
   */
  public async healthCheck(): Promise<{
    isHealthy: boolean;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      if (this.client === null) {
        return {
          isHealthy: false,
          latency: 0,
          error: 'Redis client not initialized',
        };
      }

      // Simple PING command to check connection
      await this.client.ping();

      const latency = Date.now() - startTime;

      return {
        isHealthy: true,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        isHealthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set a value with optional TTL (in seconds)
   */
  public async set(
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<void> {
    const client = this.getClient();

    try {
      if (ttlSeconds !== undefined) {
        await client.setex(key, ttlSeconds, value);
      } else {
        await client.set(key, value);
      }

      logger.debug({ key, ttl: ttlSeconds }, 'Redis SET');
    } catch (error) {
      logger.error({ error, key }, 'Redis SET failed');
      throw error;
    }
  }

  /**
   * Get a value by key
   */
  public async get(key: string): Promise<string | null> {
    const client = this.getClient();

    try {
      const value = await client.get(key);
      logger.debug({ key, hit: value !== null }, 'Redis GET');
      return value;
    } catch (error) {
      logger.error({ error, key }, 'Redis GET failed');
      throw error;
    }
  }

  /**
   * Set a JSON object with optional TTL
   */
  public async setJSON<T>(
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.set(key, serialized, ttlSeconds);
  }

  /**
   * Get a JSON object by key
   */
  public async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ error, key }, 'Failed to parse JSON from Redis');
      return null;
    }
  }

  /**
   * Delete a key
   */
  public async delete(key: string): Promise<void> {
    const client = this.getClient();

    try {
      await client.del(key);
      logger.debug({ key }, 'Redis DEL');
    } catch (error) {
      logger.error({ error, key }, 'Redis DEL failed');
      throw error;
    }
  }

  /**
   * Delete multiple keys
   */
  public async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const client = this.getClient();

    try {
      await client.del(...keys);
      logger.debug({ count: keys.length }, 'Redis DEL (batch)');
    } catch (error) {
      logger.error({ error, count: keys.length }, 'Redis DEL (batch) failed');
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  public async exists(key: string): Promise<boolean> {
    const client = this.getClient();

    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Redis EXISTS failed');
      throw error;
    }
  }

  /**
   * Set expiration on a key (in seconds)
   */
  public async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = this.getClient();

    try {
      await client.expire(key, ttlSeconds);
      logger.debug({ key, ttl: ttlSeconds }, 'Redis EXPIRE');
    } catch (error) {
      logger.error({ error, key }, 'Redis EXPIRE failed');
      throw error;
    }
  }

  /**
   * Increment a counter
   */
  public async increment(key: string): Promise<number> {
    const client = this.getClient();

    try {
      const value = await client.incr(key);
      logger.debug({ key, value }, 'Redis INCR');
      return value;
    } catch (error) {
      logger.error({ error, key }, 'Redis INCR failed');
      throw error;
    }
  }

  /**
   * Get all keys matching a pattern
   */
  public async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();

    try {
      const keys = await client.keys(pattern);
      logger.debug({ pattern, count: keys.length }, 'Redis KEYS');
      return keys;
    } catch (error) {
      logger.error({ error, pattern }, 'Redis KEYS failed');
      throw error;
    }
  }

  /**
   * Flush all keys (use with caution!)
   */
  public async flushAll(): Promise<void> {
    const client = this.getClient();

    try {
      await client.flushall();
      logger.warn('Redis FLUSHALL executed');
    } catch (error) {
      logger.error({ error }, 'Redis FLUSHALL failed');
      throw error;
    }
  }
}

// Export singleton instance
export const redis = RedisService.getInstance();

// Export type for external use
export type { RedisClient };
