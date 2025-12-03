import { PrismaClient } from '@prisma/client';

import { logger } from '../../utils/logger.js';

/**
 * Singleton Prisma client with production-grade connection management
 */
class DatabaseService {
  private static instance: DatabaseService | null = null;
  private prisma: PrismaClient | null = null;
  private isConnected = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseService {
    if (DatabaseService.instance === null) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database connection
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.prisma !== null) {
      logger.debug('Database already connected');
      return;
    }

    try {
      logger.info('Connecting to database...');

      // Configure logging based on environment
      const logConfig =
        process.env['NODE_ENV'] === 'development'
          ? (['query', 'error', 'warn'] as const)
          : (['error', 'warn'] as const);

      this.prisma = new PrismaClient({
        log: logConfig.map((level) => ({ emit: 'stdout' as const, level })),
        errorFormat: 'minimal',
      });

      // Test connection
      await this.prisma.$connect();

      this.isConnected = true;
      logger.info('✅ Database connected successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('[DATABASE ERROR]', errorMessage);
      console.error('[DATABASE FULL ERROR]', error);
      logger.error({ error: errorMessage }, 'Failed to connect to database');
      throw new Error(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    if (this.prisma === null || !this.isConnected) {
      logger.debug('Database not connected, skipping disconnect');
      return;
    }

    try {
      logger.info('Disconnecting from database...');
      await this.prisma.$disconnect();
      this.isConnected = false;
      this.prisma = null;
      logger.info('Database disconnected');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from database');
      throw error;
    }
  }

  /**
   * Get Prisma client instance
   * Throws if not connected
   */
  public getClient(): PrismaClient {
    if (this.prisma === null || !this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  /**
   * Health check - verify database connectivity
   */
  public async healthCheck(): Promise<{
    isHealthy: boolean;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      if (this.prisma === null) {
        return {
          isHealthy: false,
          latency: 0,
          error: 'Prisma client not initialized',
        };
      }

      // Simple query to check connection
      await this.prisma.$queryRaw`SELECT 1`;

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
   * Execute a transaction with automatic retry logic
   */
  public async executeTransaction<T>(
    callback: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    const client = this.getClient();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback(client);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          {
            attempt,
            maxRetries,
            error: lastError.message,
          },
          'Transaction failed, retrying...'
        );

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100)
          );
        }
      }
    }

    logger.error({ error: lastError }, 'Transaction failed after all retries');
    throw lastError;
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance();

// Export Prisma client type for type safety
export type { PrismaClient };
