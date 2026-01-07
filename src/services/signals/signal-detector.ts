import { Decimal } from '@prisma/client/runtime/library';

import { getThresholds } from '../../config/thresholds.js';
import { db } from '../database/prisma.js';
import { redis } from '../cache/redis.js';
import { logger } from '../../utils/logger.js';
import { OiCalculationService } from '../analysis/oi-calculator.js';
import { safeParseFloat, calculateUsdValue } from '../../utils/decimals.js';
import { DecisionFramework } from '../data/decision-framework.js';
import type {
  PolymarketTrade,
  TradeSignal,
  DormancyMetrics,
} from '../../types/index.js';

// Stats keys for tracking filter funnel
const STATS_KEY = 'stats:signal_detector';

/**
 * Signal detection service
 * Analyzes trades for insider signal patterns
 */
class SignalDetector {
  private static instance: SignalDetector | null = null;
  private oiCalculator: OiCalculationService;

  private constructor() {
    // Private constructor for singleton
    this.oiCalculator = new OiCalculationService();
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
   * Increment a stat counter
   */
  public async incrementStat(field: string): Promise<void> {
    try {
      await redis.hincrby(STATS_KEY, field, 1);
    } catch (error) {
      // Don't let stats tracking break the main flow
      logger.debug({ error, field }, 'Failed to increment stat');
    }
  }

  /**
   * Get all stats
   */
  public async getStats(): Promise<Record<string, number>> {
    try {
      const stats = await redis.hgetall(STATS_KEY);
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(stats)) {
        result[key] = parseInt(value, 10) || 0;
      }
      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return {};
    }
  }

  /**
   * Reset stats
   */
  public async resetStats(): Promise<void> {
    try {
      await redis.del(STATS_KEY);
    } catch (error) {
      logger.error({ error }, 'Failed to reset stats');
    }
  }

  /**
   * Analyze a trade for insider signals
   * Returns null if trade doesn't meet criteria
   */
  public async analyzeTrade(
    trade: PolymarketTrade
  ): Promise<TradeSignal | null> {
    try {
      // Track total trades analyzed
      await this.incrementStat('trades_analyzed');

      // Get market data
      const marketData = await this.getMarketData(trade.marketId);
      if (marketData === null) {
        logger.debug({ marketId: trade.marketId }, 'No market data available');
        await this.incrementStat('filtered_no_market_data');
        return null;
      }

      // Calculate USD value (shares * price)
      const tradeUsdValue = calculateUsdValue(
        safeParseFloat(trade.size),
        safeParseFloat(trade.price)
      );

      // Calculate impact percentage using configured method (liquidity/volume/oi)
      const impactResult = await this.oiCalculator.calculateImpactPercentage(
        tradeUsdValue,
        trade.side,
        trade.marketId,
        parseFloat(marketData.openInterest),
        trade.outcome
      );

      // Hybrid scoring: Check both relative impact AND absolute size
      const absoluteSizeThreshold =
        this.getAbsoluteSizeThreshold(tradeUsdValue);
      const meetsAbsoluteThreshold = absoluteSizeThreshold.meetsThreshold;

      // Accept trade if EITHER threshold is met
      if (!impactResult.meetsThreshold && !meetsAbsoluteThreshold) {
        logger.info(
          {
            tradeId: trade.id,
            tradeUsdValue: tradeUsdValue.toFixed(2),
            openInterest: marketData.openInterest,
            impactPercentage: impactResult.impactPercentage.toFixed(2),
            absoluteThreshold: absoluteSizeThreshold.threshold,
            method: impactResult.method,
            relativeThreshold: impactResult.threshold,
            reason: `Below both thresholds`,
            details: impactResult.details,
          },
          `🚫 Trade filtered: Both impact (${impactResult.impactPercentage.toFixed(2)}%) and size ($${tradeUsdValue.toFixed(0)}) too low`
        );
        await this.incrementStat('filtered_oi_threshold');
        return null;
      }

      // Log when absolute size overrides relative impact
      if (!impactResult.meetsThreshold && meetsAbsoluteThreshold) {
        logger.info(
          {
            tradeId: trade.id,
            tradeUsdValue: tradeUsdValue.toFixed(2),
            impactPercentage: impactResult.impactPercentage.toFixed(2),
            reason: 'Passed due to absolute size despite low relative impact',
          },
          `💰 Large trade detected via absolute size threshold`
        );
      }

      // Track trades that passed OI filter
      await this.incrementStat('passed_oi_filter');

      // Build trade signal
      const signal: TradeSignal = {
        tradeId: trade.id,
        marketId: trade.marketId,
        walletAddress: trade.taker, // The taker is the one initiating
        tradeSize: trade.size,
        openInterest: marketData.openInterest,
        oiPercentage: impactResult.impactPercentage, // Backwards compatibility
        impactPercentage: impactResult.impactPercentage,
        impactMethod: impactResult.method,
        impactThreshold: impactResult.threshold,
        priceImpact: 0, // Deprecated - not used in scoring
        priceBeforeTrade: '0',
        priceAfterTrade: trade.price,
        tradeUsdValue,
        timestamp: trade.timestamp,
        outcome: trade.outcome,
        // Add info about absolute size if it was the reason for passing
        absoluteSizeTier: absoluteSizeThreshold.tier,
        passedViaAbsoluteSize:
          !impactResult.meetsThreshold && meetsAbsoluteThreshold,
      };

      logger.info(
        {
          tradeId: trade.id,
          marketId: trade.marketId,
          tradeUsdValue: tradeUsdValue.toFixed(2),
          openInterest: marketData.openInterest,
          impactPercentage: impactResult.impactPercentage.toFixed(2),
          method: impactResult.method,
          threshold: impactResult.threshold,
          absoluteSizeTier: absoluteSizeThreshold.tier,
          passedViaSize: signal.passedViaAbsoluteSize,
        },
        signal.passedViaAbsoluteSize
          ? `🚨 Large trade detected ($${(tradeUsdValue / 1000).toFixed(0)}k ${absoluteSizeThreshold.tier} trade)`
          : `🚨 Large trade detected (${impactResult.method} impact: ${impactResult.impactPercentage.toFixed(2)}%)`
      );

      return signal;
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Failed to analyze trade');
      return null;
    }
  }

  /**
   * Get absolute size threshold for trade
   * Tiered system: $10k, $25k, $50k, $100k
   */
  private getAbsoluteSizeThreshold(tradeUsdValue: number): {
    meetsThreshold: boolean;
    threshold: number;
    tier: string;
  } {
    if (tradeUsdValue >= 100000) {
      return { meetsThreshold: true, threshold: 100000, tier: 'whale' };
    } else if (tradeUsdValue >= 50000) {
      return { meetsThreshold: true, threshold: 50000, tier: 'large' };
    } else if (tradeUsdValue >= 25000) {
      return { meetsThreshold: true, threshold: 25000, tier: 'significant' };
    } else if (tradeUsdValue >= 10000) {
      return { meetsThreshold: true, threshold: 10000, tier: 'notable' };
    }

    // Below $10k, doesn't meet absolute threshold
    return { meetsThreshold: false, threshold: 10000, tier: 'small' };
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

      // Try to get fresh OI from Data API
      const freshOI = await this.oiCalculator.fetchOpenInterest(marketId);

      // Fallback to database
      const prisma = db.getClient();
      const market = await prisma.market.findUnique({
        where: { id: marketId },
        select: { openInterest: true, volume: true },
      });

      if (market === null && freshOI === null) {
        // Both database and fresh OI failed - use decision framework
        const decision = DecisionFramework.handleMarketDataError(
          new Error('Market data not available'),
          {
            marketId,
            dataType: 'info',
            source: 'api',
          }
        );

        await DecisionFramework.executeDecision(decision, {
          onAbort: () => {
            // Return null to indicate we cannot process this market
          },
        });

        return null;
      }

      const data = {
        openInterest:
          freshOI !== null
            ? freshOI.toString()
            : market?.openInterest.toString() || '0',
        volume: market?.volume.toString() || '0',
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
