#!/usr/bin/env node

import { db } from '../src/services/database/prisma.js';
import { signalDetector } from '../src/services/signals/signal-detector.js';
import { walletForensicsService } from '../src/services/blockchain/wallet-forensics.js';
import { alertScorer } from '../src/services/alerts/alert-scorer.js';

/**
 * Test the system with lower thresholds to see if alerts would be generated
 */
async function testLowerThresholds() {
  // Override thresholds with lower values
  process.env.MIN_OI_PERCENTAGE = '5';              // Was 20%
  process.env.MIN_PRICE_IMPACT = '5';               // Was 20%
  process.env.SUBGRAPH_FRESH_FAT_BET_SIZE_USD = '1000';  // Was $20,000
  process.env.SUBGRAPH_LOW_TRADE_COUNT = '5';       // Was 10
  process.env.MIN_CONFIDENCE_SCORE = '50';          // Was 75
  process.env.MIN_WALLET_SCORE = '40';              // Was 70

  console.log('🧪 Testing with lower thresholds...\n');
  console.log('New thresholds:');
  console.log('  MIN_OI_PERCENTAGE: 5% (was 20%)');
  console.log('  MIN_PRICE_IMPACT: 5% (was 20%)');
  console.log('  FRESH_FAT_BET_SIZE: $1,000 (was $20,000)');
  console.log('  MIN_CONFIDENCE_SCORE: 50 (was 75)');
  console.log('\n---\n');

  try {
    const prisma = db.getClient();

    // Get recent large trades from last 24h
    const trades = await prisma.trade.findMany({
      where: {
        size: { gte: 500 }, // $500+ trades
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy: { size: 'desc' },
      take: 20,
      include: {
        market: true
      }
    });

    console.log(`Found ${trades.length} trades >= $500 in last 24h\n`);

    let wouldTriggerCount = 0;

    for (const trade of trades) {
      console.log(`\n📊 Analyzing trade ${trade.id}`);
      console.log(`  Market: ${trade.market?.question?.substring(0, 60)}...`);
      console.log(`  Size: $${trade.size}`);
      console.log(`  Price: ${trade.price}`);
      console.log(`  Wallet: ${trade.taker.substring(0, 10)}...`);

      // Simulate signal detection
      const signal = await signalDetector.analyzeTrade({
        id: trade.id,
        marketId: trade.marketId,
        side: trade.side,
        size: trade.size.toString(),
        price: trade.price.toString(),
        outcome: trade.outcome,
        maker: trade.maker,
        taker: trade.taker,
        timestamp: trade.timestamp.getTime()
      });

      if (signal) {
        console.log(`  ✅ Signal detected!`);
        console.log(`     OI%: ${signal.oiPercentage.toFixed(2)}%`);
        console.log(`     Price Impact: ${signal.priceImpact.toFixed(2)}%`);
        console.log(`     USD Value: $${signal.tradeUsdValue.toFixed(2)}`);

        // Analyze wallet
        const walletFingerprint = await walletForensicsService.analyzeWallet(
          trade.taker,
          {
            tradeSizeUSD: signal.tradeUsdValue,
            marketOI: parseFloat(signal.openInterest),
          }
        );

        console.log(`  🔍 Wallet analysis:`);
        console.log(`     Suspicious: ${walletFingerprint.isSuspicious}`);
        console.log(`     Trade count: ${walletFingerprint.subgraphMetadata.polymarketTradeCount}`);
        console.log(`     Volume: $${walletFingerprint.subgraphMetadata.polymarketVolumeUSD.toFixed(2)}`);

        // Calculate score
        const alertScore = await alertScorer.calculateScore({
          tradeSignal: signal,
          walletFingerprint,
          entryProbability: parseFloat(trade.price.toString())
        });

        console.log(`  📈 Alert score: ${alertScore.totalScore}`);
        console.log(`     Classification: ${alertScore.classification}`);
        console.log(`     Would trigger alert: ${alertScorer.shouldAlert(alertScore) ? 'YES ✅' : 'NO ❌'}`);

        if (alertScorer.shouldAlert(alertScore)) {
          wouldTriggerCount++;
        }
      } else {
        console.log(`  ❌ No signal (trade too small for market)`);
      }
    }

    console.log(`\n🎯 Summary:`);
    console.log(`  Total trades analyzed: ${trades.length}`);
    console.log(`  Would trigger alerts: ${wouldTriggerCount}`);
    console.log(`  Alert rate: ${((wouldTriggerCount / trades.length) * 100).toFixed(1)}%`);

    if (wouldTriggerCount === 0) {
      console.log('\n⚠️  Even with lower thresholds, no alerts would be triggered.');
      console.log('    This suggests the issue may be with market OI data or price impact calculation.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run with proper environment setup
async function main() {
  // Set minimal env vars to prevent validation errors
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.odtibjbayzlhgypxjitw:Winnieandleo99%21@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "dummy";
  process.env.POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "dummy";

  await testLowerThresholds();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});