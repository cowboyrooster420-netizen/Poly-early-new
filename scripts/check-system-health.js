#!/usr/bin/env node

import { db } from '../src/services/database/prisma.js';
import { tradeService } from '../src/services/polymarket/trade-service.js';
import { marketService } from '../src/services/polymarket/market-service.js';

/**
 * Quick health check script to see if the insider detection system is working
 */
async function checkSystemHealth() {
  console.log('🔍 Checking system health...\n');

  try {
    const prisma = db.getClient();

    // 1. Check trade processing stats
    console.log('📊 Trade Processing Stats:');
    const tradeStats = await tradeService.getTradeStats();
    console.log(`  Total trades: ${tradeStats.totalTrades}`);
    console.log(`  Last 24h: ${tradeStats.last24h}`);
    console.log(`  Last hour: ${tradeStats.lastHour}`);
    console.log(`  Avg trade size: $${parseFloat(tradeStats.avgSize).toFixed(2)}`);
    console.log('');

    // 2. Check recent alerts
    console.log('🚨 Recent Alerts:');
    const alerts = await prisma.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: {
        id: true,
        marketId: true,
        marketQuestion: true,
        confidenceScore: true,
        classification: true,
        timestamp: true,
        tradeSide: true,
        tradePrice: true,
        tradeSize: true
      }
    });

    if (alerts.length === 0) {
      console.log('  No alerts generated yet');
    } else {
      alerts.forEach(alert => {
        const age = Math.round((Date.now() - alert.timestamp.getTime()) / (1000 * 60));
        console.log(`  ${alert.timestamp.toISOString()} (${age}m ago)`);
        console.log(`    Market: ${alert.marketQuestion.substring(0, 60)}...`);
        console.log(`    Score: ${alert.confidenceScore} (${alert.classification})`);
        console.log(`    Trade: ${alert.tradeSide} $${alert.tradeSize} @ $${alert.tradePrice}`);
        console.log('');
      });
    }

    // 3. Check large recent trades that should have been analyzed
    console.log('💰 Recent Large Trades (>$1000):');
    const largeTrades = await prisma.trade.findMany({
      where: {
        size: { gte: 1000 },
        timestamp: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        marketId: true,
        side: true,
        size: true,
        price: true,
        outcome: true,
        taker: true,
        timestamp: true
      }
    });

    if (largeTrades.length === 0) {
      console.log('  No large trades in last 2 hours');
    } else {
      largeTrades.forEach(trade => {
        const age = Math.round((Date.now() - trade.timestamp.getTime()) / (1000 * 60));
        console.log(`  ${trade.timestamp.toISOString()} (${age}m ago)`);
        console.log(`    Trade: ${trade.side.toUpperCase()} $${trade.size} ${trade.outcome} @ $${trade.price}`);
        console.log(`    Wallet: ${trade.taker.substring(0, 10)}...`);
        console.log('');
      });
    }

    // 4. Check monitored markets
    console.log('🏪 Monitored Markets:');
    const marketStats = marketService.getStats();
    console.log(`  Total: ${marketStats.total}`);
    console.log(`  By tier: T1=${marketStats.tier1}, T2=${marketStats.tier2}, T3=${marketStats.tier3}`);
    console.log(`  By category: ${Object.entries(marketStats.byCategory).map(([k,v]) => `${k}=${v}`).join(', ')}`);
    console.log('');

    // 5. Check system activity in last 10 minutes
    console.log('⏱️  Recent Activity (last 10 min):');
    const recentTrades = await prisma.trade.findMany({
      where: {
        timestamp: { gte: new Date(Date.now() - 10 * 60 * 1000) }
      },
      orderBy: { timestamp: 'desc' },
      take: 5
    });

    if (recentTrades.length === 0) {
      console.log('  ⚠️  No trades in last 10 minutes - system may be down');
    } else {
      console.log(`  ✅ ${recentTrades.length} trades processed`);
      console.log(`  Latest: ${recentTrades[0].timestamp.toISOString()}`);
    }

    console.log('\n🎯 System Status:');
    if (recentTrades.length > 0) {
      console.log('  ✅ Trade ingestion: WORKING');
    } else {
      console.log('  ❌ Trade ingestion: NO RECENT ACTIVITY');
    }

    if (alerts.length > 0) {
      const latestAlert = alerts[0];
      const alertAge = (Date.now() - latestAlert.timestamp.getTime()) / (1000 * 60 * 60);
      if (alertAge < 24) {
        console.log('  ✅ Alert generation: WORKING (recent alert found)');
      } else {
        console.log('  ⚠️  Alert generation: No alerts in last 24h');
      }
    } else {
      console.log('  ⚠️  Alert generation: No alerts found');
    }

  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

checkSystemHealth()
  .then(() => {
    console.log('✅ Health check complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  });