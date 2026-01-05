/**
 * Health monitoring service for system status
 */

import { redis } from '../cache/redis.js';
import { db } from '../database/prisma.js';
import { circuitBreakers } from '../../utils/circuit-breaker.js';
import { logger } from '../../utils/logger.js';
import { signalDetector } from '../signals/signal-detector.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  services: {
    [key: string]: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export class HealthMonitor {
  private static instance: HealthMonitor | null = null;
  
  private constructor() {
    logger.info('Health monitor initialized');
  }
  
  public static getInstance(): HealthMonitor {
    if (HealthMonitor.instance === null) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      services: {},
    };

    // Check all services in parallel
    const [redis, database, circuits, detector, memory] = await Promise.all([
      this.checkRedisHealth(),
      this.checkDatabaseHealth(),
      this.checkCircuitBreakers(),
      this.checkSignalDetectorHealth(),
      this.checkMemoryHealth(),
    ]);

    health.services = {
      redis,
      database,
      circuitBreakers: circuits,
      signalDetector: detector,
      memory,
    };

    // Determine overall health
    const serviceStatuses = Object.values(health.services).map(s => s.status);
    if (serviceStatuses.every(s => s === 'up')) {
      health.status = 'healthy';
    } else if (serviceStatuses.some(s => s === 'down')) {
      health.status = 'unhealthy';
    } else {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<ServiceHealth> {
    try {
      const healthCheck = await redis.healthCheck();
      
      return {
        status: healthCheck.isHealthy ? 'up' : 'down',
        latency: healthCheck.latency,
        error: healthCheck.error,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ServiceHealth> {
    try {
      const start = Date.now();
      const prisma = db.getClient();
      
      // Run a simple query
      await prisma.$queryRaw`SELECT 1 as healthy`;
      
      return {
        status: 'up',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check circuit breakers
   */
  private async checkCircuitBreakers(): Promise<ServiceHealth> {
    try {
      const stats = {
        dataApi: await circuitBreakers.dataApi.getStats(),
        subgraph: await circuitBreakers.subgraph.getStats(),
        alchemy: await circuitBreakers.alchemy.getStats(),
      };
      
      // Check if any circuit is open
      const anyOpen = Object.values(stats).some(s => s.state.state === 'open');
      
      return {
        status: anyOpen ? 'degraded' : 'up',
        details: {
          circuits: Object.entries(stats).reduce((acc, [name, stat]) => ({
            ...acc,
            [name]: {
              state: stat.state.state,
              failures: stat.recentFailures,
              successes: stat.recentSuccesses,
            },
          }), {}),
        },
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check signal detector health
   */
  private async checkSignalDetectorHealth(): Promise<ServiceHealth> {
    try {
      const stats = await signalDetector.getStats();
      
      const totalAnalyzed = stats.trades_analyzed || 0;
      const totalFiltered = Object.entries(stats)
        .filter(([key]) => key.startsWith('filtered_'))
        .reduce((sum, [_, value]) => sum + value, 0);
      
      return {
        status: 'up',
        details: {
          tradesAnalyzed: totalAnalyzed,
          tradesFiltered: totalFiltered,
          passRate: totalAnalyzed > 0 
            ? ((totalAnalyzed - totalFiltered) / totalAnalyzed * 100).toFixed(2) + '%'
            : '0%',
        },
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check memory health
   */
  private checkMemoryHealth(): ServiceHealth {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    return {
      status: heapUsedPercent > 90 ? 'degraded' : 'up',
      details: {
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        rssMB: Math.round(usage.rss / 1024 / 1024),
        heapUsedPercent: Math.round(heapUsedPercent),
      },
    };
  }

  /**
   * Get wallet forensics specific stats
   */
  async getWalletForensicsHealth(): Promise<{
    circuitBreakers: Record<string, unknown>;
    cacheStats: Record<string, unknown>;
    errorRate: number;
  }> {
    try {
      // Get circuit breaker states
      const circuits = {
        dataApi: await circuitBreakers.dataApi.getStats(),
        subgraph: await circuitBreakers.subgraph.getStats(),
      };

      // Get cache statistics
      const cacheKeys = await redis.getClient().keys('wallet:subgraph:*');
      const recentKeys = cacheKeys; // Would need to track access times for real implementation

      // Calculate error rate from recent fingerprints
      const errorCount = await redis.getClient().get('stats:wallet:errors') || '0';
      const totalCount = await redis.getClient().get('stats:wallet:total') || '0';
      const errorRate = parseInt(totalCount) > 0 
        ? (parseInt(errorCount) / parseInt(totalCount) * 100)
        : 0;

      return {
        circuitBreakers: circuits,
        cacheStats: {
          totalKeys: cacheKeys.length,
          recentKeys: recentKeys.length,
          hitRate: 'N/A', // Would need to track this
        },
        errorRate,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get wallet forensics health');
      throw error;
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60000): void {
    setInterval(() => {
      void (async (): Promise<void> => {
        try {
          const health = await this.getHealthStatus();
        
        if (health.status !== 'healthy') {
          logger.warn(
            {
              status: health.status,
              services: Object.entries(health.services)
                .filter(([_, service]) => service.status !== 'up')
                .map(([name, service]) => ({
                  name,
                  status: service.status,
                  error: service.error,
                })),
            },
            'System health degraded'
          );
        }

        // Store health status in Redis
        await redis.setJSON('health:current', health, 300); // 5 min TTL
        
        } catch (error) {
          logger.error({ error }, 'Health check failed');
        }
      })();
    }, intervalMs);

    logger.info(
      { intervalMs },
      'Started periodic health checks'
    );
  }
}

export const healthMonitor = HealthMonitor.getInstance();