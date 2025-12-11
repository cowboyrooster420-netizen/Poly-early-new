import { WebSocket } from 'ws';

import { getEnv } from '../../config/env.js';
import type { PolymarketTrade } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Polymarket WebSocket event format
 * Events come as arrays: [{"event_type": "...", "asset_id": "...", ...}]
 */
interface PolymarketWsEvent {
  event_type: string;
  asset_id?: string;
  id?: string;
  price?: string;
  size?: string;
  side?: string;
  timestamp?: string;
  maker_address?: string;
  taker_address?: string;
  // Order book fields
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
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
   * Polymarket CLOB WebSocket sends arrays of events like:
   * [{"event_type": "price_change", "asset_id": "...", ...}]
   */
  private handleMessage(data: Buffer): void {
    const rawMessage = data.toString();

    // Skip empty messages or ping/pong frames
    if (!rawMessage || rawMessage.trim() === '') {
      return;
    }

    // Log ALL incoming messages at info level for debugging
    const truncated = rawMessage.length > 300 ? rawMessage.slice(0, 300) + '...' : rawMessage;
    logger.info(`WebSocket raw message: ${truncated}`);

    try {
      const parsed = JSON.parse(rawMessage) as unknown;

      // Polymarket sends arrays of events
      if (Array.isArray(parsed)) {
        for (const event of parsed) {
          this.handlePolymarketEvent(event as PolymarketWsEvent);
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Handle single object messages (like subscription confirmations)
        const obj = parsed as Record<string, unknown>;
        if (obj['error']) {
          logger.error({ message: obj }, 'WebSocket error message from server');
        } else {
          logger.info(`Non-array message: ${JSON.stringify(obj)}`);
        }
      } else {
        logger.info(`Unexpected message type: ${typeof parsed}`);
      }
    } catch {
      // Not valid JSON - might be a text message like "ping" or subscription confirmation
      logger.warn(`Non-JSON WebSocket message: ${truncated}`);
    }
  }

  /**
   * Handle a single Polymarket WebSocket event
   */
  private handlePolymarketEvent(event: PolymarketWsEvent): void {
    try {
      const eventType = event.event_type;

      if (eventType === 'trade' || eventType === 'last_trade_price') {
        this.handleTradeEvent(event);
      } else if (eventType === 'price_change') {
        // Price changes - could be used for price tracking
        logger.debug(
          { assetId: event.asset_id, price: event.price },
          'Price change event'
        );
      } else if (eventType === 'book') {
        // Order book updates
        logger.debug({ assetId: event.asset_id }, 'Order book event');
      } else {
        logger.debug({ eventType, assetId: event.asset_id }, 'Unknown event type');
      }
    } catch (error) {
      logger.error({ error, event }, 'Failed to handle Polymarket event');
    }
  }

  /**
   * Handle trade event from Polymarket
   */
  private handleTradeEvent(event: PolymarketWsEvent): void {
    try {
      // Convert Polymarket event to our trade format
      const trade: PolymarketTrade = {
        id: event.id || `${event.asset_id}-${Date.now()}`,
        marketId: event.asset_id || '', // This is the CLOB token ID
        side: event.side === 'BUY' ? 'buy' : 'sell',
        size: event.size || '0',
        price: event.price || '0',
        timestamp: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
        maker: event.maker_address || '',
        taker: event.taker_address || '',
        outcome: 'yes', // Will be determined by asset_id mapping
      };

      logger.info(
        {
          assetId: event.asset_id,
          size: trade.size,
          price: trade.price,
          side: trade.side,
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
      logger.error({ error, event }, 'Failed to handle trade event');
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
