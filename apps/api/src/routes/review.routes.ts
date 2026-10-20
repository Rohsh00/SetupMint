import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  detectMistakeSuggestions,
  checkDailyLossBreach,
  calculateDailySessionSummary,
  ITradeSummaryForDetection,
} from '@tradevault/financial-engine';
import { User, Trade, DailyJournal, Attachment, ITradeDoc } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateDateParam } from '../middleware/validate.js';

function toTradeSummary(t: ITradeDoc): ITradeSummaryForDetection {
  const quantity =
    t.simpleExecution?.quantity ??
    t.calculated?.closedQuantity ??
    t.calculated?.openQuantity ??
    0;
  const entryPrice =
    t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? 0;
  const exitPrice =
    t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice;
  const plannedRiskAmount =
    t.risk?.estimatedRiskAmount ?? t.risk?.riskBudgetAmount;
  const riskPercent =
    t.risk?.riskPercentage ?? t.risk?.riskAsPercentOfEquity;
  const mistakes = t.psychology?.mistakes || [];

  return {
    id: t._id.toString(),
    symbol: t.symbol,
    direction: t.direction,
    status: t.status,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    quantity,
    entryPrice,
    exitPrice,
    netPnL: t.calculated?.netPnL,
    plannedRiskAmount,
    riskPercent,
    mistakes,
    confluences: t.thesis?.confluences || [],
    plannedTarget: t.risk?.plannedTarget,
    targetRationale: t.thesis?.targetRationale,
    initialStopLoss: t.risk?.initialStopLoss,
  };
}

export const reviewRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/v1/review/queue - Returns unreviewed trades and days
  app.get('/queue', async (req: any, reply) => {
    const userId = req.user!.id;

    const user = await User.findById(userId);
    const riskSettings = user?.riskSettings;

    // Look back 30 days for review items
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const trades = await Trade.find({
      userId,
      tradeDate: { $gte: thirtyDaysAgo },
    })
      .populate('strategyId', 'name')
      .sort({ entryTime: 1 });

    const tradeIds = trades.map((t) => t._id);

    // Fetch attachments for these trades to check for missing screenshots
    const attachments = await Attachment.find({
      userId,
      tradeId: { $in: tradeIds },
    }).select('tradeId');

    const attachmentCounts = new Map<string, number>();
    for (const a of attachments) {
      if (a.tradeId) {
        const idStr = a.tradeId.toString();
        attachmentCounts.set(idStr, (attachmentCounts.get(idStr) || 0) + 1);
      }
    }

    // Convert trades to summary for mistake detection
    const tradeSummaries: ITradeSummaryForDetection[] = trades.map(toTradeSummary);

    // Run mistake detection across recent trades
    const detection = detectMistakeSuggestions({
      trades: tradeSummaries,
      thresholds: riskSettings,
    });

    const suggestionsByTradeId = new Map<string, any[]>();
    for (const s of detection.suggestions) {
      if (s.tradeId) {
        const list = suggestionsByTradeId.get(s.tradeId) || [];
        list.push(s);
        suggestionsByTradeId.set(s.tradeId, list);
      }
    }

    // Group trades by date to find unreviewed trading days
    const tradesByDate = new Map<string, { count: number; netPnL: number }>();
    for (const t of trades) {
      const dStr = t.tradeDate.toISOString().split('T')[0];
      const rec = tradesByDate.get(dStr) || { count: 0, netPnL: 0 };
      rec.count++;
      rec.netPnL += t.calculated?.netPnL || 0;
      tradesByDate.set(dStr, rec);
    }

    // Check which days have DailyJournals
    const dates = Array.from(tradesByDate.keys());
    const existingJournals = await DailyJournal.find({
      userId,
      date: { $in: dates },
    }).select('date');

    const journalDatesSet = new Set(existingJournals.map((j) => j.date));

    const unreviewedDays = dates
      .filter((d) => !journalDatesSet.has(d))
      .sort((a, b) => b.localeCompare(a)) // most recent first
      .map((d) => {
        const info = tradesByDate.get(d)!;
        return {
          date: d,
          tradesCount: info.count,
          netPnL: Number(info.netPnL.toFixed(2)),
          hasJournal: false,
        };
      });

    // Build the trade queue
    const queue: any[] = [];
    let missingExitCount = 0;
    let missingPsychologyCount = 0;
    let missingScreenshotsCount = 0;

    for (const t of trades) {
      const idStr = t._id.toString();
      const missing: Array<'MISSING_EXIT' | 'MISSING_PSYCHOLOGY' | 'MISSING_SCREENSHOTS'> = [];

      const quantity =
        t.simpleExecution?.quantity ??
        t.calculated?.closedQuantity ??
        t.calculated?.openQuantity ??
        0;
      const entryPrice =
        t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? 0;
      const exitPrice =
        t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice;

      // 1. Missing Exit check
      if (t.status === 'OPEN' || (!exitPrice && t.status !== 'CANCELLED')) {
        missing.push('MISSING_EXIT');
        missingExitCount++;
      }

      // 2. Missing Psychology check (only for closed trades)
      if (t.status === 'CLOSED') {
        const hasEmotions = !!(t.psychology?.emotionBefore || t.psychology?.emotionDuring || t.psychology?.emotionAfter);
        const hasNotes = !!(t.psychology?.notes || t.thesis?.entryRationale || t.psychology?.lessonsLearned);
        const hasMistakes = !!(t.psychology?.mistakes && t.psychology.mistakes.length > 0);
        if (!hasEmotions && !hasNotes && !hasMistakes) {
          missing.push('MISSING_PSYCHOLOGY');
          missingPsychologyCount++;
        }
      }

      // 3. Missing Screenshots check (only for closed trades)
      if (t.status === 'CLOSED') {
        const attachCount = attachmentCounts.get(idStr) || 0;
        if (attachCount === 0) {
          missing.push('MISSING_SCREENSHOTS');
          missingScreenshotsCount++;
        }
      }

      const suggestedMistakes = suggestionsByTradeId.get(idStr) || [];

      // If missing anything OR has suggested mistakes, include in review queue
      if (missing.length > 0 || suggestedMistakes.length > 0) {
        queue.push({
          id: idStr,
          symbol: t.symbol,
          tradeDate: t.tradeDate.toISOString().split('T')[0],
          entryTime: t.entryTime.toISOString(),
          exitTime: t.exitTime ? t.exitTime.toISOString() : undefined,
          status: t.status,
          direction: t.direction,
          strategyName: (t.strategyId as any)?.name || 'Discretionary',
          quantity,
          entryPrice,
          exitPrice,
          netPnL: t.calculated?.netPnL,
          missing,
          suggestedMistakes,
        });
      }
    }

    // Sort queue with most recent trades first
    queue.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

    // Check today's daily loss breach
    const todayStr = new Date().toISOString().split('T')[0];
    const todayClosedTrades = tradeSummaries.filter(
      (t) =>
        t.status === 'CLOSED' &&
        new Date(t.entryTime).toISOString().split('T')[0] === todayStr
    );
    const dailyLossBreach = checkDailyLossBreach(
      todayClosedTrades,
      riskSettings?.maxDailyLoss ?? 5000
    );

    return reply.send({
      success: true,
      data: {
        queue,
        unreviewedDays,
        dailyLossBreach,
        summary: {
          totalUnreviewedTrades: queue.length,
          missingExitCount,
          missingPsychologyCount,
          missingScreenshotsCount,
          unreviewedDaysCount: unreviewedDays.length,
        },
      },
    });
  });

  // GET /api/v1/review/prefill/:date - Computes prefill data for daily journal
  app.get('/prefill/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const { date } = req.params;
    const userId = req.user!.id;

    const user = await User.findById(userId);

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const trades = await Trade.find({
      userId,
      tradeDate: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ entryTime: 1 });

    const tradeSummaries: ITradeSummaryForDetection[] = trades.map(toTradeSummary);

    const prefill = calculateDailySessionSummary(
      date,
      tradeSummaries,
      user?.riskSettings
    );

    return reply.send({
      success: true,
      data: prefill,
    });
  });

  // GET /api/v1/review/suggest-mistakes/:tradeId - Rule-based mistake suggestions for a trade
  app.get('/suggest-mistakes/:tradeId', async (req: any, reply) => {
    const { tradeId } = req.params;
    const userId = req.user!.id;

    const target = await Trade.findOne({ _id: tradeId, userId });
    if (!target) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Trade not found' },
      });
    }

    const user = await User.findById(userId);

    // Fetch trades within 24h of target trade
    const windowStart = new Date(target.entryTime);
    windowStart.setHours(windowStart.getHours() - 24);

    const trades = await Trade.find({
      userId,
      entryTime: { $gte: windowStart, $lte: target.entryTime },
    }).sort({ entryTime: 1 });

    const tradeSummaries: ITradeSummaryForDetection[] = trades.map(toTradeSummary);

    const detection = detectMistakeSuggestions({
      trades: tradeSummaries,
      targetTradeId: tradeId,
      thresholds: user?.riskSettings,
    });

    return reply.send({
      success: true,
      data: detection.suggestions,
    });
  });
};
