import { polymarketDataApi, type DataApiTrade } from './data-api-client.js';
import { tradeService } from './trade-service.js';
import { marketService } from './market-service.js';
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
  // Map of trade ID -> timestamp when processed (for proper time-based cleanup)
  private processedTradeIds = new Map<string, number>();
  // Poll interval configurable via env var (default 60 seconds to reduce Goldsky load)
  private readonly POLL_INTERVAL_MS =
    Number(process.env['TRADE_POLL_INTERVAL_MS']) || 60000;
  private readonly MAX_PROCESSED_IDS = 10000; // Prevent memory leak
  private readonly PROCESSED_ID_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL for processed IDs
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
          processedTradeCount: this.processedTradeIds.size,
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
   * Poll for recent trades from Data API
   * Uses the public /trades endpoint which provides accurate trade data
   */
  private async pollTrades(): Promise<void> {
    try {
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

            // Skip if already processed
            if (this.processedTradeIds.has(tradeKey)) {
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
              this.processedTradeIds.set(tradeKey, Date.now());
              continue;
            }

            // Convert Data API trade to our format
            const polyTrade = this.convertDataApiTrade(trade);
            if (polyTrade) {
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
            }

            // Mark as processed with current timestamp
            this.processedTradeIds.set(tradeKey, Date.now());
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
          logger.debug(
            { delayMs: this.BATCH_DELAY_MS },
            'Waiting between batches to avoid rate limits'
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.BATCH_DELAY_MS)
          );
        }

        // Clean up old IDs to prevent memory leak (time-based + size-based)
        this.cleanupProcessedIds();
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
   * Clean up old processed trade IDs to prevent memory leak
   * Uses both time-based (TTL) and size-based cleanup for robustness
   */
  private cleanupProcessedIds(): void {
    const now = Date.now();
    const sizeBefore = this.processedTradeIds.size;
    let expiredCount = 0;

    // First pass: remove expired entries (older than TTL)
    for (const [id, timestamp] of this.processedTradeIds) {
      if (now - timestamp > this.PROCESSED_ID_TTL_MS) {
        this.processedTradeIds.delete(id);
        expiredCount++;
      }
    }

    // Second pass: if still over limit, remove oldest entries
    if (this.processedTradeIds.size > this.MAX_PROCESSED_IDS) {
      // Convert to array sorted by timestamp (oldest first)
      const entries = Array.from(this.processedTradeIds.entries()).sort(
        (a, b) => a[1] - b[1]
      );

      // Remove oldest entries until we're at half capacity
      const targetSize = Math.floor(this.MAX_PROCESSED_IDS / 2);
      const toRemove = entries.slice(0, entries.length - targetSize);

      for (const [id] of toRemove) {
        this.processedTradeIds.delete(id);
      }

      logger.info(
        {
          sizeBefore,
          sizeAfter: this.processedTradeIds.size,
          expiredRemoved: expiredCount,
          overflowRemoved: toRemove.length,
        },
        'Cleaned up processed trade IDs (size overflow)'
      );
    } else if (expiredCount > 0) {
      logger.debug(
        {
          sizeBefore,
          sizeAfter: this.processedTradeIds.size,
          expiredRemoved: expiredCount,
        },
        'Cleaned up expired processed trade IDs'
      );
    }
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
      processedTradesCount: this.processedTradeIds.size,
    };
  }
}

// Export singleton instance
export const tradePoller = TradePollingService.getInstance();
