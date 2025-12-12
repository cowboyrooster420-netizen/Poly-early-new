import { Decimal } from '@prisma/client/runtime/library';

import { db } from '../database/prisma.js';
import { signalDetector } from '../signals/signal-detector.js';
import { walletForensicsService } from '../blockchain/wallet-forensics.js';
import { alertScorer } from '../alerts/alert-scorer.js';
import { alertPersistence } from '../alerts/alert-persistence.js';
import { marketService } from './market-service.js';
import { logger } from '../../utils/logger.js';
import type { PolymarketTrade } from '../../types/index.js';

/**
 * Trade service - handles incoming trades and storage
 * Uses a queue to prevent resource exhaustion from concurrent processing
 */
class TradeService {
  private static instance: TradeService | null = null;
  private tradeCount = 0;
  private tradeQueue: PolymarketTrade[] = [];
  private isProcessing = false;
  private readonly MAX_QUEUE_SIZE = 1000;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TradeService {
    if (TradeService.instance === null) {
      TradeService.instance = new TradeService();
    }
    return TradeService.instance;
  }

  /**
   * Queue a trade for processing
   * Trades are processed sequentially to prevent resource exhaustion
   */
  public async processTrade(trade: PolymarketTrade): Promise<void> {
    // Drop trades if queue is full to prevent memory exhaustion
    if (this.tradeQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn(
        { queueSize: this.tradeQueue.length },
        'Trade queue full, dropping trade'
      );
      return;
    }

    this.tradeQueue.push(trade);

    // Start processing if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }
  }

  /**
   * Process trades from the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.tradeQueue.length > 0) {
      const trade = this.tradeQueue.shift();
      if (trade) {
        await this.processTradeInternal(trade);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Internal trade processing logic
   * Stores to database and triggers analysis pipeline
   */
  private async processTradeInternal(trade: PolymarketTrade): Promise<void> {
    try {
      // The trade.marketId from WebSocket is actually the asset_id (CLOB token ID)
      // We need to look up the actual market using this asset ID
      const assetId = trade.marketId;
      const market = marketService.getMarketByAssetId(assetId);

      if (!market) {
        logger.debug(
          { assetId },
          'Ignoring trade for unmonitored market (asset not found)'
        );
        return;
      }

      // Determine outcome based on which token ID matched
      const outcome: 'yes' | 'no' = market.clobTokenIdYes === assetId ? 'yes' : 'no';

      // Create a trade object with the correct market ID for database storage
      const tradeWithMarketId: PolymarketTrade = {
        ...trade,
        marketId: market.id, // Use actual market ID from database
        outcome,
      };

      // Log trade details
      logger.info(
        {
          tradeId: tradeWithMarketId.id,
          marketId: market.id,
          assetId,
          side: tradeWithMarketId.side,
          size: tradeWithMarketId.size,
          price: tradeWithMarketId.price,
          outcome,
          maker: tradeWithMarketId.maker?.substring(0, 8) + '...' || 'unknown',
          taker: tradeWithMarketId.taker?.substring(0, 8) + '...' || 'unknown',
        },
        'Processing trade'
      );

      // Store trade to database
      await this.storeTrade(tradeWithMarketId);

      // Increment counter
      this.tradeCount++;

      // Trigger signal detection pipeline
      await this.detectSignals(tradeWithMarketId);
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Failed to process trade');
      // Don't throw - we don't want one bad trade to kill the stream
    }
  }

  /**
   * Store trade to database
   */
  private async storeTrade(trade: PolymarketTrade): Promise<void> {
    try {
      const prisma = db.getClient();

      await prisma.trade.create({
        data: {
          id: trade.id,
          marketId: trade.marketId,
          side: trade.side,
          size: new Decimal(trade.size),
          price: new Decimal(trade.price),
          outcome: trade.outcome,
          maker: trade.maker,
          taker: trade.taker,
          timestamp: new Date(trade.timestamp),
        },
      });

      logger.debug({ tradeId: trade.id }, 'Trade stored to database');
    } catch (error) {
      // Check if it's a duplicate key error (trade already exists)
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        logger.debug({ tradeId: trade.id }, 'Trade already exists in database');
        return;
      }

      throw error;
    }
  }

  /**
   * Detect insider signals from trade
   */
  private async detectSignals(trade: PolymarketTrade): Promise<void> {
    try {
      // Step 1: Analyze trade for size/impact
      const signal = await signalDetector.analyzeTrade(trade);

      if (signal === null) {
        // Trade doesn't meet size/impact thresholds
        return;
      }

      // Step 2: Check market dormancy
      const dormancy = await signalDetector.checkDormancy(
        trade.marketId,
        trade.timestamp
      );

      if (!dormancy.isDormant) {
        logger.debug(
          { tradeId: trade.id },
          'Market not dormant, skipping signal'
        );
        return;
      }

      logger.info(
        {
          tradeId: trade.id,
          marketId: trade.marketId,
          wallet: trade.taker.substring(0, 10) + '...',
          oiPercentage: signal.oiPercentage.toFixed(2),
          priceImpact: signal.priceImpact.toFixed(2),
          dormantHours: dormancy.hoursSinceLastLargeTrade.toFixed(1),
        },
        '🎯 Potential insider signal detected!'
      );

      // Step 3: Analyze wallet fingerprint
      const walletFingerprint = await walletForensicsService.analyzeWallet(
        trade.taker
      );

      logger.info(
        {
          wallet: trade.taker.substring(0, 10) + '...',
          isSuspicious: walletFingerprint.isSuspicious,
          cexFunded: walletFingerprint.flags.cexFunded,
          lowTxCount: walletFingerprint.flags.lowTxCount,
          youngWallet: walletFingerprint.flags.youngWallet,
          highPolymarketNetflow: walletFingerprint.flags.highPolymarketNetflow,
          singlePurpose: walletFingerprint.flags.singlePurpose,
        },
        '🔍 Wallet fingerprint analyzed'
      );

      // Step 4: Calculate confidence score
      const alertScore = alertScorer.calculateScore({
        tradeSignal: signal,
        dormancy,
        walletFingerprint,
      });

      logger.info(
        {
          tradeId: trade.id,
          totalScore: alertScore.totalScore,
          classification: alertScore.classification,
          recommendation: alertScore.recommendation,
          breakdown: alertScore.breakdown,
        },
        '📊 Alert score calculated'
      );

      // Step 5: Generate alert if score >= threshold
      if (alertScorer.shouldAlert(alertScore)) {
        await alertPersistence.createAlert({
          tradeId: trade.id,
          marketId: trade.marketId,
          walletAddress: trade.taker,
          tradeSize: trade.size,
          tradePrice: trade.price,
          tradeSide: trade.side.toUpperCase() as 'BUY' | 'SELL',
          timestamp: new Date(trade.timestamp),
          confidenceScore: alertScore.totalScore,
          classification: alertScore.classification,
          tradeSignal: signal,
          dormancyMetrics: dormancy,
          walletFingerprint,
          scoreBreakdown: alertScore.breakdown,
        });

        logger.warn(
          {
            tradeId: trade.id,
            marketId: trade.marketId,
            wallet: trade.taker.substring(0, 10) + '...',
            score: alertScore.totalScore,
            classification: alertScore.classification,
          },
          '🚨 HIGH CONFIDENCE INSIDER SIGNAL - ALERT CREATED'
        );
      } else {
        logger.info(
          {
            score: alertScore.totalScore,
            classification: alertScore.classification,
          },
          'Signal detected but below alert threshold - monitoring only'
        );
      }
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Failed to detect signals');
      // Don't throw - signal detection failure shouldn't break trade processing
    }
  }

  /**
   * Get trade statistics
   */
  public async getTradeStats(marketId?: string): Promise<{
    totalTrades: number;
    last24h: number;
    lastHour: number;
    avgSize: string;
  }> {
    try {
      const prisma = db.getClient();

      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      const where = marketId !== undefined ? { marketId } : {};

      const [totalTrades, trades24h, tradesHour, avgSizeResult] =
        await Promise.all([
          prisma.trade.count({ where }),
          prisma.trade.count({
            where: {
              ...where,
              timestamp: { gte: last24h },
            },
          }),
          prisma.trade.count({
            where: {
              ...where,
              timestamp: { gte: lastHour },
            },
          }),
          prisma.trade.aggregate({
            where,
            _avg: {
              size: true,
            },
          }),
        ]);

      return {
        totalTrades,
        last24h: trades24h,
        lastHour: tradesHour,
        avgSize: avgSizeResult._avg.size?.toString() ?? '0',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get trade stats');
      throw error;
    }
  }

  /**
   * Get recent trades for a market
   */
  public async getRecentTrades(
    marketId: string,
    limit = 100
  ): Promise<PolymarketTrade[]> {
    try {
      const prisma = db.getClient();

      const trades = await prisma.trade.findMany({
        where: { marketId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return trades.map(
        (t: {
          id: string;
          marketId: string;
          side: string;
          size: Decimal;
          price: Decimal;
          outcome: string;
          maker: string;
          taker: string;
          timestamp: Date;
        }) => ({
          id: t.id,
          marketId: t.marketId,
          side: t.side as 'buy' | 'sell',
          size: t.size.toString(),
          price: t.price.toString(),
          outcome: t.outcome as 'yes' | 'no',
          maker: t.maker,
          taker: t.taker,
          timestamp: t.timestamp.getTime(),
        })
      );
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to get recent trades');
      throw error;
    }
  }

  /**
   * Get large trades (above threshold)
   */
  public async getLargeTrades(
    marketId: string,
    minSize: number,
    since?: Date
  ): Promise<PolymarketTrade[]> {
    try {
      const prisma = db.getClient();

      const where = {
        marketId,
        size: { gte: new Decimal(minSize) },
        ...(since !== undefined && { timestamp: { gte: since } }),
      };

      const trades = await prisma.trade.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      return trades.map(
        (t: {
          id: string;
          marketId: string;
          side: string;
          size: Decimal;
          price: Decimal;
          outcome: string;
          maker: string;
          taker: string;
          timestamp: Date;
        }) => ({
          id: t.id,
          marketId: t.marketId,
          side: t.side as 'buy' | 'sell',
          size: t.size.toString(),
          price: t.price.toString(),
          outcome: t.outcome as 'yes' | 'no',
          maker: t.maker,
          taker: t.taker,
          timestamp: t.timestamp.getTime(),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get large trades');
      throw error;
    }
  }

  /**
   * Get total trade count processed in-memory
   */
  public getProcessedCount(): number {
    return this.tradeCount;
  }

  /**
   * Reset processed count (for metrics)
   */
  public resetProcessedCount(): void {
    this.tradeCount = 0;
  }
}

// Export singleton instance
export const tradeService = TradeService.getInstance();
