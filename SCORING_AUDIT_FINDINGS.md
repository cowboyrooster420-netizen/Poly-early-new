# Scoring System & Wallet Fingerprinting Audit

## Executive Summary

After thorough analysis of the scoring system and wallet fingerprinting, I've identified several critical issues that could cause the system to fail in detecting insider trades properly.

## 🔴 Critical Findings

### 1. **Minimum Wallet Score Filter Too High**
**Location**: `src/services/alerts/alert-scorer.ts:66`
```typescript
this.MIN_WALLET_SCORE = Number(process.env['MIN_WALLET_SCORE']) || 40;
```

**Issue**: The wallet score is calculated on a 0-50 scale, then doubled to 0-100 for display. However, the minimum filter is set to 40/100, which actually requires 20/50 points.

**Impact**: Many suspicious wallets are filtered out before final scoring:
- Low trade count: 14 points
- Young account: 12 points  
- Total: 26/50 (52/100) - Would pass filter
- But if wallet has only 2 flags, max score is 26/50, which becomes 52/100 but needs contribution of 0.6 * 52 = 31.2 points from wallet alone

### 2. **Subgraph Flags May Not Fire Correctly**
**Location**: `src/services/blockchain/wallet-forensics.ts:438-511`

**Issues Found**:
- `lowTradeCount`: Set at 10 trades - may be too low for Polymarket where bots make many small trades
- `youngAccount`: 30 days might miss accounts that lay dormant then activate
- `lowVolume`: $50,000 threshold might be too high for detecting small insider trades
- `freshFatBet`: Requires $20k+ trade which is very high

### 3. **Double Impact Calculation**
**Location**: Signal detector fetches liquidity twice
1. First in `analyzeTrade()` line 113 for pre-filtering
2. Again in `calculateImpactPercentage()` 

This doubles API calls and could cause rate limiting.

### 4. **Market-Aware Threshold Logic Inverted**
**Location**: `src/services/signals/signal-detector.ts:133`
```typescript
Math.min(
    thresholds.absoluteMinUsd || 5000,  // Ceiling
    thresholds.relativeLiquidityFactor * availableLiquidity  // Floor
)
```

**Issue**: Using `Math.min` means it takes the SMALLER of:
- $5,000 absolute minimum
- 50% of available liquidity

**Example**: If a market has $20k liquidity:
- 50% of $20k = $10k
- Math.min($5k, $10k) = $5k
- A $7k trade (35% of liquidity) would be filtered out!

### 5. **Confidence Level Not Properly Used**
**Location**: `src/services/alerts/alert-scorer.ts:243`

The confidence adjustment only applies if fingerprint status is 'partial', but:
- 'error' status is filtered out completely (line 130)
- 'success' status gets no adjustment even if confidence is 'low'
- The `confidenceLevel` field from wallet fingerprinting is mostly ignored

### 6. **Wallet Analysis Can Silently Fail**
**Location**: `src/services/blockchain/wallet-forensics.ts:130-431`

When both Data API and Subgraph fail:
- Returns an error fingerprint with `isSuspicious: false`
- This causes trades to be ignored rather than flagged for review
- No alerts on high API failure rates

### 7. **Score Contribution Math Issue**
The final score calculation:
```typescript
walletContribution = 0.6 * walletScore100  // 60% weight
impactContribution = 0.4 * impactScore      // 40% weight
finalScore = walletContribution + impactContribution
```

To reach the 70+ threshold for alerts:
- Need ~42+ from wallet (70/100 scaled score) 
- Or massive impact score to compensate
- This is nearly impossible with current flag thresholds

## 🟡 Additional Concerns

### 1. **Caching Issues**
- Wallet fingerprints cached for 48 hours (line 91)
- Could miss rapid behavior changes
- Cache errors silently proceed without data

### 2. **Proxy Resolution Failures**
- If proxy->signer mapping fails, trade uses proxy address
- This breaks wallet history tracking
- No correlation between multiple proxy addresses

### 3. **Missing Validations**
- No validation that subgraph data is recent
- No checks for data staleness
- No sanity checks on calculated values

## 📊 Data Flow Issues

### Trade Processing Flow:
1. WebSocket receives trade with proxy address
2. Proxy resolved to signer (can fail)
3. Trade stored in DB
4. Signal detection:
   - Fetches market data
   - Calculates impact (fetches liquidity)
   - Checks thresholds
5. Wallet fingerprinting:
   - Tries Data API first
   - Falls back to Subgraph
   - Can return error/partial/success
6. Scoring:
   - Applies hard filters (too strict)
   - Calculates component scores
   - Weights and classifies

**Failure Points**:
- Proxy resolution → wrong wallet analyzed
- API failures → incomplete fingerprint → filtered out
- Threshold logic → legitimate trades filtered
- Scoring math → impossible to reach alert threshold

## 🔧 Immediate Fixes Needed

### 1. **Fix Wallet Score Filter**
```typescript
// Change from 40 to 20 (40% of max 50-point scale)
this.MIN_WALLET_SCORE = Number(process.env['MIN_WALLET_SCORE']) || 20;
```

### 2. **Fix Market-Aware Threshold**
```typescript
// Use Math.max for proper "either/or" logic
const minThreshold = Math.max(
    thresholds.relativeLiquidityFactor * availableLiquidity,  // Prefer liquidity-based
    thresholds.absoluteMinUsd || 5000  // Fallback to absolute
);
```

### 3. **Adjust Subgraph Flag Thresholds**
```typescript
subgraphLowTradeCount: 5,        // Was 10
subgraphYoungAccountDays: 14,    // Was 30  
subgraphLowVolumeUSD: 10000,     // Was 50000
subgraphFreshFatBetSizeUSD: 5000 // Was 20000
```

### 4. **Handle API Failures Better**
- Don't mark error fingerprints as non-suspicious
- Use partial data when available
- Alert on high failure rates
- Consider suspicious until proven otherwise

### 5. **Simplify Scoring**
Consider removing the 0-50 to 0-100 scaling which adds confusion:
```typescript
const walletScore = this.calculateWalletScore(walletFingerprint); // Keep 0-50
const walletContribution = 0.6 * walletScore * 2; // Scale here if needed
```

## 🎯 Testing Recommendations

1. **Create Test Wallet Profiles**:
   - New wallet with 1 trade → Should score ~26-32 points
   - Young wallet with concentration → Should score ~38 points  
   - Verify these pass minimum filters

2. **Test Market Scenarios**:
   - Low liquidity market ($10k) → $3k trade should trigger
   - High liquidity market ($1M) → $5k trade should still trigger
   - Verify market-aware logic works correctly

3. **Test Failure Modes**:
   - Simulate API failures → Trades should still process
   - Test proxy resolution failures → Should flag for review
   - Check partial data handling

4. **Monitor Key Metrics**:
   - Track filter rates at each stage
   - Monitor API success rates
   - Log score distributions
   - Alert on anomalies

## Summary

The scoring system has good bones but is currently configured too strictly. The combination of:
- High minimum wallet score (40/100 when max realistic is ~50/100)
- Math.min instead of Math.max for thresholds  
- High subgraph flag thresholds
- Silent failure modes

...means many insider trades are likely being missed. The fixes are straightforward and should dramatically improve detection rates.