import Decimal from 'decimal.js';
import {
  IFocusRule,
  IFocusRuleEvaluation,
  IFocusRuleMetric,
  IRiskSettings,
  IWeeklyDisciplineDay,
  IWeeklyMistakeItem,
  IWeeklyReviewSnapshot,
  IWeeklyRiskEvents,
  IWeeklySessionItem,
  IWeeklyTemplateItem,
  IWeeklyWeekdayItem,
  MistakeTag,
  isoWeekToRange,
} from '@tradevault/shared';
import { calculateEmpiricalBayesShrinkage } from './edge.js';
import { calculateDailyEventMarkers } from './events.js';
import { checkDailyLossBreach } from './mistakes.js';
import { computeTradeAggregates } from './reconciliation.js';

// Configure Decimal precision (30 digits, ROUND_HALF_UP)
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface WeeklyReviewTradeInput {
  id: string;
  symbol: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  exitTime?: string | Date | null;
  status: string;
  direction?: 'LONG' | 'SHORT';
  session?: string;
  templateId?: string;
  strategyId?: string;
  strategyName?: string;
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number | null;
  calculated?: {
    netPnL?: number;
    grossPnL?: number;
    totalCosts?: number;
    realizedRMultiple?: number;
    outcome?: string;
    excursion?: any;
    stopMoveSummary?: any;
  };
  netPnL?: number;
  grossPnL?: number;
  totalCosts?: number;
  realizedRMultiple?: number;
  plannedRiskAmount?: number;
  psychology?: {
    disciplineScore?: number;
    disciplineRating?: number;
    mistakes?: string[];
    rulesFollowed?: boolean;
  };
  mistakes?: string[];
  setup?: any;
}

export interface WeeklyReviewJournalInput {
  id?: string;
  date: string; // YYYY-MM-DD
  disciplineRating?: number;
  notes?: string;
  mistakes?: string[];
}

export interface BuildWeeklyReviewInput {
  week: string; // YYYY-Www
  startDate?: string;
  endDate?: string;
  trades: WeeklyReviewTradeInput[];
  previousWeekTrades?: WeeklyReviewTradeInput[];
  riskSettings?: IRiskSettings;
  accountEquity?: number;
  templates?: Array<{ id: string; name: string; [key: string]: any }>;
  strategies?: Array<{ id: string; name: string; [key: string]: any }>;
  dailyJournals?: WeeklyReviewJournalInput[];
  previousFocusRule?: IFocusRule | null;
}

const MISTAKE_FOCUS_RULE_MAP: Record<string, string> = {
  REVENGE_TRADING: 'Wait at least 30 minutes and step away from charts after a losing trade',
  OVERTRADING: 'Cap daily trades at maximum allowed and stop when reached',
  STOP_MOVED: 'Never widen or cancel initial stop loss once entered',
  SIZE_VIOLATION: 'Strictly adhere to position size limits based on risk percentage',
  FOMO_ENTRY: 'Wait for confirmed setup triggers at key levels; never chase entries',
  FOMO: 'Wait for confirmed setup triggers at key levels; never chase entries',
  CHASED_MARKET: 'Do not chase price extension; wait for pullback to key level',
  PREMATURE_EXIT: 'Hold winners until planned target or invalidation structure',
  NO_STOP_LOSS: 'Never enter a position without placing a predefined stop loss',
  EARLY_ENTRY: 'Wait for candle close and confirmed confluence before trigger',
  LATE_ENTRY: 'Pass on trade if price has moved beyond acceptable risk-reward',
  BREAKEVEN_TOO_EARLY: 'Allow price breathing room; do not move stop to breakeven before 1R',
  STOP_TOO_TIGHT: 'Give stop loss adequate technical buffer beyond market noise',
  STOP_INSIDE_LIQUIDITY_POOL: 'Position stop loss beyond key liquidity pools and swing structures',
  TRADED_MID_RANGE: 'Only execute setups at the extremes of the defined trading range',
  COUNTER_TREND_NO_SWEEP: 'Trade strictly with higher-timeframe trend unless liquidity is purged',
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toDateString(val: string | Date | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') {
    return val.split('T')[0];
  }
  return val.toISOString().split('T')[0];
}

/**
 * Builds a deterministic, pure mathematical snapshot of a trading week.
 * Uses Decimal.js (30 digits, ROUND_HALF_UP) with zero floating-point round-off error.
 */
export function buildWeeklyReview(input: BuildWeeklyReviewInput): IWeeklyReviewSnapshot {
  const { week, trades, previousWeekTrades = [], riskSettings, dailyJournals = [], templates = [], strategies = [] } = input;

  const maxDailyLoss = riskSettings?.maxDailyLoss ?? 5000;
  const maxDailyTrades = riskSettings?.maxDailyTrades ?? 5;

  // Resolve week date boundaries
  let rangeStart = input.startDate;
  let rangeEnd = input.endDate;
  if (!rangeStart || !rangeEnd) {
    try {
      const r = isoWeekToRange(week);
      rangeStart = r.startDate;
      rangeEnd = r.endDate;
    } catch {
      rangeStart = '2026-01-01';
      rangeEnd = '2026-01-07';
    }
  }

  // Filter closed trades only
  const closedTrades = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : new Date(a.tradeDate).getTime();
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : new Date(b.tradeDate).getTime();
      return timeA - timeB;
    });

  const prevClosedTrades = previousWeekTrades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : new Date(a.tradeDate).getTime();
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : new Date(b.tradeDate).getTime();
      return timeA - timeB;
    });

  // 1. Authoritative Aggregates via computeTradeAggregates
  const aggTrades = closedTrades.map((t) => ({
    id: t.id,
    status: t.status,
    netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
    grossPnL: t.calculated?.grossPnL ?? t.grossPnL ?? 0,
    totalCosts: t.calculated?.totalCosts ?? t.totalCosts ?? 0,
    realizedRMultiple: t.calculated?.realizedRMultiple ?? t.realizedRMultiple,
  }));

  const agg = computeTradeAggregates(aggTrades);

  let sumWinningPnL = new Decimal(0);
  let sumLosingPnL = new Decimal(0);
  let sumRealizedR = new Decimal(0);
  let rCount = 0;

  for (const t of closedTrades) {
    const net = new Decimal(t.calculated?.netPnL ?? t.netPnL ?? 0);
    const r = t.calculated?.realizedRMultiple ?? t.realizedRMultiple;

    if (net.greaterThan(0)) {
      sumWinningPnL = sumWinningPnL.plus(net);
    } else if (net.lessThan(0)) {
      sumLosingPnL = sumLosingPnL.plus(net.abs());
    }

    if (r !== undefined && r !== null && Number.isFinite(r)) {
      sumRealizedR = sumRealizedR.plus(new Decimal(r));
      rCount++;
    }
  }

  let profitFactor = 0;
  if (sumLosingPnL.isZero()) {
    profitFactor = sumWinningPnL.greaterThan(0) ? 999.99 : 0;
  } else {
    profitFactor = Number(sumWinningPnL.dividedBy(sumLosingPnL).toFixed(2));
  }

  const closedCount = closedTrades.length;
  const expectancy = closedCount > 0 ? Number(new Decimal(agg.netPnL).dividedBy(closedCount).toFixed(2)) : 0;
  const avgRealizedR = rCount > 0 ? Number(sumRealizedR.dividedBy(rCount).toFixed(2)) : 0;
  const rCoveragePercent = closedCount > 0 ? Number(new Decimal(rCount).dividedBy(closedCount).times(100).toFixed(1)) : 0;

  // Max Drawdown during the week
  let runningEquity = new Decimal(0);
  let peakEquity = new Decimal(0);
  let maxDrawdownAmt = new Decimal(0);

  for (const t of closedTrades) {
    const net = new Decimal(t.calculated?.netPnL ?? t.netPnL ?? 0);
    runningEquity = runningEquity.plus(net);
    if (runningEquity.greaterThan(peakEquity)) {
      peakEquity = runningEquity;
    }
    const dd = peakEquity.minus(runningEquity);
    if (dd.greaterThan(maxDrawdownAmt)) {
      maxDrawdownAmt = dd;
    }
  }
  const maxDrawdown = Number(maxDrawdownAmt.toFixed(2));

  // 2. Previous Week Comparison
  const prevAggTrades = prevClosedTrades.map((t) => ({
    id: t.id,
    status: t.status,
    netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
    grossPnL: t.calculated?.grossPnL ?? t.grossPnL ?? 0,
    totalCosts: t.calculated?.totalCosts ?? t.totalCosts ?? 0,
    realizedRMultiple: t.calculated?.realizedRMultiple ?? t.realizedRMultiple,
  }));
  const prevAgg = computeTradeAggregates(prevAggTrades);

  const deltaNetPnL = Number(new Decimal(agg.netPnL).minus(prevAgg.netPnL).toFixed(2));
  const deltaWinRate = Number(new Decimal(agg.winRate).minus(prevAgg.winRate).toFixed(2));
  const deltaAvgRealizedR = Number(new Decimal(avgRealizedR).minus(prevAgg.avgR).toFixed(2));

  // 3. Discipline Tracking
  const journalMap = new Map<string, WeeklyReviewJournalInput>();
  for (const j of dailyJournals) {
    journalMap.set(j.date, j);
  }

  // Group trades by date
  const tradesByDateMap = new Map<string, WeeklyReviewTradeInput[]>();
  for (const t of closedTrades) {
    const dStr = toDateString(t.tradeDate || t.entryTime);
    const list = tradesByDateMap.get(dStr) || [];
    list.push(t);
    tradesByDateMap.set(dStr, list);
  }

  const dailyRatings: IWeeklyDisciplineDay[] = [];
  let sumDiscipline = new Decimal(0);
  let disciplineDaysCount = 0;

  // Generate 7 calendar days from rangeStart to rangeEnd
  const [startY, startM, startD] = rangeStart.split('-').map(Number);
  const startUtc = new Date(Date.UTC(startY, startM - 1, startD));

  for (let offset = 0; offset < 7; offset++) {
    const curDate = new Date(startUtc.getTime() + offset * 86400000);
    const curStr = curDate.toISOString().split('T')[0];
    const dowName = WEEKDAY_NAMES[curDate.getUTCDay()];

    const journal = journalMap.get(curStr);
    const dayTrades = tradesByDateMap.get(curStr) || [];

    let dayRating: number | null = null;
    if (journal?.disciplineRating !== undefined && journal.disciplineRating !== null) {
      dayRating = journal.disciplineRating;
    } else if (dayTrades.length > 0) {
      let tradeRatingSum = 0;
      let tradeRatingCount = 0;
      for (const dt of dayTrades) {
        const score = dt.psychology?.disciplineScore ?? dt.psychology?.disciplineRating;
        if (score !== undefined && score !== null && score > 0) {
          tradeRatingSum += score;
          tradeRatingCount++;
        }
      }
      if (tradeRatingCount > 0) {
        dayRating = Number((tradeRatingSum / tradeRatingCount).toFixed(1));
      }
    }

    if (dayRating !== null) {
      sumDiscipline = sumDiscipline.plus(dayRating);
      disciplineDaysCount++;
    }

    dailyRatings.push({
      date: curStr,
      dayOfWeek: dowName,
      rating: dayRating,
      tradesCount: dayTrades.length,
      hasJournal: Boolean(journal),
      journalId: journal?.id,
    });
  }

  const averageRating = disciplineDaysCount > 0 ? Number(sumDiscipline.dividedBy(disciplineDaysCount).toFixed(1)) : 5.0;

  // Calculate previous week average discipline
  let prevDisciplineSum = new Decimal(0);
  let prevDisciplineCount = 0;
  for (const pt of prevClosedTrades) {
    const score = pt.psychology?.disciplineScore ?? pt.psychology?.disciplineRating;
    if (score !== undefined && score !== null && score > 0) {
      prevDisciplineSum = prevDisciplineSum.plus(score);
      prevDisciplineCount++;
    }
  }
  const prevAvgDiscipline = prevDisciplineCount > 0 ? Number(prevDisciplineSum.dividedBy(prevDisciplineCount).toFixed(1)) : averageRating;
  const deltaAvgDiscipline = Number(new Decimal(averageRating).minus(prevAvgDiscipline).toFixed(2));

  let trendDirection: 'IMPROVED' | 'DECLINED' | 'STABLE' = 'STABLE';
  if (averageRating > prevAvgDiscipline + 0.1) {
    trendDirection = 'IMPROVED';
  } else if (averageRating < prevAvgDiscipline - 0.1) {
    trendDirection = 'DECLINED';
  }

  // 4. Mistakes Analysis
  const mistakeLossMap = new Map<string, { count: number; loss: Decimal; tradeIds: string[] }>();

  for (const t of closedTrades) {
    const net = t.calculated?.netPnL ?? t.netPnL ?? 0;
    const isLoss = net < 0;
    const lossAmt = isLoss ? new Decimal(net).abs() : new Decimal(0);

    const tradeMistakes = new Set<string>();
    if (t.psychology?.mistakes) {
      t.psychology.mistakes.forEach((m) => tradeMistakes.add(m));
    }
    if (t.mistakes) {
      t.mistakes.forEach((m) => tradeMistakes.add(m));
    }

    for (const m of tradeMistakes) {
      const rec = mistakeLossMap.get(m) || { count: 0, loss: new Decimal(0), tradeIds: [] };
      rec.count++;
      rec.loss = rec.loss.plus(lossAmt);
      if (t.id && !rec.tradeIds.includes(t.id)) {
        rec.tradeIds.push(t.id);
      }
      mistakeLossMap.set(m, rec);
    }
  }

  const mistakeItems: IWeeklyMistakeItem[] = Array.from(mistakeLossMap.entries())
    .map(([tag, rec]) => ({
      tag: tag as MistakeTag,
      count: rec.count,
      totalLoss: Number(rec.loss.toFixed(2)),
      tradeIds: rec.tradeIds,
    }))
    .sort((a, b) => {
      if (b.totalLoss !== a.totalLoss) return b.totalLoss - a.totalLoss;
      return b.count - a.count;
    });

  const topMistake = mistakeItems.length > 0 ? mistakeItems[0] : null;
  const topMistakes = mistakeItems.slice(0, 3);

  // 5. Template & Strategy Analysis with Empirical-Bayes Shrinkage
  const templateNameMap = new Map<string, string>();
  for (const tmpl of templates) {
    if (tmpl.id) templateNameMap.set(tmpl.id, tmpl.name);
  }
  for (const strat of strategies) {
    if (strat.id) templateNameMap.set(strat.id, strat.name);
  }

  const templateGroupMap = new Map<
    string,
    {
      name: string;
      trades: WeeklyReviewTradeInput[];
      netPnL: Decimal;
      wins: number;
      rSum: Decimal;
      rCount: number;
    }
  >();

  for (const t of closedTrades) {
    const key = t.templateId || t.strategyId || t.strategyName || 'Discretionary';
    const name = templateNameMap.get(key) || t.strategyName || key;

    const group = templateGroupMap.get(key) || {
      name,
      trades: [],
      netPnL: new Decimal(0),
      wins: 0,
      rSum: new Decimal(0),
      rCount: 0,
    };

    const net = t.calculated?.netPnL ?? t.netPnL ?? 0;
    const r = t.calculated?.realizedRMultiple ?? t.realizedRMultiple;

    group.trades.push(t);
    group.netPnL = group.netPnL.plus(net);
    if (net > 0) group.wins++;
    if (r !== undefined && r !== null && Number.isFinite(r)) {
      group.rSum = group.rSum.plus(r);
      group.rCount++;
    }

    templateGroupMap.set(key, group);
  }

  // Population prior for empirical-Bayes
  const globalPrior = avgRealizedR;

  const templateItems: IWeeklyTemplateItem[] = Array.from(templateGroupMap.entries())
    .map(([key, group]) => {
      const n = group.trades.length;
      const sampleMean = group.rCount > 0 ? Number(group.rSum.dividedBy(group.rCount).toFixed(4)) : (n > 0 ? Number(group.netPnL.dividedBy(n).toFixed(2)) : 0);
      const shrunk = calculateEmpiricalBayesShrinkage(sampleMean, n, globalPrior, 10);
      const winRate = n > 0 ? Number(new Decimal(group.wins).dividedBy(n).times(100).toFixed(1)) : 0;

      return {
        templateId: key !== 'Discretionary' ? key : undefined,
        name: group.name,
        n,
        shrunkExpectancy: shrunk,
        sampleSizeWarning: n < 30,
        winRate,
        netPnL: Number(group.netPnL.toFixed(2)),
        tradeIds: group.trades.map((t) => t.id).filter(Boolean),
      };
    })
    .sort((a, b) => b.shrunkExpectancy - a.shrunkExpectancy);

  const bestTemplate = templateItems.length > 0 ? templateItems[0] : null;
  const worstTemplate =
    templateItems.length > 1
      ? templateItems[templateItems.length - 1]
      : templateItems.length === 1 && templateItems[0].shrunkExpectancy < 0
      ? templateItems[0]
      : null;


  // 6. Risk Events
  // Daily loss breaches
  const dailyLossBreaches = [];
  const eventMarkerInput = closedTrades.map((t) => ({
    id: t.id,
    tradeDate: t.tradeDate,
    entryTime: t.entryTime,
    exitTime: t.exitTime ?? undefined,
    symbol: t.symbol,
    status: t.status,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
    plannedRiskAmount: t.plannedRiskAmount,
  }));

  for (const [dateStr, dTrades] of tradesByDateMap.entries()) {
    const summaryList = dTrades.map((t) => ({
      symbol: t.symbol,
      status: t.status,
      entryTime: t.entryTime || t.tradeDate,
      exitTime: t.exitTime,
      quantity: t.quantity || 1,
      entryPrice: t.entryPrice || 0,
      netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
    }));

    const result = checkDailyLossBreach(summaryList, maxDailyLoss);
    if (result.breached) {
      dailyLossBreaches.push({
        date: dateStr,
        maxDailyLoss,
        currentDailyLoss: result.currentDailyLoss,
        breachAmount: Number(new Decimal(result.currentDailyLoss).minus(maxDailyLoss).toFixed(2)),
        tradesCount: dTrades.length,
        tradeIds: dTrades.map((t) => t.id).filter(Boolean),
      });
    }
  }

  // Tilt days (score >= 61)
  const markerResult = calculateDailyEventMarkers(eventMarkerInput, maxDailyLoss);
  const highTiltDays = markerResult.tiltDays.map((td) => ({
    date: td.date,
    tradeId: td.tradeId,
    symbol: td.symbol,
    score: td.score,
    level: td.level,
    explanation: td.explanation,
  }));

  // Overtrading days
  const overtradingDays = [];
  for (const [dateStr, dTrades] of tradesByDateMap.entries()) {
    if (dTrades.length > maxDailyTrades) {
      overtradingDays.push({
        date: dateStr,
        tradesCount: dTrades.length,
        maxDailyTrades,
        tradeIds: dTrades.map((t) => t.id).filter(Boolean),
      });
    }
  }

  // Unjournaled trading days
  const unjournaledDates: string[] = [];
  for (const dateStr of tradesByDateMap.keys()) {
    if (!journalMap.has(dateStr)) {
      unjournaledDates.push(dateStr);
    }
  }
  unjournaledDates.sort();

  const riskEvents: IWeeklyRiskEvents = {
    dailyLossBreaches: dailyLossBreaches.sort((a, b) => a.date.localeCompare(b.date)),
    highTiltDays,
    overtradingDays: overtradingDays.sort((a, b) => a.date.localeCompare(b.date)),
    unjournaledDaysCount: unjournaledDates.length,
    unjournaledDates,
  };

  // 7. Weekdays & Sessions Breakdown
  const weekdayMap = new Map<string, { netPnL: Decimal; wins: number; tradeIds: string[] }>();
  const sessionMap = new Map<string, { netPnL: Decimal; wins: number; tradeIds: string[] }>();

  for (const t of closedTrades) {
    const d = new Date(t.entryTime || t.tradeDate);
    const dayName = WEEKDAY_NAMES[d.getDay()] || 'Unknown';
    const net = new Decimal(t.calculated?.netPnL ?? t.netPnL ?? 0);

    const wRec = weekdayMap.get(dayName) || { netPnL: new Decimal(0), wins: 0, tradeIds: [] };
    wRec.netPnL = wRec.netPnL.plus(net);
    if (net.greaterThan(0)) wRec.wins++;
    if (t.id) wRec.tradeIds.push(t.id);
    weekdayMap.set(dayName, wRec);

    const sessName = t.session || 'NSE_REGULAR';
    const sRec = sessionMap.get(sessName) || { netPnL: new Decimal(0), wins: 0, tradeIds: [] };
    sRec.netPnL = sRec.netPnL.plus(net);
    if (net.greaterThan(0)) sRec.wins++;
    if (t.id) sRec.tradeIds.push(t.id);
    sessionMap.set(sessName, sRec);
  }

  const standardWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const byWeekday: IWeeklyWeekdayItem[] = standardWeekdays.map((day) => {
    const val = weekdayMap.get(day) || { netPnL: new Decimal(0), wins: 0, tradeIds: [] };
    const count = val.tradeIds.length;
    return {
      day,
      netPnL: Number(val.netPnL.toFixed(2)),
      tradesCount: count,
      winRate: count > 0 ? Number(new Decimal(val.wins).dividedBy(count).times(100).toFixed(1)) : 0,
      tradeIds: val.tradeIds,
    };
  });

  const bySession: IWeeklySessionItem[] = Array.from(sessionMap.entries())
    .map(([session, val]) => {
      const count = val.tradeIds.length;
      return {
        session,
        netPnL: Number(val.netPnL.toFixed(2)),
        tradesCount: count,
        winRate: count > 0 ? Number(new Decimal(val.wins).dividedBy(count).times(100).toFixed(1)) : 0,
        tradeIds: val.tradeIds,
      };
    })
    .sort((a, b) => b.netPnL - a.netPnL);

  let bestWeekday: { day: string; netPnL: number } | null = null;
  let worstWeekday: { day: string; netPnL: number } | null = null;
  const activeWeekdays = byWeekday.filter((w) => w.tradesCount > 0);
  if (activeWeekdays.length > 0) {
    const sortedDays = [...activeWeekdays].sort((a, b) => b.netPnL - a.netPnL);
    bestWeekday = { day: sortedDays[0].day, netPnL: sortedDays[0].netPnL };
    worstWeekday = { day: sortedDays[sortedDays.length - 1].day, netPnL: sortedDays[sortedDays.length - 1].netPnL };
  }

  let bestSession: { session: string; netPnL: number } | null = null;
  let worstSession: { session: string; netPnL: number } | null = null;
  if (bySession.length > 0) {
    bestSession = { session: bySession[0].session, netPnL: bySession[0].netPnL };
    worstSession = { session: bySession[bySession.length - 1].session, netPnL: bySession[bySession.length - 1].netPnL };
  }

  // 8. Focus Rule Suggestion (Deterministic Priority Order)
  let focusRuleSuggestion: IFocusRule;

  if (dailyLossBreaches.length > 0) {
    // Priority 1: Daily Loss Breach occurred
    focusRuleSuggestion = {
      code: 'DAILY_LOSS_LIMIT',
      text: 'Stop trading for the day after hitting max daily loss',
      metric: { type: 'MAX_DAILY_LOSS_BREACH', target: 0 },
      source: 'SUGGESTED',
    };
  } else if (topMistake && topMistake.totalLoss > 0) {
    // Priority 2: Top mistake tag cost > 0
    const ruleText =
      MISTAKE_FOCUS_RULE_MAP[topMistake.tag] ||
      `Eliminate mistake pattern (${topMistake.tag}) and execute with discipline`;
    focusRuleSuggestion = {
      code: `MISTAKE_${topMistake.tag}`,
      text: ruleText,
      metric: { type: 'MISTAKE_COUNT', tag: topMistake.tag, target: 0 },
      source: 'SUGGESTED',
    };
  } else if (worstTemplate && worstTemplate.n >= 10 && worstTemplate.shrunkExpectancy < 0) {
    // Priority 3: Worst template has n >= 10 and negative shrunk expectancy
    focusRuleSuggestion = {
      code: 'PAUSE_TEMPLATE',
      text: `Pause ${worstTemplate.name} until reviewed`,
      metric: {
        type: 'TEMPLATE_PAUSE',
        templateId: worstTemplate.templateId,
        templateName: worstTemplate.name,
        target: 0,
      },
      source: 'SUGGESTED',
    };
  } else if (bestTemplate && bestTemplate.netPnL > 0) {
    // Priority 4: Repeat what worked
    focusRuleSuggestion = {
      code: 'REPEAT_SUCCESS',
      text: `Repeat what worked: ${bestTemplate.name}`,
      metric: {
        type: 'REPEAT_TEMPLATE',
        templateId: bestTemplate.templateId,
        templateName: bestTemplate.name,
      },
      source: 'SUGGESTED',
    };
  } else {
    // Priority 4 fallback
    focusRuleSuggestion = {
      code: 'MAINTAIN_DISCIPLINE',
      text: 'Focus on high-conviction setups and strict risk control',
      metric: { type: 'MAINTAIN_DISCIPLINE' },
      source: 'SUGGESTED',
    };
  }

  return {
    weekSummary: {
      tradeCount: closedCount,
      closedCount,
      netPnL: agg.netPnL,
      grossPnL: agg.grossPnL,
      totalCosts: agg.totalCosts,
      winRate: agg.winRate,
      profitFactor,
      expectancy,
      sumRealizedR: Number(sumRealizedR.toFixed(2)),
      avgRealizedR,
      maxDrawdown,
      rCoveragePercent,
      winsCount: agg.winsCount,
      lossesCount: agg.lossesCount,
      breakevenCount: agg.breakevenCount,
      rCount,
      tradeIds: closedTrades.map((t) => t.id).filter(Boolean),
    },
    vsPreviousWeek: {
      deltaNetPnL,
      deltaWinRate,
      deltaAvgRealizedR,
      deltaAvgDiscipline,
    },
    mistakes: {
      items: mistakeItems,
      topMistake,
      topMistakes,
    },
    templates: {
      items: templateItems,
      bestTemplate,
      worstTemplate,
    },
    discipline: {
      averageRating,
      dailyRatings,
      trendDirection,
    },
    riskEvents,
    sessionsAndWeekdays: {
      byWeekday,
      bySession,
      bestWeekday,
      worstWeekday,
      bestSession,
      worstSession,
    },
    focusRuleSuggestion,
    isEmpty: closedCount === 0,
  };
}

/**
 * Evaluates whether a previously chosen focus rule was respected across this week's closed trades.
 * Returns { followed, actual, target, note }.
 * Uses followed: null when rule adherence is not machine-measurable.
 */
export function evaluateFocusRule(
  prevFocusRule: IFocusRule | null | undefined,
  thisWeekTrades: WeeklyReviewTradeInput[],
  riskSettings?: IRiskSettings
): IFocusRuleEvaluation {
  if (!prevFocusRule || !prevFocusRule.metric) {
    return {
      followed: null,
      actual: null,
      target: null,
      note: 'No measurable focus rule was set for this week',
    };
  }

  const closedTrades = thisWeekTrades.filter((t) => t.status === 'CLOSED');
  const metric = prevFocusRule.metric;

  switch (metric.type) {
    case 'MAX_DAILY_LOSS_BREACH': {
      const maxDailyLoss = riskSettings?.maxDailyLoss ?? 5000;
      const dayMap = new Map<string, WeeklyReviewTradeInput[]>();
      for (const t of closedTrades) {
        const dStr = toDateString(t.tradeDate || t.entryTime);
        const list = dayMap.get(dStr) || [];
        list.push(t);
        dayMap.set(dStr, list);
      }

      let breachCount = 0;
      for (const dayTrades of dayMap.values()) {
        const summaryList = dayTrades.map((t) => ({
          symbol: t.symbol,
          status: t.status,
          entryTime: t.entryTime || t.tradeDate,
          exitTime: t.exitTime,
          quantity: t.quantity || 1,
          entryPrice: t.entryPrice || 0,
          netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
        }));
        const check = checkDailyLossBreach(summaryList, maxDailyLoss);
        if (check.breached) breachCount++;
      }

      const followed = breachCount === 0;
      return {
        followed,
        actual: breachCount,
        target: 0,
        note: followed
          ? 'Zero daily loss breaches this week. Risk limits respected.'
          : `Breached maximum daily loss on ${breachCount} day(s).`,
      };
    }

    case 'MISTAKE_COUNT': {
      const targetTag = metric.tag;
      let count = 0;
      for (const t of closedTrades) {
        const mistakes = new Set<string>();
        if (t.psychology?.mistakes) {
          t.psychology.mistakes.forEach((m) => mistakes.add(m));
        }
        if (t.mistakes) {
          t.mistakes.forEach((m) => mistakes.add(m));
        }
        if (targetTag && mistakes.has(targetTag)) {
          count++;
        }
      }

      const followed = count === 0;
      return {
        followed,
        actual: count,
        target: 0,
        note: followed
          ? `Zero instances of ${targetTag} logged this week. Excellent discipline!`
          : `Logged ${count} trade(s) with mistake ${targetTag}.`,
      };
    }

    case 'TEMPLATE_PAUSE': {
      const targetId = metric.templateId;
      const targetName = metric.templateName;
      let count = 0;

      for (const t of closedTrades) {
        const matchId = targetId && (t.templateId === targetId || t.strategyId === targetId);
        const matchName = targetName && (t.strategyName === targetName || t.symbol === targetName);
        if (matchId || matchName) {
          count++;
        }
      }

      const followed = count === 0;
      return {
        followed,
        actual: count,
        target: 0,
        note: followed
          ? `Paused setup (${targetName || targetId}) was not traded.`
          : `Traded paused setup ${count} time(s).`,
      };
    }

    case 'REPEAT_TEMPLATE': {
      const targetId = metric.templateId;
      const targetName = metric.templateName;
      let count = 0;
      let netPnL = new Decimal(0);

      for (const t of closedTrades) {
        const matchId = targetId && (t.templateId === targetId || t.strategyId === targetId);
        const matchName = targetName && t.strategyName === targetName;
        if (matchId || matchName) {
          count++;
          netPnL = netPnL.plus(t.calculated?.netPnL ?? t.netPnL ?? 0);
        }
      }

      const followed = count > 0;
      return {
        followed,
        actual: count,
        target: 1,
        note: followed
          ? `Executed ${count} trade(s) using ${targetName || 'target setup'} (Net P&L: ₹${netPnL.toFixed(2)}).`
          : `No trades executed with preferred setup ${targetName || ''}.`,
      };
    }

    case 'MAINTAIN_DISCIPLINE': {
      let mistakeTrades = 0;
      for (const t of closedTrades) {
        const hasMistakes =
          (t.psychology?.mistakes && t.psychology.mistakes.length > 0) ||
          (t.mistakes && t.mistakes.length > 0);
        if (hasMistakes) mistakeTrades++;
      }
      const followed = mistakeTrades === 0;
      return {
        followed,
        actual: mistakeTrades,
        target: 0,
        note: followed
          ? 'Flawless execution: Zero mistakes tagged this week.'
          : `${mistakeTrades} trade(s) had rule violations or mistakes.`,
      };
    }

    default:
      return {
        followed: null,
        actual: null,
        target: null,
        note: 'Custom focus rule requires self-evaluation.',
      };
  }
}
