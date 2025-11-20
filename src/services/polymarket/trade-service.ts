import { Decimal } from '@prisma/client/runtime/library';

import { db } from '../database/prisma.js';
import { marketService } from './market-service.js';
import { logger } from '../../utils/logger.js';
import type { PolymarketTrade } from '../../types/index.js';

/**
 * Trade service - handles incoming trades and storage
 */
class TradeService {
  private static instance: TradeService | null = null;
  private tradeCount = 0;

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
   * Process an incoming trade
   * Stores to database and triggers analysis pipeline
   */
  public async processTrade(trade: PolymarketTrade): Promise<void> {
    try {
      // Check if market is monitored
      if (!marketService.isMonitored(trade.marketId)) {
        logger.debug(
          { marketId: trade.marketId },
          'Ignoring trade for unmonitored market'
        );
        return;
      }

      // Log trade details
      logger.info(
        {
          tradeId: trade.id,
          marketId: trade.marketId,
          side: trade.side,
          size: trade.size,
          price: trade.price,
          outcome: trade.outcome,
          maker: trade.maker.substring(0, 8) + '...',
          taker: trade.taker.substring(0, 8) + '...',
        },
        'Processing trade'
      );

      // Store trade to database
      await this.storeTrade(trade);

      // Increment counter
      this.tradeCount++;

      // TODO: Trigger signal detection pipeline
      // - Check OI percentage
      // - Check price impact
      // - Check dormancy conditions
      // - Check wallet fingerprint
      // - Calculate confidence score
      // - Generate alert if conditions met
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
