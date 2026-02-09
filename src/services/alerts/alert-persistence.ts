import { db, type PrismaClient } from '../database/prisma.js';
import { redis } from '../cache/redis.js';
import { notificationCoordinator } from '../notifications/notification-coordinator.js';
import { logger } from '../../utils/logger.js';
import type { AlertScore, AlertClassification } from './alert-scorer.js';
import type { TradeSignal } from '../../types/index.js';
import type { WalletFingerprint } from '../blockchain/wallet-forensics.js';

/**
 * Alert data for persistence
 */
export interface AlertData {
  tradeId: string;
  marketId: string;
  marketQuestion: string;
  marketSlug: string;
  walletAddress: string;
  tradeSize: string;
  tradePrice: string;
  tradeSide: 'BUY' | 'SELL';
  timestamp: Date;
  confidenceScore: number;
  classification: AlertClassification;
  tradeSignal: TradeSignal;
  walletFingerprint: WalletFingerprint;
  scoreBreakdown: AlertScore['breakdown'];
}

/**
 * Alert persistence service
 * Handles saving and retrieving alerts from the database
 */
class AlertPersistenceService {
  private static instance: AlertPersistenceService | null = null;

  private constructor() {
    logger.info('Alert persistence service initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AlertPersistenceService {
    if (AlertPersistenceService.instance === null) {
      AlertPersistenceService.instance = new AlertPersistenceService();
    }
    return AlertPersistenceService.instance;
  }

  /**
   * Dedup window: skip alert if same wallet+market already alerted within this period
   */
  private readonly DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * Persist alert to database (with deduplication)
   */
  public async createAlert(data: AlertData): Promise<void> {
    // Acquire a short-lived Redis lock to prevent concurrent duplicate alerts
    const lockKey = `alert:lock:${data.walletAddress}:${data.marketId}`;
    const LOCK_TTL_SECONDS = 30;
    let lockAcquired = false;

    try {
      const client = redis.getClient();
      const result = await client.set(
        lockKey,
        '1',
        'EX',
        LOCK_TTL_SECONDS,
        'NX'
      );
      lockAcquired = result === 'OK';
    } catch {
      // Redis unavailable — proceed without lock (DB unique constraint is the safety net)
      lockAcquired = true;
    }

    if (!lockAcquired) {
      logger.info(
        {
          tradeId: data.tradeId,
          wallet: data.walletAddress.substring(0, 10) + '...',
          marketId: data.marketId,
        },
        '🔇 Duplicate alert suppressed (concurrent lock held)'
      );
      return;
    }

    try {
      // Dedup check: has this wallet+market combo already been alerted recently?
      const prisma = db.getClient();
      const cutoff = new Date(data.timestamp.getTime() - this.DEDUP_WINDOW_MS);
      const existing = await prisma.alert.findFirst({
        where: {
          walletAddress: data.walletAddress,
          marketId: data.marketId,
          timestamp: { gte: cutoff },
        },
        select: { id: true, tradeId: true },
      });

      if (existing) {
        logger.info(
          {
            tradeId: data.tradeId,
            existingTradeId: existing.tradeId,
            existingAlertId: existing.id,
            wallet: data.walletAddress.substring(0, 10) + '...',
            marketId: data.marketId,
          },
          '🔇 Duplicate alert suppressed (same wallet+market within 2h window)'
        );
        return;
      }

      await db.executeTransaction(async (txPrisma: PrismaClient) => {
        // Create alert record
        await txPrisma.alert.create({
          data: {
            tradeId: data.tradeId,
            marketId: data.marketId,
            walletAddress: data.walletAddress,
            tradeSize: data.tradeSize,
            tradePrice: data.tradePrice,
            tradeSide: data.tradeSide,
            timestamp: data.timestamp,
            confidenceScore: data.confidenceScore,
            classification: data.classification,

            // Trade signal metrics
            oiPercentage: data.tradeSignal.oiPercentage,
            priceImpact: data.tradeSignal.priceImpact,
            tradeUsdValue: data.tradeSignal.tradeUsdValue,

            // Dormancy metrics (no longer used for gating, set to defaults)
            isDormant: false,
            hoursSinceLastLargeTrade: 0,
            hoursSinceLastPriceMove: 0,
            lastLargeTradeTimestamp: null,
            lastPriceMoveTimestamp: null,

            // Wallet flags
            walletIsSuspicious: data.walletFingerprint.isSuspicious,
            walletCexFunded: data.walletFingerprint.flags.cexFunded,
            walletLowTxCount: data.walletFingerprint.flags.lowTxCount,
            walletYoung: data.walletFingerprint.flags.youngWallet,
            walletHighPolymarketNetflow:
              data.walletFingerprint.flags.highPolymarketNetflow,
            walletSinglePurpose: data.walletFingerprint.flags.singlePurpose,

            // Wallet metadata
            walletTotalTransactions:
              data.walletFingerprint.metadata.totalTransactions,
            walletAgeDays: data.walletFingerprint.metadata.walletAgeDays,
            walletCexFundingSource:
              data.walletFingerprint.metadata.cexFundingSource,
            walletPolymarketNetflowPercentage:
              data.walletFingerprint.metadata.polymarketNetflowPercentage,

            // Score breakdown (v2 - tiered scoring with multipliers)
            scoreTradeSize: data.scoreBreakdown.impactContribution, // OI contribution (40% weight)
            scoreDormancy: 0, // Stored in multipliers now
            scoreWalletSuspicion: data.scoreBreakdown.walletContribution, // Wallet contribution (60% weight)
            scoreTiming: 0, // Extremity removed - no longer used

            // Alert metadata
            notified: false,
            notifiedAt: null,
            dismissed: false,
            dismissedAt: null,
            notes: null,
          },
        });
      });

      logger.info(
        {
          tradeId: data.tradeId,
          marketId: data.marketId,
          wallet: data.walletAddress.substring(0, 10) + '...',
          score: data.confidenceScore,
          classification: data.classification,
        },
        '🚨 Alert created and persisted'
      );
    } catch (error) {
      logger.error(
        {
          error,
          tradeId: data.tradeId,
          marketId: data.marketId,
        },
        'Failed to persist alert to database'
      );
      throw error;
    }

    // Send notifications independently — DB persistence already succeeded above
    try {
      const result = await notificationCoordinator.sendAlert(data);

      if (!result.anySuccess) {
        logger.error(
          {
            tradeId: data.tradeId,
            slack: result.slack,
            telegram: result.telegram,
            discord: result.discord,
          },
          '❌ Alert persisted but ALL notification channels failed'
        );
      } else if (!result.slack || !result.telegram || !result.discord) {
        logger.warn(
          {
            tradeId: data.tradeId,
            slack: result.slack,
            telegram: result.telegram,
            discord: result.discord,
          },
          '⚠️ Alert sent but some notification channels failed'
        );
      }
    } catch (notifError) {
      logger.error(
        {
          error: notifError,
          tradeId: data.tradeId,
          marketId: data.marketId,
        },
        '❌ Alert persisted but notification send threw an error'
      );
    }
  }

  /**
   * Get recent alerts
   */
  public async getRecentAlerts(limit = 10): Promise<unknown[]> {
    try {
      const prisma = db.getClient();
      const alerts = await prisma.alert.findMany({
        take: limit,
        orderBy: { timestamp: 'desc' },
        where: { dismissed: false },
      });

      return alerts;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch recent alerts');
      return [];
    }
  }

  /**
   * Get alerts by classification
   */
  public async getAlertsByClassification(
    classification: AlertClassification,
    limit = 10
  ): Promise<unknown[]> {
    try {
      const prisma = db.getClient();
      const alerts = await prisma.alert.findMany({
        where: {
          classification,
          dismissed: false,
        },
        take: limit,
        orderBy: { timestamp: 'desc' },
      });

      return alerts;
    } catch (error) {
      logger.error({ error, classification }, 'Failed to fetch alerts');
      return [];
    }
  }

  /**
   * Mark alert as notified
   */
  public async markAsNotified(alertId: string): Promise<void> {
    try {
      const prisma = db.getClient();
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          notified: true,
          notifiedAt: new Date(),
        },
      });

      logger.debug({ alertId }, 'Alert marked as notified');
    } catch (error) {
      logger.error({ error, alertId }, 'Failed to mark alert as notified');
    }
  }

  /**
   * Dismiss alert
   */
  public async dismissAlert(alertId: string, notes?: string): Promise<void> {
    try {
      const prisma = db.getClient();
      const updateData: {
        dismissed: boolean;
        dismissedAt: Date;
        notes?: string;
      } = {
        dismissed: true,
        dismissedAt: new Date(),
      };
      if (notes !== undefined) {
        updateData.notes = notes;
      }
      await prisma.alert.update({
        where: { id: alertId },
        data: updateData,
      });

      logger.info({ alertId, notes }, 'Alert dismissed');
    } catch (error) {
      logger.error({ error, alertId }, 'Failed to dismiss alert');
    }
  }

  /**
   * Get alert statistics
   */
  public async getAlertStats(): Promise<{
    total: number;
    strongInsider: number;
    highConfidence: number;
    medium: number;
    logOnly: number;
    last24h: number;
  }> {
    try {
      const prisma = db.getClient();

      const [total, strongInsider, highConfidence, medium, logOnly, last24h] =
        await Promise.all([
          prisma.alert.count({ where: { dismissed: false } }),
          prisma.alert.count({
            where: { classification: 'ALERT_STRONG_INSIDER', dismissed: false },
          }),
          prisma.alert.count({
            where: {
              classification: 'ALERT_HIGH_CONFIDENCE',
              dismissed: false,
            },
          }),
          prisma.alert.count({
            where: {
              classification: 'ALERT_MEDIUM_CONFIDENCE',
              dismissed: false,
            },
          }),
          prisma.alert.count({
            where: { classification: 'LOG_ONLY', dismissed: false },
          }),
          prisma.alert.count({
            where: {
              timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              dismissed: false,
            },
          }),
        ]);

      return { total, strongInsider, highConfidence, medium, logOnly, last24h };
    } catch (error) {
      logger.error({ error }, 'Failed to get alert stats');
      return {
        total: 0,
        strongInsider: 0,
        highConfidence: 0,
        medium: 0,
        logOnly: 0,
        last24h: 0,
      };
    }
  }
}

// Export singleton instance
export const alertPersistence = AlertPersistenceService.getInstance();
