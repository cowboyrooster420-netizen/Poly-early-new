import { logger } from '../../utils/logger.js';
import { getThresholds } from '../../config/thresholds.js';
import axios, { AxiosError } from 'axios';
import { getEnv } from '../../config/env.js';
import { redis } from '../cache/redis.js';

interface LiquidityData {
  availableLiquidity: number;
  bidLiquidity: number;
  askLiquidity: number;
  spread: number;
  orderbookDepth: number;
}

interface VolumeData {
  volume24h: number;
  volumeNh: number; // N hours based on config
  recentTrades: number;
}

interface ImpactResult {
  impactPercentage: number;
  method: string;
  meetsThreshold: boolean;
  threshold: number;
  details: Record<string, unknown>;
}

interface OrderbookResponse {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface OrderBookLevel {
  price: string;
  size: string;
}

interface TradeResponse {
  size: string;
  price: string;
}

export class OiCalculationService {
  private redis = redis;
  private env = getEnv();

  async calculateImpactPercentage(
    tradeUsdValue: number,
    tradeSide: 'buy' | 'sell',
    marketId: string,
    openInterest: number
  ): Promise<ImpactResult> {
    const thresholds = getThresholds();
    const method = thresholds.oiCalculationMethod;

    try {
      switch (method) {
        case 'liquidity':
          return await this.calculateLiquidityImpact(
            tradeUsdValue,
            tradeSide,
            marketId,
            openInterest
          );

        case 'volume':
          return await this.calculateVolumeImpact(
            tradeUsdValue,
            marketId,
            openInterest
          );

        case 'oi':
        default:
          return this.calculateOiImpact(tradeUsdValue, openInterest);
      }
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : error,
          method,
          marketId,
          tradeValue: tradeUsdValue,
        },
        'Impact calculation failed, attempting fallback'
      );

      const thresholds = getThresholds();
      if (thresholds.fallbackToOiCalculation) {
        return this.calculateOiImpact(tradeUsdValue, openInterest, true);
      }

      throw error;
    }
  }

  private async calculateLiquidityImpact(
    tradeUsdValue: number,
    tradeSide: 'buy' | 'sell',
    marketId: string,
    openInterest: number
  ): Promise<ImpactResult> {
    const thresholds = getThresholds();

    // Get current orderbook from Polymarket API
    const liquidity = await this.getAvailableLiquidity(marketId, tradeSide);

    if (!liquidity || liquidity.availableLiquidity <= 0) {
      if (thresholds.fallbackToOiCalculation) {
        logger.debug(
          { marketId, tradeSide },
          'No liquidity data available, falling back to OI calculation'
        );
        return this.calculateOiImpact(tradeUsdValue, openInterest, true);
      }
      throw new Error(`No liquidity data available for market ${marketId}`);
    }

    const impactPercentage =
      (tradeUsdValue / liquidity.availableLiquidity) * 100;
    const threshold = thresholds.minLiquidityImpactPercentage;

    return {
      impactPercentage,
      method: 'liquidity',
      meetsThreshold: impactPercentage >= threshold,
      threshold,
      details: {
        tradeValue: tradeUsdValue,
        availableLiquidity: liquidity.availableLiquidity,
        bidLiquidity: liquidity.bidLiquidity,
        askLiquidity: liquidity.askLiquidity,
        spread: liquidity.spread,
        orderbookDepth: liquidity.orderbookDepth,
        tradeSide,
        openInterest,
      },
    };
  }

  private async calculateVolumeImpact(
    tradeUsdValue: number,
    marketId: string,
    openInterest: number
  ): Promise<ImpactResult> {
    const thresholds = getThresholds();

    const volumeData = await this.getRecentVolume(marketId);

    if (!volumeData || volumeData.volumeNh <= 0) {
      if (thresholds.fallbackToOiCalculation) {
        logger.debug(
          { marketId },
          'No volume data available, falling back to OI calculation'
        );
        return this.calculateOiImpact(tradeUsdValue, openInterest, true);
      }
      throw new Error(`No volume data available for market ${marketId}`);
    }

    const impactPercentage = (tradeUsdValue / volumeData.volumeNh) * 100;
    const threshold = thresholds.minVolumeImpactPercentage;

    return {
      impactPercentage,
      method: 'volume',
      meetsThreshold: impactPercentage >= threshold,
      threshold,
      details: {
        tradeValue: tradeUsdValue,
        volumeNh: volumeData.volumeNh,
        volume24h: volumeData.volume24h,
        recentTrades: volumeData.recentTrades,
        lookbackHours: thresholds.volumeLookbackHours,
        openInterest,
      },
    };
  }

  private calculateOiImpact(
    tradeUsdValue: number,
    openInterest: number,
    isFallback: boolean = false
  ): ImpactResult {
    const thresholds = getThresholds();

    if (openInterest <= 0) {
      return {
        impactPercentage: 0,
        method: isFallback ? 'oi_fallback' : 'oi',
        meetsThreshold: false,
        threshold: isFallback
          ? thresholds.fallbackOiPercentage
          : thresholds.minOiPercentage,
        details: {
          tradeValue: tradeUsdValue,
          openInterest,
          error: 'Invalid open interest',
        },
      };
    }

    const impactPercentage = (tradeUsdValue / openInterest) * 100;
    const threshold = isFallback
      ? thresholds.fallbackOiPercentage
      : thresholds.minOiPercentage;

    return {
      impactPercentage,
      method: isFallback ? 'oi_fallback' : 'oi',
      meetsThreshold: impactPercentage >= threshold,
      threshold,
      details: {
        tradeValue: tradeUsdValue,
        openInterest,
        isFallback,
      },
    };
  }

  private async getAvailableLiquidity(
    marketId: string,
    tradeSide: 'buy' | 'sell'
  ): Promise<LiquidityData | null> {
    const thresholds = getThresholds();
    const cacheKey = `orderbook:${marketId}`;

    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          const orderbookData = JSON.parse(cached) as OrderbookResponse;
          return this.calculateLiquidityFromOrderbook(orderbookData, tradeSide);
        } catch (parseError) {
          logger.warn(
            { parseError, cacheKey },
            'Failed to parse cached orderbook data'
          );
        }
      }

      // Fetch from Polymarket CLOB API
      const response = await axios.get<OrderbookResponse>(
        `${this.env.POLYMARKET_API_URL}/book`,
        {
          params: {
            token_id: marketId,
            side: 'both',
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'polymarket-insider-bot/1.0',
          },
        }
      );

      if (!response.data.bids.length || !response.data.asks.length) {
        logger.warn({ marketId }, 'Empty orderbook data received');
        return null;
      }

      // Cache the orderbook data
      await this.redis.set(
        cacheKey,
        JSON.stringify(response.data),
        thresholds.orderbookCacheTtlSeconds
      );

      return this.calculateLiquidityFromOrderbook(response.data, tradeSide);
    } catch (error) {
      if (error instanceof AxiosError) {
        logger.warn(
          {
            error: error.message,
            status: error.response?.status,
            marketId,
          },
          'Failed to fetch orderbook data'
        );
      } else {
        logger.warn(
          { error, marketId },
          'Unexpected error fetching orderbook data'
        );
      }
      return null;
    }
  }

  private calculateLiquidityFromOrderbook(
    orderbookData: OrderbookResponse,
    tradeSide: 'buy' | 'sell'
  ): LiquidityData | null {
    const thresholds = getThresholds();

    if (!orderbookData.bids.length || !orderbookData.asks.length) {
      return null;
    }

    // Take top N levels based on configuration
    const bids = orderbookData.bids.slice(0, thresholds.orderbookDepthLevels);
    const asks = orderbookData.asks.slice(0, thresholds.orderbookDepthLevels);

    // Calculate liquidity for each side
    const bidLiquidity = bids.reduce((total: number, order: OrderBookLevel) => {
      return total + parseFloat(order.size) * parseFloat(order.price);
    }, 0);

    const askLiquidity = asks.reduce((total: number, order: OrderBookLevel) => {
      return total + parseFloat(order.size) * parseFloat(order.price);
    }, 0);

    // Available liquidity is the side we're trading against
    const availableLiquidity =
      tradeSide === 'buy' ? askLiquidity : bidLiquidity;

    // Calculate spread
    const bestBid = parseFloat(bids[0]?.price || '0');
    const bestAsk = parseFloat(asks[0]?.price || '0');
    const spread = bestAsk - bestBid;

    return {
      availableLiquidity,
      bidLiquidity,
      askLiquidity,
      spread,
      orderbookDepth: Math.min(bids.length, asks.length),
    };
  }

  private async getRecentVolume(marketId: string): Promise<VolumeData | null> {
    const thresholds = getThresholds();
    const cacheKey = `volume:${marketId}:${thresholds.volumeLookbackHours}h`;

    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as VolumeData;
        } catch (parseError) {
          logger.warn(
            { parseError, cacheKey },
            'Failed to parse cached volume data'
          );
        }
      }

      // Calculate time range
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - thresholds.volumeLookbackHours * 3600;

      // Fetch from Polymarket API
      const response = await axios.get<TradeResponse[]>(
        `${this.env.POLYMARKET_API_URL}/trades`,
        {
          params: {
            market: marketId,
            start_ts: startTime,
            end_ts: endTime,
          },
          timeout: 15000,
          headers: {
            'User-Agent': 'polymarket-insider-bot/1.0',
          },
        }
      );

      if (!response.data.length) {
        logger.debug(
          { marketId },
          'No recent trades found for volume calculation'
        );
        return { volume24h: 0, volumeNh: 0, recentTrades: 0 };
      }

      // Calculate volume metrics
      const trades = response.data;
      const volumeNh = trades.reduce((total: number, trade: TradeResponse) => {
        return total + parseFloat(trade.size) * parseFloat(trade.price);
      }, 0);

      // Get 24h volume for comparison (if different from lookback period)
      const volume24h =
        thresholds.volumeLookbackHours === 24
          ? volumeNh
          : await this.get24hVolume(marketId);

      const volumeData = {
        volume24h: volume24h || volumeNh,
        volumeNh,
        recentTrades: trades.length,
      };

      // Cache for 5 minutes
      await this.redis.set(cacheKey, JSON.stringify(volumeData), 300);

      return volumeData;
    } catch (error) {
      logger.warn({ error, marketId }, 'Failed to fetch volume data');
      return null;
    }
  }

  private async get24hVolume(marketId: string): Promise<number> {
    try {
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - 24 * 3600; // 24 hours

      const response = await axios.get<TradeResponse[]>(
        `${this.env.POLYMARKET_API_URL}/trades`,
        {
          params: {
            market: marketId,
            start_ts: startTime,
            end_ts: endTime,
          },
          timeout: 10000,
        }
      );

      if (!response.data.length) {
        return 0;
      }

      return response.data.reduce((total: number, trade: TradeResponse) => {
        return total + parseFloat(trade.size) * parseFloat(trade.price);
      }, 0);
    } catch (error) {
      logger.warn({ error, marketId }, 'Failed to fetch 24h volume data');
      return 0;
    }
  }

  public getThresholdForCurrentMethod(): number {
    const thresholds = getThresholds();

    switch (thresholds.oiCalculationMethod) {
      case 'liquidity':
        return thresholds.minLiquidityImpactPercentage;
      case 'volume':
        return thresholds.minVolumeImpactPercentage;
      case 'oi':
      default:
        return thresholds.minOiPercentage;
    }
  }

  public getCurrentMethod(): string {
    return getThresholds().oiCalculationMethod;
  }
}
