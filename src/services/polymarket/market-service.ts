import { db } from '../database/prisma.js';
import { redis } from '../cache/redis.js';
import { polymarketWs } from './websocket.js';
import { logger } from '../../utils/logger.js';
import type { MarketConfig } from '../../types/index.js';

/**
 * Market service - manages monitored markets and subscriptions
 */
class MarketService {
  private static instance: MarketService | null = null;
  private monitoredMarkets: Map<string, MarketConfig> = new Map();
  private isInitialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MarketService {
    if (MarketService.instance === null) {
      MarketService.instance = new MarketService();
    }
    return MarketService.instance;
  }

  /**
   * Initialize market service
   * Loads enabled markets from database and subscribes to WebSocket
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Market service already initialized');
      return;
    }

    try {
      logger.info('Initializing market service...');

      // Load enabled markets from database
      const markets = await this.loadMarketsFromDatabase();

      // Cache markets in memory
      for (const market of markets) {
        this.monitoredMarkets.set(market.id, market);
      }

      // Subscribe to all markets via WebSocket
      for (const market of markets) {
        await polymarketWs.subscribeToMarket(market.id);
      }

      this.isInitialized = true;
      logger.info({ count: markets.length }, '✅ Market service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize market service');
      throw error;
    }
  }

  /**
   * Load enabled markets from database
   */
  private async loadMarketsFromDatabase(): Promise<MarketConfig[]> {
    try {
      const prisma = db.getClient();

      const dbMarkets = await prisma.market.findMany({
        where: {
          enabled: true,
          active: true,
          closed: false,
        },
        orderBy: [
          { tier: 'asc' }, // Tier 1 first
          { createdAt: 'desc' },
        ],
      });

      const markets: MarketConfig[] = dbMarkets.map(
        (m: {
          id: string;
          question: string;
          slug: string;
          tier: number;
          category: string | null;
          enabled: boolean;
          notes: string | null;
        }): MarketConfig => {
          const config: MarketConfig = {
            id: m.id,
            question: m.question,
            slug: m.slug,
            tier: m.tier as 1 | 2 | 3,
            category: m.category as 'politics' | 'corporate' | 'sports' | 'misc',
            enabled: m.enabled,
          };
          if (m.notes !== null) {
            config.notes = m.notes;
          }
          return config;
        }
      );

      logger.info(
        {
          total: markets.length,
          tier1: markets.filter((m) => m.tier === 1).length,
          tier2: markets.filter((m) => m.tier === 2).length,
          tier3: markets.filter((m) => m.tier === 3).length,
        },
        'Markets loaded from database'
      );

      return markets;
    } catch (error) {
      logger.error({ error }, 'Failed to load markets from database');
      throw error;
    }
  }

  /**
   * Get a market by ID
   */
  public getMarket(marketId: string): MarketConfig | undefined {
    return this.monitoredMarkets.get(marketId);
  }

  /**
   * Get all monitored markets
   */
  public getAllMarkets(): MarketConfig[] {
    return Array.from(this.monitoredMarkets.values());
  }

  /**
   * Get markets by category
   */
  public getMarketsByCategory(
    category: 'politics' | 'corporate' | 'sports' | 'misc'
  ): MarketConfig[] {
    return this.getAllMarkets().filter((m) => m.category === category);
  }

  /**
   * Get markets by tier
   */
  public getMarketsByTier(tier: 1 | 2 | 3): MarketConfig[] {
    return this.getAllMarkets().filter((m) => m.tier === tier);
  }

  /**
   * Check if a market is being monitored
   */
  public isMonitored(marketId: string): boolean {
    return this.monitoredMarkets.has(marketId);
  }

  /**
   * Add a market to monitoring
   */
  public async addMarket(market: MarketConfig): Promise<void> {
    try {
      logger.info({ marketId: market.id }, 'Adding market to monitoring');

      // Add to memory
      this.monitoredMarkets.set(market.id, market);

      // Subscribe to WebSocket
      await polymarketWs.subscribeToMarket(market.id);

      // Cache in Redis (30 day TTL)
      await redis.setJSON(`market:${market.id}`, market, 30 * 24 * 60 * 60);

      logger.info({ marketId: market.id }, 'Market added to monitoring');
    } catch (error) {
      logger.error({ error, marketId: market.id }, 'Failed to add market');
      throw error;
    }
  }

  /**
   * Remove a market from monitoring
   */
  public async removeMarket(marketId: string): Promise<void> {
    try {
      logger.info({ marketId }, 'Removing market from monitoring');

      // Remove from memory
      this.monitoredMarkets.delete(marketId);

      // Unsubscribe from WebSocket
      await polymarketWs.unsubscribeFromMarket(marketId);

      // Remove from Redis cache
      await redis.delete(`market:${marketId}`);

      logger.info({ marketId }, 'Market removed from monitoring');
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to remove market');
      throw error;
    }
  }

  /**
   * Reload markets from database
   * Useful for picking up config changes without restart
   */
  public async reloadMarkets(): Promise<void> {
    try {
      logger.info('Reloading markets from database...');

      const markets = await this.loadMarketsFromDatabase();
      const currentIds = new Set(this.monitoredMarkets.keys());
      const newIds = new Set(markets.map((m) => m.id));

      // Find markets to add
      const toAdd = markets.filter((m) => !currentIds.has(m.id));

      // Find markets to remove
      const toRemove = Array.from(currentIds).filter((id) => !newIds.has(id));

      // Add new markets
      for (const market of toAdd) {
        await this.addMarket(market);
      }

      // Remove old markets
      for (const marketId of toRemove) {
        await this.removeMarket(marketId);
      }

      logger.info(
        { added: toAdd.length, removed: toRemove.length },
        'Markets reloaded'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to reload markets');
      throw error;
    }
  }

  /**
   * Get market count by status
   */
  public getStats(): {
    total: number;
    tier1: number;
    tier2: number;
    tier3: number;
    byCategory: Record<string, number>;
  } {
    const markets = this.getAllMarkets();

    return {
      total: markets.length,
      tier1: markets.filter((m) => m.tier === 1).length,
      tier2: markets.filter((m) => m.tier === 2).length,
      tier3: markets.filter((m) => m.tier === 3).length,
      byCategory: {
        politics: markets.filter((m) => m.category === 'politics').length,
        corporate: markets.filter((m) => m.category === 'corporate').length,
        sports: markets.filter((m) => m.category === 'sports').length,
        misc: markets.filter((m) => m.category === 'misc').length,
      },
    };
  }
}

// Export singleton instance
export const marketService = MarketService.getInstance();
