import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createStrategySchema } from '@tradevault/shared';
import { Strategy, Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

export const strategyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // List strategies with aggregated performance statistics
  app.get('/', async (req, reply) => {
    const strategies = await Strategy.find({ userId: req.user!.id }).sort({ name: 1 });

    const strategyIds = strategies.map((s) => s._id);

    // Aggregate trade statistics grouped by strategyId
    const statsAgg = await Trade.aggregate([
      {
        $match: {
          userId: new (Trade.base.Types.ObjectId as any)(req.user!.id),
          strategyId: { $in: strategyIds },
          status: 'CLOSED',
        },
      },
      {
        $group: {
          _id: '$strategyId',
          totalTrades: { $sum: 1 },
          winTrades: {
            $sum: { $cond: [{ $gt: ['$calculated.netPnL', 0] }, 1, 0] },
          },
          netPnL: { $sum: '$calculated.netPnL' },
          grossWin: {
            $sum: { $cond: [{ $gt: ['$calculated.netPnL', 0] }, '$calculated.netPnL', 0] },
          },
          grossLoss: {
            $sum: { $cond: [{ $lt: ['$calculated.netPnL', 0] }, { $abs: '$calculated.netPnL' }, 0] },
          },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    for (const stat of statsAgg) {
      statsMap.set(stat._id.toString(), stat);
    }

    const data = strategies.map((s) => {
      const stat = statsMap.get(s._id.toString());
      const totalTrades = stat ? stat.totalTrades : 0;
      const winTrades = stat ? stat.winTrades : 0;
      const netPnL = stat ? Number(stat.netPnL.toFixed(2)) : 0;
      const winRate = totalTrades > 0 ? Number(((winTrades / totalTrades) * 100).toFixed(1)) : 0;
      let profitFactor = 0;
      if (stat) {
        if (stat.grossLoss === 0) {
          profitFactor = stat.grossWin > 0 ? 999.99 : 0;
        } else {
          profitFactor = Number((stat.grossWin / stat.grossLoss).toFixed(2));
        }
      }

      return {
        id: s._id.toString(),
        userId: s.userId.toString(),
        name: s.name,
        description: s.description,
        assetClasses: s.assetClasses,
        timeframes: s.timeframes,
        entryRules: s.entryRules,
        stopLossRules: s.stopLossRules,
        targetRules: s.targetRules,
        invalidationCriteria: s.invalidationCriteria,
        checklist: s.checklist,
        minRiskReward: s.minRiskReward,
        tags: s.tags,
        notes: s.notes,
        isActive: s.isActive,
        totalTrades,
        winRate,
        netPnL,
        profitFactor,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return reply.send({ success: true, data });
  });

  // Create strategy
  app.post('/', async (req, reply) => {
    const parseResult = createStrategySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid strategy details', details: parseResult.error.format() },
      });
    }

    const existing = await Strategy.findOne({ userId: req.user!.id, name: parseResult.data.name });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_STRATEGY', message: 'Strategy with this name already exists' },
      });
    }

    const strategy = await Strategy.create({
      ...parseResult.data,
      userId: req.user!.id,
    });

    return reply.status(201).send({ success: true, data: strategy });
  });

  // Get strategy detail with linked trades
  app.get('/:id', async (req: any, reply) => {
    const strategy = await Strategy.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!strategy) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Strategy not found' },
      });
    }

    const trades = await Trade.find({ strategyId: strategy._id, userId: req.user!.id })
      .sort({ tradeDate: -1 })
      .limit(50);

    return reply.send({
      success: true,
      data: {
        strategy,
        trades,
      },
    });
  });

  // Update strategy
  app.put('/:id', async (req: any, reply) => {
    const parseResult = createStrategySchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update', details: parseResult.error.format() },
      });
    }

    const strategy = await Strategy.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $set: parseResult.data },
      { new: true }
    );

    if (!strategy) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Strategy not found' },
      });
    }

    return reply.send({ success: true, data: strategy });
  });

  // Delete strategy
  app.delete('/:id', async (req: any, reply) => {
    await Strategy.deleteOne({ _id: req.params.id, userId: req.user!.id });
    return reply.send({ success: true, message: 'Strategy deleted successfully' });
  });
};
