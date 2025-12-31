import { slackNotifier } from './slack-notifier.js';
import { telegramNotifier } from './telegram-notifier.js';
import { discordNotifier } from './discord-notifier.js';
import { logger } from '../../utils/logger.js';
import type { AlertData } from '../alerts/alert-persistence.js';

/**
 * Notification coordinator service
 * Manages sending alerts to all configured channels (Slack, Telegram, Discord)
 */
class NotificationCoordinatorService {
  private static instance: NotificationCoordinatorService | null = null;

  private constructor() {
    logger.info('Notification coordinator initialized');
    this.logConfiguredChannels();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): NotificationCoordinatorService {
    if (NotificationCoordinatorService.instance === null) {
      NotificationCoordinatorService.instance =
        new NotificationCoordinatorService();
    }
    return NotificationCoordinatorService.instance;
  }

  /**
   * Send alert to all configured channels
   */
  public async sendAlert(alert: AlertData): Promise<{
    slack: boolean;
    telegram: boolean;
    discord: boolean;
    anySuccess: boolean;
  }> {
    logger.info(
      {
        tradeId: alert.tradeId,
        marketId: alert.marketId,
        score: alert.confidenceScore,
        classification: alert.classification,
      },
      'Sending alert notifications'
    );

    // Send to all channels in parallel
    const [slackResult, telegramResult, discordResult] =
      await Promise.allSettled([
        slackNotifier.sendAlert(alert),
        telegramNotifier.sendAlert(alert),
        discordNotifier.sendAlert(alert),
      ]);

    const slackSuccess =
      slackResult.status === 'fulfilled' && slackResult.value === true;
    const telegramSuccess =
      telegramResult.status === 'fulfilled' && telegramResult.value === true;
    const discordSuccess =
      discordResult.status === 'fulfilled' && discordResult.value === true;

    const anySuccess = slackSuccess || telegramSuccess || discordSuccess;

    if (anySuccess) {
      logger.info(
        {
          slack: slackSuccess,
          telegram: telegramSuccess,
          discord: discordSuccess,
        },
        '✅ Alert notifications sent'
      );
    } else {
      logger.error(
        {
          slack: slackSuccess,
          telegram: telegramSuccess,
          discord: discordSuccess,
        },
        '❌ Failed to send alert notifications to any channel'
      );
    }

    return {
      slack: slackSuccess,
      telegram: telegramSuccess,
      discord: discordSuccess,
      anySuccess,
    };
  }

  /**
   * Send test notifications to all channels
   */
  public async sendTestNotifications(): Promise<{
    slack: boolean;
    telegram: boolean;
    discord: boolean;
  }> {
    logger.info('Sending test notifications to all channels');

    const [slackResult, telegramResult, discordResult] =
      await Promise.allSettled([
        slackNotifier.sendTestMessage(),
        telegramNotifier.sendTestMessage(),
        discordNotifier.sendTestMessage(),
      ]);

    const slackSuccess =
      slackResult.status === 'fulfilled' && slackResult.value === true;
    const telegramSuccess =
      telegramResult.status === 'fulfilled' && telegramResult.value === true;
    const discordSuccess =
      discordResult.status === 'fulfilled' && discordResult.value === true;

    logger.info(
      {
        slack: slackSuccess,
        telegram: telegramSuccess,
        discord: discordSuccess,
      },
      'Test notifications completed'
    );

    return {
      slack: slackSuccess,
      telegram: telegramSuccess,
      discord: discordSuccess,
    };
  }

  /**
   * Check which channels are configured
   */
  public getConfiguredChannels(): {
    slack: boolean;
    telegram: boolean;
    discord: boolean;
    hasAny: boolean;
  } {
    const slack = slackNotifier.isConfigured();
    const telegram = telegramNotifier.isConfigured();
    const discord = discordNotifier.isConfigured();

    return {
      slack,
      telegram,
      discord,
      hasAny: slack || telegram || discord,
    };
  }

  /**
   * Log configured channels on startup
   */
  private logConfiguredChannels(): void {
    const channels = this.getConfiguredChannels();

    if (!channels.hasAny) {
      logger.warn(
        '⚠️  No notification channels configured - alerts will only be logged'
      );
      return;
    }

    const configured: string[] = [];
    if (channels.slack) configured.push('Slack');
    if (channels.telegram) configured.push('Telegram');
    if (channels.discord) configured.push('Discord');

    logger.info(
      { channels: configured },
      `✅ Notification channels configured: ${configured.join(', ')}`
    );
  }
}

// Export singleton instance
export const notificationCoordinator =
  NotificationCoordinatorService.getInstance();
