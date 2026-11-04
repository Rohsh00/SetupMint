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
import { AccountScopeService } from '../services/account-scope.service.js';

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

  let initialBalance = new Decimal(0);
  for (const acc of accounts) {
    const c = (acc.baseCurrency || acc.currency || 'USD').toUpperCase();
    accountCurrencyMap.set(acc._id.toString(), c);
    const bal = new Decimal((acc.initialBalance || 0).toString());
    currencyBreakdown[c] = new Decimal(currencyBreakdown[c] || 0).plus(bal).toNumber();
    initialBalance = initialBalance.plus(bal);
  }

  // If no startUtc, starting equity is initial balance
  if (!startUtc) {
    return {
      startingEquity: initialBalance.toNumber(),
      currencies,
      hasMultipleCurrencies,
      currencyBreakdown,
    };
  }

  // Aggregate closed trades P&L strictly before startUtc
  const tradeMatch: any = {
    userId: uId,
    status: 'CLOSED',
    tradeDate: { $lt: startUtc },
  };
  if (accountIds) {
    tradeMatch.accountId = { $in: accountIds };
  }

  const priorTradesAgg = await Trade.aggregate([
    { $match: tradeMatch },
    { $group: { _id: '$accountId', totalNetPnL: { $sum: '$calculated.netPnL' } } },
  ]);
  let priorPnL = new Decimal(0);
  for (const row of priorTradesAgg) {
    const pnlDec = new Decimal(row.totalNetPnL || 0);
    priorPnL = priorPnL.plus(pnlDec);
    const c = row._id ? accountCurrencyMap.get(row._id.toString()) : undefined;
    if (c) {
      currencyBreakdown[c] = new Decimal(currencyBreakdown[c] || 0).plus(pnlDec).toNumber();
    }
  }

  // Aggregate cash flows strictly before startUtc
  const txMatch: any = {
    userId: uId,
    date: { $lt: startUtc },
    $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
  };
  if (accountIds) {
    txMatch.accountId = { $in: accountIds };
  }

  const priorTxAgg = await AccountTransaction.aggregate([
    { $match: txMatch },
    {
      $group: {
        _id: { accountId: '$accountId', type: '$type' },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  let priorDeposits = new Decimal(0);
  let priorWithdrawals = new Decimal(0);
  let priorAdjustments = new Decimal(0);

  for (const stat of priorTxAgg) {
    const amountDec = new Decimal(stat.totalAmount.toString());
    const txType = stat._id?.type;
    const accIdStr = stat._id?.accountId ? stat._id.accountId.toString() : undefined;
    const c = accIdStr ? accountCurrencyMap.get(accIdStr) : undefined;
    if (txType === 'DEPOSIT') {
      priorDeposits = priorDeposits.plus(amountDec);
      if (c) currencyBreakdown[c] = new Decimal(currencyBreakdown[c] || 0).plus(amountDec).toNumber();
    } else if (txType === 'WITHDRAWAL') {
      priorWithdrawals = priorWithdrawals.plus(amountDec);
      if (c) currencyBreakdown[c] = new Decimal(currencyBreakdown[c] || 0).minus(amountDec).toNumber();
    } else if (txType === 'ADJUSTMENT') {
      priorAdjustments = priorAdjustments.plus(amountDec);
      if (c) currencyBreakdown[c] = new Decimal(currencyBreakdown[c] || 0).plus(amountDec).toNumber();
    }
  }

  const startingEquity = initialBalance
    .plus(priorPnL)
    .plus(priorDeposits)
    .minus(priorWithdrawals)
    .plus(priorAdjustments)
    .toNumber();

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
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id };
    filter.accountId = { $in: accountIds };

    if (assetClass) filter.assetClass = assetClass;
    if (strategyId) filter.strategyId = strategyId;
    if (direction) filter.direction = direction;
    if (session) filter.session = session;

    const { startUtc } = normalizeRange({ startDate, endDate });
    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    // Determine starting equity: initial balance + all closed P&L and cash flows BEFORE startDate
    const equityResult = await computeStartingEquity(req.user!.id, accountIds, startUtc);
    const startingEquity = equityResult.startingEquity;

    const trades = await Trade.find(filter)
      .sort({ tradeDate: 1 })
      .populate('strategyId', 'name');

    const formattedTrades = trades.map((t) => ({
      id: t._id.toString(),
      tradeDate: t.tradeDate.toISOString().split('T')[0],
      symbol: t.symbol,
      underlying: t.underlying || t.symbol,
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

    return reply.send({
      success: true,
      data: {
        ...stats,
        hasMultipleCurrencies: equityResult.hasMultipleCurrencies,
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
    const accountIds = await AccountScopeService.resolveAccountScope(req.user!.id, scope);

    const filter: any = { userId: req.user!.id };
    filter.accountId = { $in: accountIds };

    if (assetClass) filter.assetClass = assetClass;
    if (strategyId) filter.strategyId = strategyId;
    if (direction) filter.direction = direction;
    if (session) filter.session = session;

    const { startUtc } = normalizeRange({ startDate, endDate });
    const dateClause = buildDateRangeClause({ startDate, endDate });
    if (dateClause.tradeDate) {
      filter.tradeDate = dateClause.tradeDate;
    }

    // Determine starting equity: initial balance + all closed P&L and cash flows BEFORE startDate
    const equityResult = await computeStartingEquity(req.user!.id, accountIds, startUtc);
    const startingEquity = equityResult.startingEquity;

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

    // 1. Money Equity Curve
    const dashboardStats = calculateDashboardMetrics(formattedTrades, startingEquity);
    const moneyCurve = dashboardStats.equityCurve;

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
      hasMultipleCurrencies: equityResult.hasMultipleCurrencies,
      currencyBreakdown: equityResult.currencyBreakdown,
    };

    return reply.send({ success: true, data: responseData });
  });
};

