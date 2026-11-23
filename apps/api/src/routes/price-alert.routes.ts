import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { PriceAlert } from '../db/models/PriceAlert.js';
import { Mt5CommandService } from '../services/mt5-command.service.js';
import { GlobalCfdCandleProvider } from '../services/market-data/global-cfd.provider.js';

export const priceAlertRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/v1/price-alerts - List price alerts for current user
  app.get('/', async (req: any, reply) => {
    const userId = req.user.id || req.user.userId;
    const { status, symbol } = req.query as any;

    const filter: any = { userId };
    if (status) filter.status = status;
    if (symbol) filter.symbol = String(symbol).toUpperCase();

    const alerts = await PriceAlert.find(filter).sort({ createdAt: -1 }).limit(50).lean();

    return reply.send({
      success: true,
      data: alerts,
    });
  });

  // POST /api/v1/price-alerts - Create a new price alert
  app.post('/', async (req: any, reply) => {
    const userId = req.user.id || req.user.userId;
    const { symbol: rawSymbol, targetPrice, isRecurring, note, accountId } = req.body as any;

    if (!rawSymbol || !targetPrice || isNaN(Number(targetPrice)) || Number(targetPrice) <= 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PARAMETERS', message: 'Symbol and valid positive targetPrice are required' },
      });
    }

    const symbol = String(rawSymbol).trim().toUpperCase();
    const target = Number(targetPrice);

    // Fetch current LTP
    const mt5Quote = Mt5CommandService.getLiveQuote(symbol);
    let currentLtp = mt5Quote?.ltp || 0;
    if (currentLtp <= 0) {
      try {
        const qMap = await GlobalCfdCandleProvider.getLiveQuotes([symbol]);
        currentLtp = qMap.get(symbol)?.ltp || 0;
      } catch {}
    }

    let condition: 'CROSSES_ABOVE' | 'CROSSES_BELOW' | 'TOUCH_EXACT' = 'CROSSES_ABOVE';
    if (currentLtp > 0) {
      if (target > currentLtp) {
        condition = 'CROSSES_ABOVE';
      } else if (target < currentLtp) {
        condition = 'CROSSES_BELOW';
      } else {
        condition = 'TOUCH_EXACT';
      }
    }

    const alert = await PriceAlert.create({
      userId,
      accountId: accountId || undefined,
      symbol,
      targetPrice: target,
      initialPrice: currentLtp,
      condition,
      status: 'ARMED',
      isRecurring: Boolean(isRecurring),
      note: note ? String(note).trim() : undefined,
    });

    return reply.status(201).send({
      success: true,
      data: alert,
    });
  });

  // DELETE /api/v1/price-alerts/:id - Cancel a price alert
  app.delete('/:id', async (req: any, reply) => {
    const userId = req.user.id || req.user.userId;
    const { id } = req.params as any;

    const alert = await PriceAlert.findOneAndUpdate(
      { _id: id, userId },
      { $set: { status: 'CANCELLED' } },
      { new: true }
    );

    if (!alert) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Price alert not found' },
      });
    }

    return reply.send({
      success: true,
      data: alert,
    });
  });
};

