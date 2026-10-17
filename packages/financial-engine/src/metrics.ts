import Decimal from 'decimal.js';
import { ITrade, IDashboardStats, TradingSession } from '@tradevault/shared';

export interface PerformanceInputTrade {
  id: string;
  tradeDate: string;
  symbol: string;
  strategyId?: string;
  strategyName?: string;
  status: string;
  session?: TradingSession;
  calculated: {
    netPnL: number;
    grossPnL: number;
    totalCosts: number;
    realizedRMultiple?: number;
    holdingTimeMinutes?: number;
    outcome: string;
  };
  psychology?: {
    rulesFollowed?: boolean;
    disciplineScore?: number;
  };
}

export function calculateDashboardMetrics(
  trades: PerformanceInputTrade[],
  initialBalance = 0
): IDashboardStats {
  // Filter only closed trades for closed performance metrics
  const closedTrades = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

  const openTrades = trades.filter((t) => t.status === 'OPEN');

  let totalNetPnL = new Decimal(0);
  let totalGrossPnL = new Decimal(0);
  let totalCosts = new Decimal(0);

  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;

  let sumWinningPnL = new Decimal(0);
  let sumLosingPnL = new Decimal(0);

  let sumRealizedR = new Decimal(0);
  let rCount = 0;

  let sumHoldingMinutes = 0;
  let holdingCount = 0;

  let rulesFollowedCount = 0;

  // Track streaks
  let currentStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;

  // Track daily P&L
  const dailyMap = new Map<string, { netPnL: Decimal; count: number; wins: number; losses: number }>();
  // Track monthly P&L
  const monthlyMap = new Map<string, { netPnL: Decimal; count: number; wins: number }>();
  // Track instrument performance
  const symbolMap = new Map<string, { netPnL: Decimal; count: number; wins: number; sumWin: Decimal; sumLoss: Decimal }>();
  // Track strategy performance
  const strategyMap = new Map<string, { name: string; netPnL: Decimal; count: number; wins: number; sumWin: Decimal; sumLoss: Decimal }>();
  // Track weekday
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayMap = new Map<string, { netPnL: Decimal; count: number; wins: number }>();
  // Track session
  const sessionMap = new Map<TradingSession, { netPnL: Decimal; count: number; wins: number }>();

  // Equity curve tracking
  let runningEquity = new Decimal(initialBalance);
  let peakEquity = runningEquity;
  let maxDrawdownAmount = new Decimal(0);
  let maxDrawdownPercent = new Decimal(0);

  const equityCurve: IDashboardStats['equityCurve'] = [
    {
      date: closedTrades.length > 0 ? closedTrades[0].tradeDate : new Date().toISOString().split('T')[0],
      netPnL: 0,
      cumulativeEquity: runningEquity.toNumber(),
      drawdown: 0,
      drawdownPercent: 0,
    },
  ];

  for (const trade of closedTrades) {
    const pnl = new Decimal(trade.calculated.netPnL ?? 0);
    const gross = new Decimal(trade.calculated.grossPnL ?? 0);
    const costs = new Decimal(trade.calculated.totalCosts ?? 0);

    totalNetPnL = totalNetPnL.plus(pnl);
    totalGrossPnL = totalGrossPnL.plus(gross);
    totalCosts = totalCosts.plus(costs);

    if (pnl.greaterThan(0)) {
      winCount++;
      sumWinningPnL = sumWinningPnL.plus(pnl);

      tempWinStreak++;
      tempLossStreak = 0;
      if (tempWinStreak > maxConsecutiveWins) maxConsecutiveWins = tempWinStreak;
    } else if (pnl.lessThan(0)) {
      lossCount++;
      sumLosingPnL = sumLosingPnL.plus(pnl.abs());

      tempLossStreak++;
      tempWinStreak = 0;
      if (tempLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = tempLossStreak;
    } else {
      breakevenCount++;
    }

    // Streak status
    if (tempWinStreak > 0) currentStreak = tempWinStreak;
    else if (tempLossStreak > 0) currentStreak = -tempLossStreak;

    // R-multiple
    if (trade.calculated.realizedRMultiple !== undefined && trade.calculated.realizedRMultiple !== null) {
      sumRealizedR = sumRealizedR.plus(trade.calculated.realizedRMultiple);
      rCount++;
    }

    // Holding time
    if (trade.calculated.holdingTimeMinutes !== undefined && trade.calculated.holdingTimeMinutes > 0) {
      sumHoldingMinutes += trade.calculated.holdingTimeMinutes;
      holdingCount++;
    }

    // Rule adherence
    if (trade.psychology?.rulesFollowed) {
      rulesFollowedCount++;
    }

    // Equity curve update
    runningEquity = runningEquity.plus(pnl);
    if (runningEquity.greaterThan(peakEquity)) {
      peakEquity = runningEquity;
    }

    const currentDrawdown = peakEquity.minus(runningEquity);
    const currentDrawdownPct = peakEquity.greaterThan(0)
      ? currentDrawdown.dividedBy(peakEquity).times(100)
      : new Decimal(0);

    if (currentDrawdown.greaterThan(maxDrawdownAmount)) {
      maxDrawdownAmount = currentDrawdown;
    }
    if (currentDrawdownPct.greaterThan(maxDrawdownPercent)) {
      maxDrawdownPercent = currentDrawdownPct;
    }

    equityCurve.push({
      date: trade.tradeDate,
      tradeId: trade.id,
      symbol: trade.symbol,
      netPnL: Number(pnl.toFixed(2)),
      cumulativeEquity: Number(runningEquity.toFixed(2)),
      drawdown: Number(currentDrawdown.toFixed(2)),
      drawdownPercent: Number(currentDrawdownPct.toFixed(2)),
    });

    // Daily breakdown
    const dayRecord = dailyMap.get(trade.tradeDate) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
      losses: 0,
    };
    dayRecord.netPnL = dayRecord.netPnL.plus(pnl);
    dayRecord.count++;
    if (pnl.greaterThan(0)) dayRecord.wins++;
    else if (pnl.lessThan(0)) dayRecord.losses++;
    dailyMap.set(trade.tradeDate, dayRecord);

    // Monthly breakdown
    const ym = trade.tradeDate.slice(0, 7); // YYYY-MM
    const monthRecord = monthlyMap.get(ym) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
    };
    monthRecord.netPnL = monthRecord.netPnL.plus(pnl);
    monthRecord.count++;
    if (pnl.greaterThan(0)) monthRecord.wins++;
    monthlyMap.set(ym, monthRecord);

    // Symbol breakdown
    const symRecord = symbolMap.get(trade.symbol) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
      sumWin: new Decimal(0),
      sumLoss: new Decimal(0),
    };
    symRecord.netPnL = symRecord.netPnL.plus(pnl);
    symRecord.count++;
    if (pnl.greaterThan(0)) {
      symRecord.wins++;
      symRecord.sumWin = symRecord.sumWin.plus(pnl);
    } else if (pnl.lessThan(0)) {
      symRecord.sumLoss = symRecord.sumLoss.plus(pnl.abs());
    }
    symbolMap.set(trade.symbol, symRecord);

    // Strategy breakdown
    const stratId = trade.strategyId || 'unclassified';
    const stratName = trade.strategyName || 'No Strategy';
    const stratRecord = strategyMap.get(stratId) ?? {
      name: stratName,
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
      sumWin: new Decimal(0),
      sumLoss: new Decimal(0),
    };
    stratRecord.netPnL = stratRecord.netPnL.plus(pnl);
    stratRecord.count++;
    if (pnl.greaterThan(0)) {
      stratRecord.wins++;
      stratRecord.sumWin = stratRecord.sumWin.plus(pnl);
    } else if (pnl.lessThan(0)) {
      stratRecord.sumLoss = stratRecord.sumLoss.plus(pnl.abs());
    }
    strategyMap.set(stratId, stratRecord);

    // Weekday breakdown
    const weekdayIdx = new Date(trade.tradeDate).getDay();
    const weekdayName = weekdayNames[weekdayIdx] || 'Unknown';
    const wRecord = weekdayMap.get(weekdayName) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
    };
    wRecord.netPnL = wRecord.netPnL.plus(pnl);
    wRecord.count++;
    if (pnl.greaterThan(0)) wRecord.wins++;
    weekdayMap.set(weekdayName, wRecord);

    // Session breakdown
    if (trade.session) {
      const sessRecord = sessionMap.get(trade.session) ?? {
        netPnL: new Decimal(0),
        count: 0,
        wins: 0,
      };
      sessRecord.netPnL = sessRecord.netPnL.plus(pnl);
      sessRecord.count++;
      if (pnl.greaterThan(0)) sessRecord.wins++;
      sessionMap.set(trade.session, sessRecord);
    }
  }

  const closedCount = closedTrades.length;
  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const lossRate = closedCount > 0 ? (lossCount / closedCount) * 100 : 0;

  const avgWinningTrade = winCount > 0 ? sumWinningPnL.dividedBy(winCount).toNumber() : 0;
  const avgLosingTrade = lossCount > 0 ? sumLosingPnL.dividedBy(lossCount).toNumber() : 0;

  let profitFactor = 0;
  if (sumLosingPnL.isZero()) {
    profitFactor = sumWinningPnL.greaterThan(0) ? 999.99 : 0;
  } else {
    profitFactor = sumWinningPnL.dividedBy(sumLosingPnL).toNumber();
  }

  const expectancy = closedCount > 0 ? totalNetPnL.dividedBy(closedCount).toNumber() : 0;
  const avgRealizedR = rCount > 0 ? sumRealizedR.dividedBy(rCount).toNumber() : 0;
  const avgHoldingTimeMinutes = holdingCount > 0 ? Math.round(sumHoldingMinutes / holdingCount) : 0;
  const ruleAdherencePercent = closedCount > 0 ? (rulesFollowedCount / closedCount) * 100 : 100;

  // Best & worst days
  let bestTradingDay: { date: string; netPnL: number } | undefined;
  let worstTradingDay: { date: string; netPnL: number } | undefined;

  for (const [date, val] of dailyMap.entries()) {
    const num = val.netPnL.toNumber();
    if (!bestTradingDay || num > bestTradingDay.netPnL) {
      bestTradingDay = { date, netPnL: Number(num.toFixed(2)) };
    }
    if (!worstTradingDay || num < worstTradingDay.netPnL) {
      worstTradingDay = { date, netPnL: Number(num.toFixed(2)) };
    }
  }

  const dailyPnL: IDashboardStats['dailyPnL'] = Array.from(dailyMap.entries())
    .map(([date, val]) => ({
      date,
      netPnL: Number(val.netPnL.toFixed(2)),
      tradesCount: val.count,
      winCount: val.wins,
      lossCount: val.losses,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlyPnL: IDashboardStats['monthlyPnL'] = Array.from(monthlyMap.entries())
    .map(([yearMonth, val]) => ({
      yearMonth,
      netPnL: Number(val.netPnL.toFixed(2)),
      tradesCount: val.count,
      winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  const performanceByInstrument: IDashboardStats['performanceByInstrument'] = Array.from(symbolMap.entries())
    .map(([symbol, val]) => {
      let pf = 0;
      if (val.sumLoss.isZero()) {
        pf = val.sumWin.greaterThan(0) ? 999.99 : 0;
      } else {
        pf = Number(val.sumWin.dividedBy(val.sumLoss).toFixed(2));
      }
      return {
        symbol,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
      };
    })
    .sort((a, b) => b.netPnL - a.netPnL);

  const performanceByStrategy: IDashboardStats['performanceByStrategy'] = Array.from(strategyMap.entries())
    .map(([strategyId, val]) => {
      let pf = 0;
      if (val.sumLoss.isZero()) {
        pf = val.sumWin.greaterThan(0) ? 999.99 : 0;
      } else {
        pf = Number(val.sumWin.dividedBy(val.sumLoss).toFixed(2));
      }
      return {
        strategyId,
        strategyName: val.name,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
      };
    })
    .sort((a, b) => b.netPnL - a.netPnL);

  const performanceByWeekday: IDashboardStats['performanceByWeekday'] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    .map((day) => {
      const val = weekdayMap.get(day) ?? { netPnL: new Decimal(0), count: 0, wins: 0 };
      return {
        day,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
      };
    });

  const performanceBySession: IDashboardStats['performanceBySession'] = Array.from(sessionMap.entries())
    .map(([session, val]) => ({
      session,
      tradesCount: val.count,
      netPnL: Number(val.netPnL.toFixed(2)),
      winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.netPnL - a.netPnL);

  // Distribution buckets (e.g. <-5000, -5000..-1000, -1000..0, 0..1000, 1000..5000, >5000)
  const buckets = [
    { range: '< -5000', min: -Infinity, max: -5000, isProfit: false, count: 0 },
    { range: '-5000 to -1000', min: -5000, max: -1000, isProfit: false, count: 0 },
    { range: '-1000 to 0', min: -1000, max: 0, isProfit: false, count: 0 },
    { range: '0 to 1000', min: 0, max: 1000, isProfit: true, count: 0 },
    { range: '1000 to 5000', min: 1000, max: 5000, isProfit: true, count: 0 },
    { range: '> 5000', min: 5000, max: Infinity, isProfit: true, count: 0 },
  ];

  for (const trade of closedTrades) {
    const val = trade.calculated.netPnL ?? 0;
    for (const b of buckets) {
      if (val >= b.min && val < b.max) {
        b.count++;
        break;
      }
    }
  }

  const pnlDistribution: IDashboardStats['pnlDistribution'] = buckets.map((b) => ({
    range: b.range,
    count: b.count,
    isProfit: b.isProfit,
  }));

  return {
    netPnL: Number(totalNetPnL.toFixed(2)),
    grossPnL: Number(totalGrossPnL.toFixed(2)),
    totalCosts: Number(totalCosts.toFixed(2)),
    openPnL: 0,
    closedTradesCount: closedCount,
    openTradesCount: openTrades.length,
    winningTradesCount: winCount,
    losingTradesCount: lossCount,
    breakevenTradesCount: breakevenCount,
    winRate: Number(winRate.toFixed(2)),
    lossRate: Number(lossRate.toFixed(2)),
    avgWinningTrade: Number(avgWinningTrade.toFixed(2)),
    avgLosingTrade: Number(avgLosingTrade.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    avgRealizedR: Number(avgRealizedR.toFixed(2)),
    maxDrawdownAmount: Number(maxDrawdownAmount.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    currentStreak,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgHoldingTimeMinutes,
    bestTradingDay,
    worstTradingDay,
    ruleAdherencePercent: Number(ruleAdherencePercent.toFixed(1)),
    equityCurve,
    dailyPnL,
    monthlyPnL,
    performanceByInstrument,
    performanceByStrategy,
    performanceByWeekday,
    performanceBySession,
    pnlDistribution,
  };
}
