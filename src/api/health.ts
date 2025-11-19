import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { logger } from '../utils/logger.js';

/**
 * Health check response structure
 */
interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    websocket: ServiceStatus;
  };
}

interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  latency?: number;
  error?: string;
}

/**
 * Register health check routes
 */
export async function registerHealthRoutes(
  app: FastifyInstance
): Promise<void> {
  // Liveness probe - simple check that app is running
  app.get(
    '/health/live',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    }
  );

  // Readiness probe - detailed health check
  app.get(
    '/health/ready',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        const healthCheck: HealthCheckResponse = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env['npm_package_version'] ?? '1.0.0',
          services: {
            database: await checkDatabaseHealth(),
            redis: await checkRedisHealth(),
            websocket: await checkWebSocketHealth(),
          },
        };

        // Determine overall health
        const allServicesHealthy = Object.values(healthCheck.services).every(
          (service) => service.status === 'up'
        );

        if (!allServicesHealthy) {
          healthCheck.status = 'unhealthy';
          logger.warn({ healthCheck }, 'Health check failed');
          return reply.code(503).send(healthCheck);
        }

        const duration = Date.now() - startTime;
        logger.debug({ duration, healthCheck }, 'Health check passed');

        return reply.code(200).send(healthCheck);
      } catch (error) {
        logger.error({ error }, 'Health check error');
        return reply.code(503).send({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}

/**
 * Check database connectivity
 */
async function checkDatabaseHealth(): Promise<ServiceStatus> {
  try {
    const { db } = await import('../services/database/prisma.js');
    const health = await db.healthCheck();

    const result: ServiceStatus = {
      status: health.isHealthy ? 'up' : 'down',
      latency: health.latency,
    };

    if (health.error !== undefined) {
      result.error = health.error;
    }

    return result;
  } catch (error) {
    return {
      status: 'down',
      latency: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedisHealth(): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    // This will be implemented once Redis is set up
    // For now, return unknown status
    return {
      status: 'unknown',
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check WebSocket connection status
 */
async function checkWebSocketHealth(): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    // This will be implemented once WebSocket is set up
    // For now, return unknown status
    return {
      status: 'unknown',
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
