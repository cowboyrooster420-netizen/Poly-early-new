# Market-Aware Minimum Thresholds

## Overview

The system now uses market-aware minimum thresholds to prevent bias towards extreme probability markets while still detecting meaningful trades across all market conditions.

## Configuration

Add these to your `.env` file:

```bash
# Market-aware minimum thresholds
ABSOLUTE_MIN_USD=5000              # Maximum requirement (ceiling)
RELATIVE_LIQUIDITY_FACTOR=0.5      # Minimum fraction of available liquidity
```

## How It Works

The system calculates a dynamic minimum threshold:

```typescript
minThreshold = Math.min(
  ABSOLUTE_MIN_USD,                           // $5,000 ceiling
  RELATIVE_LIQUIDITY_FACTOR * availableLiquidity  // 50% of liquidity
)
```

### Examples

1. **Deep Market** ($100k liquidity)
   - Min threshold = min($5000, 0.5 × $100k) = **$5,000**
   - Small trades are filtered out

2. **Medium Market** ($20k liquidity)  
   - Min threshold = min($5000, 0.5 × $20k) = **$5,000**
   - Standard filtering applies

3. **Thin Market** ($6k liquidity)
   - Min threshold = min($5000, 0.5 × $6k) = **$3,000**
   - Threshold scales down to market reality

4. **Micro Market** ($2k liquidity)
   - Min threshold = min($5000, 0.5 × $2k) = **$1,000**
   - Allows detection in tiny markets

## Why This Matters

### Previous Issues

- Extreme probability markets have thin order books
- Small trades showed high "impact" due to low liquidity
- System was biased towards detecting lottery ticket trades

### Solution Benefits

- **Removes bias**: Thin liquidity alone isn't enough
- **Preserves detection**: Still catches dominant trades in small markets
- **Market aware**: Adjusts to what's actually possible in each market

## Trade Flow

1. Calculate trade USD value
2. Fetch available liquidity (if using liquidity method)
3. Calculate market-aware minimum threshold
4. **Gate 1**: Trade must exceed minimum threshold
5. **Gate 2**: Trade must exceed impact percentage threshold
6. Only trades passing both gates proceed to wallet analysis

## Monitoring

New log entries help track effectiveness:

```
🚫 Trade filtered: $24 < $3000 minimum (market-aware threshold)
```

New stat counter: `filtered_market_aware_minimum`

## Tuning

- **Increase ABSOLUTE_MIN_USD**: Filter out more small trades
- **Decrease RELATIVE_LIQUIDITY_FACTOR**: Allow smaller relative trades
- **Switch to volume/OI method**: Avoid liquidity calculations entirely