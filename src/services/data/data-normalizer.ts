/**
 * Unified data validation and normalization layer
 * Ensures consistent data handling across different sources
 */

import { logger } from '../../utils/logger.js';
import { normalizeVolume } from '../../utils/decimals.js';
import type { SubgraphWalletData } from '../polymarket/subgraph-client.js';
import type { DataApiUserData } from '../polymarket/data-api-client.js';

/**
 * Normalized wallet data structure
 * Provides consistent interface regardless of data source
 */
export interface NormalizedWalletData {
  address: string;
  tradeCount: number;
  volumeUSD: number;
  accountAgeDays: number | null;
  firstTradeTimestamp: number | null;
  lastTradeTimestamp: number | null;
  winRate: number | null;
  pnl: number | null;
  marketsTraded: number;
  dataSource: 'subgraph' | 'data-api' | 'combined';
  confidence: DataConfidence;
  warnings: string[];
}

export interface DataConfidence {
  level: 'high' | 'medium' | 'low';
  score: number; // 0-100
  reasons: string[];
}

/**
 * Data validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
}

/**
 * Normalize subgraph data to unified format
 */
export function normalizeSubgraphData(
  data: SubgraphWalletData,
  address: string
): NormalizedWalletData {
  const warnings: string[] = [];
  const confidenceReasons: string[] = [];
  let confidenceScore = 100;

  // Extract activity data
  const activity = data.activity;
  const clobActivity = data.clobActivity;

  // Calculate combined metrics
  const tradeCount =
    (activity?.tradeCount ?? 0) + (clobActivity?.tradeCount ?? 0);

  const volumeUSD =
    normalizeVolume(activity?.totalVolumeUSD, 'subgraph') +
    normalizeVolume(clobActivity?.totalVolumeUSD, 'subgraph');

  // Validate data consistency
  if (activity && clobActivity) {
    // Both data sources available - high confidence
    confidenceReasons.push('Multiple data sources available');
  } else if (!activity && !clobActivity) {
    // No data - low confidence
    confidenceScore -= 50;
    confidenceReasons.push('No activity data available');
    warnings.push('No trading activity found in subgraph');
  } else {
    // Partial data - medium confidence
    confidenceScore -= 20;
    confidenceReasons.push('Partial data available');
    if (!activity) warnings.push('No split/merge activity found');
    if (!clobActivity) warnings.push('No CLOB trading activity found');
  }

  // Calculate account age
  const firstTimestamp = Math.min(
    activity?.firstTradeTimestamp ?? Infinity,
    clobActivity?.firstTradeTimestamp ?? Infinity
  );

  const accountAgeDays =
    firstTimestamp < Infinity
      ? (Date.now() - firstTimestamp) / (1000 * 60 * 60 * 24)
      : null;

  // Determine confidence level
  const confidence: DataConfidence = {
    level:
      confidenceScore >= 80 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low',
    score: confidenceScore,
    reasons: confidenceReasons,
  };

  return {
    address: address.toLowerCase(),
    tradeCount,
    volumeUSD,
    accountAgeDays,
    firstTradeTimestamp: firstTimestamp < Infinity ? firstTimestamp : null,
    lastTradeTimestamp:
      Math.max(
        activity?.recentTrades[0]?.timestamp ?? 0,
        clobActivity?.recentTrades[0]?.timestamp ?? 0
      ) || null,
    winRate: null, // Not available from subgraph
    pnl: null, // Would need positions data
    marketsTraded: new Set([
      ...(activity?.recentTrades.map((t) => t.marketId) ?? []),
      ...(clobActivity?.recentTrades.map((t) => t.assetId) ?? []),
    ]).size,
    dataSource: 'subgraph',
    confidence,
    warnings,
  };
}

/**
 * Normalize Data API data to unified format
 */
export function normalizeDataApiData(
  data: DataApiUserData,
  address: string
): NormalizedWalletData {
  const warnings: string[] = [];
  const confidenceReasons: string[] = [];
  let confidenceScore = 100;

  const activity = data.activity;

  if (!activity) {
    confidenceScore -= 50;
    confidenceReasons.push('No activity summary available');
    warnings.push('User activity not found in Data API');
  } else {
    confidenceReasons.push('Complete activity summary available');
  }

  // Calculate account age from first trade
  const firstTimestamp = activity?.firstTradeTimestamp;
  const accountAgeDays = firstTimestamp
    ? (Date.now() - firstTimestamp) / (1000 * 60 * 60 * 24)
    : null;

  // Extract PnL
  const pnl = activity?.totalPnL ? parseFloat(activity.totalPnL) : null;

  const confidence: DataConfidence = {
    level:
      confidenceScore >= 80 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low',
    score: confidenceScore,
    reasons: confidenceReasons,
  };

  return {
    address: address.toLowerCase(),
    tradeCount: activity?.totalTrades ?? 0,
    volumeUSD: normalizeVolume(activity?.totalVolume, 'data-api'),
    accountAgeDays,
    firstTradeTimestamp: activity?.firstTradeTimestamp ?? null,
    lastTradeTimestamp: activity?.lastTradeTimestamp ?? null,
    winRate: activity?.winRate ?? null,
    pnl,
    marketsTraded: activity?.marketsTraded ?? 0,
    dataSource: 'data-api',
    confidence,
    warnings,
  };
}

/**
 * Validate data consistency between sources
 */
export function validateDataConsistency(
  subgraphData: NormalizedWalletData,
  dataApiData: NormalizedWalletData
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence = 100;

  // Check trade count consistency (allow 10% variance)
  const tradeCountDiff = Math.abs(
    subgraphData.tradeCount - dataApiData.tradeCount
  );
  const tradeCountAvg = (subgraphData.tradeCount + dataApiData.tradeCount) / 2;

  if (tradeCountAvg > 0 && tradeCountDiff / tradeCountAvg > 0.1) {
    const pctDiff = ((tradeCountDiff / tradeCountAvg) * 100).toFixed(1);
    warnings.push(`Trade count differs by ${pctDiff}% between sources`);
    confidence -= 10;
  }

  // Check volume consistency (allow 15% variance due to rounding)
  const volumeDiff = Math.abs(subgraphData.volumeUSD - dataApiData.volumeUSD);
  const volumeAvg = (subgraphData.volumeUSD + dataApiData.volumeUSD) / 2;

  if (volumeAvg > 100 && volumeDiff / volumeAvg > 0.15) {
    const pctDiff = ((volumeDiff / volumeAvg) * 100).toFixed(1);
    warnings.push(`Volume differs by ${pctDiff}% between sources`);
    confidence -= 15;
  }

  // Check account age consistency
  if (
    subgraphData.accountAgeDays !== null &&
    dataApiData.accountAgeDays !== null
  ) {
    const ageDiff = Math.abs(
      subgraphData.accountAgeDays - dataApiData.accountAgeDays
    );
    if (ageDiff > 1) {
      // Allow 1 day variance
      warnings.push(`Account age differs by ${ageDiff.toFixed(0)} days`);
      confidence -= 5;
    }
  }

  // Major discrepancy check
  if (
    (subgraphData.tradeCount > 0 && dataApiData.tradeCount === 0) ||
    (subgraphData.tradeCount === 0 && dataApiData.tradeCount > 0)
  ) {
    errors.push('One source shows activity while the other shows none');
    confidence -= 50;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    confidence: Math.max(0, confidence),
  };
}

/**
 * Merge data from multiple sources with conflict resolution
 */
export function mergeWalletData(sources: {
  subgraph?: NormalizedWalletData;
  dataApi?: NormalizedWalletData;
}): NormalizedWalletData {
  const { subgraph, dataApi } = sources;

  // If only one source, return it
  if (!subgraph && dataApi) return dataApi;
  if (subgraph && !dataApi) return subgraph;
  if (!subgraph && !dataApi) {
    throw new Error('No data sources provided');
  }

  // Both sources available - merge with validation
  const validation = validateDataConsistency(subgraph!, dataApi!);

  // Use Data API as primary source (more comprehensive)
  // But supplement with subgraph data where needed
  const merged: NormalizedWalletData = {
    address: dataApi!.address,
    tradeCount: Math.max(subgraph!.tradeCount, dataApi!.tradeCount),
    volumeUSD: Math.max(subgraph!.volumeUSD, dataApi!.volumeUSD),
    accountAgeDays: dataApi!.accountAgeDays ?? subgraph!.accountAgeDays,
    firstTradeTimestamp:
      Math.min(
        subgraph!.firstTradeTimestamp ?? Infinity,
        dataApi!.firstTradeTimestamp ?? Infinity
      ) || null,
    lastTradeTimestamp:
      Math.max(
        subgraph!.lastTradeTimestamp ?? 0,
        dataApi!.lastTradeTimestamp ?? 0
      ) || null,
    winRate: dataApi!.winRate, // Only from Data API
    pnl: dataApi!.pnl, // Only from Data API
    marketsTraded: Math.max(subgraph!.marketsTraded, dataApi!.marketsTraded),
    dataSource: 'combined',
    confidence: {
      level:
        validation.confidence >= 80
          ? 'high'
          : validation.confidence >= 50
            ? 'medium'
            : 'low',
      score: validation.confidence,
      reasons: [
        'Data from multiple sources',
        ...validation.warnings,
        ...validation.errors,
      ],
    },
    warnings: [...validation.warnings, ...validation.errors],
  };

  // Log significant discrepancies
  if (validation.warnings.length > 0 || validation.errors.length > 0) {
    logger.warn(
      {
        address: merged.address,
        validation,
        subgraphMetrics: {
          trades: subgraph!.tradeCount,
          volume: subgraph!.volumeUSD,
        },
        dataApiMetrics: {
          trades: dataApi!.tradeCount,
          volume: dataApi!.volumeUSD,
        },
      },
      'Data consistency issues detected during merge'
    );
  }

  return merged;
}
