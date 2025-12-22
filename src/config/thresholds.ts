/**
 * Detection threshold configuration
 * These values control when trades trigger insider signals
 */
export interface DetectionThresholds {
  // Trade size thresholds
  minOiPercentage: number; // Min % of OI for a trade to be significant (default: 20)
  minPriceImpact: number; // Min % price move for a trade to be significant (default: 20)

  // Dormancy thresholds
  dormantHoursNoLargeTrades: number; // Hours without large trades (default: 4)
  dormantHoursNoPriceMoves: number; // Hours without price moves (default: 3)
  dormantLargeTradeThreshold: number; // Dollar threshold for "large" trade (default: 2000)
  dormantPriceMoveThreshold: number; // % threshold for "significant" move (default: 8)

  // Wallet scoring thresholds
  minWalletScore: number; // Min wallet score to trigger alert (default: 70)
  minConfidenceScore: number; // Min overall confidence to send alert (default: 75)

  // Wallet fingerprint thresholds
  maxWalletTransactions: number; // Max tx count for insider profile (default: 40)
  minWalletAgeInDays: number; // Max wallet age in days (default: 90)
  minNetflowPercentage: number; // Min % of netflow to Polymarket (default: 85)
  cexFundingWindowDays: number; // Days to look back for CEX funding (default: 14)
}

/**
 * Default detection thresholds based on project requirements
 */
export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  // Trade size
  minOiPercentage: 20,
  minPriceImpact: 20,

  // Dormancy
  dormantHoursNoLargeTrades: 4,
  dormantHoursNoPriceMoves: 3,
  dormantLargeTradeThreshold: 2000,
  dormantPriceMoveThreshold: 8,

  // Scoring
  minWalletScore: 70,
  minConfidenceScore: 75,

  // Wallet fingerprint
  maxWalletTransactions: 40,
  minWalletAgeInDays: 90,
  minNetflowPercentage: 85,
  cexFundingWindowDays: 7,
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
  };
}
