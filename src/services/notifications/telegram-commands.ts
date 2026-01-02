import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '../../config/env.js';
import { getThresholds } from '../../config/thresholds.js';
import { db } from '../database/prisma.js';
import { marketService } from '../polymarket/market-service.js';
import { walletForensicsService } from '../blockchain/wallet-forensics.js';
import { signalDetector } from '../signals/signal-detector.js';
import { alertScorer } from '../alerts/alert-scorer.js';
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
  liquidity: string;
  active: boolean;
  closed: boolean;
  clobTokenIds?: string[];
}

interface ClobMarket {
  condition_id: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
  }>;
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
  private consecutiveErrors = 0;
  private lastErrorLogTime = 0;

  private constructor() {
    this.botToken = env.TELEGRAM_BOT_TOKEN ?? null;
    this.chatId = env.TELEGRAM_CHAT_ID ?? null;

    if (this.botToken !== null) {
      this.client = axios.create({
        baseURL: `https://api.telegram.org/bot${this.botToken}`,
        timeout: 60000, // 60s timeout for long polling
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
  public async start(): Promise<void> {
    if (!this.isConfigured() || this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('🤖 Telegram command handler starting...');

    // Clear any existing webhook and drop pending updates to avoid conflicts
    try {
      await this.client!.post('/deleteWebhook', { drop_pending_updates: true });
      logger.info('Cleared Telegram webhook (if any)');
    } catch (err) {
      logger.warn({ error: err }, 'Failed to clear webhook');
    }

    // Delay first poll to allow old instances to shut down during deployments
    this.startupTimeout = setTimeout(() => {
      if (!this.isRunning) return;

      logger.info('🤖 Telegram command handler started polling');
      this.startPollingLoop();
    }, 10000); // 10 second startup delay
  }

  /**
   * Start the polling loop - chains polls sequentially to avoid overlapping requests
   */
  private startPollingLoop(): void {
    if (!this.isRunning) return;

    this.pollUpdates()
      .then(() => {
        // Reset error counter on success
        if (this.consecutiveErrors > 0) {
          logger.info(
            { previousErrors: this.consecutiveErrors },
            'Telegram polling recovered'
          );
          this.consecutiveErrors = 0;
        }
      })
      .catch((err) => {
        this.consecutiveErrors++;

        // Handle 409 conflict (another instance is polling) silently
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          logger.warn(
            'Telegram polling conflict detected - another instance may be running. Will retry...'
          );
          return;
        }

        // Only log every 10th error or every 60 seconds to reduce spam
        const now = Date.now();
        const shouldLog =
          this.consecutiveErrors === 1 ||
          this.consecutiveErrors % 10 === 0 ||
          now - this.lastErrorLogTime > 60000;

        if (shouldLog) {
          this.lastErrorLogTime = now;
          let errorMsg: string;
          if (axios.isAxiosError(err)) {
            if (err.response) {
              errorMsg = `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
            } else if (err.request) {
              errorMsg = `Network error: ${err.code || 'unknown'} - ${err.message}`;
            } else {
              errorMsg = `Request setup error: ${err.message}`;
            }
          } else if (err instanceof Error) {
            errorMsg = `${err.name}: ${err.message}`;
          } else {
            errorMsg = String(err);
          }
          logger.warn(
            { error: errorMsg, consecutiveErrors: this.consecutiveErrors },
            'Telegram polling error (will retry)'
          );
        }
      })
      .finally(() => {
        // Schedule next poll after current one completes (with small delay)
        if (this.isRunning) {
          this.pollInterval = setTimeout(() => this.startPollingLoop(), 1000);
        }
      });
  }

  /**
   * Stop listening
   */
  public stop(): void {
    this.isRunning = false;
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
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
    } else if (text.startsWith('/test ')) {
      const wallet = text.slice(6).trim();
      await this.handleTestWallet(chatId, wallet);
    } else if (text === '/stats') {
      await this.handleStats(chatId);
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

        // Fetch CLOB token IDs from CLOB API
        let clobTokenIdYes: string | null = null;
        let clobTokenIdNo: string | null = null;

        try {
          const clobResponse = await axios.get<ClobMarket>(
            `https://clob.polymarket.com/markets/${market.conditionId}`,
            {
              headers: { 'User-Agent': 'PolymarketInsiderBot/1.0' },
              timeout: 10000,
            }
          );

          for (const token of clobResponse.data.tokens || []) {
            if (token.outcome === 'Yes') {
              clobTokenIdYes = token.token_id;
            } else if (token.outcome === 'No') {
              clobTokenIdNo = token.token_id;
            }
          }

          logger.info(
            { conditionId: market.conditionId, clobTokenIdYes, clobTokenIdNo },
            'Fetched CLOB token IDs'
          );
        } catch (clobError) {
          logger.warn(
            { error: clobError, conditionId: market.conditionId },
            'Failed to fetch CLOB token IDs - WebSocket subscription may not work'
          );
        }

        const openInterest = parseFloat(market.liquidity) || 0;
        const volume = parseFloat(market.volume) || 0;

        logger.info(
          { marketId: market.id, openInterest, volume },
          'Market OI and volume'
        );

        await prisma.market.create({
          data: {
            id: market.id,
            question: market.question,
            slug: market.slug || `${slug}-${market.id.slice(0, 8)}`,
            conditionId: market.conditionId,
            clobTokenIdYes,
            clobTokenIdNo,
            openInterest,
            volume,
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
    const thresholds = getThresholds();

    try {
      const prisma = db.getClient();

      // Get recent trade stats
      const recentTrades = await prisma.trade.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      });

      // Get recent alert stats
      const recentAlerts = await prisma.alert.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
          },
        },
      });

      // Get scoring stats
      const scorerStats = await alertScorer.getStats();
      const alertStrong =
        scorerStats['classification_alert_strong_insider'] || 0;
      const alertHigh =
        scorerStats['classification_alert_high_confidence'] || 0;
      const alertMedium =
        scorerStats['classification_alert_medium_confidence'] || 0;
      const totalAlerts = alertStrong + alertHigh + alertMedium;

      const message =
        `🤖 *Bot Status*\n\n` +
        `*Markets:*\n` +
        `• Total monitored: ${stats.total}\n` +
        `• By tier: T1: ${stats.tier1}, T2: ${stats.tier2}, T3: ${stats.tier3}\n\n` +
        `*Activity (Last Hour):*\n` +
        `• Trades processed: ${recentTrades}\n` +
        `• Alerts sent (24h): ${recentAlerts}\n\n` +
        `*Scoring System:*\n` +
        `• Alert threshold: Score ≥ ${thresholds.alertThreshold || 40}\n` +
        `• Min trade size: $${(thresholds.minTradeSize || 250).toLocaleString()}\n` +
        `• Min OI: $${(thresholds.minOi || 5000).toLocaleString()}\n\n` +
        `*All-Time Alerts:*\n` +
        `• 🚨 Strong: ${alertStrong}\n` +
        `• 🔴 High: ${alertHigh}\n` +
        `• 🟡 Medium: ${alertMedium}\n` +
        `• Total: ${totalAlerts}\n\n` +
        `*System:*\n` +
        `• Uptime: ${Math.floor(process.uptime() / 60)} minutes\n` +
        `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;

      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error({ error }, 'Failed to get status');

      // Fallback to basic status
      const message =
        `🤖 *Bot Status*\n\n` +
        `• Markets monitored: ${stats.total}\n` +
        `• Tier 1: ${stats.tier1}\n` +
        `• Tier 2: ${stats.tier2}\n` +
        `• Tier 3: ${stats.tier3}\n` +
        `• Uptime: ${Math.floor(process.uptime() / 60)} minutes`;

      await this.sendMessage(chatId, message);
    }
  }

  /**
   * Handle /test command - test wallet forensics
   */
  private async handleTestWallet(
    chatId: number,
    wallet: string
  ): Promise<void> {
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      await this.sendMessage(
        chatId,
        '❌ Usage: `/test <wallet-address>`\nExample: `/test 0x1234...abcd`'
      );
      return;
    }

    await this.sendMessage(chatId, `⏳ Analyzing wallet \`${wallet}\`...`);

    try {
      // Analyze wallet without trade context
      const fingerprint = await walletForensicsService.analyzeWallet(
        wallet
        // No trade context for manual check
      );

      const flagEmojis = {
        cexFunded: fingerprint.flags.cexFunded ? '✅' : '❌',
        lowTxCount: fingerprint.flags.lowTxCount ? '✅' : '❌',
        youngWallet: fingerprint.flags.youngWallet ? '✅' : '❌',
        highPolymarketNetflow: fingerprint.flags.highPolymarketNetflow
          ? '✅'
          : '❌',
        singlePurpose: fingerprint.flags.singlePurpose ? '✅' : '❌',
      };

      const suspiciousCount = Object.values(fingerprint.flags).filter(
        Boolean
      ).length;

      const message =
        `🔍 *Wallet Analysis*\n\n` +
        `*Address:* \`${wallet}\`\n` +
        `*Suspicious:* ${fingerprint.isSuspicious ? '🚨 YES' : '✅ NO'} (${suspiciousCount}/5 flags)\n\n` +
        `*Flags:*\n` +
        `${flagEmojis.cexFunded} CEX Funded${fingerprint.metadata.cexFundingSource ? ` (${fingerprint.metadata.cexFundingSource})` : ''}\n` +
        `${flagEmojis.lowTxCount} Low Tx Count (${fingerprint.metadata.totalTransactions} txs)\n` +
        `${flagEmojis.youngWallet} Young Wallet (${fingerprint.metadata.walletAgeDays} days)\n` +
        `${flagEmojis.highPolymarketNetflow} High Polymarket Flow (${fingerprint.metadata.polymarketNetflowPercentage.toFixed(1)}%)\n` +
        `${flagEmojis.singlePurpose} Single Purpose (${fingerprint.metadata.uniqueProtocolsInteracted} protocols)\n`;

      await this.sendMessage(chatId, message);

      logger.info(
        { wallet, fingerprint },
        'Wallet test completed via Telegram'
      );
    } catch (error) {
      logger.error({ error, wallet }, 'Failed to test wallet');
      await this.sendMessage(chatId, `❌ Failed to analyze wallet: ${wallet}`);
    }
  }

  /**
   * Handle /stats command - show filter funnel stats
   */
  private async handleStats(chatId: number): Promise<void> {
    try {
      const thresholds = getThresholds();
      const signalStats = await signalDetector.getStats();
      const scorerStats = await alertScorer.getStats();

      const tradesAnalyzed = signalStats['trades_analyzed'] || 0;
      const filteredOi = signalStats['filtered_oi_threshold'] || 0;
      const passedOi = signalStats['passed_oi_filter'] || 0;
      const filteredTradeSize = scorerStats['filtered_trade_size'] || 0;
      const filteredLowOi = scorerStats['filtered_low_oi'] || 0;
      const filteredWallet = scorerStats['filtered_wallet_score'] || 0;
      const passedHardFilters = scorerStats['passed_hard_filters'] || 0;
      const alertStrong =
        scorerStats['classification_alert_strong_insider'] || 0;
      const alertHigh =
        scorerStats['classification_alert_high_confidence'] || 0;
      const alertMedium =
        scorerStats['classification_alert_medium_confidence'] || 0;
      const logOnly = scorerStats['classification_log_only'] || 0;

      const totalAlerts = alertStrong + alertHigh + alertMedium;

      const message =
        `📊 *Filter Funnel Stats*\n\n` +
        `*Current Thresholds:*\n` +
        `• Min OI%: ${thresholds.minOiPercentage}%\n` +
        `• Min Trade: $1,000\n` +
        `• Min Wallet Score: 40\n\n` +
        `*Pipeline Stats:*\n` +
        `• Trades analyzed: ${tradesAnalyzed.toLocaleString()}\n` +
        `• Filtered (OI% < ${thresholds.minOiPercentage}%): ${filteredOi.toLocaleString()}\n` +
        `• Passed OI filter: ${passedOi.toLocaleString()}\n\n` +
        `*Hard Filters:*\n` +
        `• Filtered (trade < $1k): ${filteredTradeSize.toLocaleString()}\n` +
        `• Filtered (market OI < $5k): ${filteredLowOi.toLocaleString()}\n` +
        `• Filtered (wallet score): ${filteredWallet.toLocaleString()}\n` +
        `• Passed all filters: ${passedHardFilters.toLocaleString()}\n\n` +
        `*Classifications:*\n` +
        `• 🚨 Strong Insider: ${alertStrong}\n` +
        `• 🔴 High Confidence: ${alertHigh}\n` +
        `• 🟡 Medium Confidence: ${alertMedium}\n` +
        `• 📝 Log Only: ${logOnly}\n\n` +
        `*Total Alerts Sent: ${totalAlerts}*`;

      await this.sendMessage(chatId, message);
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      await this.sendMessage(chatId, '❌ Failed to get stats');
    }
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
      `• \`/test <wallet>\` - Test wallet fingerprint\n` +
      `• \`/stats\` - Show filter funnel stats\n` +
      `• \`/help\` - Show this help\n\n` +
      `*Example:*\n` +
      `\`/add maduro-out-in-2025\``;

    await this.sendMessage(chatId, message);
  }
}

export const telegramCommands = TelegramCommandHandler.getInstance();
