import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { calculateDashboardMetrics } from '@tradevault/financial-engine';
import { Trade, TradingAccount } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

export const dashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/stats', async (req: any, reply) => {
    const { startDate, endDate, accountId, assetClass, strategyId, direction, session } = req.query;

    const filter: any = { userId: req.user!.id };

    if (accountId) filter.accountId = accountId;
    if (assetClass) filter.assetClass = assetClass;
    if (strategyId) filter.strategyId = strategyId;
    if (direction) filter.direction = direction;
    if (session) filter.session = session;

    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    // Determine initial balance for equity curve
    let startingEquity = 0;
    if (accountId) {
      const acc = await TradingAccount.findById(accountId);
      if (acc) startingEquity = Number(acc.initialBalance.toString());
    } else {
      const accounts = await TradingAccount.find({ userId: req.user!.id });
      startingEquity = accounts.reduce((sum, a) => sum + Number(a.initialBalance.toString()), 0);
    }

    const trades = await Trade.find(filter)
      .sort({ tradeDate: 1 })
      .populate('strategyId', 'name');

    const formattedTrades = trades.map((t) => ({
      id: t._id.toString(),
      tradeDate: t.tradeDate.toISOString().split('T')[0],
      symbol: t.symbol,
      strategyId: t.strategyId?._id ? (t.strategyId as any)._id.toString() : undefined,
      strategyName: (t.strategyId as any)?.name || t.strategyName || 'Discretionary',
      status: t.status,
      session: t.session,
      calculated: {
        netPnL: t.calculated?.netPnL || 0,
        grossPnL: t.calculated?.grossPnL || 0,
        totalCosts: t.calculated?.totalCosts || 0,
        realizedRMultiple: t.calculated?.realizedRMultiple,
        holdingTimeMinutes: t.calculated?.holdingTimeMinutes,
        outcome: t.calculated?.outcome || 'BREAKEVEN',
      },
      psychology: {
        rulesFollowed: t.psychology?.rulesFollowed,
        disciplineScore: t.psychology?.disciplineScore,
      },
    }));

    const stats = calculateDashboardMetrics(formattedTrades, startingEquity);

    return reply.send({ success: true, data: stats });
  });
};
