import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { MarketDataService } from '../services/market-data/index.js';
import { angelOneConfigSchema, angelOneConnectSchema } from '@tradevault/shared';

/**
 * Route handler for Angel One market data fallback integration.
 * Dedicated strictly to market data candle feeds (MAE/MFE excursion & auto-charts).
 * Contains no business logic or broker account linkages.
 */
export const marketDataRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // GET /angel-one/status - Retrieve sanitized status of Angel One connection
  app.get('/angel-one/status', async (req: any, reply) => {
    try {
      const status = await MarketDataService.getAngelOneStatus(req.user.id);
      return reply.send({
        success: true,
        data: status,
      });
    } catch (err: any) {
      req.log.error('Failed to get Angel One market data status: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'STATUS_FETCH_FAILED',
          message: err.message || 'Failed to retrieve market data integration status',
        },
      });
    }
  });

  // POST /angel-one/config - Save credentials (API Key, Client Code, PIN/MPIN)
  app.post('/angel-one/config', async (req: any, reply) => {
    const parsed = angelOneConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Angel One configuration parameters',
          details: parsed.error.format(),
        },
      });
    }

    try {
      await MarketDataService.saveAngelOneConfig(req.user.id, parsed.data);
      return reply.send({
        success: true,
        message: 'Angel One configuration saved securely',
      });
    } catch (err: any) {
      req.log.error('Failed to save Angel One config: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONFIG_SAVE_FAILED',
          message: err.message || 'Failed to save market data credentials',
        },
      });
    }
  });

  // POST /angel-one/connect - Authorize with 6-digit TOTP (Rate limited: 15 req/min)
  app.post(
    '/angel-one/connect',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '1 minute',
        },
      },
    },
    async (req: any, reply) => {
      const parsed = angelOneConnectSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid TOTP format (must be 6 numeric digits)',
            details: parsed.error.format(),
          },
        });
      }

      try {
        const status = await MarketDataService.connectAngelOne(req.user.id, parsed.data.totp);
        return reply.send({
          success: true,
          data: status,
          message: 'Successfully authenticated with Angel One SmartAPI',
        });
      } catch (err: any) {
        req.log.error('Angel One SmartAPI TOTP login failed: %s', err.message);
        return reply.status(400).send({
          success: false,
          error: {
            code: 'AUTH_FAILED',
            message: err.message || 'Failed to authenticate with Angel One SmartAPI',
          },
        });
      }
    }
  );

  // POST /angel-one/disconnect - Clear active tokens
  app.post('/angel-one/disconnect', async (req: any, reply) => {
    try {
      await MarketDataService.disconnectAngelOne(req.user.id);
      return reply.send({
        success: true,
        message: 'Disconnected from Angel One SmartAPI',
      });
    } catch (err: any) {
      req.log.error('Failed to disconnect Angel One: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DISCONNECT_FAILED',
          message: err.message || 'Failed to disconnect from Angel One',
        },
      });
    }
  });

  // DELETE /angel-one - Remove integration record and user-cached instruments
  app.delete('/angel-one', async (req: any, reply) => {
    try {
      await MarketDataService.deleteAngelOne(req.user.id);
      return reply.send({
        success: true,
        message: 'Angel One integration and instrument cache deleted',
      });
    } catch (err: any) {
      req.log.error('Failed to delete Angel One integration: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: err.message || 'Failed to delete Angel One integration',
        },
      });
    }
  });

  // POST /angel-one/refresh-instruments - Refresh instrument scrip master cache
  app.post('/angel-one/refresh-instruments', async (req: any, reply) => {
    try {
      const force = Boolean(req.body?.force);
      const result = await MarketDataService.refreshInstruments(req.user.id, { force });
      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      req.log.error('Failed to refresh Angel One instruments: %s', err.message);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: err.message || 'Failed to refresh Angel One instrument cache',
        },
      });
    }
  });
};
