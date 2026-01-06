/**
 * Core type definitions for the Polymarket Insider Bot
 */

// ============================================================================
// Polymarket Types
// ============================================================================

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  openInterest: string;
  volume: string;
  active: boolean;
  closed: boolean;
  description?: string;
  category?: string;
  endDate?: string;
}

export interface PolymarketTrade {
  id: string;
  marketId: string;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  timestamp: number;
  maker: string;
  taker: string;
  outcome: 'yes' | 'no';
  transactionHash?: string;
}

export interface OrderBook {
  marketId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

// ============================================================================
// Signal Detection Types
// ============================================================================

export type FingerprintStatus = 'success' | 'error' | 'partial' | 'unknown';

export interface DataCompleteness {
  dataApi: boolean;
  subgraph: boolean;
  cache: boolean;
  timestamp: number;
  validationScore?: number; // Cross-validation confidence (0-100)
  hasDiscrepancies?: boolean; // Whether data sources disagree
}

export interface TradeSignal {
  tradeId: string;
  marketId: string;
  walletAddress: string;
  tradeSize: string;
  openInterest: string;
  oiPercentage: number; // Backwards compatibility - same as impactPercentage
  impactPercentage: number; // New field - actual impact percentage
  impactMethod: string; // 'liquidity', 'volume', or 'oi'
  impactThreshold: number; // Threshold used for this calculation
  priceImpact: number;
  priceBeforeTrade: string;
  priceAfterTrade: string;
  tradeUsdValue: number;
  timestamp: number;
  outcome: 'yes' | 'no';
}

export interface DormancyMetrics {
  lastLargeTradeTimestamp: number | null;
  hoursSinceLastLargeTrade: number;
  lastPriceMoveTimestamp: number | null;
  hoursSinceLastPriceMove: number;
  isDormant: boolean;
}

// Note: WalletFingerprint interface has been moved to src/services/blockchain/wallet-forensics.ts
// It is now a more comprehensive interface with subgraph/data API flags

// FundingSource type is no longer used (was part of old on-chain analysis)
// Keeping for backwards compatibility in case of stored data

export interface TimingWindow {
  name: string;
  isActive: boolean;
  description: string;
}

// ============================================================================
// Alert Types
// ============================================================================

export interface Alert {
  id: string;
  marketId: string;
  marketQuestion: string;
  marketSlug: string;
  tradeSignal: TradeSignal;
  walletFingerprint: any; // Using 'any' temporarily - actual type is in wallet-forensics.ts
  dormancyMetrics?: DormancyMetrics; // Optional - dormancy no longer used for signal gating
  timingWindows: TimingWindow[];
  confidenceScore: number;
  timestamp: number;
  sentAt?: number;
}

export type AlertSeverity = 'high' | 'medium' | 'low';

// ============================================================================
// Configuration Types
// ============================================================================

export interface MarketConfig {
  id: string;
  conditionId: string;
  clobTokenIdYes?: string | undefined;
  clobTokenIdNo?: string | undefined;
  question: string;
  slug: string;
  tier: 1 | 2 | 3;
  category: 'politics' | 'corporate' | 'sports' | 'misc';
  enabled: boolean;
  notes?: string;
  openInterest: string;
  volume: string;
}

export interface DetectionThresholds {
  minOiPercentage: number;
  minPriceImpact: number;
  dormantHoursNoLargeTrades: number;
  dormantHoursNoPriceMoves: number;
  dormantLargeTradeThreshold: number;
  dormantPriceMoveThreshold: number;
  minWalletScore: number;
  minConfidenceScore: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage {
  type: 'trade' | 'orderbook' | 'ticker' | 'error';
  data: unknown;
  timestamp: number;
}

export interface WebSocketConfig {
  url: string;
  reconnectDelay: number;
  maxReconnectDelay: number;
  reconnectAttempts: number;
  pingInterval: number;
  pongTimeout: number;
}

// ============================================================================
// Database Models
// ============================================================================

export interface DbMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  openInterest: string;
  volume: string;
  active: boolean;
  closed: boolean;
  category: string | null;
  tier: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbTrade {
  id: string;
  marketId: string;
  side: string;
  size: string;
  price: string;
  timestamp: Date;
  maker: string;
  taker: string;
  outcome: string;
  createdAt: Date;
}

export interface DbWallet {
  address: string;
  fundingSource: string | null;
  transactionCount: number;
  firstTransactionTimestamp: Date | null;
  lastTransactionTimestamp: Date | null;
  netflowToPolymarket: string;
  hasDefiActivity: boolean;
  hasGamingActivity: boolean;
  tokenDiversity: number;
  matchesInsiderProfile: boolean;
  score: number;
  lastAnalyzedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAlert {
  id: string;
  marketId: string;
  walletAddress: string;
  tradeId: string;
  confidenceScore: number;
  alertData: string; // JSON
  sentAt: Date | null;
  createdAt: Date;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
