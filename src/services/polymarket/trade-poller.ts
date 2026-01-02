import { polymarketSubgraph } from './subgraph-client.js';
import { tradeService } from './trade-service.js';
import { marketService } from './market-service.js';
import { logger } from '../../utils/logger.js';
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
  private readonly POLL_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_PROCESSED_IDS = 10000; // Prevent memory leak

  private constructor() {
    logger.info('Trade polling service initialized');
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

      // Get trades from last 2 minutes (overlap to ensure we don't miss any)
      // Only fetch trades for our monitored markets
      const trades = await polymarketSubgraph.getRecentTrades(2, 500, assetIds);

      if (trades.length === 0) {
        logger.debug('No recent trades found in subgraph');
        return;
      }

      const monitoredAssetIds = marketService.getMonitoredAssetIds();
      logger.info(
        {
          tradeCount: trades.length,
          monitoredAssetCount: monitoredAssetIds.length,
          sampleAssetIds: monitoredAssetIds.slice(0, 5),
        },
        'Processing trades from subgraph'
      );

      // Process each trade
      let newTradesCount = 0;
      for (const trade of trades) {
        try {
          // Skip if already processed
          if (this.processedTradeIds.has(trade.id)) {
            continue;
          }

          // Convert subgraph trade to our format
          const polyTrade = await this.convertToPolymarketTrade(trade);
          if (polyTrade) {
            await tradeService.processTrade(polyTrade);
            newTradesCount++;
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

      if (newTradesCount > 0) {
        logger.info({ newTradesCount }, 'Processed new trades from subgraph');
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

    // Determine trade direction and outcome
    // If taker is selling outcome token (maker buying), it's a SELL
    const takerSellingOutcome =
      takerAsset !== '0' && takerAsset === nonUSDCAsset;
    const side: 'buy' | 'sell' = takerSellingOutcome ? 'sell' : 'buy';

    // The outcome asset is the non-USDC asset
    const outcomeAssetId = nonUSDCAsset;
    const outcome: 'yes' | 'no' =
      market.clobTokenIdYes === outcomeAssetId ? 'yes' : 'no';

    // Calculate size and price
    // Size is the outcome token amount
    const outcomeAmount = takerSellingOutcome
      ? parseFloat(subgraphTrade.takerAmountFilled) / 1e6
      : parseFloat(subgraphTrade.makerAmountFilled) / 1e6;

    const usdcAmount = takerSellingOutcome
      ? parseFloat(subgraphTrade.makerAmountFilled) / 1e6
      : parseFloat(subgraphTrade.takerAmountFilled) / 1e6;

    // Validate amounts
    if (outcomeAmount <= 0 || usdcAmount < 0) {
      logger.warn(
        {
          tradeId: subgraphTrade.id,
          outcomeAmount,
          usdcAmount,
          makerAmountFilled: subgraphTrade.makerAmountFilled,
          takerAmountFilled: subgraphTrade.takerAmountFilled,
        },
        'Invalid trade amounts detected'
      );
      return null;
    }

    // Price is USDC per outcome token
    const price = usdcAmount / outcomeAmount;

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
    };

    logger.debug(
      {
        tradeId: polyTrade.id,
        marketId: market.id,
        side,
        outcome,
        size: polyTrade.size,
        price: polyTrade.price,
        taker: takerAddress.substring(0, 10) + '...',
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
