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

    // Build message
    let message = `${emoji} *INSIDER SIGNAL DETECTED*\n`;
    message += `Score: *${alert.confidenceScore}/100* (${classificationDisplay})\n\n`;

    // Market info
    message += `🎯 *Market*\n`;
    message += `${displayQuestion}\n`;
    message += `[View on Polymarket](${polymarketUrl})\n\n`;

    // Trade details
    message += `📊 *Trade Details*\n`;
    message += `• Size: $${parseFloat(alert.tradeSize).toLocaleString()}\n`;
    message += `• Side: ${alert.tradeSide}\n`;
    message += `• Price: ${(parseFloat(alert.tradePrice) * 100).toFixed(1)}¢\n`;
    message += `• Time: ${timestamp} UTC\n\n`;

    // Score breakdown (v2 - weighted contributions)
    message += `📈 *Score Breakdown*\n`;
    message += `• Wallet (50%): ${alert.scoreBreakdown.walletContribution}pts\n`;
    message += `• OI/Size (35%): ${alert.scoreBreakdown.impactContribution}pts\n`;
    message += `• Extremity (15%): ${alert.scoreBreakdown.extremityContribution}pts\n\n`;

    // Wallet analysis
    message += `🔍 *Wallet Analysis*\n`;
    message += polygonscanUrl
      ? `• Address: [\`${walletShort}\`](${polygonscanUrl})\n`
      : `• Address: \`${walletShort}\`\n`;
    message += `• Age: ${alert.walletFingerprint.metadata.walletAgeDays} days\n`;
    message += `• Transactions: ${alert.walletFingerprint.metadata.totalTransactions}\n`;
    message += `• PM Netflow: ${alert.walletFingerprint.metadata.polymarketNetflowPercentage.toFixed(1)}%\n`;
    message += `• CEX Funded: ${alert.walletFingerprint.flags.cexFunded ? '✅ Yes' : '❌ No'}\n`;

    if (alert.walletFingerprint.metadata.cexFundingSource !== null) {
      message += `• Funding Source: ${alert.walletFingerprint.metadata.cexFundingSource.toUpperCase()}\n`;
    }

    // Suspicious flags
    if (alert.walletFingerprint.isSuspicious) {
      message += `\n🚩 *Suspicious Flags:*\n`;
      if (alert.walletFingerprint.flags.cexFunded)
        message += `• 🏦 CEX-funded\n`;
      if (alert.walletFingerprint.flags.lowTxCount)
        message += `• 📉 Low transactions\n`;
      if (alert.walletFingerprint.flags.youngWallet)
        message += `• 🆕 Young wallet\n`;
      if (alert.walletFingerprint.flags.highPolymarketNetflow)
        message += `• 🎯 High PM netflow\n`;
      if (alert.walletFingerprint.flags.singlePurpose)
        message += `• 🔒 Single-purpose\n`;
    }

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
