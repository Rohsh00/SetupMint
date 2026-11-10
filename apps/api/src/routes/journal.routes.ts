import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dailyJournalSchema } from '@tradevault/shared';
import { calculateDailySessionSummary, addByCurrency, byCurrencyToNumbers } from '@tradevault/financial-engine';
import { DailyJournal, Trade, User } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateDateParam } from '../middleware/validate.js';
import { AccountScopeService, resolveAccountContext } from '../services/account-scope.service.js';
import Decimal from 'decimal.js';

export const journalRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Get calendar summary for a month
  app.get('/calendar', async (req: any, reply) => {
    const { yearMonth } = req.query; // format 'YYYY-MM'
    const currentYM = yearMonth || new Date().toISOString().slice(0, 7);

    const [yearStr, monthStr] = currentYM.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);

    // Aggregate trades by day
    const tradeFilter: any = {
      userId: req.user!.id,
      tradeDate: { $gte: startOfMonth, $lte: endOfMonth },
      accountId: { $in: accountCtx.accountIds },
    };

    const trades = await Trade.find(tradeFilter);

    const dayMap = new Map<
      string,
      {
        netPnL: number;
        totalR: number;
        tradesCount: number;
        winCount: number;
        lossCount: number;
        byCurrency: Record<string, Decimal>;
      }
    >();

    const monthByCurrency: Record<string, Decimal> = {};

    for (const t of trades) {
      const dStr = t.tradeDate.toISOString().split('T')[0];
      const rec = dayMap.get(dStr) ?? {
        netPnL: 0,
        totalR: 0,
        tradesCount: 0,
        winCount: 0,
        lossCount: 0,
        byCurrency: {},
      };
      const pnl = t.calculated?.netPnL || 0;
      const r = t.calculated?.realizedRMultiple ?? 0;
      const curr = (t.currency || accountCtx.primaryCurrency || 'USD').toUpperCase();

      rec.netPnL += pnl;
      rec.totalR += r;
      rec.tradesCount++;
      if (pnl > 0) rec.winCount++;
      else if (pnl < 0) rec.lossCount++;

      addByCurrency(rec.byCurrency, pnl, curr);
      addByCurrency(monthByCurrency, pnl, curr);

      dayMap.set(dStr, rec);
    }

    // Determine scope key for journals
    const scopeKey = accountCtx.accountIds.length === 1 ? accountCtx.accountIdsStr[0] : (scope.mode || 'ALL');

    // Get journal reviews for the month matching scope
    const journals = await DailyJournal.find({
      userId: req.user!.id,
      date: new RegExp(`^${currentYM}`),
      $or: [{ scopeKey }, { scopeKey: 'ALL' }],
    });

    const journalMap = new Map<string, any>();
    for (const j of journals) {
      // Prefer exact account scope over ALL
      if (!journalMap.has(j.date) || j.scopeKey === scopeKey) {
        journalMap.set(j.date, j);
      }
    }

    // Build day items
    const days: any[] = [];
    const numDays = new Date(year, month, 0).getDate();

    for (let d = 1; d <= numDays; d++) {
      const dayFormatted = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${currentYM}-${dayFormatted}`;
      const dayData = dayMap.get(dateStr) ?? {
        netPnL: 0,
        totalR: 0,
        tradesCount: 0,
        winCount: 0,
        lossCount: 0,
        byCurrency: {},
      };
      const journalEntry = journalMap.get(dateStr);

      days.push({
        date: dateStr,
        dayNumber: d,
        netPnL: accountCtx.isMultiCurrency ? 0 : Number(dayData.netPnL.toFixed(2)),
        byCurrency: byCurrencyToNumbers(dayData.byCurrency),
        totalR: Number(dayData.totalR.toFixed(2)),
        tradesCount: dayData.tradesCount,
        winCount: dayData.winCount,
        lossCount: dayData.lossCount,
        hasJournal: !!journalEntry,
        disciplineRating: journalEntry?.disciplineRating,
        marketBias: journalEntry?.marketBias,
        emotionalState: journalEntry?.emotionalState,
        mistakes: journalEntry?.mistakes || [],
        mistakesCount: journalEntry?.mistakes?.length || 0,
        lessonsLearned: journalEntry?.lessonsLearned || '',
        marketConditions: journalEntry?.marketConditions || '',
      });
    }

    return reply.send({
      success: true,
      data: {
        yearMonth: currentYM,
        days,
        currency: accountCtx.isSingleCurrency ? accountCtx.primaryCurrency : undefined,
        isMultiCurrency: accountCtx.isMultiCurrency,
        monthByCurrency: byCurrencyToNumbers(monthByCurrency),
      },
    });
  });

  // Get daily review for specific date
  app.get('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const { date } = req.params; // format YYYY-MM-DD
    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIdSet = new Set(accountCtx.accountIdsStr);

    const scopeKey = accountCtx.accountIds.length === 1 ? accountCtx.accountIdsStr[0] : (scope.mode || 'ALL');

    const journal = await DailyJournal.findOne({
      userId: req.user!.id,
      date,
      $or: [{ scopeKey }, { scopeKey: 'ALL' }],
    })
      .sort({ scopeKey: scopeKey === 'ALL' ? 1 : -1 })
      .populate('bestTradeId', 'symbol calculated.netPnL accountId currency')
      .populate('worstTradeId', 'symbol calculated.netPnL accountId currency');

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    let scopedJournal: any = null;
    if (journal) {
      scopedJournal = journal.toObject();
      const bestAccId = (scopedJournal.bestTradeId as any)?.accountId?.toString();
      if (bestAccId && !accountIdSet.has(bestAccId)) {
        scopedJournal.bestTradeId = null;
      }
      const worstAccId = (scopedJournal.worstTradeId as any)?.accountId?.toString();
      if (worstAccId && !accountIdSet.has(worstAccId)) {
        scopedJournal.worstTradeId = null;
      }
    }

    const trades = await Trade.find({
      userId: req.user!.id,
      tradeDate: { $gte: startOfDay, $lte: endOfDay },
      accountId: { $in: accountCtx.accountIds },
    }).sort({ entryTime: 1 });

    const totalNetPnL = trades.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);
    const byCurrency: Record<string, Decimal> = {};
    for (const t of trades) {
      const curr = (t.currency || accountCtx.primaryCurrency || 'USD').toUpperCase();
      addByCurrency(byCurrency, t.calculated?.netPnL || 0, curr);
    }

    const user = await User.findById(req.user!.id);
    const scopedRisk = await AccountScopeService.resolveScopedRiskSettings(
      req.user!.id,
      accountCtx.accountIds,
      scope,
      user?.riskSettings
    );
    const tradeSummaries = trades.map((t) => ({
      id: t._id.toString(),
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      quantity:
        t.simpleExecution?.quantity ??
        t.calculated?.closedQuantity ??
        t.calculated?.openQuantity ??
        0,
      entryPrice:
        t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? 0,
      exitPrice:
        t.simpleExecution?.exitPrice ?? t.calculated?.averageExitPrice,
      netPnL: t.calculated?.netPnL,
      plannedRiskAmount:
        t.risk?.estimatedRiskAmount ?? t.risk?.riskBudgetAmount,
      riskPercent:
        t.risk?.riskPercentage ?? t.risk?.riskAsPercentOfEquity,
      mistakes: t.psychology?.mistakes || [],
    }));

    const prefill = calculateDailySessionSummary(date, tradeSummaries, scopedRisk.riskSettings);

    return reply.send({
      success: true,
      data: {
        date,
        journal: scopedJournal,
        trades,
        summary: {
          tradesCount: trades.length,
          netPnL: accountCtx.isMultiCurrency ? 0 : Number(totalNetPnL.toFixed(2)),
          byCurrency: byCurrencyToNumbers(byCurrency),
          isMultiCurrency: accountCtx.isMultiCurrency,
          currency: accountCtx.isSingleCurrency ? accountCtx.primaryCurrency : undefined,
        },
        prefill,
      },
    });
  });

  // Upsert daily review
  app.post('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const parseResult = dailyJournalSchema.safeParse({ ...req.body, date: req.params.date });
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid journal review', details: parseResult.error.format() },
      });
    }

    const { date, ...rest } = parseResult.data;
    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const scopeKey = accountCtx.accountIds.length === 1 ? accountCtx.accountIdsStr[0] : (scope.mode || 'ALL');
    const accountId = accountCtx.accountIds.length === 1 ? accountCtx.accountIds[0] : undefined;

    const journal = await DailyJournal.findOneAndUpdate(
      { userId: req.user!.id, date, scopeKey },
      { $set: { ...rest, scopeKey, accountId } },
      { upsert: true, new: true }
    );

    return reply.send({ success: true, data: journal });
  });

  // Delete daily review
  app.delete('/:date', { preHandler: [validateDateParam('date')] }, async (req: any, reply) => {
    const { date } = req.params;
    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const scopeKey = accountCtx.accountIds.length === 1 ? accountCtx.accountIdsStr[0] : (scope.mode || 'ALL');

    await DailyJournal.deleteOne({ userId: req.user!.id, date, scopeKey });
    return reply.send({ success: true, message: 'Journal entry deleted' });
  });
};
