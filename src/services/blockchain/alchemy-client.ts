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

interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

interface TransactionReceipt {
  from: string;
  to: string | null;
  logs: TransactionLog[];
  status: string;
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
        const maxCount = params.maxCount ?? 1000;
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
              maxCount: `0x${maxCount.toString(16)}`,
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
   * Get transaction by hash
   * Used to look up wallet addresses from trade transactions
   */
  public async getTransaction(
    txHash: string
  ): Promise<{ from: string; to: string | null } | null> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<
          | { result: { from: string; to: string | null } | null }
          | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionByHash',
          params: [txHash],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as {
          result: { from: string; to: string | null } | null;
        };
        return data.result;
      });
    });
  }

  /**
   * Get transaction receipt with logs
   * Used to parse OrderFilled events for real maker/taker addresses
   */
  public async getTransactionReceipt(
    txHash: string
  ): Promise<TransactionReceipt | null> {
    return this.rateLimiter.execute(async () => {
      return this.retryRequest(async () => {
        const response = await this.client.post<
          { result: TransactionReceipt | null } | JsonRpcErrorResponse
        >('', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (isJsonRpcError(response.data)) {
          throw new AlchemyApiError(
            response.data.error.code,
            response.data.error.message,
            response.data.error.data
          );
        }

        const data = response.data as { result: TransactionReceipt | null };
        return data.result;
      });
    });
  }

  /**
   * Extract trader address from transaction receipt logs
   * Parses OrderFilled/OrdersMatched events to get real maker/taker
   *
   * Polymarket CTF Exchange emits events with maker/taker as indexed params.
   * We look for logs with address-like values in topics[2] or topics[3].
   */
  public extractTraderFromReceipt(receipt: TransactionReceipt): string | null {
    // Polymarket CTF Exchange contract on Polygon
    const CTF_EXCHANGE =
      '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e'.toLowerCase();

    // Collect unique contract addresses for debugging
    const contractAddresses = new Set<string>();

    for (const log of receipt.logs) {
      contractAddresses.add(log.address.toLowerCase());

      // Check for CTF Exchange
      if (log.address.toLowerCase() === CTF_EXCHANGE) {
        // OrderFilled events typically have 4 topics:
        // [0] = event signature
        // [1] = orderHash (indexed)
        // [2] = maker address (indexed)
        // [3] = taker address (indexed)
        if (log.topics.length >= 4) {
          // Topics are 32 bytes, addresses are in the last 20 bytes
          // Format: 0x000000000000000000000000<address>
          const makerTopic = log.topics[2];
          const takerTopic = log.topics[3];

          if (makerTopic && takerTopic) {
            // Extract address from topic (last 40 chars = 20 bytes)
            const makerAddress = '0x' + makerTopic.slice(-40);
            const takerAddress = '0x' + takerTopic.slice(-40);

            // Return taker - they're the one who initiated the trade
            // (maker is the order book order, taker is who filled it)
            logger.debug(
              {
                txHash: receipt.from.slice(0, 10),
                maker: makerAddress.slice(0, 10),
                taker: takerAddress.slice(0, 10),
              },
              'Extracted trader addresses from OrderFilled event'
            );
            return takerAddress;
          }
        }
      }

      // Also check for any log with 4+ topics that might contain addresses
      // This catches OrderFilled events from other/newer contracts
      if (log.topics.length >= 4) {
        const topic2 = log.topics[2];
        const topic3 = log.topics[3];

        // Check if topics 2 and 3 look like addresses (have 12 leading zeros + 40 hex chars)
        if (
          topic2 &&
          topic3 &&
          topic2.startsWith('0x000000000000000000000000') &&
          topic3.startsWith('0x000000000000000000000000')
        ) {
          const addr2 = '0x' + topic2.slice(-40);
          const addr3 = '0x' + topic3.slice(-40);

          // Skip if addresses are zero address or look invalid
          if (
            addr2 !== '0x0000000000000000000000000000000000000000' &&
            addr3 !== '0x0000000000000000000000000000000000000000'
          ) {
            logger.debug(
              {
                contract: log.address.slice(0, 10),
                topic0: log.topics[0]?.slice(0, 16),
                maker: addr2.slice(0, 10),
                taker: addr3.slice(0, 10),
              },
              'Found potential OrderFilled event from different contract'
            );
            return addr3; // Return taker
          }
        }
      }
    }

    // Log what contracts we saw for debugging
    if (contractAddresses.size > 0) {
      logger.debug(
        { contracts: Array.from(contractAddresses).map((a) => a.slice(0, 12)) },
        'Contract addresses in transaction logs'
      );
    }

    return null;
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
