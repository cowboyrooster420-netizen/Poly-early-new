import axios, { type AxiosInstance, AxiosError } from 'axios';
import { getEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { AlertData } from '../alerts/alert-persistence.js';

const env = getEnv();

/**
 * Telegram notification service
 * Formats and sends alerts to Telegram via Bot API
 */
class TelegramNotifierService {
  private static instance: TelegramNotifierService | null = null;
  private readonly client: AxiosInstance | null = null;
  private readonly botToken: string | null = null;
  private readonly chatId: string | null = null;

  private constructor() {
    this.botToken = env.TELEGRAM_BOT_TOKEN ?? null;
    this.chatId = env.TELEGRAM_CHAT_ID ?? null;

    if (this.botToken !== null && this.chatId !== null) {
      this.client = axios.create({
        baseURL: `https://api.telegram.org/bot${this.botToken}`,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      logger.info('Telegram notifier service initialized');
    } else {
      logger.warn(
        'Telegram bot token or chat ID not configured - notifications disabled'
      );
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TelegramNotifierService {
    if (TelegramNotifierService.instance === null) {
      TelegramNotifierService.instance = new TelegramNotifierService();
    }
    return TelegramNotifierService.instance;
  }

  /**
   * Check if Telegram is configured
   */
  public isConfigured(): boolean {
    return (
      this.botToken !== null && this.chatId !== null && this.client !== null
    );
  }

  /**
   * Send alert notification to Telegram
   */
  public async sendAlert(alert: AlertData): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      logger.debug('Telegram not configured, skipping notification');
      return false;
    }

    try {
      const message = this.buildAlertMessage(alert);
      await this.client.post('/sendMessage', {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      });

      logger.info(
        {
          tradeId: alert.tradeId,
          marketId: alert.marketId,
          score: alert.confidenceScore,
        },
        '📨 Telegram alert sent successfully'
      );

      return true;
    } catch (error) {
      logger.error(
        {
          error:
            error instanceof AxiosError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Unknown error',
          tradeId: alert.tradeId,
        },
        'Failed to send Telegram notification'
      );
      return false;
    }
  }

  /**
   * Build Telegram message
   */
  private buildAlertMessage(alert: AlertData): string {
    const emoji = this.getEmojiForClassification(alert.classification);
    const polymarketUrl = `https://polymarket.com/event/${alert.marketSlug}`;

    // Handle empty/missing wallet address
    const walletAddr =
      alert.walletAddress || alert.walletFingerprint.address || '';
    const walletShort =
      walletAddr.length >= 42
        ? `${walletAddr.substring(0, 6)}...${walletAddr.substring(38)}`
        : walletAddr || 'Unknown';
    const polygonscanUrl = walletAddr
      ? `https://polygonscan.com/address/${walletAddr}`
      : '';

    // Format timestamp
    const timestamp = alert.timestamp
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    // Format classification for display
    const classificationDisplay = this.formatClassification(
      alert.classification
    );

    // Truncate market question if too long
    const maxQuestionLen = 80;
    const displayQuestion =
      alert.marketQuestion.length > maxQuestionLen
        ? alert.marketQuestion.substring(0, maxQuestionLen) + '...'
        : alert.marketQuestion;

    // Calculate what they're betting on
    const price = parseFloat(alert.tradePrice);
    const outcome = alert.tradeSignal.outcome.toUpperCase() || 'UNKNOWN';
    const bettingPrice = (price * 100).toFixed(1);

    // Format market OI
    const marketOI = parseFloat(alert.tradeSignal.openInterest);
    const formattedOI =
      marketOI >= 1000
        ? `$${(marketOI / 1000).toFixed(1)}k`
        : `$${marketOI.toFixed(0)}`;

    // Build message
    let message = `${emoji} *INSIDER SIGNAL DETECTED*\n`;
    message += `Score: *${alert.confidenceScore}/100* (${classificationDisplay})\n`;

    // Data confidence warning if low
    if (
      alert.walletFingerprint.confidenceLevel === 'low' ||
      alert.walletFingerprint.confidenceLevel === 'none'
    ) {
      message += `⚠️ _Limited wallet data available_\n`;
    }
    message += `\n`;

    // Market info
    message += `🎯 *Market*\n`;
    message += `${displayQuestion}\n`;
    message += `• OI: ${formattedOI}\n`;
    message += `[View on Polymarket](${polymarketUrl})\n\n`;

    // Trade details
    message += `📊 *Trade Details*\n`;
    message += `• Position: ${alert.tradeSide} ${outcome} @ ${bettingPrice}¢\n`;
    message += `• Size: $${alert.tradeSignal.tradeUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    message += `• Impact: ${alert.tradeSignal.impactPercentage.toFixed(2)}% of ${alert.tradeSignal.impactMethod}\n`;
    message += `• Time: ${timestamp} UTC\n\n`;

    // Score breakdown with multipliers
    message += `📈 *Score Breakdown*\n`;
    message += `• Wallet (60%): ${alert.scoreBreakdown.walletContribution}pts (raw: ${alert.scoreBreakdown.walletScore})\n`;
    message += `• Impact (40%): ${alert.scoreBreakdown.impactContribution}pts (raw: ${alert.scoreBreakdown.impactScore})\n`;

    // Show active multipliers
    const multipliers: string[] = [];
    if (alert.scoreBreakdown && 'marketSize' in alert.scoreBreakdown) {
      // Access from the full alert score if available
    }
    // Check for multiplier boosts based on market size
    if (marketOI < 25000) {
      multipliers.push('🔥 Small market (2x)');
    } else if (marketOI < 50000) {
      multipliers.push('📈 Medium market (1.5x)');
    }

    if (multipliers.length > 0) {
      message += `• Boosts: ${multipliers.join(', ')}\n`;
    }
    message += `\n`;

    // Wallet analysis - Polymarket specific
    message += `🔍 *Wallet Profile*\n`;
    message += polygonscanUrl
      ? `• Address: [\`${walletShort}\`](${polygonscanUrl})\n`
      : `• Address: \`${walletShort}\`\n`;
    message += `• Account Age: ${alert.walletFingerprint.metadata.walletAgeDays} days\n`;
    message += `• PM Trades: ${alert.walletFingerprint.subgraphMetadata.polymarketTradeCount} total\n`;
    message += `• PM Volume: $${alert.walletFingerprint.subgraphMetadata.polymarketVolumeUSD.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} lifetime\n`;

    // Position concentration (value is already 0-100 percentage)
    const concentration =
      alert.walletFingerprint.subgraphMetadata.maxPositionConcentration;
    if (concentration > 0) {
      message += `• Concentration: ${concentration.toFixed(0)}% in top market\n`;
    }

    // Markets traded (diversification)
    const marketsTraded =
      alert.walletFingerprint.subgraphMetadata.marketsTraded ?? 0;
    if (marketsTraded > 0) {
      message += `• Markets Traded: ${marketsTraded}\n`;
    }

    // Suspicious flags (using wallet flags from Data API)
    const walletFlags = alert.walletFingerprint.subgraphFlags;
    const hasFlags =
      walletFlags.lowTradeCount ||
      walletFlags.youngAccount ||
      walletFlags.freshFatBet ||
      walletFlags.highConcentration ||
      walletFlags.lowDiversification;

    if (hasFlags) {
      message += `\n🚩 *Suspicious Flags:*\n`;
      if (walletFlags.lowTradeCount) message += `• 📉 Low trade count\n`;
      if (walletFlags.youngAccount) message += `• 🆕 Young account\n`;
      if (walletFlags.lowVolume) message += `• 💵 Low volume\n`;
      if (walletFlags.freshFatBet) message += `• 💰 Fresh fat bet pattern\n`;
      if (walletFlags.highConcentration) message += `• 🎲 High concentration\n`;
      if (walletFlags.lowDiversification)
        message += `• 🎯 Low diversification (insider signal)\n`;
    }

    // Data source indicator
    message += `\n_Data: ${alert.walletFingerprint.subgraphMetadata.dataSource}_`;

    return message;
  }

  /**
   * Format classification for display
   */
  private formatClassification(classification: string): string {
    switch (classification) {
      case 'ALERT_STRONG_INSIDER':
        return '🔴 STRONG INSIDER';
      case 'ALERT_HIGH_CONFIDENCE':
        return '🟠 HIGH CONFIDENCE';
      case 'ALERT_MEDIUM_CONFIDENCE':
        return '🟡 MEDIUM';
      case 'LOG_ONLY':
        return '⚪ LOG ONLY';
      default:
        return classification.toUpperCase();
    }
  }

  /**
   * Get emoji for classification
   */
  private getEmojiForClassification(classification: string): string {
    switch (classification) {
      case 'ALERT_STRONG_INSIDER':
        return '🚨';
      case 'ALERT_HIGH_CONFIDENCE':
        return '⚠️';
      case 'ALERT_MEDIUM_CONFIDENCE':
        return '⚡';
      case 'LOG_ONLY':
        return 'ℹ️';
      default:
        return '📊';
    }
  }

  /**
   * Send test notification
   */
  public async sendTestMessage(): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      logger.warn('Telegram not configured, cannot send test message');
      return false;
    }

    try {
      const message =
        '✅ *Polymarket Insider Bot Started!*\n\n' +
        'You will receive alerts here when insider signals are detected.\n' +
        'Hourly heartbeat messages will confirm the bot is running.';

      await this.client.post('/sendMessage', {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      logger.info('Test Telegram message sent successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send test Telegram message');
      return false;
    }
  }

  /**
   * Send hourly heartbeat notification
   */
  public async sendHeartbeat(): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      return false;
    }

    try {
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

      const message =
        `💓 *Heartbeat*\n\n` +
        `Bot is running normally.\n` +
        `Time: ${timestamp} UTC`;

      await this.client.post('/sendMessage', {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send heartbeat message');
      return false;
    }
  }

  /**
   * Send a raw text message to Telegram
   * Used for crash notifications and other system messages
   */
  public async sendMessage(text: string): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      return false;
    }

    try {
      await this.client.post('/sendMessage', {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
      });
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send Telegram message');
      return false;
    }
  }
}

// Export singleton instance
export const telegramNotifier = TelegramNotifierService.getInstance();
