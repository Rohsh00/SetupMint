import Decimal from 'decimal.js';
import {
  IPropFirmConfig,
  IPropFirmHealthSummary,
  PropPhase,
  PropThreatLevel,
} from '@tradevault/shared';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IPropFirmEvaluationParams {
  accountId?: string;
  config: IPropFirmConfig;
  currentBalance: Decimal.Value;
  unrealizedPnL?: Decimal.Value;
  previousDayEodBalance?: Decimal.Value;
  previousDayEodEquity?: Decimal.Value;
}

/**
 * Returns preset configuration for The5ers Summer Plan ($149, $100K 2-Step 10/5).
 * Rules:
 * - 10% Phase 1 profit target ($10,000 on $100K)
 * - 5% Phase 2 profit target ($5,000 on $100K)
 * - 3% Daily Loss Limit based on higher of EOD balance or equity
 * - 10% Static Maximum Loss ($90,000 hard floor on $100K)
 * - No minimum trading days, weekend & overnight holding allowed
 */
export function getThe5ersSummerPlanPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 10 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.90).toNumber();

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
 */
export function getThe5ersHighStakesPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 8 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.90).toNumber();

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
 */
export function getFtmoStandardPreset(
  initialBalance = 100000,
  phase: PropPhase = 'PHASE_1'
): IPropFirmConfig {
  const dInitial = new Decimal(initialBalance);
  const targetPercent = phase === 'PHASE_1' ? 10 : phase === 'PHASE_2' ? 5 : 0;
  const maxLossFloor = dInitial.times(0.90).toNumber();

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
 * Enforces exact The5ers rules:
 * - Daily loss limit against max(prevDayEODBalance, prevDayEODEquity)
 * - Static maximum loss floor from initial balance
 * - Floating open P&L inclusion for true intraday equity tracking
 */
export function evaluatePropFirmHealth(
  params: IPropFirmEvaluationParams
): IPropFirmHealthSummary {
  const { config } = params;
  const dInitial = new Decimal(config.initialBalance);
  const dBalance = new Decimal(params.currentBalance);
  const dUnrealized = new Decimal(params.unrealizedPnL || 0);
  const dEquity = dBalance.plus(dUnrealized);

  // 1. Target calculations
  const targetPercent = config.targetProfitPercent;
  const dTargetProfitAmount = dInitial.times(targetPercent).dividedBy(100);
  const dTargetEquity = dInitial.plus(dTargetProfitAmount);
  const dProfitMade = dEquity.minus(dInitial);
  const dTargetRemaining = Decimal.max(0, dTargetEquity.minus(dEquity));

  let targetProgressPercent = 0;
  if (config.phase === 'FUNDED') {
    targetProgressPercent = 100;
  } else if (!dTargetProfitAmount.isZero()) {
    const rawProgress = dProfitMade.dividedBy(dTargetProfitAmount).times(100);
    targetProgressPercent = Math.min(100, Math.max(0, Number(rawProgress.toFixed(2))));
  }

  // 2. Daily Loss Limit Calculations (The5ers exact rule)
  let dDailyRef = dInitial;
  if (config.dailyLossReference === 'MAX_BALANCE_EQUITY_EOD') {
    const dPrevBal = new Decimal(params.previousDayEodBalance ?? dInitial);
    const dPrevEq = new Decimal(params.previousDayEodEquity ?? dInitial);
    dDailyRef = Decimal.max(dPrevBal, dPrevEq);
  } else if (config.dailyLossReference === 'STARTING_EQUITY') {
    dDailyRef = new Decimal(params.previousDayEodEquity ?? dInitial);
  } else {
    dDailyRef = new Decimal(params.previousDayEodBalance ?? dInitial);
  }

  const dDailyLossLimitAmount = dDailyRef
    .times(config.dailyLossLimitPercent)
    .dividedBy(100);
  const dDailyLossFloor = dDailyRef.minus(dDailyLossLimitAmount);
  const dTodayLossSoFar = Decimal.max(0, dDailyRef.minus(dEquity));
  const dDailyBufferRemaining = dEquity.minus(dDailyLossFloor);
  const dailyLossBreached = dDailyBufferRemaining.lte(0);

  const dailyBufferPercent = dDailyLossLimitAmount.isZero()
    ? 100
    : Number(
        dDailyBufferRemaining
          .dividedBy(dDailyLossLimitAmount)
          .times(100)
          .toFixed(2)
      );

  // 3. Maximum Overall Loss Calculations (The5ers static 10% floor)
  const dMaxLossAmount = dInitial
    .times(config.maxLossLimitPercent)
    .dividedBy(100);
  const dMaxLossFloor = config.maxLossFloor
    ? new Decimal(config.maxLossFloor)
    : dInitial.minus(dMaxLossAmount);

  const dMaxLossBufferRemaining = dEquity.minus(dMaxLossFloor);
  const maxLossBreached = dMaxLossBufferRemaining.lte(0);

  const maxLossBufferPercent = dMaxLossAmount.isZero()
    ? 100
    : Number(
        dMaxLossBufferRemaining
          .dividedBy(dMaxLossAmount)
          .times(100)
          .toFixed(2)
      );

  // 4. Threat Level Determination
  let threatLevel: PropThreatLevel = 'SAFE';
  if (dailyLossBreached || maxLossBreached) {
    threatLevel = 'BREACHED';
  } else if (dailyBufferPercent <= 25 || maxLossBufferPercent <= 25) {
    threatLevel = 'CRITICAL';
  } else if (dailyBufferPercent <= 50 || maxLossBufferPercent <= 50) {
    threatLevel = 'CAUTION';
  }

  // 5. Target Reached & Phase Advancement
  const isBreached = threatLevel === 'BREACHED';
  const targetReached =
    config.phase !== 'FUNDED' &&
    dEquity.gte(dTargetEquity) &&
    !isBreached;
  const canAdvancePhase = targetReached;

  // 6. Descriptive Status Reason
  let statusReason = 'Account risk parameters are healthy.';
  if (threatLevel === 'BREACHED') {
    statusReason = dailyLossBreached
      ? `BREACHED: Daily loss limit breached (${config.dailyLossLimitPercent}%). Current equity is below the daily floor.`
      : `BREACHED: Maximum loss limit breached. Account equity fell below the static floor ($${dMaxLossFloor.toNumber().toLocaleString()}).`;
  } else if (threatLevel === 'CRITICAL') {
    statusReason = dailyBufferPercent <= 25
      ? `CRITICAL RISK: Daily buffer is down to only $${dDailyBufferRemaining.toFixed(2)} (${dailyBufferPercent.toFixed(1)}%). Consider pausing trading.`
      : `CRITICAL RISK: Maximum loss floor buffer is down to $${dMaxLossBufferRemaining.toFixed(2)}.`;
  } else if (targetReached) {
    statusReason = `TARGET REACHED: +$${dProfitMade.toFixed(2)} profit achieved. Ready to advance to ${
      config.phase === 'PHASE_1' ? 'Phase 2' : 'Funded Master'
    }!`;
  } else if (dProfitMade.gt(0)) {
    statusReason = `On track: +$${dProfitMade.toFixed(2)} (${targetProgressPercent.toFixed(1)}% of ${config.phase} target).`;
  }

  return {
    accountId: params.accountId || '',
    firm: config.firm,
    planName: config.planName,
    phase: config.phase,
    initialBalance: dInitial.toNumber(),
    currentBalance: dBalance.toNumber(),
    unrealizedPnL: dUnrealized.toNumber(),
    currentEquity: dEquity.toNumber(),
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
    todayLossSoFar: dTodayLossSoFar.toNumber(),
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
  };
}

