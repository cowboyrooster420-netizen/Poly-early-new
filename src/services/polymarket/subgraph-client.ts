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
 * Subgraph response types
 */
interface SubgraphTrade {
  timestamp: string;
  amountUSD: string;
  market: {
    id: string;
    conditionId: string;
    volume: string;
  };
  outcome: string;
}

interface SubgraphPosition {
  market: {
    id: string;
  };
  netShares: string;
  value: string;
}

interface SubgraphUser {
  id: string;
  tradeCount: number;
  volume: string;
  firstTradeTimestamp: string;
  trades: SubgraphTrade[];
  positions: SubgraphPosition[];
}

interface ActivityQueryResponse {
  data: {
    user: SubgraphUser | null;
  };
  errors?: Array<{ message: string }>;
}

interface PositionsUser {
  id: string;
  positions: Array<{
    market: { id: string };
    valueUSD: string;
  }>;
  totalValueUSD: string;
}

interface PositionsQueryResponse {
  data: {
    user: PositionsUser | null;
  };
  errors?: Array<{ message: string }>;
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
 * GraphQL query for user activity
 */
const USER_ACTIVITY_QUERY = `
  query GetUserActivity($address: ID!) {
    user(id: $address) {
      id
      tradeCount
      volume
      firstTradeTimestamp
      trades(first: 100, orderBy: timestamp, orderDirection: desc) {
        timestamp
        amountUSD
        market {
          id
          conditionId
          volume
        }
        outcome
      }
    }
  }
`;

/**
 * GraphQL query for user positions
 */
const USER_POSITIONS_QUERY = `
  query GetUserPositions($address: ID!) {
    user(id: $address) {
      id
      positions {
        market {
          id
        }
        valueUSD
      }
      totalValueUSD
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
  private readonly positionsClient: AxiosInstance;
  private readonly rateLimiter: SubgraphRateLimiter;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 500;

  private constructor() {
    this.activityClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.activity,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.positionsClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.positions,
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
          // If there are GraphQL errors, the data might be null/undefined
          return null;
        }

        const user = response.data.data.user;
        if (!user) {
          logger.debug(
            { address: normalizedAddress },
            'No user found in activity subgraph'
          );
          return null;
        }

        // Parse and transform the response
        const activity: UserActivity = {
          address: user.id,
          tradeCount: user.tradeCount || 0,
          totalVolumeUSD: parseFloat(user.volume || '0'),
          firstTradeTimestamp: user.firstTradeTimestamp
            ? parseInt(user.firstTradeTimestamp, 10) * 1000
            : null,
          recentTrades: (user.trades || []).map((t) => ({
            timestamp: parseInt(t.timestamp, 10) * 1000,
            amountUSD: parseFloat(t.amountUSD || '0'),
            marketId: t.market.id || '',
            marketVolume: parseFloat(t.market.volume || '0'),
          })),
        };

        logger.debug(
          {
            address: normalizedAddress,
            tradeCount: activity.tradeCount,
            volume: activity.totalVolumeUSD.toFixed(2),
          },
          'Fetched user activity from subgraph'
        );

        return activity;
      });
    });
  }

  /**
   * Get user positions data from the positions subgraph
   */
  public async getUserPositions(
    address: string
  ): Promise<UserPositions | null> {
    const normalizedAddress = address.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response =
          await this.positionsClient.post<PositionsQueryResponse>('', {
            query: USER_POSITIONS_QUERY,
            variables: { address: normalizedAddress },
          });

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn(
            { errors: response.data.errors, address: normalizedAddress },
            'Positions subgraph query returned errors'
          );
          // If there are GraphQL errors, the data might be null/undefined
          return null;
        }

        const user = response.data.data.user;
        if (!user) {
          logger.debug(
            { address: normalizedAddress },
            'No user found in positions subgraph'
          );
          return null;
        }

        // Parse positions
        const positions = (user.positions || []).map((p) => ({
          marketId: p.market.id || '',
          valueUSD: parseFloat(p.valueUSD || '0'),
        }));

        const totalValueUSD = parseFloat(user.totalValueUSD || '0');

        // Calculate max position percentage
        let maxPositionPercentage = 0;
        if (totalValueUSD > 0) {
          const maxPosition = Math.max(...positions.map((p) => p.valueUSD), 0);
          maxPositionPercentage = (maxPosition / totalValueUSD) * 100;
        }

        const result: UserPositions = {
          address: user.id,
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
