import crypto from 'crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BrokerIntegration, MarketDataIntegration } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { FyersService } from '../services/fyers.service.js';
import { decryptSecret, encryptSecret, hashOAuthState } from '../services/crypto.service.js';
import { excursionBackfillSchema } from '@tradevault/shared';
import { config } from '../config.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function buildFrontendRedirect(searchParams: Record<string, string>): string {
  const base = config.webAppUrl.replace(/\/$/, '');
  const url = new URL(`${base}/settings`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export const integrationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Callback endpoint from FYERS OAuth redirect. The state is a short-lived,
  // database-backed nonce that identifies the user without exposing their ID.
  app.get('/fyers/callback', async (req: any, reply) => {
    const code =
      req.query.auth_code ||
      (req.query.code && String(req.query.code).length > 10 ? req.query.code : null);
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    req.log.info(
      {
        hasAuthCode: Boolean(req.query.auth_code),
        codeLength: code?.length,
        hasState: Boolean(state),
      },
      'FYERS OAuth callback received'
    );

    if (!code) {
      return reply.redirect(
        buildFrontendRedirect({
          fyers: 'error',
          message: 'No valid auth_code received from FYERS',
        })
      );
    }

    if (!state) {
      return reply.redirect(
        buildFrontendRedirect({ fyers: 'error', message: 'Missing OAuth state' })
      );
    }

    try {
      const stateHash = hashOAuthState(state);
      const integration = await BrokerIntegration.findOne({
        broker: 'FYERS',
        oauthStateHash: stateHash,
        oauthStateExpiresAt: { $gt: new Date() },
      });

      if (!integration || !integration.appId || !integration.secretKey) {
        return reply.redirect(
          buildFrontendRedirect({
            fyers: 'error',
            message: 'OAuth state expired or app credentials are missing',
          })
        );
      }

      const tokens = await FyersService.validateAuthCode(
        integration.appId,
        decryptSecret(integration.secretKey) as string,
        code
      );

      integration.accessToken = encryptSecret(tokens.accessToken) || undefined;
      integration.refreshToken = encryptSecret(tokens.refreshToken) || undefined;
      integration.clientId = tokens.clientId || integration.clientId || integration.appId.split('-')[0];
      integration.tokenExpiresAt = new Date(tokens.accessTokenExpiresAt);
      integration.authCodeExpiresAt = new Date(tokens.accessTokenExpiresAt);
      integration.set('oauthStateHash', undefined);
      integration.set('oauthStateExpiresAt', undefined);
      integration.status = 'CONNECTED';
      integration.set('fundsSyncError', undefined);
      await integration.save();

      try {
        await FyersService.syncTradesForUser(integration.userId.toString());
      } catch (tradeErr) {
        req.log.warn({ tradeErr }, 'Initial trade sync failed after FYERS connection');
      }

      return reply.redirect(
        buildFrontendRedirect({ fyers: 'connected', status: 'success' })
      );
    } catch (err: any) {
      return reply.redirect(
        buildFrontendRedirect({
          fyers: 'error',
          message: err.message || 'Authentication failed',
        })
      );
    }
  });

  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);

    const createLoginUrl = async (req: any, reply: any) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      if (!integration || !integration.appId || !integration.secretKey) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Save your FYERS App ID and Secret Key first.',
          },
        });
      }

      const state = crypto.randomBytes(32).toString('hex');
      integration.oauthStateHash = hashOAuthState(state);
      integration.oauthStateExpiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
      await integration.save();

      const url = FyersService.generateLoginUrl(
        integration.appId,
        config.fyersRedirectUri,
        state
      );

      return reply.send({
        success: true,
        data: {
          url,
          expiresAt: integration.oauthStateExpiresAt.toISOString(),
        },
      });
    };

    // Get broker integration status
    protectedApp.get('/fyers/status', async (req: any, reply) => {
      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      const tokenExpiry = integration?.tokenExpiresAt || integration?.authCodeExpiresAt;
      const isTokenValid = Boolean(
        integration?.accessToken && tokenExpiry && new Date(tokenExpiry) > new Date()
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          status: isTokenValid
            ? 'CONNECTED'
            : integration?.appId
              ? 'IDLE'
              : 'DISABLED',
          isConfigured: Boolean(integration?.appId && integration?.secretKey),
          isConnected: isTokenValid,
          appId: integration?.appId,
          clientId: integration?.clientId,
          hasSecretKey: Boolean(integration?.secretKey),
          hasRefreshToken: Boolean(integration?.refreshToken),
          autoSyncEnabled: integration?.autoSyncEnabled ?? true,
          lastSyncAt: integration?.lastSyncAt?.toISOString(),
          lastFundsSyncAt: integration?.lastFundsSyncAt?.toISOString(),
          fundsSyncError: integration?.fundsSyncError,
          tokenExpiresAt: tokenExpiry?.toISOString(),
          authCodeExpiresAt: tokenExpiry?.toISOString(),
          redirectUri: config.fyersRedirectUri,
          syncHistory: (integration?.syncHistory || []).slice(0, 5),
          architecture: {
            adapterVersion: 'v3-compatible (REST / Real-Time)',
            normalizedModel: 'NormalizedExecution',
            supportedSegments: ['NSE_EQ', 'NSE_FNO', 'MCX'],
            reconciliationSupport: true,
            fundsSyncEnabled: config.fyersFundsSyncEnabled,
            statusMessage: isTokenValid
              ? 'FYERS live synchronization is active. Trades will be matched via FIFO.'
              : 'FYERS credentials configured. Click Connect to authorize for the trading day.',
          },
        },
      });
    });

    // Save FYERS app credentials (App ID & Secret Key). Secrets are encrypted at rest.
    protectedApp.post('/fyers/config', async (req: any, reply) => {
      const { appId, secretKey, autoSyncEnabled } = req.body || {};
      if (!appId || typeof appId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CONFIG', message: 'App ID is required' },
        });
      }

      const existing = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });

      const normalizedAppId = appId.trim();
      const normalizedSecret =
        typeof secretKey === 'string' && secretKey.trim() ? secretKey.trim() : '';
      const appIdChanged = Boolean(existing?.appId && existing.appId !== normalizedAppId);

      if (appIdChanged && !normalizedSecret) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SECRET_REQUIRED',
            message: 'Enter the FYERS Secret Key again when changing the App ID.',
          },
        });
      }

      const updateData: any = {
        appId: normalizedAppId,
        fundsSyncError: undefined,
      };

      const credentialsChanged = !existing || appIdChanged || Boolean(normalizedSecret);

      if (normalizedSecret) {
        updateData.secretKey = encryptSecret(normalizedSecret);
      }
      if (typeof autoSyncEnabled === 'boolean') {
        updateData.autoSyncEnabled = autoSyncEnabled;
      }
      if (credentialsChanged) {
        updateData.status = 'IDLE';
        updateData.accessToken = null;
        updateData.refreshToken = null;
        updateData.tokenExpiresAt = null;
        updateData.authCodeExpiresAt = null;
        updateData.oauthStateHash = null;
        updateData.oauthStateExpiresAt = null;
      }

      const integration = await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        { $set: updateData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return reply.send({
        success: true,
        data: {
          broker: 'FYERS',
          appId: integration.appId,
          clientId: integration.clientId,
          hasSecretKey: Boolean(integration.secretKey),
          status: integration.status,
          autoSyncEnabled: integration.autoSyncEnabled,
        },
      });
    });

    // Generate a short-lived FYERS OAuth login URL
    protectedApp.post('/fyers/connect', createLoginUrl);
    protectedApp.get('/fyers/login-url', createLoginUrl);

    // Manually trigger FYERS tradebook and funds synchronization
    protectedApp.post('/fyers/sync', async (req: any, reply) => {
      try {
        const tradeResult = await FyersService.syncTradesForUser(req.user.id);
        let fundsResult: any = null;
        if (config.fyersFundsSyncEnabled) {
          try {
            fundsResult = await FyersService.syncFundsForUser(req.user.id);
          } catch (fundsErr: any) {
            req.log.warn({ fundsErr }, 'Funds sync failed during FYERS manual sync');
          }
        }

        const balanceMsg = fundsResult?.brokerBalance != null
          ? ` and live balance (₹${fundsResult.brokerBalance.toFixed(2)})`
          : '';
        const backfillMsg = tradeResult.backfilledClosedTradesCount
          ? ` (${tradeResult.backfilledClosedTradesCount} closed trade${tradeResult.backfilledClosedTradesCount > 1 ? 's' : ''} auto-backfilled with excursion & setup)`
          : '';

        return reply.send({
          success: true,
          message: `Synchronized ${tradeResult.syncedTradesCount} new trades${balanceMsg}${backfillMsg} from FYERS.`,
          data: {
            ...tradeResult,
            funds: fundsResult,
          },
        });
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SYNC_ERROR',
            message: err.message || 'Failed to synchronize with FYERS.',
          },
        });
      }
    });

    // Re-run matching for same-day trades that have no stop loss against current-day FYERS orderbook
    protectedApp.post('/fyers/sl-backfill', async (req: any, reply) => {
      try {
        const isDryRun = req.body?.dryRun !== false;
        const result = await FyersService.backfillSLFromOrderbook(req.user.id, {
          dryRun: isDryRun,
          tradeIds: req.body?.tradeIds,
        });

        return reply.send({
          success: true,
          message: `${isDryRun ? '[DRY RUN] ' : ''}Matched SL for ${result.matchedCount} trades (${result.ambiguousCount} ambiguous, ${result.skippedCount} skipped)`,
          data: result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SL_BACKFILL_ERROR',
            message: err.message || 'Failed to backfill stop losses from FYERS orderbook.',
          },
        });
      }
    });

    // Batch process PENDING closed trades for excursion analytics
    protectedApp.post('/fyers/excursion-backfill', async (req: any, reply) => {
      const parsed = excursionBackfillSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid backfill parameters',
            details: parsed.error.format(),
          },
        });
      }

      const requestedProvider = parsed.data.provider || 'AUTO';

      const integration = await BrokerIntegration.findOne({
        userId: req.user.id,
        broker: 'FYERS',
      });
      const tokenExpiry = integration?.tokenExpiresAt || integration?.authCodeExpiresAt;
      const isFyersValid = Boolean(
        integration?.accessToken && tokenExpiry && new Date(tokenExpiry) > new Date()
      );

      const angelOneDoc = await MarketDataIntegration.findOne({
        userId: req.user.id,
        provider: 'ANGEL_ONE',
      });
      const isAngelOneValid = Boolean(
        angelOneDoc?.tokenExpiresAt && new Date(angelOneDoc.tokenExpiresAt) > new Date()
      );

      if (requestedProvider === 'ANGEL_ONE' && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'MARKET_DATA_NOT_CONNECTED',
            message:
              'Active Angel One market data session is required. Please connect Angel One in Settings.',
          },
        });
      }

      if (requestedProvider === 'AUTO' && !isFyersValid && !isAngelOneValid) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'BROKER_NOT_CONNECTED',
            message:
              'Active market data session (FYERS or Angel One) is required. Please reconnect in Settings.',
          },
        });
      }

      try {
        const result = await FyersService.batchBackfillExcursion(req.user.id, parsed.data);
        return reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'BACKFILL_FAILED',
            message: err.message || 'Excursion backfill failed',
          },
        });
      }
    });

    // Disconnect FYERS session without deleting app credentials.
    protectedApp.post('/fyers/disconnect', async (req: any, reply) => {
      await BrokerIntegration.findOneAndUpdate(
        { userId: req.user.id, broker: 'FYERS' },
        {
          $set: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            authCodeExpiresAt: null,
            oauthStateHash: null,
            oauthStateExpiresAt: null,
            status: 'IDLE',
            fundsSyncError: null,
          },
        }
      );

      return reply.send({
        success: true,
        message: 'FYERS session disconnected.',
      });
    });
  });
};
