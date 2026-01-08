import { Decimal } from '@prisma/client/runtime/library';

import { db } from '../database/prisma.js';
import { signalDetector } from '../signals/signal-detector.js';
import { walletForensicsService } from '../blockchain/wallet-forensics.js';
import { polymarketSubgraph } from './subgraph-client.js';
import { alertScorer } from '../alerts/alert-scorer.js';
import { alertPersistence } from '../alerts/alert-persistence.js';
import { marketService } from './market-service.js';
import { redis } from '../cache/redis.js';
import { logger } from '../../utils/logger.js';
import { DecisionFramework } from '../data/decision-framework.js';
import type { PolymarketTrade } from '../../types/index.js';

interface QueuedTrade {
  trade: PolymarketTrade;
  attempts: number;
  lastError?: Error;
}

/**
 * Trade service - handles incoming trades and storage
 * Uses a queue to prevent resource exhaustion from concurrent processing
 */
class TradeService {
  private static instance: TradeService | null = null;
  private tradeCount = 0;
  private tradeQueue: QueuedTrade[] = [];
  private deadLetterQueue: QueuedTrade[] = [];
  private isProcessing = false;
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 1000; // Initial delay, exponentially increases

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
    logger.info(
      {
        tradeId: trade.id,
        queueSize: this.tradeQueue.length,
        isProcessing: this.isProcessing,
      },
      '📨 Trade service received trade'
    );
    // Drop trades if queue is full to prevent memory exhaustion
    if (this.tradeQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn(
        {
          queueSize: this.tradeQueue.length,
          tradeId: trade.id,
          deadLetterSize: this.deadLetterQueue.length,
        },
        'Trade queue full, dropping trade'
      );
      return;
    }

    this.tradeQueue.push({
      trade,
      attempts: 0,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }
  }

  /**
   * Process trades from the queue sequentially with retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.tradeQueue.length > 0) {
      const queuedTrade = this.tradeQueue.shift();
      if (queuedTrade) {
        try {
          await this.processTradeInternal(queuedTrade.trade);

          // Log recovery if this was a retry
          if (queuedTrade.attempts > 0) {
            logger.info(
              {
                tradeId: queuedTrade.trade.id,
                attempts: queuedTrade.attempts,
              },
              '✅ Trade processed successfully after retry'
            );
          }
        } catch (error) {
          await this.handleProcessingError(queuedTrade, error);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Handle processing errors with exponential backoff retry
   */
  private async handleProcessingError(
    queuedTrade: QueuedTrade,
    error: unknown
  ): Promise<void> {
    queuedTrade.attempts++;
    queuedTrade.lastError =
      error instanceof Error ? error : new Error(String(error));

    if (queuedTrade.attempts < this.MAX_RETRY_ATTEMPTS) {
      // Calculate exponential backoff delay
      const delay = this.RETRY_DELAY_MS * Math.pow(2, queuedTrade.attempts - 1);

      logger.warn(
        {
          tradeId: queuedTrade.trade.id,
          attempts: queuedTrade.attempts,
          maxAttempts: this.MAX_RETRY_ATTEMPTS,
          retryInMs: delay,
          error: queuedTrade.lastError.message,
        },
        `⚠️ Trade processing failed, will retry (${queuedTrade.attempts}/${this.MAX_RETRY_ATTEMPTS})`
      );

      // Re-queue with delay
      setTimeout(() => {
        if (this.tradeQueue.length < this.MAX_QUEUE_SIZE) {
          this.tradeQueue.push(queuedTrade);
          if (!this.isProcessing) {
            void this.processQueue();
          }
        } else {
          // Queue still full, move to dead letter queue
          this.moveToDeadLetterQueue(queuedTrade);
        }
      }, delay);
    } else {
      // Max retries exceeded, move to dead letter queue
      this.moveToDeadLetterQueue(queuedTrade);
    }
  }

  /**
   * Move failed trade to dead letter queue
   */
  private moveToDeadLetterQueue(queuedTrade: QueuedTrade): void {
    this.deadLetterQueue.push(queuedTrade);

    logger.error(
      {
        tradeId: queuedTrade.trade.id,
        attempts: queuedTrade.attempts,
        deadLetterSize: this.deadLetterQueue.length,
        error: queuedTrade.lastError?.message,
        stack: queuedTrade.lastError?.stack,
      },
      '❌ Trade moved to dead letter queue after max retries'
    );

    // Alert if dead letter queue is getting large
    if (
      this.deadLetterQueue.length > 100 &&
      this.deadLetterQueue.length % 10 === 0
    ) {
      logger.error(
        { deadLetterSize: this.deadLetterQueue.length },
        '🚨 CRITICAL: Dead letter queue growing large!'
      );
    }
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
      const outcome: 'yes' | 'no' =
        market.clobTokenIdYes === assetId ? 'yes' : 'no';

      // Resolve taker address - WebSocket gives us proxy addresses, we need actual user addresses
      let taker = trade.taker;
      if (taker) {
        try {
          // Resolve proxy wallet to actual signer (user) address
          const signerAddress =
            await polymarketSubgraph.getSignerFromProxy(taker);
          if (signerAddress) {
            logger.debug(
              {
                proxy: taker.substring(0, 10) + '...',
                signer: signerAddress.substring(0, 10) + '...',
              },
              'Resolved proxy wallet to signer address'
            );
            taker = signerAddress;
          } else {
            // If no mapping found, this might be a direct EOA trade (rare)
            logger.debug(
              { proxyAddress: taker },
              'No signer mapping found for address - using as-is'
            );
          }
        } catch (error) {
          // Use decision framework for explicit error handling
          const decision = DecisionFramework.handleProxyResolutionError(error, {
            proxyAddress: taker,
            tradeId: trade.id,
            marketId: market.id,
          });

          await DecisionFramework.executeDecision(decision, {
            onSkip: () => {
              // Skip this trade entirely
              return;
            },
            onProceed: () => {
              // Continue with original address
              // taker remains unchanged
            },
          });

          // If decision was to skip, return early
          if (decision.action === 'skip') {
            return;
          }

          // Alert on high failure rate
          if (
            decision.severity === 'error' ||
            decision.severity === 'critical'
          ) {
            const recentFailures = await redis.increment(
              `proxy:failures:${(Date.now() / 60000) | 0}`
            );
            if (recentFailures === 1) {
              await redis.expire(
                `proxy:failures:${(Date.now() / 60000) | 0}`,
                300
              ); // 5 min TTL
            }

            if (recentFailures > 10) {
              logger.error(
                { recentFailures, minuteWindow: (Date.now() / 60000) | 0 },
                '🚨 HIGH PROXY RESOLUTION FAILURE RATE - CHECK WALLET SUBGRAPH HEALTH'
              );
            }
          }
        }
      } else {
        logger.warn(
          { tradeId: trade.id },
          'Trade missing taker address - skipping'
        );
        return;
      }

      // Create a trade object with the correct market ID for database storage
      const tradeWithMarketId: PolymarketTrade = {
        ...trade,
        marketId: market.id, // Use actual market ID from database
        outcome,
        taker, // Use looked-up taker if original was empty
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
          maker: tradeWithMarketId.maker.substring(0, 8) + '...' || 'unknown',
          taker: tradeWithMarketId.taker.substring(0, 8) + '...' || 'unknown',
        },
        'Processing trade'
      );

      // Store trade to database
      logger.debug(
        { tradeId: tradeWithMarketId.id },
        'Storing trade to database'
      );
      await this.storeTrade(tradeWithMarketId);
      logger.debug(
        { tradeId: tradeWithMarketId.id },
        'Trade stored successfully'
      );

      // Increment counter
      this.tradeCount++;

      // Trigger signal detection pipeline
      logger.debug(
        { tradeId: tradeWithMarketId.id },
        'Starting signal detection pipeline'
      );
      await this.detectSignals(tradeWithMarketId, market.question, market.slug);
      logger.debug(
        { tradeId: tradeWithMarketId.id },
        'Signal detection completed'
      );
    } catch (error) {
      // Log the error with context
      logger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          tradeId: trade.id,
          marketId: trade.marketId,
          assetId: trade.marketId,
          taker: trade.taker,
          maker: trade.maker,
        },
        'Failed to process trade'
      );
      // Re-throw to trigger retry logic
      throw error;
    }
  }

  /**
   * Store trade to database
   */
  private async storeTrade(trade: PolymarketTrade): Promise<void> {
    try {
      const prisma = db.getClient();

      // Use upsert to silently handle duplicates without throwing
      await prisma.trade.upsert({
        where: { id: trade.id },
        create: {
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
        update: {}, // No-op if already exists
      });

      logger.debug({ tradeId: trade.id }, 'Trade stored to database');
    } catch (error) {
      logger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          tradeId: trade.id,
          marketId: trade.marketId,
        },
        'Failed to store trade'
      );
      throw error; // Re-throw to trigger main error handler
    }
  }

  /**
   * Detect insider signals from trade
   */
  private async detectSignals(
    trade: PolymarketTrade,
    marketQuestion: string,
    marketSlug: string
  ): Promise<void> {
    try {
      // Always update last trade timestamp for dormancy tracking
      await alertScorer.updateLastTradeTimestamp(
        trade.marketId,
        trade.timestamp
      );

      // Step 1: Analyze trade for size/impact
      const signal = await signalDetector.analyzeTrade(trade);

      if (signal === null) {
        // Trade doesn't meet size/impact thresholds
        logger.debug(
          {
            tradeId: trade.id,
            marketId: trade.marketId,
            size: trade.size,
            price: trade.price,
            reason: 'Trade below size/impact thresholds',
          },
          '🚫 Trade filtered out - no signal detected'
        );
        return;
      }

      logger.info(
        {
          tradeId: trade.id,
          marketId: trade.marketId,
          wallet: trade.taker.substring(0, 10) + '...',
          tradeUsdValue: signal.tradeUsdValue.toFixed(2),
          oiPercentage: signal.oiPercentage.toFixed(2),
          priceImpact: signal.priceImpact.toFixed(2),
        },
        '🎯 Trade detected - analyzing wallet'
      );

      // Step 2: Analyze wallet fingerprint via subgraph (now the only method)
      const walletFingerprint = await walletForensicsService.analyzeWallet(
        trade.taker,
        {
          tradeSizeUSD: signal.tradeUsdValue,
          marketOI: parseFloat(signal.openInterest),
        }
      );

      // Check fingerprint status using decision framework
      if (walletFingerprint.status === 'error') {
        const decision = DecisionFramework.handleWalletAnalysisError(
          new Error(
            walletFingerprint.errorReason || 'Unknown wallet analysis error'
          ),
          {
            address: trade.taker,
            tradeId: trade.id,
            dataSource: 'both', // Both subgraph and data API failed
          }
        );

        await DecisionFramework.executeDecision(decision, {
          onSkip: async () => {
            await signalDetector.incrementStat('filtered_fingerprint_error');
          },
        });

        // For wallet analysis errors, we always skip
        return;
      }

      if (walletFingerprint.status === 'partial') {
        // Log partial data warning but proceed
        const decision = DecisionFramework.handleWalletAnalysisError(
          new Error('Partial wallet data'),
          {
            address: trade.taker,
            tradeId: trade.id,
            dataSource: walletFingerprint.dataCompleteness.subgraph
              ? 'data-api'
              : 'subgraph',
          }
        );

        await DecisionFramework.executeDecision(decision, {
          onProceed: () => {
            // Continue with partial data
          },
        });
      }

      logger.info(
        {
          wallet: trade.taker.substring(0, 10) + '...',
          status: walletFingerprint.status,
          isSuspicious: walletFingerprint.isSuspicious,
          confidenceLevel: walletFingerprint.confidenceLevel,
          dataSource: walletFingerprint.subgraphMetadata.dataSource,
          subgraphFlags: walletFingerprint.subgraphFlags,
          tradeCount: walletFingerprint.subgraphMetadata.polymarketTradeCount,
          volumeUSD:
            walletFingerprint.subgraphMetadata.polymarketVolumeUSD.toFixed(2),
        },
        '🔍 Wallet fingerprint analyzed'
      );

      // Step 3: Calculate confidence score (v2 - tiered with multipliers)
      const entryProbability = parseFloat(trade.price); // Price is the probability
      const alertScore = await alertScorer.calculateScore({
        tradeSignal: signal,
        walletFingerprint,
        entryProbability,
      });

      // Check if filtered out by hard filters
      if (!alertScore.filtersPassed) {
        logger.debug(
          {
            tradeId: trade.id,
            reason: alertScore.filterReason,
          },
          'Trade filtered out by hard filters'
        );
        return;
      }

      logger.info(
        {
          tradeId: trade.id,
          totalScore: alertScore.totalScore,
          classification: alertScore.classification,
          breakdown: alertScore.breakdown,
          multipliers: alertScore.multipliers,
        },
        '📊 Alert score calculated (v2)'
      );

      // Step 4: Generate alert if score >= threshold
      if (alertScorer.shouldAlert(alertScore)) {
        await alertPersistence.createAlert({
          tradeId: trade.id,
          marketId: trade.marketId,
          marketQuestion,
          marketSlug,
          walletAddress: trade.taker,
          tradeSize: trade.size,
          tradePrice: trade.price,
          tradeSide: trade.side.toUpperCase() as 'BUY' | 'SELL',
          timestamp: new Date(trade.timestamp),
          confidenceScore: alertScore.totalScore,
          classification: alertScore.classification,
          tradeSignal: signal,
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
          '🚨 INSIDER SIGNAL DETECTED - ALERT CREATED'
        );
      } else if (alertScorer.shouldLog(alertScore)) {
        logger.info(
          {
            tradeId: trade.id,
            score: alertScore.totalScore,
            classification: alertScore.classification,
          },
          '📝 Signal logged (below alert threshold)'
        );
      }
    } catch (error) {
      logger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          tradeId: trade.id,
          marketId: trade.marketId,
          taker: trade.taker,
        },
        'Failed to detect signals'
      );
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

  /**
   * Get queue statistics
   */
  public getQueueStats(): {
    mainQueue: number;
    deadLetterQueue: number;
    isProcessing: boolean;
    totalProcessed: number;
  } {
    return {
      mainQueue: this.tradeQueue.length,
      deadLetterQueue: this.deadLetterQueue.length,
      isProcessing: this.isProcessing,
      totalProcessed: this.tradeCount,
    };
  }

  /**
   * Retry all trades from dead letter queue
   */
  public async retryDeadLetterQueue(): Promise<number> {
    const count = this.deadLetterQueue.length;
    if (count === 0) return 0;

    logger.info({ count }, '🔄 Retrying all trades from dead letter queue');

    // Move all dead letter trades back to main queue with reset attempts
    while (this.deadLetterQueue.length > 0) {
      const queuedTrade = this.deadLetterQueue.shift();
      if (queuedTrade) {
        queuedTrade.attempts = 0; // Reset attempts
        this.tradeQueue.push(queuedTrade);
      }
    }

    // Start processing if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }

    return count;
  }

  /**
   * Clear dead letter queue (use with caution!)
   */
  public clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    logger.warn({ count }, '🗑️ Dead letter queue cleared');
    return count;
  }
}

// Export singleton instance
export const tradeService = TradeService.getInstance();
