import axios from 'axios';
import { db } from '../database/prisma.js';
import { redis } from '../cache/redis.js';
import { polymarketWs } from './websocket.js';
import { logger } from '../../utils/logger.js';
import type { MarketConfig } from '../../types/index.js';

interface GammaMarketResponse {
  id: string;
  volume: string;
  liquidity: string;
  volumeNum?: number;
  liquidityNum?: number;
}

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

      // Queue all markets for WebSocket subscription using CLOB token IDs
      let subscribedCount = 0;
      for (const market of markets) {
        if (market.clobTokenIdYes) {
          await polymarketWs.subscribeToMarket(market.clobTokenIdYes);
          subscribedCount++;
        }
        if (market.clobTokenIdNo) {
          await polymarketWs.subscribeToMarket(market.clobTokenIdNo);
          subscribedCount++;
        }
        if (!market.clobTokenIdYes && !market.clobTokenIdNo) {
          logger.warn(
            { marketId: market.id },
            'Market missing CLOB token IDs - cannot subscribe to WebSocket'
          );
        }
      }

      // Send the batched subscription
      polymarketWs.sendSubscriptions();

      logger.info(
        { marketCount: markets.length, assetCount: subscribedCount },
        'Subscribed to markets via WebSocket'
      );

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
          conditionId: string;
          clobTokenIdYes: string | null;
          clobTokenIdNo: string | null;
          question: string;
          slug: string;
          tier: number;
          category: string | null;
          enabled: boolean;
          notes: string | null;
          openInterest: { toString(): string };
          volume: { toString(): string };
        }): MarketConfig => {
          const config: MarketConfig = {
            id: m.id,
            conditionId: m.conditionId,
            clobTokenIdYes: m.clobTokenIdYes ?? undefined,
            clobTokenIdNo: m.clobTokenIdNo ?? undefined,
            question: m.question,
            slug: m.slug,
            tier: m.tier as 1 | 2 | 3,
            category: m.category as
              | 'politics'
              | 'corporate'
              | 'sports'
              | 'misc',
            enabled: m.enabled,
            openInterest: m.openInterest.toString(),
            volume: m.volume.toString(),
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
   * Check if a market is being monitored (by id, conditionId, or clobTokenId)
   */
  public isMonitored(identifier: string): boolean {
    // Check by id first
    if (this.monitoredMarkets.has(identifier)) {
      return true;
    }
    // Check by conditionId or clobTokenIds
    for (const market of this.monitoredMarkets.values()) {
      if (
        market.conditionId === identifier ||
        market.clobTokenIdYes === identifier ||
        market.clobTokenIdNo === identifier
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get market by conditionId
   */
  public getMarketByConditionId(conditionId: string): MarketConfig | undefined {
    for (const market of this.monitoredMarkets.values()) {
      if (market.conditionId === conditionId) {
        return market;
      }
    }
    return undefined;
  }

  /**
   * Get market by CLOB token ID (asset ID)
   */
  public getMarketByAssetId(assetId: string): MarketConfig | undefined {
    // First check if assetId matches a market ID directly
    const marketById = this.monitoredMarkets.get(assetId);
    if (marketById) {
      return marketById;
    }

    // Fallback: check if assetId matches CLOB token IDs
    for (const market of this.monitoredMarkets.values()) {
      if (
        market.clobTokenIdYes === assetId ||
        market.clobTokenIdNo === assetId
      ) {
        return market;
      }
    }
    return undefined;
  }

  /**
   * Get all monitored asset IDs (CLOB token IDs)
   */
  public getMonitoredAssetIds(): string[] {
    const assetIds: string[] = [];
    for (const market of this.monitoredMarkets.values()) {
      if (market.clobTokenIdYes) {
        assetIds.push(market.clobTokenIdYes);
      }
      if (market.clobTokenIdNo) {
        assetIds.push(market.clobTokenIdNo);
      }
    }
    return assetIds;
  }

  /**
   * Get all monitored condition IDs (for Data API queries)
   */
  public getMonitoredConditionIds(): string[] {
    const conditionIds: string[] = [];
    for (const market of this.monitoredMarkets.values()) {
      if (market.conditionId) {
        conditionIds.push(market.conditionId);
      }
    }
    return conditionIds;
  }

  /**
   * Add a market to monitoring
   */
  public async addMarket(market: MarketConfig): Promise<void> {
    try {
      logger.info({ marketId: market.id }, 'Adding market to monitoring');

      // Add to memory
      this.monitoredMarkets.set(market.id, market);

      // Subscribe to WebSocket using CLOB token IDs
      if (market.clobTokenIdYes) {
        await polymarketWs.subscribeToMarket(market.clobTokenIdYes);
      }
      if (market.clobTokenIdNo) {
        await polymarketWs.subscribeToMarket(market.clobTokenIdNo);
      }
      // Send the updated subscription list
      polymarketWs.sendSubscriptions();

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

      // Get conditionId before removing
      const market = this.monitoredMarkets.get(marketId);

      // Remove from memory
      this.monitoredMarkets.delete(marketId);

      // Unsubscribe from WebSocket using CLOB token IDs
      if (market) {
        if (market.clobTokenIdYes) {
          await polymarketWs.unsubscribeFromMarket(market.clobTokenIdYes);
        }
        if (market.clobTokenIdNo) {
          await polymarketWs.unsubscribeFromMarket(market.clobTokenIdNo);
        }
      }

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

  /**
   * Refresh OI (open interest) for all monitored markets
   * Fetches latest liquidity from Gamma API and updates database
   */
  public async refreshOpenInterest(): Promise<void> {
    const markets = this.getAllMarkets();

    if (markets.length === 0) {
      logger.debug('No markets to refresh OI for');
      return;
    }

    logger.info({ count: markets.length }, 'Refreshing OI for markets');

    let updated = 0;
    let failed = 0;
    let zeroOI = 0;

    for (const market of markets) {
      try {
        // Fetch market data from Gamma API
        const response = await axios.get<GammaMarketResponse>(
          `https://gamma-api.polymarket.com/markets/${market.id}`,
          {
            headers: { 'User-Agent': 'PolymarketInsiderBot/1.0' },
            timeout: 10000,
          }
        );

        // Prefer numeric fields (more reliable), fall back to string parsing
        const newOI =
          response.data.liquidityNum ??
          (parseFloat(response.data.liquidity) || 0);
        const newVolume =
          response.data.volumeNum ?? (parseFloat(response.data.volume) || 0);

        if (newOI === 0) {
          zeroOI++;
          logger.debug(
            {
              marketId: market.id,
              liquidityNum: response.data.liquidityNum,
              liquidity: response.data.liquidity,
            },
            'Market has zero OI'
          );
        }

        // Update database
        const prisma = db.getClient();
        await prisma.market.update({
          where: { id: market.id },
          data: {
            openInterest: newOI,
            volume: newVolume,
          },
        });

        // Update in-memory cache
        market.openInterest = newOI.toString();
        market.volume = newVolume.toString();
        this.monitoredMarkets.set(market.id, market);

        // Update Redis cache
        await redis.setJSON(
          `market:data:${market.id}`,
          {
            openInterest: newOI.toString(),
            volume: newVolume.toString(),
          },
          300
        ); // 5 min cache for signal detector

        updated++;
      } catch (error) {
        logger.warn(
          { error, marketId: market.id },
          'Failed to refresh OI for market'
        );
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    logger.info(
      { updated, failed, zeroOI, total: markets.length },
      'OI refresh complete'
    );
  }
}

// Export singleton instance
export const marketService = MarketService.getInstance();
