import { logger } from '../../utils/logger.js';
import type { TradeSignal } from '../../types/index.js';
import type { WalletFingerprint } from '../blockchain/wallet-forensics.js';

/**
 * Alert confidence score breakdown
 */
export interface AlertScore {
  totalScore: number; // 0-90 (trade size 0-40 + wallet 0-50)
  breakdown: {
    tradeSize: number; // 0-40 points
    walletSuspicion: number; // 0-50 points
  };
  classification: 'low' | 'medium' | 'high' | 'critical';
  recommendation: 'ignore' | 'monitor' | 'investigate' | 'alert';
}

/**
 * Alert scoring service
 * Combines multiple signal sources into a unified confidence score
 */
class AlertScorerService {
  private static instance: AlertScorerService | null = null;

  // Score thresholds for classification
  private readonly THRESHOLDS = {
    LOW: 30,
    MEDIUM: 50,
    HIGH: 70,
    CRITICAL: 85,
  };

  private constructor() {
    logger.info('Alert scorer service initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AlertScorerService {
    if (AlertScorerService.instance === null) {
      AlertScorerService.instance = new AlertScorerService();
    }
    return AlertScorerService.instance;
  }

  /**
   * Calculate confidence score for an alert
   * Combines trade size (0-40) and wallet suspicion (0-50) into 0-90 score
   */
  public calculateScore(params: {
    tradeSignal: TradeSignal;
    walletFingerprint: WalletFingerprint;
  }): AlertScore {
    const { tradeSignal, walletFingerprint } = params;

    // Calculate individual component scores
    const tradeSizeScore = this.scoreTradeSizeSignal(tradeSignal);
    const walletScore = this.scoreWalletSuspicion(walletFingerprint);

    // Total score (max 90)
    const totalScore = tradeSizeScore + walletScore;

    // Classify alert
    const classification = this.classifyScore(totalScore);
    const recommendation = this.getRecommendation(classification);

    const score: AlertScore = {
      totalScore: Math.round(totalScore),
      breakdown: {
        tradeSize: Math.round(tradeSizeScore),
        walletSuspicion: Math.round(walletScore),
      },
      classification,
      recommendation,
    };

    logger.debug(
      {
        totalScore: score.totalScore,
        breakdown: score.breakdown,
        classification,
      },
      'Alert score calculated'
    );

    return score;
  }

  /**
   * Score trade size signal (0-40 points)
   * Higher OI percentage and price impact = higher score
   */
  private scoreTradeSizeSignal(signal: TradeSignal): number {
    let score = 0;

    // OI percentage scoring (0-28 points)
    // 20% OI = 5.6 points, 50% OI = 14 points, 100%+ OI = 28 points
    const oiScore = Math.min(28, (signal.oiPercentage / 100) * 28);
    score += oiScore;

    // Price impact scoring (0-12 points)
    // 20% impact = 2.4 points, 50% impact = 6 points, 100%+ impact = 12 points
    const impactScore = Math.min(12, (signal.priceImpact / 100) * 12);
    score += impactScore;

    return score;
  }

  /**
   * Score wallet suspicion (0-50 points)
   * Weights optimized for reliable detection without CEX dependency
   */
  private scoreWalletSuspicion(wallet: WalletFingerprint): number {
    let score = 0;

    // Individual flag scoring (no bonus for isSuspicious - linear scoring)
    const { flags } = wallet;

    // Low transaction count (14 points) - strongest reliable signal
    if (flags.lowTxCount) {
      score += 14;
    }

    // Young wallet (12 points) - very strong reliable signal
    if (flags.youngWallet) {
      score += 12;
    }

    // High Polymarket netflow (12 points) - strong reliable signal
    if (flags.highPolymarketNetflow) {
      score += 12;
    }

    // Single purpose wallet (6 points) - moderate signal
    if (flags.singlePurpose) {
      score += 6;
    }

    // CEX funded (6 points) - unreliable (depends on wallet list)
    if (flags.cexFunded) {
      score += 6;
    }

    return Math.min(50, score); // Cap at 50
  }

  /**
   * Classify score into categories
   */
  private classifyScore(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.THRESHOLDS.CRITICAL) return 'critical';
    if (score >= this.THRESHOLDS.HIGH) return 'high';
    if (score >= this.THRESHOLDS.MEDIUM) return 'medium';
    return 'low';
  }

  /**
   * Get recommendation based on classification
   */
  private getRecommendation(
    classification: 'low' | 'medium' | 'high' | 'critical'
  ): 'ignore' | 'monitor' | 'investigate' | 'alert' {
    switch (classification) {
      case 'critical':
      case 'high':
        return 'alert'; // Send notification immediately
      case 'medium':
        return 'investigate'; // Log for manual review
      case 'low':
      default:
        return 'monitor'; // Track but don't alert
    }
  }

  /**
   * Check if score meets alert threshold
   * Only scores >= 70 (high/critical) should trigger alerts
   */
  public shouldAlert(score: AlertScore): boolean {
    return score.totalScore >= this.THRESHOLDS.HIGH;
  }
}

// Export singleton instance
export const alertScorer = AlertScorerService.getInstance();
