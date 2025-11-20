import { Decimal } from '@prisma/client/runtime/library';

import { getThresholds } from '../../config/thresholds.js';
import { db } from '../database/prisma.js';
import { redis } from '../cache/redis.js';
import { logger } from '../../utils/logger.js';
import type {
  PolymarketTrade,
  TradeSignal,
  DormancyMetrics,
} from '../../types/index.js';

/**
 * Signal detection service
 * Analyzes trades for insider signal patterns
 */
class SignalDetector {
  private static instance: SignalDetector | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SignalDetector {
    if (SignalDetector.instance === null) {
      SignalDetector.instance = new SignalDetector();
    }
    return SignalDetector.instance;
  }

  /**
   * Analyze a trade for insider signals
   * Returns null if trade doesn't meet criteria
   */
  public async analyzeTrade(
    trade: PolymarketTrade
  ): Promise<TradeSignal | null> {
    try {
      const thresholds = getThresholds();

      // Get market data
      const marketData = await this.getMarketData(trade.marketId);
      if (marketData === null) {
        logger.debug({ marketId: trade.marketId }, 'No market data available');
        return null;
      }

      // Calculate OI percentage
      const oiPercentage = this.calculateOiPercentage(
        trade.size,
        marketData.openInterest
      );

      // Get price before/after (simplified - in real impl would track orderbook)
      const priceImpact = await this.estimatePriceImpact(trade);

      // Check if trade meets minimum thresholds
      const meetsOiThreshold = oiPercentage >= thresholds.minOiPercentage;
      const meetsPriceThreshold = priceImpact >= thresholds.minPriceImpact;

      if (!meetsOiThreshold && !meetsPriceThreshold) {
        logger.debug(
          {
            tradeId: trade.id,
            oiPercentage,
            priceImpact,
            thresholds: {
              minOi: thresholds.minOiPercentage,
              minPrice: thresholds.minPriceImpact,
            },
          },
          'Trade does not meet size/impact thresholds'
        );
        return null;
      }

      // Build trade signal
      const signal: TradeSignal = {
        tradeId: trade.id,
        marketId: trade.marketId,
        walletAddress: trade.taker, // The taker is the one initiating
        tradeSize: trade.size,
        openInterest: marketData.openInterest,
        oiPercentage,
        priceImpact,
        priceBeforeTrade: '0', // TODO: implement orderbook tracking
        priceAfterTrade: trade.price,
        timestamp: trade.timestamp,
        outcome: trade.outcome,
      };

      logger.info(
        {
          tradeId: trade.id,
          marketId: trade.marketId,
          oiPercentage: oiPercentage.toFixed(2),
          priceImpact: priceImpact.toFixed(2),
        },
        '🚨 Large trade detected'
      );

      return signal;
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Failed to analyze trade');
      return null;
    }
  }

  /**
   * Check if market was dormant before this trade
   */
  public async checkDormancy(
    marketId: string,
    tradeTimestamp: number
  ): Promise<DormancyMetrics> {
    try {
      const thresholds = getThresholds();
      const tradeTime = new Date(tradeTimestamp);

      // Look back windows
      const largeTradeWindow = new Date(
        tradeTime.getTime() -
          thresholds.dormantHoursNoLargeTrades * 60 * 60 * 1000
      );
      const priceMoveWindow = new Date(
        tradeTime.getTime() -
          thresholds.dormantHoursNoPriceMoves * 60 * 60 * 1000
      );

      const prisma = db.getClient();

      // Check for large trades in window
      const lastLargeTrade = await prisma.trade.findFirst({
        where: {
          marketId,
          timestamp: {
            gte: largeTradeWindow,
            lt: tradeTime,
          },
          size: {
            gte: new Decimal(thresholds.dormantLargeTradeThreshold),
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      // Check for significant price moves in window
      // Simplified - in real impl would track actual price changes
      const recentTrades = await prisma.trade.findMany({
        where: {
          marketId,
          timestamp: {
            gte: priceMoveWindow,
            lt: tradeTime,
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          timestamp: true,
          price: true,
        },
      });

      const lastPriceMove = this.findSignificantPriceMove(
        recentTrades as Array<{ timestamp: Date; price: Decimal }>,
        thresholds.dormantPriceMoveThreshold
      );

      // Calculate dormancy
      const now = tradeTime.getTime();
      const hoursSinceLargeTrade = lastLargeTrade
        ? (now - lastLargeTrade.timestamp.getTime()) / (1000 * 60 * 60)
        : Infinity;

      const hoursSincePriceMove = lastPriceMove
        ? (now - lastPriceMove.getTime()) / (1000 * 60 * 60)
        : Infinity;

      const isDormant =
        hoursSinceLargeTrade >= thresholds.dormantHoursNoLargeTrades &&
        hoursSincePriceMove >= thresholds.dormantHoursNoPriceMoves;

      const metrics: DormancyMetrics = {
        lastLargeTradeTimestamp: lastLargeTrade?.timestamp.getTime() ?? null,
        hoursSinceLastLargeTrade: hoursSinceLargeTrade,
        lastPriceMoveTimestamp: lastPriceMove?.getTime() ?? null,
        hoursSinceLastPriceMove: hoursSincePriceMove,
        isDormant,
      };

      if (isDormant) {
        logger.info(
          {
            marketId,
            hoursSinceLargeTrade: hoursSinceLargeTrade.toFixed(1),
            hoursSincePriceMove: hoursSincePriceMove.toFixed(1),
          },
          '😴 Dormant market detected'
        );
      }

      return metrics;
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to check dormancy');
      // Return non-dormant on error
      return {
        lastLargeTradeTimestamp: null,
        hoursSinceLastLargeTrade: 0,
        lastPriceMoveTimestamp: null,
        hoursSinceLastPriceMove: 0,
        isDormant: false,
      };
    }
  }

  /**
   * Get market data (OI, volume, etc.)
   */
  private async getMarketData(
    marketId: string
  ): Promise<{ openInterest: string; volume: string } | null> {
    try {
      // Try cache first
      const cached = await redis.getJSON<{
        openInterest: string;
        volume: string;
      }>(`market:data:${marketId}`);

      if (cached !== null) {
        return cached;
      }

      // Fallback to database
      const prisma = db.getClient();
      const market = await prisma.market.findUnique({
        where: { id: marketId },
        select: { openInterest: true, volume: true },
      });

      if (market === null) {
        return null;
      }

      const data = {
        openInterest: market.openInterest.toString(),
        volume: market.volume.toString(),
      };

      // Cache for 5 minutes
      await redis.setJSON(`market:data:${marketId}`, data, 300);

      return data;
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to get market data');
      return null;
    }
  }

  /**
   * Calculate OI percentage
   */
  private calculateOiPercentage(tradeSize: string, oi: string): number {
    const size = parseFloat(tradeSize);
    const openInterest = parseFloat(oi);

    if (openInterest === 0) {
      return 0;
    }

    return (size / openInterest) * 100;
  }

  /**
   * Estimate price impact of trade
   * Simplified - real implementation would use orderbook depth
   */
  private async estimatePriceImpact(trade: PolymarketTrade): Promise<number> {
    try {
      // Get recent trades to estimate price before
      const prisma = db.getClient();

      const recentTrades = await prisma.trade.findMany({
        where: {
          marketId: trade.marketId,
          timestamp: {
            lt: new Date(trade.timestamp),
            gte: new Date(trade.timestamp - 60000), // Last minute
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });

      if (recentTrades.length === 0) {
        // No recent trades, assume minimal impact
        return 0;
      }

      // Calculate average price before
      const avgPriceBefore =
        recentTrades.reduce(
          (sum: number, t: { price: Decimal }) =>
            sum + parseFloat(t.price.toString()),
          0
        ) / recentTrades.length;

      const currentPrice = parseFloat(trade.price);

      // Calculate percentage change
      const priceChange = Math.abs(currentPrice - avgPriceBefore);
      const percentChange = (priceChange / avgPriceBefore) * 100;

      return percentChange;
    } catch (error) {
      logger.error(
        { error, tradeId: trade.id },
        'Failed to estimate price impact'
      );
      return 0;
    }
  }

  /**
   * Find significant price move in recent trades
   */
  private findSignificantPriceMove(
    trades: Array<{ timestamp: Date; price: Decimal }>,
    threshold: number
  ): Date | null {
    if (trades.length < 2) {
      return null;
    }

    for (let i = 0; i < trades.length - 1; i++) {
      const currentPrice = parseFloat(trades[i]!.price.toString());
      const nextPrice = parseFloat(trades[i + 1]!.price.toString());

      const priceChange = Math.abs(currentPrice - nextPrice);
      const percentChange = (priceChange / nextPrice) * 100;

      if (percentChange >= threshold) {
        return trades[i]!.timestamp;
      }
    }

    return null;
  }
}

// Export singleton instance
export const signalDetector = SignalDetector.getInstance();
