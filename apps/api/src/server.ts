import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { authRoutes } from './routes/auth.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { instrumentRoutes } from './routes/instrument.routes.js';
import { strategyRoutes } from './routes/strategy.routes.js';
import { tradeRoutes } from './routes/trade.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { journalRoutes } from './routes/journal.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { riskRoutes } from './routes/risk.routes.js';
import { attachmentRoutes } from './routes/attachment.routes.js';
import { exportImportRoutes } from './routes/export-import.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { integrationsRoutes } from './routes/integrations.routes.js';

export async function buildApp() {
  const app = fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password', 'req.body.token'],
      transport: config.isDev
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
          }
        : undefined,
    },
  });

  // Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allows flexible dashboard assets
  });

  // CORS
  await app.register(cors, {
    origin: [config.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Cookie Support
  await app.register(cookie, {
    secret: config.sessionSecret,
    hook: 'onRequest',
  });

  // Rate Limiter
  await app.register(rateLimit, {
    max: 1200,
    timeWindow: '1 minute',
  });

  // Multipart File Uploads
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSizeMb * 1024 * 1024,
    },
  });

  // OpenAPI Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'TradeVault REST API',
        description: 'Professional Trading Journal API documentation',
        version: '1.0.0',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Health check endpoint
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  // Register REST API v1 routes
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(accountRoutes, { prefix: '/api/v1/accounts' });
  app.register(instrumentRoutes, { prefix: '/api/v1/instruments' });
  app.register(strategyRoutes, { prefix: '/api/v1/strategies' });
  app.register(tradeRoutes, { prefix: '/api/v1/trades' });
  app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  app.register(journalRoutes, { prefix: '/api/v1/journal' });
  app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  app.register(riskRoutes, { prefix: '/api/v1/risk' });
  app.register(attachmentRoutes, { prefix: '/api/v1/attachments' });
  app.register(exportImportRoutes, { prefix: '/api/v1/export' });
  app.register(settingsRoutes, { prefix: '/api/v1/settings' });
  app.register(integrationsRoutes, { prefix: '/api/v1/integrations' });

  // Centralized Error Handler
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code || 'BAD_REQUEST',
          message: error.message,
        },
      });
    }

    // Sanitize 500 internal errors
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred. Your trading data is secure.',
      },
    });
  });

  return app;
}

// Start server if executed directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  async function start() {
    try {
      await connectDatabase();
      const app = await buildApp();

      await app.listen({ port: config.port, host: config.host });
      console.log(`\n======================================================`);
      console.log(`🚀 TradeVault API Server listening on http://${config.host}:${config.port}`);
      console.log(`📖 API OpenAPI Docs available at http://${config.host}:${config.port}/api/docs`);
      console.log(`======================================================\n`);

      const shutdown = async () => {
        console.log('\nShutting down TradeVault gracefully...');
        await app.close();
        await disconnectDatabase();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err: any) {
      console.error('Fatal startup error:', err);
      process.exit(1);
    }
  }

  start();
}
