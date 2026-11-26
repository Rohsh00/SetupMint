import Decimal from './decimal.js';
import { ITrade, IDashboardStats, TradingSession } from '@tradevault/shared';

export interface PerformanceInputTrade {
  id: string;
  tradeDate: string;
  entryTime?: string | Date;
  exitTime?: string | Date;
  direction?: string;
  symbol: string;
  underlying?: string;
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

export interface DashboardCashFlowEvent {
  date: string; // YYYY-MM-DD or ISO timestamp
  signedAmount: number; // +deposit/+positive adjustment, -withdrawal/-negative adjustment
}

export interface DashboardMetricsOptions {
  /** IANA timezone for weekday grouping (default 'Asia/Kolkata' for IST parity with DB queries) */
  timezone?: string;
  /** Optional confirmed external cash flows within the active window for cash-flow-safe drawdown */
  cashFlows?: DashboardCashFlowEvent[];
  /** Optional currency (e.g. 'USD', 'INR') or profile hint for adaptive bucket scaling */
  currency?: string;
}

function getWeekdayNameInTz(dateStr: string, timeZone: string): string {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T06:00:00Z`)
    : new Date(dateStr);
  if (isNaN(safe.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(safe);
}

function getTradingDateInTz(dateStr: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getHourInTz(dateStr: string | Date, timeZone: string): { localHour: number; utcHour: number } {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return { localHour: 0, utcHour: 0 };
  const utcHour = d.getUTCHours();
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(d);
    const parsed = parseInt(formatted, 10);
    const localHour = isNaN(parsed) ? utcHour : parsed % 24;
    return { localHour, utcHour };
  } catch {
    return { localHour: utcHour, utcHour };
  }
}

function getSessionHintForUtcHour(utcHour: number): string {
  if (utcHour >= 0 && utcHour < 7) return 'Asian (Tokyo/Sydney)';
  if (utcHour >= 7 && utcHour < 10) return 'London Open';
  if (utcHour >= 10 && utcHour < 12) return 'London Mid-Day';
  if (utcHour >= 12 && utcHour < 15) return 'NY Open / Overlap';
  if (utcHour >= 15 && utcHour < 17) return 'London Close';
  if (utcHour >= 17 && utcHour < 21) return 'NY Afternoon';
  return 'Off-Hours / Rollover';
}

export function calculateDashboardMetrics(
  trades: PerformanceInputTrade[],
  initialBalance = 0,
  options: DashboardMetricsOptions = {}
): IDashboardStats {
  const timezone = options.timezone || 'Asia/Kolkata';
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
  let sumWinningGrossPnL = new Decimal(0);
  let sumLosingGrossPnL = new Decimal(0);

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
  interface SubgroupStats {
    netPnL: Decimal;
    count: number;
    wins: number;
    sumWin: Decimal;
    sumLoss: Decimal;
    sumR: Decimal;
    rCount: number;
    longCount: number;
    shortCount: number;
  }

  const createEmptySubgroup = (): SubgroupStats => ({
    netPnL: new Decimal(0),
    count: 0,
    wins: 0,
    sumWin: new Decimal(0),
    sumLoss: new Decimal(0),
    sumR: new Decimal(0),
    rCount: 0,
    longCount: 0,
    shortCount: 0,
  });

  // Track weekday
  const weekdayMap = new Map<string, SubgroupStats>();
  // Track session
  const sessionMap = new Map<TradingSession, SubgroupStats>();
  // Track hour of day (0..23)
  const hourMap = new Map<number, SubgroupStats & { utcHourRef: number }>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, { ...createEmptySubgroup(), utcHourRef: h });
  }

  // Equity curve tracking
  let runningEquity = new Decimal(initialBalance);
  let peakEquity = runningEquity;
  let maxDrawdownAmount = new Decimal(0);
  let maxDrawdownPercent = new Decimal(0);

  const sortedCashFlows = (options.cashFlows || [])
    .map((cf) => ({
      ts: new Date(cf.date).getTime(),
      signedAmount: cf.signedAmount,
    }))
    .filter((cf) => Number.isFinite(cf.ts) && Number.isFinite(cf.signedAmount) && cf.signedAmount !== 0)
    .sort((a, b) => a.ts - b.ts);
  let cashFlowIdx = 0;
  let runningCumulativePnL = new Decimal(0);

  const equityCurve: IDashboardStats['equityCurve'] = [
    {
      date: closedTrades.length > 0 ? getTradingDateInTz(closedTrades[0].tradeDate, timezone) : new Date().toISOString().split('T')[0],
      netPnL: 0,
      cumulativeEquity: runningEquity.toNumber(),
      cumulativePnL: 0,
      drawdown: 0,
      drawdownPercent: 0,
    },
  ];

  for (const trade of closedTrades) {
    const tradeTs = new Date(trade.tradeDate).getTime();
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

    if (gross.greaterThan(0)) {
      sumWinningGrossPnL = sumWinningGrossPnL.plus(gross);
    } else if (gross.lessThan(0)) {
      sumLosingGrossPnL = sumLosingGrossPnL.plus(gross.abs());
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

    // Equity curve & cash-flow-safe drawdown tracking
    // Apply any external cash flows occurring up through this trade date so withdrawals/deposits
    // shift both runningEquity and peakEquity equally (zero artificial drawdown from withdrawals).
    while (cashFlowIdx < sortedCashFlows.length && sortedCashFlows[cashFlowIdx].ts <= tradeTs) {
      const flow = new Decimal(sortedCashFlows[cashFlowIdx].signedAmount || 0);
      runningEquity = runningEquity.plus(flow);
      peakEquity = Decimal.max(new Decimal(0), peakEquity.plus(flow));
      if (runningEquity.greaterThan(peakEquity)) {
        peakEquity = runningEquity;
      }
      cashFlowIdx++;
    }

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

    const dayKey = getTradingDateInTz(trade.tradeDate, timezone);
    runningCumulativePnL = runningCumulativePnL.plus(pnl);

    equityCurve.push({
      date: dayKey,
      tradeId: trade.id,
      symbol: trade.symbol,
      netPnL: Number(pnl.toFixed(2)),
      cumulativeEquity: Number(runningEquity.toFixed(2)),
      cumulativePnL: Number(runningCumulativePnL.toFixed(2)),
      drawdown: Number(currentDrawdown.toFixed(2)),
      drawdownPercent: Number(currentDrawdownPct.toFixed(2)),
    });

    // Daily breakdown
    const dayRecord = dailyMap.get(dayKey) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
      losses: 0,
    };
    dayRecord.netPnL = dayRecord.netPnL.plus(pnl);
    dayRecord.count++;
    if (pnl.greaterThan(0)) dayRecord.wins++;
    else if (pnl.lessThan(0)) dayRecord.losses++;
    dailyMap.set(dayKey, dayRecord);

    // Monthly breakdown
    const ym = dayKey.slice(0, 7); // YYYY-MM
    const monthRecord = monthlyMap.get(ym) ?? {
      netPnL: new Decimal(0),
      count: 0,
      wins: 0,
    };
    monthRecord.netPnL = monthRecord.netPnL.plus(pnl);
    monthRecord.count++;
    if (pnl.greaterThan(0)) monthRecord.wins++;
    monthlyMap.set(ym, monthRecord);

    // Symbol breakdown (grouped by underlying if present)
    const instrumentKey = trade.underlying || trade.symbol;
    const symRecord = symbolMap.get(instrumentKey) ?? {
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
    symbolMap.set(instrumentKey, symRecord);

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

    const isLong = (trade.direction || '').toUpperCase() === 'LONG' || (trade.direction || '').toUpperCase() === 'BUY';
    const isShort = (trade.direction || '').toUpperCase() === 'SHORT' || (trade.direction || '').toUpperCase() === 'SELL';
    const rVal = trade.calculated?.realizedRMultiple;
    const hasR = rVal !== undefined && Number.isFinite(rVal);

    // Weekday breakdown in configured timezone (IST default)
    const weekdayName = getWeekdayNameInTz(trade.tradeDate, timezone);
    const wRecord = weekdayMap.get(weekdayName) ?? createEmptySubgroup();
    wRecord.netPnL = wRecord.netPnL.plus(pnl);
    wRecord.count++;
    if (pnl.greaterThan(0)) {
      wRecord.wins++;
      wRecord.sumWin = wRecord.sumWin.plus(pnl);
    } else if (pnl.lessThan(0)) {
      wRecord.sumLoss = wRecord.sumLoss.plus(pnl.abs());
    }
    if (hasR) {
      wRecord.sumR = wRecord.sumR.plus(new Decimal(rVal));
      wRecord.rCount++;
    }
    if (isLong) wRecord.longCount++;
    if (isShort) wRecord.shortCount++;
    weekdayMap.set(weekdayName, wRecord);

    // Session breakdown
    if (trade.session) {
      const sessRecord = sessionMap.get(trade.session) ?? createEmptySubgroup();
      sessRecord.netPnL = sessRecord.netPnL.plus(pnl);
      sessRecord.count++;
      if (pnl.greaterThan(0)) {
        sessRecord.wins++;
        sessRecord.sumWin = sessRecord.sumWin.plus(pnl);
      } else if (pnl.lessThan(0)) {
        sessRecord.sumLoss = sessRecord.sumLoss.plus(pnl.abs());
      }
      if (hasR) {
        sessRecord.sumR = sessRecord.sumR.plus(new Decimal(rVal));
        sessRecord.rCount++;
      }
      if (isLong) sessRecord.longCount++;
      if (isShort) sessRecord.shortCount++;
      sessionMap.set(trade.session, sessRecord);
    }

    // Hourly breakdown (0..23) in requested timezone
    const tradeTimeStr = trade.entryTime || trade.tradeDate;
    const { localHour, utcHour } = getHourInTz(tradeTimeStr, timezone);
    const hRecord = hourMap.get(localHour) ?? { ...createEmptySubgroup(), utcHourRef: utcHour };
    hRecord.netPnL = hRecord.netPnL.plus(pnl);
    hRecord.count++;
    hRecord.utcHourRef = utcHour;
    if (pnl.greaterThan(0)) {
      hRecord.wins++;
      hRecord.sumWin = hRecord.sumWin.plus(pnl);
    } else if (pnl.lessThan(0)) {
      hRecord.sumLoss = hRecord.sumLoss.plus(pnl.abs());
    }
    if (hasR) {
      hRecord.sumR = hRecord.sumR.plus(new Decimal(rVal));
      hRecord.rCount++;
    }
    if (isLong) hRecord.longCount++;
    if (isShort) hRecord.shortCount++;
    hourMap.set(localHour, hRecord);
  }

  // Apply any remaining cash flows occurring after the last closed trade
  while (cashFlowIdx < sortedCashFlows.length) {
    const flow = new Decimal(sortedCashFlows[cashFlowIdx].signedAmount || 0);
    runningEquity = runningEquity.plus(flow);
    peakEquity = Decimal.max(new Decimal(0), peakEquity.plus(flow));
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
      date: new Date(sortedCashFlows[cashFlowIdx].ts).toISOString().split('T')[0],
      netPnL: 0,
      cumulativeEquity: Number(runningEquity.toFixed(2)),
      cumulativePnL: Number(runningCumulativePnL.toFixed(2)),
      drawdown: Number(currentDrawdown.toFixed(2)),
      drawdownPercent: Number(currentDrawdownPct.toFixed(2)),
    });
    cashFlowIdx++;
  }

  const closedCount = closedTrades.length;
  const winRate = closedCount > 0 ? Number(((winCount / closedCount) * 100).toFixed(2)) : 0;
  const lossRate = closedCount > 0 ? Number(((lossCount / closedCount) * 100).toFixed(2)) : 0;

  const avgWinningTrade = winCount > 0 ? Number(sumWinningPnL.dividedBy(winCount).toFixed(2)) : 0;
  const avgLosingTrade = lossCount > 0 ? Number(sumLosingPnL.dividedBy(lossCount).toFixed(2)) : 0;

  let profitFactor = 0;
  if (sumLosingPnL.isZero()) {
    profitFactor = sumWinningPnL.greaterThan(0) ? 999.99 : 0;
  } else {
    profitFactor = Number(sumWinningPnL.dividedBy(sumLosingPnL).toFixed(2));
  }

  let grossProfitFactor = 0;
  if (sumLosingGrossPnL.isZero()) {
    grossProfitFactor = sumWinningGrossPnL.greaterThan(0) ? 999.99 : 0;
  } else {
    grossProfitFactor = Number(sumWinningGrossPnL.dividedBy(sumLosingGrossPnL).toFixed(2));
  }

  const expectancy = closedCount > 0 ? Number(totalNetPnL.dividedBy(closedCount).toFixed(2)) : 0;
  const avgRealizedR = rCount > 0 ? Number(sumRealizedR.dividedBy(rCount).toFixed(2)) : 0;
  const expectancyR = rCount > 0 ? Number(sumRealizedR.dividedBy(rCount).toFixed(4)) : undefined;
  const avgHoldingTimeMinutes = holdingCount > 0 ? Math.round(sumHoldingMinutes / holdingCount) : 0;
  const ruleAdherencePercent = closedCount > 0 ? Number(((rulesFollowedCount / closedCount) * 100).toFixed(2)) : 100;

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

  const hasWeekendTrades = (weekdayMap.get('Saturday')?.count || 0) > 0 || (weekdayMap.get('Sunday')?.count || 0) > 0;
  const targetDays = hasWeekendTrades
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const performanceByWeekday: IDashboardStats['performanceByWeekday'] = targetDays
    .map((day) => {
      const val = weekdayMap.get(day) ?? createEmptySubgroup();
      let pf = 0;
      if (val.sumLoss.isZero()) {
        pf = val.sumWin.greaterThan(0) ? 999.99 : 0;
      } else {
        pf = Number(val.sumWin.dividedBy(val.sumLoss).toFixed(2));
      }
      return {
        day,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
        avgR: val.rCount > 0 ? Number(val.sumR.dividedBy(val.rCount).toFixed(2)) : undefined,
        longCount: val.longCount,
        shortCount: val.shortCount,
      };
    });

  const performanceBySession: IDashboardStats['performanceBySession'] = Array.from(sessionMap.entries())
    .map(([session, val]) => {
      let pf = 0;
      if (val.sumLoss.isZero()) {
        pf = val.sumWin.greaterThan(0) ? 999.99 : 0;
      } else {
        pf = Number(val.sumWin.dividedBy(val.sumLoss).toFixed(2));
      }
      return {
        session,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
        avgR: val.rCount > 0 ? Number(val.sumR.dividedBy(val.rCount).toFixed(2)) : undefined,
        longCount: val.longCount,
        shortCount: val.shortCount,
      };
    })
    .sort((a, b) => b.netPnL - a.netPnL);

  const performanceByHour: IDashboardStats['performanceByHour'] = Array.from(hourMap.entries())
    .map(([hour, val]) => {
      let pf = 0;
      if (val.sumLoss.isZero()) {
        pf = val.sumWin.greaterThan(0) ? 999.99 : 0;
      } else {
        pf = Number(val.sumWin.dividedBy(val.sumLoss).toFixed(2));
      }
      return {
        hour,
        hourLabel: `${String(hour).padStart(2, '0')}:00`,
        tradesCount: val.count,
        netPnL: Number(val.netPnL.toFixed(2)),
        winRate: val.count > 0 ? Number(((val.wins / val.count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
        avgR: val.rCount > 0 ? Number(val.sumR.dividedBy(val.rCount).toFixed(2)) : undefined,
        longCount: val.longCount,
        shortCount: val.shortCount,
        sessionHint: getSessionHintForUtcHour(val.utcHourRef),
      };
    })
    .sort((a, b) => a.hour - b.hour);

  // Adaptive distribution buckets:
  // Tailor thresholds to the active currency and trade scale (e.g. micro-lots in USD for Elefin vs large INR F&O contracts)
  const maxAbsPnl = closedTrades.reduce((max, t) => Math.max(max, Math.abs(t.calculated.netPnL ?? 0)), 0);
  const isMicroScale = maxAbsPnl <= 30;
  const isSmallScale = maxAbsPnl <= 200;
  const isMidScale = maxAbsPnl <= 1500;
  const isUsd = (options.currency || '').toUpperCase() === 'USD';

  let buckets: Array<{ range: string; min: number; max: number; isProfit: boolean; count: number }>;

  if (isMicroScale && (isUsd || maxAbsPnl > 0)) {
    // Calibrated specifically for micro-lot scalping (e.g. 0.01 - 0.05 XAUUSD / Elefin)
    buckets = [
      { range: '< -10', min: -Infinity, max: -10, isProfit: false, count: 0 },
      { range: '-10 to -5', min: -10, max: -5, isProfit: false, count: 0 },
      { range: '-5 to 0', min: -5, max: 0, isProfit: false, count: 0 },
      { range: '0 to 5', min: 0, max: 5, isProfit: true, count: 0 },
      { range: '5 to 10', min: 5, max: 10, isProfit: true, count: 0 },
      { range: '> 10', min: 10, max: Infinity, isProfit: true, count: 0 },
    ];
  } else if (isSmallScale && (isUsd || maxAbsPnl > 0)) {
    buckets = [
      { range: '< -50', min: -Infinity, max: -50, isProfit: false, count: 0 },
      { range: '-50 to -20', min: -50, max: -20, isProfit: false, count: 0 },
      { range: '-20 to 0', min: -20, max: 0, isProfit: false, count: 0 },
      { range: '0 to 20', min: 0, max: 20, isProfit: true, count: 0 },
      { range: '20 to 50', min: 20, max: 50, isProfit: true, count: 0 },
      { range: '> 50', min: 50, max: Infinity, isProfit: true, count: 0 },
    ];
  } else if (isMidScale && isUsd) {
    buckets = [
      { range: '< -500', min: -Infinity, max: -500, isProfit: false, count: 0 },
      { range: '-500 to -100', min: -500, max: -100, isProfit: false, count: 0 },
      { range: '-100 to 0', min: -100, max: 0, isProfit: false, count: 0 },
      { range: '0 to 100', min: 0, max: 100, isProfit: true, count: 0 },
      { range: '100 to 500', min: 100, max: 500, isProfit: true, count: 0 },
      { range: '> 500', min: 500, max: Infinity, isProfit: true, count: 0 },
    ];
  } else {
    // Standard default scale (e.g. Indian F&O: 5000 / 1000)
    buckets = [
      { range: '< -5000', min: -Infinity, max: -5000, isProfit: false, count: 0 },
      { range: '-5000 to -1000', min: -5000, max: -1000, isProfit: false, count: 0 },
      { range: '-1000 to 0', min: -1000, max: 0, isProfit: false, count: 0 },
      { range: '0 to 1000', min: 0, max: 1000, isProfit: true, count: 0 },
      { range: '1000 to 5000', min: 1000, max: 5000, isProfit: true, count: 0 },
      { range: '> 5000', min: 5000, max: Infinity, isProfit: true, count: 0 },
    ];
  }

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
    grossProfitFactor: Number(grossProfitFactor.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    expectancyR,
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
    performanceByHour,
    pnlDistribution,
  };
}
