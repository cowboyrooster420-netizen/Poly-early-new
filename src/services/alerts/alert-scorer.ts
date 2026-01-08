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
    impactScore: number; // 0-100 (with multipliers) - replaces oiScore
    impactMethod: string; // 'liquidity', 'volume', or 'oi'
    impactPercentage: number; // Actual percentage used
    walletContribution: number; // 60% of wallet score
    impactContribution: number; // 40% of impact score
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
    this.MIN_WALLET_SCORE = Number(process.env['MIN_WALLET_SCORE']) || 20; // Reduced from 40 - now 20/100 (actually 10/50 raw score)

    logger.info(
      {
        minTradeSize: this.MIN_TRADE_SIZE_USD,
        minOi: this.MIN_OI_USD,
        minWalletScore: this.MIN_WALLET_SCORE,
        weights: { wallet: '60%', impact: '40%' },
      },
      'Alert scorer service initialized (v4 - extremity removed)'
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
    // 0. CHECK FINGERPRINT STATUS
    // ----------------------------------
    if ('status' in walletFingerprint && walletFingerprint.status === 'error') {
      // API failed but wallet is marked suspicious - give it a medium score
      logger.warn(
        {
          wallet: walletFingerprint.address,
          reason: walletFingerprint.errorReason,
        },
        'Wallet analysis failed - treating as suspicious'
      );
      await this.incrementStat('wallet_error_but_suspicious');

      // Give error fingerprints a baseline suspicious score
      const errorWalletScore = 30; // 60% of max 50 points
      const walletScore100 = errorWalletScore * 2; // Scale to 0-100

      // Continue with reduced confidence scoring
      const impactPercentage = tradeSignal.impactPercentage;
      const impactMethod = tradeSignal.impactMethod;
      const impactThreshold = tradeSignal.impactThreshold;

      let impactScore = this.calculateImpactScore(
        impactPercentage,
        impactMethod,
        impactThreshold
      );

      // Apply standard multipliers and scoring
      const marketSizeMultiplier = this.getMarketSizeMultiplier(openInterest);
      const dormancyMultiplier = await this.getDormancyMultiplier(
        tradeSignal.marketId,
        tradeSignal.timestamp
      );

      impactScore = impactScore * marketSizeMultiplier * dormancyMultiplier;
      impactScore = Math.min(100, impactScore);

      const walletContribution = 0.6 * walletScore100;
      const impactContribution = 0.4 * impactScore;
      const finalScore = walletContribution + impactContribution;

      const classification = this.classify(finalScore);

      await this.incrementStat(
        `classification_${classification.toLowerCase()}`
      );

      return {
        totalScore: Math.round(finalScore),
        breakdown: {
          walletScore: Math.round(walletScore100),
          impactScore: Math.round(impactScore),
          impactMethod,
          impactPercentage,
          walletContribution: Math.round(walletContribution),
          impactContribution: Math.round(impactContribution),
        },
        multipliers: {
          marketSize: marketSizeMultiplier,
          dormancy: dormancyMultiplier,
        },
        classification,
        filtersPassed: true,
        filterReason: 'Wallet API error - scored with caution',
      };
    }

    // ----------------------------------
    // 1. VALIDATE INPUTS (prevent NaN propagation)
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
    // 2. IMPACT SCORE WITH MULTIPLIERS
    // ----------------------------------
    // Use the actual impact percentage from signal detection
    const impactPercentage = tradeSignal.impactPercentage;
    const impactMethod = tradeSignal.impactMethod;
    const impactThreshold = tradeSignal.impactThreshold;

    let impactScore = this.calculateImpactScore(
      impactPercentage,
      impactMethod,
      impactThreshold
    );

    // Get multipliers
    const marketSizeMultiplier = this.getMarketSizeMultiplier(openInterest);
    const dormancyMultiplier = await this.getDormancyMultiplier(
      tradeSignal.marketId,
      tradeSignal.timestamp
    );

    // Apply multipliers
    impactScore = impactScore * marketSizeMultiplier * dormancyMultiplier;

    // Absolute size bonus for whale trades
    if (tradeSignal.passedViaAbsoluteSize && tradeSignal.absoluteSizeTier) {
      // Give bonus points for large absolute trades that had low relative impact
      if (tradeSignal.absoluteSizeTier === 'whale') {
        impactScore += 40; // $100k+ trades
      } else if (tradeSignal.absoluteSizeTier === 'large') {
        impactScore += 25; // $50k+ trades
      } else if (tradeSignal.absoluteSizeTier === 'significant') {
        impactScore += 15; // $25k+ trades
      } else if (tradeSignal.absoluteSizeTier === 'notable') {
        impactScore += 10; // $10k+ trades
      }
    }

    // Price impact bonus (deprecated - keeping for backwards compatibility)
    if (tradeSignal.priceImpact >= 10) {
      impactScore += 30;
    } else if (tradeSignal.priceImpact >= 5) {
      impactScore += 15;
    }

    impactScore = Math.min(100, impactScore);

    // ----------------------------------
    // 3. FINAL WEIGHTED SCORE (without extremity)
    // Weights: Wallet 60%, Impact 40%
    // ----------------------------------
    const walletContribution = 0.6 * walletScore100;
    const impactContribution = 0.4 * impactScore;

    const finalScore = walletContribution + impactContribution;

    // ----------------------------------
    // 5. ADJUST FOR FINGERPRINT CONFIDENCE
    // ----------------------------------
    let adjustedScore = finalScore;
    let confidenceAdjustment = 1.0;

    if (
      'status' in walletFingerprint &&
      walletFingerprint.status === 'partial'
    ) {
      // Reduce score for partial data
      confidenceAdjustment = 0.8;
      adjustedScore = finalScore * confidenceAdjustment;
      logger.debug(
        {
          originalScore: finalScore,
          adjustedScore,
          confidenceLevel: walletFingerprint.confidenceLevel,
        },
        'Score adjusted for partial fingerprint data'
      );
    }

    // ----------------------------------
    // 6. CLASSIFICATION
    // ----------------------------------
    const classification = this.classify(adjustedScore);

    // Track classification results
    await this.incrementStat(`classification_${classification.toLowerCase()}`);

    const score: AlertScore = {
      totalScore: Math.round(adjustedScore),
      breakdown: {
        walletScore: Math.round(walletScore100),
        impactScore: Math.round(impactScore),
        impactMethod,
        impactPercentage,
        walletContribution: Math.round(walletContribution),
        impactContribution: Math.round(impactContribution),
      },
      multipliers: {
        marketSize: marketSizeMultiplier,
        dormancy: dormancyMultiplier,
      },
      classification,
      filtersPassed: true,
    };

    // Log detailed scoring breakdown for visibility
    logger.info(
      {
        wallet: tradeSignal.walletAddress.slice(0, 10) + '...',
        tradeUsd: tradeUsdValue.toFixed(0),
        marketId: tradeSignal.marketId.slice(0, 8),
        outcome: tradeSignal.outcome,
        marketPrice: (entryProbability * 100).toFixed(1) + '%',
        bettingOn:
          (
            (tradeSignal.outcome === 'yes'
              ? entryProbability
              : 1 - entryProbability) * 100
          ).toFixed(1) + '%',
        totalScore: score.totalScore,
        classification,
        walletFlags: walletFingerprint.subgraphFlags,
        scores: {
          walletRaw: Math.round(walletScore100 / 2), // 0-50 scale
          walletScaled: Math.round(walletScore100), // 0-100 scale
          walletContrib: Math.round(walletContribution), // 60% weight
          impactScore: Math.round(impactScore),
          impactMethod,
          impactPercentage: impactPercentage.toFixed(2) + '%',
          impactContrib: Math.round(impactContribution), // 40% weight
        },
        multipliers: score.multipliers,
      },
      '📊 Score breakdown (v3)'
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
      logger.info(
        {
          tradeUsdValue: tradeUsdValue.toFixed(2),
          minRequired: this.MIN_TRADE_SIZE_USD,
          filterType: 'trade_size',
        },
        '🚫 Alert filtered: Trade size too small'
      );
      await this.incrementStat('filtered_trade_size');
      return {
        passed: false,
        reason: `Trade size $${tradeUsdValue.toFixed(0)} < $${this.MIN_TRADE_SIZE_USD} minimum`,
      };
    }

    if (openInterest < this.MIN_OI_USD) {
      logger.info(
        {
          marketOI: openInterest.toFixed(2),
          minRequired: this.MIN_OI_USD,
          filterType: 'market_oi',
        },
        '🚫 Alert filtered: Market OI too low'
      );
      await this.incrementStat('filtered_low_oi');
      return {
        passed: false,
        reason: `Market OI $${openInterest.toFixed(0)} < $${this.MIN_OI_USD} minimum`,
      };
    }

    if (walletScore < this.MIN_WALLET_SCORE) {
      logger.info(
        {
          walletScore: walletScore.toFixed(0),
          minRequired: this.MIN_WALLET_SCORE,
          filterType: 'wallet_score',
        },
        '🚫 Alert filtered: Wallet score too low'
      );
      await this.incrementStat('filtered_wallet_score');
      return {
        passed: false,
        reason: `Wallet score ${walletScore.toFixed(0)} < ${this.MIN_WALLET_SCORE} minimum`,
      };
    }

    return { passed: true, reason: '' };
  }

  /**
   * Calculate wallet score from subgraph flags (0-50 scale)
   */
  private calculateWalletScore(wallet: WalletFingerprint): number {
    let score = 0;
    const flags = wallet.subgraphFlags;

    // Low trade count on Polymarket (14 points)
    if (flags.lowTradeCount) {
      score += 14;
    }

    // Young account on Polymarket (12 points)
    if (flags.youngAccount) {
      score += 12;
    }

    // High concentration in one market (12 points)
    if (flags.highConcentration) {
      score += 12;
    }

    // Low volume trader (6 points)
    if (flags.lowVolume) {
      score += 6;
    }

    // Fresh fat bet pattern (6 points)
    if (flags.freshFatBet) {
      score += 6;
    }

    return Math.min(50, score);
  }

  /**
   * Calculate impact score based on method and percentage
   * Different methods have different scoring curves
   */
  private calculateImpactScore(
    impactPercentage: number,
    method: string,
    threshold: number
  ): number {
    // Normalize impact relative to threshold (1x = at threshold, 2x = double threshold, etc)
    const impactRatio = impactPercentage / threshold;

    if (method === 'liquidity') {
      // Liquidity impact is most significant - aggressive scoring
      if (impactRatio < 1.0) return 0; // Below threshold
      if (impactRatio < 1.5) return 20; // 2-3% liquidity
      if (impactRatio < 2.5) return 40; // 3-5% liquidity
      if (impactRatio < 4.0) return 60; // 5-8% liquidity
      if (impactRatio < 7.0) return 80; // 8-14% liquidity
      return 95; // >14% liquidity
    } else if (method === 'volume') {
      // Volume impact is moderate - balanced scoring
      if (impactRatio < 1.0) return 0; // Below threshold
      if (impactRatio < 2.0) return 15; // 5-10% of 24h volume
      if (impactRatio < 3.0) return 30; // 10-15% of 24h volume
      if (impactRatio < 5.0) return 50; // 15-25% of 24h volume
      if (impactRatio < 8.0) return 70; // 25-40% of 24h volume
      return 90; // >40% of 24h volume
    } else {
      // OI impact (fallback) - conservative scoring
      if (impactRatio < 1.0) return 0; // Below threshold
      if (impactRatio < 4.0) return 10; // 0.5-2% OI
      if (impactRatio < 10.0) return 25; // 2-5% OI
      if (impactRatio < 20.0) return 45; // 5-10% OI
      if (impactRatio < 40.0) return 70; // 10-20% OI
      return 90; // >20% OI
    }
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
   * Classify final score
   * Max possible: 60 (wallet) + 40 (impact) = 100
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
        impactScore: 0,
        impactMethod: 'unknown',
        impactPercentage: 0,
        walletContribution: 0,
        impactContribution: 0,
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
