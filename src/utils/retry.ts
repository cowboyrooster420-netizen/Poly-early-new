/**
 * Production-grade retry logic with exponential backoff
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeout?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  timeout: 10000,
};

export class RetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;
  public readonly errors: Error[];

  constructor(message: string, attempts: number, errors: Error[]) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.errors = errors;
    this.lastError = errors[errors.length - 1]!;
  }
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: Error, retryableErrors?: string[]): boolean {
  // Always retry network errors
  if (error.message.includes('ECONNREFUSED') || 
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('socket hang up') ||
      error.message.includes('network')) {
    return true;
  }

  // Check status codes for HTTP errors
  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    const response = error.response as { status?: number };
    const status = response.status;
    
    // Retry on 5xx errors and specific 4xx errors
    if (status && (status >= 500 || status === 429 || status === 408)) {
      return true;
    }
    
    // Don't retry on 404 or other 4xx errors
    if (status && status >= 400 && status < 500) {
      return false;
    }
  }

  // Check custom retryable errors
  if (retryableErrors && retryableErrors.length > 0) {
    return retryableErrors.some(msg => error.message.includes(msg));
  }

  // Default to retrying unknown errors
  return true;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number, 
  initialDelayMs: number, 
  maxDelayMs: number, 
  backoffMultiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const clampedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = clampedDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.round(clampedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: string
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const errors: Error[] = [];
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Create a timeout wrapper if timeout is specified
      if (opts.timeout) {
        return await withTimeout(fn(), opts.timeout, `Operation timed out after ${opts.timeout}ms`);
      } else {
        return await fn();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      
      // Log the error
      logger.warn(
        {
          error: err.message,
          attempt,
          maxAttempts: opts.maxAttempts,
          context,
        },
        `Retry attempt ${attempt} failed`
      );
      
      // Check if we should retry
      if (attempt >= opts.maxAttempts || !isRetryableError(err, opts.retryableErrors)) {
        throw new RetryError(
          `Operation failed after ${attempt} attempts: ${err.message}`,
          attempt,
          errors
        );
      }
      
      // Calculate delay
      const delay = calculateDelay(attempt, opts.initialDelayMs, opts.maxDelayMs, opts.backoffMultiplier);
      
      logger.debug(
        {
          attempt,
          nextAttemptIn: delay,
          context,
        },
        `Retrying after ${delay}ms`
      );
      
      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(err, attempt);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new RetryError(
    `Operation failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    errors
  );
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutError));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Retry with specific options for API calls
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  return retry(fn, {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    timeout: 15000,
    retryableErrors: ['rate limit', 'too many requests'],
  }, context);
}

/**
 * Retry with specific options for database operations
 */
export async function retryDbOperation<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  return retry(fn, {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    timeout: 5000,
    retryableErrors: ['deadlock', 'connection', 'timeout'],
  }, context);
}