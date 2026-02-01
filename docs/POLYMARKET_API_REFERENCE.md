# Polymarket API Reference

> Compiled reference for Polymarket APIs. Official docs: https://docs.polymarket.com

---

## Table of Contents

1. [API Base URLs](#api-base-urls)
2. [Rate Limits](#rate-limits)
3. [Data API](#data-api)
4. [Gamma API](#gamma-api)
5. [CLOB API](#clob-api)
6. [WebSocket APIs](#websocket-apis)
7. [Subgraph](#subgraph)
8. [Proxy Wallets](#proxy-wallets)
9. [Data Models](#data-models)

---

## API Base URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **CLOB API** | `https://clob.polymarket.com` | Order management, prices, orderbooks |
| **Gamma API** | `https://gamma-api.polymarket.com` | Market discovery, metadata, events |
| **Data API** | `https://data-api.polymarket.com` | User positions, activity, history |
| **CLOB WebSocket** | `wss://ws-subscriptions-clob.polymarket.com/ws/` | Orderbook updates, order status |
| **RTDS WebSocket** | `wss://ws-live-data.polymarket.com` | Low-latency crypto prices, comments |

---

## Rate Limits

Polymarket uses Cloudflare throttling. Requests over the limit are **delayed/queued** rather than dropped.

### Data API
| Endpoint | Limit |
|----------|-------|
| General queries | 1,000 req/10s |
| `/trades` | 200 req/10s |
| `/positions` | 150 req/10s |
| `/closed-positions` | 150 req/10s |

### Gamma API
| Endpoint | Limit |
|----------|-------|
| General | 4,000 req/10s |
| `/events` | 500 req/10s |
| `/markets` | 300 req/10s |
| Search | 350 req/10s |

### CLOB API
| Endpoint | Limit |
|----------|-------|
| General | 9,000 req/10s |
| `/book`, `/price`, `/midprice` | 1,500 req/10s |
| `/books`, `/prices` (bulk) | 500 req/10s |
| `POST /order` | 3,500 req/10s burst, 60/s sustained |

### Other
| Service | Limit |
|---------|-------|
| Health check | 100 req/10s |
| RELAYER | 25 req/min |
| User PNL | 200 req/10s |

---

## Data API

Base URL: `https://data-api.polymarket.com`

### GET /trades

Get trades for a user or markets.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user` | string | - | Wallet address (0x-prefixed) |
| `market` | array | - | Comma-separated condition IDs |
| `eventId` | array | - | Comma-separated event IDs (mutually exclusive with market) |
| `limit` | integer | 100 | Results per page (max 10,000) |
| `offset` | integer | 0 | Pagination offset |
| `takerOnly` | boolean | true | Filter taker-only trades |
| `filterType` | string | - | `CASH` or `TOKENS` (requires filterAmount) |
| `filterAmount` | number | - | Filter threshold |
| `side` | string | - | `BUY` or `SELL` |

**Response Fields:**
- `proxyWallet` - User's proxy wallet address
- `side` - BUY or SELL
- `asset` - Token ID
- `conditionId` - Market condition ID
- `size` - Trade size
- `price` - Execution price
- `timestamp` - Unix timestamp
- `title` - Market title
- `slug` - Market slug
- `outcome` - Outcome name (Yes/No)
- `outcomeIndex` - 0 or 1
- `transactionHash` - On-chain tx hash
- `name`, `pseudonym` - Trader profile info

---

### GET /positions

Get current positions for a user.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | string | Wallet address (0x-prefixed, 40 hex chars) |

**Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `market` | array | - | Comma-separated condition IDs |
| `eventId` | array | - | Comma-separated event IDs |
| `sizeThreshold` | number | 1 | Minimum position size |
| `redeemable` | boolean | false | Filter redeemable positions |
| `mergeable` | boolean | false | Filter mergeable positions |
| `limit` | integer | 100 | Max 500 |
| `offset` | integer | 0 | Max 10,000 |
| `sortBy` | string | TOKENS | CURRENT, INITIAL, TOKENS, CASHPNL, PERCENTPNL, TITLE, RESOLVING, PRICE, AVGPRICE |
| `sortDirection` | string | DESC | ASC or DESC |
| `title` | string | - | Search term (max 100 chars) |

**Response Fields:**
- `proxyWallet` - Proxy wallet address
- `asset` - Token ID
- `conditionId` - Market condition ID
- `size` - Position size
- `avgPrice` - Average entry price
- `initialValue` - Initial USD value
- `currentValue` - Current USD value
- `cashPnl` - Realized + unrealized PnL
- `percentPnl` - Percentage PnL
- `totalBought` - Total tokens bought
- `realizedPnl` - Realized PnL
- `curPrice` - Current market price
- `redeemable` - Can be redeemed
- `mergeable` - Can be merged
- `title`, `slug` - Market info
- `outcome`, `outcomeIndex` - Position outcome
- `endDate` - Market end date
- `negativeRisk` - Neg-risk market flag

---

### GET /activity

Get on-chain activity (trades, splits, merges, redeems, rewards, conversions).

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | string | Wallet address |

**Optional Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | `TRADE`, `SPLIT`, `MERGE`, `REDEEM`, `REWARD`, `CONVERSION` |
| `start` | integer | Start timestamp (seconds) |
| `end` | integer | End timestamp (seconds) |
| `market` | array | Comma-separated condition IDs |
| `sortBy` | string | `TIMESTAMP`, `TOKENS`, `CASH` |

**Response Fields:**
- Activity type, size, USD value, price, asset details, transaction hash

---

### GET /holders

Get top position holders for a market.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `market` | string | required | Market condition ID |
| `limit` | integer | 100 | Max holders to return |

**Response Fields:**
- `tokenId` - Token ID
- `holder` - Wallet address
- `pseudonym` - Display name
- `amount` - Position amount
- `outcomeIndex` - 0 or 1
- Profile details

---

### GET /value

Get total USD value of user's positions.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | string | required - Wallet address |
| `market` | array | optional - Filter by condition IDs |

**Response:**
```json
{
  "user": "0x...",
  "value": 12345.67
}
```

---

## Gamma API

Base URL: `https://gamma-api.polymarket.com`

Gamma is Polymarket's hosted indexing service providing market metadata and discovery.

### GET /events

List all events.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `active` | boolean | Filter active events |
| `closed` | boolean | Filter closed events |
| `tag` | string | Filter by tag slug |

---

### GET /events/{id}

Get event by ID.

---

### GET /events/slug/{slug}

Get event by slug.

**Response Structure:**
```json
{
  "id": "event-id",
  "slug": "event-slug",
  "title": "Event Title",
  "markets": [
    {
      "id": "market-id",
      "question": "Market question?",
      "conditionId": "0x...",
      "slug": "market-slug",
      "outcomes": "[\"Yes\",\"No\"]",
      "outcomePrices": "[\"0.65\",\"0.35\"]",
      "liquidity": "125000.00",
      "volume": "500000.00",
      "active": true,
      "closed": false
    }
  ]
}
```

---

### GET /markets

List all markets.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `active` | boolean | Filter active markets |
| `closed` | boolean | Filter closed markets |

---

### GET /markets/{id}

Get market by ID (condition ID).

---

### Gamma Data Structure

**Event** - Container for related markets
- Single Market Pool (SMP): One market per event
- Grouped Market Pool (GMP): Multiple markets per event

**Market** - Fundamental trading unit
- Maps to: clob token IDs, market addresses, question IDs, condition IDs
- Contains: question, outcomes, prices, liquidity, volume, status

---

## CLOB API

Base URL: `https://clob.polymarket.com`

The Central Limit Order Book (CLOB) is hybrid-decentralized with off-chain matching and on-chain settlement.

### Public Endpoints (No Auth Required)

#### GET /price
Get current price for a token.

#### GET /prices
Get prices for multiple tokens.

#### GET /book
Get orderbook for a market.

#### GET /books
Get orderbooks for multiple markets.

#### GET /midpoint
Get midpoint price.

---

### Authenticated Endpoints (L2 Header Required)

#### GET /data/trades

Get trades for authenticated user.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Specific trade ID |
| `taker` | string | Filter by taker address |
| `maker` | string | Filter by maker address |
| `market` | string | Condition ID |
| `before` | integer | Unix timestamp upper bound |
| `after` | integer | Unix timestamp lower bound |

**Response Fields:**
- `id` - Trade ID
- `taker_order_id` - Taker order ID
- `market` - Condition ID
- `asset_id` - Token ID
- `side` - BUY or SELL
- `size` - Trade size
- `price` - Execution price
- `fee_rate_bps` - Fee rate in basis points
- `status` - Trade status
- `match_time` - Match timestamp
- `maker_orders` - Array of matched maker orders

---

#### POST /order
Create a new order. Requires EIP712 signature.

#### DELETE /order
Cancel an order.

---

### Fee Structure

Current fees: **0 basis points** for both maker and taker.

Fee calculation (when applicable):
- Selling: `feeQuote = baseRate * min(price, 1 - price) * size`
- Buying: `feeBase = baseRate * min(price, 1 - price) * size / price`

---

## WebSocket APIs

### CLOB WebSocket

URL: `wss://ws-subscriptions-clob.polymarket.com/ws/`

#### Channels
- `market` - Public orderbook/price updates
- `user` - Authenticated user order updates

#### Subscription Message
```json
{
  "auth": { /* auth credentials */ },
  "markets": ["condition-id-1", "condition-id-2"],
  "assets_ids": ["token-id-1", "token-id-2"],
  "type": "market",
  "custom_feature_enabled": true
}
```

#### Dynamic Subscribe/Unsubscribe
```json
{
  "assets_ids": ["new-token-id"],
  "operation": "subscribe"
}
```

#### Market Channel Message Types

**book** - Orderbook snapshot
```json
{
  "event_type": "book",
  "asset_id": "token-id",
  "market": "condition-id",
  "timestamp": 1234567890,
  "hash": "orderbook-hash",
  "bids": [{"price": "0.65", "size": "1000"}],
  "asks": [{"price": "0.66", "size": "500"}]
}
```

**price_change** - Price level updates
```json
{
  "market": "condition-id",
  "price_changes": [
    {"price": "0.65", "side": "BUY", "size": "1500"}
  ],
  "timestamp": 1234567890
}
```

**last_trade_price** - Trade execution
```json
{
  "event_type": "last_trade_price",
  "asset_id": "token-id",
  "market": "condition-id",
  "price": "0.65",
  "side": "BUY",
  "size": "100",
  "timestamp": 1234567890
}
```

**tick_size_change** - Tick size adjustment (at price extremes)
```json
{
  "event_type": "tick_size_change",
  "asset_id": "token-id",
  "market": "condition-id",
  "old_tick_size": "0.01",
  "new_tick_size": "0.001",
  "timestamp": 1234567890
}
```

**best_bid_ask** - Best bid/ask updates (requires `custom_feature_enabled`)
```json
{
  "event_type": "best_bid_ask",
  "market": "condition-id",
  "asset_id": "token-id",
  "best_bid": "0.65",
  "best_ask": "0.66",
  "spread": "0.01",
  "timestamp": 1234567890
}
```

**new_market** / **market_resolved** - Market lifecycle events

---

### RTDS WebSocket

URL: `wss://ws-live-data.polymarket.com`

Provides:
- Low-latency crypto price feeds
- Comment streams

---

## Subgraph

Polymarket provides a GraphQL subgraph for on-chain data queries.

**Data Available:**
- Trading volume metrics
- User position data
- Market information
- Liquidity analytics
- Activity history
- Proxy wallet mappings

**Resources:**
- The Graph Explorer: Search for "Polymarket"
- Schema: See `schema.graphql` in Polymarket's GitHub repo

**Example Query - Get Proxy Signer:**
```graphql
query GetSignerFromProxy($proxyAddress: String!) {
  proxyWalletMappings(where: { proxyAddress: $proxyAddress }) {
    id
    proxyAddress
    signerAddress
    createdAt
  }
}
```

**Note:** The subgraph has strict rate limits (~10-20 req/min). Prefer Data API for user queries.

---

## Proxy Wallets

Polymarket deploys individual proxy wallets for each user upon account creation.

### Architecture
- 1-of-1 multisig smart contracts on Polygon
- User's EOA (Externally Owned Account) controls the proxy
- All user assets (ERC1155 positions, USDC) reside in proxy wallet

### Benefits
- Atomic execution of multi-step transactions
- Gas relay through relayer networks
- Improved UX for trading

### Factory Contracts (Polygon)

| Factory | Address | Purpose |
|---------|---------|---------|
| Gnosis Safe | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` | MetaMask users |
| Polymarket Proxy | `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` | MagicLink users |

### Resolving Proxy → Signer

Use the subgraph to map proxy wallet addresses to their controlling EOA (signer).

---

## Data Models

### Trade Object
```typescript
interface Trade {
  proxyWallet: string;      // User's proxy wallet
  side: 'BUY' | 'SELL';
  asset: string;            // Token ID
  conditionId: string;      // Market condition ID
  size: string;             // Trade size
  price: string;            // Execution price (0-1)
  timestamp: number;        // Unix timestamp
  title: string;            // Market title
  slug: string;             // Market slug
  outcome: string;          // "Yes" or "No"
  outcomeIndex: number;     // 0 or 1
  transactionHash: string;  // On-chain tx hash
  name?: string;            // Trader name
  pseudonym?: string;       // Trader pseudonym
}
```

### Position Object
```typescript
interface Position {
  proxyWallet: string;
  asset: string;            // Token ID
  conditionId: string;
  size: string;             // Position size
  avgPrice: string;         // Average entry price
  initialValue: string;     // Initial USD value
  currentValue: string;     // Current USD value
  cashPnl: string;          // Cash PnL
  percentPnl: string;       // Percentage PnL
  realizedPnl: string;
  curPrice: string;         // Current market price
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  outcome: string;
  outcomeIndex: number;
  endDate?: string;
  negativeRisk: boolean;
}
```

### Market Object (Gamma)
```typescript
interface GammaMarket {
  id: string;               // Market/condition ID
  question: string;         // Market question
  conditionId: string;
  slug: string;
  outcomes: string;         // JSON array: '["Yes","No"]'
  outcomePrices: string;    // JSON array: '["0.65","0.35"]'
  liquidity: string;        // Total liquidity USD
  volume: string;           // Total volume USD
  active: boolean;
  closed: boolean;
}
```

### Event Object (Gamma)
```typescript
interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  markets: GammaMarket[];
}
```

---

## Common Patterns

### Fetch Market by Slug
```typescript
const response = await axios.get(
  `https://gamma-api.polymarket.com/events/slug/${slug}`
);
const event = response.data;
const markets = event.markets;
```

### Get User's Recent Trades
```typescript
const response = await axios.get(
  `https://data-api.polymarket.com/trades`,
  {
    params: {
      user: walletAddress,
      limit: 100,
      takerOnly: true
    }
  }
);
```

### Get User's Positions
```typescript
const response = await axios.get(
  `https://data-api.polymarket.com/positions`,
  {
    params: {
      user: walletAddress,
      sizeThreshold: 0
    }
  }
);
```

### Subscribe to Market Updates (WebSocket)
```typescript
const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/');

ws.onopen = () => {
  ws.send(JSON.stringify({
    assets_ids: [tokenId],
    type: 'market'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.event_type === 'last_trade_price') {
    console.log('Trade:', data.price, data.size, data.side);
  }
};
```

---

## Resources

- **Official Docs:** https://docs.polymarket.com
- **Full Sitemap:** https://docs.polymarket.com/llms.txt
- **Discord:** https://discord.gg/polymarket
- **GitHub:** https://github.com/Polymarket
- **The Graph (Subgraph):** https://thegraph.com/explorer - search "Polymarket"

---

*Last updated: February 2026*
