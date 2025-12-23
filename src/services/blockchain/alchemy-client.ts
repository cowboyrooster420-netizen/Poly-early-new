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

interface AlchemyAssetTransfersResult {
  transfers: AlchemyTransfer[];
  pageKey?: string;
}

interface AlchemyAssetTransfersResponse {
  result: AlchemyAssetTransfersResult;
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
  error?: string;
}

interface AlchemyTokenBalancesResult {
  address: string;
  tokenBalances: AlchemyTokenBalance[];
  pageKey?: string;
}

interface AlchemyTokenBalancesResponse {
  result: AlchemyTokenBalancesResult;
}

interface AlchemyTransactionCount {
  result: string;
}

/**
 * JSON-RPC error response
 */
interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: string;
  id: number;
  error: JsonRpcError;
}

/**
 * Check if response is a JSON-RPC error
 */
function isJsonRpcError(
  data: unknown
): data is { error: JsonRpcError; result?: undefined } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'object'
  );
}

/**
 * Custom error class for Alchemy API errors
 */
class AlchemyApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(`Alchemy API Error ${code}: ${message}`);
    this.name = 'AlchemyApiError';
  }
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
        const response = await this.client.post<
          AlchemyAssetTransfersResponse | JsonRpcErrorResponse
        >('', {
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
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as AlchemyAssetTransfersResponse;
        return data.result.transfers;
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
        const response = await this.client.post<
          AlchemyTransactionCount | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [address, 'latest'],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as AlchemyTransactionCount;
        return parseInt(data.result, 16);
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
        const response = await this.client.post<
          AlchemyTokenBalancesResponse | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenBalances',
          params: [address, 'erc20'],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as AlchemyTokenBalancesResponse;
        return data.result.tokenBalances.filter(
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to get first transaction: ${errorMsg}`
      );
      return null;
    }
  }

  /**
   * Get block timestamp
   */
  public async getBlockTimestamp(blockNumber: number): Promise<number> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<
          AlchemyBlockResponse | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: [`0x${blockNumber.toString(16)}`, false],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as AlchemyBlockResponse;
        return parseInt(data.result.timestamp, 16) * 1000; // Convert to ms
      });
    });
  }

  /**
   * Get current block number
   */
  public async getCurrentBlockNumber(): Promise<number> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<
          { result: string } | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as { result: string };
        return parseInt(data.result, 16);
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
