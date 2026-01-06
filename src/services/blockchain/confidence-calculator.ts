/**
 * Confidence level calculator for wallet fingerprinting
 * Provides accurate confidence assessment based on data quality
 */

import { logger } from '../../utils/logger.js';
import type { DataCompleteness } from '../../types/index.js';
import type { SubgraphWalletData } from '../polymarket/subgraph-client.js';
import type { DataApiUserData } from '../polymarket/data-api-client.js';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  score: number; // 0-100
  factors: ConfidenceFactor[];
  dataQuality: DataQualityMetrics;
}

export interface ConfidenceFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // -10 to +10
  reason: string;
}

export interface DataQualityMetrics {
  completeness: number; // 0-100
  consistency: number; // 0-100
  freshness: number; // 0-100
  reliability: number; // 0-100
}

/**
 * Calculate confidence level based on actual data quality
 */
export function calculateConfidence(
  dataCompleteness: DataCompleteness,
  subgraphData?: SubgraphWalletData | null,
  dataApiData?: DataApiUserData | null,
  errors?: string[]
): ConfidenceAssessment {
  const factors: ConfidenceFactor[] = [];
  let baseScore = 50; // Start at medium

  // Factor 1: Data Source Availability
  if (dataCompleteness.dataApi && dataCompleteness.subgraph) {
    factors.push({
      name: 'Multiple Data Sources',
      impact: 'positive',
      weight: 10,
      reason: 'Both Data API and Subgraph available',
    });
    baseScore += 10;
  } else if (dataCompleteness.dataApi || dataCompleteness.subgraph) {
    factors.push({
      name: 'Single Data Source',
      impact: 'neutral',
      weight: 0,
      reason: 'Only one data source available',
    });
  } else {
    factors.push({
      name: 'No Data Sources',
      impact: 'negative',
      weight: -30,
      reason: 'Neither Data API nor Subgraph returned data',
    });
    baseScore -= 30;
  }

  // Factor 2: Data Consistency (if cross-validation performed)
  if (dataCompleteness.validationScore !== undefined) {
    const validationScore = dataCompleteness.validationScore;

    if (validationScore >= 90) {
      factors.push({
        name: 'High Data Consistency',
        impact: 'positive',
        weight: 15,
        reason: `Data sources agree (${validationScore}% match)`,
      });
      baseScore += 15;
    } else if (validationScore >= 70) {
      factors.push({
        name: 'Moderate Data Consistency',
        impact: 'neutral',
        weight: 5,
        reason: `Minor discrepancies between sources (${validationScore}% match)`,
      });
      baseScore += 5;
    } else {
      factors.push({
        name: 'Poor Data Consistency',
        impact: 'negative',
        weight: -10,
        reason: `Significant discrepancies between sources (${validationScore}% match)`,
      });
      baseScore -= 10;
    }
  }

  // Factor 3: Data Completeness
  const subgraphComplete = Boolean(
    subgraphData?.activity || subgraphData?.clobActivity
  );
  const dataApiComplete = Boolean(
    dataApiData?.activity && dataApiData.activity.totalTrades > 0
  );

  if (subgraphComplete && dataApiComplete) {
    factors.push({
      name: 'Complete Data',
      impact: 'positive',
      weight: 10,
      reason: 'All expected data fields populated',
    });
    baseScore += 10;
  } else if (subgraphComplete || dataApiComplete) {
    factors.push({
      name: 'Partial Data',
      impact: 'negative',
      weight: -5,
      reason: 'Some data fields missing',
    });
    baseScore -= 5;
  } else {
    factors.push({
      name: 'Minimal Data',
      impact: 'negative',
      weight: -15,
      reason: 'Most data fields missing',
    });
    baseScore -= 15;
  }

  // Factor 4: Cache Usage
  if (dataCompleteness.cache) {
    factors.push({
      name: 'Cached Data',
      impact: 'negative',
      weight: -5,
      reason: 'Using potentially stale cached data',
    });
    baseScore -= 5;
  }

  // Factor 5: Data Freshness
  const dataAge = Date.now() - dataCompleteness.timestamp;
  const ageMinutes = dataAge / (1000 * 60);

  if (ageMinutes < 1) {
    factors.push({
      name: 'Fresh Data',
      impact: 'positive',
      weight: 5,
      reason: 'Data fetched within last minute',
    });
    baseScore += 5;
  } else if (ageMinutes > 10) {
    factors.push({
      name: 'Stale Data',
      impact: 'negative',
      weight: -5,
      reason: `Data is ${Math.round(ageMinutes)} minutes old`,
    });
    baseScore -= 5;
  }

  // Factor 6: Error Presence
  if (errors && errors.length > 0) {
    factors.push({
      name: 'API Errors',
      impact: 'negative',
      weight: -10,
      reason: `${errors.length} error(s) during data fetch`,
    });
    baseScore -= 10;
  }

  // Factor 7: Trade History
  const totalTrades =
    (subgraphData?.activity?.tradeCount ?? 0) +
    (subgraphData?.clobActivity?.tradeCount ?? 0) +
    (dataApiData?.activity?.totalTrades ?? 0);

  if (totalTrades === 0) {
    factors.push({
      name: 'New User',
      impact: 'negative',
      weight: -20,
      reason: 'No trading history available',
    });
    baseScore -= 20;
  } else if (totalTrades < 5) {
    factors.push({
      name: 'Limited History',
      impact: 'negative',
      weight: -10,
      reason: `Only ${totalTrades} trades found`,
    });
    baseScore -= 10;
  } else if (totalTrades > 50) {
    factors.push({
      name: 'Extensive History',
      impact: 'positive',
      weight: 10,
      reason: `${totalTrades} trades provide good analysis basis`,
    });
    baseScore += 10;
  }

  // Calculate final score and level
  const finalScore = Math.max(0, Math.min(100, baseScore));

  let level: ConfidenceLevel;
  if (finalScore >= 75) {
    level = 'high';
  } else if (finalScore >= 40) {
    level = 'medium';
  } else if (finalScore > 0) {
    level = 'low';
  } else {
    level = 'none';
  }

  // Calculate data quality metrics
  const dataQuality: DataQualityMetrics = {
    completeness: calculateCompleteness(subgraphData, dataApiData),
    consistency: dataCompleteness.validationScore ?? 100,
    freshness: Math.max(0, 100 - ageMinutes * 10),
    reliability: calculateReliability(dataCompleteness, errors),
  };

  // Log confidence assessment for important cases
  if (level === 'low' || level === 'none') {
    logger.warn(
      {
        confidenceLevel: level,
        score: finalScore,
        factors: factors.filter((f) => f.impact === 'negative'),
        dataQuality,
      },
      'Low confidence wallet analysis'
    );
  }

  return {
    level,
    score: finalScore,
    factors,
    dataQuality,
  };
}

/**
 * Calculate data completeness percentage
 */
function calculateCompleteness(
  subgraphData?: SubgraphWalletData | null,
  dataApiData?: DataApiUserData | null
): number {
  let fieldsExpected = 0;
  let fieldsPresent = 0;

  // Check subgraph fields
  if (subgraphData) {
    fieldsExpected += 3; // activity, clobActivity, positions
    if (subgraphData.activity) fieldsPresent++;
    if (subgraphData.clobActivity) fieldsPresent++;
    if (subgraphData.positions) fieldsPresent++;
  }

  // Check Data API fields
  if (dataApiData) {
    fieldsExpected += 3; // activity, recentTrades, positions
    if (dataApiData.activity) fieldsPresent++;
    if (dataApiData.recentTrades.length > 0) fieldsPresent++;
    if (dataApiData.positions.length > 0) fieldsPresent++;
  }

  return fieldsExpected > 0
    ? Math.round((fieldsPresent / fieldsExpected) * 100)
    : 0;
}

/**
 * Calculate data reliability based on sources and errors
 */
function calculateReliability(
  dataCompleteness: DataCompleteness,
  errors?: string[]
): number {
  let reliability = 100;

  // Reduce for single source
  if (!(dataCompleteness.dataApi && dataCompleteness.subgraph)) {
    reliability -= 20;
  }

  // Reduce for cache usage
  if (dataCompleteness.cache) {
    reliability -= 10;
  }

  // Reduce for errors
  if (errors && errors.length > 0) {
    reliability -= errors.length * 15;
  }

  // Reduce for discrepancies
  if (dataCompleteness.hasDiscrepancies) {
    reliability -= 15;
  }

  return Math.max(0, reliability);
}
