import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';

import { db } from '../services/database/prisma.js';
import { marketService } from '../services/polymarket/market-service.js';
import { logger } from '../utils/logger.js';

interface AddMarketBody {
  slug: string;
  tier?: 1 | 2 | 3;
  category?: 'politics' | 'corporate' | 'sports' | 'misc';
}

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
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
 * Register market management routes
 */
export async function registerMarketRoutes(
  app: FastifyInstance
): Promise<void> {
  // List all monitored markets
  app.get(
    '/api/markets',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const markets = marketService.getAllMarkets();
        const stats = marketService.getStats();

        return reply.code(200).send({
          success: true,
          count: markets.length,
          stats,
          markets,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list markets');
        return reply.code(500).send({
          success: false,
          error: 'Failed to list markets',
        });
      }
    }
  );

  // Add a market by slug
  app.post(
    '/api/markets',
    async (
      request: FastifyRequest<{ Body: AddMarketBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { slug, tier = 2, category = 'misc' } = request.body;

        if (!slug) {
          return reply.code(400).send({
            success: false,
            error: 'Missing required field: slug',
          });
        }

        logger.info({ slug }, 'Fetching market from Polymarket...');

        // Fetch from Gamma API
        const gammaResponse = await axios.get<GammaEvent>(
          `https://gamma-api.polymarket.com/events/slug/${slug}`,
          {
            headers: {
              'User-Agent': 'PolymarketInsiderBot/1.0',
              Accept: 'application/json',
            },
            timeout: 10000,
          }
        );

        const event = gammaResponse.data;

        if (!event || !event.markets || event.markets.length === 0) {
          return reply.code(404).send({
            success: false,
            error: 'Market not found or has no markets',
          });
        }

        const prisma = db.getClient();
        const addedMarkets = [];

        // Add each market from the event
        for (const market of event.markets) {
          // Check if already exists
          const existing = await prisma.market.findUnique({
            where: { id: market.id },
          });

          if (existing) {
            logger.info({ marketId: market.id }, 'Market already exists');
            continue;
          }

          // Insert into database
          const created = await prisma.market.create({
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
              category,
              tier,
            },
          });

          addedMarkets.push(created);
          logger.info(
            { marketId: market.id, question: market.question },
            'Market added'
          );
        }

        // Reload markets to pick up new ones
        if (addedMarkets.length > 0) {
          await marketService.reloadMarkets();
        }

        return reply.code(201).send({
          success: true,
          message: `Added ${addedMarkets.length} market(s)`,
          markets: addedMarkets.map((m) => ({
            id: m.id,
            question: m.question,
            slug: m.slug,
            tier: m.tier,
            category: m.category,
          })),
        });
      } catch (error) {
        if (axios.isAxiosError(error)) {
          logger.error(
            { status: error.response?.status, message: error.message },
            'Failed to fetch from Polymarket API'
          );
          return reply.code(502).send({
            success: false,
            error: `Polymarket API error: ${error.response?.status || error.message}`,
          });
        }

        logger.error({ error }, 'Failed to add market');
        return reply.code(500).send({
          success: false,
          error: 'Failed to add market',
        });
      }
    }
  );

  // Remove a market
  app.delete(
    '/api/markets/:marketId',
    async (
      request: FastifyRequest<{ Params: { marketId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { marketId } = request.params;

        const prisma = db.getClient();

        // Disable in database
        await prisma.market.update({
          where: { id: marketId },
          data: { enabled: false },
        });

        // Remove from monitoring
        await marketService.removeMarket(marketId);

        return reply.code(200).send({
          success: true,
          message: 'Market removed from monitoring',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to remove market');
        return reply.code(500).send({
          success: false,
          error: 'Failed to remove market',
        });
      }
    }
  );

  // Reload markets from database
  app.post(
    '/api/markets/reload',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        await marketService.reloadMarkets();

        return reply.code(200).send({
          success: true,
          message: 'Markets reloaded',
          stats: marketService.getStats(),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to reload markets');
        return reply.code(500).send({
          success: false,
          error: 'Failed to reload markets',
        });
      }
    }
  );
}
