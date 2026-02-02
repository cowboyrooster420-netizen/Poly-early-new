import { type SubgraphWalletData } from '../polymarket/subgraph-client.js';
import { polymarketDataApi } from '../polymarket/data-api-client.js';
import { redis } from '../cache/redis.js';
import { db, type PrismaClient } from '../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { getThresholds } from '../../config/thresholds.js';
import { normalizeVolume } from '../../utils/decimals.js';
import { DecisionFramework } from '../data/decision-framework.js';
import { calculateConfidence } from './confidence-calculator.js';
import type { FingerprintStatus, DataCompleteness } from '../../types/index.js';
import { withLock } from '../../utils/distributed-lock.js';

const thresholds = getThresholds();

/**
 * Wallet analysis flags for insider detection
 * Derived from Polymarket Data API
 */
export interface WalletFlags {
  lowTradeCount: boolean; // Few trades on Polymarket
  youngAccount: boolean; // Recently started trading
  lowVolume: boolean; // Low lifetime volume
  highConcentration: boolean; // Most value in one market
  freshFatBet: boolean; // New wallet + large bet pattern
  lowDiversification: boolean; // Trades only 1-3 markets (insider signal)
}

// Keep old name as alias for backwards compatibility
export type SubgraphFlags = WalletFlags;

/**
 * Wallet fingerprint analysis result (simplified for subgraph-only)
 */
export interface WalletFingerprint {
  address: string;
  status: FingerprintStatus;
  isSuspicious: boolean;
  walletFlags: WalletFlags;
  // Alias for backwards compatibility
  subgraphFlags: WalletFlags;
  walletMetadata: {
    polymarketTradeCount: number;
    polymarketVolumeUSD: number;
    polymarketAccountAgeDays: number | null;
    maxPositionConcentration: number;
    marketsTraded: number; // Distinct markets traded (for diversification check)
    dataSource: 'subgraph' | 'data-api' | 'mixed' | 'cache';
  };
  // Alias for backwards compatibility
  subgraphMetadata: WalletFingerprint['walletMetadata'];
  analyzedAt: Date;

  // Error tracking
  errorReason?: string;
  dataCompleteness: DataCompleteness;

  // Confidence scoring based on data availability
  confidenceLevel: 'high' | 'medium' | 'low' | 'none';

  // Backwards compatibility - map subgraph flags to old structure
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
}

/**
 * Simplified wallet forensics service - Polymarket subgraph only
 * Since Polymarket uses proxy wallets, on-chain analysis is not useful
 */
class WalletForensicsService {
  private static instance: WalletForensicsService | null = null;
  private readonly SUBGRAPH_CACHE_TTL_SECONDS =
    thresholds.walletCacheTTLHours * 3600;

  // In-memory cache for recently analyzed wallets (faster than Redis)
  // Key: address, Value: { fingerprint, timestamp }
  private readonly recentWallets = new Map<
    string,
    { fingerprint: WalletFingerprint; timestamp: number }
  >();
  private readonly RECENT_WALLET_TTL_MS = 15 * 60 * 1000; // 15 minutes (increased to reduce subgraph load)
  private readonly MAX_RECENT_WALLETS = 2000; // Increased to cache more wallets
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  private constructor() {
    logger.info('Wallet forensics service initialized (Data API mode)');
    // Start periodic cleanup for wallet cache
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup interval for expired cache entries
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupIntervalId !== null) {
      return; // Already running
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.CLEANUP_INTERVAL_MS);

    logger.info(
      { intervalMs: this.CLEANUP_INTERVAL_MS },
      'Started periodic wallet cache cleanup'
    );
  }

  /**
   * Clean up expired entries from the in-memory wallet cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [addr, data] of this.recentWallets) {
      if (now - data.timestamp > this.RECENT_WALLET_TTL_MS) {
        this.recentWallets.delete(addr);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(
        { removedCount, remainingCount: this.recentWallets.size },
        'Cleaned up expired wallet cache entries'
      );
    }
  }

  /**
   * Stop the periodic cleanup (for graceful shutdown)
   */
  public stopPeriodicCleanup(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      logger.info('Stopped periodic wallet cache cleanup');
    }
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
   * Analyze wallet using Polymarket subgraph data
   * This is the ONLY method for wallet analysis now
   */
  public async analyzeWallet(
    address: string,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): Promise<WalletFingerprint> {
    const normalizedAddress = address.toLowerCase().trim();

    // Validate Ethereum address format
    const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethereumAddressRegex.test(normalizedAddress)) {
      logger.warn(
        { address, normalizedAddress },
        'Invalid Ethereum address format provided'
      );
      return this.createErrorFingerprint(
        normalizedAddress,
        'Invalid Ethereum address format',
        {
          dataApi: false,
          subgraph: false,
          cache: false,
          timestamp: Date.now(),
        },
        undefined
      );
    }

    // Check in-memory cache first (fastest, avoids Redis and subgraph)
    const recent = this.recentWallets.get(normalizedAddress);
    if (recent && Date.now() - recent.timestamp < this.RECENT_WALLET_TTL_MS) {
      logger.debug(
        { address: normalizedAddress, cacheAge: Date.now() - recent.timestamp },
        'Wallet fingerprint in-memory cache hit (skipping subgraph)'
      );
      return recent.fingerprint;
    }

    // Use distributed lock to prevent concurrent analysis of same wallet
    // Cache update is inside the lock to prevent race conditions
    const fingerprint = await withLock(
      `wallet-analysis:${normalizedAddress}`,
      async () => {
        const result = await this.analyzeWalletInternal(
          normalizedAddress,
          tradeContext
        );
        // Update in-memory cache inside the lock to prevent race conditions
        this.updateRecentWallets(normalizedAddress, result);
        return result;
      },
      {
        ttl: 60000, // 60 second lock
        maxRetries: 100, // Wait up to 10 seconds
        retryDelay: 100,
      }
    );

    return fingerprint;
  }

  /**
   * Update in-memory cache with cleanup
   */
  private updateRecentWallets(
    address: string,
    fingerprint: WalletFingerprint
  ): void {
    // Cleanup old entries if over limit
    if (this.recentWallets.size >= this.MAX_RECENT_WALLETS) {
      const now = Date.now();
      for (const [addr, data] of this.recentWallets) {
        if (now - data.timestamp > this.RECENT_WALLET_TTL_MS) {
          this.recentWallets.delete(addr);
        }
      }
      // If still over limit, remove oldest half
      if (this.recentWallets.size >= this.MAX_RECENT_WALLETS) {
        const entries = Array.from(this.recentWallets.entries()).sort(
          (a, b) => a[1].timestamp - b[1].timestamp
        );
        const toRemove = entries.slice(0, Math.floor(entries.length / 2));
        for (const [addr] of toRemove) {
          this.recentWallets.delete(addr);
        }
      }
    }

    this.recentWallets.set(address, { fingerprint, timestamp: Date.now() });
  }

  /**
   * Internal wallet analysis implementation
   */
  private async analyzeWalletInternal(
    normalizedAddress: string,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): Promise<WalletFingerprint> {
    const startTime = Date.now();

    // Check cache first
    try {
      const cached = await this.getCachedFingerprint(normalizedAddress);
      if (cached !== null) {
        logger.debug(
          {
            address: normalizedAddress,
            cacheAge: Date.now() - cached.analyzedAt.getTime(),
          },
          'Wallet fingerprint cache hit'
        );
        return cached;
      }
    } catch (cacheError) {
      // Use decision framework for cache errors
      const decision = DecisionFramework.handleMarketDataError(cacheError, {
        marketId: normalizedAddress, // Using address as ID for context
        dataType: 'info',
        source: 'cache',
      });

      await DecisionFramework.executeDecision(decision, {
        onProceed: () => {
          // Continue without cache - normal behavior
        },
      });
    }

    logger.info(
      { address: normalizedAddress },
      'Analyzing wallet via Data API'
    );

    const dataCompleteness: DataCompleteness = {
      dataApi: false,
      subgraph: false,
      cache: false,
      timestamp: Date.now(),
    };

    const errors: string[] = [];

    // Use Data API for wallet analysis (no rate limiting issues)
    try {
      const dataApiData =
        await polymarketDataApi.getUserData(normalizedAddress);

      dataCompleteness.dataApi = true;

      // Check if we have data
      const hasData =
        dataApiData.activity || dataApiData.recentTrades.length > 0;

      if (!hasData) {
        logger.info(
          {
            address: normalizedAddress,
            responseTime: Date.now() - startTime,
          },
          'No data found in Data API - new user'
        );
        return this.createNewUserFingerprint(normalizedAddress, tradeContext);
      }

      // Extract metrics from Data API response
      const activity = dataApiData.activity;
      const tradeCount =
        activity?.totalTrades ?? dataApiData.recentTrades.length;
      const volumeUSD = parseFloat(activity?.totalVolume ?? '0');
      const firstTradeTimestamp = activity?.firstTradeTimestamp ?? null;

      // Account age
      let accountAgeDays: number | null = null;
      if (firstTradeTimestamp) {
        accountAgeDays = Math.floor(
          (Date.now() - firstTradeTimestamp * 1000) / (1000 * 60 * 60 * 24)
        );
      }

      // Calculate position concentration and diversification from recent trades
      const marketCounts = new Map<string, number>();
      for (const trade of dataApiData.recentTrades) {
        const count = marketCounts.get(trade.conditionId) || 0;
        marketCounts.set(trade.conditionId, count + 1);
      }
      const maxMarketTrades = Math.max(...marketCounts.values(), 0);
      const totalTrades = dataApiData.recentTrades.length;
      const maxPositionConcentration =
        totalTrades > 0 ? (maxMarketTrades / totalTrades) * 100 : 0;

      // Count distinct markets for diversification check
      const marketsTraded = marketCounts.size;

      // Calculate flags using Data API data
      const walletFlags = this.calculateFlagsFromDataApi(
        tradeCount,
        volumeUSD,
        accountAgeDays,
        maxPositionConcentration,
        marketsTraded,
        tradeContext
      );

      // Determine if suspicious (2+ flags = suspicious)
      const suspiciousFlagCount =
        Object.values(walletFlags).filter(Boolean).length;
      const isSuspicious = suspiciousFlagCount >= 2;

      // Create SubgraphWalletData-like structure for confidence calculation
      const walletDataForConfidence: SubgraphWalletData = {
        activity: null, // Not using splits/merges data
        clobActivity: {
          address: normalizedAddress,
          tradeCount,
          totalVolumeUSD: volumeUSD,
          firstTradeTimestamp: firstTradeTimestamp ?? null,
          asMaker: 0,
          asTaker: tradeCount,
          recentTrades: [],
        },
        positions: {
          address: normalizedAddress,
          positions: Array.from(marketCounts.entries()).map(
            ([marketId, count]) => ({
              marketId,
              valueUSD: count, // Using trade count as proxy
            })
          ),
          totalValueUSD: volumeUSD,
          maxPositionPercentage: maxPositionConcentration,
        },
        queriedAt: new Date(),
      };

      const confidence = calculateConfidence(
        dataCompleteness,
        walletDataForConfidence,
        dataApiData,
        errors.length > 0 ? errors : undefined
      );

      const metadata = {
        polymarketTradeCount: tradeCount,
        polymarketVolumeUSD: volumeUSD,
        polymarketAccountAgeDays: accountAgeDays,
        maxPositionConcentration,
        marketsTraded,
        dataSource: 'data-api' as const,
      };

      const fingerprint: WalletFingerprint = {
        address: normalizedAddress,
        status: 'success' as FingerprintStatus,
        isSuspicious,
        dataCompleteness,
        confidenceLevel: confidence.level,
        walletFlags,
        subgraphFlags: walletFlags, // Backwards compatibility alias
        walletMetadata: metadata,
        subgraphMetadata: metadata, // Backwards compatibility alias
        analyzedAt: new Date(),
        // Backwards compatibility
        flags: {
          cexFunded: false, // Cannot detect with proxy wallets
          lowTxCount: walletFlags.lowTradeCount,
          youngWallet: walletFlags.youngAccount,
          highPolymarketNetflow: true, // Always true for Polymarket users
          singlePurpose: walletFlags.highConcentration,
        },
        metadata: {
          totalTransactions: tradeCount,
          walletAgeDays: accountAgeDays ?? 0,
          firstSeenTimestamp: firstTradeTimestamp
            ? firstTradeTimestamp * 1000
            : null,
          cexFundingSource: null,
          cexFundingTimestamp: null,
          polymarketNetflowPercentage: 100,
          uniqueProtocolsInteracted: 1,
        },
      };

      // Cache and persist
      await this.cacheFingerprint(normalizedAddress, fingerprint);
      await this.persistFingerprint(fingerprint);

      logger.info(
        {
          address: normalizedAddress,
          status: 'success',
          responseTime: Date.now() - startTime,
          isSuspicious,
          walletFlags,
          tradeCount,
          volumeUSD,
          accountAgeDays,
          marketsTraded,
          dataSource: 'data-api',
        },
        'Wallet analysis complete via Data API'
      );

      return fingerprint;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`DataAPI: ${errorMsg}`);
      logger.error(
        {
          error: errorMsg,
          address: normalizedAddress,
          responseTime: Date.now() - startTime,
          dataCompleteness,
        },
        'Data API wallet analysis failed'
      );
    }

    // Data API failed - return error fingerprint
    return this.createErrorFingerprint(
      normalizedAddress,
      errors.join('; '),
      dataCompleteness,
      undefined
    );
  }

  /**
   * Calculate flags from Data API data
   */
  private calculateFlagsFromDataApi(
    tradeCount: number,
    volumeUSD: number,
    accountAgeDays: number | null,
    maxPositionConcentration: number,
    marketsTraded: number,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): WalletFlags {
    // lowTradeCount: Wallet has fewer than threshold trades
    const lowTradeCount = tradeCount <= thresholds.walletLowTradeCount;

    // youngAccount: Wallet first trade is recent
    const youngAccount =
      accountAgeDays === null ||
      accountAgeDays <= thresholds.walletYoungAccountDays;

    // lowVolume: Lifetime volume below threshold
    const lowVolume = volumeUSD <= thresholds.walletLowVolumeUSD;

    // highConcentration: Majority of position value in one market
    const highConcentration =
      maxPositionConcentration >= thresholds.walletHighConcentrationPct;

    // lowDiversification: Only trades 1-3 distinct markets (INSIDER SIGNAL)
    // Whales diversify across many markets, insiders focus on what they know
    const diversificationThreshold =
      thresholds.walletDiversificationThreshold ?? 3;
    const lowDiversification = marketsTraded <= diversificationThreshold;

    // freshFatBet: New wallet making large bets
    let freshFatBet = false;
    if (tradeContext) {
      const priorTrades = tradeCount - 1;
      const isLargeTrade =
        tradeContext.tradeSizeUSD >= thresholds.walletFreshFatBetSizeUSD;
      const isSmallMarket =
        tradeContext.marketOI <= thresholds.walletFreshFatBetMaxOI;
      const isFreshAccount =
        priorTrades <= thresholds.walletFreshFatBetPriorTrades;

      freshFatBet = isLargeTrade && isSmallMarket && isFreshAccount;

      if (freshFatBet) {
        logger.info(
          {
            priorTrades,
            tradeSizeUSD: tradeContext.tradeSizeUSD,
            marketOI: tradeContext.marketOI,
          },
          'Fresh fat bet pattern detected'
        );
      }
    }

    // Log diversification status for insider detection
    if (lowDiversification && (youngAccount || lowTradeCount)) {
      logger.info(
        {
          marketsTraded,
          diversificationThreshold,
          youngAccount,
          lowTradeCount,
        },
        '🎯 Low diversification + fresh account = potential insider pattern'
      );
    }

    return {
      lowTradeCount,
      youngAccount,
      lowVolume,
      highConcentration,
      freshFatBet,
      lowDiversification,
    };
  }

  // Note: analyzeWalletViaSubgraph method removed - use analyzeWallet instead

  /**
   * Calculate wallet flags from subgraph data (legacy method)
   */
  private calculateSubgraphFlags(
    data: SubgraphWalletData,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): WalletFlags {
    const clobActivity = data.clobActivity;
    const splitActivity = data.activity;
    const positions = data.positions;

    // Combined metrics
    const combinedTradeCount =
      (clobActivity?.tradeCount ?? 0) + (splitActivity?.tradeCount ?? 0);
    const combinedVolumeUSD =
      normalizeVolume(clobActivity?.totalVolumeUSD, 'subgraph') +
      normalizeVolume(splitActivity?.totalVolumeUSD, 'subgraph');

    // First trade timestamp
    const firstTradeTimestamp =
      clobActivity?.firstTradeTimestamp ?? splitActivity?.firstTradeTimestamp;

    // lowTradeCount: Wallet has fewer than threshold trades
    const lowTradeCount = combinedTradeCount <= thresholds.walletLowTradeCount;

    // youngAccount: Wallet first trade is recent
    let youngAccount = false;
    if (firstTradeTimestamp) {
      const accountAgeDays = Math.floor(
        (Date.now() - firstTradeTimestamp) / (1000 * 60 * 60 * 24)
      );
      youngAccount = accountAgeDays <= thresholds.walletYoungAccountDays;
    } else {
      youngAccount = true; // No history = very new
    }

    // lowVolume: Lifetime volume below threshold
    const lowVolume = combinedVolumeUSD <= thresholds.walletLowVolumeUSD;

    // highConcentration: Majority of position value in one market
    const highConcentration =
      (positions?.maxPositionPercentage ?? 0) >=
      thresholds.walletHighConcentrationPct;

    // lowDiversification: Count distinct markets from positions
    const marketsTraded = positions?.positions.length ?? 0;
    const diversificationThreshold =
      thresholds.walletDiversificationThreshold ?? 3;
    const lowDiversification = marketsTraded <= diversificationThreshold;

    // freshFatBet: New wallet making large bets
    let freshFatBet = false;
    if (tradeContext) {
      const priorTrades = combinedTradeCount - 1; // -1 for current trade
      const isLargeTrade =
        tradeContext.tradeSizeUSD >= thresholds.walletFreshFatBetSizeUSD;
      const isSmallMarket =
        tradeContext.marketOI <= thresholds.walletFreshFatBetMaxOI;
      const isFreshAccount =
        priorTrades <= thresholds.walletFreshFatBetPriorTrades;

      freshFatBet = isLargeTrade && isSmallMarket && isFreshAccount;

      if (freshFatBet) {
        logger.info(
          {
            priorTrades,
            tradeSizeUSD: tradeContext.tradeSizeUSD,
            marketOI: tradeContext.marketOI,
          },
          'Fresh fat bet pattern detected'
        );
      }
    }

    return {
      lowTradeCount,
      youngAccount,
      lowVolume,
      highConcentration,
      freshFatBet,
      lowDiversification,
    };
  }

  /**
   * Create a partial fingerprint when some data is available
   */
  async createPartialFingerprint(
    address: string,
    partialData: Partial<SubgraphWalletData>,
    dataCompleteness: DataCompleteness,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): Promise<WalletFingerprint> {
    try {
      // Calculate what we can from partial data
      const walletFlags = this.calculateSubgraphFlags(
        partialData as SubgraphWalletData, // Type assertion is safe due to our checks
        tradeContext
      );

      const clobActivity = partialData.clobActivity;
      const splitActivity = partialData.activity;

      // Combined metrics from whatever data we have
      const tradeCount =
        (clobActivity?.tradeCount ?? 0) + (splitActivity?.tradeCount ?? 0);
      const volumeUSD =
        normalizeVolume(clobActivity?.totalVolumeUSD, 'subgraph') +
        normalizeVolume(splitActivity?.totalVolumeUSD, 'subgraph');

      // Account age
      let accountAgeDays: number | null = null;
      const firstTrade =
        clobActivity?.firstTradeTimestamp ?? splitActivity?.firstTradeTimestamp;
      if (firstTrade) {
        accountAgeDays = Math.floor(
          (Date.now() - firstTrade) / (1000 * 60 * 60 * 24)
        );
      }

      // Determine if suspicious - consistent with analyzeWalletInternal (2+ flags)
      const suspiciousFlagCount =
        Object.values(walletFlags).filter(Boolean).length;
      const isSuspicious = suspiciousFlagCount >= 2;

      // Calculate confidence for partial data scenario
      const confidence = calculateConfidence(
        dataCompleteness,
        partialData as SubgraphWalletData,
        null
      );

      const marketsTraded = partialData.positions?.positions.length ?? 0;
      const dataSource: 'cache' | 'mixed' = dataCompleteness.cache
        ? 'cache'
        : 'mixed';
      const metadata = {
        polymarketTradeCount: tradeCount,
        polymarketVolumeUSD: volumeUSD,
        polymarketAccountAgeDays: accountAgeDays,
        maxPositionConcentration:
          partialData.positions?.maxPositionPercentage ?? 0,
        marketsTraded,
        dataSource,
      };

      const fingerprint: WalletFingerprint = {
        address,
        status: 'partial' as FingerprintStatus,
        isSuspicious,
        dataCompleteness,
        confidenceLevel: confidence.level,
        walletFlags,
        subgraphFlags: walletFlags, // Backwards compatibility
        walletMetadata: metadata,
        subgraphMetadata: metadata, // Backwards compatibility
        analyzedAt: new Date(),
        // Backwards compatibility
        flags: {
          cexFunded: false,
          lowTxCount: walletFlags.lowTradeCount,
          youngWallet: walletFlags.youngAccount,
          highPolymarketNetflow: true,
          singlePurpose: walletFlags.highConcentration,
        },
        metadata: {
          totalTransactions: tradeCount,
          walletAgeDays: accountAgeDays ?? 0,
          firstSeenTimestamp: firstTrade ? firstTrade * 1000 : null,
          cexFundingSource: null,
          cexFundingTimestamp: null,
          polymarketNetflowPercentage: 100,
          uniqueProtocolsInteracted: 1,
        },
      };

      // Still try to cache partial results
      await this.cacheFingerprint(address, fingerprint);
      await this.persistFingerprint(fingerprint);

      logger.info(
        {
          address,
          status: 'partial',
          dataCompleteness,
          isSuspicious,
          tradeCount,
        },
        'Created partial fingerprint from incomplete data'
      );

      return fingerprint;
    } catch (error) {
      logger.error({ error, address }, 'Failed to create partial fingerprint');

      // Fall back to error fingerprint
      return this.createErrorFingerprint(
        address,
        'Failed to process partial data',
        dataCompleteness,
        partialData
      );
    }
  }

  /**
   * Create an error fingerprint when analysis fails
   */
  private createErrorFingerprint(
    address: string,
    errorReason: string,
    dataCompleteness: DataCompleteness,
    partialData?: Partial<SubgraphWalletData>
  ): WalletFingerprint {
    // Use any partial data we managed to collect
    const tradeCount =
      partialData?.clobActivity?.tradeCount ??
      partialData?.activity?.tradeCount ??
      0;
    const volumeUSD =
      normalizeVolume(partialData?.clobActivity?.totalVolumeUSD, 'subgraph') ||
      normalizeVolume(partialData?.activity?.totalVolumeUSD, 'subgraph') ||
      0;

    const walletFlags: WalletFlags = {
      lowTradeCount: false,
      youngAccount: false,
      lowVolume: false,
      highConcentration: false,
      freshFatBet: false,
      lowDiversification: false,
    };

    const dataSource: 'cache' | 'data-api' = dataCompleteness.cache
      ? 'cache'
      : 'data-api';
    const metadata = {
      polymarketTradeCount: tradeCount,
      polymarketVolumeUSD: volumeUSD,
      polymarketAccountAgeDays: null,
      maxPositionConcentration: 0,
      marketsTraded: 0,
      dataSource,
    };

    return {
      address,
      status: 'error' as FingerprintStatus,
      isSuspicious: true, // Flag as suspicious on errors - better safe than sorry
      errorReason,
      dataCompleteness,
      confidenceLevel: 'none',
      walletFlags,
      subgraphFlags: walletFlags, // Backwards compatibility
      walletMetadata: metadata,
      subgraphMetadata: metadata, // Backwards compatibility
      analyzedAt: new Date(),
      // Backwards compatibility
      flags: {
        cexFunded: false,
        lowTxCount: false,
        youngWallet: false,
        highPolymarketNetflow: false,
        singlePurpose: false,
      },
      metadata: {
        totalTransactions: tradeCount,
        walletAgeDays: 0,
        firstSeenTimestamp: null,
        cexFundingSource: null,
        cexFundingTimestamp: null,
        polymarketNetflowPercentage: 0,
        uniqueProtocolsInteracted: 0,
      },
    };
  }

  /**
   * Create fingerprint for new user with no history
   */
  private createNewUserFingerprint(
    address: string,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): WalletFingerprint {
    const freshFatBet =
      tradeContext &&
      tradeContext.tradeSizeUSD >= thresholds.walletFreshFatBetSizeUSD &&
      tradeContext.marketOI <= thresholds.walletFreshFatBetMaxOI;

    const walletFlags: WalletFlags = {
      lowTradeCount: true,
      youngAccount: true,
      lowVolume: true,
      highConcentration: true, // First trade = 100% concentration
      freshFatBet: freshFatBet ?? false,
      lowDiversification: true, // New user = 1 market = low diversification
    };

    // Use consistent logic: count flags >= 2 = suspicious
    // New users have 5 true flags, so they are always suspicious
    const suspiciousFlagCount =
      Object.values(walletFlags).filter(Boolean).length;
    const isSuspicious = suspiciousFlagCount >= 2;

    const metadata = {
      polymarketTradeCount: 0,
      polymarketVolumeUSD: 0,
      polymarketAccountAgeDays: 0,
      maxPositionConcentration: 100, // First trade = 100% concentration
      marketsTraded: 1, // First trade = 1 market
      dataSource: 'data-api' as const,
    };

    return {
      address,
      status: 'success' as FingerprintStatus,
      isSuspicious,
      dataCompleteness: {
        dataApi: false,
        subgraph: false, // No data means APIs were queried but returned nothing
        cache: false,
        timestamp: Date.now(),
      },
      confidenceLevel: freshFatBet ? 'medium' : 'low', // New users have inherent uncertainty
      walletFlags,
      subgraphFlags: walletFlags, // Backwards compatibility
      walletMetadata: metadata,
      subgraphMetadata: metadata, // Backwards compatibility
      analyzedAt: new Date(),
      // Backwards compatibility
      flags: {
        cexFunded: false,
        lowTxCount: walletFlags.lowTradeCount,
        youngWallet: walletFlags.youngAccount,
        highPolymarketNetflow: true,
        singlePurpose: walletFlags.highConcentration,
      },
      metadata: {
        totalTransactions: 0,
        walletAgeDays: 0,
        firstSeenTimestamp: null,
        cexFundingSource: null,
        cexFundingTimestamp: null,
        polymarketNetflowPercentage: 100,
        uniqueProtocolsInteracted: 1,
      },
    };
  }

  /**
   * Get cached fingerprint
   */
  private async getCachedFingerprint(
    address: string
  ): Promise<WalletFingerprint | null> {
    try {
      const cached = await redis.getJSON<WalletFingerprint>(
        `wallet:subgraph:${address}`
      );

      if (cached !== null) {
        cached.analyzedAt = new Date(cached.analyzedAt);
      }

      return cached;
    } catch (error) {
      logger.warn(
        { error, address },
        'Failed to get cached subgraph fingerprint'
      );
      return null;
    }
  }

  /**
   * Cache fingerprint
   */
  private async cacheFingerprint(
    address: string,
    fingerprint: WalletFingerprint
  ): Promise<void> {
    try {
      await redis.setJSON(
        `wallet:subgraph:${address}`,
        fingerprint,
        this.SUBGRAPH_CACHE_TTL_SECONDS
      );
    } catch (error) {
      logger.warn({ error, address }, 'Failed to cache subgraph fingerprint');
    }
  }

  /**
   * Persist fingerprint to database
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
            totalTransactions:
              fingerprint.subgraphMetadata.polymarketTradeCount,
            walletAgeDays:
              fingerprint.subgraphMetadata.polymarketAccountAgeDays ?? 0,
            firstSeenTimestamp: null, // Not applicable for subgraph data
            cexFundingSource: null, // Cannot detect with proxy wallets
            cexFundingTimestamp: null,
            polymarketNetflowPercentage: 100, // Always 100% for Polymarket users
            uniqueProtocolsInteracted: 1, // Always 1 (just Polymarket)
            isSuspicious: fingerprint.isSuspicious,
            flagCexFunded: false, // Cannot detect
            flagLowTxCount: fingerprint.subgraphFlags.lowTradeCount,
            flagYoungWallet: fingerprint.subgraphFlags.youngAccount,
            flagHighPolymarketNetflow: true, // Always true
            flagSinglePurpose: fingerprint.subgraphFlags.highConcentration,
            analyzedAt: fingerprint.analyzedAt,
          },
          update: {
            totalTransactions:
              fingerprint.subgraphMetadata.polymarketTradeCount,
            walletAgeDays:
              fingerprint.subgraphMetadata.polymarketAccountAgeDays ?? 0,
            isSuspicious: fingerprint.isSuspicious,
            flagLowTxCount: fingerprint.subgraphFlags.lowTradeCount,
            flagYoungWallet: fingerprint.subgraphFlags.youngAccount,
            flagSinglePurpose: fingerprint.subgraphFlags.highConcentration,
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
    }
  }
}

// Export singleton instance
export const walletForensicsService = WalletForensicsService.getInstance();
