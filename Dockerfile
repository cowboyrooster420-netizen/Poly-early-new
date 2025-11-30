# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only (skip prepare script since husky is dev-only)
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# ============================================================================
# Stage 2: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev, skip husky)
ENV HUSKY=0
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ============================================================================
# Stage 3: Production
# ============================================================================
FROM node:20-alpine AS runner

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Set non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 botuser

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=botuser:nodejs /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist
COPY --from=builder --chown=botuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Copy package.json for version info
COPY --chown=botuser:nodejs package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER botuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
