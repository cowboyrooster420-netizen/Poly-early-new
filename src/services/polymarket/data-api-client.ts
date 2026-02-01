import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket Data API Client
 * Official data API for user activity, positions, and trading history
 * Docs: https://docs.polymarket.com/data-api
 */

const DATA_API_BASE_URL = 'https://data-api.polymarket.com';

/**
 * User activity response from Data API
 */
export interface DataApiActivity {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: 'TRADE' | 'SPLIT' | 'MERGE';
  size: number;
  usdcSize: number;
  transactionHash: string;
  price?: number;
  asset?: string;
  side?: 'BUY' | 'SELL';
  outcomeIndex?: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
}

/**
 * Aggregated user activity summary (computed from activity items)
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
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  transactionHash: string;
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
      const response = await this.client.get('/activity', {
        params: { user: address },
      });

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
      const response = await this.client.get<DataApiTrade[]>('/trades', {
        params: {
          user: address,
          limit,
          takerOnly: true,
        },
      });

      return response.data || [];
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
      const response = await this.client.get<DataApiPosition[]>('/positions', {
        params: { user: address },
      });

      return response.data || [];
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
      const response = await this.client.get<DataApiPosition[]>(
        '/closed-positions',
        {
          params: { user: address },
        }
      );

      return response.data || [];
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
   * Fetch recent trades for specific markets (condition IDs)
   * This is the main method for trade polling - replaces subgraph
   * Batches requests to avoid URL length limits (HTTP 414)
   * @param conditionIds Array of condition IDs to filter by
   * @param limit Maximum number of trades to fetch per batch
   * @param minUsdValue Optional minimum USD value filter (uses CASH filterType)
   * @returns Array of trades sorted by timestamp descending
   */
  public async getRecentTradesForMarkets(
    conditionIds: string[],
    limit: number = 500,
    minUsdValue?: number
  ): Promise<DataApiTrade[]> {
    if (conditionIds.length === 0) {
      logger.warn('No condition IDs provided for trade fetch');
      return [];
    }

    // Batch condition IDs to avoid URL length limits
    // Each condition ID is ~66 chars, so 20 per batch keeps URL under 2KB
    const BATCH_SIZE = 20;
    const MAX_CONCURRENT_BATCHES = 5;
    const BATCH_TIMEOUT_MS = 5000;
    const batches: string[][] = [];
    for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
      batches.push(conditionIds.slice(i, i + BATCH_SIZE));
    }

    logger.info(
      {
        totalConditionIds: conditionIds.length,
        batchCount: batches.length,
        batchSize: BATCH_SIZE,
        maxConcurrent: MAX_CONCURRENT_BATCHES,
      },
      'Fetching trades from Data API in batches'
    );

    try {
      // Helper to fetch a single batch with timeout
      const fetchBatchWithTimeout = async (
        batchConditionIds: string[]
      ): Promise<DataApiTrade[]> => {
        const params: Record<string, string | number | boolean> = {
          limit,
          takerOnly: true, // Only get real taker trades (not Exchange contract)
          market: batchConditionIds.join(','),
        };

        // Use CASH filter if minimum USD value specified
        if (minUsdValue && minUsdValue > 0) {
          params['filterType'] = 'CASH';
          params['filterAmount'] = minUsdValue;
        }

        // Race between the actual request and a timeout
        const timeoutPromise = new Promise<DataApiTrade[]>((_, reject) => {
          setTimeout(
            () => reject(new Error('Batch request timeout')),
            BATCH_TIMEOUT_MS
          );
        });

        const fetchPromise = this.client
          .get<DataApiTrade[]>('/trades', { params })
          .then((response) => response.data || []);

        try {
          return await Promise.race([fetchPromise, timeoutPromise]);
        } catch (error) {
          logger.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              conditionIdsCount: batchConditionIds.length,
            },
            'Batch request failed or timed out, returning empty array'
          );
          return [];
        }
      };

      // Process batches with limited concurrency
      const allBatchResults: DataApiTrade[][] = [];
      for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
        const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
        const results = await Promise.all(
          concurrentBatches.map(fetchBatchWithTimeout)
        );
        allBatchResults.push(...results);
      }

      // Merge all results and deduplicate by transactionHash
      const seenTxHashes = new Set<string>();
      const allTrades: DataApiTrade[] = [];

      for (const trades of allBatchResults) {
        for (const trade of trades) {
          if (!seenTxHashes.has(trade.transactionHash)) {
            seenTxHashes.add(trade.transactionHash);
            allTrades.push(trade);
          }
        }
      }

      // Sort by timestamp descending (newest first)
      allTrades.sort((a, b) => b.timestamp - a.timestamp);

      logger.info(
        {
          tradesFound: allTrades.length,
          conditionIdsCount: conditionIds.length,
          batchCount: batches.length,
          minUsdValue: minUsdValue || 0,
          oldestTimestamp:
            allTrades.length > 0
              ? new Date(
                  allTrades[allTrades.length - 1]!.timestamp * 1000
                ).toISOString()
              : null,
          newestTimestamp:
            allTrades.length > 0
              ? new Date(allTrades[0]!.timestamp * 1000).toISOString()
              : null,
        },
        'Fetched trades from Data API'
      );

      return allTrades;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          conditionIdsCount: conditionIds.length,
        },
        'Failed to fetch trades from Data API'
      );
      throw error;
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
    const { activity } = data;

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

    // Note: PnL data not available from trades endpoint,
    // would need positions endpoint for realized PnL

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
