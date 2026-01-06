/**
 * Unified decimal handling utilities for Polymarket amounts
 *
 * Polymarket uses different decimal representations:
 * - USDC/USD amounts: 6 decimals (1 USDC = 1000000 units)
 * - Outcome token amounts: 6 decimals
 * - Prices: Already in decimal format (0.0 - 1.0)
 * - Data API: Returns amounts in actual units (not scaled)
 * - Subgraph: Returns amounts as strings with full precision
 */

const USDC_DECIMALS = 6;
const OUTCOME_DECIMALS = 6;
const USDC_DIVISOR = Math.pow(10, USDC_DECIMALS);

/**
 * Convert raw USDC amount (with 6 decimals) to human-readable USD value
 * @param rawAmount - Raw amount string or number from subgraph/contract
 * @returns USD value as number
 */
export function usdcToUsd(
  rawAmount: string | number | null | undefined
): number {
  if (!rawAmount) return 0;
  const amount =
    typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
  if (isNaN(amount)) return 0;
  return amount / USDC_DIVISOR;
}

/**
 * Convert outcome token amount (with 6 decimals) to human-readable value
 * @param rawAmount - Raw outcome token amount
 * @returns Token amount as number
 */
export function outcomeToHuman(
  rawAmount: string | number | null | undefined
): number {
  if (!rawAmount) return 0;
  const amount =
    typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
  if (isNaN(amount)) return 0;
  return amount / Math.pow(10, OUTCOME_DECIMALS);
}

/**
 * Calculate USD value from outcome token amount and price
 * @param outcomeAmount - Outcome token amount (already human-readable)
 * @param price - Price per token (0.0 - 1.0)
 * @returns USD value
 */
export function calculateUsdValue(
  outcomeAmount: number,
  price: number
): number {
  return outcomeAmount * price;
}

/**
 * Normalize volume from different data sources
 * @param volume - Volume from data source
 * @param source - Source of the data
 * @returns Normalized USD volume
 */
export function normalizeVolume(
  volume: string | number | null | undefined,
  source: 'subgraph' | 'data-api' | 'websocket'
): number {
  if (!volume) return 0;

  const rawValue = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (isNaN(rawValue)) return 0;

  switch (source) {
    case 'subgraph':
      // Subgraph amounts are already in USD (converted by subgraph-client)
      return rawValue;
    case 'data-api':
      // Data API returns actual USD values
      return rawValue;
    case 'websocket':
      // WebSocket sends human-readable values
      return rawValue;
    default:
      return rawValue;
  }
}

/**
 * Format USD value for display
 * @param usdValue - USD value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string
 */
export function formatUsd(usdValue: number, decimals: number = 2): string {
  return `$${usdValue.toFixed(decimals)}`;
}

/**
 * Safe parse float with fallback
 * @param value - Value to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed number
 */
export function safeParseFloat(
  value: string | number | null | undefined,
  fallback: number = 0
): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}
