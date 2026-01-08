/**
 * Detection threshold configuration
 * These values control when trades trigger insider signals
 */
export interface DetectionThresholds {
  // Trade size thresholds
  minOiPercentage: number; // Min % of OI for a trade to be significant (default: 20)
  minPriceImpact: number; // Min % price move for a trade to be significant (default: 20)

  // OI Calculation Method Configuration
  oiCalculationMethod: 'oi' | 'liquidity' | 'volume'; // Method for calculating impact (default: liquidity)
  minLiquidityImpactPercentage: number; // Min % of available liquidity consumed (default: 2.0)
  fallbackToOiCalculation: boolean; // Fallback to OI method if liquidity unavailable (default: true)
  fallbackOiPercentage: number; // OI threshold when using fallback (default: 0.5)
  minVolumeImpactPercentage: number; // Min % of recent volume (default: 5.0)
  volumeLookbackHours: number; // Hours to look back for volume calculation (default: 24)
  orderbookDepthLevels: number; // Number of orderbook levels to analyze (default: 10)
  orderbookCacheTtlSeconds: number; // Cache TTL for orderbook data (default: 30)

  // Dormancy thresholds
  dormantHoursNoLargeTrades: number; // Hours without large trades (default: 4)
  dormantHoursNoPriceMoves: number; // Hours without price moves (default: 3)
  dormantLargeTradeThreshold: number; // Dollar threshold for "large" trade (default: 2000)
  dormantPriceMoveThreshold: number; // % threshold for "significant" move (default: 8)

  // Wallet scoring thresholds
  minWalletScore: number; // Min wallet score to trigger alert (default: 70)
  minConfidenceScore: number; // Min overall confidence to send alert (default: 75)

  // Wallet fingerprint thresholds (on-chain)
  maxWalletTransactions: number; // Max tx count for insider profile (default: 40)
  minWalletAgeInDays: number; // Max wallet age in days (default: 90)
  minNetflowPercentage: number; // Min % of netflow to Polymarket (default: 85)
  cexFundingWindowDays: number; // Days to look back for CEX funding (default: 14)

  // Subgraph-based wallet thresholds (new)
  subgraphLowTradeCount: number; // Max trades to flag as low activity (default: 10)
  subgraphYoungAccountDays: number; // Max age in days to flag as young (default: 30)
  subgraphLowVolumeUSD: number; // Max lifetime volume to flag as low (default: 50000)
  subgraphHighConcentrationPct: number; // Min % in one market to flag as concentrated (default: 70)
  subgraphFreshFatBetPriorTrades: number; // Max prior trades for fresh+fat pattern (default: 2)
  subgraphFreshFatBetSizeUSD: number; // Min trade size for fresh+fat pattern (default: 20000)
  subgraphFreshFatBetMaxOI: number; // Max market OI for fresh+fat pattern (default: 500000)
  subgraphCacheTTLHours: number; // Cache TTL for subgraph data (default: 48)

  // Error handling configuration
  skipTradesOnProxyError: boolean; // Skip trades when proxy resolution fails with GraphQL errors (default: false)

  // Market-aware minimum thresholds
  absoluteMinUsd: number; // Absolute minimum trade size in USD (default: 5000)
  relativeLiquidityFactor: number; // Minimum fraction of available liquidity (default: 0.5)
}

/**
 * Default detection thresholds based on project requirements
 */
export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  // Trade size
  minOiPercentage: 20,
  minPriceImpact: 20,

  // OI Calculation Method
  oiCalculationMethod: 'liquidity',
  minLiquidityImpactPercentage: 2.0,
  fallbackToOiCalculation: true,
  fallbackOiPercentage: 0.5,
  minVolumeImpactPercentage: 5.0,
  volumeLookbackHours: 24,
  orderbookDepthLevels: 10,
  orderbookCacheTtlSeconds: 30,

  // Dormancy
  dormantHoursNoLargeTrades: 4,
  dormantHoursNoPriceMoves: 3,
  dormantLargeTradeThreshold: 2000,
  dormantPriceMoveThreshold: 8,

  // Scoring
  minWalletScore: 50, // Temporarily lowered from 70
  minConfidenceScore: 60, // Temporarily lowered from 75

  // Wallet fingerprint (on-chain)
  maxWalletTransactions: 40,
  minWalletAgeInDays: 90,
  minNetflowPercentage: 85,
  cexFundingWindowDays: 14,

  // Subgraph-based wallet thresholds
  subgraphLowTradeCount: 5, // Reduced from 10 - more sensitive to new traders
  subgraphYoungAccountDays: 14, // Reduced from 30 - catch newer accounts
  subgraphLowVolumeUSD: 10000, // Reduced from 50000 - flag smaller traders
  subgraphHighConcentrationPct: 60, // Reduced from 70 - catch more concentrated bets
  subgraphFreshFatBetPriorTrades: 3, // Increased from 2 - slightly more permissive
  subgraphFreshFatBetSizeUSD: 10000, // Reduced from 20000 - catch medium-sized insider trades
  subgraphFreshFatBetMaxOI: 500000,
  subgraphCacheTTLHours: 48,

  // Error handling
  skipTradesOnProxyError: false,

  // Market-aware minimum thresholds
  absoluteMinUsd: 2500, // Reduced from 5000 - catch medium-sized trades
  relativeLiquidityFactor: 0.3, // Reduced from 0.5 - only need 30% of liquidity impact
};

/**
 * Get current thresholds (can be overridden via env vars)
 */
export function getThresholds(): DetectionThresholds {
  return {
    minOiPercentage:
      Number(process.env['MIN_OI_PERCENTAGE']) ||
      DEFAULT_THRESHOLDS.minOiPercentage,
    minPriceImpact:
      Number(process.env['MIN_PRICE_IMPACT']) ||
      DEFAULT_THRESHOLDS.minPriceImpact,
    dormantHoursNoLargeTrades:
      Number(process.env['DORMANT_HOURS_NO_LARGE_TRADES']) ||
      DEFAULT_THRESHOLDS.dormantHoursNoLargeTrades,
    dormantHoursNoPriceMoves:
      Number(process.env['DORMANT_HOURS_NO_PRICE_MOVES']) ||
      DEFAULT_THRESHOLDS.dormantHoursNoPriceMoves,
    dormantLargeTradeThreshold:
      Number(process.env['DORMANT_LARGE_TRADE_THRESHOLD']) ||
      DEFAULT_THRESHOLDS.dormantLargeTradeThreshold,
    dormantPriceMoveThreshold:
      Number(process.env['DORMANT_PRICE_MOVE_THRESHOLD']) ||
      DEFAULT_THRESHOLDS.dormantPriceMoveThreshold,
    minWalletScore:
      Number(process.env['MIN_WALLET_SCORE']) ||
      DEFAULT_THRESHOLDS.minWalletScore,
    minConfidenceScore:
      Number(process.env['MIN_CONFIDENCE_SCORE']) ||
      DEFAULT_THRESHOLDS.minConfidenceScore,
    maxWalletTransactions:
      Number(process.env['MAX_WALLET_TRANSACTIONS']) ||
      DEFAULT_THRESHOLDS.maxWalletTransactions,
    minWalletAgeInDays:
      Number(process.env['MIN_WALLET_AGE_DAYS']) ||
      DEFAULT_THRESHOLDS.minWalletAgeInDays,
    minNetflowPercentage:
      Number(process.env['MIN_NETFLOW_PERCENTAGE']) ||
      DEFAULT_THRESHOLDS.minNetflowPercentage,
    cexFundingWindowDays:
      Number(process.env['CEX_FUNDING_WINDOW_DAYS']) ||
      DEFAULT_THRESHOLDS.cexFundingWindowDays,
    // Subgraph-based thresholds
    subgraphLowTradeCount:
      Number(process.env['SUBGRAPH_LOW_TRADE_COUNT']) ||
      DEFAULT_THRESHOLDS.subgraphLowTradeCount,
    subgraphYoungAccountDays:
      Number(process.env['SUBGRAPH_YOUNG_ACCOUNT_DAYS']) ||
      DEFAULT_THRESHOLDS.subgraphYoungAccountDays,
    subgraphLowVolumeUSD:
      Number(process.env['SUBGRAPH_LOW_VOLUME_USD']) ||
      DEFAULT_THRESHOLDS.subgraphLowVolumeUSD,
    subgraphHighConcentrationPct:
      Number(process.env['SUBGRAPH_HIGH_CONCENTRATION_PCT']) ||
      DEFAULT_THRESHOLDS.subgraphHighConcentrationPct,
    subgraphFreshFatBetPriorTrades:
      Number(process.env['SUBGRAPH_FRESH_FAT_BET_PRIOR_TRADES']) ||
      DEFAULT_THRESHOLDS.subgraphFreshFatBetPriorTrades,
    subgraphFreshFatBetSizeUSD:
      Number(process.env['SUBGRAPH_FRESH_FAT_BET_SIZE_USD']) ||
      DEFAULT_THRESHOLDS.subgraphFreshFatBetSizeUSD,
    subgraphFreshFatBetMaxOI:
      Number(process.env['SUBGRAPH_FRESH_FAT_BET_MAX_OI']) ||
      DEFAULT_THRESHOLDS.subgraphFreshFatBetMaxOI,
    subgraphCacheTTLHours:
      Number(process.env['SUBGRAPH_CACHE_TTL_HOURS']) ||
      DEFAULT_THRESHOLDS.subgraphCacheTTLHours,

    // OI Calculation Method Configuration
    oiCalculationMethod: ['oi', 'liquidity', 'volume'].includes(
      process.env['OI_CALCULATION_METHOD'] ?? ''
    )
      ? (process.env['OI_CALCULATION_METHOD'] as 'oi' | 'liquidity' | 'volume')
      : DEFAULT_THRESHOLDS.oiCalculationMethod,
    minLiquidityImpactPercentage:
      Number(process.env['MIN_LIQUIDITY_IMPACT_PERCENTAGE']) ||
      DEFAULT_THRESHOLDS.minLiquidityImpactPercentage,
    fallbackToOiCalculation:
      process.env['FALLBACK_TO_OI_CALCULATION'] === 'true' ||
      (process.env['FALLBACK_TO_OI_CALCULATION'] !== 'false' &&
        DEFAULT_THRESHOLDS.fallbackToOiCalculation),
    fallbackOiPercentage:
      Number(process.env['FALLBACK_OI_PERCENTAGE']) ||
      DEFAULT_THRESHOLDS.fallbackOiPercentage,
    minVolumeImpactPercentage:
      Number(process.env['MIN_VOLUME_IMPACT_PERCENTAGE']) ||
      DEFAULT_THRESHOLDS.minVolumeImpactPercentage,
    volumeLookbackHours:
      Number(process.env['VOLUME_LOOKBACK_HOURS']) ||
      DEFAULT_THRESHOLDS.volumeLookbackHours,
    orderbookDepthLevels:
      Number(process.env['ORDERBOOK_DEPTH_LEVELS']) ||
      DEFAULT_THRESHOLDS.orderbookDepthLevels,
    orderbookCacheTtlSeconds:
      Number(process.env['ORDERBOOK_CACHE_TTL_SECONDS']) ||
      DEFAULT_THRESHOLDS.orderbookCacheTtlSeconds,

    // Error handling
    skipTradesOnProxyError:
      process.env['SKIP_TRADES_ON_PROXY_ERROR'] === 'true' ||
      DEFAULT_THRESHOLDS.skipTradesOnProxyError,

    // Market-aware minimum thresholds
    absoluteMinUsd:
      Number(process.env['ABSOLUTE_MIN_USD']) ||
      DEFAULT_THRESHOLDS.absoluteMinUsd,
    relativeLiquidityFactor:
      Number(process.env['RELATIVE_LIQUIDITY_FACTOR']) ||
      DEFAULT_THRESHOLDS.relativeLiquidityFactor,
  };
}
