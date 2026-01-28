import { polymarketSubgraph } from './subgraph-client.js';
import { tradeService } from './trade-service.js';
import { marketService } from './market-service.js';
import { logger } from '../../utils/logger.js';
import { usdcToUsd } from '../../utils/decimals.js';
import type { PolymarketTrade } from '../../types/index.js';

/**
 * Trade polling service - fetches trades from orderbook subgraph
 * This is an alternative data source to WebSocket for getting trades with user addresses
 */
class TradePollingService {
  private static instance: TradePollingService | null = null;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPollTimestamp: number = Date.now();
  private processedTradeIds = new Set<string>();
  // Poll interval configurable via env var (default 60 seconds to reduce Goldsky load)
  private readonly POLL_INTERVAL_MS =
    Number(process.env['TRADE_POLL_INTERVAL_MS']) || 60000;
  private readonly MAX_PROCESSED_IDS = 10000; // Prevent memory leak
  // Batch processing to avoid API rate limits during wallet analysis
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 2000; // 2 seconds between batches
  // Track last processed trade timestamp to never miss trades
  private lastProcessedTradeTimestamp: number | null = null;

  private constructor() {
    logger.info(
      { pollIntervalMs: this.POLL_INTERVAL_MS },
      `Trade polling service initialized (interval: ${this.POLL_INTERVAL_MS / 1000}s)`
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

    // Do initial poll
    void this.pollTrades();

    // Set up interval
    this.pollInterval = setInterval(() => {
      void this.pollTrades();
    }, this.POLL_INTERVAL_MS);
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
   * Poll for recent trades from subgraph
   */
  private async pollTrades(): Promise<void> {
    try {
      // Get monitored asset IDs to filter trades
      const assetIds = marketService.getMonitoredAssetIds();

      if (assetIds.length === 0) {
        logger.warn('No monitored assets found - skipping trade poll');
        return;
      }

      // Determine the "since" timestamp
      // On first poll: bootstrap from last 2 minutes
      // On subsequent polls: use last processed timestamp to never miss trades
      const sinceTimestamp = this.lastProcessedTradeTimestamp
        ? this.lastProcessedTradeTimestamp
        : Math.floor(Date.now() / 1000) - 120; // Bootstrap: last 2 minutes

      // Fetch all trades since last processed timestamp
      const trades = await polymarketSubgraph.getRecentTrades(
        sinceTimestamp,
        1000,
        assetIds
      );

      if (trades.length === 0) {
        logger.debug('No recent trades found in subgraph');
        return;
      }

      const monitoredAssetIds = marketService.getMonitoredAssetIds();
      logger.info(
        {
          tradeCount: trades.length,
          monitoredAssetCount: monitoredAssetIds.length,
          sinceTimestamp,
          isBootstrap: !this.lastProcessedTradeTimestamp,
        },
        'Processing trades from subgraph'
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
            // Skip if already processed
            if (this.processedTradeIds.has(trade.id)) {
              continue;
            }

            // Convert subgraph trade to our format
            const polyTrade = await this.convertToPolymarketTrade(trade);
            if (polyTrade) {
              logger.info(
                {
                  tradeId: polyTrade.id,
                  marketId: polyTrade.marketId,
                  size: polyTrade.size,
                  taker: polyTrade.taker.substring(0, 10) + '...',
                },
                '📤 Sending trade to trade service'
              );
              await tradeService.processTrade(polyTrade);
              newTradesCount++;
              logger.info(
                { tradeId: polyTrade.id },
                '✅ Trade sent to service successfully'
              );
            }

            // Mark as processed
            this.processedTradeIds.add(trade.id);
          } catch (tradeError) {
            logger.error(
              {
                error:
                  tradeError instanceof Error
                    ? tradeError.message
                    : String(tradeError),
                tradeId: trade.id,
                makerAssetId: trade.makerAssetId,
                takerAssetId: trade.takerAssetId,
                timestamp: trade.timestamp,
              },
              'Failed to process individual trade from subgraph'
            );
            // Continue processing other trades even if one fails
            continue;
          }

          // Clean up old IDs to prevent memory leak
          if (this.processedTradeIds.size > this.MAX_PROCESSED_IDS) {
            const idsArray = Array.from(this.processedTradeIds);
            const toRemove = idsArray.slice(
              0,
              idsArray.length - this.MAX_PROCESSED_IDS / 2
            );
            for (const id of toRemove) {
              this.processedTradeIds.delete(id);
            }
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
      }

      if (newTradesCount > 0) {
        logger.info({ newTradesCount }, 'Processed new trades from subgraph');
      }

      // Update last processed timestamp to the newest trade's timestamp
      // Trades are sorted descending, so first trade is newest
      if (trades.length > 0 && trades[0]) {
        const newestTimestamp = parseInt(trades[0].timestamp);
        if (!isNaN(newestTimestamp)) {
          this.lastProcessedTradeTimestamp = newestTimestamp;
          logger.debug(
            { lastProcessedTradeTimestamp: this.lastProcessedTradeTimestamp },
            'Updated last processed trade timestamp'
          );
        }
      }

      this.lastPollTimestamp = Date.now();
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to poll trades from subgraph - top level error'
      );
    }
  }

  /**
   * Convert subgraph trade to PolymarketTrade format
   */
  private async convertToPolymarketTrade(subgraphTrade: {
    id: string;
    timestamp: string;
    maker: string;
    taker: string;
    makerAssetId: string;
    takerAssetId: string;
    makerAmountFilled: string;
    takerAmountFilled: string;
    fee: string;
  }): Promise<PolymarketTrade | null> {
    // Need to determine which asset was bought/sold
    // In CLOB, one side has USDC (collateral), other has outcome token
    const makerAsset = subgraphTrade.makerAssetId;
    const takerAsset = subgraphTrade.takerAssetId;

    // One asset must be USDC ("0") and the other must be a monitored asset
    const isUSDCTrade = makerAsset === '0' || takerAsset === '0';
    if (!isUSDCTrade) {
      logger.debug(
        {
          makerAssetId: makerAsset,
          takerAssetId: takerAsset,
        },
        'Trade does not involve USDC - skipping'
      );
      return null;
    }

    // Find market by the non-USDC asset
    const nonUSDCAsset = makerAsset === '0' ? takerAsset : makerAsset;
    const market = marketService.getMarketByAssetId(nonUSDCAsset);

    if (!market) {
      logger.warn(
        {
          makerAssetId: makerAsset,
          takerAssetId: takerAsset,
          nonUSDCAsset,
          tradeId: subgraphTrade.id,
        },
        'Non-USDC asset not in monitored markets - trade skipped'
      );
      return null;
    }

    // Determine which side has USDC vs outcome tokens
    // makerAssetId = what the maker is providing
    // takerAssetId = what the taker is providing
    const makerProvidesUSDC = makerAsset === '0';
    const takerProvidesUSDC = takerAsset === '0';

    // Calculate amounts based on asset types (more explicit than before)
    // USDC amount comes from whoever is providing USDC
    // Outcome amount comes from whoever is providing the token
    const usdcAmount = makerProvidesUSDC
      ? usdcToUsd(subgraphTrade.makerAmountFilled)
      : usdcToUsd(subgraphTrade.takerAmountFilled);

    const outcomeAmount = makerProvidesUSDC
      ? usdcToUsd(subgraphTrade.takerAmountFilled)
      : usdcToUsd(subgraphTrade.makerAmountFilled);

    // Determine trade direction from taker's perspective
    // If taker provides USDC, they are BUYING tokens
    // If taker provides tokens, they are SELLING tokens
    const side: 'buy' | 'sell' = takerProvidesUSDC ? 'buy' : 'sell';

    // The outcome asset is the non-USDC asset
    const outcomeAssetId = nonUSDCAsset;
    const outcome: 'yes' | 'no' =
      market.clobTokenIdYes === outcomeAssetId ? 'yes' : 'no';

    // Validate amounts
    if (outcomeAmount <= 0 || usdcAmount < 0) {
      logger.warn(
        {
          tradeId: subgraphTrade.id,
          outcomeAmount,
          usdcAmount,
          makerAmountFilled: subgraphTrade.makerAmountFilled,
          takerAmountFilled: subgraphTrade.takerAmountFilled,
          makerProvidesUSDC,
          takerProvidesUSDC,
        },
        'Invalid trade amounts detected'
      );
      return null;
    }

    // Price is USDC per outcome token
    const price = usdcAmount / outcomeAmount;

    // Sanity check: price should be between 0 and 1 (it's a probability)
    if (price < 0 || price > 1) {
      logger.error(
        {
          tradeId: subgraphTrade.id,
          price,
          usdcAmount,
          outcomeAmount,
          makerAssetId: makerAsset,
          takerAssetId: takerAsset,
          makerAmountFilled: subgraphTrade.makerAmountFilled,
          takerAmountFilled: subgraphTrade.takerAmountFilled,
          makerProvidesUSDC,
          takerProvidesUSDC,
        },
        'PRICE SANITY CHECK FAILED: Price outside 0-1 range - possible amount inversion bug'
      );
      return null;
    }

    // Orderbook subgraph already provides actual user addresses (not proxy addresses)
    const takerAddress = subgraphTrade.taker;

    const polyTrade: PolymarketTrade = {
      id: `subgraph-${subgraphTrade.id}`,
      marketId: market.id,
      side,
      size: outcomeAmount.toString(),
      price: price.toFixed(4),
      timestamp: parseInt(subgraphTrade.timestamp) * 1000,
      maker: subgraphTrade.maker,
      taker: takerAddress,
      outcome,
      source: 'subgraph',
    };

    // Detailed logging for trade conversion debugging
    logger.info(
      {
        tradeId: polyTrade.id,
        marketId: market.id,
        // Raw subgraph data
        makerAssetId: subgraphTrade.makerAssetId,
        takerAssetId: subgraphTrade.takerAssetId,
        makerAmountFilled: subgraphTrade.makerAmountFilled,
        takerAmountFilled: subgraphTrade.takerAmountFilled,
        // Asset type determination
        makerProvidesUSDC,
        takerProvidesUSDC,
        // Derived values
        side,
        outcome,
        outcomeAmount: outcomeAmount.toFixed(2),
        usdcAmount: usdcAmount.toFixed(2),
        price: price.toFixed(4),
        // Computed USD value for this trade
        tradeUsdValue: usdcAmount.toFixed(2),
        // Market token IDs for reference
        yesTokenId: market.clobTokenIdYes,
        noTokenId: market.clobTokenIdNo,
        // Addresses
        taker: takerAddress.substring(0, 10) + '...',
        maker: subgraphTrade.maker.substring(0, 10) + '...',
      },
      'Converted subgraph trade'
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
