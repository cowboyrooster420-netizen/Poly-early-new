import { redis } from '../cache/redis.js';
import { logger } from '../../utils/logger.js';
import type { TradeSignal } from '../../types/index.js';
import type { WalletFingerprint } from '../blockchain/wallet-forensics.js';

// Stats key for tracking
const STATS_KEY = 'stats:alert_scorer';

/**
 * Alert classification result
 */
export type AlertClassification =
  | 'ALERT_STRONG_INSIDER'
  | 'ALERT_HIGH_CONFIDENCE'
  | 'ALERT_MEDIUM_CONFIDENCE'
  | 'LOG_ONLY'
  | 'IGNORE';

/**
 * Alert score breakdown for transparency
 */
export interface AlertScore {
  totalScore: number; // 0-100 weighted score
  breakdown: {
    walletScore: number; // 0-100 (rescaled from 0-50)
    oiScore: number; // 0-100 (with multipliers)
    extremityScore: number; // 0-40
    walletContribution: number; // 50% of wallet score
    oiContribution: number; // 35% of OI score
    extremityContribution: number; // 15% of extremity score
  };
  multipliers: {
    marketSize: number; // 1.0, 1.5, or 2.0
    dormancy: number; // 1.0, 1.5, or 2.0
  };
  classification: AlertClassification;
  filtersPassed: boolean;
  filterReason?: string;
}

/**
 * Input parameters for scoring
 */
export interface ScoreInput {
  tradeSignal: TradeSignal;
  walletFingerprint: WalletFingerprint;
  entryProbability: number; // 0.0-1.0 (trade price)
}

/**
 * Alert scoring service
 * Implements the new tiered scoring with multipliers
 */
class AlertScorerService {
  private static instance: AlertScorerService | null = null;

  // Hard filter thresholds (configurable via env vars)
  private readonly MIN_TRADE_SIZE_USD: number;
  private readonly MIN_OI_USD: number;
  private readonly MIN_WALLET_SCORE: number;

  private constructor() {
    // Load thresholds from env vars with defaults
    this.MIN_TRADE_SIZE_USD = Number(process.env['MIN_TRADE_SIZE_USD']) || 1000;
    this.MIN_OI_USD = Number(process.env['MIN_OI_USD']) || 5000;
    this.MIN_WALLET_SCORE = Number(process.env['MIN_WALLET_SCORE']) || 40;

    logger.info(
      {
        minTradeSize: this.MIN_TRADE_SIZE_USD,
        minOi: this.MIN_OI_USD,
        minWalletScore: this.MIN_WALLET_SCORE,
      },
      'Alert scorer service initialized (v2 - tiered scoring)'
    );
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
   * Increment a stat counter
   */
  private async incrementStat(field: string): Promise<void> {
    try {
      await redis.hincrby(STATS_KEY, field, 1);
    } catch (error) {
      logger.debug({ error, field }, 'Failed to increment stat');
    }
  }

  /**
   * Get all stats
   */
  public async getStats(): Promise<Record<string, number>> {
    try {
      const stats = await redis.hgetall(STATS_KEY);
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(stats)) {
        result[key] = parseInt(value, 10) || 0;
      }
      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return {};
    }
  }

  /**
   * Calculate confidence score for an alert
   * New tiered scoring with multipliers
   */
  public async calculateScore(params: ScoreInput): Promise<AlertScore> {
    const { tradeSignal, walletFingerprint, entryProbability } = params;

    const openInterest = parseFloat(tradeSignal.openInterest);
    const tradeUsdValue = tradeSignal.tradeUsdValue;

    // ----------------------------------
    // 0. VALIDATE INPUTS (prevent NaN propagation)
    // ----------------------------------
    if (isNaN(openInterest) || openInterest <= 0) {
      return this.createIgnoreResult(
        `Invalid open interest: ${tradeSignal.openInterest}`
      );
    }
    if (isNaN(tradeUsdValue) || tradeUsdValue <= 0) {
      return this.createIgnoreResult(
        `Invalid trade USD value: ${tradeUsdValue}`
      );
    }
    if (
      isNaN(entryProbability) ||
      entryProbability < 0 ||
      entryProbability > 1
    ) {
      return this.createIgnoreResult(
        `Invalid entry probability: ${entryProbability}`
      );
    }

    // Rescale wallet score from 0-50 to 0-100
    const walletScore100 = this.calculateWalletScore(walletFingerprint) * 2;

    // ----------------------------------
    // 1. HARD FILTERS
    // ----------------------------------
    const filterResult = await this.applyHardFilters(
      tradeUsdValue,
      openInterest,
      walletScore100
    );

    if (!filterResult.passed) {
      return this.createIgnoreResult(filterResult.reason);
    }

    // Track trades that passed hard filters
    await this.incrementStat('passed_hard_filters');

    // ----------------------------------
    // 2. OI SCORE WITH MULTIPLIERS
    // ----------------------------------
    const oiRatio = tradeUsdValue / openInterest;
    let oiScore = this.calculateBaseOiScore(oiRatio);

    // Get multipliers
    const marketSizeMultiplier = this.getMarketSizeMultiplier(openInterest);
    const dormancyMultiplier = await this.getDormancyMultiplier(
      tradeSignal.marketId,
      tradeSignal.timestamp
    );

    // Apply multipliers
    oiScore = oiScore * marketSizeMultiplier * dormancyMultiplier;

    // Price impact bonus
    if (tradeSignal.priceImpact >= 10) {
      oiScore += 30;
    } else if (tradeSignal.priceImpact >= 5) {
      oiScore += 15;
    }

    oiScore = Math.min(100, oiScore);

    // ----------------------------------
    // 3. ENTRY PRICE EXTREMITY SCORE
    // ----------------------------------
    const extremityScore = this.calculateExtremityScore(
      tradeUsdValue,
      oiRatio,
      entryProbability
    );

    // ----------------------------------
    // 4. FINAL WEIGHTED SCORE
    // ----------------------------------
    const walletContribution = 0.5 * walletScore100;
    const oiContribution = 0.35 * oiScore;
    const extremityContribution = 0.15 * extremityScore;

    const finalScore =
      walletContribution + oiContribution + extremityContribution;

    // ----------------------------------
    // 5. CLASSIFICATION
    // ----------------------------------
    const classification = this.classify(finalScore);

    // Track classification results
    await this.incrementStat(`classification_${classification.toLowerCase()}`);

    const score: AlertScore = {
      totalScore: Math.round(finalScore),
      breakdown: {
        walletScore: Math.round(walletScore100),
        oiScore: Math.round(oiScore),
        extremityScore: Math.round(extremityScore),
        walletContribution: Math.round(walletContribution),
        oiContribution: Math.round(oiContribution),
        extremityContribution: Math.round(extremityContribution),
      },
      multipliers: {
        marketSize: marketSizeMultiplier,
        dormancy: dormancyMultiplier,
      },
      classification,
      filtersPassed: true,
    };

    logger.debug(
      {
        totalScore: score.totalScore,
        breakdown: score.breakdown,
        multipliers: score.multipliers,
        classification,
      },
      'Alert score calculated (v2)'
    );

    return score;
  }

  /**
   * Apply hard filters - returns IGNORE if any fail
   */
  private async applyHardFilters(
    tradeUsdValue: number,
    openInterest: number,
    walletScore: number
  ): Promise<{ passed: boolean; reason: string }> {
    if (tradeUsdValue < this.MIN_TRADE_SIZE_USD) {
      await this.incrementStat('filtered_trade_size');
      return {
        passed: false,
        reason: `Trade size $${tradeUsdValue.toFixed(0)} < $${this.MIN_TRADE_SIZE_USD} minimum`,
      };
    }

    if (openInterest < this.MIN_OI_USD) {
      await this.incrementStat('filtered_low_oi');
      return {
        passed: false,
        reason: `Market OI $${openInterest.toFixed(0)} < $${this.MIN_OI_USD} minimum`,
      };
    }

    if (walletScore < this.MIN_WALLET_SCORE) {
      await this.incrementStat('filtered_wallet_score');
      return {
        passed: false,
        reason: `Wallet score ${walletScore.toFixed(0)} < ${this.MIN_WALLET_SCORE} minimum`,
      };
    }

    return { passed: true, reason: '' };
  }

  /**
   * Calculate wallet score from flags (0-50 scale)
   */
  private calculateWalletScore(wallet: WalletFingerprint): number {
    let score = 0;
    const { flags } = wallet;

    // Low transaction count (14 points)
    if (flags.lowTxCount) {
      score += 14;
    }

    // Young wallet (12 points)
    if (flags.youngWallet) {
      score += 12;
    }

    // High Polymarket netflow (12 points)
    if (flags.highPolymarketNetflow) {
      score += 12;
    }

    // Single purpose wallet (6 points)
    if (flags.singlePurpose) {
      score += 6;
    }

    // CEX funded (6 points)
    if (flags.cexFunded) {
      score += 6;
    }

    return Math.min(50, score);
  }

  /**
   * Calculate base OI score from ratio (tiered)
   */
  private calculateBaseOiScore(oiRatio: number): number {
    if (oiRatio < 0.02) return 0;
    if (oiRatio < 0.05) return 10;
    if (oiRatio < 0.1) return 25;
    if (oiRatio < 0.2) return 45;
    if (oiRatio < 0.35) return 70;
    return 90;
  }

  /**
   * Get market size multiplier
   */
  private getMarketSizeMultiplier(openInterest: number): number {
    if (openInterest < 25000) return 2.0;
    if (openInterest < 50000) return 1.5;
    return 1.0;
  }

  /**
   * Get dormancy multiplier based on hours since last trade
   */
  private async getDormancyMultiplier(
    marketId: string,
    tradeTimestamp: number
  ): Promise<number> {
    try {
      const lastTradeKey = `market:${marketId}:last_trade`;
      const lastTradeStr = await redis.get(lastTradeKey);

      if (lastTradeStr === null) {
        // No record = assume 0 hours (conservative)
        return 1.0;
      }

      const lastTradeTime = parseInt(lastTradeStr, 10);
      const hoursSinceLastTrade =
        (tradeTimestamp - lastTradeTime) / (1000 * 60 * 60);

      if (hoursSinceLastTrade >= 8) return 2.0;
      if (hoursSinceLastTrade >= 4) return 1.5;
      return 1.0;
    } catch (error) {
      logger.warn({ error, marketId }, 'Failed to get dormancy multiplier');
      return 1.0;
    }
  }

  /**
   * Calculate extremity score based on entry probability
   */
  private calculateExtremityScore(
    tradeUsdValue: number,
    oiRatio: number,
    entryProbability: number
  ): number {
    // Size gating - only score if trade is significant
    if (tradeUsdValue < 2000 && oiRatio < 0.05) {
      return 0;
    }

    const p = entryProbability * 100; // Convert to percentage

    // Extreme odds scoring
    if (p < 5 || p > 95) {
      return 40;
    }
    if (p < 10 || p > 90) {
      return 25;
    }
    if (p < 15 || p > 85) {
      return 15;
    }

    return 0;
  }

  /**
   * Classify final score
   * Max possible: 50 (wallet) + 35 (OI) + 6 (extremity 15% of 40) = 91
   */
  private classify(score: number): AlertClassification {
    if (score >= 90) return 'ALERT_STRONG_INSIDER';
    if (score >= 80) return 'ALERT_HIGH_CONFIDENCE';
    if (score >= 70) return 'ALERT_MEDIUM_CONFIDENCE';
    if (score >= 50) return 'LOG_ONLY';
    return 'IGNORE';
  }

  /**
   * Create an IGNORE result with reason
   */
  private createIgnoreResult(reason: string): AlertScore {
    return {
      totalScore: 0,
      breakdown: {
        walletScore: 0,
        oiScore: 0,
        extremityScore: 0,
        walletContribution: 0,
        oiContribution: 0,
        extremityContribution: 0,
      },
      multipliers: {
        marketSize: 1.0,
        dormancy: 1.0,
      },
      classification: 'IGNORE',
      filtersPassed: false,
      filterReason: reason,
    };
  }

  /**
   * Check if score meets alert threshold
   * Alerts for MEDIUM and above (score >= 70)
   */
  public shouldAlert(score: AlertScore): boolean {
    return (
      score.classification === 'ALERT_STRONG_INSIDER' ||
      score.classification === 'ALERT_HIGH_CONFIDENCE' ||
      score.classification === 'ALERT_MEDIUM_CONFIDENCE'
    );
  }

  /**
   * Check if score should be logged (but not alerted)
   */
  public shouldLog(score: AlertScore): boolean {
    return score.classification === 'LOG_ONLY';
  }

  /**
   * Update last trade timestamp for a market (call after processing each trade)
   */
  public async updateLastTradeTimestamp(
    marketId: string,
    timestamp: number
  ): Promise<void> {
    try {
      const key = `market:${marketId}:last_trade`;
      await redis.set(key, timestamp.toString());
    } catch (error) {
      logger.warn({ error, marketId }, 'Failed to update last trade timestamp');
    }
  }
}

// Export singleton instance
export const alertScorer = AlertScorerService.getInstance();
