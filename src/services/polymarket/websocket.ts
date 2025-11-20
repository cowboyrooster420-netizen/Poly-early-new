import { WebSocket } from 'ws';

import { getEnv } from '../../config/env.js';
import type { PolymarketTrade, WebSocketMessage } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

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
   * Subscribe to a market's trade feed
   */
  public async subscribeToMarket(marketId: string): Promise<void> {
    if (!this.isConnected || this.ws === null) {
      logger.warn({ marketId }, 'Cannot subscribe: WebSocket not connected');
      return;
    }

    try {
      const message = {
        type: 'subscribe',
        market: marketId,
        channel: 'trades',
      };

      this.ws.send(JSON.stringify(message));
      this.subscribedMarkets.add(marketId);

      logger.info({ marketId }, 'Subscribed to market');
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to subscribe to market');
      throw error;
    }
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
   */
  private handleMessage(data: Buffer): void {
    try {
      const message: WebSocketMessage = JSON.parse(
        data.toString()
      ) as WebSocketMessage;

      logger.debug({ type: message.type }, 'WebSocket message received');

      if (message.type === 'trade') {
        this.handleTradeMessage(message);
      } else if (message.type === 'error') {
        logger.error({ message }, 'WebSocket error message');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle trade message
   */
  private handleTradeMessage(message: WebSocketMessage): void {
    try {
      // Parse trade data
      const trade = message.data as PolymarketTrade;

      logger.debug(
        {
          marketId: trade.marketId,
          size: trade.size,
          price: trade.price,
        },
        'Trade received'
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
      logger.error({ error }, 'Failed to handle trade message');
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
   */
  private resubscribeToMarkets(): void {
    for (const marketId of this.subscribedMarkets) {
      void this.subscribeToMarket(marketId);
    }
  }
}

// Export singleton instance
export const polymarketWs = PolymarketWebSocketService.getInstance();
