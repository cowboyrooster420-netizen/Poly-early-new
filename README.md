# Polymarket Insider Signal Bot

A production-grade bot that detects potentially informed trades on Polymarket by combining on-chain wallet forensics, market microstructure monitoring, timing filters, and relative liquidity/price impact metrics.

## Project Status

**Phase 1 Complete** - Production-grade TypeScript foundation with:
- ✅ TypeScript with strict mode enabled
- ✅ Pino structured logging
- ✅ Zod environment validation
- ✅ PostgreSQL + Prisma ORM
- ✅ Docker multi-stage build
- ✅ Health check endpoints
- ✅ ESLint + Prettier + Husky
- ✅ Comprehensive type definitions

## Architecture

Built on a lightweight, high-precision signal detection system focused on:
- Large relative trades (≥20% OI or ≥20% price impact)
- Dormant market conditions
- Insider wallet fingerprinting (CEX funding, low tx count, high netflow)
- Timing leak windows (political staffers, pre-announcements, etc.)

Target: 2-6 high-quality alerts per month with minimal noise.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache:** Redis 7
- **HTTP Server:** Fastify
- **Logging:** Pino
- **Validation:** Zod
- **Job Queue:** BullMQ
- **Deployment:** Docker (Fly.io/Render ready)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16
- Redis 7

### Installation

1. **Clone the repository**
```bash
git clone <repo-url>
cd Poly-early-new
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start local services (PostgreSQL + Redis)**
```bash
docker-compose up -d postgres redis
```

5. **Run database migrations**
```bash
npm run db:migrate
```

6. **Generate Prisma client**
```bash
npm run db:generate
```

7. **Start development server**
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Health Checks

- **Liveness:** `GET /health/live` - Simple ping check
- **Readiness:** `GET /health/ready` - Full health check (DB, Redis, WebSocket)

## Project Structure

```
├── src/
│   ├── api/              # HTTP API routes
│   │   └── health.ts     # Health check endpoints
│   ├── config/           # Configuration
│   │   └── env.ts        # Environment validation
│   ├── services/         # Core services
│   │   ├── database/     # Database layer
│   │   ├── polymarket/   # Polymarket API & WebSocket
│   │   └── wallet/       # On-chain wallet analysis
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utilities
│   │   └── logger.ts     # Structured logging
│   └── index.ts          # Application entry point
├── prisma/
│   └── schema.prisma     # Database schema
├── docker-compose.yml    # Local development services
├── Dockerfile            # Production container
└── package.json
```

## Database Schema

### Core Models
- **Markets** - Polymarket markets being monitored
- **Trades** - All trades on monitored markets
- **Wallets** - On-chain wallet analysis and fingerprinting
- **DormancyMetrics** - Market dormancy tracking
- **Alerts** - Generated insider signals
- **CexWallets** - Known CEX hot wallet addresses
- **JobQueue** - Background job tracking
- **SystemMetrics** - System health metrics

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking
- `npm test` - Run tests
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

### Code Quality

This project enforces strict TypeScript and code quality standards:
- Strict mode enabled for all TS checks
- ESLint with TypeScript plugin
- Prettier for consistent formatting
- Husky + lint-staged for pre-commit checks
- No `any` types allowed
- Explicit return types required

## Deployment

### Docker Build

```bash
docker build -t polymarket-bot .
docker run -p 3000:3000 --env-file .env polymarket-bot
```

### Environment Variables

See `.env.example` for all required environment variables.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `ALCHEMY_API_KEY` - Alchemy API key for Polygon
- `POLYGONSCAN_API_KEY` - Polygonscan API key

**Optional:**
- `SLACK_WEBHOOK_URL` - For Slack notifications
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` - For Telegram notifications
- `SENTRY_DSN` - For error tracking

## Roadmap

### ✅ Phase 1 - Skeleton (Complete)
- TypeScript project setup
- Database schema
- Health check API

### 🔄 Phase 2 - Core Signal Detection (In Progress)
- OI-relative trade detection
- Price-move logic
- Dormant window tracking

### 📋 Phase 3 - Wallet Forensics (Planned)
- On-chain wallet fetch
- CEX funding detection
- Tx-count & netflow analysis

### 📋 Phase 4 - Alert Engine (Planned)
- JSON alerts + scoring
- Push to Slack/Telegram

### 📋 Phase 5 - Optimization (Planned)
- Backtest major trades
- Adjust thresholds per market type

## License

MIT
