import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import {
  calculateDashboardMetrics,
  cumulativeRCurve,
  calculateLongestDrawdownRecovery,
  calculateDailyEventMarkers,
  calculateMonteCarloBands,
  validateStrategyEdge,
  getPropFirmPreset,
  mergeRuleSetWithOverrides,
} from '@tradevault/financial-engine';
import {
  dateRangeSchema,
  buildDateRangeClause,
  normalizeRange,
} from '@tradevault/shared';
import { Trade, TradingAccount, AccountTransaction, User } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountScopeService, resolveAccountContext } from '../services/account-scope.service.js';

const CalcDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

interface StartingEquityResult {
  startingEquity: number;
  currencies: string[];
  hasMultipleCurrencies: boolean;
  currencyBreakdown: Record<string, number>;
}

async function computeStartingEquity(
  userId: string | mongoose.Types.ObjectId,
  accountIds?: mongoose.Types.ObjectId[],
  startUtc?: Date
): Promise<StartingEquityResult> {
  const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  let accounts: any[] = [];

  if (accountIds && accountIds.length > 0) {
    accounts = await TradingAccount.find({ _id: { $in: accountIds }, userId: uId });
  } else if (accountIds && accountIds.length === 0) {
    accounts = [];
  } else {
    accounts = await TradingAccount.find({ userId: uId, status: 'ACTIVE' });
  }

  const currencyBreakdown: Record<string, number> = {};
  const accountCurrencyMap = new Map<string, string>();
  const currencies = Array.from(
    new Set(accounts.map((a) => (a.baseCurrency || a.currency || 'USD').toUpperCase()))
  );
  const hasMultipleCurrencies = currencies.length > 1;

  let initialBalance = new CalcDecimal(0);
  for (const acc of accounts) {
    const c = (acc.baseCurrency || acc.currency || 'USD').toUpperCase();
    accountCurrencyMap.set(acc._id.toString(), c);
    const bal = new CalcDecimal((acc.initialBalance || 0).toString());
    currencyBreakdown[c] = new CalcDecimal(currencyBreakdown[c] || 0).plus(bal).toNumber();
    initialBalance = initialBalance.plus(bal);
  }

  // If no startUtc, starting equity is initial balance
  if (!startUtc) {
    return {
      startingEquity: Number(initialBalance.toFixed(2)),
      currencies,
      hasMultipleCurrencies,
      currencyBreakdown,
    };
  }

  // Sum closed trades P&L strictly before startUtc using isolated 30-digit CalcDecimal
  const tradeMatch: any = {
    userId: uId,
    status: 'CLOSED',
    tradeDate: { $lt: startUtc },
  };
  if (accountIds) {
    tradeMatch.accountId = { $in: accountIds };
  }

  const priorTrades = await Trade.find(tradeMatch)
    .select('accountId calculated.netPnL')
    .lean();

  let priorPnL = new CalcDecimal(0);
  for (const row of priorTrades) {
    const raw = Number(row.calculated?.netPnL ?? 0);
    if (!Number.isFinite(raw)) continue;
    const pnlDec = new CalcDecimal(raw.toFixed(2));
    priorPnL = priorPnL.plus(pnlDec);
    const c = row.accountId ? accountCurrencyMap.get(row.accountId.toString()) : undefined;
    if (c) {
      currencyBreakdown[c] = Number(new CalcDecimal(currencyBreakdown[c] || 0).plus(pnlDec).toFixed(2));
    }
  }

  // Sum confirmed cash flows strictly before startUtc (exclude PENDING_REVIEW/REJECTED and neutral TRANSFER)
  const txMatch: any = {
    userId: uId,
    date: { $lt: startUtc },
    $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
  };
  if (accountIds) {
    txMatch.accountId = { $in: accountIds };
  }

  const priorTxs = await AccountTransaction.find(txMatch)
    .select('accountId type amount')
    .lean();

  let priorDeposits = new CalcDecimal(0);
  let priorWithdrawals = new CalcDecimal(0);
  let priorAdjustments = new CalcDecimal(0);

  for (const stat of priorTxs) {
    const amountDec = new CalcDecimal(stat.amount.toString());
    const txType = stat.type;
    const accIdStr = stat.accountId ? stat.accountId.toString() : undefined;
    const c = accIdStr ? accountCurrencyMap.get(accIdStr) : undefined;
    if (txType === 'DEPOSIT') {
      priorDeposits = priorDeposits.plus(amountDec);
      if (c) currencyBreakdown[c] = Number(new CalcDecimal(currencyBreakdown[c] || 0).plus(amountDec).toFixed(2));
    } else if (txType === 'WITHDRAWAL') {
      priorWithdrawals = priorWithdrawals.plus(amountDec);
      if (c) currencyBreakdown[c] = Number(new CalcDecimal(currencyBreakdown[c] || 0).minus(amountDec).toFixed(2));
    } else if (txType === 'ADJUSTMENT') {
      priorAdjustments = priorAdjustments.plus(amountDec);
      if (c) currencyBreakdown[c] = Number(new CalcDecimal(currencyBreakdown[c] || 0).plus(amountDec).toFixed(2));
    }
  }

  const startingEquity = Number(
    initialBalance
      .plus(priorPnL)
      .plus(priorDeposits)
      .minus(priorWithdrawals)
      .plus(priorAdjustments)
      .toFixed(2)
  );

  return {
    startingEquity,
    currencies,
    hasMultipleCurrencies,
    currencyBreakdown,
  };
}

export const dashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/stats', async (req: any, reply) => {
    const { startDate, endDate, assetClass, strategyId, direction, session } = req.query;

    const dateRangeResult = dateRangeSchema.safeParse({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    if (!dateRangeResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: dateRangeResult.error.issues.map((i) => i.message).join(', ') || 'Invalid date range',
          details: dateRangeResult.error.format(),
        },
      });
    }

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIds = accountCtx.accountIds;

    const filter: any = { userId: req.user!.id };
    filter.accountId = { $in: accountIds };

    if (assetClass) filter.assetClass = assetClass;
    if (strategyId) filter.strategyId = strategyId;
    if (direction) filter.direction = direction;
    if (session) filter.session = session;

    const { startUtc, endUtc } = normalizeRange({ startDate, endDate }, accountCtx.primaryTimezone || 'Asia/Kolkata');
    const dateClause = buildDateRangeClause({ startDate, endDate }, accountCtx.primaryTimezone || 'Asia/Kolkata');
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    // Determine starting equity: initial balance + all closed P&L and cash flows BEFORE startDate
    const equityResult = await computeStartingEquity(req.user!.id, accountIds, startUtc);
    const startingEquity = equityResult.startingEquity;

    const txRangeFilter: any = {
      userId: req.user!.id,
      accountId: { $in: accountIds },
      $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
    };
    if (startUtc || endUtc) {
      txRangeFilter.date = {};
      if (startUtc) txRangeFilter.date.$gte = startUtc;
      if (endUtc) txRangeFilter.date.$lte = endUtc;
    }
    const rangeCashFlowDocs = await AccountTransaction.find(txRangeFilter)
      .select('type amount currency date')
      .lean();
    const mappedCashFlows = rangeCashFlowDocs
      .filter((tx) => tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ADJUSTMENT')
      .map((tx) => ({
        date: new Date(tx.date).toISOString().split('T')[0],
        signedAmount:
          tx.type === 'WITHDRAWAL'
            ? -Math.abs(Number(tx.amount.toString()))
            : Number(tx.amount.toString()),
        currency: (tx.currency || 'USD').toUpperCase(),
      }));

    const metricsTimezone = accountCtx.primaryTimezone || 'Asia/Kolkata';

    const trades = await Trade.find(filter)
      .sort({ tradeDate: 1 })
      .populate('strategyId', 'name');

    const formattedTrades = trades.map((t) => ({
      id: t._id.toString(),
      tradeDate: t.tradeDate.toISOString(),
      symbol: t.symbol,
      underlying: t.underlying || t.symbol,
      currency: (t.currency || 'USD').toUpperCase(),
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

    const stats = calculateDashboardMetrics(formattedTrades, startingEquity, {
      timezone: metricsTimezone,
      cashFlows: mappedCashFlows,
    });

    // Multi-currency handling: never blend money totals across distinct currencies
    const byCurrency: Record<string, any> = {};
    if (accountCtx.isMultiCurrency) {
      for (const curr of accountCtx.currencies) {
        const currTrades = formattedTrades.filter((t: any) => t.currency === curr);
        const currCashFlows = mappedCashFlows.filter((cf) => cf.currency === curr);
        const currStartingEquity = equityResult.currencyBreakdown[curr] || 0;
        byCurrency[curr] = calculateDashboardMetrics(currTrades, currStartingEquity, {
          timezone: metricsTimezone,
          cashFlows: currCashFlows,
        });
      }
    }

    return reply.send({
      success: true,
      data: {
        ...stats,
        currency: accountCtx.isSingleCurrency ? accountCtx.primaryCurrency : undefined,
        isMultiCurrency: accountCtx.isMultiCurrency,
        isCrossCurrencyWarning: accountCtx.isMultiCurrency,
        currencies: accountCtx.currencies,
        byCurrency: accountCtx.isMultiCurrency ? byCurrency : undefined,
        hasMultipleCurrencies: accountCtx.isMultiCurrency,
        currencyBreakdown: equityResult.currencyBreakdown,
      },
    });
  });

  // Multi-panel performance view endpoint: underwater, cumulative R, per-strategy overlays, cone, markers
  app.get('/equity-curves', async (req: any, reply) => {
    const {
      startDate,
      endDate,
      assetClass,
      strategyId,
      direction,
      session,
      monteCarloTrades = 100,
    } = req.query;

    const dateRangeResult = dateRangeSchema.safeParse({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    if (!dateRangeResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: dateRangeResult.error.issues.map((i) => i.message).join(', ') || 'Invalid date range',
          details: dateRangeResult.error.format(),
        },
      });
    }

    const scope = AccountScopeService.parseAccountScope(req.query);
    const accountCtx = await resolveAccountContext(req.user!.id, scope);
    const accountIds = accountCtx.accountIds;

    const filter: any = { userId: req.user!.id };
    filter.accountId = { $in: accountIds };

    if (assetClass) filter.assetClass = assetClass;
    if (strategyId) filter.strategyId = strategyId;
    if (direction) filter.direction = direction;
    if (session) filter.session = session;

    const metricsTimezone = accountCtx.primaryTimezone || 'Asia/Kolkata';
    const { startUtc, endUtc } = normalizeRange({ startDate, endDate }, metricsTimezone);
    const dateClause = buildDateRangeClause({ startDate, endDate }, metricsTimezone);
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    // Determine starting equity: initial balance + all closed P&L and cash flows BEFORE startDate
    const equityResult = await computeStartingEquity(req.user!.id, accountIds, startUtc);
    const startingEquity = equityResult.startingEquity;

    const eqTxRangeFilter: any = {
      userId: req.user!.id,
      accountId: { $in: accountIds },
      $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
    };
    if (startUtc || endUtc) {
      eqTxRangeFilter.date = {};
      if (startUtc) eqTxRangeFilter.date.$gte = startUtc;
      if (endUtc) eqTxRangeFilter.date.$lte = endUtc;
    }
    const eqCashFlowDocs = await AccountTransaction.find(eqTxRangeFilter)
      .select('type amount currency date')
      .lean();
    const eqCashFlows = eqCashFlowDocs
      .filter((tx) => tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL' || tx.type === 'ADJUSTMENT')
      .map((tx) => ({
        date: new Date(tx.date).toISOString().split('T')[0],
        signedAmount:
          tx.type === 'WITHDRAWAL'
            ? -Math.abs(Number(tx.amount.toString()))
            : Number(tx.amount.toString()),
        currency: (tx.currency || 'USD').toUpperCase(),
      }));

    // Fetch user's risk settings and resolve scope-appropriate daily loss limit
    const userDoc = await User.findById(req.user!.id).select('riskSettings');
    const scopedRisk = await AccountScopeService.resolveScopedRiskSettings(
      req.user!.id,
      accountIds,
      scope,
      userDoc?.riskSettings
    );
    const maxDailyLoss = scopedRisk.riskSettings.maxDailyLoss;

    const trades = await Trade.find(filter)
      .sort({ tradeDate: 1 })
      .populate('strategyId', 'name');

    const formattedTrades = trades.map((t) => ({
      id: t._id.toString(),
      tradeDate: t.tradeDate.toISOString().split('T')[0],
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      symbol: t.symbol,
      underlying: t.underlying || t.symbol,
      currency: (t.currency || 'USD').toUpperCase(),
      strategyId: t.strategyId?._id ? (t.strategyId as any)._id.toString() : undefined,
      strategyName: (t.strategyId as any)?.name || t.strategyName || 'Discretionary',
      status: t.status,
      session: t.session,
      quantity: t.simpleExecution?.quantity || (t.fills?.[0]?.quantity) || 1,
      entryPrice: t.simpleExecution?.entryPrice || (t.fills?.[0]?.price) || 0,
      plannedRiskAmount:
        (t.risk as any)?.riskBudgetAmount ||
        (t.risk as any)?.estimatedRiskAmount ||
        (t.risk as any)?.plannedRiskAmount,
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

    // 1. Money Equity Curve (cash-flow-safe drawdown + configured timezone)
    const dashboardStats = calculateDashboardMetrics(formattedTrades, startingEquity, {
      timezone: metricsTimezone,
      cashFlows: eqCashFlows,
    });
    const moneyCurve = dashboardStats.equityCurve;

    // Multi-currency per-currency money curves
    const byCurrencyCurves: Record<string, any> = {};
    if (accountCtx.isMultiCurrency) {
      for (const curr of accountCtx.currencies) {
        const currTrades = formattedTrades.filter((t: any) => t.currency === curr);
        const currCashFlows = eqCashFlows.filter((cf) => cf.currency === curr);
        const currStartEq = equityResult.currencyBreakdown[curr] || 0;
        byCurrencyCurves[curr] = {
          moneyCurve: calculateDashboardMetrics(currTrades, currStartEq, {
            timezone: metricsTimezone,
            cashFlows: currCashFlows,
          }).equityCurve,
          startingEquity: currStartEq,
        };
      }
    }

    // 2. Cumulative-R Curve
    const rResult = cumulativeRCurve(formattedTrades as any);

    // 3. Recovery Stats
    const recoveryStats = calculateLongestDrawdownRecovery(moneyCurve);

    // 4. Per-Strategy Overlays (Cap at 6 strategies by trade count)
    const strategyGroupMap = new Map<string, { id: string; name: string; trades: any[] }>();
    for (const t of formattedTrades) {
      const sId = t.strategyId || 'unclassified';
      const sName = t.strategyName || 'Discretionary';
      const grp = strategyGroupMap.get(sId);
      if (grp) {
        grp.trades.push(t);
      } else {
        strategyGroupMap.set(sId, { id: sId, name: sName, trades: [t] });
      }
    }

    const sortedStrategyGroups = Array.from(strategyGroupMap.values())
      .sort((a, b) => b.trades.length - a.trades.length)
      .slice(0, 6);

    const strategyOverlays = sortedStrategyGroups.map((grp) => {
      const stratRCurve = cumulativeRCurve(grp.trades);
      const closedTrades = grp.trades.filter((t) => t.status === 'CLOSED');
      const winCount = closedTrades.filter((t) => t.calculated.netPnL > 0).length;
      const winRate = closedTrades.length > 0
        ? Number(((winCount / closedTrades.length) * 100).toFixed(1))
        : 0;

      return {
        strategyId: grp.id,
        strategyName: grp.name,
        tradesCount: grp.trades.length,
        winRate,
        curve: stratRCurve.curve,
      };
    });

    // 5. Event Markers (Daily Loss Breach & High Tilt)
    const eventMarkers = calculateDailyEventMarkers(formattedTrades as any, maxDailyLoss);

    // 6. Monte Carlo Expectancy Cone
    const closedTrades = formattedTrades.filter((t) => t.status === 'CLOSED');
    const eligibleRMultiples: number[] = [];
    for (const t of closedTrades) {
      if (t.calculated?.realizedRMultiple !== undefined && Number.isFinite(t.calculated.realizedRMultiple)) {
        eligibleRMultiples.push(t.calculated.realizedRMultiple);
      } else if (t.calculated?.netPnL && t.plannedRiskAmount && t.plannedRiskAmount > 0) {
        eligibleRMultiples.push(Number((t.calculated.netPnL / t.plannedRiskAmount).toFixed(4)));
      }
    }

    const tradesPerPathNum = Math.min(200, Math.max(50, Number(monteCarloTrades) || 100));

    // Validate edge verdict for honest gating
    const edgeResult = validateStrategyEdge(
      closedTrades.map((t) => ({
        id: t.id,
        tradeDate: t.tradeDate,
        status: t.status,
        netPnL: t.calculated.netPnL,
        plannedRiskAmount: t.plannedRiskAmount,
        realizedRMultiple: t.calculated.realizedRMultiple,
      }))
    );

    const monteCarloCone = calculateMonteCarloBands(eligibleRMultiples, {
      tradesPerPath: tradesPerPathNum,
      initialEquity: startingEquity,
      iterations: 10000,
      seed: 42,
    });

    const isLowSample = eligibleRMultiples.length < 30 || edgeResult.verdict === 'UNPROVEN';
    let coneWarning: string | undefined;
    if (edgeResult.verdict === 'NO_EDGE_NEGATIVE') {
      coneWarning = 'Negative historical expectancy detected. Projection shows high risk of persistent capital drawdown.';
    } else if (isLowSample) {
      coneWarning = `Low sample size (N = ${eligibleRMultiples.length}/30 trades). Projection is not evidence of future statistical results.`;
    }

    // 7. Prop Reference Lines (Max Loss floor, Profit Target, SOD Daily Loss floor)
    // Only populate in PROP_FIRM scope or when viewing a single PROP_FIRM account
    let propReferenceLines: any = undefined;
    if (
      (scope.mode === 'PROP_FIRM' || scope.mode === 'ACCOUNT') &&
      accountIds.length > 0
    ) {
      const propAccounts = await TradingAccount.find({
        _id: { $in: accountIds },
        userId: req.user!.id,
        $or: [
          { accountType: 'PROP_FIRM' },
          { 'propFirm.firmKey': { $exists: true, $nin: [null, ''] } },
          { 'propFirmConfig.enabled': true },
        ],
      });

      if (
        propAccounts.length > 0 &&
        (scope.mode === 'PROP_FIRM' || propAccounts.length === accountIds.length)
      ) {
        const primary = propAccounts[0];
        const firmKey = primary.propFirm?.firmKey || primary.propFirmConfig?.firm || 'the5ers';
        const planKey = primary.propFirm?.planKey || primary.propFirmConfig?.planName;
        const preset = getPropFirmPreset(firmKey, planKey);
        const ruleSet = preset
          ? mergeRuleSetWithOverrides(preset, primary.propFirm?.ruleSetOverrides)
          : (primary.propFirm?.ruleSetOverrides as any);
        const startBal = Number(primary.propFirm?.startingBalance || primary.initialBalance || 100000);

        const rawPhase = primary.propFirm?.phase;
        const phaseNum = typeof rawPhase === 'number' ? rawPhase : 1;
        const phaseRule = ruleSet?.phases?.[phaseNum - 1] || ruleSet?.phases?.[0];
        const profitTargetPct = phaseRule?.profitTargetPct ?? (primary.propFirmConfig?.targetProfitPercent ?? undefined);
        const maxLossPct =
          ruleSet?.maxLoss?.limitPct ??
          primary.propFirmConfig?.maxLossLimitPercent ??
          undefined;
        const dailyLossPct =
          ruleSet?.dailyLoss?.limitPct ??
          primary.propFirmConfig?.dailyLossLimitPercent ??
          undefined;

        propReferenceLines = {
          startingBalance: startBal,
          profitTarget: profitTargetPct !== undefined ? Number(new Decimal(startBal).times(1 + profitTargetPct / 100).toFixed(2)) : undefined,
          maxLossFloor: maxLossPct !== undefined ? Number(new Decimal(startBal).times(1 - maxLossPct / 100).toFixed(2)) : undefined,
          dailyLossFloor: dailyLossPct !== undefined ? Number(new Decimal(startBal).times(1 - dailyLossPct / 100).toFixed(2)) : undefined,
        };
      }
    }

    const responseData = {
      moneyCurve,
      cumulativeRCurve: {
        curve: rResult.curve,
        coveragePercent: rResult.coveragePercent,
        coverageText: rResult.coverageText,
        eligibleTrades: rResult.eligibleTrades,
        totalTrades: rResult.totalTrades,
        excludedTrades: rResult.excludedTrades,
      },
      recoveryStats: {
        currentDrawdown: recoveryStats.currentDrawdown,
        currentDrawdownPercent: recoveryStats.currentDrawdownPercent,
        maxDrawdown: recoveryStats.maxDrawdown,
        maxDrawdownPercent: recoveryStats.maxDrawdownPercent,
        longestRecoveryDays: recoveryStats.longestRecoveryDays,
        longestRecoveryPoints: recoveryStats.longestRecoveryPoints,
      },
      strategyOverlays,
      monteCarloCone,
      coneMeta: {
        sampleSize: eligibleRMultiples.length,
        edgeVerdict: edgeResult.verdict,
        isLowSample,
        warning: coneWarning,
        tradesPerPath: tradesPerPathNum,
      },
      eventMarkers,
      startingEquity,
      propReferenceLines,
      currency: accountCtx.isSingleCurrency ? accountCtx.primaryCurrency : undefined,
      isMultiCurrency: accountCtx.isMultiCurrency,
      currencies: accountCtx.currencies,
      byCurrencyCurves: accountCtx.isMultiCurrency ? byCurrencyCurves : undefined,
      hasMultipleCurrencies: equityResult.hasMultipleCurrencies,
      currencyBreakdown: equityResult.currencyBreakdown,
    };

    return reply.send({ success: true, data: responseData });
  });
};

