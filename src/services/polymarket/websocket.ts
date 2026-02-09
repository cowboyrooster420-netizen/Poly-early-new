import { WebSocket } from 'ws';

import { getEnv } from '../../config/env.js';
import type { PolymarketTrade } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Price change item within a price_change event
 */
interface PriceChangeItem {
  asset_id: string;
  price: string;
  size: string;
  side: 'BUY' | 'SELL';
  hash: string;
  best_bid: string;
  best_ask: string;
}

/**
 * Polymarket WebSocket message (object format)
 * Event types: book, price_change, trade, tick_size_change
 */
interface PolymarketMessage {
  market?: string;
  event_type?:
    | 'book'
    | 'price_change'
    | 'trade'
    | 'tick_size_change'
    | 'last_trade_price';
  timestamp?: string;
  error?: string;
  // For price_change events
  price_changes?: PriceChangeItem[];
  // For trade events
  asset_id?: string;
  price?: string;
  size?: string;
  side?: 'BUY' | 'SELL';
  maker_address?: string;
  taker_address?: string;
  // For tick_size_change events
  old_tick_size?: string;
  new_tick_size?: string;
  // For book events
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  hash?: string;
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
  private static readonly MAX_TRADE_HANDLERS = 100;

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
    // Add to set
    this.subscribedMarkets.add(assetId);
    logger.debug({ assetId }, 'Added asset to subscription set');

    // If already connected, send subscribe message immediately
    if (this.isConnected && this.ws) {
      try {
        const message = {
          assets_ids: [assetId],
          operation: 'subscribe',
        };
        this.ws.send(JSON.stringify(message));
        logger.debug({ assetId }, 'Sent dynamic subscribe message');
      } catch (error) {
        logger.error({ error, assetId }, 'Failed to send subscribe message');
      }
    }
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
  public async unsubscribeFromMarket(assetId: string): Promise<void> {
    // Remove from set
    this.subscribedMarkets.delete(assetId);
    logger.debug({ assetId }, 'Removed asset from subscription set');

    // If connected, send unsubscribe message
    if (this.isConnected && this.ws) {
      try {
        const message = {
          assets_ids: [assetId],
          operation: 'unsubscribe',
        };
        this.ws.send(JSON.stringify(message));
        logger.info({ assetId }, 'Sent unsubscribe message');
      } catch (error) {
        logger.error({ error, assetId }, 'Failed to send unsubscribe message');
        throw error;
      }
    }
  }

  /**
   * Register a handler for trade events
   * Prevents duplicate handlers and enforces max handler limit
   */
  public onTrade(handler: (trade: PolymarketTrade) => void): void {
    // Check for duplicate handler to prevent memory leak
    if (this.tradeHandlers.includes(handler)) {
      logger.warn('Attempted to add duplicate trade handler, ignoring');
      return;
    }

    // Enforce max handlers limit to prevent memory leak
    if (
      this.tradeHandlers.length >= PolymarketWebSocketService.MAX_TRADE_HANDLERS
    ) {
      logger.error(
        {
          currentCount: this.tradeHandlers.length,
          max: PolymarketWebSocketService.MAX_TRADE_HANDLERS,
        },
        'Max trade handlers limit reached, rejecting new handler'
      );
      throw new Error('Max trade handlers limit reached');
    }

    this.tradeHandlers.push(handler);
    logger.debug(
      { handlerCount: this.tradeHandlers.length },
      'Trade handler registered'
    );
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

      // Array messages are no longer used in new format
      if (Array.isArray(parsed)) {
        logger.debug('Received array message (legacy format)');
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

        if (eventType === 'book') {
          // Orderbook snapshot
          logger.debug(
            {
              market: msg.market,
              assetId: msg.asset_id,
              timestamp: msg.timestamp,
              bidLevels: msg.bids?.length || 0,
              askLevels: msg.asks?.length || 0,
            },
            'Orderbook snapshot'
          );
        } else if (eventType === 'price_change' && msg.price_changes) {
          // Price changes - these represent order book changes, not actual trades
          for (const change of msg.price_changes) {
            logger.debug(
              {
                assetId: change.asset_id,
                price: change.price,
                side: change.side,
                newSize: change.size,
                bestBid: change.best_bid,
                bestAsk: change.best_ask,
              },
              'Price change'
            );
          }
        } else if (eventType === 'trade' || eventType === 'last_trade_price') {
          // Direct trade events
          logger.debug(
            {
              eventType,
              fields: Object.keys(msg).join(', '),
              msg: JSON.stringify(msg).substring(0, 200),
            },
            'Processing trade event'
          );
          this.handleTradeMessage(msg);
        } else if (eventType === 'tick_size_change') {
          // Tick size change event
          logger.info(
            {
              market: msg.market,
              assetId: msg.asset_id,
              oldTickSize: msg.old_tick_size,
              newTickSize: msg.new_tick_size,
              side: msg.side,
            },
            'Market tick size changed'
          );
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
      const transactionHash = (rawMsg['transaction_hash'] as string) || '';

      // Skip trades without taker address - we can't identify the user
      // WebSocket currently doesn't provide maker/taker addresses
      if (!taker) {
        logger.debug(
          {
            txHash: transactionHash ? transactionHash.slice(0, 16) : 'none',
            assetId: msg.asset_id,
            price: msg.price,
            size: msg.size,
          },
          'Skipping trade without taker address - cannot identify user'
        );
        return;
      }

      // Convert Polymarket message to our trade format
      // Note: WebSocket trades have potentially incorrect size (order size vs taker fill size)
      // Signal detection only runs on subgraph trades which have accurate amounts
      const parsedTimestamp = msg.timestamp ? parseInt(msg.timestamp, 10) : NaN;
      const tradeTimestamp = isFinite(parsedTimestamp)
        ? parsedTimestamp
        : Date.now();

      const trade: PolymarketTrade = {
        id: `ws-${msg.asset_id || msg.market}-${tradeTimestamp}`,
        marketId: msg.asset_id || msg.market || '',
        side: msg.side === 'BUY' ? 'buy' : 'sell',
        size: msg.size || '0',
        price: msg.price || '0',
        timestamp: tradeTimestamp,
        maker,
        taker,
        outcome: 'yes', // Will be determined by asset_id mapping
        source: 'websocket',
        ...(transactionHash ? { transactionHash } : {}),
      };

      // This code is now unreachable since we return early if no taker
      // Keeping transactionHash in trade object in case it's useful later

      logger.info(
        {
          assetId: msg.asset_id,
          size: trade.size,
          price: trade.price,
          side: trade.side,
          hasTaker: !!taker,
          maker,
          taker,
          rawFields: Object.keys(rawMsg).join(', '),
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
      // Polymarket expects assets_ids with type: 'market' for subscriptions
      const assetIds = Array.from(this.subscribedMarkets);

      // Send subscription message
      const message = {
        assets_ids: assetIds,
        type: 'market',
      };

      if (this.ws.readyState !== 1) {
        logger.error(
          { readyState: this.ws.readyState, assetCount: assetIds.length },
          '❌ WebSocket not in OPEN state — subscription will be lost'
        );
        return;
      }

      this.ws.send(JSON.stringify(message));
      logger.info(
        {
          assetCount: assetIds.length,
          firstAsset: assetIds[0]?.substring(0, 16),
        },
        'Sent subscription message to Polymarket WebSocket'
      );
    } catch (error) {
      logger.error(
        { error, assetCount: this.subscribedMarkets.size },
        '❌ Failed to send subscription message — trades for these markets will be missed'
      );
    }
  }
}

// Export singleton instance
export const polymarketWs = PolymarketWebSocketService.getInstance();
