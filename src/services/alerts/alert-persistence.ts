import { db, type PrismaClient } from '../database/prisma.js';
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
   * Persist alert to database
   */
  public async createAlert(data: AlertData): Promise<void> {
    try {
      await db.executeTransaction(async (prisma: PrismaClient) => {
        // Create alert record
        await prisma.alert.create({
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
            scoreTradeSize: data.scoreBreakdown.impactContribution, // OI contribution (35% weight)
            scoreDormancy: 0, // Stored in multipliers now
            scoreWalletSuspicion: data.scoreBreakdown.walletContribution, // Wallet contribution (50% weight)
            scoreTiming: data.scoreBreakdown.extremityContribution, // Extremity contribution (15% weight)

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

      // Send notifications to all configured channels
      await notificationCoordinator.sendAlert(data);
    } catch (error) {
      logger.error(
        {
          error,
          tradeId: data.tradeId,
          marketId: data.marketId,
        },
        'Failed to persist alert'
      );
      throw error;
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
