import Decimal from 'decimal.js';
import {
  IRiskSettings,
  MistakeTag,
  IMistakeSuggestion,
  IDailyLossBreach,
  TradeStatus,
  LIQUIDITY_OR_SR_CONFLUENCE_VALUES,
  ITradeSetup,
} from '@tradevault/shared';

export interface ITradeSummaryForDetection {
  id?: string;
  symbol: string;
  direction?: 'LONG' | 'SHORT';
  status: TradeStatus | string;
  entryTime: Date | string;
  exitTime?: Date | string | null;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  netPnL?: number | null;
  plannedRiskAmount?: number | null;
  riskPercent?: number | null;
  accountEquity?: number | null;
  mistakes?: string[];
  confluences?: string[];
  plannedTarget?: number | null;
  targetRationale?: string | null;
  initialStopLoss?: number | null;
  tickSize?: number | null;
  setup?: ITradeSetup | null;
  excursion?: {
    status?: string;
    exitEfficiency?: number;
    reversedAfterStopHit?: boolean;
    stopHit?: boolean;
    mfeR?: number;
    maeR?: number;
    mfePoints?: number;
    maePoints?: number;
    excursionFlags?: string[];
  } | null;
  stopLossMoved?: boolean;
  stopMoveSummary?: {
    hasWidenedRisk?: boolean;
    widenedCount?: number;
    trailedCount?: number;
    netRiskChangePoints?: number;
  } | null;
  stopLossMoveEvents?: Array<{
    moveType?: string;
    previousStop?: number;
    newStop?: number;
    changePoints?: number;
  }>;
}

export interface IDetectMistakesParams {
  trades: ITradeSummaryForDetection[];
  targetTradeId?: string;
  accountEquity?: number;
  thresholds?: IRiskSettings;
}

export interface IMistakeDetectionResult {
  suggestions: IMistakeSuggestion[];
  dailyLossBreach: IDailyLossBreach;
  totalTradesToday: number;
  openTradesCount: number;
}

export interface IDailySessionPrefill {
  date: string;
  suggestedBestTrade?: {
    id: string;
    symbol: string;
    netPnL: number;
  } | null;
  suggestedWorstTrade?: {
    id: string;
    symbol: string;
    netPnL: number;
  } | null;
  aggregatedMistakes: MistakeTag[];
  suggestedDisciplineRating: number;
  reasoning: string;
  dailyLossBreach: IDailyLossBreach;
  tradesCount: number;
  netPnL: number;
}

const DEFAULT_THRESHOLDS: Required<IRiskSettings> = {
  revengeTradingMinutes: 30,
  maxDailyTrades: 5,
  maxOpenTrades: 3,
  maxRiskPerTradePercent: 2.0,
  maxDailyLoss: 5000,
};

/**
 * Checks whether the accumulated loss for a collection of closed trades breaches maxDailyLoss.
 */
export function checkDailyLossBreach(
  closedTrades: ITradeSummaryForDetection[],
  maxDailyLoss: number = DEFAULT_THRESHOLDS.maxDailyLoss,
  currency: string = 'INR'
): IDailyLossBreach {
  let dailyLoss = new Decimal(0);

  for (const t of closedTrades) {
    if (t.netPnL !== undefined && t.netPnL !== null) {
      dailyLoss = dailyLoss.plus(new Decimal(t.netPnL));
    }
  }

  const dLimit = new Decimal(maxDailyLoss);
  // dailyLoss is net PnL (negative means loss)
  const isLoss = dailyLoss.isNegative();
  const lossMagnitude = dailyLoss.abs();
  const breached = isLoss && lossMagnitude.greaterThanOrEqualTo(dLimit);

  return {
    breached,
    maxDailyLoss,
    currentDailyLoss: isLoss ? Number(lossMagnitude.toFixed(2)) : 0,
    currency,
    message: breached
      ? `Maximum daily loss limit of ₹${maxDailyLoss.toLocaleString()} breached (Current Loss: ₹${Number(lossMagnitude.toFixed(2)).toLocaleString()}). Stop trading for the session.`
      : undefined,
  };
}

/**
 * Detects rule-based mistake suggestions across trades using deterministic financial rules.
 */
export function detectMistakeSuggestions(params: IDetectMistakesParams): IMistakeDetectionResult {
  const { trades, targetTradeId, accountEquity } = params;
  const thresholds: Required<IRiskSettings> = {
    ...DEFAULT_THRESHOLDS,
    ...(params.thresholds || {}),
  };

  const suggestions: IMistakeSuggestion[] = [];

  // Parse and sort trades chronologically by entryTime
  const sorted = [...trades].sort((a, b) => {
    const timeA = new Date(a.entryTime).getTime();
    const timeB = new Date(b.entryTime).getTime();
    return timeA - timeB;
  });

  // Track daily trades map by YYYY-MM-DD
  const dailyTradesMap = new Map<string, ITradeSummaryForDetection[]>();
  for (const t of sorted) {
    const dStr = new Date(t.entryTime).toISOString().split('T')[0];
    const list = dailyTradesMap.get(dStr) || [];
    list.push(t);
    dailyTradesMap.set(dStr, list);
  }

  // 1. Analyze each trade
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (targetTradeId && current.id && current.id !== targetTradeId) {
      continue;
    }

    const currentEntryTime = new Date(current.entryTime).getTime();

    // --- RULE A: Revenge Trading ---
    // Look for previous closed losing trade within revengeTradingMinutes
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j];
      if (prev.status !== 'CLOSED' || !prev.exitTime) continue;

      const prevExitTime = new Date(prev.exitTime).getTime();
      // Ensure prev trade exited before current trade entry
      if (prevExitTime <= currentEntryTime) {
        const diffMinutes = (currentEntryTime - prevExitTime) / (60 * 1000);
        if (diffMinutes <= thresholds.revengeTradingMinutes) {
          const prevPnL = prev.netPnL ?? 0;
          if (prevPnL < 0) {
            // Check position size or monetary value
            const currentVal = new Decimal(current.quantity).times(current.entryPrice);
            const prevVal = new Decimal(prev.quantity).times(prev.entryPrice);

            if (
              current.quantity >= prev.quantity ||
              currentVal.greaterThanOrEqualTo(prevVal)
            ) {
              suggestions.push({
                tradeId: current.id,
                rule: 'REVENGE_TRADING',
                mistakeTag: 'REVENGE_TRADING',
                severity: 'CRITICAL',
                message: `Entered ${current.symbol} within ${Math.round(
                  diffMinutes
                )}m of a losing trade (${prev.symbol}, -₹${Math.abs(
                  prevPnL
                ).toLocaleString()}) with equal or larger size (${current.quantity} vs ${prev.quantity}).`,
              });
              break; // Don't flag multiple revenge origins for same trade
            }
          }
        } else {
          // Out of time window, since sorted, earlier trades are even further away
          break;
        }
      }
    }

    // --- RULE B: Overtrading (Concurrent Open Trades & Daily Cap) ---
    // Check concurrent open trades at the time of current trade entry
    let openAtCurrentTime = 0;
    for (const other of sorted) {
      if (other.id === current.id) continue;
      const otherEntry = new Date(other.entryTime).getTime();
      if (otherEntry <= currentEntryTime) {
        if (!other.exitTime || other.status === 'OPEN') {
          openAtCurrentTime++;
        } else {
          const otherExit = new Date(other.exitTime).getTime();
          if (otherExit > currentEntryTime) {
            openAtCurrentTime++;
          }
        }
      }
    }

    if (openAtCurrentTime >= thresholds.maxOpenTrades) {
      suggestions.push({
        tradeId: current.id,
        rule: 'OVERTRADING',
        mistakeTag: 'OVERTRADING',
        severity: 'WARNING',
        message: `Exceeded concurrent open trades limit (${openAtCurrentTime + 1} open > limit of ${
          thresholds.maxOpenTrades
        }).`,
      });
    }

    // Check daily trade cap
    const dStr = new Date(current.entryTime).toISOString().split('T')[0];
    const dayTrades = dailyTradesMap.get(dStr) || [];
    const tradeIndexInDay = dayTrades.findIndex((t) => t.id === current.id);
    const dayCount = tradeIndexInDay >= 0 ? tradeIndexInDay + 1 : dayTrades.length;

    if (dayCount > thresholds.maxDailyTrades) {
      suggestions.push({
        tradeId: current.id,
        rule: 'OVERTRADING',
        mistakeTag: 'OVERTRADING',
        severity: 'WARNING',
        message: `Trade #${dayCount} exceeds maximum allowed daily trades limit (${thresholds.maxDailyTrades} trades/day).`,
      });
    }

    // --- RULE C: Position Size Violation ---
    const maxRiskPct = thresholds.maxRiskPerTradePercent;
    let actualRiskPct = current.riskPercent;

    if (
      (actualRiskPct === undefined || actualRiskPct === null) &&
      current.plannedRiskAmount &&
      accountEquity &&
      accountEquity > 0
    ) {
      actualRiskPct = Number(
        new Decimal(current.plannedRiskAmount)
          .dividedBy(accountEquity)
          .times(100)
          .toFixed(2)
      );
    }

    if (actualRiskPct !== undefined && actualRiskPct !== null && actualRiskPct > maxRiskPct) {
      suggestions.push({
        tradeId: current.id,
        rule: 'SIZE_VIOLATION',
        mistakeTag: 'SIZE_VIOLATION',
        severity: 'CRITICAL',
        message: `Position risk of ${actualRiskPct}% exceeds maximum allowable risk threshold of ${maxRiskPct}% per trade.`,
      });
    }

    // --- RULE D: Liquidity Confluence Check (NO_LIQUIDITY_TAKEN) ---
    // Advisory check for closed trades: must contain at least one liquidity or support/resistance confluence
    const setupHasLiquidity =
      (current.setup?.liquiditySide !== undefined && current.setup.liquiditySide !== 'NONE') ||
      ['EQL', 'EQH', 'W-SWEEP', 'M-SWEEP'].includes(current.setup?.variantKey || '') ||
      current.setup?.patternType === 'EQUAL_LOWS' ||
      current.setup?.patternType === 'EQUAL_HIGHS';

    if (current.status === 'CLOSED' && current.confluences !== undefined) {
      const confluences = current.confluences || [];
      const hasLiquidityOrSR = confluences.some((c) => LIQUIDITY_OR_SR_CONFLUENCE_VALUES.has(c));
      if (!hasLiquidityOrSR && !setupHasLiquidity) {
        suggestions.push({
          tradeId: current.id,
          rule: 'NO_LIQUIDITY_TAKEN',
          mistakeTag: 'NO_LIQUIDITY_TAKEN',
          severity: 'INFO',
          message: `Closed trade on ${current.symbol} has no logged liquidity sweep or support/resistance confluence.`,
        });
      }
    }

    // --- RULE E: Liquidity Target Check (NO_LIQUIDITY_TARGET) ---
    // Advisory check: trade has a missing planned target or empty target rationale
    // Only applies when confluences or target fields are being tracked/provided
    const hasConfluencesOrTarget =
      (current.confluences && current.confluences.length > 0) ||
      current.plannedTarget !== undefined ||
      current.targetRationale !== undefined;

    if (hasConfluencesOrTarget) {
      const hasTarget = current.plannedTarget !== undefined && current.plannedTarget !== null && current.plannedTarget > 0;
      const hasTargetRationale = Boolean(current.targetRationale && current.targetRationale.trim().length > 0);
      if (!hasTarget || !hasTargetRationale) {
        suggestions.push({
          tradeId: current.id,
          rule: 'NO_LIQUIDITY_TARGET',
          mistakeTag: 'NO_LIQUIDITY_TARGET',
          severity: 'INFO',
          message: !hasTarget
            ? `Missing predefined planned target at opposing liquidity pool for ${current.symbol}.`
            : `Missing target rationale explaining exit objective for ${current.symbol}.`,
        });
      }
    }

    // --- RULE F: Stop Loss Distance Check (STOP_TOO_TIGHT) ---
    // Feasible when entryPrice, initialStopLoss, and tickSize (> 0) are provided
    if (
      current.entryPrice &&
      current.initialStopLoss &&
      current.tickSize &&
      current.tickSize > 0
    ) {
      const entry = new Decimal(current.entryPrice);
      const stop = new Decimal(current.initialStopLoss);
      const stopDist = entry.minus(stop).abs();
      const minDistance = new Decimal(current.tickSize).times(3); // Less than 3 ticks is considered too tight
      if (stopDist.greaterThan(0) && stopDist.lessThan(minDistance)) {
        suggestions.push({
          tradeId: current.id,
          rule: 'STOP_TOO_TIGHT',
          mistakeTag: 'STOP_TOO_TIGHT',
          severity: 'WARNING',
          message: `Initial stop distance (${stopDist.toString()} pts) is less than 3 ticks (${minDistance.toString()} pts) for ${current.symbol}. Prone to market noise.`,
        });
      }
    }

    // --- RULE G: Excursion Stop Reversal Evidence (STOP_TOO_TIGHT) ---
    if (
      current.excursion?.reversedAfterStopHit === true ||
      current.excursion?.excursionFlags?.includes('STOP_TOO_TIGHT_EVIDENCE')
    ) {
      const alreadySuggested = suggestions.some(
        (s) => s.tradeId === current.id && s.mistakeTag === 'STOP_TOO_TIGHT'
      );
      if (!alreadySuggested) {
        suggestions.push({
          tradeId: current.id,
          rule: 'STOP_TOO_TIGHT_REVERSAL',
          mistakeTag: 'STOP_TOO_TIGHT',
          severity: 'WARNING',
          message: `Price breached stop loss and subsequently reversed back to entry on ${current.symbol}. Excursion data indicates stop was placed too tight.`,
        });
      }
    }

    // --- RULE H: Premature Exit from Excursion (PREMATURE_EXIT) ---
    if (
      current.excursion &&
      current.excursion.status === 'COMPUTED' &&
      current.excursion.exitEfficiency !== undefined &&
      current.excursion.exitEfficiency < 0.35 &&
      ((current.excursion.mfeR !== undefined && current.excursion.mfeR >= 1.5) ||
        current.excursion.excursionFlags?.includes('GAVE_BACK_PROFIT') ||
        current.excursion.excursionFlags?.includes('EXITED_EARLY'))
    ) {
      suggestions.push({
        tradeId: current.id,
        rule: 'PREMATURE_EXIT_EXCURSION',
        mistakeTag: 'PREMATURE_EXIT',
        severity: 'WARNING',
        message: `Exited early with low exit efficiency (${(current.excursion.exitEfficiency * 100).toFixed(0)}%) while market reached favorable excursion on ${current.symbol}.`,
      });
    }

    // --- RULE I: Breakeven Too Early from Excursion (BREAKEVEN_TOO_EARLY) ---
    if (
      current.excursion &&
      current.excursion.status === 'COMPUTED' &&
      current.entryPrice &&
      current.exitPrice
    ) {
      const entry = new Decimal(current.entryPrice);
      const exit = new Decimal(current.exitPrice);
      const moveDiff = exit.minus(entry).abs();
      const isNearBreakeven =
        (current.netPnL !== undefined && current.netPnL !== null && Math.abs(current.netPnL) <= 50) ||
        (entry.greaterThan(0) && moveDiff.dividedBy(entry).lessThanOrEqualTo(0.0015));

      if (
        isNearBreakeven &&
        current.excursion.mfeR !== undefined &&
        current.excursion.mfeR >= 1.5
      ) {
        suggestions.push({
          tradeId: current.id,
          rule: 'BREAKEVEN_TOO_EARLY_EXCURSION',
          mistakeTag: 'BREAKEVEN_TOO_EARLY',
          severity: 'WARNING',
          message: `Position on ${current.symbol} closed near breakeven before reaching ${current.excursion.mfeR}R peak favorable excursion.`,
        });
      }
    }

    // --- RULE J: Stop-Move Detection (STOP_MOVED) ---
    const hasWidenedStop =
      current.stopMoveSummary?.hasWidenedRisk === true ||
      (current.stopMoveSummary?.widenedCount !== undefined && current.stopMoveSummary.widenedCount > 0) ||
      current.stopLossMoveEvents?.some((e) => e.moveType === 'WIDENED_RISK') ||
      current.stopLossMoved === true;

    if (hasWidenedStop) {
      const alreadySuggested = suggestions.some(
        (s) => s.tradeId === current.id && s.mistakeTag === 'STOP_MOVED'
      );
      if (!alreadySuggested) {
        const pointStr = current.stopMoveSummary?.netRiskChangePoints
          ? ` (${current.stopMoveSummary.netRiskChangePoints > 0 ? '+' : ''}${current.stopMoveSummary.netRiskChangePoints} pts)`
          : '';
        suggestions.push({
          tradeId: current.id,
          rule: 'STOP_MOVED_WIDENED',
          mistakeTag: 'STOP_MOVED',
          severity: 'CRITICAL',
          message: `Stop loss on ${current.symbol} was moved further away from market during trade execution, widening downside risk${pointStr}.`,
        });
      }
    }

    // --- RULE K: Counter-Trend Without Liquidity Setup (COUNTER_TREND_NO_SWEEP) ---
    if (current.setup?.htfBias && current.direction) {
      const htf = current.setup.htfBias;
      const dir = current.direction;
      const isAgainstHtf = (htf === 'BULLISH' && dir === 'SHORT') || (htf === 'BEARISH' && dir === 'LONG');
      if (isAgainstHtf && !setupHasLiquidity) {
        suggestions.push({
          tradeId: current.id,
          rule: 'COUNTER_TREND_NO_SWEEP',
          mistakeTag: 'COUNTER_TREND_NO_SWEEP',
          severity: 'WARNING',
          message: `${dir === 'LONG' ? 'Long' : 'Short'} trade on ${current.symbol} was taken against ${htf} HTF trend without an identified liquidity sweep or reversal setup.`,
        });
      }
    }

    // --- RULE L: Premature Entry Before Liquidity Raid (ENTERED_BEFORE_SWEEP) ---
    if (
      current.setup?.variantKey === 'W-UNSWEPT' ||
      current.setup?.variantKey === 'M-UNSWEPT' ||
      current.setup?.secondLegStatus === 'UNSWEPT'
    ) {
      suggestions.push({
        tradeId: current.id,
        rule: 'ENTERED_BEFORE_SWEEP',
        mistakeTag: 'ENTERED_BEFORE_SWEEP',
        severity: 'WARNING',
        message: `Entered ${current.symbol} prematurely on unswept second leg (${current.setup?.variantKey || 'UNSWEPT'}) before resting liquidity was purged.`,
      });
    }
  }

  // Calculate daily loss breach on all closed trades
  const closedTrades = sorted.filter((t) => t.status === 'CLOSED');
  const dailyLossBreach = checkDailyLossBreach(closedTrades, thresholds.maxDailyLoss);

  // Count open trades currently
  const openTradesCount = sorted.filter((t) => t.status === 'OPEN').length;

  return {
    suggestions,
    dailyLossBreach,
    totalTradesToday: sorted.length,
    openTradesCount,
  };
}

/**
 * Computes prefill data for a Daily Journal review session.
 */
export function calculateDailySessionSummary(
  date: string,
  trades: ITradeSummaryForDetection[],
  thresholds?: IRiskSettings,
  accountEquity?: number
): IDailySessionPrefill {
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');

  // Identify Best Trade
  let suggestedBestTrade: { id: string; symbol: string; netPnL: number } | null = null;
  let maxPnL = new Decimal(0);

  // Identify Worst Trade
  let suggestedWorstTrade: { id: string; symbol: string; netPnL: number } | null = null;
  let minPnL = new Decimal(0);

  let netPnL = new Decimal(0);

  for (const t of closedTrades) {
    const pnl = new Decimal(t.netPnL ?? 0);
    netPnL = netPnL.plus(pnl);

    if (pnl.greaterThan(maxPnL)) {
      maxPnL = pnl;
      if (t.id) {
        suggestedBestTrade = { id: t.id, symbol: t.symbol, netPnL: Number(pnl.toFixed(2)) };
      }
    }

    if (pnl.lessThan(minPnL)) {
      minPnL = pnl;
      if (t.id) {
        suggestedWorstTrade = { id: t.id, symbol: t.symbol, netPnL: Number(pnl.toFixed(2)) };
      }
    }
  }

  // Run mistake detection
  const detection = detectMistakeSuggestions({
    trades,
    thresholds,
    accountEquity,
  });

  // Aggregate mistakes
  const mistakeSet = new Set<MistakeTag>();

  // Add existing mistakes tagged by trader
  for (const t of trades) {
    if (t.mistakes) {
      for (const m of t.mistakes) {
        mistakeSet.add(m as MistakeTag);
      }
    }
  }

  // Add newly suggested mistake tags
  for (const s of detection.suggestions) {
    mistakeSet.add(s.mistakeTag);
  }

  const aggregatedMistakes = Array.from(mistakeSet);

  // Determine discipline rating (1 to 5)
  let suggestedDisciplineRating = 5;
  let reasoning = 'Flawless execution: All trading rules and risk limits were respected.';

  const hasRevenge = detection.suggestions.some((s) => s.rule === 'REVENGE_TRADING');
  const hasSizeViolation = detection.suggestions.some((s) => s.rule === 'SIZE_VIOLATION');
  const hasOvertrading = detection.suggestions.some((s) => s.rule === 'OVERTRADING');

  if (detection.dailyLossBreach.breached || hasRevenge) {
    suggestedDisciplineRating = 1;
    reasoning = detection.dailyLossBreach.breached
      ? 'Severe Tilt / Breach: Maximum daily loss limit exceeded.'
      : 'Severe Discipline Breakdown: Revenge trading pattern detected.';
  } else if (hasSizeViolation || hasOvertrading) {
    suggestedDisciplineRating = 2;
    reasoning = 'Rule Violation: Position sizing limit or trade frequency cap exceeded.';
  } else if (aggregatedMistakes.length > 0) {
    suggestedDisciplineRating = 3;
    reasoning = 'Rule Drift: Setup execution had logged mistakes or hesitation.';
  } else if (netPnL.isNegative()) {
    suggestedDisciplineRating = 4;
    reasoning = 'Good Execution: Losses were strictly managed within risk tolerance.';
  }

  return {
    date,
    suggestedBestTrade,
    suggestedWorstTrade,
    aggregatedMistakes,
    suggestedDisciplineRating,
    reasoning,
    dailyLossBreach: detection.dailyLossBreach,
    tradesCount: trades.length,
    netPnL: Number(netPnL.toFixed(2)),
  };
}
