import { FastifyInstance } from 'fastify';
import { AiCopilotService } from '../services/ai-copilot.service.js';
import { AiStatementParserService } from '../services/ai-statement-parser.service.js';
import { AiEdgeMinerService } from '../services/ai-edge-miner.service.js';
import { AiVoiceJournalService } from '../services/ai-voice-journal.service.js';
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

  // POST /api/v1/ai/parse-statement - Multimodal Broker Contract Note & Statement Ingestion
  app.post('/parse-statement', async (req: any, reply) => {
    const { textContent, imageBase64, mimeType, brokerHint } = req.body || {};

    if (!textContent && !imageBase64) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Either textContent or imageBase64 must be provided.',
        },
      });
    }

    try {
      const parsedResult = await AiStatementParserService.parseStatement({
        userId: req.user.id,
        textContent,
        imageBase64,
        mimeType,
        brokerHint,
      });

      return reply.send({
        success: true,
        data: parsedResult,
      });
    } catch (err: any) {
      req.log.error(err, '[AiRoutes] Error parsing statement:');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'STATEMENT_PARSE_ERROR',
          message: err.message || 'Failed to extract statement data.',
        },
      });
    }
  });

  // GET /api/v1/ai/edge-mining - Unsupervised Edge & Leak Mining
  app.get('/edge-mining', async (req: any, reply) => {
    try {
      const { scopeKey, accountId, limit } = req.query || {};
      const report = await AiEdgeMinerService.mineInsights({
        userId: req.user.id,
        scopeKey,
        accountId,
        limit: limit ? parseInt(limit, 10) : 200,
      });

      return reply.send({
        success: true,
        data: report,
      });
    } catch (err: any) {
      req.log.error(err, '[AiRoutes] Error running edge mining:');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'EDGE_MINING_ERROR',
          message: err.message || 'Failed to compute edge mining report.',
        },
      });
    }
  });

  // POST /api/v1/ai/voice-journal - AI Voice-to-Journal & Sentiment Analysis
  app.post('/voice-journal', async (req: any, reply) => {
    const { audioBase64, mimeType, caption, tradeId } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_AUDIO',
          message: 'audioBase64 must be a non-empty string.',
        },
      });
    }

    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const result = await AiVoiceJournalService.processVoiceMessage({
        userId: req.user.id,
        audioBuffer,
        mimeType: mimeType || 'audio/webm',
        caption,
        tradeId,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      req.log.error(err, '[AiRoutes] Error processing voice journal:');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'VOICE_JOURNAL_ERROR',
          message: err.message || 'Failed to process voice reflection.',
        },
      });
    }
  });
}
