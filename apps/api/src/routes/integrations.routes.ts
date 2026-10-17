import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { BrokerIntegration } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

export const integrationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Get broker integration status
  app.get('/fyers/status', async (req, reply) => {
    const integration = await BrokerIntegration.findOne({
      userId: req.user!.id,
      broker: 'FYERS',
    });

    return reply.send({
      success: true,
      data: {
        broker: 'FYERS',
        status: integration?.status || 'DISABLED',
        isConfigured: !!integration?.appId,
        appId: integration?.appId,
        lastSyncAt: integration?.lastSyncAt?.toISOString(),
        architecture: {
          adapterVersion: 'v3-compatible',
          normalizedModel: 'NormalizedExecution',
          supportedSegments: ['NSE_EQ', 'NSE_FNO', 'MCX'],
          reconciliationSupport: true,
          statusMessage:
            'Future FYERS live synchronization adapter is architecturally modeled and disabled by default for privacy.',
        },
      },
    });
  });

  // Save future FYERS app configuration (stored safely in integration layer)
  app.post('/fyers/config', async (req: any, reply) => {
    const { appId } = req.body;
    if (!appId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CONFIG', message: 'App ID is required' },
      });
    }

    const integration = await BrokerIntegration.findOneAndUpdate(
      { userId: req.user!.id, broker: 'FYERS' },
      { $set: { appId, status: 'IDLE' } },
      { upsert: true, new: true }
    );

    return reply.send({
      success: true,
      data: {
        broker: 'FYERS',
        appId: integration.appId,
        status: integration.status,
      },
    });
  });
};
