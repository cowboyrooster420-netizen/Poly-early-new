# Scoring System Fixes Applied

## Summary

Applied critical fixes to the wallet fingerprinting and scoring system to make insider detection more sensitive and reliable.

## Changes Made

### 1. **Lowered Wallet Score Filter** ✅
- **File**: `src/services/alerts/alert-scorer.ts`
- **Change**: Reduced `MIN_WALLET_SCORE` from 40 to 20
- **Impact**: Allows wallets with fewer suspicious flags to still be analyzed
- **Before**: Required 40/100 score (20/50 raw)
- **After**: Requires 20/100 score (10/50 raw)

### 2. **Adjusted Subgraph Flag Thresholds** ✅
- **File**: `src/config/thresholds.ts`
- **Changes**:
  - `subgraphLowTradeCount`: 10 → 5 trades
  - `subgraphYoungAccountDays`: 30 → 14 days  
  - `subgraphLowVolumeUSD`: $50k → $10k
  - `subgraphHighConcentrationPct`: 70% → 60%
  - `subgraphFreshFatBetPriorTrades`: 2 → 3 trades
  - `subgraphFreshFatBetSizeUSD`: $20k → $10k
- **Impact**: More wallets will trigger suspicious flags

### 3. **Lowered Market-Aware Thresholds** ✅
- **File**: `src/config/thresholds.ts`
- **Changes**:
  - `absoluteMinUsd`: $5,000 → $2,500
  - `relativeLiquidityFactor`: 0.5 → 0.3 (30% of liquidity)
- **Impact**: Medium-sized trades ($2.5k+) now get analyzed

### 4. **API Failures No Longer Drop Trades** ✅
- **Files**: 
  - `src/services/blockchain/wallet-forensics.ts`
  - `src/services/alerts/alert-scorer.ts`
- **Changes**:
  - Error fingerprints now marked as `isSuspicious: true`
  - Scorer gives error wallets a baseline 60/100 score
  - Trades continue through scoring pipeline even with API errors
- **Impact**: API failures won't cause missed insider trades

### 5. **Optimized Double Liquidity Fetching** ✅
- **Files**:
  - `src/services/signals/signal-detector.ts`
  - `src/services/analysis/oi-calculator.ts`
- **Changes**:
  - Cache liquidity data in signal detector
  - Pass cached data to impact calculator
  - Added optional parameter to avoid refetching
- **Impact**: 50% reduction in liquidity API calls

## Expected Results

With these changes:

1. **More Trades Analyzed**: Lower thresholds mean more trades pass initial filters
2. **Better Small Market Coverage**: 30% liquidity threshold works better for thin markets
3. **Resilient to API Failures**: System continues operating even when external APIs fail
4. **Improved Performance**: Eliminated duplicate API calls

## Metrics to Monitor

After deployment, monitor these metrics:
- `filtered_market_aware_minimum` - Should decrease
- `passed_oi_filter` - Should increase
- `wallet_error_but_suspicious` - New metric for API failures
- `classification_alert_*` - Should see more alerts overall

## Testing Recommendations

Test these scenarios:
1. $3,000 trade in market with $8k liquidity → Should pass
2. New wallet (5 trades, 10 days old) → Should score ~26/50
3. API failure during wallet check → Should still process trade
4. Check that liquidity is fetched only once per trade

## Next Steps

1. Deploy to staging environment
2. Monitor metrics for 24 hours
3. Adjust thresholds based on false positive rate
4. Consider implementing:
   - Alert rate limiting if volume too high
   - Confidence-based alert tiers
   - Manual review queue for edge cases