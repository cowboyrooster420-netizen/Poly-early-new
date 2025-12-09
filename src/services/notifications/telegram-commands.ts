import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '../../config/env.js';
import { db } from '../database/prisma.js';
import { marketService } from '../polymarket/market-service.js';
import { logger } from '../../utils/logger.js';

const env = getEnv();

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    from?: { username?: string };
  };
}

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  volume: string;
  active: boolean;
  closed: boolean;
}

interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  markets: GammaMarket[];
}

/**
 * Telegram command handler - listens for commands and responds
 */
class TelegramCommandHandler {
  private static instance: TelegramCommandHandler | null = null;
  private client: AxiosInstance | null = null;
  private botToken: string | null = null;
  private chatId: string | null = null;
  private lastUpdateId = 0;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.botToken = env.TELEGRAM_BOT_TOKEN ?? null;
    this.chatId = env.TELEGRAM_CHAT_ID ?? null;

    if (this.botToken !== null) {
      this.client = axios.create({
        baseURL: `https://api.telegram.org/bot${this.botToken}`,
        timeout: 30000,
      });
    }
  }

  public static getInstance(): TelegramCommandHandler {
    if (TelegramCommandHandler.instance === null) {
      TelegramCommandHandler.instance = new TelegramCommandHandler();
    }
    return TelegramCommandHandler.instance;
  }

  public isConfigured(): boolean {
    return this.botToken !== null && this.client !== null;
  }

  /**
   * Start listening for commands
   */
  public start(): void {
    if (!this.isConfigured() || this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('🤖 Telegram command handler started');

    // Delay first poll to allow old instances to shut down during deployments
    this.startupTimeout = setTimeout(() => {
      if (!this.isRunning) return;

      // Poll every 5 seconds
      this.pollInterval = setInterval(() => {
        this.pollUpdates().catch((err) => {
          // Handle 409 conflict (another instance is polling) silently with backoff
          if (axios.isAxiosError(err) && err.response?.status === 409) {
            logger.warn(
              'Telegram polling conflict detected - another instance may be running. Will retry...'
            );
            return;
          }
          const errorMsg = axios.isAxiosError(err)
            ? `${err.message} - ${err.response?.status} - ${JSON.stringify(err.response?.data)}`
            : err instanceof Error
              ? err.message
              : String(err);
          logger.error({ error: errorMsg }, 'Error polling Telegram updates');
        });
      }, 5000);
    }, 10000); // 10 second startup delay
  }

  /**
   * Stop listening
   */
  public stop(): void {
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    logger.info('Telegram command handler stopped');
  }

  /**
   * Poll for new updates
   */
  private async pollUpdates(): Promise<void> {
    if (!this.client) return;

    try {
      const response = await this.client.get<{
        ok: boolean;
        result: TelegramUpdate[];
      }>('/getUpdates', {
        params: {
          offset: this.lastUpdateId + 1,
          timeout: 10,
        },
      });

      if (response.data.ok && response.data.result.length > 0) {
        for (const update of response.data.result) {
          this.lastUpdateId = update.update_id;
          await this.handleUpdate(update);
        }
      }
    } catch (error) {
      // Ignore timeout errors
      if (!axios.isAxiosError(error) || error.code !== 'ECONNABORTED') {
        throw error;
      }
    }
  }

  /**
   * Handle an incoming update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    const text = message.text.trim();
    const chatId = message.chat.id;

    // Only respond in the configured chat
    if (this.chatId && chatId.toString() !== this.chatId) {
      return;
    }

    // Parse command
    if (text.startsWith('/add ')) {
      const slug = text.slice(5).trim();
      await this.handleAddMarket(chatId, slug);
    } else if (text === '/markets' || text === '/list') {
      await this.handleListMarkets(chatId);
    } else if (text.startsWith('/remove ')) {
      const marketId = text.slice(8).trim();
      await this.handleRemoveMarket(chatId, marketId);
    } else if (text === '/help') {
      await this.handleHelp(chatId);
    } else if (text === '/status') {
      await this.handleStatus(chatId);
    }
  }

  /**
   * Send a message
   */
  private async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.client) return;

    await this.client.post('/sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Handle /add command
   */
  private async handleAddMarket(chatId: number, slug: string): Promise<void> {
    if (!slug) {
      await this.sendMessage(
        chatId,
        '❌ Usage: `/add <market-slug>`\nExample: `/add maduro-out-in-2025`'
      );
      return;
    }

    await this.sendMessage(chatId, `⏳ Fetching market: \`${slug}\`...`);

    try {
      // Fetch from Gamma API
      const response = await axios.get<GammaEvent>(
        `https://gamma-api.polymarket.com/events/slug/${slug}`,
        {
          headers: {
            'User-Agent': 'PolymarketInsiderBot/1.0',
          },
          timeout: 10000,
        }
      );

      const event = response.data;
      if (!event.markets.length) {
        await this.sendMessage(chatId, '❌ Market not found or has no markets');
        return;
      }

      const prisma = db.getClient();
      const added: string[] = [];

      for (const market of event.markets) {
        const existing = await prisma.market.findUnique({
          where: { id: market.id },
        });

        if (existing) {
          continue;
        }

        await prisma.market.create({
          data: {
            id: market.id,
            question: market.question,
            slug: market.slug || `${slug}-${market.id.slice(0, 8)}`,
            conditionId: market.conditionId,
            openInterest: 0,
            volume: parseFloat(market.volume) || 0,
            active: market.active,
            closed: market.closed,
            enabled: true,
            category: 'misc',
            tier: 2,
          },
        });

        added.push(market.question);
      }

      if (added.length > 0) {
        await marketService.reloadMarkets();
        const marketList = added.map((q) => `• ${q}`).join('\n');
        await this.sendMessage(
          chatId,
          `✅ *Added ${added.length} market(s):*\n\n${marketList}`
        );
      } else {
        await this.sendMessage(chatId, '⚠️ All markets already exist');
      }
    } catch (error) {
      logger.error({ error, slug }, 'Failed to add market via Telegram');
      await this.sendMessage(chatId, `❌ Failed to add market: ${slug}`);
    }
  }

  /**
   * Handle /markets command
   */
  private async handleListMarkets(chatId: number): Promise<void> {
    const markets = marketService.getAllMarkets();
    const stats = marketService.getStats();

    if (markets.length === 0) {
      await this.sendMessage(
        chatId,
        '📊 No markets being monitored.\n\nUse `/add <slug>` to add one.'
      );
      return;
    }

    let message = `📊 *Monitoring ${stats.total} market(s)*\n\n`;

    const byTier: Record<number, typeof markets> = { 1: [], 2: [], 3: [] };
    for (const m of markets) {
      byTier[m.tier]?.push(m);
    }

    for (const tier of [1, 2, 3]) {
      const tierMarkets = byTier[tier];
      if (tierMarkets && tierMarkets.length > 0) {
        message += `*Tier ${tier}:*\n`;
        for (const m of tierMarkets.slice(0, 5)) {
          const shortQ =
            m.question.length > 40
              ? m.question.slice(0, 40) + '...'
              : m.question;
          message += `• ${shortQ}\n`;
        }
        if (tierMarkets.length > 5) {
          message += `  _...and ${tierMarkets.length - 5} more_\n`;
        }
        message += '\n';
      }
    }

    await this.sendMessage(chatId, message);
  }

  /**
   * Handle /remove command
   */
  private async handleRemoveMarket(
    chatId: number,
    marketId: string
  ): Promise<void> {
    if (!marketId) {
      await this.sendMessage(chatId, '❌ Usage: `/remove <market-id>`');
      return;
    }

    try {
      const prisma = db.getClient();
      await prisma.market.update({
        where: { id: marketId },
        data: { enabled: false },
      });

      await marketService.removeMarket(marketId);
      await this.sendMessage(chatId, `✅ Market removed: \`${marketId}\``);
    } catch (error) {
      await this.sendMessage(
        chatId,
        `❌ Failed to remove market: \`${marketId}\``
      );
    }
  }

  /**
   * Handle /status command
   */
  private async handleStatus(chatId: number): Promise<void> {
    const stats = marketService.getStats();

    const message =
      `🤖 *Bot Status*\n\n` +
      `• Markets monitored: ${stats.total}\n` +
      `• Tier 1: ${stats.tier1}\n` +
      `• Tier 2: ${stats.tier2}\n` +
      `• Tier 3: ${stats.tier3}\n` +
      `• Uptime: ${Math.floor(process.uptime() / 60)} minutes`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Handle /help command
   */
  private async handleHelp(chatId: number): Promise<void> {
    const message =
      `🤖 *Polymarket Insider Bot*\n\n` +
      `*Commands:*\n` +
      `• \`/add <slug>\` - Add a market by URL slug\n` +
      `• \`/markets\` - List monitored markets\n` +
      `• \`/remove <id>\` - Remove a market\n` +
      `• \`/status\` - Show bot status\n` +
      `• \`/help\` - Show this help\n\n` +
      `*Example:*\n` +
      `\`/add maduro-out-in-2025\``;

    await this.sendMessage(chatId, message);
  }
}

export const telegramCommands = TelegramCommandHandler.getInstance();
