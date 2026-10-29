import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import mongoose from 'mongoose';
import { config, validateConfig } from './config.js';
import { connectDatabase, disconnectDatabase, extractMongoHost } from './db/connection.js';
import { getStorage } from './storage/index.js';
import { S3Storage } from './storage/s3.storage.js';
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
import { reviewRoutes } from './routes/review.routes.js';
import { templateRoutes } from './routes/template.routes.js';
import { marketDataRoutes } from './routes/market-data.routes.js';
import { holidayRoutes } from './routes/holiday.routes.js';
import { HolidayService } from './services/holiday.service.js';
import { InstrumentClassifier } from './services/instrument-classifier.service.js';
import { LiveExecutionWorker } from './services/live-execution-worker.service.js';

export async function buildApp() {
  // Fail-fast on critical configuration (e.g. weak/missing SESSION_SECRET in production)
  validateConfig();

  const app = fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-privatekey"]',
        'req.headers["x-macaddress"]',
        'req.headers["x-clientlocalip"]',
        'req.headers["x-clientpublicip"]',
        'req.body.password',
        'req.body.token',
        'req.body.tokenHash',
        'req.body.secretKey',
        'req.body.appId',
        'req.body.apiKey',
        'req.body.clientCode',
        'req.body.pin',
        'req.body.totp',
        'req.body.jwtToken',
        'req.body.refreshToken',
        'req.body.feedToken',
        'req.query.auth_code',
        'req.query.code',
        'cookie',
        'token',
        'tokenHash',
        'secretKey',
        'accessToken',
        'refreshToken',
        'appId',
        'authorization',
        'apiKey',
        'clientCode',
        'pin',
        'totp',
        'jwtToken',
        'feedToken',
        'x-privatekey',
        'x-macaddress',
        'x-clientlocalip',
        'x-clientpublicip',
      ],
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Idempotency-Key', 'x-idempotency-key'],
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

  // Support empty JSON body gracefully (e.g. DELETE or POST without payload)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string | Buffer, done) => {
    const strBody = typeof body === 'string' ? body : body.toString('utf-8');
    if (!strBody || strBody.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(strBody));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
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
  app.register(marketDataRoutes, { prefix: '/api/v1/integrations/market-data' });
  app.register(reviewRoutes, { prefix: '/api/v1/review' });
  app.register(templateRoutes, { prefix: '/api/v1/templates' });
  app.register(holidayRoutes, { prefix: '/api/v1/holidays' });

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
      await HolidayService.initializeDefaults();
      await InstrumentClassifier.loadCommodityRegistry();

      // Cloud storage health check (probes Cloudflare R2 bucket)
      const storage = getStorage();
      if (storage instanceof S3Storage) {
        await storage.healthCheck();
      }

      const mongoHost = extractMongoHost(config.mongodbUri || process.env.MONGODB_URI || '');
      const s3Bucket = process.env.S3_BUCKET || 'unknown';

      console.log(`DB: Atlas (${mongoHost}) | Storage: R2 (${s3Bucket})`);

      const app = await buildApp();

      // Start server-side execution worker daemon
      LiveExecutionWorker.start();

      await app.listen({ port: config.port, host: config.host });
      console.log(`\n======================================================`);
      console.log(`🚀 SetupMint API Server listening on http://${config.host}:${config.port}`);
      console.log(`📖 API OpenAPI Docs available at http://${config.host}:${config.port}/api/docs`);
      console.log(`======================================================\n`);

      const shutdown = async () => {
        console.log('\nShutting down SetupMint gracefully...');
        LiveExecutionWorker.stop();
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
