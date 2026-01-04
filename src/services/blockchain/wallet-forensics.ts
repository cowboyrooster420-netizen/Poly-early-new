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
  isSuspicious: boolean;
  subgraphFlags: SubgraphFlags;
  subgraphMetadata: {
    polymarketTradeCount: number;
    polymarketVolumeUSD: number;
    polymarketAccountAgeDays: number | null;
    maxPositionConcentration: number;
    dataSource: 'subgraph';
  };
  analyzedAt: Date;

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

    // Check cache first
    const cached = await this.getCachedFingerprint(normalizedAddress);
    if (cached !== null) {
      logger.debug(
        { address: normalizedAddress },
        'Wallet fingerprint cache hit'
      );
      return cached;
    }

    logger.info(
      { address: normalizedAddress },
      'Analyzing wallet via subgraph'
    );

    try {
      // Try Data API first (more reliable)
      const dataApiData =
        await polymarketDataApi.getUserData(normalizedAddress);

      // If Data API has data, use it preferentially
      if (dataApiData.activity || dataApiData.recentTrades.length > 0) {
        logger.info(
          { address: normalizedAddress },
          'Using Data API for wallet analysis'
        );
        return this.analyzeViaDataApi(
          normalizedAddress,
          dataApiData,
          tradeContext
        );
      }

      // Fallback to subgraph
      const subgraphData =
        await polymarketSubgraph.getWalletData(normalizedAddress);

      // If subgraph returned no data, create minimal fingerprint
      if (
        !subgraphData.activity &&
        !subgraphData.clobActivity &&
        !subgraphData.positions
      ) {
        logger.info(
          { address: normalizedAddress },
          'No data found in either API - new user'
        );
        return this.createNewUserFingerprint(normalizedAddress, tradeContext);
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
        (clobActivity?.totalVolumeUSD ?? 0) +
        (splitActivity?.totalVolumeUSD ?? 0);

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

      const fingerprint: WalletFingerprint = {
        address: normalizedAddress,
        isSuspicious,
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
          isSuspicious,
          subgraphFlags,
          tradeCount,
          volumeUSD,
          accountAgeDays,
        },
        'Wallet analysis complete'
      );

      return fingerprint;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          address: normalizedAddress,
        },
        'Failed to analyze wallet'
      );

      // Return minimal fingerprint on error
      return this.createNewUserFingerprint(normalizedAddress, tradeContext);
    }
  }

  /**
   * Backwards compatibility alias
   */
  public async analyzeWalletViaSubgraph(
    address: string,
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
  ): Promise<WalletFingerprint> {
    return this.analyzeWallet(address, tradeContext);
  }

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
      (clobActivity?.totalVolumeUSD ?? 0) +
      (splitActivity?.totalVolumeUSD ?? 0);

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
    tradeContext?: { tradeSizeUSD: number; marketOI: number }
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
        parseFloat(activity.totalVolume || '0') <=
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

    const fingerprint: WalletFingerprint = {
      address: address.toLowerCase(),
      isSuspicious,
      subgraphFlags: flags,
      subgraphMetadata: {
        polymarketTradeCount: activity?.totalTrades || 0,
        polymarketVolumeUSD: parseFloat(activity?.totalVolume || '0'),
        polymarketAccountAgeDays: accountAgeDays,
        maxPositionConcentration: 0, // Data API doesn't provide this directly
        dataSource: 'subgraph',
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
      isSuspicious,
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
