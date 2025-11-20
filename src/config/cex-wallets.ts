/**
 * Known CEX (Centralized Exchange) Hot Wallet Addresses on Polygon
 *
 * These addresses are used to detect funding sources for insider detection.
 * A wallet funded directly from a CEX in the last 14 days is a strong signal.
 *
 * Sources:
 * - Polygonscan labeled addresses
 * - Public CEX documentation
 * - On-chain analysis
 *
 * Last updated: 2025-01-20
 */

export interface CexWalletAddress {
  address: string;
  exchange: 'coinbase' | 'binance' | 'kraken' | 'gemini' | 'okx' | 'kucoin';
  label: string;
  verified: boolean;
  notes?: string;
}

/**
 * Coinbase hot wallets on Polygon
 */
const COINBASE_WALLETS: CexWalletAddress[] = [
  {
    address: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    exchange: 'coinbase',
    label: 'Coinbase 1',
    verified: true,
  },
  {
    address: '0x46340b20830761efd32832A74d7169B29FEB9758',
    exchange: 'coinbase',
    label: 'Coinbase 2',
    verified: true,
  },
  {
    address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3',
    exchange: 'coinbase',
    label: 'Coinbase 3',
    verified: true,
  },
  {
    address: '0x503828976D22510aad0201ac7EC88293211D23Da',
    exchange: 'coinbase',
    label: 'Coinbase 4',
    verified: true,
  },
  {
    address: '0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740',
    exchange: 'coinbase',
    label: 'Coinbase 5',
    verified: true,
  },
];

/**
 * Binance hot wallets on Polygon
 */
const BINANCE_WALLETS: CexWalletAddress[] = [
  {
    address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    exchange: 'binance',
    label: 'Binance 1',
    verified: true,
  },
  {
    address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    exchange: 'binance',
    label: 'Binance 2',
    verified: true,
  },
  {
    address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40',
    exchange: 'binance',
    label: 'Binance 3',
    verified: true,
  },
  {
    address: '0xE0F0cfDe7Ee664943906f17F7f14342E0a5E5380',
    exchange: 'binance',
    label: 'Binance 4',
    verified: true,
  },
  {
    address: '0x5a52E96BAcdaBb82fd05763E25335261B270Efcb',
    exchange: 'binance',
    label: 'Binance 5',
    verified: true,
  },
];

/**
 * Kraken hot wallets on Polygon
 */
const KRAKEN_WALLETS: CexWalletAddress[] = [
  {
    address: '0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0',
    exchange: 'kraken',
    label: 'Kraken 1',
    verified: true,
  },
  {
    address: '0x53d284357ec70cE289D6D64134DfAc8E511c8a3D',
    exchange: 'kraken',
    label: 'Kraken 2',
    verified: true,
  },
  {
    address: '0x0A869d79a7052C7f1b55a8EbAbbEa3420F0D1E13',
    exchange: 'kraken',
    label: 'Kraken 3',
    verified: true,
  },
];

/**
 * Gemini hot wallets on Polygon
 */
const GEMINI_WALLETS: CexWalletAddress[] = [
  {
    address: '0xd24400ae8BfEBb18cA49Be86258a3C749cf46853',
    exchange: 'gemini',
    label: 'Gemini 1',
    verified: true,
  },
  {
    address: '0x5f65f7b609678448494De4C87521CdF6cEf1e932',
    exchange: 'gemini',
    label: 'Gemini 2',
    verified: true,
  },
];

/**
 * OKX hot wallets on Polygon
 */
const OKX_WALLETS: CexWalletAddress[] = [
  {
    address: '0x461249076B88189f8ac9418de28B365859e46BfD',
    exchange: 'okx',
    label: 'OKX 1',
    verified: true,
  },
  {
    address: '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
    exchange: 'okx',
    label: 'OKX 2',
    verified: true,
  },
  {
    address: '0x98ec059Dc3aDFBdd63429454aEB0c990FBA4A128',
    exchange: 'okx',
    label: 'OKX 3',
    verified: true,
  },
];

/**
 * KuCoin hot wallets on Polygon
 */
const KUCOIN_WALLETS: CexWalletAddress[] = [
  {
    address: '0x689C56AEf474Df92D44A1B70850f808488F9769C',
    exchange: 'kucoin',
    label: 'KuCoin 1',
    verified: true,
  },
  {
    address: '0x2B5634C42055806a59e9107ED44D43c426E58258',
    exchange: 'kucoin',
    label: 'KuCoin 2',
    verified: true,
  },
];

/**
 * All CEX wallets combined
 */
export const ALL_CEX_WALLETS: CexWalletAddress[] = [
  ...COINBASE_WALLETS,
  ...BINANCE_WALLETS,
  ...KRAKEN_WALLETS,
  ...GEMINI_WALLETS,
  ...OKX_WALLETS,
  ...KUCOIN_WALLETS,
];

/**
 * Map of address -> exchange for fast lookups
 */
export const CEX_WALLET_MAP = new Map<string, CexWalletAddress['exchange']>(
  ALL_CEX_WALLETS.map((wallet) => [
    wallet.address.toLowerCase(),
    wallet.exchange,
  ])
);

/**
 * Check if an address is a known CEX wallet
 */
export function isCexWallet(address: string): boolean {
  return CEX_WALLET_MAP.has(address.toLowerCase());
}

/**
 * Get the exchange name for a CEX wallet address
 * Returns undefined if not a known CEX wallet
 */
export function getCexExchange(
  address: string
): CexWalletAddress['exchange'] | undefined {
  return CEX_WALLET_MAP.get(address.toLowerCase());
}

/**
 * Get all wallets for a specific exchange
 */
export function getWalletsByExchange(
  exchange: CexWalletAddress['exchange']
): CexWalletAddress[] {
  return ALL_CEX_WALLETS.filter((wallet) => wallet.exchange === exchange);
}
