import axios, { type AxiosInstance, AxiosError } from 'axios';
import { getEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { AlertData } from '../alerts/alert-persistence.js';

const env = getEnv();

/**
 * Discord notification service
 * Sends alerts to Discord via webhook
 */
class DiscordNotifierService {
  private static instance: DiscordNotifierService | null = null;
  private readonly client: AxiosInstance | null = null;
  private readonly webhookUrl: string | null = null;

  private constructor() {
    this.webhookUrl = env.DISCORD_WEBHOOK_URL ?? null;

    if (this.webhookUrl !== null) {
      this.client = axios.create({
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      logger.info('Discord notifier service initialized');
    } else {
      logger.debug(
        'Discord webhook URL not configured - notifications disabled'
      );
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DiscordNotifierService {
    if (DiscordNotifierService.instance === null) {
      DiscordNotifierService.instance = new DiscordNotifierService();
    }
    return DiscordNotifierService.instance;
  }

  /**
   * Check if Discord is configured
   */
  public isConfigured(): boolean {
    return this.webhookUrl !== null && this.client !== null;
  }

  /**
   * Send alert notification to Discord
   */
  public async sendAlert(alert: AlertData): Promise<boolean> {
    if (
      !this.isConfigured() ||
      this.client === null ||
      this.webhookUrl === null
    ) {
      logger.debug('Discord not configured, skipping notification');
      return false;
    }

    try {
      const embed = this.buildAlertEmbed(alert);
      await this.client.post(this.webhookUrl, {
        embeds: [embed],
      });

      logger.info(
        {
          tradeId: alert.tradeId,
          marketId: alert.marketId,
          score: alert.confidenceScore,
        },
        '📨 Discord alert sent successfully'
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
        'Failed to send Discord notification'
      );
      return false;
    }
  }

  /**
   * Build Discord embed for alert
   */
  private buildAlertEmbed(alert: AlertData): Record<string, unknown> {
    const emoji = this.getClassificationEmoji(alert.classification);
    const color = this.getClassificationColor(alert.classification);

    const tradeDirection = alert.tradeSide === 'BUY' ? 'BUY' : 'SELL';
    const tradeUsdValue = alert.tradeSignal.tradeUsdValue.toFixed(2);
    const oiPercentage = alert.tradeSignal.oiPercentage.toFixed(2);

    return {
      title: `${emoji} ${alert.classification.replace(/_/g, ' ')}`,
      description: `**Market:** ${alert.marketId.slice(0, 16)}...`,
      color,
      fields: [
        {
          name: 'Trade Details',
          value: [
            `**Side:** ${tradeDirection} ${alert.tradeSignal.outcome.toUpperCase()}`,
            `**Size:** $${tradeUsdValue}`,
            `**Price:** ${(parseFloat(alert.tradePrice) * 100).toFixed(1)}%`,
            `**OI Impact:** ${oiPercentage}%`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Score Breakdown',
          value: [
            `**Total:** ${alert.confidenceScore}/100`,
            `**Wallet:** ${alert.scoreBreakdown.walletContribution}pts`,
            `**OI:** ${alert.scoreBreakdown.oiContribution}pts`,
            `**Extremity:** ${alert.scoreBreakdown.extremityContribution}pts`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Wallet Flags',
          value: this.formatWalletFlags(alert.walletFingerprint.flags),
          inline: false,
        },
      ],
      footer: {
        text: `Wallet: ${alert.walletAddress.slice(0, 10)}... | Trade ID: ${alert.tradeId.slice(0, 8)}`,
      },
      timestamp: new Date().toISOString(),
      url: `https://polymarket.com/event/${alert.marketId}`,
    };
  }

  /**
   * Format wallet flags for display
   */
  private formatWalletFlags(flags: {
    lowTxCount: boolean;
    youngWallet: boolean;
    highPolymarketNetflow: boolean;
    singlePurpose: boolean;
    cexFunded: boolean;
  }): string {
    const flagList: string[] = [];
    if (flags.lowTxCount) flagList.push('Low TX Count');
    if (flags.youngWallet) flagList.push('Young Wallet');
    if (flags.highPolymarketNetflow) flagList.push('High Polymarket Netflow');
    if (flags.singlePurpose) flagList.push('Single Purpose');
    if (flags.cexFunded) flagList.push('CEX Funded');

    return flagList.length > 0 ? flagList.join(', ') : 'None';
  }

  /**
   * Get emoji for classification
   */
  private getClassificationEmoji(classification: string): string {
    switch (classification) {
      case 'ALERT_STRONG_INSIDER':
        return '🚨';
      case 'ALERT_HIGH_CONFIDENCE':
        return '🔴';
      case 'ALERT_MEDIUM_CONFIDENCE':
        return '🟡';
      default:
        return '📝';
    }
  }

  /**
   * Get color for classification (Discord embed color)
   */
  private getClassificationColor(classification: string): number {
    switch (classification) {
      case 'ALERT_STRONG_INSIDER':
        return 0xff0000; // Red
      case 'ALERT_HIGH_CONFIDENCE':
        return 0xff6600; // Orange
      case 'ALERT_MEDIUM_CONFIDENCE':
        return 0xffcc00; // Yellow
      default:
        return 0x808080; // Gray
    }
  }

  /**
   * Send test message to verify webhook works
   */
  public async sendTestMessage(): Promise<boolean> {
    if (
      !this.isConfigured() ||
      this.client === null ||
      this.webhookUrl === null
    ) {
      return false;
    }

    try {
      await this.client.post(this.webhookUrl, {
        embeds: [
          {
            title: '✅ Polymarket Insider Bot Connected',
            description:
              'Discord notifications are working!\nYou will receive alerts here when insider signals are detected.',
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
          },
        ],
      });
      logger.info('Discord test message sent successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send Discord test message');
      return false;
    }
  }

  /**
   * Send heartbeat message
   */
  public async sendHeartbeat(): Promise<boolean> {
    if (
      !this.isConfigured() ||
      this.client === null ||
      this.webhookUrl === null
    ) {
      return false;
    }

    try {
      const timestamp = new Date().toISOString();
      await this.client.post(this.webhookUrl, {
        content: `💓 Heartbeat: Bot is running (${timestamp})`,
      });
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send Discord heartbeat');
      return false;
    }
  }

  /**
   * Send generic message
   */
  public async sendMessage(message: string): Promise<boolean> {
    if (
      !this.isConfigured() ||
      this.client === null ||
      this.webhookUrl === null
    ) {
      return false;
    }

    try {
      await this.client.post(this.webhookUrl, {
        content: message,
      });
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send Discord message');
      return false;
    }
  }
}

// Export singleton instance
export const discordNotifier = DiscordNotifierService.getInstance();
