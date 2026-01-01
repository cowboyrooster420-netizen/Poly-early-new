import { alchemyClient } from './alchemy-client.js';
import { polygonscanClient } from './polygonscan-client.js';
import { redis } from '../cache/redis.js';
import { db, type PrismaClient } from '../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { isCexWallet, getCexExchange } from '../../config/cex-wallets.js';
import { getThresholds } from '../../config/thresholds.js';

const thresholds = getThresholds();

/**
 * Wallet fingerprint analysis result
 */
export interface WalletFingerprint {
  address: string;
  isSuspicious: boolean;
  flags: {
    cexFunded: boolean;
    lowTxCount: boolean;
    youngWallet: boolean;
    highPolymarketNetflow: boolean;
    singlePurpose: boolean;
  };
  metadata: {
    totalTransactions: number;
    walletAgeDays: number;
    firstSeenTimestamp: number | null;
    cexFundingSource: string | null;
    cexFundingTimestamp: number | null;
    polymarketNetflowPercentage: number;
    uniqueProtocolsInteracted: number;
  };
  analyzedAt: Date;
}

/**
 * Wallet forensics service
 * Production-grade on-chain analysis for detecting insider wallets
 */
class WalletForensicsService {
  private static instance: WalletForensicsService | null = null;
  private readonly CACHE_TTL_SECONDS = 86400; // 24 hours
  private readonly POLYMARKET_CTF_ADDRESS =
    '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'.toLowerCase();
  private readonly POLYMARKET_EXCHANGE_ADDRESS =
    '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'.toLowerCase();
  private readonly CEX_FUNDING_WINDOW_DAYS = thresholds.cexFundingWindowDays;

  private constructor() {
    logger.info('Wallet forensics service initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WalletForensicsService {
    if (WalletForensicsService.instance === null) {
      WalletForensicsService.instance = new WalletForensicsService();
    }
    return WalletForensicsService.instance;
  }

  /**
   * Analyze wallet and return fingerprint
   * Main entry point for wallet forensics
   * @param skipCache - If true, bypass cache and do fresh analysis
   */
  public async analyzeWallet(
    address: string,
    skipCache = false
  ): Promise<WalletFingerprint> {
    const normalizedAddress = address.toLowerCase().trim();

    // Guard against empty/invalid addresses
    if (!normalizedAddress || normalizedAddress.length < 42) {
      logger.warn(
        { address, normalized: normalizedAddress },
        'Invalid or empty wallet address - skipping analysis'
      );
      return this.createEmptyFingerprint(normalizedAddress);
    }

    // Check cache first (unless skipped)
    if (!skipCache) {
      const cached = await this.getCachedFingerprint(normalizedAddress);
      if (cached !== null) {
        logger.debug(
          { address: normalizedAddress },
          'Wallet fingerprint cache hit'
        );
        return cached;
      }
    }

    logger.info(
      { address: normalizedAddress, skipCache },
      'Analyzing wallet fingerprint'
    );

    try {
      // Run all analyses in parallel for performance
      const [
        txCount,
        walletAge,
        cexFunding,
        polymarketActivity,
        protocolDiversity,
      ] = await Promise.all([
        this.getTransactionCount(normalizedAddress),
        this.getWalletAge(normalizedAddress),
        this.checkCexFunding(normalizedAddress),
        this.analyzePolymarketActivity(normalizedAddress),
        this.analyzeProtocolDiversity(normalizedAddress),
      ]);

      // Calculate flags
      const flags = {
        cexFunded: cexFunding.isFunded,
        lowTxCount: txCount < thresholds.maxWalletTransactions,
        youngWallet:
          walletAge.ageDays !== null &&
          walletAge.ageDays < thresholds.minWalletAgeInDays,
        highPolymarketNetflow:
          polymarketActivity.netflowPercentage >=
          thresholds.minNetflowPercentage,
        singlePurpose: protocolDiversity.uniqueProtocols <= 2,
      };

      // Wallet is suspicious if it has multiple red flags
      const suspiciousFlags = Object.values(flags).filter(Boolean).length;
      const isSuspicious = suspiciousFlags >= 3;

      const fingerprint: WalletFingerprint = {
        address: normalizedAddress,
        isSuspicious,
        flags,
        metadata: {
          totalTransactions: txCount,
          walletAgeDays: walletAge.ageDays ?? 0,
          firstSeenTimestamp: walletAge.firstSeenTimestamp,
          cexFundingSource: cexFunding.exchange,
          cexFundingTimestamp: cexFunding.timestamp,
          polymarketNetflowPercentage: polymarketActivity.netflowPercentage,
          uniqueProtocolsInteracted: protocolDiversity.uniqueProtocols,
        },
        analyzedAt: new Date(),
      };

      // Cache the result
      await this.cacheFingerprint(normalizedAddress, fingerprint);

      // Persist to database
      await this.persistFingerprint(fingerprint);

      logger.info(
        {
          address: normalizedAddress,
          isSuspicious,
          flags,
        },
        'Wallet fingerprint analysis complete'
      );

      return fingerprint;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address: normalizedAddress,
        },
        'Failed to analyze wallet fingerprint - returning default'
      );

      // Return a default fingerprint instead of throwing
      // This ensures signal detection can continue even if wallet analysis fails
      const defaultFingerprint: WalletFingerprint = {
        address: normalizedAddress,
        isSuspicious: false,
        flags: {
          cexFunded: false,
          lowTxCount: false,
          youngWallet: false,
          highPolymarketNetflow: false,
          singlePurpose: false,
        },
        metadata: {
          totalTransactions: 0,
          walletAgeDays: 0,
          firstSeenTimestamp: null,
          cexFundingSource: null,
          cexFundingTimestamp: null,
          polymarketNetflowPercentage: 0,
          uniqueProtocolsInteracted: 0,
        },
        analyzedAt: new Date(),
      };

      return defaultFingerprint;
    }
  }

  /**
   * Get transaction count for wallet
   * Uses asset transfers to count ALL transactions including internal ones
   * (eth_getTransactionCount only returns nonce - transactions SENT by wallet)
   */
  private async getTransactionCount(address: string): Promise<number> {
    try {
      // Get all incoming transfers (includes internal txs from Polymarket trades)
      const transfers = await alchemyClient.getAssetTransfers({
        address,
        category: ['external', 'internal', 'erc20'],
        fromBlock: '0x0',
        maxCount: 1000,
      });

      // Count unique transaction hashes
      const uniqueTxHashes = new Set(transfers.map((t) => t.hash));
      return uniqueTxHashes.size;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to get transaction count: ${errorMsg}`
      );
      return 0;
    }
  }

  /**
   * Get wallet age in days
   */
  private async getWalletAge(
    address: string
  ): Promise<{ ageDays: number | null; firstSeenTimestamp: number | null }> {
    try {
      // Try Alchemy first (faster)
      let firstTxTimestamp =
        await alchemyClient.getFirstTransactionTimestamp(address);

      // Fallback to Polygonscan if Alchemy fails
      if (firstTxTimestamp === null) {
        firstTxTimestamp =
          await polygonscanClient.getFirstTransactionTimestamp(address);
      }

      if (firstTxTimestamp === null) {
        return { ageDays: null, firstSeenTimestamp: null };
      }

      const ageDays = Math.floor(
        (Date.now() - firstTxTimestamp) / (1000 * 60 * 60 * 24)
      );

      return { ageDays, firstSeenTimestamp: firstTxTimestamp };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to get wallet age: ${errorMsg}`
      );
      return { ageDays: null, firstSeenTimestamp: null };
    }
  }

  /**
   * Check if wallet was funded by a CEX in the last N days
   */
  private async checkCexFunding(address: string): Promise<{
    isFunded: boolean;
    exchange: string | null;
    timestamp: number | null;
  }> {
    try {
      // Calculate cutoff timestamp (N days ago)
      const cutoffTimestamp =
        Date.now() - this.CEX_FUNDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const cutoffBlockHex =
        await this.getBlockNumberFromTimestamp(cutoffTimestamp);

      // Get incoming transfers from the last N days
      const transfers = await alchemyClient.getAssetTransfers({
        address,
        category: ['external', 'internal', 'erc20'],
        fromBlock: cutoffBlockHex,
        maxCount: 1000,
      });

      // Check if any transfer is from a known CEX
      for (const transfer of transfers) {
        const fromAddress = transfer.from.toLowerCase();
        if (isCexWallet(fromAddress)) {
          const exchange = getCexExchange(fromAddress) ?? null;
          const blockNum = parseInt(transfer.blockNum, 16);
          const timestamp = await this.getBlockTimestamp(blockNum);

          logger.info(
            {
              address,
              exchange,
              fromAddress,
              timestamp: new Date(timestamp).toISOString(),
            },
            'CEX funding detected'
          );

          return { isFunded: true, exchange, timestamp };
        }
      }

      return { isFunded: false, exchange: null, timestamp: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to check CEX funding: ${errorMsg}`
      );
      return { isFunded: false, exchange: null, timestamp: null };
    }
  }

  /**
   * Analyze Polymarket activity and calculate netflow percentage
   */
  private async analyzePolymarketActivity(
    address: string
  ): Promise<{ netflowPercentage: number }> {
    try {
      // Get all transfers for the wallet
      const transfers = await alchemyClient.getAssetTransfers({
        address,
        category: ['external', 'internal', 'erc20'],
        fromBlock: '0x0',
        maxCount: 1000,
      });

      if (transfers.length === 0) {
        return { netflowPercentage: 0 };
      }

      // Calculate total inflow and Polymarket inflow
      let totalInflow = 0;
      let polymarketInflow = 0;

      for (const transfer of transfers) {
        const value = transfer.value;
        totalInflow += value;

        // Check if transfer is to/from Polymarket contracts
        const fromAddress = transfer.from.toLowerCase();
        const toAddress = transfer.to?.toLowerCase() ?? '';

        if (
          fromAddress === this.POLYMARKET_CTF_ADDRESS ||
          fromAddress === this.POLYMARKET_EXCHANGE_ADDRESS ||
          toAddress === this.POLYMARKET_CTF_ADDRESS ||
          toAddress === this.POLYMARKET_EXCHANGE_ADDRESS
        ) {
          polymarketInflow += value;
        }
      }

      const netflowPercentage =
        totalInflow > 0 ? (polymarketInflow / totalInflow) * 100 : 0;

      return { netflowPercentage };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to analyze Polymarket activity: ${errorMsg}`
      );
      return { netflowPercentage: 0 };
    }
  }

  /**
   * Analyze protocol diversity
   * Counts unique contract addresses interacted with (excluding Polymarket)
   */
  private async analyzeProtocolDiversity(
    address: string
  ): Promise<{ uniqueProtocols: number }> {
    try {
      // Get all transactions
      const transactions = await polygonscanClient.getTransactions({
        address,
        offset: 1000,
      });

      if (transactions.length === 0) {
        return { uniqueProtocols: 0 };
      }

      // Count unique contract addresses (non-EOA interactions)
      const uniqueContracts = new Set<string>();

      for (const tx of transactions) {
        // Skip contract creation transactions (no to address)
        if (!tx.to) {
          continue;
        }

        const toAddress = tx.to.toLowerCase();

        // Skip if it's a Polymarket contract
        if (
          toAddress === this.POLYMARKET_CTF_ADDRESS ||
          toAddress === this.POLYMARKET_EXCHANGE_ADDRESS
        ) {
          continue;
        }

        // Skip if it's a simple transfer (no method ID)
        if (tx.methodId === '0x' || tx.methodId === '') {
          continue;
        }

        uniqueContracts.add(toAddress);
      }

      return { uniqueProtocols: uniqueContracts.size };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg, address },
        `Failed to analyze protocol diversity: ${errorMsg}`
      );
      return { uniqueProtocols: 0 };
    }
  }

  /**
   * Create an empty fingerprint for invalid addresses
   * Not cached - we don't want to pollute cache with bad data
   */
  private createEmptyFingerprint(address: string): WalletFingerprint {
    return {
      address: address || 'unknown',
      isSuspicious: false,
      flags: {
        cexFunded: false,
        lowTxCount: false,
        youngWallet: false,
        highPolymarketNetflow: false,
        singlePurpose: false,
      },
      metadata: {
        totalTransactions: 0,
        walletAgeDays: 0,
        firstSeenTimestamp: null,
        cexFundingSource: null,
        cexFundingTimestamp: null,
        polymarketNetflowPercentage: 0,
        uniqueProtocolsInteracted: 0,
      },
      analyzedAt: new Date(),
    };
  }

  /**
   * Get cached wallet fingerprint
   */
  private async getCachedFingerprint(
    address: string
  ): Promise<WalletFingerprint | null> {
    try {
      const cached = await redis.getJSON<WalletFingerprint>(
        `wallet:fingerprint:${address}`
      );

      if (cached !== null) {
        // Reconstitute Date object
        cached.analyzedAt = new Date(cached.analyzedAt);
      }

      return cached;
    } catch (error) {
      logger.warn({ error, address }, 'Failed to get cached fingerprint');
      return null;
    }
  }

  /**
   * Cache wallet fingerprint
   */
  private async cacheFingerprint(
    address: string,
    fingerprint: WalletFingerprint
  ): Promise<void> {
    try {
      await redis.setJSON(
        `wallet:fingerprint:${address}`,
        fingerprint,
        this.CACHE_TTL_SECONDS
      );
    } catch (error) {
      logger.warn({ error, address }, 'Failed to cache fingerprint');
    }
  }

  /**
   * Persist wallet fingerprint to database
   */
  private async persistFingerprint(
    fingerprint: WalletFingerprint
  ): Promise<void> {
    try {
      await db.executeTransaction(async (prisma: PrismaClient) => {
        await prisma.wallet.upsert({
          where: { address: fingerprint.address },
          create: {
            address: fingerprint.address,
            totalTransactions: fingerprint.metadata.totalTransactions,
            walletAgeDays: fingerprint.metadata.walletAgeDays,
            firstSeenTimestamp: fingerprint.metadata.firstSeenTimestamp
              ? new Date(fingerprint.metadata.firstSeenTimestamp)
              : null,
            cexFundingSource: fingerprint.metadata.cexFundingSource,
            cexFundingTimestamp: fingerprint.metadata.cexFundingTimestamp
              ? new Date(fingerprint.metadata.cexFundingTimestamp)
              : null,
            polymarketNetflowPercentage:
              fingerprint.metadata.polymarketNetflowPercentage,
            uniqueProtocolsInteracted:
              fingerprint.metadata.uniqueProtocolsInteracted,
            isSuspicious: fingerprint.isSuspicious,
            flagCexFunded: fingerprint.flags.cexFunded,
            flagLowTxCount: fingerprint.flags.lowTxCount,
            flagYoungWallet: fingerprint.flags.youngWallet,
            flagHighPolymarketNetflow: fingerprint.flags.highPolymarketNetflow,
            flagSinglePurpose: fingerprint.flags.singlePurpose,
            analyzedAt: fingerprint.analyzedAt,
          },
          update: {
            totalTransactions: fingerprint.metadata.totalTransactions,
            walletAgeDays: fingerprint.metadata.walletAgeDays,
            firstSeenTimestamp: fingerprint.metadata.firstSeenTimestamp
              ? new Date(fingerprint.metadata.firstSeenTimestamp)
              : null,
            cexFundingSource: fingerprint.metadata.cexFundingSource,
            cexFundingTimestamp: fingerprint.metadata.cexFundingTimestamp
              ? new Date(fingerprint.metadata.cexFundingTimestamp)
              : null,
            polymarketNetflowPercentage:
              fingerprint.metadata.polymarketNetflowPercentage,
            uniqueProtocolsInteracted:
              fingerprint.metadata.uniqueProtocolsInteracted,
            isSuspicious: fingerprint.isSuspicious,
            flagCexFunded: fingerprint.flags.cexFunded,
            flagLowTxCount: fingerprint.flags.lowTxCount,
            flagYoungWallet: fingerprint.flags.youngWallet,
            flagHighPolymarketNetflow: fingerprint.flags.highPolymarketNetflow,
            flagSinglePurpose: fingerprint.flags.singlePurpose,
            analyzedAt: fingerprint.analyzedAt,
          },
        });
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address: fingerprint.address,
        },
        'Failed to persist fingerprint'
      );
      // Don't throw - persistence failure shouldn't break the analysis
    }
  }

  /**
   * Helper: Get block number from timestamp (approximate)
   */
  private async getBlockNumberFromTimestamp(
    timestamp: number
  ): Promise<string> {
    // Polygon block time is approximately 2 seconds
    const currentBlock = await alchemyClient.getCurrentBlockNumber();
    const blocksSince = Math.floor((Date.now() - timestamp) / 2000);
    const estimatedBlock = Math.max(0, currentBlock - blocksSince);

    return `0x${estimatedBlock.toString(16)}`;
  }

  /**
   * Helper: Get block timestamp
   */
  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    return alchemyClient.getBlockTimestamp(blockNumber);
  }
}

// Export singleton instance
export const walletForensicsService = WalletForensicsService.getInstance();
