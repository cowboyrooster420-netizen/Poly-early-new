# Polymarket Insider Signal Bot

Production-grade automated detection system for identifying potentially informed trading activity on Polymarket prediction markets. Combines on-chain wallet forensics, market microstructure analysis, and behavioral heuristics to generate high-confidence insider trading signals.

**Target Output:** 2-6 high-quality alerts per month with minimal false positives.

## Features

### 🎯 Signal Detection
- **Hard Filters**: Trade ≥$1,000, Market OI ≥$5,000, Wallet score ≥40
- **Real-time WebSocket**: Sub-second trade detection with automatic reconnection
- **Subgraph Polling**: Fetches trades from orderbook subgraph every 30s (backup data source)
- **Dormancy Detection**: Multiplier boost for trades on quiet markets (4-8+ hours inactive)

### 🔍 Wallet Forensics
- **Subgraph-Only Analysis**: Uses Polymarket's official subgraph data (proxy wallet aware)
- **Trade History**: Analyzes historical trade count and volume from orderbook events
- **Account Age**: Tracks days since first Polymarket trade
- **Position Concentration**: Flags wallets with >80% value in single market
- **Fresh Fat Bet Detection**: Identifies new wallets making large initial trades

### 📊 Alert Scoring (v2 - Tiered with Multipliers)
- **Weighted 0-100 Score** combining:
  - **Wallet Suspicion (50%)**: Low tx, young wallet, high netflow, single-purpose, CEX funded
  - **OI/Trade Size (35%)**: Tiered scoring with market size + dormancy multipliers
  - **Entry Extremity (15%)**: Bonus for extreme odds (< 10% or > 90% probability)
- **Multipliers**:
  - Small market (<$25k OI): 2x multiplier on OI score
  - Quiet market (8+ hours): 2x multiplier on OI score
- **Classification**: STRONG_INSIDER (90+) / HIGH (80+) / MEDIUM (70+) / LOG_ONLY (50+)
- **Alert Threshold**: Score ≥ 70 triggers notifications

### 📨 Notifications
- **Slack**: Rich formatted messages with market links, wallet analysis, signal breakdown
- **Telegram**: Markdown formatting with inline links
- **Auto-delivery**: Notifications sent immediately when high-confidence alerts are created

### 🏗️ Production Infrastructure
- **TypeScript**: Strict mode with comprehensive type safety
- **Database**: PostgreSQL + Prisma ORM with transaction retry logic
- **Caching**: Redis (5min market data, 24hr wallet fingerprints)
- **Logging**: Pino structured logging (JSON in prod, pretty-print in dev)
- **Error Handling**: Comprehensive error isolation (failures don't break pipeline)
- **Health Checks**: Liveness and readiness probes for Kubernetes/Docker
- **Docker**: Multi-stage build with non-root user

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Polymarket WebSocket                         │
│           (wss://ws-subscriptions-clob.polymarket.com)          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌─────────────────────────────┴────────────────────────────────────┐
│                  Polymarket Subgraph (Polling)                   │
│              (Orderbook events with user addresses)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │  Trade Service  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │Signal Detector  │
                   │ - OI Analysis   │
                   │ - Price Impact  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │Wallet Forensics │
                   │ - Subgraph API  │
                   │ - Proxy Mapping │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Alert Scorer   │
                   │  (0-100 score)  │
                   └────────┬────────┘
                            │
                     [Score >= 70?]
                            │
                            ▼
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
    ┌─────────┐      ┌──────────┐      ┌──────────┐
    │Database │      │  Slack   │      │ Telegram │
    └─────────┘      └──────────┘      └──────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+ LTS
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (for deployment)
- Alchemy API key (Polygon mainnet)
- Polygonscan API key
- (Optional) Slack webhook URL
- (Optional) Telegram bot token + chat ID

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd Poly-early-new
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/polymarket_bot

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain APIs
ALCHEMY_API_KEY=your_alchemy_api_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here

# Polymarket (defaults provided)
POLYMARKET_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
POLYMARKET_API_URL=https://clob.polymarket.com

# Notifications (at least one required in production)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Optional: Observability
SENTRY_DSN=https://your-sentry-dsn

# Detection Thresholds (optional - defaults provided)
MIN_OI_PERCENTAGE=20
MIN_PRICE_IMPACT=20
MAX_WALLET_TRANSACTIONS=40
MIN_NETFLOW_PERCENTAGE=85
CEX_FUNDING_WINDOW_DAYS=14
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed with curated markets
npm run seed
```

### 4. Build

```bash
npm run build
```

### 5. Run

```bash
# Development
npm run dev

# Production
npm start
```

## Docker Deployment

### Using Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: polymarket_bot
      POSTGRES_USER: polymarket
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U polymarket"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  bot:
    build: .
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://polymarket:${DB_PASSWORD}@postgres:5432/polymarket_bot
      REDIS_URL: redis://redis:6379
      ALCHEMY_API_KEY: ${ALCHEMY_API_KEY}
      POLYGONSCAN_API_KEY: ${POLYGONSCAN_API_KEY}
      SLACK_WEBHOOK_URL: ${SLACK_WEBHOOK_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres_data:
  redis_data:
```

### Deploy

```bash
# Create .env file with your secrets
cp .env.example .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f bot

# Stop services
docker-compose down
```

## Configuration

### Detection Thresholds

Customize via environment variables or `src/config/thresholds.ts`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_OI_PERCENTAGE` | 5 | Gate threshold: min % of OI to analyze trade |
| `MIN_PRICE_IMPACT` | 5 | Gate threshold: min % price impact to analyze trade |
| `MAX_WALLET_TRANSACTIONS` | 40 | Max txs for "low activity" flag |
| `MIN_NETFLOW_PERCENTAGE` | 85 | Min % netflow to Polymarket |
| `CEX_FUNDING_WINDOW_DAYS` | 14 | Days to check for CEX funding |

**Hard Filters (in scorer):**
- Trade size ≥ $1,000
- Market OI ≥ $5,000
- Wallet score ≥ 40 (out of 100)

**OI Score Tiers:**
| OI Ratio | Base Score |
|----------|------------|
| < 2% | 0 |
| 2-5% | 10 |
| 5-10% | 25 |
| 10-20% | 45 |
| 20-35% | 70 |
| 35%+ | 90 |

**Extremity Bonuses:**
| Entry Price | Bonus |
|-------------|-------|
| < 5% or > 95% | 40 pts |
| < 10% or > 90% | 25 pts |
| < 15% or > 85% | 15 pts |

### Market Selection

Add markets to monitor in `prisma/seed.ts` or via the database:

```sql
INSERT INTO "Market" (id, question, slug, tier, category, enabled)
VALUES (
  'market-id-here',
  'Will Trump win 2024?',
  'trump-2024',
  1,  -- Tier 1 = highest priority
  'politics',
  true
);
```

**Tiers:**
- **Tier 1**: Major markets (elections, corporate events) - highest priority
- **Tier 2**: Medium markets (sports, crypto)
- **Tier 3**: Smaller markets

### CEX Wallet Addresses

Update `src/config/cex-wallets.ts` to add/remove exchange addresses:

```typescript
export const CEX_HOT_WALLETS = new Map([
  ['0x...', 'coinbase'],
  ['0x...', 'binance'],
  // Add more...
]);
```

## API Endpoints

### Health Checks

```bash
# Liveness probe (is server running?)
GET /health/live

# Readiness probe (is server ready to accept traffic?)
GET /health/ready
```

### Metrics (Coming Soon)

```bash
# Alert statistics
GET /api/alerts/stats

# Recent alerts
GET /api/alerts/recent?limit=10

# Alerts by classification
GET /api/alerts?classification=critical
```

## Monitoring

### Logs

Structured JSON logs in production:

```bash
# View logs
docker-compose logs -f bot

# Filter by level
docker-compose logs bot | grep '"level":"error"'

# Filter by component
docker-compose logs bot | grep 'walletForensics'
```

### Key Log Events

- `🎯 Trade detected - analyzing wallet` - Trade passed gate threshold
- `🔍 Wallet fingerprint analyzed` - Wallet forensics complete
- `📊 Alert score calculated (v2)` - Tiered scoring complete with multipliers
- `Trade filtered out by hard filters` - Trade didn't meet hard filter requirements
- `🚨 INSIDER SIGNAL DETECTED` - Alert created (score ≥ 70)
- `📝 Signal logged` - Trade scored 50-69 (LOG_ONLY)
- `📨 Slack alert sent successfully` - Notification delivered

### Alert Statistics

```typescript
// Get alert stats
const stats = await alertPersistence.getAlertStats();
// Returns: { total, critical, high, medium, low, last24h }
```

## Troubleshooting

### WebSocket Connection Issues

**Symptoms:** `WebSocket connection failed`, `Disconnected from Polymarket`

**Solutions:**
1. Check internet connectivity
2. Verify Polymarket API is operational: https://status.polymarket.com
3. Check firewall rules (allow outbound WSS on port 443)
4. Review logs for reconnection attempts

### API Rate Limiting

**Symptoms:** `Failed to get wallet age`, `Alchemy request failed with 429`

**Solutions:**
1. Upgrade Alchemy plan (free tier = 25 req/sec)
2. Increase `CACHE_TTL_SECONDS` in wallet forensics
3. Add more API keys and implement round-robin

### Database Connection Issues

**Symptoms:** `Failed to connect to database`, `Prisma Client initialization error`

**Solutions:**
1. Verify PostgreSQL is running: `docker-compose ps postgres`
2. Check DATABASE_URL format: `postgresql://user:pass@host:5432/db`
3. Ensure migrations are applied: `npx prisma migrate deploy`
4. Check connection pool settings in `prisma/schema.prisma`

### No Alerts Generated

**Possible Causes:**
1. **Hard filters blocking:** Trade < $1k, Market OI < $5k, or Wallet score < 40
2. **Normal wallets:** Trades from wallets that don't show suspicious patterns (need 2+ flags)
3. **Low scores:** Trades scoring 50-69 go to LOG_ONLY (not alerted)
4. **Market selection:** Not monitoring markets with enough activity

**Diagnostics:**
```bash
# Check if trades are being processed
docker-compose logs bot | grep "Processing trade"

# Check gate threshold filtering
docker-compose logs bot | grep "Trade detected"

# Check hard filter rejections
docker-compose logs bot | grep "filtered out by hard filters"

# Check wallet analysis
docker-compose logs bot | grep "Wallet fingerprint analyzed"

# Check scoring results
docker-compose logs bot | grep "Alert score calculated"
```

### Notification Failures

**Symptoms:** `Failed to send Slack notification`, `Telegram not configured`

**Solutions:**
1. Verify webhook URLs are correct
2. Test connectivity: `curl -X POST $SLACK_WEBHOOK_URL -d '{"text":"test"}'`
3. Check Telegram bot token: `curl https://api.telegram.org/bot$TOKEN/getMe`
4. Ensure at least one notification channel is configured (required in production)

## Development

### Project Structure

```
src/
├── config/          # Configuration (env, thresholds, CEX wallets)
├── services/
│   ├── alerts/      # Scoring, persistence
│   ├── blockchain/  # Alchemy, Polygonscan, wallet forensics
│   ├── cache/       # Redis service
│   ├── database/    # Prisma service
│   ├── notifications/ # Slack, Telegram
│   ├── polymarket/  # WebSocket, markets, trades
│   └── signals/     # Signal detection (OI, price impact)
├── types/           # TypeScript type definitions
├── utils/           # Logger, helpers
└── index.ts         # Application entry point
```

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Format code
npm run format
```

### Database Migrations

```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Apply migration (production)
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset
```

## Performance

### Optimization Tips

1. **Redis Caching:**
   - Market data: 5min TTL (balance freshness vs API usage)
   - Wallet fingerprints: 24hr TTL (wallets don't change quickly)

2. **Database Indexes:**
   - Already optimized for timestamp, marketId, wallet queries
   - Add custom indexes if querying by other fields

3. **API Rate Limits:**
   - Alchemy: 25 req/sec (Growth plan) - monitor usage
   - Polygonscan: 5 req/sec (Free tier) - upgrade if needed

4. **Parallelization:**
   - Wallet forensics runs 5 analyses in parallel
   - Notifications sent to all channels in parallel

## Security

### Best Practices

1. **Environment Variables:** Never commit `.env` to git
2. **API Keys:** Rotate regularly, use separate keys for dev/prod
3. **Database:** Use strong passwords, restrict network access
4. **Docker:** Runs as non-root user (`botuser:nodejs`)
5. **Secrets Management:** Use Docker secrets or Kubernetes secrets in production

### Sensitive Data

The bot stores:
- Trade data (public blockchain data)
- Wallet addresses (public)
- Market IDs (public)
- No PII or private keys

## License

MIT

## Support

- **Issues:** https://github.com/your-org/polymarket-insider-bot/issues
- **Docs:** https://docs.your-domain.com
- **Discord:** https://discord.gg/your-server

## Acknowledgments

- Polymarket for providing public market data APIs
- Alchemy for blockchain infrastructure
- The prediction markets community

---

**Disclaimer:** This bot is for educational and research purposes. Trading based on insider information may be illegal in certain jurisdictions. Use responsibly and ensure compliance with local regulations.
