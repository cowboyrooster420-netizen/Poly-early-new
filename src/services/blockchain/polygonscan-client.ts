import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Polygonscan API response types
 */
interface PolygonscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  methodId: string;
  functionName: string;
}

interface PolygonscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

interface PolygonscanErc20Transfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

/**
 * Rate limiter for Polygonscan API
 */
class PolygonscanRateLimiter {
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

      // Clean up old timestamps
      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < 1000
      );

      // Check if we can make a request
      if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
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
 * Polygonscan API client
 * Production-grade client for blockchain data enrichment
 */
class PolygonscanClient {
  private static instance: PolygonscanClient | null = null;
  private readonly client: AxiosInstance;
  private readonly rateLimiter: PolygonscanRateLimiter;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000;

  private constructor() {
    const apiKey = env.POLYGONSCAN_API_KEY;

    this.client = axios.create({
      baseURL: 'https://api.polygonscan.com/api',
      timeout: 10000,
      params: {
        apikey: apiKey,
      },
    });

    // Rate limiter: 5 requests per second (Polygonscan free tier)
    this.rateLimiter = new PolygonscanRateLimiter(5);

    logger.info('Polygonscan client initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PolygonscanClient {
    if (PolygonscanClient.instance === null) {
      PolygonscanClient.instance = new PolygonscanClient();
    }
    return PolygonscanClient.instance;
  }

  /**
   * Get normal transactions for a wallet
   */
  public async getTransactions(params: {
    address: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    offset?: number;
  }): Promise<PolygonscanTransaction[]> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.get<
          PolygonscanResponse<PolygonscanTransaction[]>
        >('', {
          params: {
            module: 'account',
            action: 'txlist',
            address: params.address,
            startblock: params.startBlock ?? 0,
            endblock: params.endBlock ?? 99999999,
            page: params.page ?? 1,
            offset: params.offset ?? 100,
            sort: 'asc',
          },
        });

        if (response.data.status !== '1') {
          if (response.data.message === 'No transactions found') {
            return [];
          }
          throw new Error(`Polygonscan API error: ${response.data.message}`);
        }

        return response.data.result;
      });
    });
  }

  /**
   * Get ERC20 token transfers for a wallet
   */
  public async getErc20Transfers(params: {
    address: string;
    contractAddress?: string;
    startBlock?: number;
    endBlock?: number;
    page?: number;
    offset?: number;
  }): Promise<PolygonscanErc20Transfer[]> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.get<
          PolygonscanResponse<PolygonscanErc20Transfer[]>
        >('', {
          params: {
            module: 'account',
            action: 'tokentx',
            address: params.address,
            contractaddress: params.contractAddress,
            startblock: params.startBlock ?? 0,
            endblock: params.endBlock ?? 99999999,
            page: params.page ?? 1,
            offset: params.offset ?? 100,
            sort: 'asc',
          },
        });

        if (response.data.status !== '1') {
          if (response.data.message === 'No transactions found') {
            return [];
          }
          throw new Error(`Polygonscan API error: ${response.data.message}`);
        }

        return response.data.result;
      });
    });
  }

  /**
   * Get wallet's first transaction timestamp
   */
  public async getFirstTransactionTimestamp(
    address: string
  ): Promise<number | null> {
    try {
      const transactions = await this.getTransactions({
        address,
        page: 1,
        offset: 1,
      });

      if (transactions.length === 0) {
        return null;
      }

      return parseInt(transactions[0]!.timeStamp) * 1000; // Convert to ms
    } catch (error) {
      logger.error({ error, address }, 'Failed to get first transaction');
      return null;
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
          'Retrying Polygonscan request'
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
export const polygonscanClient = PolygonscanClient.getInstance();
export type { PolygonscanTransaction, PolygonscanErc20Transfer };
