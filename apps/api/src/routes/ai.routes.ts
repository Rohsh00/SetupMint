import { FastifyInstance } from 'fastify';
import { AiCopilotService } from '../services/ai-copilot.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function aiRoutes(app: FastifyInstance) {
  // All AI routes require authentication
  app.addHook('preHandler', requireAuth);

  // POST /api/v1/ai/copilot - Ask SetupMint Conversational Trading Copilot
  app.post('/copilot', async (req: any, reply) => {
    const { question, scopeKey, accountId, history } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_QUESTION',
          message: 'Question must be a non-empty string.',
        },
      });
    }

    try {
      const response = await AiCopilotService.askCopilot(req.user.id, {
        question: question.trim(),
        scopeKey,
        accountId,
        history: Array.isArray(history) ? history : [],
      });

      return reply.send({
        success: true,
        data: response,
      });
    } catch (err: any) {
      req.log.error(err, '[AiRoutes] Error handling copilot request:');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'COPILOT_ERROR',
          message: err.message || 'Failed to process AI copilot query.',
        },
      });
    }
  });

  // GET /api/v1/ai/copilot/suggestions - Get contextual starter suggestions
  app.get('/copilot/suggestions', async (req: any, reply) => {
    try {
      const scopeKey = req.query?.scopeKey || 'ALL';
      const suggestions = await AiCopilotService.getSuggestions(req.user.id, scopeKey);

      return reply.send({
        success: true,
        data: suggestions,
      });
    } catch (err: any) {
      req.log.error(err, '[AiRoutes] Error fetching suggestions:');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SUGGESTIONS_ERROR',
          message: err.message || 'Failed to fetch copilot suggestions.',
        },
      });
    }
  });
}
