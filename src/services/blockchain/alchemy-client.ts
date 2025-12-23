import axios, { type AxiosInstance, AxiosError } from 'axios';
import { getEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const env = getEnv();

/**
 * Alchemy API response types
 */
interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  value: number;
  asset: string;
  category: string;
  rawContract: {
    address: string | null;
    value: string | null;
    decimal: string | null;
  };
}

interface AlchemyAssetTransfersResponse {
  transfers: AlchemyTransfer[];
  pageKey?: string;
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
  error?: string;
}

interface AlchemyTokenBalancesResponse {
  address: string;
  tokenBalances: AlchemyTokenBalance[];
  pageKey?: string;
}

interface AlchemyTransactionCount {
  result: string;
}

interface AlchemyBlock {
  timestamp: string;
  number: string;
  hash: string;
}

interface AlchemyBlockResponse {
  result: AlchemyBlock;
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
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

      // Clean up old timestamps (older than 1 second)
      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < 1000
      );

      // Check if we can make a request
      if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
        // Wait until we can make another request
        const oldestTimestamp = this.requestTimestamps[0]!;
        const waitTime = 1000 - (now - oldestTimestamp);
        await this.sleep(waitTime);
        continue;
      }

      // Execute next request
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
 * Alchemy API client
 * Production-grade client with rate limiting, retries, and error handling
 */
class AlchemyClient {
  private static instance: AlchemyClient | null = null;
  private readonly client: AxiosInstance;
  private readonly rateLimiter: RateLimiter;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000; // 1 second

  private constructor() {
    const apiKey = env.ALCHEMY_API_KEY;
    const baseURL = `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`;

    this.client = axios.create({
      baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter: 25 requests per second (Alchemy growth plan limit)
    this.rateLimiter = new RateLimiter(25);

    logger.info('Alchemy client initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AlchemyClient {
    if (AlchemyClient.instance === null) {
      AlchemyClient.instance = new AlchemyClient();
    }
    return AlchemyClient.instance;
  }

  /**
   * Get asset transfers for a wallet
   * Used to analyze funding sources and activity patterns
   */
  public async getAssetTransfers(params: {
    address: string;
    category: string[];
    fromBlock?: string;
    toBlock?: string;
    maxCount?: number;
  }): Promise<AlchemyTransfer[]> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<AlchemyAssetTransfersResponse>(
          '',
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getAssetTransfers',
            params: [
              {
                fromBlock: params.fromBlock ?? '0x0',
                toBlock: params.toBlock ?? 'latest',
                toAddress: params.address,
                category: params.category,
                maxCount: params.maxCount ?? 1000,
                withMetadata: false,
                excludeZeroValue: true,
              },
            ],
          }
        );

        return response.data.transfers;
      });
    });
  }

  /**
   * Get transaction count for a wallet
   * Used to determine wallet age and activity level
   */
  public async getTransactionCount(address: string): Promise<number> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<AlchemyTransactionCount>('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [address, 'latest'],
        });

        return parseInt(response.data.result, 16);
      });
    });
  }

  /**
   * Get token balances for a wallet
   * Used to analyze portfolio diversity
   */
  public async getTokenBalances(
    address: string
  ): Promise<AlchemyTokenBalance[]> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<AlchemyTokenBalancesResponse>(
          '',
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenBalances',
            params: [address, 'erc20'],
          }
        );

        return response.data.tokenBalances.filter(
          (balance) => balance.error === undefined
        );
      });
    });
  }

  /**
   * Get first transaction timestamp for a wallet
   * Used to calculate wallet age
   */
  public async getFirstTransactionTimestamp(
    address: string
  ): Promise<number | null> {
    try {
      // Get incoming transfers to find wallet creation
      const transfers = await this.getAssetTransfers({
        address,
        category: ['external', 'internal', 'erc20', 'erc721', 'erc1155'],
        fromBlock: '0x0',
        maxCount: 1,
      });

      if (transfers.length === 0) {
        return null;
      }

      // Convert block number to timestamp
      const blockNum = parseInt(transfers[0]!.blockNum, 16);
      const timestamp = await this.getBlockTimestamp(blockNum);

      return timestamp;
    } catch (error) {
      logger.error({ error, address }, 'Failed to get first transaction');
      return null;
    }
  }

  /**
   * Get block timestamp
   */
  public async getBlockTimestamp(blockNumber: number): Promise<number> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<AlchemyBlockResponse>('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: [`0x${blockNumber.toString(16)}`, false],
        });

        return parseInt(response.data.result.timestamp, 16) * 1000; // Convert to ms
      });
    });
  }

  /**
   * Get current block number
   */
  public async getCurrentBlockNumber(): Promise<number> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<{ result: string }>('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        });

        return parseInt(response.data.result, 16);
      });
    });
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
          'Retrying Alchemy request'
        );

        await this.sleep(delay);
        return this.retryRequest(fn, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const alchemyClient = AlchemyClient.getInstance();
export type { AlchemyTransfer };
