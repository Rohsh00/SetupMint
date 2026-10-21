import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BrokerIntegration } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { FyersService } from '../services/fyers.service.js';

export const integrationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Callback endpoint from FYERS OAuth redirect (handles both session and state-based user lookup)
  app.get('/fyers/callback', async (req: any, reply) => {
    // In FYERS API v3, `auth_code` contains the temporary authorization token.
    // `code` in the query string is often the HTTP status (e.g. 200).
    const code =
      req.query.auth_code ||
      (req.query.code && String(req.query.code).length > 10 ? req.query.code : null);

    const state = req.query.state; // Contains userId

    req.log.info({ query: req.query, hasAuthCode: !!req.query.auth_code, codeLength: code?.length }, 'FYERS OAuth Callback received');

    if (!code) {
      return reply.redirect('http://localhost:5173/settings?fyers=error&message=No+valid+auth_code+received+from+FYERS');
    }

    try {
      // Find integration by state (userId) or active session user
      const userId = state || req.user?.id;
      if (!userId) {
        return reply.redirect('http://localhost:5173/settings?fyers=error&message=User+session+not+found');
      }

      const integration = await BrokerIntegration.findOne({ userId, broker: 'FYERS' });
      if (!integration || !integration.appId || !integration.secretKey) {
        return reply.redirect('http://localhost:5173/settings?fyers=error&message=App+credentials+missing');
      }

      // Exchange authorization code for daily access token
      const accessToken = await FyersService.validateAuthCode(
        integration.appId,
        integration.secretKey,
        code
      );

      // Set expiry for today (FYERS tokens expire daily at 6:00 AM IST)
      const expiry = new Date();
      expiry.setHours(23, 59, 59, 999);

      integration.accessToken = accessToken;
      integration.authCodeExpiresAt = expiry;
      integration.status = 'CONNECTED';
      await integration.save();

      // Trigger automatic initial sync
      try {
        await FyersService.syncTradesForUser(userId);
      } catch (syncErr) {
        // Token was saved, so initial sync error is non-fatal
      }

      return reply.redirect('http://localhost:5173/settings?fyers=connected&status=success');
    } catch (err: any) {
      const errMsg = encodeURIComponent(err.message || 'Authentication failed');
      return reply.redirect(`http://localhost:5173/settings?fyers=error&message=${errMsg}`);
    }
  });

  // Protected Routes requiring authenticated user
  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);

    // Get broker integration status
    protectedApp.get('/fyers/status', async (req: any, reply) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      const isTokenValid = Boolean(
        integration?.accessToken &&
        integration?.authCodeExpiresAt &&
        new Date(integration.authCodeExpiresAt) > new Date()
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          status: isTokenValid ? 'CONNECTED' : (integration?.appId ? 'IDLE' : 'DISABLED'),
          isConfigured: !!integration?.appId && !!integration?.secretKey,
          isConnected: isTokenValid,
          appId: integration?.appId,
          hasSecretKey: !!integration?.secretKey,
          autoSyncEnabled: integration?.autoSyncEnabled ?? true,
          lastSyncAt: integration?.lastSyncAt?.toISOString(),
          authCodeExpiresAt: integration?.authCodeExpiresAt?.toISOString(),
          syncHistory: (integration?.syncHistory || []).slice(0, 5),
          architecture: {
            adapterVersion: 'v3-compatible (REST / Real-Time)',
            normalizedModel: 'NormalizedExecution',
            supportedSegments: ['NSE_EQ', 'NSE_FNO', 'MCX'],
            reconciliationSupport: true,
            statusMessage: isTokenValid
              ? 'FYERS live synchronization is active. Trades will be matched via FIFO.'
              : 'FYERS credentials configured. Click Connect to authorize for the trading day.',
          },
        },
      });
    });

    // Save FYERS app credentials (App ID & Secret Key)
    protectedApp.post('/fyers/config', async (req: any, reply) => {
      const { appId, secretKey, autoSyncEnabled } = req.body || {};
      if (!appId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CONFIG', message: 'App ID is required' },
        });
      }

      const updateData: any = { appId, status: 'IDLE' };
      if (secretKey) updateData.secretKey = secretKey;
      if (typeof autoSyncEnabled === 'boolean') updateData.autoSyncEnabled = autoSyncEnabled;

      const integration = await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        { $set: updateData },
        { upsert: true, new: true }
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          appId: integration.appId,
          hasSecretKey: !!integration.secretKey,
          status: integration.status,
          autoSyncEnabled: integration.autoSyncEnabled,
        },
      });
    });

    // Generate FYERS OAuth login URL
    protectedApp.get('/fyers/login-url', async (req: any, reply) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      if (!integration || !integration.appId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Please save your FYERS App ID and Secret Key first.' },
        });
      }

      const redirectUri = 'http://127.0.0.1:4000/api/v1/integrations/fyers/callback';
      const url = FyersService.generateLoginUrl(integration.appId, redirectUri, req.user.id);

      return reply.send({
        success: true,
        data: { url },
      });
    });

    // Manually trigger FYERS tradebook synchronization
    protectedApp.post('/fyers/sync', async (req: any, reply) => {
      try {
        const result = await FyersService.syncTradesForUser(req.user.id);
        return reply.send({
          success: true,
          message: `Synchronized ${result.syncedTradesCount} new trades from FYERS (${result.duplicateTradesCount} existing/duplicates skipped).`,
          data: result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: { code: 'SYNC_ERROR', message: err.message || 'Failed to synchronize trades from FYERS.' },
        });
      }
    });

    // Disconnect FYERS session
    protectedApp.post('/fyers/disconnect', async (req: any, reply) => {
      await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        { $set: { accessToken: null, authCodeExpiresAt: null, status: 'IDLE' } }
      );

      return reply.send({
        success: true,
        message: 'FYERS session disconnected.',
      });
    });
  });
};
