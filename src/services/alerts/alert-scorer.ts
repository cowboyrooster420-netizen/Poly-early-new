import { logger } from '../../utils/logger.js';
import type {
  TradeSignal,
  DormancyMetrics,
} from '../signals/signal-detector.js';
import type { WalletFingerprint } from '../blockchain/wallet-forensics.js';

/**
 * Alert confidence score breakdown
 */
export interface AlertScore {
  totalScore: number; // 0-100
  breakdown: {
    tradeSize: number; // 0-25 points
    dormancy: number; // 0-25 points
    walletSuspicion: number; // 0-35 points
    timing: number; // 0-15 points (placeholder for future timing analysis)
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
   * Combines trade size, dormancy, and wallet suspicion into 0-100 score
   */
  public calculateScore(params: {
    tradeSignal: TradeSignal;
    dormancy: DormancyMetrics;
    walletFingerprint: WalletFingerprint;
  }): AlertScore {
    const { tradeSignal, dormancy, walletFingerprint } = params;

    // Calculate individual component scores
    const tradeSizeScore = this.scoreTradeSizeSignal(tradeSignal);
    const dormancyScore = this.scoreDormancy(dormancy);
    const walletScore = this.scoreWalletSuspicion(walletFingerprint);
    const timingScore = 0; // Placeholder for future timing analysis

    // Total score (max 100)
    const totalScore = Math.min(
      100,
      tradeSizeScore + dormancyScore + walletScore + timingScore
    );

    // Classify alert
    const classification = this.classifyScore(totalScore);
    const recommendation = this.getRecommendation(classification);

    const score: AlertScore = {
      totalScore: Math.round(totalScore),
      breakdown: {
        tradeSize: Math.round(tradeSizeScore),
        dormancy: Math.round(dormancyScore),
        walletSuspicion: Math.round(walletScore),
        timing: timingScore,
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
   * Score trade size signal (0-25 points)
   * Higher OI percentage and price impact = higher score
   */
  private scoreTradeSizeSignal(signal: TradeSignal): number {
    let score = 0;

    // OI percentage scoring (0-15 points)
    // 20% OI = 8 points, 50% OI = 12 points, 100%+ OI = 15 points
    const oiScore = Math.min(15, (signal.oiPercentage / 100) * 15);
    score += oiScore;

    // Price impact scoring (0-10 points)
    // 20% impact = 5 points, 50% impact = 8 points, 100%+ impact = 10 points
    const impactScore = Math.min(10, (signal.priceImpact / 100) * 10);
    score += impactScore;

    return score;
  }

  /**
   * Score dormancy metrics (0-25 points)
   * Longer dormancy = higher score (more unusual activity)
   */
  private scoreDormancy(dormancy: DormancyMetrics): number {
    let score = 0;

    // Hours since last large trade (0-15 points)
    // 4 hours = 8 points, 12 hours = 12 points, 24+ hours = 15 points
    const largeTradeHours = dormancy.hoursSinceLastLargeTrade;
    const largeTradeScore = Math.min(15, (largeTradeHours / 24) * 15);
    score += largeTradeScore;

    // Hours since last price move (0-10 points)
    // 3 hours = 5 points, 12 hours = 8 points, 24+ hours = 10 points
    const priceMoveHours = dormancy.hoursSinceLastPriceMove;
    const priceMoveScore = Math.min(10, (priceMoveHours / 24) * 10);
    score += priceMoveScore;

    return score;
  }

  /**
   * Score wallet suspicion (0-35 points)
   * More suspicious flags = higher score
   */
  private scoreWalletSuspicion(wallet: WalletFingerprint): number {
    let score = 0;

    // Base score for suspicious wallet
    if (wallet.isSuspicious) {
      score += 15; // Wallet has >= 3 flags
    }

    // Individual flag scoring (max 20 points total from flags)
    const { flags } = wallet;

    // CEX funded (7 points) - very strong signal
    if (flags.cexFunded) {
      score += 7;
    }

    // Low transaction count (5 points) - strong signal
    if (flags.lowTxCount) {
      score += 5;
    }

    // Young wallet (4 points) - moderate signal
    if (flags.youngWallet) {
      score += 4;
    }

    // High Polymarket netflow (3 points) - moderate signal
    if (flags.highPolymarketNetflow) {
      score += 3;
    }

    // Single purpose wallet (1 point) - weak signal
    if (flags.singlePurpose) {
      score += 1;
    }

    return Math.min(35, score); // Cap at 35
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
