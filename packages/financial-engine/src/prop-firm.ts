import Decimal from './decimal.js';
import {
  IPropFirmConfig,
  IPropFirmHealthSummary,
  IPropFirmRuleSet,
  IPropRuleEvaluation,
  PropPhase,
  PropRuleStatus,
  PropThreatLevel,
} from '@tradevault/shared';
import {
  getPropFirmPreset,
  mergeRuleSetWithOverrides,
  PROP_FIRM_PRESETS,
} from './prop-firm-presets.js';

export {
  getPropFirmPreset,
  listPropFirmPresets,
  mergeRuleSetWithOverrides,
  PROP_FIRM_PRESETS,
} from './prop-firm-presets.js';

export interface IPropFirmEvaluationParams {
  accountId?: string;
  config?: IPropFirmConfig;
  account?: any;
  trades?: any[];
  snapshot?: any;
  ruleSet?: IPropFirmRuleSet;
  now?: Date;
  currentBalance?: Decimal.Value;
  unrealizedPnL?: Decimal.Value;
  previousDayEodBalance?: Decimal.Value;
  previousDayEodEquity?: Decimal.Value;
  startOfDayBalance?: Decimal.Value;
  startOfDayEquity?: Decimal.Value;
  peakEquity?: Decimal.Value;
}

/**
 * Computes the next daily reset ISO timestamp given timezone and reset time (e.g. '00:00 Europe/Prague').
 */
export function computeNextDailyReset(
  timezone = 'UTC',
  resetTime = '00:00',
  now: Date = new Date()
): string {
  try {
    const [targetHourStr = '0', targetMinuteStr = '0'] = resetTime.split(':');
    const targetHour = parseInt(targetHourStr, 10) || 0;
    const targetMinute = parseInt(targetMinuteStr, 10) || 0;

    // Use Intl to get current parts in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0';

    const curYear = parseInt(getPart('year'), 10);
    const curMonth = parseInt(getPart('month'), 10) - 1;
    const curDay = parseInt(getPart('day'), 10);
    const curHour = parseInt(getPart('hour'), 10);
    const curMinute = parseInt(getPart('minute'), 10);

    // Determine if reset is today or tomorrow in target timezone
    let targetDay = curDay;
    if (curHour > targetHour || (curHour === targetHour && curMinute >= targetMinute)) {
      targetDay += 1;
    }

    // Estimate reset in UTC by approximate offset
    const approxTargetDate = new Date(Date.UTC(curYear, curMonth, targetDay, targetHour, targetMinute, 0));
    return approxTargetDate.toISOString();
  } catch {
    // Fallback: 24 hours from midnight UTC
    const d = new Date(now);
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  }
}

/**
 * Returns preset configuration for The5ers Summer Plan ($149, $100K 2-Step 10/5).
 * Backward-compatible helper.
 */
export function getThe5ersSummerPlanPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 10 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.9).toNumber();

  return {
    enabled: true,
    firm: 'THE5ERS',
    planName: 'Summer Plan 10/5 ($149)',
    phase,
    initialBalance,
    targetProfitPercent: targetPercent,
    dailyLossLimitPercent: 3,
    dailyLossReference: 'MAX_BALANCE_EQUITY_EOD',
    maxLossLimitPercent: 10,
    maxLossType: 'STATIC_FROM_INITIAL',
    maxLossFloor,
    minTradingDays: 0,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    status: 'ACTIVE',
  };
}

/**
 * Returns preset configuration for The5ers High Stakes ($100K).
 * Backward-compatible helper.
 */
export function getThe5ersHighStakesPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 8 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.9).toNumber();

  return {
    enabled: true,
    firm: 'THE5ERS',
    planName: 'High Stakes 8/5',
    phase,
    initialBalance,
    targetProfitPercent: targetPercent,
    dailyLossLimitPercent: 5,
    dailyLossReference: 'MAX_BALANCE_EQUITY_EOD',
    maxLossLimitPercent: 10,
    maxLossType: 'STATIC_FROM_INITIAL',
    maxLossFloor,
    minTradingDays: 3,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    status: 'ACTIVE',
  };
}

/**
 * Returns preset configuration for FTMO $100K Standard (10/5).
 * Backward-compatible helper.
 */
export function getFtmoStandardPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 10 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.9).toNumber();

  return {
    enabled: true,
    firm: 'FTMO',
    planName: 'FTMO Standard 10/5',
    phase,
    initialBalance,
    targetProfitPercent: targetPercent,
    dailyLossLimitPercent: 5,
    dailyLossReference: 'STARTING_BALANCE',
    maxLossLimitPercent: 10,
    maxLossType: 'STATIC_FROM_INITIAL',
    maxLossFloor,
    minTradingDays: 4,
    newsTradingAllowed: false,
    weekendHoldingAllowed: true,
    status: 'ACTIVE',
  };
}

/**
 * Pure 30-digit Decimal.js evaluator for Prop Firm account health.
 *
 * Supports both signatures:
 * 1. evaluatePropFirmHealth(params: IPropFirmEvaluationParams)
 * 2. evaluatePropFirmHealth(account, trades, snapshot, ruleSet, now)
 */
export function evaluatePropFirmHealth(
  arg1: any,
  arg2?: any[],
  arg3?: any,
  arg4?: IPropFirmRuleSet,
  arg5?: Date
): IPropFirmHealthSummary {
  // Normalize parameters
  let account: any;
  let trades: any[] = [];
  let snapshot: any = {};
  let ruleSet: IPropFirmRuleSet | undefined;
  let now: Date = new Date();

  // If only 1 argument is passed and it's a params object
  if (
    arg2 === undefined &&
    arg3 === undefined &&
    arg4 === undefined &&
    arg1 &&
    typeof arg1 === 'object' &&
    (arg1.config !== undefined ||
      arg1.ruleSet !== undefined ||
      arg1.account !== undefined ||
      arg1.snapshot !== undefined ||
      arg1.unrealizedPnL !== undefined ||
      arg1.previousDayEodBalance !== undefined)
  ) {
    const params = arg1 as IPropFirmEvaluationParams;
    account = params.account || {
      id: params.accountId,
      currentBalance: params.currentBalance,
      initialBalance: params.config?.initialBalance ?? 100000,
      propFirmConfig: params.config,
    };
    trades = params.trades || [];
    snapshot = params.snapshot || {
      previousDayEodBalance: params.previousDayEodBalance,
      previousDayEodEquity: params.previousDayEodEquity,
      startOfDayBalance: params.startOfDayBalance,
      startOfDayEquity: params.startOfDayEquity,
      peakEquity: params.peakEquity,
      unrealizedPnL: params.unrealizedPnL,
    };
    ruleSet = params.ruleSet;
    now = params.now || new Date();
  } else {
    account = arg1 || {};
    trades = arg2 || [];
    snapshot = arg3 || {};
    ruleSet = arg4;
    now = arg5 || new Date();
  }

  // Extract account & prop firm configuration
  const propData = account.propFirm || {};
  const propConfig = account.propFirmConfig || {};

  const firmKey =
    ruleSet?.firmKey ||
    propData.firmKey ||
    propConfig.firm ||
    'THE5ERS';

  const planKey =
    ruleSet?.planKey ||
    propData.planKey ||
    (propConfig.planName?.includes('High Stakes') ? 'HIGH_STAKES_100K' : 'SUMMER_100K');

  const phase: PropPhase =
    propData.phase ||
    propConfig.phase ||
    'PHASE_1';

  // Resolve base rule set from registry if not explicitly provided
  if (!ruleSet) {
    const base = getPropFirmPreset(firmKey, planKey);
    if (base) {
      const overrides = propData.ruleSetOverrides || {};
      ruleSet = mergeRuleSetWithOverrides(base, overrides);
    } else {
      // Build a fallback rule set from legacy propFirmConfig
      ruleSet = {
        firmKey,
        planKey,
        displayName: propConfig.planName || `${firmKey} Plan`,
        currency: account.baseCurrency || 'USD',
        accountSize: propConfig.initialBalance || 100000,
        phases: [
          {
            phase,
            name: phase,
            profitTargetPct: propConfig.targetProfitPercent ?? (phase === 'PHASE_1' ? 10 : 5),
            minTradingDays: propConfig.minTradingDays ?? 0,
          },
        ],
        dailyLoss: {
          limitPct: propConfig.dailyLossLimitPercent ?? 3,
          basis:
            propConfig.dailyLossReference === 'STARTING_BALANCE'
              ? 'START_OF_DAY_BALANCE'
              : propConfig.dailyLossReference === 'STARTING_EQUITY'
              ? 'START_OF_DAY_EQUITY'
              : 'HIGHER_OF_BALANCE_EQUITY',
          resetTimezone: 'UTC',
          resetTime: '00:00',
          includesFloating: true,
        },
        maxLoss: {
          type:
            propConfig.maxLossType === 'TRAILING_EOD'
              ? 'TRAILING_EOD'
              : propConfig.maxLossType === 'TRAILING_INTRADAY_HIGH'
              ? 'TRAILING_INTRADAY'
              : 'STATIC',
          limitPct: propConfig.maxLossLimitPercent ?? 10,
          floorLockRule: 'INITIAL_BALANCE',
        },
        holdOvernight: true,
        holdWeekend: propConfig.weekendHoldingAllowed ?? true,
        newsTradingRestriction: !(propConfig.newsTradingAllowed ?? true),
      };
    }
  }

  // Find phase-specific rules
  const currentPhaseRule =
    ruleSet.phases.find((p) => p.phase === phase) ||
    ruleSet.phases[0] || {
      phase,
      profitTargetPct: phase === 'PHASE_1' ? 10 : phase === 'PHASE_2' ? 5 : 0,
      minTradingDays: 0,
    };

  // Balances and equity (Decimal.js 30-digit precision)
  const dInitial = new Decimal(
    propData.startingBalance ??
      account.initialBalance ??
      ruleSet.accountSize ??
      100000
  );

  const dBalance = new Decimal(
    account.currentBalance ?? dInitial
  );

  const dUnrealized = new Decimal(
    snapshot.unrealizedPnL ?? account.unrealizedPnL ?? 0
  );

  const dEquity = dBalance.plus(dUnrealized);

  // Peak equity for trailing drawdowns
  let dPeakEquity = new Decimal(
    snapshot.peakEquity ?? dEquity
  );
  if (dEquity.gt(dPeakEquity)) {
    dPeakEquity = dEquity;
  }
  if (dInitial.gt(dPeakEquity)) {
    dPeakEquity = dInitial;
  }

  // Pre-existing breach check (sticky permanent breach invariant)
  const wasPreviouslyBreached =
    propData.status === 'FAILED' ||
    propConfig.status === 'BREACHED' ||
    Boolean(propData.breachedAt);

  const rules: Record<string, IPropRuleEvaluation> = {};
  let stickyBreachedRule = propData.breachedRule || '';
  let breachReason = propData.breachReason || '';
  let isAnyRuleBreached = wasPreviouslyBreached;

  // 1. PROFIT TARGET RULE
  const targetPercent = currentPhaseRule.profitTargetPct ?? 0;
  const isFundedPhase = phase === 'FUNDED' || targetPercent === 0;
  const dTargetProfitAmount = dInitial.times(targetPercent).dividedBy(100);
  const dTargetEquity = dInitial.plus(dTargetProfitAmount);
  const dProfitMade = dEquity.minus(dInitial);
  const dTargetRemaining = Decimal.max(0, dTargetEquity.minus(dEquity));

  let targetProgressPercent = 0;
  if (isFundedPhase) {
    targetProgressPercent = 100;
  } else if (!dTargetProfitAmount.isZero()) {
    const rawProgress = dProfitMade.dividedBy(dTargetProfitAmount).times(100);
    targetProgressPercent = Math.min(100, Math.max(0, Number(rawProgress.toFixed(2))));
  }

  const targetReached = !isFundedPhase && dEquity.gte(dTargetEquity);

  rules.profitTarget = {
    ruleKey: 'profitTarget',
    ruleName: 'Profit Target',
    status: isFundedPhase ? 'NOT_APPLICABLE' : targetReached ? 'SAFE' : 'SAFE',
    used: dProfitMade.toNumber(),
    limit: dTargetProfitAmount.toNumber(),
    remaining: dTargetRemaining.toNumber(),
    distanceToBreach: dTargetRemaining.toNumber(),
    details: isFundedPhase
      ? 'Funded Account — No profit target required.'
      : targetReached
      ? `Target of ${targetPercent}% reached!`
      : `${targetProgressPercent.toFixed(1)}% of ${targetPercent}% target achieved`,
  };

  // 2. DAILY LOSS RULE
  let dailyLossBreached = false;
  let dDailyBufferRemaining = new Decimal(0);
  let dDailyLossLimitAmount = new Decimal(0);
  let dDailyLossFloor = new Decimal(0);
  let dDailyRef = dInitial;
  let dailyBufferPercent = 100;
  let dailyResetsAt = '';

  if (ruleSet.dailyLoss) {
    const dl = ruleSet.dailyLoss;
    dailyResetsAt = computeNextDailyReset(dl.resetTimezone, dl.resetTime, now);

    // Baseline calculation based on basis
    if (dl.basis === 'HIGHER_OF_BALANCE_EQUITY') {
      const dPrevBal = new Decimal(snapshot.previousDayEodBalance ?? dInitial);
      const dPrevEq = new Decimal(snapshot.previousDayEodEquity ?? dInitial);
      dDailyRef = Decimal.max(dPrevBal, dPrevEq);
    } else if (dl.basis === 'START_OF_DAY_EQUITY') {
      dDailyRef = new Decimal(
        snapshot.startOfDayEquity ?? snapshot.previousDayEodEquity ?? dInitial
      );
    } else if (dl.basis === 'PREVIOUS_EOD_EQUITY') {
      dDailyRef = new Decimal(snapshot.previousDayEodEquity ?? dInitial);
    } else {
      // START_OF_DAY_BALANCE
      dDailyRef = new Decimal(
        snapshot.startOfDayBalance ?? snapshot.previousDayEodBalance ?? dInitial
      );
    }

    dDailyLossLimitAmount = dDailyRef.times(dl.limitPct).dividedBy(100);
    dDailyLossFloor = dDailyRef.minus(dDailyLossLimitAmount);

    const testEquity = dl.includesFloating !== false ? dEquity : dBalance;
    dDailyBufferRemaining = testEquity.minus(dDailyLossFloor);
    dailyLossBreached = dDailyBufferRemaining.lte(0);

    dailyBufferPercent = dDailyLossLimitAmount.isZero()
      ? 100
      : Number(
          dDailyBufferRemaining
            .dividedBy(dDailyLossLimitAmount)
            .times(100)
            .toFixed(2)
        );

    let status: PropRuleStatus = 'SAFE';
    if (dailyLossBreached) {
      status = 'BREACHED';
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'dailyLoss';
      if (!breachReason) breachReason = `Daily loss limit of ${dl.limitPct}% breached.`;
    } else if (dailyBufferPercent <= 25) {
      status = 'CRITICAL';
    } else if (dailyBufferPercent <= 50) {
      status = 'CAUTION';
    }

    rules.dailyLoss = {
      ruleKey: 'dailyLoss',
      ruleName: `Daily Loss Limit (${dl.limitPct}%)`,
      status,
      used: Decimal.max(0, dDailyRef.minus(testEquity)).toNumber(),
      limit: dDailyLossLimitAmount.toNumber(),
      remaining: dDailyBufferRemaining.toNumber(),
      distanceToBreach: dDailyBufferRemaining.toNumber(),
      resetsAt: dailyResetsAt,
      details: `Basis: ${dl.basis}. Floor: $${dDailyLossFloor.toFixed(2)}`,
    };
  } else {
    rules.dailyLoss = {
      ruleKey: 'dailyLoss',
      ruleName: 'Daily Loss Limit',
      status: 'NOT_CONFIGURED',
      details: 'This firm plan does not enforce a daily loss limit.',
    };
  }

  // 3. MAXIMUM OVERALL LOSS RULE
  let maxLossBreached = false;
  let dMaxLossBufferRemaining = new Decimal(0);
  let dMaxLossLimitAmount = new Decimal(0);
  let dMaxLossFloor = new Decimal(0);
  let maxLossBufferPercent = 100;

  if (ruleSet.maxLoss) {
    const ml = ruleSet.maxLoss;
    dMaxLossLimitAmount = dInitial.times(ml.limitPct).dividedBy(100);

    if (
      ml.type === 'STATIC' ||
      ml.type === 'STATIC_FROM_INITIAL'
    ) {
      dMaxLossFloor = dInitial.minus(dMaxLossLimitAmount);
    } else if (
      ml.type === 'TRAILING_INTRADAY' ||
      ml.type === 'TRAILING_INTRADAY_HIGH' ||
      ml.type === 'TRAILING_EOD' ||
      ml.type === 'TRAILING_UNTIL_BREAKEVEN_THEN_LOCK'
    ) {
      const trailFrom =
        ml.type === 'TRAILING_EOD'
          ? new Decimal(snapshot.previousDayEodEquity ?? dPeakEquity)
          : dPeakEquity;

      const rawFloor = trailFrom.minus(dMaxLossLimitAmount);

      if (
        ml.type === 'TRAILING_UNTIL_BREAKEVEN_THEN_LOCK' ||
        ml.floorLockRule === 'BREAKEVEN' ||
        ml.floorLockRule === 'INITIAL_BALANCE'
      ) {
        // Floor locks at initial balance once equity has grown enough
        dMaxLossFloor = Decimal.min(dInitial, rawFloor);
        if (rawFloor.gte(dInitial)) {
          dMaxLossFloor = dInitial;
        }
      } else {
        dMaxLossFloor = rawFloor;
      }
    } else {
      dMaxLossFloor = dInitial.minus(dMaxLossLimitAmount);
    }

    dMaxLossBufferRemaining = dEquity.minus(dMaxLossFloor);
    maxLossBreached = dMaxLossBufferRemaining.lte(0);

    maxLossBufferPercent = dMaxLossLimitAmount.isZero()
      ? 100
      : Number(
          dMaxLossBufferRemaining
            .dividedBy(dMaxLossLimitAmount)
            .times(100)
            .toFixed(2)
        );

    let status: PropRuleStatus = 'SAFE';
    if (maxLossBreached) {
      status = 'BREACHED';
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'maxLoss';
      if (!breachReason) breachReason = `Maximum loss floor of $${dMaxLossFloor.toFixed(2)} breached.`;
    } else if (maxLossBufferPercent <= 25) {
      status = 'CRITICAL';
    } else if (maxLossBufferPercent <= 50) {
      status = 'CAUTION';
    }

    rules.maxLoss = {
      ruleKey: 'maxLoss',
      ruleName: `Max Drawdown (${ml.limitPct}% ${ml.type})`,
      status,
      used: Decimal.max(0, dPeakEquity.minus(dEquity)).toNumber(),
      limit: dMaxLossLimitAmount.toNumber(),
      remaining: dMaxLossBufferRemaining.toNumber(),
      distanceToBreach: dMaxLossBufferRemaining.toNumber(),
      details: `Type: ${ml.type}. Hard Floor: $${dMaxLossFloor.toFixed(2)}`,
    };
  } else {
    rules.maxLoss = {
      ruleKey: 'maxLoss',
      ruleName: 'Max Drawdown',
      status: 'NOT_CONFIGURED',
      details: 'This firm plan does not configure a maximum drawdown limit.',
    };
  }

  // 4. MINIMUM TRADING DAYS
  const minDays = currentPhaseRule.minTradingDays ?? 0;
  if (minDays > 0) {
    const uniqueDays = new Set(
      trades
        .filter((t) => t.tradeDate || t.entryDate)
        .map((t) => {
          const raw = t.tradeDate || t.entryDate;
          const dt = typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
          return dt;
        })
    );
    const tradingDaysCount = uniqueDays.size;
    const remainingDays = Math.max(0, minDays - tradingDaysCount);
    const daysMet = tradingDaysCount >= minDays;

    rules.minTradingDays = {
      ruleKey: 'minTradingDays',
      ruleName: 'Min Trading Days',
      status: daysMet ? 'SAFE' : 'CAUTION',
      used: tradingDaysCount,
      limit: minDays,
      remaining: remainingDays,
      distanceToBreach: remainingDays,
      details: `${tradingDaysCount} of ${minDays} minimum trading days completed.`,
    };
  } else {
    rules.minTradingDays = {
      ruleKey: 'minTradingDays',
      ruleName: 'Min Trading Days',
      status: 'NOT_APPLICABLE',
      details: 'No minimum trading days requirement.',
    };
  }

  // 5. MAXIMUM CALENDAR DAYS (TIME LIMIT)
  const maxCalDays = currentPhaseRule.maxCalendarDays;
  if (maxCalDays && maxCalDays > 0) {
    const startedAt = propData.phaseStartedAt
      ? new Date(propData.phaseStartedAt)
      : new Date(account.createdAt || now);
    const elapsedDays = Math.floor((now.getTime() - startedAt.getTime()) / 86400000);
    const remainingCalDays = Math.max(0, maxCalDays - elapsedDays);
    const isExpired = elapsedDays > maxCalDays;

    let status: PropRuleStatus = 'SAFE';
    if (isExpired) {
      status = 'BREACHED';
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'maxCalendarDays';
      if (!breachReason) breachReason = `Time limit of ${maxCalDays} calendar days expired.`;
    } else if (remainingCalDays <= 3) {
      status = 'CRITICAL';
    } else if (remainingCalDays <= 7) {
      status = 'CAUTION';
    }

    rules.maxCalendarDays = {
      ruleKey: 'maxCalendarDays',
      ruleName: 'Time Limit (Calendar Days)',
      status,
      used: elapsedDays,
      limit: maxCalDays,
      remaining: remainingCalDays,
      distanceToBreach: remainingCalDays,
      details: `${remainingCalDays} days remaining of ${maxCalDays}-day challenge limit.`,
    };
  } else {
    rules.maxCalendarDays = {
      ruleKey: 'maxCalendarDays',
      ruleName: 'Time Limit',
      status: 'NOT_APPLICABLE',
      details: 'Unlimited trading period (no expiration).',
    };
  }

  // 6. CONSISTENCY RULE (Best-Day % of Total Profit)
  if (ruleSet.consistencyRule && ruleSet.consistencyRule.type === 'BEST_DAY_PCT_OF_TOTAL') {
    const maxPct = ruleSet.consistencyRule.maxPct ?? 50;

    // Group closed trades by day and sum net profit
    const dailyProfitsMap = new Map<string, Decimal>();
    for (const t of trades) {
      const pnl = new Decimal(t.calculated?.netPnL ?? t.netPnL ?? 0);
      const dayStr = typeof t.tradeDate === 'string'
        ? t.tradeDate.slice(0, 10)
        : t.tradeDate ? new Date(t.tradeDate).toISOString().slice(0, 10) : 'today';
      dailyProfitsMap.set(dayStr, (dailyProfitsMap.get(dayStr) || new Decimal(0)).plus(pnl));
    }

    let totalProfit = new Decimal(0);
    let bestDayProfit = new Decimal(0);

    for (const dailyPnL of dailyProfitsMap.values()) {
      if (dailyPnL.gt(0)) {
        totalProfit = totalProfit.plus(dailyPnL);
        if (dailyPnL.gt(bestDayProfit)) {
          bestDayProfit = dailyPnL;
        }
      }
    }

    let bestDayPct = 0;
    let consistencyBreached = false;
    let status: PropRuleStatus = 'SAFE';

    if (totalProfit.lte(0)) {
      bestDayPct = 0;
      status = 'SAFE';
    } else {
      bestDayPct = Number(bestDayProfit.dividedBy(totalProfit).times(100).toFixed(2));
      consistencyBreached = bestDayPct > maxPct;
      if (consistencyBreached) {
        status = 'BREACHED';
        isAnyRuleBreached = true;
        if (!stickyBreachedRule) stickyBreachedRule = 'consistency';
        if (!breachReason) breachReason = `Best day accounted for ${bestDayPct}% of total profit (max allowed: ${maxPct}%).`;
      } else if (bestDayPct >= maxPct * 0.9) {
        status = 'CRITICAL';
      } else if (bestDayPct >= maxPct * 0.75) {
        status = 'CAUTION';
      }
    }

    rules.consistency = {
      ruleKey: 'consistency',
      ruleName: `Consistency Rule (${maxPct}%)`,
      status,
      used: bestDayPct,
      limit: maxPct,
      remaining: Math.max(0, maxPct - bestDayPct),
      distanceToBreach: Math.max(0, maxPct - bestDayPct),
      details: totalProfit.lte(0)
        ? 'No positive trading days yet.'
        : `Best day: $${bestDayProfit.toFixed(2)} (${bestDayPct}% of $${totalProfit.toFixed(2)} total profit)`,
    };
  } else {
    rules.consistency = {
      ruleKey: 'consistency',
      ruleName: 'Consistency Rule',
      status: 'NOT_CONFIGURED',
      details: 'No consistency rule enforced.',
    };
  }

  // 7. OVERNIGHT & WEEKEND HOLDING
  if (ruleSet.holdWeekend === false) {
    let weekendViolation = false;
    for (const t of trades) {
      if (t.isWeekendHold || t.heldWeekend) {
        weekendViolation = true;
        break;
      }
      // Check entry and exit across weekend
      if (t.entryDate && t.exitDate) {
        const entry = new Date(t.entryDate);
        const exit = new Date(t.exitDate);
        if (exit.getTime() - entry.getTime() >= 2 * 86400000) {
          const entryDay = entry.getUTCDay();
          const exitDay = exit.getUTCDay();
          if (entryDay === 5 && (exitDay === 0 || exitDay === 1)) {
            weekendViolation = true;
            break;
          }
        }
      }
    }

    rules.holdWeekend = {
      ruleKey: 'holdWeekend',
      ruleName: 'Weekend Holding',
      status: weekendViolation ? 'BREACHED' : 'SAFE',
      details: weekendViolation
        ? 'Weekend holding detected (violates firm rule).'
        : 'Holding trades over the weekend is PROHIBITED.',
    };

    if (weekendViolation) {
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'holdWeekend';
      if (!breachReason) breachReason = 'Trade held over weekend in violation of prop firm objective.';
    }
  } else {
    rules.holdWeekend = {
      ruleKey: 'holdWeekend',
      ruleName: 'Weekend Holding',
      status: 'SAFE',
      details: 'Weekend holding is permitted.',
    };
  }

  if (ruleSet.holdOvernight === false) {
    let overnightViolation = false;
    for (const t of trades) {
      if (t.isOvernightHold || t.heldOvernight) {
        overnightViolation = true;
        break;
      }
    }

    rules.holdOvernight = {
      ruleKey: 'holdOvernight',
      ruleName: 'Overnight Holding',
      status: overnightViolation ? 'BREACHED' : 'SAFE',
      details: overnightViolation
        ? 'Overnight holding detected.'
        : 'Overnight holding is prohibited (intraday only).',
    };

    if (overnightViolation) {
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'holdOvernight';
      if (!breachReason) breachReason = 'Intraday position held overnight in violation of firm rules.';
    }
  }

  // 8. MANDATORY STOP LOSS
  if (ruleSet.mandatoryStopLoss) {
    let missingSlCount = 0;
    for (const t of trades) {
      const hasSl = Boolean(
        t.risk?.initialStopLoss ||
          t.risk?.stopLoss ||
          (t.risk?.plannedRiskAmount && t.risk.plannedRiskAmount > 0)
      );
      if (!hasSl && t.status !== 'CANCELLED') {
        missingSlCount++;
      }
    }

    rules.mandatoryStopLoss = {
      ruleKey: 'mandatoryStopLoss',
      ruleName: 'Mandatory Stop Loss',
      status: missingSlCount > 0 ? 'BREACHED' : 'SAFE',
      used: missingSlCount,
      limit: 0,
      details: missingSlCount > 0
        ? `${missingSlCount} trade(s) logged without a required stop loss.`
        : 'All trades fulfilled mandatory stop loss requirement.',
    };

    if (missingSlCount > 0) {
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'mandatoryStopLoss';
      if (!breachReason) breachReason = 'Executed trade without mandatory stop loss.';
    }
  } else {
    rules.mandatoryStopLoss = {
      ruleKey: 'mandatoryStopLoss',
      ruleName: 'Mandatory Stop Loss',
      status: 'NOT_CONFIGURED',
      details: 'Stop loss is recommended but not mandatory for this plan.',
    };
  }

  // 9. LOT / CONTRACT CAP
  if (ruleSet.maxLotsOrContracts && ruleSet.maxLotsOrContracts > 0) {
    const lotCap = ruleSet.maxLotsOrContracts;
    let maxLotObserved = 0;
    for (const t of trades) {
      const qty = Number(t.quantity || t.lots || 0);
      if (qty > maxLotObserved) maxLotObserved = qty;
    }
    const lotBreached = maxLotObserved > lotCap;

    rules.maxLots = {
      ruleKey: 'maxLots',
      ruleName: `Max Lots/Contracts (${lotCap})`,
      status: lotBreached ? 'BREACHED' : maxLotObserved >= lotCap * 0.9 ? 'CAUTION' : 'SAFE',
      used: maxLotObserved,
      limit: lotCap,
      remaining: Math.max(0, lotCap - maxLotObserved),
      distanceToBreach: Math.max(0, lotCap - maxLotObserved),
      details: lotBreached
        ? `Exceeded max position size: ${maxLotObserved} lots (cap: ${lotCap})`
        : `Peak position size: ${maxLotObserved} lots`,
    };

    if (lotBreached) {
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'maxLots';
      if (!breachReason) breachReason = `Position size exceeded firm lot cap of ${lotCap}.`;
    }
  }

  // 10. PER-TRADE RISK CAP
  if (ruleSet.maxRiskPerTradePct && ruleSet.maxRiskPerTradePct > 0) {
    const riskCapPct = ruleSet.maxRiskPerTradePct;
    const maxRiskAmount = dInitial.times(riskCapPct).dividedBy(100).toNumber();
    let peakRiskObserved = 0;

    for (const t of trades) {
      const riskAmt = Number(t.risk?.plannedRiskAmount || 0);
      if (riskAmt > peakRiskObserved) peakRiskObserved = riskAmt;
    }

    const riskCapBreached = peakRiskObserved > maxRiskAmount;
    rules.maxRiskPerTrade = {
      ruleKey: 'maxRiskPerTrade',
      ruleName: `Max Risk Per Trade (${riskCapPct}%)`,
      status: riskCapBreached ? 'BREACHED' : peakRiskObserved >= maxRiskAmount * 0.9 ? 'CAUTION' : 'SAFE',
      used: peakRiskObserved,
      limit: maxRiskAmount,
      remaining: Math.max(0, maxRiskAmount - peakRiskObserved),
      distanceToBreach: Math.max(0, maxRiskAmount - peakRiskObserved),
      details: riskCapBreached
        ? `Planned risk $${peakRiskObserved.toFixed(2)} exceeded ${riskCapPct}% limit ($${maxRiskAmount.toFixed(2)})`
        : `Peak 1R risk: $${peakRiskObserved.toFixed(2)} (cap: $${maxRiskAmount.toFixed(2)})`,
    };

    if (riskCapBreached) {
      isAnyRuleBreached = true;
      if (!stickyBreachedRule) stickyBreachedRule = 'maxRiskPerTrade';
      if (!breachReason) breachReason = `Planned trade risk exceeded max limit of ${riskCapPct}%.`;
    }
  }

  // Determine Nearest Breach across configured active loss rules
  let nearestBreach: { ruleKey: string; distanceToBreach: number; bufferPercent: number } | undefined;
  const candidates: { ruleKey: string; distanceToBreach: number; bufferPercent: number }[] = [];

  if (rules.dailyLoss && rules.dailyLoss.status !== 'NOT_CONFIGURED') {
    candidates.push({
      ruleKey: 'dailyLoss',
      distanceToBreach: rules.dailyLoss.distanceToBreach ?? 0,
      bufferPercent: dailyBufferPercent,
    });
  }
  if (rules.maxLoss && rules.maxLoss.status !== 'NOT_CONFIGURED') {
    candidates.push({
      ruleKey: 'maxLoss',
      distanceToBreach: rules.maxLoss.distanceToBreach ?? 0,
      bufferPercent: maxLossBufferPercent,
    });
  }

  candidates.sort((a, b) => a.bufferPercent - b.bufferPercent);
  if (candidates.length > 0) {
    nearestBreach = candidates[0];
  }

  // OVERALL THREAT LEVEL
  let threatLevel: PropThreatLevel = 'SAFE';
  if (isAnyRuleBreached) {
    threatLevel = 'BREACHED';
  } else if (
    Object.values(rules).some((r) => r.status === 'CRITICAL') ||
    dailyBufferPercent <= 25 ||
    maxLossBufferPercent <= 25
  ) {
    threatLevel = 'CRITICAL';
  } else if (
    Object.values(rules).some((r) => r.status === 'CAUTION') ||
    dailyBufferPercent <= 50 ||
    maxLossBufferPercent <= 50
  ) {
    threatLevel = 'CAUTION';
  }

  // PHASE ADVANCEMENT CRITERIA
  const canAdvancePhase =
    !isFundedPhase &&
    targetReached &&
    threatLevel !== 'BREACHED' &&
    (rules.minTradingDays?.status === 'SAFE' || rules.minTradingDays?.status === 'NOT_APPLICABLE');

  // OVERALL STATUS REASON
  let statusReason = 'Account risk parameters are healthy.';
  if (threatLevel === 'BREACHED') {
    if (dailyLossBreached) {
      statusReason = `BREACHED: Daily loss limit breached (${ruleSet.dailyLoss?.limitPct || 3}%). Current equity is below the daily floor.`;
    } else if (maxLossBreached) {
      statusReason = `BREACHED: Maximum loss limit breached. Account equity fell below the static floor ($${dMaxLossFloor.toNumber().toLocaleString()}).`;
    } else {
      statusReason = `BREACHED: ${breachReason || 'Risk parameters violated. Account disqualified.'}`;
    }
  } else if (threatLevel === 'CRITICAL') {
    if (dailyBufferPercent <= 25) {
      statusReason = `CRITICAL RISK: Daily buffer is down to only $${dDailyBufferRemaining.toFixed(2)} (${dailyBufferPercent.toFixed(1)}%). Consider pausing trading.`;
    } else {
      statusReason = `CRITICAL RISK: Maximum loss floor buffer is down to $${dMaxLossBufferRemaining.toFixed(2)}.`;
    }
  } else if (targetReached) {
    statusReason = `TARGET REACHED: +$${dProfitMade.toFixed(2)} profit achieved. Ready to advance to ${
      phase === 'PHASE_1' ? 'Phase 2' : 'Funded Master'
    }!`;
  } else if (dProfitMade.gt(0)) {
    statusReason = `On track: +$${dProfitMade.toFixed(2)} (${targetProgressPercent.toFixed(1)}% of target).`;
  }

  const overallStatus = threatLevel === 'BREACHED' ? 'FAILED' : targetReached ? 'PASSED' : 'ACTIVE';

  return {
    accountId: account.id || account._id?.toString() || '',
    firm: (firmKey as any),
    firmKey,
    planName: account.propFirmConfig?.planName || ruleSet.displayName,
    planKey: ruleSet.planKey,
    rulesVerifiedAt: ruleSet.rulesVerifiedAt,
    sourceUrl: ruleSet.sourceUrl,
    phase,
    status: overallStatus,
    breachedAt: isAnyRuleBreached ? (propData.breachedAt || now.toISOString()) : undefined,
    breachedRule: isAnyRuleBreached ? stickyBreachedRule : undefined,
    initialBalance: dInitial.toNumber(),
    currentBalance: dBalance.toNumber(),
    unrealizedPnL: dUnrealized.toNumber(),
    currentEquity: dEquity.toNumber(),
    highWaterMark: dPeakEquity.toNumber(),
    targetProfitPercent: targetPercent,
    targetProfitAmount: dTargetProfitAmount.toNumber(),
    targetEquity: dTargetEquity.toNumber(),
    profitMadeInPhase: dProfitMade.toNumber(),
    targetRemaining: dTargetRemaining.toNumber(),
    targetProgressPercent,
    targetReached,
    dailyLossReference: dDailyRef.toNumber(),
    dailyLossLimitAmount: dDailyLossLimitAmount.toNumber(),
    dailyLossFloor: dDailyLossFloor.toNumber(),
    todayLossSoFar: Decimal.max(0, dDailyRef.minus(dEquity)).toNumber(),
    dailyBufferRemaining: dDailyBufferRemaining.toNumber(),
    dailyBufferPercent,
    dailyLossBreached,
    maxLossFloor: dMaxLossFloor.toNumber(),
    maxLossBufferRemaining: dMaxLossBufferRemaining.toNumber(),
    maxLossBufferPercent,
    maxLossBreached,
    threatLevel,
    statusReason,
    canAdvancePhase,
    rules,
    nearestBreach,
  };
}
