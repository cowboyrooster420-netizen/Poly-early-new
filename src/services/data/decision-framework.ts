/**
 * Decision framework for explicit error handling
 * Replaces silent failures with clear decision logic
 */

import { logger } from '../../utils/logger.js';
import { getThresholds } from '../../config/thresholds.js';

/**
 * Decision result with explicit action and reasoning
 */
export interface DecisionResult<T = unknown> {
  action: 'proceed' | 'skip' | 'retry' | 'abort';
  data?: T;
  reason: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  context: Record<string, unknown>;
  shouldLog: boolean;
  metrics?: string[]; // Metrics to increment
}

/**
 * Error classification for decision making
 */
export interface ErrorClassification {
  category:
    | 'network'
    | 'data_quality'
    | 'permission'
    | 'rate_limit'
    | 'unknown';
  isRetryable: boolean;
  isSystemIssue: boolean;
  expectedFrequency: 'rare' | 'occasional' | 'frequent';
}

/**
 * Framework for making explicit decisions on errors
 */
export class DecisionFramework {
  /**
   * Decide how to handle proxy resolution failures
   */
  static handleProxyResolutionError(
    error: unknown,
    context: {
      proxyAddress: string;
      tradeId: string;
      marketId: string;
    }
  ): DecisionResult {
    const classification = this.classifyError(error);

    // 404 errors are expected for direct EOAs
    if (this.is404Error(error)) {
      return {
        action: 'proceed',
        reason: 'No proxy mapping found - likely a direct EOA trade',
        severity: 'info',
        context,
        shouldLog: false,
        metrics: ['proxy_resolution_404'],
      };
    }

    // GraphQL errors indicate system issues
    if (this.isGraphQLError(error)) {
      const thresholds = getThresholds();

      if (thresholds.skipTradesOnProxyError) {
        return {
          action: 'skip',
          reason: 'GraphQL error during proxy resolution - configured to skip',
          severity: 'error',
          context: { ...context, error: String(error) },
          shouldLog: true,
          metrics: [
            'proxy_resolution_graphql_error',
            'trades_skipped_proxy_error',
          ],
        };
      }

      return {
        action: 'proceed',
        reason:
          'GraphQL error but configured to proceed - wallet analysis may be incorrect',
        severity: 'warning',
        context: { ...context, error: String(error) },
        shouldLog: true,
        metrics: [
          'proxy_resolution_graphql_error',
          'trades_processed_with_proxy_error',
        ],
      };
    }

    // Network/timeout errors
    if (classification.category === 'network' && classification.isRetryable) {
      return {
        action: 'retry',
        reason: 'Network error during proxy resolution',
        severity: 'warning',
        context: {
          ...context,
          error: String(error),
          errorCategory: classification.category,
        },
        shouldLog: true,
        metrics: ['proxy_resolution_network_error'],
      };
    }

    // Unknown errors - proceed with caution
    return {
      action: 'proceed',
      reason:
        'Unknown error during proxy resolution - proceeding with original address',
      severity: 'error',
      context: {
        ...context,
        error: String(error),
        errorType: error?.constructor?.name,
        classification,
      },
      shouldLog: true,
      metrics: ['proxy_resolution_unknown_error'],
    };
  }

  /**
   * Decide how to handle wallet analysis failures
   */
  static handleWalletAnalysisError(
    error: unknown,
    context: {
      address: string;
      tradeId?: string;
      dataSource: 'subgraph' | 'data-api' | 'both';
    }
  ): DecisionResult {
    const classification = this.classifyError(error);

    // Rate limit errors - definitely retry
    if (classification.category === 'rate_limit') {
      return {
        action: 'retry',
        reason: 'Rate limited by API',
        severity: 'warning',
        context: { ...context, error: String(error) },
        shouldLog: true,
        metrics: [`wallet_analysis_rate_limited_${context.dataSource}`],
      };
    }

    // Both APIs failed - this is critical
    if (context.dataSource === 'both') {
      return {
        action: 'skip',
        reason: 'Both wallet analysis APIs failed - cannot proceed safely',
        severity: 'critical',
        context: { ...context, error: String(error) },
        shouldLog: true,
        metrics: ['wallet_analysis_total_failure'],
      };
    }

    // Single API failed but we have fallback
    return {
      action: 'proceed',
      reason: `${context.dataSource} API failed but fallback available`,
      severity: 'warning',
      context: { ...context, error: String(error), classification },
      shouldLog: true,
      metrics: [`wallet_analysis_partial_failure_${context.dataSource}`],
    };
  }

  /**
   * Decide how to handle market data failures
   */
  static handleMarketDataError(
    error: unknown,
    context: {
      marketId: string;
      dataType: 'orderbook' | 'trades' | 'info';
      source: 'cache' | 'api';
    }
  ): DecisionResult<{ fallbackValue?: unknown }> {
    const classification = this.classifyError(error);

    // Cache failures are non-critical
    if (context.source === 'cache') {
      return {
        action: 'proceed',
        reason: 'Cache failure - will fetch from API',
        severity: 'info',
        context: { ...context, error: String(error) },
        shouldLog: false,
        metrics: [`market_data_cache_miss_${context.dataType}`],
      };
    }

    // Critical data missing
    if (context.dataType === 'info' && context.source === 'api') {
      return {
        action: 'abort',
        reason: 'Market info not available - cannot process trade',
        severity: 'error',
        context: { ...context, error: String(error) },
        shouldLog: true,
        metrics: ['market_info_not_found'],
      };
    }

    // Non-critical data with fallbacks
    const fallbacks = {
      orderbook: { bids: [], asks: [] },
      trades: [],
    };

    return {
      action: 'proceed',
      data: {
        fallbackValue: fallbacks[context.dataType as keyof typeof fallbacks],
      },
      reason: `${context.dataType} data unavailable - using fallback`,
      severity: 'warning',
      context: { ...context, error: String(error), classification },
      shouldLog: true,
      metrics: [`market_data_fallback_${context.dataType}`],
    };
  }

  /**
   * Execute decision and handle logging/metrics
   */
  static async executeDecision<T>(
    decision: DecisionResult<T>,
    handlers: {
      onProceed?: (data?: T) => Promise<void> | void;
      onSkip?: () => Promise<void> | void;
      onRetry?: () => Promise<void> | void;
      onAbort?: () => Promise<void> | void;
    }
  ): Promise<void> {
    // Log if required
    if (decision.shouldLog) {
      const logData = {
        action: decision.action,
        reason: decision.reason,
        ...decision.context,
      };

      switch (decision.severity) {
        case 'info':
          logger.info(logData, decision.reason);
          break;
        case 'warning':
          logger.warn(logData, decision.reason);
          break;
        case 'error':
          logger.error(logData, decision.reason);
          break;
        case 'critical':
          logger.error(logData, `🚨 CRITICAL: ${decision.reason}`);
          break;
      }
    }

    // Track metrics
    if (decision.metrics) {
      // Import dynamically to avoid circular dependency
      const { signalDetector } = await import('../signals/signal-detector.js');
      for (const metric of decision.metrics) {
        await signalDetector.incrementStat(metric);
      }
    }

    // Execute appropriate handler
    switch (decision.action) {
      case 'proceed':
        await handlers.onProceed?.(decision.data);
        break;
      case 'skip':
        await handlers.onSkip?.();
        break;
      case 'retry':
        await handlers.onRetry?.();
        break;
      case 'abort':
        await handlers.onAbort?.();
        break;
    }
  }

  /**
   * Classify error type for decision making
   */
  private static classifyError(error: unknown): ErrorClassification {
    const errorStr = String(error);
    const errorObj = error as any;

    // Network errors
    if (
      errorStr.includes('ECONNREFUSED') ||
      errorStr.includes('ETIMEDOUT') ||
      errorStr.includes('ENOTFOUND') ||
      errorObj?.code === 'ECONNRESET'
    ) {
      return {
        category: 'network',
        isRetryable: true,
        isSystemIssue: false,
        expectedFrequency: 'occasional',
      };
    }

    // Rate limiting
    if (
      errorObj?.response?.status === 429 ||
      errorStr.includes('rate limit') ||
      errorStr.includes('Too many requests')
    ) {
      return {
        category: 'rate_limit',
        isRetryable: true,
        isSystemIssue: false,
        expectedFrequency: 'occasional',
      };
    }

    // Permission/auth errors
    if (
      errorObj?.response?.status === 401 ||
      errorObj?.response?.status === 403
    ) {
      return {
        category: 'permission',
        isRetryable: false,
        isSystemIssue: true,
        expectedFrequency: 'rare',
      };
    }

    // Data quality issues
    if (
      errorStr.includes('Invalid') ||
      errorStr.includes('Malformed') ||
      errorStr.includes('GraphQL')
    ) {
      return {
        category: 'data_quality',
        isRetryable: false,
        isSystemIssue: true,
        expectedFrequency: 'rare',
      };
    }

    // Default unknown
    return {
      category: 'unknown',
      isRetryable: false,
      isSystemIssue: false,
      expectedFrequency: 'rare',
    };
  }

  /**
   * Check if error is a 404
   */
  private static is404Error(error: unknown): boolean {
    const errorObj = error as any;
    return (
      errorObj?.response?.status === 404 ||
      errorObj?.status === 404 ||
      String(error).includes('404')
    );
  }

  /**
   * Check if error is GraphQL related
   */
  private static isGraphQLError(error: unknown): boolean {
    const errorStr = String(error);
    return (
      errorStr.includes('GraphQL') ||
      errorStr.includes('graphql') ||
      (error as any)?.response?.data?.errors !== undefined
    );
  }
}

/**
 * Create a decision wrapper for async operations
 */
export function withDecision<T>(
  operation: () => Promise<T>,
  errorHandler: (error: unknown) => DecisionResult,
  options: {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<T | null> {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  let attempts = 0;

  const execute = async (): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      const decision = errorHandler(error);

      let result: T | null = null;

      await DecisionFramework.executeDecision(decision, {
        onProceed: (data) => {
          result = (data as any) ?? null;
        },
        onRetry: async () => {
          if (attempts < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelay * attempts)
            );
            result = await execute();
          } else {
            logger.warn({ attempts, maxRetries }, 'Max retries reached');
            result = null;
          }
        },
        onSkip: () => {
          result = null;
        },
        onAbort: () => {
          throw new Error(decision.reason);
        },
      });

      return result;
    }
  };

  return execute();
}
