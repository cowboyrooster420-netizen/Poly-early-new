import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket Data API Client
 * Official data API for user activity, positions, and trading history
 * Docs: https://docs.polymarket.com/data-api
 */

const DATA_API_BASE_URL = 'https://data.api.polymarket.com';

/**
 * User activity response from Data API
 */
export interface DataApiUserActivity {
  address: string;
  totalTrades: number;
  totalVolume: string;
  totalPnL: string;
  firstTradeTimestamp?: number;
  lastTradeTimestamp?: number;
  marketsTraded: number;
  winRate?: number;
}

/**
 * User trade history response
 */
export interface DataApiTrade {
  id: string;
  marketId: string;
  timestamp: number;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  size: string;
  price: string;
  fee: string;
  realized?: boolean;
  pnl?: string;
}

/**
 * User position response
 */
export interface DataApiPosition {
  marketId: string;
  marketQuestion: string;
  outcome: 'yes' | 'no';
  size: string;
  avgPrice: string;
  currentPrice: string;
  pnl: string;
  pnlPercent: string;
  value: string;
  closed: boolean;
}

/**
 * Aggregated user data from Data API
 */
export interface DataApiUserData {
  activity: DataApiUserActivity | null;
  recentTrades: DataApiTrade[];
  positions: DataApiPosition[];
  queriedAt: Date;
}

class PolymarketDataApiClient {
  private static instance: PolymarketDataApiClient | null = null;
  private readonly client: AxiosInstance;

  private constructor() {
    this.client = axios.create({
      baseURL: DATA_API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PolymarketInsiderBot/1.0',
      },
    });

    logger.info('Polymarket Data API client initialized');
  }

  public static getInstance(): PolymarketDataApiClient {
    if (PolymarketDataApiClient.instance === null) {
      PolymarketDataApiClient.instance = new PolymarketDataApiClient();
    }
    return PolymarketDataApiClient.instance;
  }

  /**
   * Get user activity summary
   */
  public async getUserActivity(
    address: string
  ): Promise<DataApiUserActivity | null> {
    try {
      const response = await this.client.get(`/user/${address}/activity`);

      if (response.status === 404) {
        logger.debug({ address }, 'No activity found for user');
        return null;
      }

      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        logger.debug({ address }, 'User not found in Data API');
        return null;
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address,
        },
        'Failed to fetch user activity from Data API'
      );
      return null;
    }
  }

  /**
   * Get user's recent trades
   */
  public async getUserTrades(
    address: string,
    limit: number = 100
  ): Promise<DataApiTrade[]> {
    try {
      const response = await this.client.get(`/user/${address}/trades`, {
        params: { limit, sort: 'desc' },
      });

      return response.data.trades || [];
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        logger.debug({ address }, 'No trades found for user');
        return [];
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address,
        },
        'Failed to fetch user trades from Data API'
      );
      return [];
    }
  }

  /**
   * Get user's current positions
   */
  public async getUserPositions(address: string): Promise<DataApiPosition[]> {
    try {
      const response = await this.client.get(`/user/${address}/positions`);

      return response.data.positions || [];
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        logger.debug({ address }, 'No positions found for user');
        return [];
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address,
        },
        'Failed to fetch user positions from Data API'
      );
      return [];
    }
  }

  /**
   * Get user's closed positions (P&L history)
   */
  public async getClosedPositions(address: string): Promise<DataApiPosition[]> {
    try {
      const response = await this.client.get(
        `/user/${address}/closed-positions`
      );

      return response.data.positions || [];
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        logger.debug({ address }, 'No closed positions found for user');
        return [];
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address,
        },
        'Failed to fetch closed positions from Data API'
      );
      return [];
    }
  }

  /**
   * Get combined user data from Data API
   * This is the main method for wallet analysis
   */
  public async getUserData(address: string): Promise<DataApiUserData> {
    const normalizedAddress = address.toLowerCase();

    try {
      // Fetch all data in parallel
      const [activity, trades, positions, closedPositions] = await Promise.all([
        this.getUserActivity(normalizedAddress),
        this.getUserTrades(normalizedAddress, 100),
        this.getUserPositions(normalizedAddress),
        this.getClosedPositions(normalizedAddress),
      ]);

      // Combine open and closed positions
      const allPositions = [...positions, ...closedPositions];

      logger.info(
        {
          address: normalizedAddress,
          hasActivity: !!activity,
          tradeCount: trades.length,
          positionCount: allPositions.length,
          totalVolume: activity?.totalVolume || '0',
          winRate: activity?.winRate || 0,
        },
        'Fetched user data from Data API'
      );

      return {
        activity,
        recentTrades: trades,
        positions: allPositions,
        queriedAt: new Date(),
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address: normalizedAddress,
        },
        'Failed to fetch complete user data from Data API'
      );

      // Return empty data on error
      return {
        activity: null,
        recentTrades: [],
        positions: [],
        queriedAt: new Date(),
      };
    }
  }

  /**
   * Calculate advanced wallet metrics from Data API data
   */
  public calculateWalletMetrics(data: DataApiUserData): {
    isNewTrader: boolean;
    isProfitable: boolean;
    hasHighWinRate: boolean;
    isSpecialized: boolean;
    tradingPatternScore: number;
  } {
    const { activity, recentTrades } = data;

    // New trader detection
    const isNewTrader = !activity || activity.totalTrades < 10;

    // Profitability check
    const totalPnL = parseFloat(activity?.totalPnL || '0');
    const isProfitable = totalPnL > 0;

    // Win rate analysis
    const winRate = activity?.winRate || 0;
    const hasHighWinRate = winRate > 60; // 60% win rate is quite good

    // Specialization check (trades concentrated in few markets)
    const marketsTraded = activity?.marketsTraded || 0;
    const totalTrades = activity?.totalTrades || 0;
    const avgTradesPerMarket =
      totalTrades > 0 ? totalTrades / marketsTraded : 0;
    const isSpecialized = avgTradesPerMarket > 5; // More than 5 trades per market on average

    // Calculate pattern score (0-100)
    let patternScore = 0;

    if (isNewTrader) patternScore += 20;
    if (!isProfitable && totalTrades > 5) patternScore += 15; // Losing trader with history
    if (winRate < 40 && totalTrades > 10) patternScore += 25; // Poor win rate
    if (isSpecialized) patternScore += 20; // Focused on specific markets

    // Check for recent losing streak
    const recentLosses = recentTrades
      .slice(0, 10)
      .filter((t) => t.pnl && parseFloat(t.pnl) < 0).length;
    if (recentLosses >= 7) patternScore += 20; // 70%+ losses in recent trades

    return {
      isNewTrader,
      isProfitable,
      hasHighWinRate,
      isSpecialized,
      tradingPatternScore: Math.min(100, patternScore),
    };
  }
}

// Export singleton instance
export const polymarketDataApi = PolymarketDataApiClient.getInstance();
