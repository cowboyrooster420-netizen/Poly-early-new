import { slackNotifier } from './slack-notifier.js';
import { telegramNotifier } from './telegram-notifier.js';
import { logger } from '../../utils/logger.js';
import type { AlertData } from '../alerts/alert-persistence.js';

/**
 * Notification coordinator service
 * Manages sending alerts to all configured channels (Slack, Telegram)
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
    const [slackResult, telegramResult] = await Promise.allSettled([
      slackNotifier.sendAlert(alert),
      telegramNotifier.sendAlert(alert),
    ]);

    const slackSuccess =
      slackResult.status === 'fulfilled' && slackResult.value === true;
    const telegramSuccess =
      telegramResult.status === 'fulfilled' && telegramResult.value === true;

    const anySuccess = slackSuccess || telegramSuccess;

    if (anySuccess) {
      logger.info(
        {
          slack: slackSuccess,
          telegram: telegramSuccess,
        },
        '✅ Alert notifications sent'
      );
    } else {
      logger.error(
        {
          slack: slackSuccess,
          telegram: telegramSuccess,
        },
        '❌ Failed to send alert notifications to any channel'
      );
    }

    return {
      slack: slackSuccess,
      telegram: telegramSuccess,
      anySuccess,
    };
  }

  /**
   * Send test notifications to all channels
   */
  public async sendTestNotifications(): Promise<{
    slack: boolean;
    telegram: boolean;
  }> {
    logger.info('Sending test notifications to all channels');

    const [slackResult, telegramResult] = await Promise.allSettled([
      slackNotifier.sendTestMessage(),
      telegramNotifier.sendTestMessage(),
    ]);

    const slackSuccess =
      slackResult.status === 'fulfilled' && slackResult.value === true;
    const telegramSuccess =
      telegramResult.status === 'fulfilled' && telegramResult.value === true;

    logger.info(
      {
        slack: slackSuccess,
        telegram: telegramSuccess,
      },
      'Test notifications completed'
    );

    return {
      slack: slackSuccess,
      telegram: telegramSuccess,
    };
  }

  /**
   * Check which channels are configured
   */
  public getConfiguredChannels(): {
    slack: boolean;
    telegram: boolean;
    hasAny: boolean;
  } {
    const slack = slackNotifier.isConfigured();
    const telegram = telegramNotifier.isConfigured();

    return {
      slack,
      telegram,
      hasAny: slack || telegram,
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

    logger.info(
      { channels: configured },
      `✅ Notification channels configured: ${configured.join(', ')}`
    );
  }
}

// Export singleton instance
export const notificationCoordinator =
  NotificationCoordinatorService.getInstance();
