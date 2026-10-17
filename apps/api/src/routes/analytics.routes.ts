import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EMOTIONS, MISTAKE_TAGS } from '@tradevault/shared';
import { Trade } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

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

    // 3. Mistake impact tracking
    const mistakeImpact: Record<string, { count: number; totalLoss: number }> = {
      REVENGE_TRADING: { count: 0, totalLoss: 0 },
      OVERTRADING: { count: 0, totalLoss: 0 },
      PREMATURE_EXIT: { count: 0, totalLoss: 0 },
      STOP_MOVED: { count: 0, totalLoss: 0 },
      SIZE_VIOLATION: { count: 0, totalLoss: 0 },
    };

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

      // Mistakes
      if (t.psychology?.revengeTrading) {
        mistakeImpact.REVENGE_TRADING.count++;
        if (pnl < 0) mistakeImpact.REVENGE_TRADING.totalLoss += Math.abs(pnl);
      }
      if (t.psychology?.overtrading) {
        mistakeImpact.OVERTRADING.count++;
        if (pnl < 0) mistakeImpact.OVERTRADING.totalLoss += Math.abs(pnl);
      }
      if (t.psychology?.prematureExit) {
        mistakeImpact.PREMATURE_EXIT.count++;
      }
      if (t.psychology?.stopLossMoved) {
        mistakeImpact.STOP_MOVED.count++;
        if (pnl < 0) mistakeImpact.STOP_MOVED.totalLoss += Math.abs(pnl);
      }
      if (t.psychology?.positionSizeViolation) {
        mistakeImpact.SIZE_VIOLATION.count++;
        if (pnl < 0) mistakeImpact.SIZE_VIOLATION.totalLoss += Math.abs(pnl);
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

    const mistakeAnalysis = Object.entries(mistakeImpact).map(([key, val]) => ({
      mistake: key,
      label: MISTAKE_TAGS.find((m) => m.value === key)?.label || key,
      occurrences: val.count,
      totalLoss: Number(val.totalLoss.toFixed(2)),
    }));

    return reply.send({
      success: true,
      data: {
        performanceByDiscipline,
        performanceByEmotion,
        mistakeAnalysis,
      },
    });
  });
};
