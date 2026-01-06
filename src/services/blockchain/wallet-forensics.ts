import {
  polymarketSubgraph,
  type SubgraphWalletData,
} from '../polymarket/subgraph-client.js';
import {
  polymarketDataApi,
  type DataApiUserData,
} from '../polymarket/data-api-client.js';
import { redis } from '../cache/redis.js';
import { db, type PrismaClient } from '../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { getThresholds } from '../../config/thresholds.js';
import { normalizeVolume } from '../../utils/decimals.js';
import { DecisionFramework } from '../data/decision-framework.js';
import {
  normalizeSubgraphData,
  normalizeDataApiData,
  validateDataConsistency,
  mergeWalletData,
} from '../data/data-normalizer.js';
import { calculateConfidence } from './confidence-calculator.js';
import type { FingerprintStatus, DataCompleteness } from '../../types/index.js';
import { retryApiCall } from '../../utils/retry.js';
import { circuitBreakers } from '../../utils/circuit-breaker.js';
import { withLock } from '../../utils/distributed-lock.js';

const thresholds = getThresholds();

/**
 * Subgraph-based flags for wallet analysis
 * These are derived from Polymarket's official subgraph data
 */
export interface SubgraphFlags {
  lowTradeCount: boolean; // Few trades on Polymarket
  youngAccount: boolean; // Recently started trading
  lowVolume: boolean; // Low lifetime volume
  highConcentration: boolean; // Most value in one market
  freshFatBet: boolean; // New wallet + large bet pattern
}

/**
 * Wallet fingerprint analysis result (simplified for subgraph-only)
 */
export interface WalletFingerprint {
  address: string;
  status: FingerprintStatus;
  isSuspicious: boolean;
  subgraphFlags: SubgraphFlags;
  subgraphMetadata: {
    polymarketTradeCount: number;
    polymarketVolumeUSD: number;
    polymarketAccountAgeDays: number | null;
    maxPositionConcentration: number;
    dataSource: 'subgraph' | 'data-api' | 'mixed' | 'cache';
  };
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
    thresholds.subgraphCacheTTLHours * 3600;

  private constructor() {
    logger.info('Wallet forensics service initialized (subgraph-only mode)');
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

    // Use distributed lock to prevent concurrent analysis of same wallet
    return await withLock(
      `wallet-analysis:${normalizedAddress}`,
      async () => this.analyzeWalletInternal(normalizedAddress, tradeContext),
      {
        ttl: 60000, // 60 second lock
        maxRetries: 100, // Wait up to 10 seconds
        retryDelay: 100,
      }
    );
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

    logger.info({ address: normalizedAddress }, 'Analyzing wallet via APIs');

    const dataCompleteness: DataCompleteness = {
      dataApi: false,
      subgraph: false,
      cache: false,
      timestamp: Date.now(),
    };

    let dataApiData: DataApiUserData | null = null;
    let subgraphData: SubgraphWalletData | null = null;
    const errors: string[] = [];

    // Try Data API first with circuit breaker and retry
    try {
      dataApiData = await circuitBreakers.dataApi.execute(async () => {
        return await retryApiCall(
          () => polymarketDataApi.getUserData(normalizedAddress),
          'dataApi.getUserData'
        );
      });

      dataCompleteness.dataApi = true;

      // Don't return early - we want to try both sources for cross-validation
      if (dataApiData.activity || dataApiData.recentTrades.length > 0) {
        logger.debug(
          {
            address: normalizedAddress,
            hasActivity: !!dataApiData.activity,
            tradeCount: dataApiData.recentTrades.length,
          },
          'Data API returned data - will attempt subgraph for cross-validation'
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Data API: ${errorMsg}`);
      logger.warn(
        {
          error: errorMsg,
          address: normalizedAddress,
          isCircuitOpen: errorMsg.includes('Circuit breaker'),
        },
        'Data API failed, falling back to subgraph'
      );
    }

    // Try Subgraph (either as fallback or for cross-validation)
    try {
      subgraphData = await circuitBreakers.subgraph.execute(async () => {
        return await retryApiCall(
          () => polymarketSubgraph.getWalletData(normalizedAddress),
          'subgraph.getWalletData'
        );
      });

      dataCompleteness.subgraph = true;

      // Check if we have data from either source
      const hasSubgraphData =
        subgraphData.activity ||
        subgraphData.clobActivity ||
        subgraphData.positions;
      const hasDataApiData =
        dataApiData &&
        (dataApiData.activity || dataApiData.recentTrades.length > 0);

      if (!hasSubgraphData && !hasDataApiData) {
        logger.info(
          {
            address: normalizedAddress,
            responseTime: Date.now() - startTime,
          },
          'No data found in either API - new user'
        );
        return this.createNewUserFingerprint(normalizedAddress, tradeContext);
      }

      // If we have both sources, cross-validate
      if (hasSubgraphData && hasDataApiData) {
        logger.info(
          {
            address: normalizedAddress,
            responseTime: Date.now() - startTime,
          },
          'Both APIs returned data - performing cross-validation'
        );

        const subgraphNormalized = normalizeSubgraphData(
          subgraphData,
          normalizedAddress
        );
        const dataApiNormalized = normalizeDataApiData(
          dataApiData!,
          normalizedAddress
        );

        // Cross-validate data sources
        const validation = validateDataConsistency(
          subgraphNormalized,
          dataApiNormalized
        );

        // Log any discrepancies
        if (validation.warnings.length > 0 || !validation.isValid) {
          logger.warn(
            {
              address: normalizedAddress,
              validation,
              subgraphMetrics: {
                trades: subgraphNormalized.tradeCount,
                volume: subgraphNormalized.volumeUSD,
              },
              dataApiMetrics: {
                trades: dataApiNormalized.tradeCount,
                volume: dataApiNormalized.volumeUSD,
              },
            },
            'Data consistency issues between subgraph and Data API'
          );
        }

        // Merge data for logging purposes
        // Note: We could use mergedData for fingerprint creation in the future
        mergeWalletData({
          subgraph: subgraphNormalized,
          dataApi: dataApiNormalized,
        });

        // Update data completeness with validation info
        dataCompleteness.validationScore = validation.confidence;
        dataCompleteness.hasDiscrepancies = validation.warnings.length > 0;
      }

      // If only Data API has data, use it
      if (hasDataApiData && !hasSubgraphData) {
        return this.analyzeViaDataApi(
          normalizedAddress,
          dataApiData!,
          tradeContext,
          dataCompleteness
        );
      }

      // Calculate subgraph flags
      const subgraphFlags = this.calculateSubgraphFlags(
        subgraphData,
        tradeContext
      );

      // Use CLOB activity as primary source
      const clobActivity = subgraphData.clobActivity;
      const splitActivity = subgraphData.activity;

      // Combined metrics
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

      // Determine if suspicious
      const suspiciousFlagCount =
        Object.values(subgraphFlags).filter(Boolean).length;
      const isSuspicious = suspiciousFlagCount >= 2;

      // Calculate proper confidence based on data quality
      const confidence = calculateConfidence(
        dataCompleteness,
        subgraphData,
        null, // No Data API data in this path
        errors.length > 0 ? errors : undefined
      );

      const fingerprint: WalletFingerprint = {
        address: normalizedAddress,
        status: 'success' as FingerprintStatus,
        isSuspicious,
        dataCompleteness,
        confidenceLevel: confidence.level,
        subgraphFlags,
        subgraphMetadata: {
          polymarketTradeCount: tradeCount,
          polymarketVolumeUSD: volumeUSD,
          polymarketAccountAgeDays: accountAgeDays,
          maxPositionConcentration:
            subgraphData.positions?.maxPositionPercentage ?? 0,
          dataSource: 'subgraph',
        },
        analyzedAt: new Date(),
        // Backwards compatibility
        flags: {
          cexFunded: false, // Cannot detect with proxy wallets
          lowTxCount: subgraphFlags.lowTradeCount,
          youngWallet: subgraphFlags.youngAccount,
          highPolymarketNetflow: true, // Always true for Polymarket users
          singlePurpose: subgraphFlags.highConcentration,
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

      // Cache and persist
      await this.cacheFingerprint(normalizedAddress, fingerprint);
      await this.persistFingerprint(fingerprint);

      logger.info(
        {
          address: normalizedAddress,
          status: 'success',
          responseTime: Date.now() - startTime,
          isSuspicious,
          subgraphFlags,
          tradeCount,
          volumeUSD,
          accountAgeDays,
        },
        'Wallet analysis complete via subgraph'
      );

      return fingerprint;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Subgraph: ${errorMsg}`);
      logger.error(
        {
          error: errorMsg,
          address: normalizedAddress,
          responseTime: Date.now() - startTime,
          dataCompleteness,
        },
        'Both APIs failed'
      );
    }

    // Both APIs failed - return error fingerprint
    return this.createErrorFingerprint(
      normalizedAddress,
      errors.join('; '),
      dataCompleteness,
      subgraphData || dataApiData
        ? {
            activity: subgraphData?.activity || null,
            clobActivity: subgraphData?.clobActivity || null,
          }
        : undefined
    );
  }

  // Note: analyzeWalletViaSubgraph method removed - use analyzeWallet instead

  /**
   * Calculate subgraph-based flags
   */
  private calculateSubgraphFlags(
    data: SubgraphWalletData,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): SubgraphFlags {
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
    const lowTradeCount =
      combinedTradeCount <= thresholds.subgraphLowTradeCount;

    // youngAccount: Wallet first trade is recent
    let youngAccount = false;
    if (firstTradeTimestamp) {
      const accountAgeDays = Math.floor(
        (Date.now() - firstTradeTimestamp) / (1000 * 60 * 60 * 24)
      );
      youngAccount = accountAgeDays <= thresholds.subgraphYoungAccountDays;
    } else {
      youngAccount = true; // No history = very new
    }

    // lowVolume: Lifetime volume below threshold
    const lowVolume = combinedVolumeUSD <= thresholds.subgraphLowVolumeUSD;

    // highConcentration: Majority of position value in one market
    const highConcentration =
      (positions?.maxPositionPercentage ?? 0) >=
      thresholds.subgraphHighConcentrationPct;

    // freshFatBet: New wallet making large bets
    let freshFatBet = false;
    if (tradeContext) {
      const priorTrades = combinedTradeCount - 1; // -1 for current trade
      const isLargeTrade =
        tradeContext.tradeSizeUSD >= thresholds.subgraphFreshFatBetSizeUSD;
      const isSmallMarket =
        tradeContext.marketOI <= thresholds.subgraphFreshFatBetMaxOI;
      const isFreshAccount =
        priorTrades <= thresholds.subgraphFreshFatBetPriorTrades;

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
    };
  }

  /**
   * Analyze wallet using Data API data
   */
  private async analyzeViaDataApi(
    address: string,
    data: DataApiUserData,
    tradeContext?: { tradeSizeUSD: number; marketOI: number },
    dataCompleteness?: DataCompleteness
  ): Promise<WalletFingerprint> {
    const activity = data.activity;
    const metrics = polymarketDataApi.calculateWalletMetrics(data);

    // Calculate flags based on Data API data
    const flags: SubgraphFlags = {
      lowTradeCount:
        !activity || activity.totalTrades <= thresholds.subgraphLowTradeCount,
      youngAccount: metrics.isNewTrader,
      lowVolume:
        !activity ||
        normalizeVolume(activity.totalVolume, 'data-api') <=
          thresholds.subgraphLowVolumeUSD,
      highConcentration: metrics.isSpecialized,
      freshFatBet: false, // Calculate below
    };

    // Check fresh fat bet pattern
    if (tradeContext && activity) {
      const isLargeTrade =
        tradeContext.tradeSizeUSD >= thresholds.subgraphFreshFatBetSizeUSD;
      const isSmallMarket =
        tradeContext.marketOI <= thresholds.subgraphFreshFatBetMaxOI;
      const isFreshAccount =
        activity.totalTrades <= thresholds.subgraphFreshFatBetPriorTrades;

      flags.freshFatBet = isLargeTrade && isSmallMarket && isFreshAccount;
    }

    // Calculate account age
    let accountAgeDays: number | null = null;
    if (activity?.firstTradeTimestamp) {
      accountAgeDays = Math.floor(
        (Date.now() - activity.firstTradeTimestamp) / (1000 * 60 * 60 * 24)
      );
    }

    // Determine if suspicious - use both flag count and pattern score
    const suspiciousFlagCount = Object.values(flags).filter(Boolean).length;
    const isSuspicious =
      suspiciousFlagCount >= 2 || metrics.tradingPatternScore >= 60;

    // Calculate confidence based on Data API data quality
    const confidence = calculateConfidence(
      dataCompleteness || {
        dataApi: true,
        subgraph: false,
        cache: false,
        timestamp: Date.now(),
      },
      null, // No subgraph data in this path
      data
    );

    const fingerprint: WalletFingerprint = {
      address: address.toLowerCase(),
      status: 'success' as FingerprintStatus,
      isSuspicious,
      dataCompleteness: dataCompleteness || {
        dataApi: true,
        subgraph: false,
        cache: false,
        timestamp: Date.now(),
      },
      confidenceLevel: confidence.level, // Calculated based on actual data quality
      subgraphFlags: flags,
      subgraphMetadata: {
        polymarketTradeCount: activity?.totalTrades || 0,
        polymarketVolumeUSD: normalizeVolume(activity?.totalVolume, 'data-api'),
        polymarketAccountAgeDays: accountAgeDays,
        maxPositionConcentration: 0, // Data API doesn't provide this directly
        dataSource: 'data-api',
      },
      analyzedAt: new Date(),
      // Backwards compatibility
      flags: {
        cexFunded: false,
        lowTxCount: flags.lowTradeCount,
        youngWallet: flags.youngAccount,
        highPolymarketNetflow: true,
        singlePurpose: flags.highConcentration,
      },
      metadata: {
        totalTransactions: activity?.totalTrades || 0,
        walletAgeDays: accountAgeDays ?? 0,
        firstSeenTimestamp: activity?.firstTradeTimestamp || null,
        cexFundingSource: null,
        cexFundingTimestamp: null,
        polymarketNetflowPercentage: 100,
        uniqueProtocolsInteracted: 1,
      },
    };

    // Cache and persist
    await this.cacheFingerprint(address.toLowerCase(), fingerprint);
    await this.persistFingerprint(fingerprint);

    logger.info(
      {
        address: address.toLowerCase(),
        isSuspicious,
        flags,
        patternScore: metrics.tradingPatternScore,
        winRate: activity?.winRate || 0,
        totalPnL: activity?.totalPnL || '0',
        dataSource: 'data-api',
      },
      'Wallet analysis complete (Data API)'
    );

    return fingerprint;
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
      const subgraphFlags = this.calculateSubgraphFlags(
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

      // Determine if suspicious with lower confidence
      const suspiciousFlagCount =
        Object.values(subgraphFlags).filter(Boolean).length;
      const isSuspicious = suspiciousFlagCount >= 3; // Higher threshold for partial data

      // Calculate confidence for partial data scenario
      const confidence = calculateConfidence(
        dataCompleteness,
        partialData as SubgraphWalletData,
        null
      );

      const fingerprint: WalletFingerprint = {
        address,
        status: 'partial' as FingerprintStatus,
        isSuspicious,
        dataCompleteness,
        confidenceLevel: confidence.level,
        subgraphFlags,
        subgraphMetadata: {
          polymarketTradeCount: tradeCount,
          polymarketVolumeUSD: volumeUSD,
          polymarketAccountAgeDays: accountAgeDays,
          maxPositionConcentration:
            partialData.positions?.maxPositionPercentage ?? 0,
          dataSource: dataCompleteness.cache ? 'cache' : 'mixed',
        },
        analyzedAt: new Date(),
        // Backwards compatibility
        flags: {
          cexFunded: false,
          lowTxCount: subgraphFlags.lowTradeCount,
          youngWallet: subgraphFlags.youngAccount,
          highPolymarketNetflow: true,
          singlePurpose: subgraphFlags.highConcentration,
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

    return {
      address,
      status: 'error' as FingerprintStatus,
      isSuspicious: false, // Don't flag as suspicious on errors
      errorReason,
      dataCompleteness,
      confidenceLevel: 'none',
      subgraphFlags: {
        lowTradeCount: false,
        youngAccount: false,
        lowVolume: false,
        highConcentration: false,
        freshFatBet: false,
      },
      subgraphMetadata: {
        polymarketTradeCount: tradeCount,
        polymarketVolumeUSD: volumeUSD,
        polymarketAccountAgeDays: null,
        maxPositionConcentration: 0,
        dataSource: dataCompleteness.cache ? 'cache' : 'subgraph',
      },
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
      tradeContext.tradeSizeUSD >= thresholds.subgraphFreshFatBetSizeUSD &&
      tradeContext.marketOI <= thresholds.subgraphFreshFatBetMaxOI;

    const subgraphFlags: SubgraphFlags = {
      lowTradeCount: true,
      youngAccount: true,
      lowVolume: true,
      highConcentration: true,
      freshFatBet: freshFatBet ?? false,
    };

    const isSuspicious = freshFatBet ?? false; // New user is only suspicious if making large bet

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
      subgraphFlags,
      subgraphMetadata: {
        polymarketTradeCount: 0,
        polymarketVolumeUSD: 0,
        polymarketAccountAgeDays: 0,
        maxPositionConcentration: 100, // First trade = 100% concentration
        dataSource: 'subgraph',
      },
      analyzedAt: new Date(),
      // Backwards compatibility
      flags: {
        cexFunded: false,
        lowTxCount: subgraphFlags.lowTradeCount,
        youngWallet: subgraphFlags.youngAccount,
        highPolymarketNetflow: true,
        singlePurpose: subgraphFlags.highConcentration,
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
