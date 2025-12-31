import { WebSocket } from 'ws';

import { getEnv } from '../../config/env.js';
import type { PolymarketTrade } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket order book snapshot (sent as array)
 */
interface PolymarketOrderBook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

/**
 * Price change item within a price_change event
 */
interface PriceChangeItem {
  asset_id: string;
  price: string;
  size: string;
  side: string;
  hash: string;
  best_bid: string;
  best_ask: string;
}

/**
 * Polymarket WebSocket message (object format)
 * Event types: price_change, trade, last_trade_price
 */
interface PolymarketMessage {
  market?: string;
  event_type?: string;
  timestamp?: string;
  error?: string;
  // For price_change events
  price_changes?: PriceChangeItem[];
  // For trade events
  asset_id?: string;
  price?: string;
  size?: string;
  side?: string;
  maker_address?: string;
  taker_address?: string;
}

/**
 * Polymarket WebSocket service with automatic reconnection
 * Monitors real-time trades on subscribed markets
 */
class PolymarketWebSocketService {
  private static instance: PolymarketWebSocketService | null = null;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 60000; // Max 60 seconds
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private subscribedMarkets: Set<string> = new Set();
  private tradeHandlers: Array<(trade: PolymarketTrade) => void> = [];

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PolymarketWebSocketService {
    if (PolymarketWebSocketService.instance === null) {
      PolymarketWebSocketService.instance = new PolymarketWebSocketService();
    }
    return PolymarketWebSocketService.instance;
  }

  /**
   * Connect to Polymarket WebSocket
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.ws !== null) {
      logger.debug('WebSocket already connected');
      return;
    }

    const env = getEnv();
    const wsUrl = env.POLYMARKET_WS_URL;

    try {
      logger.info({ wsUrl }, 'Connecting to Polymarket WebSocket...');

      this.ws = new WebSocket(wsUrl);

      // Connection opened
      this.ws.on('open', () => {
        logger.info('✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay

        // Start ping/pong heartbeat
        this.startHeartbeat();

        // Resubscribe to markets if any
        this.resubscribeToMarkets();
      });

      // Message received
      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      // Connection error
      this.ws.on('error', (error: Error) => {
        logger.error({ error }, 'WebSocket error');
      });

      // Connection closed
      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn(
          { code, reason: reason.toString() },
          'WebSocket connection closed'
        );
        this.isConnected = false;
        this.stopHeartbeat();

        // Attempt to reconnect
        this.scheduleReconnect();
      });

      // Pong received (response to ping)
      this.ws.on('pong', () => {
        logger.debug('WebSocket pong received');
        if (this.pongTimeout !== null) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to connect to WebSocket');
      throw new Error(
        `WebSocket connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from WebSocket
   */
  public async disconnect(): Promise<void> {
    if (this.ws === null) {
      logger.debug('WebSocket not connected, skipping disconnect');
      return;
    }

    try {
      logger.info('Disconnecting WebSocket...');
      this.stopHeartbeat();
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
      this.isConnected = false;
      this.subscribedMarkets.clear();
      logger.info('WebSocket disconnected');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting WebSocket');
      throw error;
    }
  }

  /**
   * Subscribe to a market's trade feed (adds to set, batched on connect)
   */
  public async subscribeToMarket(assetId: string): Promise<void> {
    // Add to set - actual subscription happens via resubscribeToMarkets()
    this.subscribedMarkets.add(assetId);
    logger.debug({ assetId }, 'Added asset to subscription queue');
  }

  /**
   * Send the batched subscription message (call after adding markets)
   */
  public sendSubscriptions(): void {
    this.resubscribeToMarkets();
  }

  /**
   * Unsubscribe from a market's trade feed
   */
  public async unsubscribeFromMarket(marketId: string): Promise<void> {
    if (!this.isConnected || this.ws === null) {
      logger.warn({ marketId }, 'Cannot unsubscribe: WebSocket not connected');
      return;
    }

    try {
      const message = {
        type: 'unsubscribe',
        market: marketId,
        channel: 'trades',
      };

      this.ws.send(JSON.stringify(message));
      this.subscribedMarkets.delete(marketId);

      logger.info({ marketId }, 'Unsubscribed from market');
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to unsubscribe from market');
      throw error;
    }
  }

  /**
   * Register a handler for trade events
   */
  public onTrade(handler: (trade: PolymarketTrade) => void): void {
    this.tradeHandlers.push(handler);
  }

  /**
   * Remove a trade handler
   */
  public offTrade(handler: (trade: PolymarketTrade) => void): void {
    const index = this.tradeHandlers.indexOf(handler);
    if (index > -1) {
      this.tradeHandlers.splice(index, 1);
    }
  }

  /**
   * Get connection status
   */
  public getStatus(): {
    isConnected: boolean;
    subscribedMarkets: string[];
  } {
    return {
      isConnected: this.isConnected,
      subscribedMarkets: Array.from(this.subscribedMarkets),
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    isHealthy: boolean;
    error?: string;
  }> {
    try {
      if (this.ws === null || !this.isConnected) {
        return {
          isHealthy: false,
          error: 'WebSocket not connected',
        };
      }

      // Check if WebSocket is in OPEN state
      if (this.ws.readyState !== WebSocket.OPEN) {
        return {
          isHealthy: false,
          error: `WebSocket in state ${this.ws.readyState}`,
        };
      }

      return {
        isHealthy: true,
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle incoming WebSocket message
   * Polymarket CLOB WebSocket sends:
   * - Arrays: Order book snapshots [{"market": "...", "bids": [...], "asks": [...]}]
   * - Objects: Events {"market": "...", "event_type": "price_change"|"trade", ...}
   */
  private handleMessage(data: Buffer): void {
    const rawMessage = data.toString();

    // Skip empty messages
    if (!rawMessage || rawMessage.trim() === '') {
      return;
    }

    try {
      const parsed = JSON.parse(rawMessage) as unknown;

      // Array messages are order book snapshots
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const book = item as PolymarketOrderBook;
          if (book.bids || book.asks) {
            logger.debug(
              { market: book.market, assetId: book.asset_id },
              'Order book update'
            );
          }
        }
        return;
      }

      // Object messages have event_type at root level
      if (typeof parsed === 'object' && parsed !== null) {
        const msg = parsed as PolymarketMessage;

        if (msg.error) {
          logger.error({ error: msg.error }, 'WebSocket error from Polymarket');
          return;
        }

        const eventType = msg.event_type;

        if (eventType === 'price_change' && msg.price_changes) {
          // Price changes - these represent order book changes, not actual trades
          for (const change of msg.price_changes) {
            logger.debug(
              {
                assetId: change.asset_id,
                price: change.price,
                side: change.side,
              },
              'Price change'
            );
          }
        } else if (eventType === 'trade' || eventType === 'last_trade_price') {
          // Direct trade events
          this.handleTradeMessage(msg);
        } else if (eventType) {
          logger.debug({ eventType, market: msg.market }, 'Other event type');
        }
      }
    } catch {
      const truncated =
        rawMessage.length > 200 ? rawMessage.slice(0, 200) + '...' : rawMessage;
      logger.warn(`Non-JSON WebSocket message: ${truncated}`);
    }
  }

  /**
   * Handle trade message from Polymarket
   */
  private handleTradeMessage(msg: PolymarketMessage): void {
    try {
      // Polymarket sends maker/taker OR maker_address/taker_address depending on event type
      const rawMsg = msg as Record<string, unknown>;
      const maker =
        (rawMsg['maker_address'] as string) ||
        (rawMsg['maker'] as string) ||
        '';
      const taker =
        (rawMsg['taker_address'] as string) ||
        (rawMsg['taker'] as string) ||
        '';

      // Convert Polymarket message to our trade format
      const trade: PolymarketTrade = {
        id: `${msg.asset_id || msg.market}-${msg.timestamp || Date.now()}`,
        marketId: msg.asset_id || msg.market || '',
        side: msg.side === 'BUY' ? 'buy' : 'sell',
        size: msg.size || '0',
        price: msg.price || '0',
        timestamp: msg.timestamp ? parseInt(msg.timestamp, 10) : Date.now(),
        maker,
        taker,
        outcome: 'yes', // Will be determined by asset_id mapping
      };

      // Log if taker is missing - this helps debug the issue
      if (!taker) {
        logger.warn(
          { rawFields: Object.keys(rawMsg), assetId: msg.asset_id },
          'Trade missing taker address'
        );
      }

      logger.info(
        {
          assetId: msg.asset_id,
          size: trade.size,
          price: trade.price,
          side: trade.side,
          hasTaker: !!taker,
        },
        'Trade event received'
      );

      // Call all registered trade handlers
      for (const handler of this.tradeHandlers) {
        try {
          handler(trade);
        } catch (error) {
          logger.error({ error }, 'Error in trade handler');
        }
      }
    } catch (error) {
      logger.error({ error, msg }, 'Failed to handle trade message');
    }
  }

  /**
   * Start ping/pong heartbeat
   */
  private startHeartbeat(): void {
    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws !== null && this.isConnected) {
        logger.debug('Sending WebSocket ping');
        this.ws.ping();

        // Set timeout for pong response (5 seconds)
        this.pongTimeout = setTimeout(() => {
          logger.warn('WebSocket pong timeout');
          // Close connection if no pong received
          if (this.ws !== null) {
            this.ws.terminate();
          }
        }, 5000);
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.pongTimeout !== null) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        { attempts: this.reconnectAttempts },
        'Max reconnection attempts reached'
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    logger.info(
      { attempt: this.reconnectAttempts, delay },
      'Scheduling WebSocket reconnection'
    );

    setTimeout(() => {
      void this.connect();
    }, delay);
  }

  /**
   * Resubscribe to all previously subscribed markets
   * Sends all asset IDs in a single subscription message (Polymarket format)
   */
  private resubscribeToMarkets(): void {
    if (this.subscribedMarkets.size === 0) {
      logger.debug('No markets to resubscribe to');
      return;
    }

    if (this.ws === null || !this.isConnected) {
      logger.warn('Cannot resubscribe: WebSocket not connected');
      return;
    }

    logger.info(
      { count: this.subscribedMarkets.size },
      'Resubscribing to markets after WebSocket connect'
    );

    try {
      // Polymarket expects all asset IDs in a single subscribe message
      const assetIds = Array.from(this.subscribedMarkets);
      const message = {
        auth: null,
        type: 'market',
        assets_ids: assetIds,
      };

      this.ws.send(JSON.stringify(message));
      logger.info(
        { assetCount: assetIds.length },
        'Sent subscription message to Polymarket WebSocket'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to send subscription message');
    }
  }
}

// Export singleton instance
export const polymarketWs = PolymarketWebSocketService.getInstance();
