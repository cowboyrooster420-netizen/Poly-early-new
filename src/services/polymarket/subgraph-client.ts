import axios, { type AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger.js';
import { usdcToUsd } from '../../utils/decimals.js';

/**
 * Polymarket Subgraph Endpoints (Goldsky-hosted)
 */
const SUBGRAPH_ENDPOINTS = {
  activity:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  positions:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
  // Orders subgraph for CLOB trades (OrderFilled/OrdersMatched events)
  orderbook:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn',
  // Open Interest subgraph - NEW
  openInterest:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.6/gn',
  // Wallet subgraph for proxy-to-signer mapping
  wallet:
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/wallet-subgraph/0.0.1/gn',
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

/**
 * OrderFilled event from Orderbook subgraph (CLOB trades)
 */
interface SubgraphOrderFilled {
  id: string;
  timestamp: string;
  maker: string;
  taker: string;
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
  fee: string;
}

interface OrderbookQueryResponse {
  data?: {
    orderFilledEvents: SubgraphOrderFilled[];
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
  }>;
}

/**
 * Wallet subgraph types
 */
interface SubgraphWallet {
  id: string; // The proxy wallet address
  signer: string; // The actual user address (EOA)
  type: string; // 'proxy' or 'safe'
  createdAt: string;
}

interface WalletQueryResponse {
  data?: {
    wallet: SubgraphWallet | null;
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
  }>;
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

/**
 * UserPosition from PNL subgraph
 */
interface SubgraphUserPosition {
  id: string;
  user: string;
  conditionId: string;
  amount0: string;
  amount1: string;
  lpShares: string;
  netDeposits: string;
  netWithdrawals: string;
  realizedPnl: string;
  unrealizedPnl: string;
}

interface PositionsQueryResponse {
  data?: {
    userPositions: SubgraphUserPosition[];
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
 * CLOB (orderbook) activity from OrderFilled events
 * This is the actual trading activity on Polymarket's order book
 */
export interface UserCLOBActivity {
  address: string;
  tradeCount: number;
  totalVolumeUSD: number;
  firstTradeTimestamp: number | null;
  asMaker: number; // Times they were the maker (limit order filled)
  asTaker: number; // Times they were the taker (market order)
  recentTrades: Array<{
    timestamp: number;
    amountUSD: number;
    side: 'maker' | 'taker';
    assetId: string;
  }>;
}

/**
 * Combined subgraph data for wallet analysis
 */
export interface SubgraphWalletData {
  activity: UserActivity | null; // Splits/merges (collateral operations)
  clobActivity: UserCLOBActivity | null; // Actual CLOB trades
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
 * GraphQL query for user positions from PNL subgraph
 */
const USER_POSITIONS_QUERY = `
  query GetUserPositions($address: Bytes!) {
    userPositions(
      where: { user: $address }
      first: 500
    ) {
      id
      user
      conditionId
      amount0
      amount1
      lpShares
      netDeposits
      netWithdrawals
      realizedPnl
      unrealizedPnl
    }
  }
`;

/**
 * GraphQL query for CLOB trades (OrderFilled events)
 * Queries trades where the wallet was either maker or taker
 */
const USER_CLOB_TRADES_MAKER_QUERY = `
  query GetUserCLOBTradesAsMaker($address: String!) {
    orderFilledEvents(
      where: { maker: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      maker
      taker
      makerAssetId
      takerAssetId
      makerAmountFilled
      takerAmountFilled
      fee
    }
  }
`;

const USER_CLOB_TRADES_TAKER_QUERY = `
  query GetUserCLOBTradesAsTaker($address: String!) {
    orderFilledEvents(
      where: { taker: $address }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      id
      timestamp
      maker
      taker
      makerAssetId
      takerAssetId
      makerAmountFilled
      takerAmountFilled
      fee
    }
  }
`;

/**
 * GraphQL query to resolve proxy wallet to signer
 */
const WALLET_SIGNER_QUERY = `
  query GetWalletSigner($proxyAddress: ID!) {
    wallet(id: $proxyAddress) {
      id
      signer
      type
      createdAt
    }
  }
`;

/**
 * GraphQL query to get recent trades from orderbook
 * We need to match trades where one asset is USDC ("0") and the other is a monitored asset
 */
const RECENT_TRADES_QUERY = `
  query GetRecentTrades($since: BigInt!, $first: Int!, $assetIds: [String!]) {
    orderFilledEvents(
      where: { 
        or: [
          { timestamp_gte: $since, makerAssetId: "0", takerAssetId_in: $assetIds },
          { timestamp_gte: $since, takerAssetId: "0", makerAssetId_in: $assetIds }
        ]
      }
      orderBy: timestamp
      orderDirection: desc
      first: $first
    ) {
      id
      timestamp
      maker
      taker
      makerAssetId
      takerAssetId
      makerAmountFilled
      takerAmountFilled
      fee
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
  private readonly orderbookClient: AxiosInstance;
  private readonly walletClient: AxiosInstance;
  private readonly pnlClient: AxiosInstance;
  private readonly rateLimiter: SubgraphRateLimiter;
  private readonly maxRetries = 5;
  private readonly baseRetryDelay = 1000;

  private constructor() {
    this.activityClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.activity,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.orderbookClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.orderbook,
      timeout: 15000, // Slightly longer timeout for orderbook queries
      headers: { 'Content-Type': 'application/json' },
    });

    this.walletClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.wallet,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.pnlClient = axios.create({
      baseURL: SUBGRAPH_ENDPOINTS.pnl,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Rate limit: 1 request per second (Goldsky public API has very strict limits)
    this.rateLimiter = new SubgraphRateLimiter(1);

    logger.info(
      'Polymarket subgraph client initialized with wallet mapping support'
    );
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

        // Calculate total volume (amounts are in USDC with 6 decimals)
        const splitVolume = splits.reduce((sum, s) => {
          return sum + usdcToUsd(s.amount);
        }, 0);
        const mergeVolume = merges.reduce((sum, m) => {
          return sum + usdcToUsd(m.amount);
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
          amountUSD: usdcToUsd(s.amount),
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
   * Get user positions data from the PNL subgraph
   * Gets actual position data including realized/unrealized PNL
   */
  public async getUserPositions(
    address: string
  ): Promise<UserPositions | null> {
    const normalizedAddress = address.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        // Use PNL subgraph to get user positions
        const response = await this.pnlClient.post<PositionsQueryResponse>('', {
          query: USER_POSITIONS_QUERY,
          variables: { address: normalizedAddress },
        });

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

        const userPositions = data.userPositions || [];
        if (userPositions.length === 0) {
          logger.debug(
            { address: normalizedAddress },
            'No positions found for user in PNL subgraph'
          );
          return null;
        }

        // Aggregate positions by condition (market)
        const positionsByCondition = new Map<string, number>();
        let totalValueUSD = 0;

        for (const position of userPositions) {
          const conditionId = position.conditionId || 'unknown';
          // Calculate position value from net deposits - withdrawals + unrealized PNL
          const netDeposits = usdcToUsd(position.netDeposits);
          const netWithdrawals = usdcToUsd(position.netWithdrawals);
          const unrealizedPnl = usdcToUsd(position.unrealizedPnl);
          const positionValue = netDeposits - netWithdrawals + unrealizedPnl;

          if (positionValue > 0) {
            const current = positionsByCondition.get(conditionId) || 0;
            positionsByCondition.set(conditionId, current + positionValue);
            totalValueUSD += positionValue;
          }
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
   * Get CLOB trading activity from the orderbook subgraph
   * This queries actual OrderFilled events (real trades on the CLOB)
   */
  public async getUserCLOBActivity(
    address: string
  ): Promise<UserCLOBActivity | null> {
    const normalizedAddress = address.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        // Query both maker and taker trades in parallel
        const [makerResponse, takerResponse] = await Promise.all([
          this.orderbookClient.post<OrderbookQueryResponse>('', {
            query: USER_CLOB_TRADES_MAKER_QUERY,
            variables: { address: normalizedAddress },
          }),
          this.orderbookClient.post<OrderbookQueryResponse>('', {
            query: USER_CLOB_TRADES_TAKER_QUERY,
            variables: { address: normalizedAddress },
          }),
        ]);

        // Check for errors
        if (makerResponse.data.errors && makerResponse.data.errors.length > 0) {
          logger.warn(
            { errors: makerResponse.data.errors, address: normalizedAddress },
            'Orderbook subgraph maker query returned errors'
          );
        }
        if (takerResponse.data.errors && takerResponse.data.errors.length > 0) {
          logger.warn(
            { errors: takerResponse.data.errors, address: normalizedAddress },
            'Orderbook subgraph taker query returned errors'
          );
        }

        const makerTrades = makerResponse.data.data?.orderFilledEvents || [];
        const takerTrades = takerResponse.data.data?.orderFilledEvents || [];

        // If no CLOB activity at all, return null
        if (makerTrades.length === 0 && takerTrades.length === 0) {
          logger.debug(
            { address: normalizedAddress },
            'No CLOB activity found for user in orderbook subgraph'
          );
          return null;
        }

        // Deduplicate trades (same trade could appear if wallet was both maker and taker somehow)
        const seenIds = new Set<string>();
        const allTrades: Array<{
          trade: SubgraphOrderFilled;
          side: 'maker' | 'taker';
        }> = [];

        for (const trade of makerTrades) {
          if (!seenIds.has(trade.id)) {
            seenIds.add(trade.id);
            allTrades.push({ trade, side: 'maker' });
          }
        }
        for (const trade of takerTrades) {
          if (!seenIds.has(trade.id)) {
            seenIds.add(trade.id);
            allTrades.push({ trade, side: 'taker' });
          }
        }

        // Sort by timestamp descending
        allTrades.sort(
          (a, b) => parseInt(b.trade.timestamp) - parseInt(a.trade.timestamp)
        );

        // Calculate metrics
        const tradeCount = allTrades.length;
        const asMaker = makerTrades.length;
        const asTaker = takerTrades.length;

        // Calculate volume (takerAmountFilled is typically USDC, 6 decimals)
        let totalVolumeUSD = 0;
        for (const { trade } of allTrades) {
          // Use takerAmountFilled as the trade size (usually USDC)
          totalVolumeUSD += usdcToUsd(trade.takerAmountFilled);
        }

        // Find earliest trade timestamp
        const allTimestamps = allTrades
          .map(({ trade }) => parseInt(trade.timestamp, 10))
          .filter((t) => !isNaN(t) && t > 0);

        const firstTradeTimestamp =
          allTimestamps.length > 0 ? Math.min(...allTimestamps) * 1000 : null;

        // Map recent trades
        const recentTrades = allTrades.slice(0, 100).map(({ trade, side }) => ({
          timestamp: parseInt(trade.timestamp, 10) * 1000,
          amountUSD: usdcToUsd(trade.takerAmountFilled),
          side,
          assetId: trade.makerAssetId || trade.takerAssetId || '',
        }));

        const activity: UserCLOBActivity = {
          address: normalizedAddress,
          tradeCount,
          totalVolumeUSD,
          firstTradeTimestamp,
          asMaker,
          asTaker,
          recentTrades,
        };

        logger.info(
          {
            address: normalizedAddress,
            clobTradeCount: activity.tradeCount,
            clobVolume: activity.totalVolumeUSD.toFixed(2),
            asMaker: activity.asMaker,
            asTaker: activity.asTaker,
          },
          'Fetched user CLOB activity from orderbook subgraph'
        );

        return activity;
      });
    });
  }

  /**
   * Resolve proxy wallet address to actual signer (user) address
   * This is critical for proper user identification since WebSocket gives us proxy addresses
   */
  public async getSignerFromProxy(
    proxyAddress: string
  ): Promise<string | null> {
    const normalizedAddress = proxyAddress.toLowerCase();

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.walletClient.post<WalletQueryResponse>('', {
          query: WALLET_SIGNER_QUERY,
          variables: { proxyAddress: normalizedAddress },
        });

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn(
            { errors: response.data.errors, proxyAddress: normalizedAddress },
            'GraphQL errors resolving proxy wallet'
          );
          throw new Error(
            `GraphQL errors: ${response.data.errors[0]?.message || 'Unknown error'}`
          );
        }

        if (!response.data.data?.wallet) {
          logger.debug(
            { proxyAddress: normalizedAddress },
            'No wallet mapping found for proxy address'
          );
          return null;
        }

        const wallet = response.data.data.wallet;
        logger.debug(
          {
            proxy: wallet.id,
            signer: wallet.signer,
            type: wallet.type,
          },
          'Resolved proxy wallet to signer'
        );

        return wallet.signer;
      });
    });
  }

  /**
   * Get recent trades from orderbook subgraph
   * Returns trades with both maker and taker addresses
   * @param sinceTimestamp - Unix timestamp in seconds to fetch trades after
   * @param limit - Maximum number of trades to fetch (default 1000)
   * @param assetIds - Optional filter for specific asset IDs (if not provided, fetches all)
   */
  public async getRecentTrades(
    sinceTimestamp: number,
    limit: number = 1000,
    assetIds?: string[]
  ): Promise<SubgraphOrderFilled[]> {
    const since = sinceTimestamp;

    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response =
          await this.orderbookClient.post<OrderbookQueryResponse>('', {
            query: RECENT_TRADES_QUERY,
            variables: {
              since: since.toString(),
              first: limit,
              assetIds: assetIds || [], // Pass empty array if no filter
            },
          });

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn(
            { errors: response.data.errors },
            'GraphQL errors fetching recent trades'
          );
          throw new Error(
            `GraphQL errors: ${response.data.errors[0]?.message || 'Unknown error'}`
          );
        }

        const trades = response.data.data?.orderFilledEvents || [];

        logger.info(
          {
            tradesFound: trades.length,
            sinceTimestamp,
            assetIdsCount: assetIds?.length || 0,
            oldestTimestamp:
              trades.length > 0
                ? new Date(
                    parseInt(trades[trades.length - 1]!.timestamp) * 1000
                  ).toISOString()
                : null,
            newestTimestamp:
              trades.length > 0
                ? new Date(parseInt(trades[0]!.timestamp) * 1000).toISOString()
                : null,
          },
          'Fetched recent trades from orderbook subgraph'
        );

        return trades;
      });
    });
  }

  /**
   * Get combined wallet data from all subgraphs
   * Now includes CLOB trading activity for accurate fingerprinting
   */
  public async getWalletData(address: string): Promise<SubgraphWalletData> {
    const normalizedAddress = address.toLowerCase();

    try {
      // Query all subgraphs in parallel
      const [activity, clobActivity, positions] = await Promise.all([
        this.getUserActivity(normalizedAddress),
        this.getUserCLOBActivity(normalizedAddress),
        this.getUserPositions(normalizedAddress),
      ]);

      logger.debug(
        {
          address: normalizedAddress,
          hasActivityData: !!activity,
          hasClobData: !!clobActivity,
          hasPositions: !!positions,
          activityTradeCount: activity?.tradeCount ?? 0,
          clobTradeCount: clobActivity?.tradeCount ?? 0,
        },
        'Combined wallet data from subgraphs'
      );

      return {
        activity,
        clobActivity,
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
        clobActivity: null,
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
      const isAxiosErr = isAxiosError ? error : null;
      const statusCode = isAxiosErr?.response?.status;
      const isRateLimited = statusCode === 429;
      const isRetryable =
        isAxiosError &&
        (error.response === undefined ||
          statusCode === 429 ||
          (statusCode !== undefined && statusCode >= 500));

      if (isRetryable && attempt < this.maxRetries) {
        // Back off more aggressively for rate limits (429)
        const baseDelay = isRateLimited ? 5000 : this.baseRetryDelay;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          {
            attempt,
            delay,
            statusCode,
            isRateLimited,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          `Retrying subgraph request${isRateLimited ? ' (rate limited)' : ''}`
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
