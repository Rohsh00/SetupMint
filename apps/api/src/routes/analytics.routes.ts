import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Decimal from 'decimal.js';
import { EMOTIONS, MISTAKE_TAGS, excursionAnalyticsQuerySchema, whatIfRequestSchema } from '@tradevault/shared';
import { Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { computeWhatIf, WhatIfScopeTooLargeError } from '../services/what-if.service.js';

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/psychology', async (req: any, reply) => {
    const { startDate, endDate, accountId } = req.query;

    const filter: any = { userId: req.user!.id, status: 'CLOSED' };
    if (accountId) filter.accountId = accountId;
    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    const trades = await Trade.find(filter);

    // 1. Performance by discipline score (1 to 5)
    const disciplineMap = new Map<number, { count: number; netPnL: number; wins: number }>();
    for (let i = 1; i <= 5; i++) {
      disciplineMap.set(i, { count: 0, netPnL: 0, wins: 0 });
    }

    // 2. Performance by emotion before trade
    const emotionMap = new Map<string, { count: number; netPnL: number; wins: number }>();
    for (const e of EMOTIONS) {
      emotionMap.set(e.value, { count: 0, netPnL: 0, wins: 0 });
    }

    // 3. Mistake impact tracking (Dynamic across all MISTAKE_TAGS + legacy flags)
    const mistakeImpact: Record<string, { count: number; totalLoss: number }> = {};
    for (const m of MISTAKE_TAGS) {
      mistakeImpact[m.value] = { count: 0, totalLoss: 0 };
    }

    for (const t of trades) {
      const pnl = t.calculated?.netPnL || 0;
      const isWin = pnl > 0;

      // Discipline rating
      const rating = t.psychology?.disciplineScore || 3;
      const dRec = disciplineMap.get(rating) ?? { count: 0, netPnL: 0, wins: 0 };
      dRec.count++;
      dRec.netPnL += pnl;
      if (isWin) dRec.wins++;
      disciplineMap.set(rating, dRec);

      // Emotion
      const emo = t.psychology?.emotionBefore || 'NEUTRAL';
      const eRec = emotionMap.get(emo) ?? { count: 0, netPnL: 0, wins: 0 };
      eRec.count++;
      eRec.netPnL += pnl;
      if (isWin) eRec.wins++;
      emotionMap.set(emo, eRec);

      // Mistakes: collect unique mistakes for this trade (both legacy booleans and mistake tag array)
      const tradeMistakes = new Set<string>();
      if (t.psychology?.revengeTrading) tradeMistakes.add('REVENGE_TRADING');
      if (t.psychology?.overtrading) tradeMistakes.add('OVERTRADING');
      if (t.psychology?.prematureExit) tradeMistakes.add('PREMATURE_EXIT');
      if (t.psychology?.stopLossMoved) tradeMistakes.add('STOP_MOVED');
      if (t.psychology?.positionSizeViolation) tradeMistakes.add('SIZE_VIOLATION');
      if (Array.isArray(t.psychology?.mistakes)) {
        for (const m of t.psychology.mistakes) {
          if (m) tradeMistakes.add(m);
        }
      }

      for (const m of tradeMistakes) {
        if (!mistakeImpact[m]) {
          mistakeImpact[m] = { count: 0, totalLoss: 0 };
        }
        mistakeImpact[m].count++;
        if (pnl < 0) {
          mistakeImpact[m].totalLoss += Math.abs(pnl);
        }
      }
    }

    const performanceByDiscipline = Array.from(disciplineMap.entries()).map(([score, val]) => ({
      score,
      tradesCount: val.count,
      netPnL: Number(val.netPnL.toFixed(2)),
      winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
    }));

    const performanceByEmotion = Array.from(emotionMap.entries())
      .filter(([_, val]) => val.count > 0)
      .map(([emotion, val]) => ({
        emotion,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.netPnL - a.netPnL);

    const mistakeAnalysis = Object.entries(mistakeImpact)
      .map(([key, val]) => ({
        mistake: key,
        label: MISTAKE_TAGS.find((m) => m.value === key)?.label || key,
        occurrences: val.count,
        totalLoss: Number(val.totalLoss.toFixed(2)),
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss || b.occurrences - a.occurrences);

    return reply.send({
      success: true,
      data: {
        performanceByDiscipline,
        performanceByEmotion,
        mistakeAnalysis,
      },
    });
  });

  // Excursion performance aggregates and MAE vs MFE scatter
  app.get('/excursion', async (req: any, reply) => {
    const parsed = excursionAnalyticsQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.format() },
      });
    }

    const { accountId, strategyId, variantKey, startDate, endDate, session } = parsed.data;

    const filter: any = {
      userId: req.user!.id,
      status: 'CLOSED',
      'calculated.excursion.status': 'COMPUTED',
    };

    if (accountId) filter.accountId = accountId;
    if (strategyId) filter.strategyId = strategyId;
    if (variantKey) filter['setup.variantKey'] = variantKey;
    if (session) filter.session = session;
    if (startDate || endDate) {
      filter.tradeDate = {};
      if (startDate) filter.tradeDate.$gte = new Date(startDate);
      if (endDate) filter.tradeDate.$lte = new Date(endDate);
    }

    const trades = await Trade.find(filter).sort({ tradeDate: -1 });

    let totalMaeR = new Decimal(0);
    let countMaeR = 0;
    let totalMfeR = new Decimal(0);
    let countMfeR = 0;
    let totalExitEff = new Decimal(0);
    let countExitEff = 0;
    let gaveBackProfitCount = 0;
    let stopReversalCount = 0;
    let totalWithStop = 0;

    const scatterPoints: Array<{
      tradeId: string;
      symbol: string;
      maeR?: number;
      mfeR?: number;
      maePoints?: number;
      mfePoints?: number;
      maeAmount?: number;
      mfeAmount?: number;
      netPnL: number;
      outcome: any;
      exitEfficiency?: number;
      tradeDate: string;
    }> = [];

    for (const t of trades) {
      const exc = t.calculated?.excursion;
      if (!exc) continue;

      if (exc.maeR !== undefined && exc.maeR !== null) {
        totalMaeR = totalMaeR.plus(exc.maeR);
        countMaeR++;
      }
      if (exc.mfeR !== undefined && exc.mfeR !== null) {
        totalMfeR = totalMfeR.plus(exc.mfeR);
        countMfeR++;
      }
      if (exc.exitEfficiency !== undefined && exc.exitEfficiency !== null) {
        totalExitEff = totalExitEff.plus(exc.exitEfficiency);
        countExitEff++;
      }
      if (exc.excursionFlags?.includes('GAVE_BACK_PROFIT')) {
        gaveBackProfitCount++;
      }
      if (t.risk?.initialStopLoss) {
        totalWithStop++;
        if (exc.reversedAfterStopHit || exc.excursionFlags?.includes('STOP_TOO_TIGHT_EVIDENCE')) {
          stopReversalCount++;
        }
      }

      scatterPoints.push({
        tradeId: t._id.toString(),
        symbol: t.symbol,
        maeR: exc.maeR,
        mfeR: exc.mfeR,
        maePoints: exc.maePoints,
        mfePoints: exc.mfePoints,
        maeAmount: exc.maeAmount,
        mfeAmount: exc.mfeAmount,
        netPnL: t.calculated?.netPnL || 0,
        outcome: t.calculated?.outcome || 'BREAKEVEN',
        exitEfficiency: exc.exitEfficiency,
        tradeDate: t.tradeDate ? t.tradeDate.toISOString().split('T')[0] : '',
      });
    }

    const totalEvaluated = trades.length;
    const avgMaeR = countMaeR > 0 ? Number(totalMaeR.dividedBy(countMaeR).toFixed(2)) : undefined;
    const avgMfeR = countMfeR > 0 ? Number(totalMfeR.dividedBy(countMfeR).toFixed(2)) : undefined;
    const avgExitEfficiency = countExitEff > 0 ? Number(totalExitEff.dividedBy(countExitEff).toFixed(4)) : undefined;
    const gaveBackProfitPercent = totalEvaluated > 0 ? Number(((gaveBackProfitCount / totalEvaluated) * 100).toFixed(1)) : 0;
    const reversalAfterStopPercent = totalWithStop > 0 ? Number(((stopReversalCount / totalWithStop) * 100).toFixed(1)) : 0;

    return reply.send({
      success: true,
      data: {
        summary: {
          totalEvaluated,
          countWithStop: countMaeR,
          avgMaeR,
          avgMfeR,
          avgExitEfficiency,
          gaveBackProfitPercent,
          reversalAfterStopPercent,
        },
        scatterPoints,
      },
    });
  });

  // What-If Stop/Target Candle-Replay Simulation
  app.post('/what-if', async (req: any, reply) => {
    const parsed = whatIfRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid What-If simulation parameters',
          details: parsed.error.format(),
        },
      });
    }

    try {
      const result = await computeWhatIf(req.user!.id, parsed.data);
      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err instanceof WhatIfScopeTooLargeError || err.code === 'SCOPE_TOO_LARGE') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'SCOPE_TOO_LARGE',
            message: err.message,
            details: {
              count: err.count,
              limit: err.limit,
            },
          },
        });
      }
      req.log.error(err, 'What-If simulation error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SIMULATION_ERROR',
          message: err.message || 'Internal simulation error occurred',
        },
      });
    }
  });
};
