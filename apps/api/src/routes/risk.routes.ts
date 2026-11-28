import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { calculateRiskAndPositionSize } from '@tradevault/financial-engine';
import { riskCalculatorQuerySchema } from '@tradevault/shared';
import { requireAuth } from '../middleware/auth.js';
import { AiPreTradeCheckService } from '../services/ai-pretrade-check.service.js';

export const riskRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.post('/calculate', async (req, reply) => {
    const parseResult = riskCalculatorQuerySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid risk calculator parameters', details: parseResult.error.format() },
      });
    }

    const result = calculateRiskAndPositionSize(parseResult.data);
    return reply.send({ success: true, data: result });
  });

  // Pre-Trade AI Sanity Check & Guardrail Evaluation
  app.post('/ai-pretrade-check', async (req: any, reply) => {
    try {
      const result = await AiPreTradeCheckService.checkPreTrade(req.user!.id, req.body || {});
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AI_PRETRADE_CHECK_FAILED',
          message: err.message || 'Pre-trade AI sanity check failed',
        },
      });
    }
  });
};
