import axios, { type AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket Subgraph Endpoints (Goldsky-hosted)
 */
const SUBGRAPH_ENDPOINTS = {
  activity:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  positions:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
};

/**
 * Subgraph response types - based on actual Polymarket schema
 */
interface SubgraphSplit {
  id: string;
  timestamp: string;
  amount: string;
  condition: {
    id: string;
  };
}

interface SubgraphMerge {
  id: string;
  timestamp: string;
  amount: string;
}

interface SubgraphRedemption {
  id: string;
  timestamp: string;
  payout: string;
}

interface ActivityQueryResponse {
  data?: {
    splits: SubgraphSplit[];
    merges: SubgraphMerge[];
    redemptions: SubgraphRedemption[];
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
  }>;
}

interface PositionsQueryResponse {
  data?: {
    splits: SubgraphSplit[];
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
  }>;
}

/**
 * Processed user activity data
 */
export interface UserActivity {
  address: string;
  tradeCount: number;
  totalVolumeUSD: number;
  firstTradeTimestamp: number | null;
  recentTrades: Array<{
    timestamp: number;
    amountUSD: number;
    marketId: string;
    marketVolume: number;
  }>;
}

/**
 * Processed user positions data
 */
export interface UserPositions {
  address: string;
  positions: Array<{
    marketId: string;
    valueUSD: number;
  }>;
  totalValueUSD: number;
  maxPositionPercentage: number;
}

/**
 * Combined subgraph data for wallet analysis
 */
export interface SubgraphWalletData {
  activity: UserActivity | null;
  positions: UserPositions | null;
  queriedAt: Date;
}

/**
 * GraphQL query for user activity via splits (how trades are created)
 * Splits are when USDC is converted to Yes+No tokens
 */
const USER_ACTIVITY_QUERY = `
  query GetUserActivity($address: Bytes!) {
    splits(
      where: { stakeholder: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      amount
      condition {
        id
      }
    }
    merges(
      where: { stakeholder: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 100
    ) {
      id
      timestamp
      amount
    }
    redemptions(
      where: { redeemer: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 100
    ) {
      id
      timestamp
      payout
    }
  }
`;

/**
 * GraphQL query for user positions
 */
const USER_POSITIONS_QUERY = `
  query GetUserPositions($address: Bytes!) {
    splits(
      where: { stakeholder: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 500
    ) {
      id
      amount
      condition {
        id
      }
    }
  }
`;

/**
 * Rate limiter for subgraph queries
 */
class SubgraphRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerSecond: number;
  private processing = false;

  constructor(maxRequestsPerSecond: number) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();

      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < 1000
      );

      if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
        const oldestTimestamp = this.requestTimestamps[0]!;
        const waitTime = 1000 - (now - oldestTimestamp);
        await this.sleep(waitTime);
        continue;
      }

      const next = this.queue.shift();
      if (next !== undefined) {
        this.requestTimestamps.push(Date.now());
        await next();
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Polymarket Subgraph Client
 * Queries official Polymarket subgraphs for accurate wallet activity data
 */
class PolymarketSubgraphClient {
  private static instance: PolymarketSubgraphClient | null = null;
  private readonly activityClient: AxiosInstance;
  private readonly rateLimiter: SubgraphRateLimiter;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 500;

  private constructor() {
    this.activityClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.activity,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Rate limit: 10 requests per second (conservative for public API)
    this.rateLimiter = new SubgraphRateLimiter(10);

    logger.info('Polymarket subgraph client initialized');
  }

  public static getInstance(): PolymarketSubgraphClient {
    if (PolymarketSubgraphClient.instance === null) {
      PolymarketSubgraphClient.instance = new PolymarketSubgraphClient();
    }
    return PolymarketSubgraphClient.instance;
  }

  /**
   * Get user activity data from the activity subgraph
   * Queries splits, merges, and redemptions to calculate activity
   */
  public async getUserActivity(address: string): Promise<UserActivity | null> {
    const normalizedAddress = address.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.activityClient.post<ActivityQueryResponse>(
          '',
          {
            query: USER_ACTIVITY_QUERY,
            variables: { address: normalizedAddress },
          }
        );

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn(
            { errors: response.data.errors, address: normalizedAddress },
            'Subgraph query returned errors'
          );
          return null;
        }

        const data = response.data.data;
        if (!data) {
          logger.debug(
            { address: normalizedAddress },
            'No data returned from activity subgraph'
          );
          return null;
        }

        const splits = data.splits || [];
        const merges = data.merges || [];
        const redemptions = data.redemptions || [];

        // If no activity at all, return null
        if (
          splits.length === 0 &&
          merges.length === 0 &&
          redemptions.length === 0
        ) {
          logger.debug(
            { address: normalizedAddress },
            'No activity found for user in subgraph'
          );
          return null;
        }

        // Count total trades (splits are the primary trade activity)
        const tradeCount = splits.length + merges.length;

        // Calculate total volume (amounts are in wei, 1e18 = 1 USDC)
        const splitVolume = splits.reduce((sum, s) => {
          const amount = parseFloat(s.amount || '0') / 1e18;
          return sum + amount;
        }, 0);
        const mergeVolume = merges.reduce((sum, m) => {
          const amount = parseFloat(m.amount || '0') / 1e18;
          return sum + amount;
        }, 0);
        const totalVolumeUSD = splitVolume + mergeVolume;

        // Find earliest timestamp (first trade)
        const allTimestamps = [
          ...splits.map((s) => parseInt(s.timestamp, 10)),
          ...merges.map((m) => parseInt(m.timestamp, 10)),
          ...redemptions.map((r) => parseInt(r.timestamp, 10)),
        ].filter((t) => !isNaN(t) && t > 0);

        const firstTradeTimestamp =
          allTimestamps.length > 0 ? Math.min(...allTimestamps) * 1000 : null;

        // Map recent trades (from splits)
        const recentTrades = splits.slice(0, 100).map((s) => ({
          timestamp: parseInt(s.timestamp, 10) * 1000,
          amountUSD: parseFloat(s.amount || '0') / 1e18,
          marketId: s.condition.id || '',
          marketVolume: 0,
        }));

        const activity: UserActivity = {
          address: normalizedAddress,
          tradeCount,
          totalVolumeUSD,
          firstTradeTimestamp,
          recentTrades,
        };

        logger.debug(
          {
            address: normalizedAddress,
            tradeCount: activity.tradeCount,
            volume: activity.totalVolumeUSD.toFixed(2),
            splits: splits.length,
            merges: merges.length,
            redemptions: redemptions.length,
          },
          'Fetched user activity from subgraph'
        );

        return activity;
      });
    });
  }

  /**
   * Get user positions data from the activity subgraph
   * Calculates position concentration from split history
   */
  public async getUserPositions(
    address: string
  ): Promise<UserPositions | null> {
    const normalizedAddress = address.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        // Use activity subgraph to get splits by condition
        const response = await this.activityClient.post<PositionsQueryResponse>(
          '',
          {
            query: USER_POSITIONS_QUERY,
            variables: { address: normalizedAddress },
          }
        );

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn(
            { errors: response.data.errors, address: normalizedAddress },
            'Positions subgraph query returned errors'
          );
          return null;
        }

        const data = response.data.data;
        if (!data) {
          logger.debug(
            { address: normalizedAddress },
            'No data returned from positions query'
          );
          return null;
        }

        const splits = data.splits || [];
        if (splits.length === 0) {
          logger.debug(
            { address: normalizedAddress },
            'No positions found for user'
          );
          return null;
        }

        // Aggregate positions by condition (market)
        const positionsByCondition = new Map<string, number>();
        let totalValueUSD = 0;

        for (const split of splits) {
          const conditionId = split.condition.id || 'unknown';
          const amount = parseFloat(split.amount || '0') / 1e18;
          const current = positionsByCondition.get(conditionId) || 0;
          positionsByCondition.set(conditionId, current + amount);
          totalValueUSD += amount;
        }

        // Convert to positions array
        const positions = Array.from(positionsByCondition.entries()).map(
          ([marketId, valueUSD]) => ({ marketId, valueUSD })
        );

        // Calculate max position percentage
        let maxPositionPercentage = 0;
        if (totalValueUSD > 0) {
          const maxPosition = Math.max(...positions.map((p) => p.valueUSD), 0);
          maxPositionPercentage = (maxPosition / totalValueUSD) * 100;
        }

        const result: UserPositions = {
          address: normalizedAddress,
          positions,
          totalValueUSD,
          maxPositionPercentage,
        };

        logger.debug(
          {
            address: normalizedAddress,
            positionCount: positions.length,
            totalValue: totalValueUSD.toFixed(2),
            maxConcentration: maxPositionPercentage.toFixed(1),
          },
          'Fetched user positions from subgraph'
        );

        return result;
      });
    });
  }

  /**
   * Get combined wallet data from both subgraphs
   */
  public async getWalletData(address: string): Promise<SubgraphWalletData> {
    const normalizedAddress = address.toLowerCase();

    try {
      // Query both subgraphs in parallel
      const [activity, positions] = await Promise.all([
        this.getUserActivity(normalizedAddress),
        this.getUserPositions(normalizedAddress),
      ]);

      return {
        activity,
        positions,
        queriedAt: new Date(),
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address: normalizedAddress,
        },
        'Failed to fetch wallet data from subgraphs'
      );

      // Return null data - caller should fall back to on-chain
      return {
        activity: null,
        positions: null,
        queriedAt: new Date(),
      };
    }
  }

  /**
   * Retry request with exponential backoff
   */
  private async retryRequest<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const isAxiosError = error instanceof AxiosError;
      const isRetryable =
        isAxiosError &&
        (error.response === undefined ||
          error.response.status === 429 ||
          error.response.status >= 500);

      if (isRetryable && attempt < this.maxRetries) {
        const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
        logger.warn(
          {
            attempt,
            delay,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Retrying subgraph request'
        );

        await this.sleep(delay);
        return this.retryRequest(fn, attempt + 1);
      }

      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const polymarketSubgraph = PolymarketSubgraphClient.getInstance();
