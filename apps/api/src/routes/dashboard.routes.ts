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
} from '@tradevault/financial-engine';
import {
  dateRangeSchema,
  buildDateRangeClause,
  normalizeRange,
} from '@tradevault/shared';
import { Trade, TradingAccount, AccountTransaction, User } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';

async function computeStartingEquity(
  userId: string | mongoose.Types.ObjectId,
  accountId?: string,
  startUtc?: Date
): Promise<number> {
  const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  let initialBalance = new Decimal(0);

  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    const acc = await TradingAccount.findOne({ _id: accountId, userId: uId });
    if (acc) initialBalance = new Decimal(acc.initialBalance.toString());
  } else {
    const accounts = await TradingAccount.find({ userId: uId });
    initialBalance = accounts.reduce(
      (sum, a) => sum.plus(new Decimal(a.initialBalance.toString())),
      new Decimal(0)
    );
  }

  // If no startUtc, starting equity is initial balance
  if (!startUtc) {
    return initialBalance.toNumber();
  }

  // Aggregate closed trades P&L strictly before startUtc
  const tradeMatch: any = {
    userId: uId,
    status: 'CLOSED',
    tradeDate: { $lt: startUtc },
  };
  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    tradeMatch.accountId = new mongoose.Types.ObjectId(accountId);
  }

  const priorTradesAgg = await Trade.aggregate([
    { $match: tradeMatch },
    { $group: { _id: null, totalNetPnL: { $sum: '$calculated.netPnL' } } },
  ]);
  const priorPnL = new Decimal(priorTradesAgg[0]?.totalNetPnL || 0);

  // Aggregate cash flows strictly before startUtc
  const txMatch: any = {
    userId: uId,
    date: { $lt: startUtc },
    $or: [{ status: 'CONFIRMED' }, { status: { $exists: false } }],
  };
  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    txMatch.accountId = new mongoose.Types.ObjectId(accountId);
  }

  const priorTxAgg = await AccountTransaction.aggregate([
    { $match: txMatch },
    { $group: { _id: '$type', totalAmount: { $sum: '$amount' } } },
  ]);

  let priorDeposits = new Decimal(0);
  let priorWithdrawals = new Decimal(0);
  let priorAdjustments = new Decimal(0);

  for (const stat of priorTxAgg) {
    const amountDec = new Decimal(stat.totalAmount.toString());
    if (stat._id === 'DEPOSIT') {
      priorDeposits = priorDeposits.plus(amountDec);
    } else if (stat._id === 'WITHDRAWAL') {
      priorWithdrawals = priorWithdrawals.plus(amountDec);
    } else if (stat._id === 'ADJUSTMENT') {
      priorAdjustments = priorAdjustments.plus(amountDec);
    }
  }

  return initialBalance
    .plus(priorPnL)
    .plus(priorDeposits)
    .minus(priorWithdrawals)
    .plus(priorAdjustments)
    .toNumber();
}

export const dashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/stats', async (req: any, reply) => {
    const { startDate, endDate, accountId, assetClass, strategyId, direction, session } = req.query;

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

    const filter: any = { userId: req.user!.id };

    if (accountId) filter.accountId = accountId;
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
    const startingEquity = await computeStartingEquity(req.user!.id, accountId, startUtc);

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

    return reply.send({ success: true, data: stats });
  });

  // Multi-panel performance view endpoint: underwater, cumulative R, per-strategy overlays, cone, markers
  app.get('/equity-curves', async (req: any, reply) => {
    const {
      startDate,
      endDate,
      accountId,
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

    const filter: any = { userId: req.user!.id };
    if (accountId) filter.accountId = accountId;
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
    const startingEquity = await computeStartingEquity(req.user!.id, accountId, startUtc);

    // Fetch user's risk settings for daily loss limit
    const userDoc = await User.findById(req.user!.id).select('riskSettings');
    const maxDailyLoss = userDoc?.riskSettings?.maxDailyLoss ?? 5000;

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
    };

    return reply.send({ success: true, data: responseData });
  });
};

