/**
 * Production-grade circuit breaker implementation
 */

import { redis } from '../services/cache/redis.js';
import { logger } from './logger.js';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxAttempts: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  consecutiveSuccesses: number;
}

export class CircuitBreakerError extends Error {
  public readonly state: CircuitState;
  public readonly nextRetryTime: number;

  constructor(message: string, state: CircuitState, nextRetryTime: number) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
    this.nextRetryTime = nextRetryTime;
  }
}

export class CircuitBreaker {
  private readonly options: CircuitBreakerOptions;
  private readonly stateKey: string;
  private readonly metricsKey: string;
  // In-memory fallback: last known state survives Redis blips
  private lastKnownState: CircuitBreakerState | null = null;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    this.stateKey = `circuit:${options.name}:state`;
    this.metricsKey = `circuit:${options.name}:metrics`;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    // Check if circuit is open
    if (state.state === 'open') {
      const now = Date.now();
      const timeSinceLastFailure = now - (state.lastFailureTime || 0);

      // Check if we should transition to half-open
      if (timeSinceLastFailure >= this.options.recoveryTimeout) {
        await this.transitionToHalfOpen();
      } else {
        const nextRetryTime =
          (state.lastFailureTime || 0) + this.options.recoveryTimeout;
        throw new CircuitBreakerError(
          `Circuit breaker is open for ${this.options.name}`,
          'open',
          nextRetryTime
        );
      }
    }

    // Check if we're in half-open state
    if (
      state.state === 'half-open' &&
      state.consecutiveSuccesses >= this.options.halfOpenMaxAttempts
    ) {
      await this.transitionToClosed();
    }

    try {
      // Execute the function
      const result = await fn();

      // Record success
      await this.recordSuccess();

      return result;
    } catch (error) {
      // Record failure
      await this.recordFailure();

      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  async getState(): Promise<CircuitBreakerState> {
    const defaultState: CircuitBreakerState = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      consecutiveSuccesses: 0,
    };

    try {
      const cached = await redis.get(this.stateKey);

      if (cached) {
        const state = JSON.parse(cached) as CircuitBreakerState;
        this.lastKnownState = state;
        return state;
      }

      // No state in Redis — use default
      this.lastKnownState = defaultState;
      return defaultState;
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to get circuit breaker state from Redis'
      );

      // Fail-safe: return last known state if available (preserves open circuits)
      if (this.lastKnownState !== null) {
        logger.warn(
          { circuitName: this.options.name, state: this.lastKnownState.state },
          'Using last known circuit breaker state (Redis unavailable)'
        );
        return this.lastKnownState;
      }

      return defaultState;
    }
  }

  /**
   * Record a successful operation
   */
  private async recordSuccess(): Promise<void> {
    try {
      const state = await this.getState();

      state.successes++;
      state.consecutiveSuccesses++;

      // If in half-open state and we've had enough successes, close the circuit
      if (
        state.state === 'half-open' &&
        state.consecutiveSuccesses >= this.options.halfOpenMaxAttempts
      ) {
        await this.transitionToClosed();
        return;
      }

      await this.setState(state);
      await this.recordMetric('success');
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to record success'
      );
    }
  }

  /**
   * Record a failed operation
   */
  private async recordFailure(): Promise<void> {
    try {
      const state = await this.getState();
      const now = Date.now();

      state.failures++;
      state.lastFailureTime = now;
      state.consecutiveSuccesses = 0;

      // Check if we've hit the failure threshold within the monitoring period
      const recentFailures = await this.getRecentFailures();

      if (
        state.state !== 'open' &&
        recentFailures >= this.options.failureThreshold
      ) {
        await this.transitionToOpen();
        return;
      }

      await this.setState(state);
      await this.recordMetric('failure');
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to record failure'
      );
    }
  }

  /**
   * Get count of recent failures within monitoring period
   */
  private async getRecentFailures(): Promise<number> {
    try {
      const now = Date.now();
      const windowStart = now - this.options.monitoringPeriod;

      // Get failure timestamps from Redis sorted set
      const failureKey = `${this.metricsKey}:failures`;

      // Remove old entries and count recent ones
      await redis
        .getClient()
        .zremrangebyscore(failureKey, '-inf', windowStart.toString());
      const count = await redis
        .getClient()
        .zcount(failureKey, windowStart.toString(), '+inf');

      return count;
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to get recent failures'
      );
      return 0;
    }
  }

  /**
   * Record a metric event
   */
  private async recordMetric(type: 'success' | 'failure'): Promise<void> {
    try {
      const now = Date.now();
      const key = `${this.metricsKey}:${type}es`;

      // Add to sorted set with timestamp as score
      await redis.getClient().zadd(key, now, `${now}:${type}`);

      // Set expiration
      await redis.getClient().expire(key, 86400); // 24 hours
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name, metricType: type },
        'Failed to record metric'
      );
    }
  }

  /**
   * Transition to open state
   */
  private async transitionToOpen(): Promise<void> {
    const state = await this.getState();

    state.state = 'open';
    state.lastStateChange = Date.now();
    state.consecutiveSuccesses = 0;

    await this.setState(state);

    logger.warn(
      {
        circuitName: this.options.name,
        failures: state.failures,
        threshold: this.options.failureThreshold,
      },
      'Circuit breaker opened'
    );
  }

  /**
   * Transition to half-open state
   */
  private async transitionToHalfOpen(): Promise<void> {
    const state = await this.getState();

    state.state = 'half-open';
    state.lastStateChange = Date.now();
    state.consecutiveSuccesses = 0;

    await this.setState(state);

    logger.info(
      { circuitName: this.options.name },
      'Circuit breaker transitioned to half-open'
    );
  }

  /**
   * Transition to closed state
   */
  private async transitionToClosed(): Promise<void> {
    const state = await this.getState();

    state.state = 'closed';
    state.lastStateChange = Date.now();
    state.failures = 0;
    state.successes = 0;
    state.consecutiveSuccesses = 0;

    await this.setState(state);

    logger.info({ circuitName: this.options.name }, 'Circuit breaker closed');
  }

  /**
   * Set circuit state in Redis
   */
  private async setState(state: CircuitBreakerState): Promise<void> {
    try {
      await redis.set(this.stateKey, JSON.stringify(state), 86400); // 24 hour TTL
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to set circuit breaker state'
      );
    }
  }

  /**
   * Get circuit breaker statistics
   */
  async getStats(): Promise<{
    state: CircuitBreakerState;
    recentFailures: number;
    recentSuccesses: number;
  }> {
    const state = await this.getState();
    const now = Date.now();
    const windowStart = now - this.options.monitoringPeriod;

    try {
      const failures = await redis
        .getClient()
        .zcount(`${this.metricsKey}:failures`, windowStart.toString(), '+inf');

      const successes = await redis
        .getClient()
        .zcount(`${this.metricsKey}:successes`, windowStart.toString(), '+inf');

      return {
        state,
        recentFailures: failures,
        recentSuccesses: successes,
      };
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to get circuit breaker stats'
      );

      return {
        state,
        recentFailures: 0,
        recentSuccesses: 0,
      };
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  async reset(): Promise<void> {
    await this.transitionToClosed();

    // Clear metrics
    try {
      await redis
        .getClient()
        .del(`${this.metricsKey}:failures`, `${this.metricsKey}:successes`);
    } catch (error) {
      logger.error(
        { error, circuitName: this.options.name },
        'Failed to clear circuit breaker metrics'
      );
    }
  }
}

// Circuit breaker instances for different services
export const circuitBreakers = {
  dataApi: new CircuitBreaker({
    name: 'polymarket-data-api',
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    halfOpenMaxAttempts: 3,
  }),

  subgraph: new CircuitBreaker({
    name: 'polymarket-subgraph',
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    halfOpenMaxAttempts: 3,
  }),

  alchemy: new CircuitBreaker({
    name: 'alchemy-api',
    failureThreshold: 3,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    halfOpenMaxAttempts: 2,
  }),
};
