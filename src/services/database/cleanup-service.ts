import { db } from './prisma.js';
import { logger } from '../../utils/logger.js';

/**
 * Database cleanup service
 * Prunes old data to prevent unbounded growth
 */
class CleanupService {
  private static instance: CleanupService | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default retention: 7 days
  private readonly TRADE_RETENTION_DAYS: number;

  private constructor() {
    this.TRADE_RETENTION_DAYS =
      Number(process.env['TRADE_RETENTION_DAYS']) || 7;

    logger.info(
      { retentionDays: this.TRADE_RETENTION_DAYS },
      'Cleanup service initialized'
    );
  }

  public static getInstance(): CleanupService {
    if (CleanupService.instance === null) {
      CleanupService.instance = new CleanupService();
    }
    return CleanupService.instance;
  }

  /**
   * Start the daily cleanup job
   */
  public start(): void {
    if (this.cleanupInterval !== null) {
      logger.warn('Cleanup service already running');
      return;
    }

    // Run immediately on startup
    void this.runCleanup();

    // Then run every 24 hours
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      void this.runCleanup();
    }, TWENTY_FOUR_HOURS);

    logger.info('Cleanup service started (runs every 24h)');
  }

  /**
   * Stop the cleanup job
   */
  public stop(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Cleanup service stopped');
    }
  }

  /**
   * Run the cleanup process
   */
  public async runCleanup(): Promise<{ tradesDeleted: number }> {
    logger.info('Starting database cleanup...');

    try {
      const tradesDeleted = await this.pruneOldTrades();
      logger.info({ tradesDeleted }, 'Database cleanup complete');
      return { tradesDeleted };
    } catch (error) {
      logger.error(
        { error },
        '❌ Database cleanup FAILED — stale data may accumulate'
      );
      return { tradesDeleted: -1 };
    }
  }

  /**
   * Delete trades older than retention period
   * Keeps trades that have associated alerts
   */
  private async pruneOldTrades(): Promise<number> {
    try {
      const prisma = db.getClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.TRADE_RETENTION_DAYS);

      // Delete old trades that don't have alerts
      // Trades with alerts are kept (the alert record has all the important data)
      const result = await prisma.trade.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
          alerts: { none: {} },
        },
      });

      if (result.count > 0) {
        logger.info(
          {
            deleted: result.count,
            cutoffDate: cutoffDate.toISOString(),
            retentionDays: this.TRADE_RETENTION_DAYS,
          },
          'Pruned old trades'
        );
      }

      return result.count;
    } catch (error) {
      logger.error({ error }, 'Failed to prune old trades');
      throw error;
    }
  }

  /**
   * Get cleanup stats
   */
  public async getStats(): Promise<{
    totalTrades: number;
    tradesOlderThan7Days: number;
    tradesWithAlerts: number;
    potentialDeletions: number;
  }> {
    try {
      const prisma = db.getClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.TRADE_RETENTION_DAYS);

      const [totalTrades, tradesOlderThan7Days, tradesWithAlerts] =
        await Promise.all([
          prisma.trade.count(),
          prisma.trade.count({
            where: { timestamp: { lt: cutoffDate } },
          }),
          prisma.trade.count({
            where: { alerts: { some: {} } },
          }),
        ]);

      // Trades that would be deleted = old trades without alerts
      const potentialDeletions = await prisma.trade.count({
        where: {
          timestamp: { lt: cutoffDate },
          alerts: { none: {} },
        },
      });

      return {
        totalTrades,
        tradesOlderThan7Days,
        tradesWithAlerts,
        potentialDeletions,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cleanup stats');
      return {
        totalTrades: 0,
        tradesOlderThan7Days: 0,
        tradesWithAlerts: 0,
        potentialDeletions: 0,
      };
    }
  }
}

export const cleanupService = CleanupService.getInstance();
