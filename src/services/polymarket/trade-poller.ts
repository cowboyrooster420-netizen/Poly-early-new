import { polymarketDataApi, type DataApiTrade } from './data-api-client.js';
import { tradeService } from './trade-service.js';
import { marketService } from './market-service.js';
import { polymarketSubgraph } from './subgraph-client.js';
import { redis } from '../cache/redis.js';
import { logger } from '../../utils/logger.js';
import type { PolymarketTrade } from '../../types/index.js';

/**
 * Trade polling service - fetches trades from Polymarket Data API
 * This is the primary data source for accurate trade data with user addresses
 * The Data API provides correct size/price (no atomic mint inversion issues)
 */
class TradePollingService {
  private static instance: TradePollingService | null = null;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPollTimestamp: number = Date.now();
  // Redis key prefix for processed trade dedup
  private readonly REDIS_DEDUP_PREFIX = 'trade:dedup:';
  // TTL for dedup keys in Redis (4 hours — long enough to survive multiple poll cycles)
  private readonly DEDUP_TTL_SECONDS = 4 * 60 * 60;
  // In-memory fallback if Redis is unavailable
  private processedTradeIdsFallback = new Map<string, number>();
  private readonly MAX_FALLBACK_IDS = 10000;
  // Poll interval configurable via env var (default 60 seconds to reduce Goldsky load)
  private readonly POLL_INTERVAL_MS =
    Number(process.env['TRADE_POLL_INTERVAL_MS']) || 60000;
  // Pre-queue filter: skip trades below this USD value to reduce queue pressure
  // Set to 0 to disable pre-filtering
  private readonly MIN_TRADE_USD_PREFILTER =
    Number(process.env['MIN_TRADE_USD_PREFILTER']) || 100;
  // Batch processing to avoid API rate limits during wallet analysis
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 2000; // 2 seconds between batches
  // Track last processed trade timestamp to never miss trades
  private lastProcessedTradeTimestamp: number | null = null;
  // Max age for trades - ignore trades older than this to avoid alerting on old trades
  private readonly MAX_TRADE_AGE_MINUTES =
    Number(process.env['MAX_TRADE_AGE_MINUTES']) || 720; // 12 hours
  // Track if this is the first poll (for startup filtering)
  private isFirstPoll = true;
  // Debounce map for priority fetches (conditionId → last fetch timestamp)
  private priorityFetchDebounce = new Map<string, number>();
  // Minimum interval between priority fetches for the same market
  private readonly PRIORITY_FETCH_DEBOUNCE_MS = 15000; // 15 seconds

  private constructor() {
    logger.info(
      {
        pollIntervalMs: this.POLL_INTERVAL_MS,
        minTradeUsdPrefilter: this.MIN_TRADE_USD_PREFILTER,
        maxTradeAgeMinutes: this.MAX_TRADE_AGE_MINUTES,
      },
      `Trade polling service initialized (interval: ${this.POLL_INTERVAL_MS / 1000}s, min trade: $${this.MIN_TRADE_USD_PREFILTER}, max age: ${this.MAX_TRADE_AGE_MINUTES}m)`
    );
  }

  public static getInstance(): TradePollingService {
    if (TradePollingService.instance === null) {
      TradePollingService.instance = new TradePollingService();
    }
    return TradePollingService.instance;
  }

  /**
   * Start polling for trades
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Trade polling service already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting trade polling service');

    // Delay initial poll by 30 seconds to let other services initialize
    // and avoid rate limiting on startup
    const STARTUP_DELAY_MS = 30000;
    logger.info(
      { startupDelayMs: STARTUP_DELAY_MS },
      'Delaying initial trade poll to avoid startup rate limits'
    );

    setTimeout(() => {
      // Do initial poll after delay
      this.safePollTrades();

      // Set up interval
      this.pollInterval = setInterval(() => {
        this.safePollTrades();
      }, this.POLL_INTERVAL_MS);
    }, STARTUP_DELAY_MS);
  }

  /**
   * Safely execute pollTrades with error handling
   * Prevents unhandled promise rejections from crashing the service
   */
  private safePollTrades(): void {
    this.pollTrades().catch((error) => {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          lastPollTimestamp: this.lastPollTimestamp,
          processedTradeCount: this.processedTradeIdsFallback.size,
        },
        '🚨 Trade polling failed unexpectedly - will retry on next interval'
      );
    });
  }

  /**
   * Stop polling for trades
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    logger.info('Stopped trade polling service');
  }

  /**
   * Trigger an immediate fetch for a specific market's trades from the Data API.
   * Called by WebSocket market activity handler for near-real-time detection.
   * Fire-and-forget — errors are logged but never thrown.
   */
  public async triggerMarketFetch(conditionId: string): Promise<void> {
    try {
      // Debounce: skip if we already fetched this market recently
      const now = Date.now();
      const lastFetch = this.priorityFetchDebounce.get(conditionId);
      if (lastFetch && now - lastFetch < this.PRIORITY_FETCH_DEBOUNCE_MS) {
        logger.debug(
          { conditionId, msSinceLastFetch: now - lastFetch },
          'Skipping priority fetch — debounced'
        );
        return;
      }

      // Check backpressure — skip if system is overwhelmed
      const queueStats = tradeService.getQueueStats();
      if (queueStats.isUnderPressure) {
        logger.warn(
          {
            conditionId,
            queuePercentage: queueStats.queuePercentage.toFixed(1),
          },
          'Skipping priority fetch — queue under pressure'
        );
        return;
      }

      const subgraphStatus = polymarketSubgraph.getRateLimiterStatus();
      if (subgraphStatus.isBackingOff) {
        logger.warn(
          { conditionId },
          'Skipping priority fetch — subgraph rate limiter backing off'
        );
        return;
      }

      // Update debounce timestamp before the fetch
      this.priorityFetchDebounce.set(conditionId, now);

      // Fetch recent trades for this single market
      const trades = await polymarketDataApi.getRecentTradesForMarkets(
        [conditionId],
        50,
        this.MIN_TRADE_USD_PREFILTER > 0
          ? this.MIN_TRADE_USD_PREFILTER
          : undefined
      );

      if (trades.length === 0) {
        logger.debug({ conditionId }, 'Priority fetch returned no trades');
        return;
      }

      // Process trades using the same dedup + conversion + processing as pollTrades
      let newTradesCount = 0;
      for (const trade of trades) {
        const tradeKey =
          trade.transactionHash || `${trade.timestamp}-${trade.proxyWallet}`;

        if (await this.isTradeProcessed(tradeKey)) {
          continue;
        }

        // Skip trades older than MAX_TRADE_AGE_MINUTES
        const timestampMs =
          trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000;
        const tradeAgeMs = Date.now() - timestampMs;
        const maxAgeMs = this.MAX_TRADE_AGE_MINUTES * 60 * 1000;

        if (tradeAgeMs > maxAgeMs) {
          await this.markTradeProcessed(tradeKey);
          continue;
        }

        const polyTrade = this.convertDataApiTrade(trade);
        if (!polyTrade) {
          continue;
        }

        logger.info(
          {
            tradeId: polyTrade.id,
            marketId: polyTrade.marketId,
            size: polyTrade.size,
            price: polyTrade.price,
            side: polyTrade.side,
            taker: polyTrade.taker.substring(0, 10) + '...',
          },
          'Priority fetch: sending trade to trade service'
        );
        await tradeService.processTrade(polyTrade);
        newTradesCount++;
        await this.markTradeProcessed(tradeKey);
      }

      if (newTradesCount > 0) {
        logger.info(
          { conditionId, newTradesCount, totalFetched: trades.length },
          'Priority fetch: processed new trades'
        );
      } else {
        logger.debug(
          { conditionId, totalFetched: trades.length },
          'Priority fetch: all trades already processed'
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          conditionId,
        },
        'Priority fetch failed'
      );
    }
  }

  /**
   * Poll for recent trades from Data API
   * Uses the public /trades endpoint which provides accurate trade data
   */
  private async pollTrades(): Promise<void> {
    try {
      // Check for backpressure - skip polling if system is overwhelmed
      const queueStats = tradeService.getQueueStats();
      const subgraphStatus = polymarketSubgraph.getRateLimiterStatus();

      if (queueStats.isUnderPressure) {
        logger.warn(
          {
            queueSize: queueStats.mainQueue,
            queuePercentage: queueStats.queuePercentage.toFixed(1),
            deadLetterSize: queueStats.deadLetterQueue,
          },
          '⏸️ Skipping trade poll - queue under pressure (backpressure active)'
        );
        return;
      }

      if (subgraphStatus.isBackingOff) {
        logger.warn(
          {
            rateLimiterQueueSize: subgraphStatus.queueSize,
          },
          '⏸️ Skipping trade poll - subgraph rate limiter backing off'
        );
        return;
      }

      // Get monitored condition IDs to filter trades
      const conditionIds = marketService.getMonitoredConditionIds();

      if (conditionIds.length === 0) {
        logger.warn('No monitored markets found - skipping trade poll');
        return;
      }

      // Fetch trades from Data API
      // The Data API returns most recent trades, sorted by timestamp desc
      // Note: Data API doesn't support "since" timestamp filter, so we fetch
      // recent trades and filter by our tracked IDs to avoid duplicates
      // Limit per batch - balance between catching recent trades and not fetching too much
      // With 25 batches, 200 per batch = up to 5000 trades total
      const trades = await polymarketDataApi.getRecentTradesForMarkets(
        conditionIds,
        200, // Fetch up to 200 trades per batch of 20 markets
        this.MIN_TRADE_USD_PREFILTER > 0
          ? this.MIN_TRADE_USD_PREFILTER
          : undefined
      );

      if (trades.length === 0) {
        logger.debug('No recent trades found in Data API');
        return;
      }

      logger.info(
        {
          tradeCount: trades.length,
          monitoredConditionCount: conditionIds.length,
          minUsdFilter: this.MIN_TRADE_USD_PREFILTER,
        },
        'Processing trades from Data API'
      );

      // Process trades in batches to avoid API rate limits during wallet analysis
      let newTradesCount = 0;
      const totalBatches = Math.ceil(trades.length / this.BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * this.BATCH_SIZE;
        const batch = trades.slice(batchStart, batchStart + this.BATCH_SIZE);

        logger.debug(
          {
            batch: batchIndex + 1,
            totalBatches,
            batchSize: batch.length,
          },
          'Processing trade batch'
        );

        for (const trade of batch) {
          try {
            // Use transactionHash as unique ID (more reliable than Data API id)
            const tradeKey =
              trade.transactionHash ||
              `${trade.timestamp}-${trade.proxyWallet}`;

            // Skip if already processed (check Redis first, fallback to memory)
            if (await this.isTradeProcessed(tradeKey)) {
              continue;
            }

            // Skip trades older than MAX_TRADE_AGE_MINUTES
            // This prevents alerting on old trades (especially on startup)
            // Timestamp could be in seconds or milliseconds - detect based on magnitude
            const timestampMs =
              trade.timestamp > 1e12 ? trade.timestamp : trade.timestamp * 1000;
            const tradeAgeMs = Date.now() - timestampMs;
            const maxAgeMs = this.MAX_TRADE_AGE_MINUTES * 60 * 1000;

            if (tradeAgeMs > maxAgeMs) {
              logger.info(
                {
                  tradeKey,
                  tradeTimestamp: trade.timestamp,
                  timestampMs,
                  tradeAgeMinutes: Math.round(tradeAgeMs / 60000),
                  maxAgeMinutes: this.MAX_TRADE_AGE_MINUTES,
                  tradeDate: new Date(timestampMs).toISOString(),
                },
                '⏭️ Skipping old trade (older than max age)'
              );
              // Mark as processed so we don't see it again
              await this.markTradeProcessed(tradeKey);
              continue;
            }

            // Convert Data API trade to our format
            const polyTrade = this.convertDataApiTrade(trade);
            if (!polyTrade) {
              // Conversion failed (unmonitored market, bad price, invalid outcome)
              // Do NOT mark as processed — market may be added later or data may improve
              continue;
            }

            // USD value is already filtered by Data API if MIN_TRADE_USD_PREFILTER > 0
            const tradeUsdValue = trade.size * trade.price;

            logger.info(
              {
                tradeId: polyTrade.id,
                marketId: polyTrade.marketId,
                size: polyTrade.size,
                price: polyTrade.price,
                tradeUsdValue: tradeUsdValue.toFixed(2),
                side: polyTrade.side,
                outcome: polyTrade.outcome,
                taker: polyTrade.taker.substring(0, 10) + '...',
              },
              '📤 Sending trade to trade service (from Data API)'
            );
            await tradeService.processTrade(polyTrade);
            newTradesCount++;
            logger.info(
              { tradeId: polyTrade.id },
              '✅ Trade sent to service successfully'
            );

            // Only mark as processed after successful processing
            await this.markTradeProcessed(tradeKey);
          } catch (tradeError) {
            logger.error(
              {
                error:
                  tradeError instanceof Error
                    ? tradeError.message
                    : String(tradeError),
                transactionHash: trade.transactionHash,
                conditionId: trade.conditionId,
                timestamp: trade.timestamp,
              },
              'Failed to process individual trade from Data API'
            );
            // Continue processing other trades even if one fails
            continue;
          }
        }

        // Wait between batches to let rate limiter recover (skip delay after last batch)
        if (batchIndex < totalBatches - 1) {
          // Adaptive delay: increase if subgraph is under pressure
          const subgraphPressure = polymarketSubgraph.getRateLimiterStatus();
          const adaptiveDelay = subgraphPressure.isBackingOff
            ? this.BATCH_DELAY_MS * 3 // Triple delay when backing off
            : subgraphPressure.queueSize > 5
              ? this.BATCH_DELAY_MS * 2 // Double delay when queue building
              : this.BATCH_DELAY_MS;

          logger.debug(
            {
              delayMs: adaptiveDelay,
              subgraphQueueSize: subgraphPressure.queueSize,
            },
            'Waiting between batches to avoid rate limits'
          );
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));
        }

        // Clean up fallback memory map if used
        this.cleanupFallbackIds();
      }

      if (newTradesCount > 0) {
        logger.info({ newTradesCount }, 'Processed new trades from Data API');
      }

      // Update last processed timestamp to the newest trade's timestamp
      // Trades are sorted descending, so first trade is newest
      if (trades.length > 0 && trades[0]) {
        const newestTimestamp = trades[0].timestamp;
        if (newestTimestamp > 0) {
          this.lastProcessedTradeTimestamp = newestTimestamp;
          logger.debug(
            { lastProcessedTradeTimestamp: this.lastProcessedTradeTimestamp },
            'Updated last processed trade timestamp'
          );
        }
      }

      this.lastPollTimestamp = Date.now();

      // After first poll, disable startup filtering
      if (this.isFirstPoll) {
        logger.info(
          { maxTradeAgeMinutes: this.MAX_TRADE_AGE_MINUTES },
          '✅ First poll complete - startup filtering disabled for subsequent polls'
        );
        this.isFirstPoll = false;
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to poll trades from Data API - top level error'
      );
    }
  }

  /**
   * Check if a trade has already been processed (Redis with in-memory fallback)
   */
  private async isTradeProcessed(tradeKey: string): Promise<boolean> {
    try {
      const exists = await redis.exists(
        `${this.REDIS_DEDUP_PREFIX}${tradeKey}`
      );
      return exists;
    } catch {
      // Redis unavailable — fall back to in-memory map
      return this.processedTradeIdsFallback.has(tradeKey);
    }
  }

  /**
   * Mark a trade as processed in Redis (with TTL) and in-memory fallback
   */
  private async markTradeProcessed(tradeKey: string): Promise<void> {
    // Always write to fallback map (cheap insurance)
    this.processedTradeIdsFallback.set(tradeKey, Date.now());

    try {
      await redis.set(
        `${this.REDIS_DEDUP_PREFIX}${tradeKey}`,
        '1',
        this.DEDUP_TTL_SECONDS
      );
    } catch {
      // Redis unavailable — already in fallback map, continue
    }
  }

  /**
   * Clean up in-memory fallback map (only used when Redis is down)
   */
  private cleanupFallbackIds(): void {
    if (this.processedTradeIdsFallback.size <= this.MAX_FALLBACK_IDS) {
      return;
    }

    // Remove oldest entries until at half capacity
    const entries = Array.from(this.processedTradeIdsFallback.entries()).sort(
      (a, b) => a[1] - b[1]
    );
    const targetSize = Math.floor(this.MAX_FALLBACK_IDS / 2);
    const toRemove = entries.slice(0, entries.length - targetSize);

    for (const [id] of toRemove) {
      this.processedTradeIdsFallback.delete(id);
    }

    logger.debug(
      {
        removed: toRemove.length,
        remaining: this.processedTradeIdsFallback.size,
      },
      'Cleaned up fallback processed trade IDs'
    );
  }

  /**
   * Convert Data API trade to PolymarketTrade format
   * Data API provides accurate trade data - no atomic mint issues
   */
  private convertDataApiTrade(trade: DataApiTrade): PolymarketTrade | null {
    // Find market by condition ID
    const market = marketService.getMarketByConditionId(trade.conditionId);

    if (!market) {
      logger.warn(
        {
          conditionId: trade.conditionId,
          transactionHash: trade.transactionHash,
        },
        'Trade conditionId not in monitored markets - skipping'
      );
      return null;
    }

    // Validate price is in valid range (0-1)
    if (trade.price < 0 || trade.price > 1) {
      logger.error(
        {
          price: trade.price,
          conditionId: trade.conditionId,
          transactionHash: trade.transactionHash,
        },
        'PRICE SANITY CHECK FAILED: Price outside 0-1 range'
      );
      return null;
    }

    // Normalize outcome to lowercase 'yes' | 'no'
    const outcome = trade.outcome.toLowerCase() as 'yes' | 'no';
    if (outcome !== 'yes' && outcome !== 'no') {
      logger.warn(
        {
          outcome: trade.outcome,
          conditionId: trade.conditionId,
        },
        'Invalid outcome value - skipping'
      );
      return null;
    }

    // Data API uses proxyWallet which is the actual taker
    const takerAddress = trade.proxyWallet;

    const polyTrade: PolymarketTrade = {
      id: `dataapi-${trade.transactionHash}`,
      marketId: market.id,
      side: trade.side.toLowerCase() as 'buy' | 'sell',
      size: trade.size.toString(),
      price: trade.price.toFixed(4),
      timestamp: trade.timestamp * 1000, // Convert to milliseconds
      maker: '', // Data API doesn't provide maker address
      taker: takerAddress,
      outcome,
      source: 'subgraph', // Keep as 'subgraph' for compatibility (triggers alerts)
    };

    // Log trade conversion for debugging
    logger.debug(
      {
        tradeId: polyTrade.id,
        marketId: market.id,
        side: polyTrade.side,
        outcome: polyTrade.outcome,
        size: trade.size,
        price: trade.price,
        usdValue: (trade.size * trade.price).toFixed(2),
        taker: takerAddress.substring(0, 10) + '...',
        txHash: trade.transactionHash.substring(0, 16) + '...',
      },
      'Converted Data API trade'
    );

    return polyTrade;
  }

  /**
   * Get polling status
   */
  public getStatus(): {
    isRunning: boolean;
    lastPollTimestamp: number;
    processedTradesCount: number;
  } {
    return {
      isRunning: this.isRunning,
      lastPollTimestamp: this.lastPollTimestamp,
      processedTradesCount: this.processedTradeIdsFallback.size,
    };
  }
}

// Export singleton instance
export const tradePoller = TradePollingService.getInstance();
