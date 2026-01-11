import axios, { type AxiosInstance, AxiosError } from 'axios';
import { getEnv } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { AlertData } from '../alerts/alert-persistence.js';

const env = getEnv();

/**
 * Slack message block structure
 */
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: unknown;
}

/**
 * Slack notification payload
 */
interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

/**
 * Slack notification service
 * Formats and sends alerts to Slack via webhook
 */
class SlackNotifierService {
  private static instance: SlackNotifierService | null = null;
  private readonly client: AxiosInstance | null = null;
  private readonly webhookUrl: string | null = null;

  private constructor() {
    this.webhookUrl = env.SLACK_WEBHOOK_URL ?? null;

    if (this.webhookUrl !== null) {
      this.client = axios.create({
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      logger.info('Slack notifier service initialized');
    } else {
      logger.warn('Slack webhook URL not configured - notifications disabled');
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SlackNotifierService {
    if (SlackNotifierService.instance === null) {
      SlackNotifierService.instance = new SlackNotifierService();
    }
    return SlackNotifierService.instance;
  }

  /**
   * Check if Slack is configured
   */
  public isConfigured(): boolean {
    return this.webhookUrl !== null && this.client !== null;
  }

  /**
   * Send alert notification to Slack
   */
  public async sendAlert(alert: AlertData): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      logger.debug('Slack not configured, skipping notification');
      return false;
    }

    try {
      const payload = this.buildAlertPayload(alert);
      await this.client.post(this.webhookUrl!, payload);

      logger.info(
        {
          tradeId: alert.tradeId,
          marketId: alert.marketId,
          score: alert.confidenceScore,
        },
        '📨 Slack alert sent successfully'
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
        'Failed to send Slack notification'
      );
      return false;
    }
  }

  /**
   * Build Slack message payload
   */
  private buildAlertPayload(alert: AlertData): SlackPayload {
    const emoji = this.getEmojiForClassification(alert.classification);
    const polymarketUrl = `https://polymarket.com/event/${alert.marketId}`;
    const walletShort = `${alert.walletAddress.substring(0, 6)}...${alert.walletAddress.substring(38)}`;
    const polygonscanUrl = `https://polygonscan.com/address/${alert.walletAddress}`;

    // Format timestamp
    const timestamp = alert.timestamp
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    // Build blocks
    const blocks: SlackBlock[] = [
      // Header
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Insider Signal Detected (Score: ${alert.confidenceScore}/100)`,
          emoji: true,
        },
      },

      // Trade details
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Market:*\n<${polymarketUrl}|View on Polymarket>`,
          },
          {
            type: 'mrkdwn',
            text: `*Classification:*\n${this.formatClassification(alert.classification)}`,
          },
          {
            type: 'mrkdwn',
            text: `*Trade Size:*\n$${alert.tradeSignal.tradeUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
          {
            type: 'mrkdwn',
            text: `*Trade Side:*\n${alert.tradeSide}`,
          },
          {
            type: 'mrkdwn',
            text: `*Price:*\n${(parseFloat(alert.tradePrice) * 100).toFixed(1)}¢`,
          },
          {
            type: 'mrkdwn',
            text: `*Time:*\n${timestamp} UTC`,
          },
        ],
      },

      // Divider
      {
        type: 'divider',
      },

      // Score breakdown (v2 - weighted contributions)
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📊 Score Breakdown*',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Wallet (60%):*\n${alert.scoreBreakdown.walletContribution}pts`,
          },
          {
            type: 'mrkdwn',
            text: `*Impact (40%):*\n${alert.scoreBreakdown.impactContribution}pts`,
          },
          {
            type: 'mrkdwn',
            text: `*Total:*\n${alert.confidenceScore}/100`,
          },
        ],
      },

      // Divider
      {
        type: 'divider',
      },

      // Wallet details
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🔍 Wallet Analysis*',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Address:*\n<${polygonscanUrl}|\`${walletShort}\`>`,
          },
          {
            type: 'mrkdwn',
            text: `*Age:*\n${alert.walletFingerprint.metadata.walletAgeDays} days`,
          },
          {
            type: 'mrkdwn',
            text: `*Tx Count:*\n${alert.walletFingerprint.metadata.totalTransactions}`,
          },
          {
            type: 'mrkdwn',
            text: `*CEX Funded:*\n${alert.walletFingerprint.flags.cexFunded ? '✅ Yes' : '❌ No'}`,
          },
        ],
      },
    ];

    // Add wallet flags if suspicious
    if (alert.walletFingerprint.isSuspicious) {
      const flags: string[] = [];
      if (alert.walletFingerprint.flags.cexFunded) flags.push('🏦 CEX-funded');
      if (alert.walletFingerprint.flags.lowTxCount)
        flags.push('📉 Low transactions');
      if (alert.walletFingerprint.flags.youngWallet)
        flags.push('🆕 Young wallet');
      if (alert.walletFingerprint.flags.highPolymarketNetflow)
        flags.push('🎯 High PM netflow');
      if (alert.walletFingerprint.flags.singlePurpose)
        flags.push('🔒 Single-purpose');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🚩 Suspicious Flags:*\n${flags.join('\n')}`,
        },
      });
    }

    // Add CEX funding source if available
    if (alert.walletFingerprint.metadata.cexFundingSource !== null) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*💰 Funding Source:*\n${alert.walletFingerprint.metadata.cexFundingSource.toUpperCase()}`,
        },
      });
    }

    return {
      text: `Insider Signal Detected (Score: ${alert.confidenceScore}/100)`,
      blocks,
    };
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
        return classification;
    }
  }

  /**
   * Send test notification
   */
  public async sendTestMessage(): Promise<boolean> {
    if (!this.isConfigured() || this.client === null) {
      logger.warn('Slack not configured, cannot send test message');
      return false;
    }

    try {
      const payload: SlackPayload = {
        text: 'Test notification from Polymarket Insider Bot',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '✅ *Slack notifications are working!*\nYou will receive alerts here when insider signals are detected.',
            },
          },
        ],
      };

      await this.client.post(this.webhookUrl!, payload);
      logger.info('Test Slack message sent successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to send test Slack message');
      return false;
    }
  }
}

// Export singleton instance
export const slackNotifier = SlackNotifierService.getInstance();
