import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';

import {
  detectMistakeSuggestions,
  checkDailyLossBreach,
  calculateDailySessionSummary,
  buildWeeklyReview,
  evaluateFocusRule,
  WeeklyReviewTradeInput,
  ITradeSummaryForDetection,
} from '@tradevault/financial-engine';
import {
  isoWeekToRange,
  dateToIsoWeek,
  getAdjacentIsoWeek,
  buildDateRangeClause,
  weeklyReviewWeekRegex,
  saveWeeklyReviewSchema,
} from '@tradevault/shared';
import {
  User,
  Trade,
  DailyJournal,
  Attachment,
  WeeklyReview,
  TradeTemplate,
  Strategy,
  ITradeDoc,
} from '../db/models/index.js';
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
    setup: t.setup,
    excursion: t.calculated?.excursion,
    stopLossMoved: (t.calculated as any)?.stopLossMoved ?? (t as any).tradeManagement?.stopLossMoved,
    stopMoveSummary: t.calculated?.stopMoveSummary,
    stopLossMoveEvents: (t as any).stopLossMoveEvents,
    tickSize: 0.05,
  };
}

function toWeeklyReviewTrade(t: any): WeeklyReviewTradeInput {
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
  const mistakes = t.psychology?.mistakes || [];

  return {
    id: t._id ? t._id.toString() : t.id,
    symbol: t.symbol,
    tradeDate: t.tradeDate,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    status: t.status,
    direction: t.direction,
    session: t.session,
    templateId: t.templateId,
    strategyId: t.strategyId?._id ? t.strategyId._id.toString() : t.strategyId?.toString(),
    strategyName: t.strategyId?.name || t.strategyName,
    quantity,
    entryPrice,
    exitPrice,
    netPnL: t.calculated?.netPnL,
    grossPnL: t.calculated?.grossPnL,
    totalCosts: t.calculated?.totalCosts,
    realizedRMultiple: t.calculated?.realizedRMultiple,
    plannedRiskAmount,
    psychology: {
      disciplineScore: t.psychology?.disciplineScore,
      disciplineRating: t.psychology?.disciplineRating,
      mistakes,
      rulesFollowed: t.psychology?.rulesFollowed,
    },
    mistakes,
    setup: t.setup,
  };
}

async function computeWeeklySnapshot(
  userId: mongoose.Types.ObjectId | string,
  week: string,
  targetAccountId: mongoose.Types.ObjectId | null
) {
  const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const { startDate, endDate } = isoWeekToRange(week);
  const dateClause = buildDateRangeClause({ startDate, endDate });

  const tradeFilter: any = { userId: uId, ...dateClause };
  if (targetAccountId) {
    tradeFilter.accountId = targetAccountId;
  }

  const prevWeek = getAdjacentIsoWeek(week, -1);
  const prevRange = isoWeekToRange(prevWeek);
  const prevDateClause = buildDateRangeClause({
    startDate: prevRange.startDate,
    endDate: prevRange.endDate,
  });

  const prevTradeFilter: any = { userId: uId, ...prevDateClause };
  if (targetAccountId) {
    prevTradeFilter.accountId = targetAccountId;
  }

  const [trades, prevTrades, user, templates, strategies, dailyJournals, prevReviewDoc] =
    await Promise.all([
      Trade.find(tradeFilter).populate('strategyId', 'name').sort({ tradeDate: 1 }),
      Trade.find(prevTradeFilter).populate('strategyId', 'name').sort({ tradeDate: 1 }),
      User.findById(uId),
      TradeTemplate.find({ userId: { $in: [uId, null] }, isActive: true }).select(
        'name tags group'
      ),
      Strategy.find({ userId: uId, isActive: true }).select('name'),
      DailyJournal.find({ userId: uId, date: { $gte: startDate, $lte: endDate } }),
      WeeklyReview.findOne({ userId: uId, week: prevWeek, accountId: targetAccountId }),
    ]);

  const mappedTrades = trades.map(toWeeklyReviewTrade);
  const mappedPrevTrades = prevTrades.map(toWeeklyReviewTrade);
  const riskSettings = user?.riskSettings;

  const previousFocusRule = prevReviewDoc?.focusRule || null;

  const snapshot = buildWeeklyReview({
    week,
    startDate,
    endDate,
    trades: mappedTrades,
    previousWeekTrades: mappedPrevTrades,
    riskSettings,
    accountEquity: 0,
    templates: templates.map((t) => ({ id: t._id.toString(), name: t.name })),
    strategies: strategies.map((s) => ({ id: s._id.toString(), name: s.name })),
    dailyJournals: dailyJournals.map((j) => ({
      id: j._id.toString(),
      date: j.date,
      disciplineRating: j.disciplineRating,
      notes: j.notes,
      mistakes: j.mistakes,
    })),
    previousFocusRule,
  });

  const previousFocusEvaluation = evaluateFocusRule(previousFocusRule, mappedTrades, riskSettings);

  return {
    week,
    startDate,
    endDate,
    targetAccountId,
    snapshot,
    previousFocusRule,
    previousFocusEvaluation,
    riskSettings,
    mappedTrades,
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
      const missing: Array<'MISSING_EXIT' | 'MISSING_PSYCHOLOGY' | 'MISSING_SCREENSHOTS' | 'SL_AMBIGUOUS'> = [];

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

      // 4. Ambiguous SL check (do not auto-apply, require confirmation)
      const isSlAmbiguous = Boolean(
        t.risk?.slReviewReason ||
          (t.auditLog && t.auditLog.some((a: any) => a.action === 'SL_MATCH_AMBIGUOUS'))
      );
      if (isSlAmbiguous && !t.risk?.initialStopLoss) {
        missing.push('SL_AMBIGUOUS');
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
          reviewReasons: t.risk?.slReviewReason ? [t.risk.slReviewReason] : undefined,
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

  // GET /api/v1/review/weekly - Single review if ?week=YYYY-Www, or list of last 12 reviews
  app.get('/weekly', async (req: any, reply) => {
    const userId = req.user!.id;
    const { week, accountId } = req.query;

    if (week) {
      if (!weeklyReviewWeekRegex.test(week)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid week format: ${week}. Expected YYYY-Www (e.g. 2026-W43)`,
          },
        });
      }

      const targetAccountId =
        accountId && mongoose.Types.ObjectId.isValid(accountId)
          ? new mongoose.Types.ObjectId(accountId)
          : null;

      const existingReview = await WeeklyReview.findOne({
        userId,
        week,
        accountId: targetAccountId,
      });

      if (existingReview && existingReview.status === 'FINALIZED') {
        const prevWeek = getAdjacentIsoWeek(week, -1);
        const prevDoc = await WeeklyReview.findOne({
          userId,
          week: prevWeek,
          accountId: targetAccountId,
        });
        const prevFocusRule = prevDoc?.focusRule || null;

        return reply.send({
          success: true,
          data: {
            id: existingReview._id.toString(),
            week: existingReview.week,
            startDate: existingReview.startDate,
            endDate: existingReview.endDate,
            accountId: existingReview.accountId?.toString() || null,
            snapshot: existingReview.snapshot,
            focusRule: existingReview.focusRule,
            previousFocusRule: prevFocusRule,
            previousFocusEvaluation: existingReview.previousFocusEvaluation,
            notes: existingReview.notes || '',
            status: existingReview.status,
            generatedAt: existingReview.generatedAt,
          },
        });
      }

      const computed = await computeWeeklySnapshot(userId, week, targetAccountId);

      return reply.send({
        success: true,
        data: {
          id: existingReview?._id ? existingReview._id.toString() : undefined,
          week: computed.week,
          startDate: computed.startDate,
          endDate: computed.endDate,
          accountId: targetAccountId?.toString() || null,
          snapshot: computed.snapshot,
          focusRule: existingReview?.focusRule || computed.snapshot.focusRuleSuggestion,
          previousFocusRule: computed.previousFocusRule,
          previousFocusEvaluation: computed.previousFocusEvaluation,
          notes: existingReview?.notes || '',
          status: existingReview?.status || 'DRAFT',
          generatedAt: existingReview?.generatedAt || new Date().toISOString(),
        },
      });
    }

    // List recent reviews (last 12)
    const targetAccountId =
      accountId && mongoose.Types.ObjectId.isValid(accountId)
        ? new mongoose.Types.ObjectId(accountId)
        : null;

    const filter: any = { userId };
    if (targetAccountId) {
      filter.accountId = targetAccountId;
    }

    const reviews = await WeeklyReview.find(filter).sort({ week: -1 }).limit(12);

    const reviewList = reviews.map((doc) => ({
      id: doc._id.toString(),
      week: doc.week,
      startDate: doc.startDate,
      endDate: doc.endDate,
      accountId: doc.accountId?.toString() || null,
      status: doc.status,
      netPnL: doc.snapshot?.weekSummary?.netPnL ?? 0,
      winRate: doc.snapshot?.weekSummary?.winRate ?? 0,
      tradeCount: doc.snapshot?.weekSummary?.tradeCount ?? 0,
      avgR: doc.snapshot?.weekSummary?.avgRealizedR ?? 0,
      discipline: doc.snapshot?.discipline?.averageRating ?? 0,
      focusRule: doc.focusRule,
      previousFocusEvaluation: doc.previousFocusEvaluation,
      generatedAt: doc.generatedAt,
    }));

    return reply.send({
      success: true,
      data: reviewList,
    });
  });

  // GET /api/v1/review/weekly/:week - Direct route for week review
  app.get('/weekly/:week', async (req: any, reply) => {
    const { week } = req.params;
    const userId = req.user!.id;
    const { accountId } = req.query;

    if (!weeklyReviewWeekRegex.test(week)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid week format: ${week}. Expected YYYY-Www (e.g. 2026-W43)`,
        },
      });
    }

    const targetAccountId =
      accountId && mongoose.Types.ObjectId.isValid(accountId)
        ? new mongoose.Types.ObjectId(accountId)
        : null;

    const existingReview = await WeeklyReview.findOne({
      userId,
      week,
      accountId: targetAccountId,
    });

    if (existingReview && existingReview.status === 'FINALIZED') {
      const prevWeek = getAdjacentIsoWeek(week, -1);
      const prevDoc = await WeeklyReview.findOne({
        userId,
        week: prevWeek,
        accountId: targetAccountId,
      });
      const prevFocusRule = prevDoc?.focusRule || null;

      return reply.send({
        success: true,
        data: {
          id: existingReview._id.toString(),
          week: existingReview.week,
          startDate: existingReview.startDate,
          endDate: existingReview.endDate,
          accountId: existingReview.accountId?.toString() || null,
          snapshot: existingReview.snapshot,
          focusRule: existingReview.focusRule,
          previousFocusRule: prevFocusRule,
          previousFocusEvaluation: existingReview.previousFocusEvaluation,
          notes: existingReview.notes || '',
          status: existingReview.status,
          generatedAt: existingReview.generatedAt,
        },
      });
    }

    const computed = await computeWeeklySnapshot(userId, week, targetAccountId);

    return reply.send({
      success: true,
      data: {
        id: existingReview?._id ? existingReview._id.toString() : undefined,
        week: computed.week,
        startDate: computed.startDate,
        endDate: computed.endDate,
        accountId: targetAccountId?.toString() || null,
        snapshot: computed.snapshot,
        focusRule: existingReview?.focusRule || computed.snapshot.focusRuleSuggestion,
        previousFocusRule: computed.previousFocusRule,
        previousFocusEvaluation: computed.previousFocusEvaluation,
        notes: existingReview?.notes || '',
        status: existingReview?.status || 'DRAFT',
        generatedAt: existingReview?.generatedAt || new Date().toISOString(),
      },
    });
  });

  // POST /api/v1/review/weekly/:week - Upsert review, save focusRule, notes, status
  app.post('/weekly/:week', async (req: any, reply) => {
    const { week } = req.params;
    const userId = req.user!.id;

    if (!weeklyReviewWeekRegex.test(week)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid week format: ${week}` },
      });
    }

    const bodyParsed = saveWeeklyReviewSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: bodyParsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const { focusRule, notes, status = 'DRAFT', accountId, followedLastRule } = bodyParsed.data;
    const targetAccountId =
      accountId && mongoose.Types.ObjectId.isValid(accountId)
        ? new mongoose.Types.ObjectId(accountId)
        : null;

    const existing = await WeeklyReview.findOne({ userId, week, accountId: targetAccountId });

    let snapshotToSave: any;
    let previousFocusEvaluation: any;

    if (existing && existing.status === 'FINALIZED') {
      // FINALIZED snapshot stays immutable after new trades are added
      snapshotToSave = existing.snapshot;
      previousFocusEvaluation = existing.previousFocusEvaluation;
    } else {
      // Generate live snapshot
      const computed = await computeWeeklySnapshot(userId, week, targetAccountId);
      snapshotToSave = computed.snapshot;
      previousFocusEvaluation = computed.previousFocusEvaluation;
    }

    if (followedLastRule !== undefined && followedLastRule !== null) {
      previousFocusEvaluation = {
        ...(previousFocusEvaluation || {}),
        followed: followedLastRule,
        note: previousFocusEvaluation?.note || 'Manually reviewed by trader',
      };
    }

    const range = isoWeekToRange(week);

    const updateFields: any = {
      userId,
      week,
      startDate: existing?.startDate || range.startDate,
      endDate: existing?.endDate || range.endDate,
      accountId: targetAccountId,
      snapshot: snapshotToSave,
      status,
      notes: notes !== undefined ? notes : existing?.notes,
      focusRule: focusRule || existing?.focusRule || snapshotToSave.focusRuleSuggestion,
      previousFocusEvaluation,
    };

    if (status === 'FINALIZED' && (!existing || existing.status !== 'FINALIZED')) {
      updateFields.generatedAt = new Date();
    } else if (!existing) {
      updateFields.generatedAt = new Date();
    }

    const doc = await WeeklyReview.findOneAndUpdate(
      { userId, week, accountId: targetAccountId },
      { $set: updateFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return reply.send({
      success: true,
      data: doc,
    });
  });
};

