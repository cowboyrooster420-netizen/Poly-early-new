# Deployment Guide

Complete guide for deploying the Polymarket Insider Signal Bot to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Docker Deployment](#docker-deployment)
- [Cloud Platforms](#cloud-platforms)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services

1. **API Keys**
   - Alchemy API key (Polygon mainnet) - [Get one here](https://www.alchemy.com/)
   - Polygonscan API key - [Get one here](https://polygonscan.com/apis)

2. **Notification Channels** (at least one required)
   - Slack webhook URL - [Create webhook](https://api.slack.com/messaging/webhooks)
   - Telegram bot token + chat ID - [Create bot](https://core.telegram.org/bots#6-botfather)

3. **Infrastructure**
   - PostgreSQL 14+ database
   - Redis 7+ instance
   - Server with Docker support (2GB RAM minimum, 4GB recommended)

### Getting API Keys

#### Alchemy

```bash
1. Go to https://www.alchemy.com/
2. Sign up / Log in
3. Create a new app → Select "Polygon" network → "Mainnet"
4. Copy your API key from the dashboard
```

#### Polygonscan

```bash
1. Go to https://polygonscan.com/
2. Sign up / Log in
3. Go to "API-KEYs" → "Add" → Create new API key
4. Copy your API key
```

#### Slack Webhook

```bash
1. Go to https://api.slack.com/apps
2. Create new app → From scratch
3. "Incoming Webhooks" → Activate → "Add New Webhook to Workspace"
4. Select channel → Authorize
5. Copy webhook URL
```

#### Telegram Bot

```bash
1. Message @BotFather on Telegram
2. Send /newbot → Follow prompts
3. Copy bot token
4. Get chat ID:
   - Start chat with your bot
   - Send any message
   - Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
   - Copy "chat":{"id": value
```

## Environment Setup

Create `.env` file:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (replace with your values)
DATABASE_URL=postgresql://user:password@localhost:5432/polymarket_bot

# Redis (replace with your values)
REDIS_URL=redis://localhost:6379

# Blockchain APIs (REQUIRED)
ALCHEMY_API_KEY=your_alchemy_api_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here

# Polymarket (use defaults)
POLYMARKET_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
POLYMARKET_API_URL=https://clob.polymarket.com

# Notifications (at least one required)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Optional: Monitoring
SENTRY_DSN=https://your-sentry-dsn-here

# Optional: Custom Thresholds
MIN_OI_PERCENTAGE=20
MIN_PRICE_IMPACT=20
DORMANT_HOURS_NO_LARGE_TRADES=4
DORMANT_HOURS_NO_PRICE_MOVES=3
MAX_WALLET_TRANSACTIONS=40
MIN_NETFLOW_PERCENTAGE=85
CEX_FUNDING_WINDOW_DAYS=14
```

## Docker Deployment

### Option 1: Docker Compose (Recommended)

**Step 1:** Create `docker-compose.prod.yml`:

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
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  bot:
    image: polymarket-insider-bot:latest
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      PORT: 3000
      LOG_LEVEL: info
      DATABASE_URL: postgresql://polymarket:${DB_PASSWORD}@postgres:5432/polymarket_bot
      REDIS_URL: redis://redis:6379
      ALCHEMY_API_KEY: ${ALCHEMY_API_KEY}
      POLYGONSCAN_API_KEY: ${POLYGONSCAN_API_KEY}
      SLACK_WEBHOOK_URL: ${SLACK_WEBHOOK_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
      SENTRY_DSN: ${SENTRY_DSN}
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
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

**Step 2:** Deploy:

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f bot

# Check status
docker-compose -f docker-compose.prod.yml ps

# Stop services
docker-compose -f docker-compose.prod.yml down

# Restart just the bot
docker-compose -f docker-compose.prod.yml restart bot
```

### Option 2: Standalone Docker

```bash
# Build image
docker build -t polymarket-insider-bot:latest .

# Run with external PostgreSQL and Redis
docker run -d \
  --name polymarket-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e REDIS_URL=redis://host:6379 \
  -e ALCHEMY_API_KEY=your_key \
  -e POLYGONSCAN_API_KEY=your_key \
  -e SLACK_WEBHOOK_URL=your_webhook \
  polymarket-insider-bot:latest

# View logs
docker logs -f polymarket-bot

# Stop
docker stop polymarket-bot

# Remove
docker rm polymarket-bot
```

## Cloud Platforms

### AWS (ECS + RDS + ElastiCache)

**Step 1:** Create RDS PostgreSQL database:

```bash
aws rds create-db-instance \
  --db-instance-identifier polymarket-bot-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.1 \
  --master-username polymarket \
  --master-user-password <your-password> \
  --allocated-storage 20 \
  --backup-retention-period 7
```

**Step 2:** Create ElastiCache Redis:

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id polymarket-bot-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

**Step 3:** Push Docker image to ECR:

```bash
# Create ECR repository
aws ecr create-repository --repository-name polymarket-insider-bot

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag polymarket-insider-bot:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/polymarket-insider-bot:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/polymarket-insider-bot:latest
```

**Step 4:** Create ECS task definition and service (use AWS Console or CLI)

### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/<project-id>/polymarket-insider-bot

# Deploy to Cloud Run
gcloud run deploy polymarket-insider-bot \
  --image gcr.io/<project-id>/polymarket-insider-bot \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "ALCHEMY_API_KEY=<key>" \
  --set-env-vars "POLYGONSCAN_API_KEY=<key>" \
  --set-env-vars "SLACK_WEBHOOK_URL=<url>" \
  --allow-unauthenticated

# Note: Set DATABASE_URL and REDIS_URL to Cloud SQL and Memorystore instances
```

### Fly.io (Easiest)

**Step 1:** Install Fly CLI:

```bash
curl -L https://fly.io/install.sh | sh
```

**Step 2:** Create `fly.toml`:

```toml
app = "polymarket-insider-bot"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_gb = 2
```

**Step 3:** Deploy:

```bash
# Initialize Fly app
fly apps create polymarket-insider-bot

# Create PostgreSQL
fly postgres create --name polymarket-db

# Attach database
fly postgres attach polymarket-db

# Create Redis
fly redis create --name polymarket-redis

# Set secrets
fly secrets set \
  ALCHEMY_API_KEY=your_key \
  POLYGONSCAN_API_KEY=your_key \
  SLACK_WEBHOOK_URL=your_webhook \
  TELEGRAM_BOT_TOKEN=your_token \
  TELEGRAM_CHAT_ID=your_chat_id

# Deploy
fly deploy

# View logs
fly logs

# Scale
fly scale count 1

# SSH into machine
fly ssh console
```

### Railway (Simplest)

```bash
1. Go to https://railway.app/
2. "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Add PostgreSQL and Redis services
5. Set environment variables in dashboard
6. Deploy automatically on git push
```

## Database Migrations

### Initial Setup

```bash
# Inside container or server
npx prisma generate
npx prisma migrate deploy
```

### Adding New Migrations

```bash
# Development
npx prisma migrate dev --name add_new_field

# Production (inside container)
docker exec -it polymarket-bot npx prisma migrate deploy
```

## Monitoring & Maintenance

### Health Checks

```bash
# Liveness (basic ping)
curl http://localhost:3000/health/live

# Readiness (full health check)
curl http://localhost:3000/health/ready
```

### Log Monitoring

```bash
# Docker Compose
docker-compose logs -f --tail=100 bot

# Docker
docker logs -f --tail=100 polymarket-bot

# Filter errors only
docker logs polymarket-bot 2>&1 | grep '"level":"error"'

# Filter by component
docker logs polymarket-bot 2>&1 | grep 'walletForensics'
```

### Database Backups

```bash
# Backup PostgreSQL
docker exec -t polymarket-postgres pg_dump -U polymarket polymarket_bot > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i polymarket-postgres psql -U polymarket polymarket_bot < backup_20250123.sql
```

### Redis Persistence

Redis is configured with AOF (Append-Only File) for durability. Backups are automatic.

```bash
# Manual snapshot
docker exec polymarket-redis redis-cli BGSAVE

# Check last save time
docker exec polymarket-redis redis-cli LASTSAVE
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs bot

# Check if database is ready
docker-compose ps postgres

# Check environment variables
docker-compose exec bot env | grep DATABASE_URL

# Restart all services
docker-compose restart
```

### High Memory Usage

```bash
# Check memory usage
docker stats polymarket-bot

# Increase memory limit in docker-compose.yml
services:
  bot:
    deploy:
      resources:
        limits:
          memory: 4G
```

### WebSocket Disconnections

```bash
# Check network connectivity
docker exec polymarket-bot ping polymarket.com

# Check logs for reconnection attempts
docker logs polymarket-bot | grep "WebSocket"

# Restart bot
docker-compose restart bot
```

### Database Connection Pool Exhausted

```bash
# Increase pool size in prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connection_limit = 20  // Increase from default 10
}

# Rebuild and redeploy
docker-compose up -d --build bot
```

## Scaling

### Horizontal Scaling

Currently single-instance only (WebSocket connection is stateful). For high availability:

1. Set up primary-secondary failover
2. Use health checks for automatic failover
3. Consider splitting signal detection and notifications into separate services

### Vertical Scaling

```bash
# Increase resources in docker-compose.yml
services:
  bot:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Security Checklist

- [ ] All secrets in environment variables (never in code)
- [ ] `.env` file in `.gitignore`
- [ ] PostgreSQL password is strong (20+ characters)
- [ ] Database not publicly accessible (firewall rules)
- [ ] Redis requires password (if publicly accessible)
- [ ] API keys rotated regularly
- [ ] Separate API keys for dev/staging/prod
- [ ] HTTPS enabled for API endpoints
- [ ] Health check endpoints don't expose sensitive data
- [ ] Logs don't contain API keys or secrets

## Maintenance Schedule

**Daily:**
- Monitor logs for errors
- Check alert generation rate

**Weekly:**
- Review alert quality (false positives?)
- Check API usage (Alchemy/Polygonscan limits)
- Database backup verification

**Monthly:**
- Rotate API keys
- Review and adjust detection thresholds
- Update CEX wallet addresses list
- Check for updates to dependencies

**Quarterly:**
- Database cleanup (archive old alerts)
- Performance optimization review
- Security audit

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/polymarket-insider-bot/issues
- Documentation: https://docs.your-domain.com
- Discord: https://discord.gg/your-server

---

**Last Updated:** November 2025
