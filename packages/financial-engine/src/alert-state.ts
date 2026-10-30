/**
 * SetupMint — Pure Alert State Machine & Decision Engine
 *
 * Implements hysteresis thresholds, severity escalation, re-entry debouncing,
 * persistent re-ping schedules, snooze suppression, and institutional context calculations.
 *
 * Pure mathematical functions only. Zero side-effects, zero I/O, zero external framework imports.
 */

import Decimal from 'decimal.js';
import { Direction } from '@tradevault/shared';
import { calculateIndianCharges } from './charges.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type AlertType =
  | 'STOP_THREAT'
  | 'GIVEBACK'
  | 'LADDER'
  | 'DAILY_LOSS'
  | 'NAKED_POSITION'
  | 'TOKEN_EXPIRY'
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'EOD_SUMMARY';

export type AlertLifecycle = 'ACTIVE' | 'SNOOZED' | 'CLEARED' | 'RESOLVED';

export type AlertSeverityLevel = 0 | 1 | 2 | 3; // 0=INFO, 1=WARNING, 2=CRITICAL, 3=BREACHED

export interface AlertStateSnapshot {
  state: AlertLifecycle;
  severity: number;
  enterCount: number;
  firstAt: Date;
  lastSentAt: Date;
  lastEditAt?: Date;
  clearedAt?: Date;
  snoozedUntil?: Date;
  snoozedSeverity?: number;
  pingCount: number;
  cardVersion?: number;
  lastMetricValue?: string; // Decimal serialized
}

export interface AlertPolicy {
  type: AlertType;
  enterThreshold: Decimal;
  clearThreshold: Decimal;
  minRearmMs: number; // default: 180,000 ms (3 mins)
  minEditIntervalMs: number; // default: 10,000 ms (10 secs)
  maxRepings: number; // default: 3
  repingIntervalsMs: number[]; // e.g. [120000, 300000, 300000] (2m, 5m, 5m)
  snoozeDefaultMs: number; // default: 600,000 ms (10 mins)
  isAudibleDefault: boolean;
  audible?: boolean;
}

export type AlertDecision =
  | {
      action: 'SEND_NEW';
      reason: 'FIRST' | 'ESCALATION' | 'REENTRY' | 'REPING';
      enterCount: number;
      isRepeat: boolean;
      audible: boolean;
      severity: number;
    }
  | {
      action: 'EDIT_SILENT';
      audible: false;
      severity: number;
    }
  | {
      action: 'CLEAR';
      audible: false;
    }
  | {
      action: 'RESOLVE';
      audible: false;
    }
  | {
      action: 'SKIP';
      reason: string;
    };

export const DEFAULT_ALERT_POLICIES: Record<AlertType, AlertPolicy> = {
  STOP_THREAT: {
    type: 'STOP_THREAT',
    enterThreshold: new Decimal('0.25'), // bufferRatio <= 25% (CRITICAL)
    clearThreshold: new Decimal('0.40'), // bufferRatio > 40% (CLEARED)
    minRearmMs: 180000, // 3 minutes re-arm gap
    minEditIntervalMs: 10000, // 10 seconds min between edits
    maxRepings: 3,
    repingIntervalsMs: [120000, 300000, 300000], // 2m, 5m, 5m
    snoozeDefaultMs: 600000, // 10 mins
    isAudibleDefault: true,
  },
  GIVEBACK: {
    type: 'GIVEBACK',
    enterThreshold: new Decimal('35'), // givebackPercent >= 35% (LEAKING)
    clearThreshold: new Decimal('25'), // givebackPercent < 25% (CLEARED)
    minRearmMs: 180000,
    minEditIntervalMs: 10000,
    maxRepings: 2,
    repingIntervalsMs: [180000, 300000],
    snoozeDefaultMs: 600000,
    isAudibleDefault: true,
  },
  LADDER: {
    type: 'LADDER',
    enterThreshold: new Decimal('1'),
    clearThreshold: new Decimal('0'),
    minRearmMs: 60000,
    minEditIntervalMs: 10000,
    maxRepings: 0,
    repingIntervalsMs: [],
    snoozeDefaultMs: 600000,
    isAudibleDefault: false,
  },
  DAILY_LOSS: {
    type: 'DAILY_LOSS',
    enterThreshold: new Decimal('75'), // 75% warning or 100% breach
    clearThreshold: new Decimal('65'),
    minRearmMs: 300000,
    minEditIntervalMs: 10000,
    maxRepings: 3,
    repingIntervalsMs: [300000, 600000, 600000],
    snoozeDefaultMs: 1800000, // 30 mins
    isAudibleDefault: true,
  },
  NAKED_POSITION: {
    type: 'NAKED_POSITION',
    enterThreshold: new Decimal('1'),
    clearThreshold: new Decimal('0'),
    minRearmMs: 300000,
    minEditIntervalMs: 10000,
    maxRepings: 3,
    repingIntervalsMs: [180000, 300000, 300000],
    snoozeDefaultMs: 600000,
    isAudibleDefault: true,
  },
  TOKEN_EXPIRY: {
    type: 'TOKEN_EXPIRY',
    enterThreshold: new Decimal('30'), // <= 30 mins
    clearThreshold: new Decimal('0'),
    minRearmMs: 3600000,
    minEditIntervalMs: 10000,
    maxRepings: 1,
    repingIntervalsMs: [1800000],
    snoozeDefaultMs: 1800000,
    isAudibleDefault: false,
  },
  TRADE_OPENED: {
    type: 'TRADE_OPENED',
    enterThreshold: new Decimal('1'),
    clearThreshold: new Decimal('0'),
    minRearmMs: 0,
    minEditIntervalMs: 10000,
    maxRepings: 0,
    repingIntervalsMs: [],
    snoozeDefaultMs: 0,
    isAudibleDefault: false,
  },
  TRADE_CLOSED: {
    type: 'TRADE_CLOSED',
    enterThreshold: new Decimal('1'),
    clearThreshold: new Decimal('0'),
    minRearmMs: 0,
    minEditIntervalMs: 10000,
    maxRepings: 0,
    repingIntervalsMs: [],
    snoozeDefaultMs: 0,
    isAudibleDefault: false,
  },
  EOD_SUMMARY: {
    type: 'EOD_SUMMARY',
    enterThreshold: new Decimal('1'),
    clearThreshold: new Decimal('0'),
    minRearmMs: 0,
    minEditIntervalMs: 10000,
    maxRepings: 0,
    repingIntervalsMs: [],
    snoozeDefaultMs: 0,
    isAudibleDefault: false,
  },
};

/**
 * Determines whether the alert condition is currently in breach territory.
 */
export function isConditionBreached(
  type: AlertType,
  metricValue: Decimal,
  enterThreshold: Decimal
): boolean {
  if (type === 'STOP_THREAT') {
    // For stop threat: smaller bufferRatio <= enterThreshold (e.g. 0.25) means breached
    return metricValue.lessThanOrEqualTo(enterThreshold);
  }
  // For giveback, daily loss, naked position, etc.: metricValue >= enterThreshold
  return metricValue.greaterThanOrEqualTo(enterThreshold);
}

/**
 * Determines whether the alert condition has safely cleared past the hysteresis buffer.
 */
export function isConditionCleared(
  type: AlertType,
  metricValue: Decimal,
  clearThreshold: Decimal
): boolean {
  if (type === 'STOP_THREAT') {
    // For stop threat: bufferRatio > clearThreshold (e.g. 0.40) means recovered
    return metricValue.greaterThan(clearThreshold);
  }
  // For giveback, daily loss: metricValue < clearThreshold
  return metricValue.lessThan(clearThreshold);
}

/**
 * Evaluates an incoming metric against prior alert state and returns an authoritative decision.
 */
export function evaluateAlert(
  prev: AlertStateSnapshot | null,
  input: {
    type: AlertType;
    severity: number;
    metricValue: Decimal;
    now: Date;
    isClosed?: boolean;
    forcedAudible?: boolean;
  },
  customPolicy?: Partial<AlertPolicy>
): AlertDecision {
  const policy: AlertPolicy = {
    ...DEFAULT_ALERT_POLICIES[input.type],
    ...(customPolicy || {}),
  };

  const nowMs = input.now.getTime();

  // 1. If trade is closed, transition to RESOLVED
  if (input.isClosed) {
    if (prev && prev.state === 'RESOLVED') {
      return { action: 'SKIP', reason: 'ALREADY_RESOLVED' };
    }
    return { action: 'RESOLVE', audible: false };
  }

  const breached = isConditionBreached(input.type, input.metricValue, policy.enterThreshold);
  const cleared = isConditionCleared(input.type, input.metricValue, policy.clearThreshold);

  // 2. First-time encounter
  if (!prev) {
    if (!breached) {
      return { action: 'SKIP', reason: 'CONDITION_NOT_MET' };
    }
    const audible = input.forcedAudible !== undefined ? input.forcedAudible : input.severity >= 2;
    return {
      action: 'SEND_NEW',
      reason: 'FIRST',
      enterCount: 1,
      isRepeat: false,
      audible,
      severity: input.severity,
    };
  }

  // 3. Condition has recovered past the hysteresis clear threshold
  if (cleared && prev.state !== 'CLEARED' && prev.state !== 'RESOLVED') {
    return { action: 'CLEAR', audible: false };
  }

  // 4. Currently in CLEARED state: test for re-entry
  if (prev.state === 'CLEARED') {
    if (!breached) {
      return { action: 'SKIP', reason: 'STILL_CLEARED' };
    }
    const clearedAtMs = prev.clearedAt ? prev.clearedAt.getTime() : prev.lastSentAt.getTime();
    const elapsedSinceClear = nowMs - clearedAtMs;

    if (elapsedSinceClear < policy.minRearmMs) {
      return { action: 'SKIP', reason: `REARM_COOLDOWN (${Math.ceil((policy.minRearmMs - elapsedSinceClear) / 1000)}s left)` };
    }

    const audible = input.forcedAudible !== undefined ? input.forcedAudible : input.severity >= 2;
    return {
      action: 'SEND_NEW',
      reason: 'REENTRY',
      enterCount: prev.enterCount + 1,
      isRepeat: true,
      audible,
      severity: input.severity,
    };
  }

  // 5. Currently in SNOOZED state: suppress unless severity escalates
  if (prev.state === 'SNOOZED') {
    const isSnoozeActive = prev.snoozedUntil && nowMs < prev.snoozedUntil.getTime();
    if (isSnoozeActive) {
      const snoozedSev = prev.snoozedSeverity ?? prev.severity;
      if (input.severity > snoozedSev) {
        // Escalation breaks snooze!
        return {
          action: 'SEND_NEW',
          reason: 'ESCALATION',
          enterCount: prev.enterCount,
          isRepeat: true,
          audible: true,
          severity: input.severity,
        };
      }
      return { action: 'SKIP', reason: 'SNOOZED' };
    }
    // Snooze expired, fall through to active checks
  }

  // 6. Currently ACTIVE:
  if (prev.state === 'ACTIVE' || (prev.state === 'SNOOZED' && prev.snoozedUntil && nowMs >= prev.snoozedUntil.getTime())) {
    // 6a. Severity Escalation (e.g. WARNING -> CRITICAL, CRITICAL -> BREACHED)
    if (input.severity > prev.severity) {
      return {
        action: 'SEND_NEW',
        reason: 'ESCALATION',
        enterCount: prev.enterCount,
        isRepeat: true,
        audible: true,
        severity: input.severity,
      };
    }

    // 6b. Flapping inside hysteresis band (no severity increase, and not cleared)
    if (!breached && !cleared) {
      // Movement in the buffer zone. Check edit throttle.
      const lastEditMs = prev.lastEditAt ? prev.lastEditAt.getTime() : prev.lastSentAt.getTime();
      if (nowMs - lastEditMs >= policy.minEditIntervalMs) {
        return { action: 'EDIT_SILENT', audible: false, severity: input.severity };
      }
      return { action: 'SKIP', reason: 'EDIT_THROTTLED' };
    }

    // 6c. Condition remains breached (CRITICAL or BREACHED) -> Persistence Re-Ping
    if (breached && input.severity >= 2) {
      const repings = prev.pingCount || 0;
      if (repings < policy.maxRepings) {
        const nextIntervalMs =
          policy.repingIntervalsMs[repings] ??
          policy.repingIntervalsMs[policy.repingIntervalsMs.length - 1] ??
          300000;
        const lastSentMs = prev.lastSentAt.getTime();
        if (nowMs - lastSentMs >= nextIntervalMs) {
          return {
            action: 'SEND_NEW',
            reason: 'REPING',
            enterCount: prev.enterCount,
            isRepeat: true,
            audible: true,
            severity: input.severity,
          };
        }
      }
    }

    // 6d. Silent in-place edit update (if minimum edit interval satisfied)
    const lastEditMs = prev.lastEditAt ? prev.lastEditAt.getTime() : prev.lastSentAt.getTime();
    if (nowMs - lastEditMs >= policy.minEditIntervalMs) {
      return { action: 'EDIT_SILENT', audible: false, severity: input.severity };
    }

    return { action: 'SKIP', reason: 'NO_SIGNIFICANT_CHANGE' };
  }

  return { action: 'SKIP', reason: 'UNHANDLED_STATE' };
}

export interface IAlertContextInput {
  direction: Direction;
  quantity: number;
  entryPrice: number;
  currentLtp: number;
  stopLoss: number | null;
  target?: number | null;
  initialStopLoss?: number | null;
  plannedTarget?: number | null;
  contractMultiplier?: number;
  lotSize?: number;
  entryTime?: Date | string;
  unrealizedR?: number | null;
  peakR?: number | null;
  peakUnrealizedR?: number | null;
  peakMinutesAgo?: number;
  peakMfeMinutesAgo?: number;
  minutesInTrade?: number;
  priceDeltaPoints60s?: number;
  priceVelocityPerMin?: number;
  enterCount?: number;
  type?: AlertType | string;
  severity?: number;
  symbol?: string;
  dayLossUsed?: number;
  dayLossLimit?: number;
  currentDailyLoss?: number;
  maxDailyLoss?: number;
  portfolioOpenRisk?: number;
  totalOpenRiskAcrossTrades?: number;
  assetClass?: string;
  exchange?: string;
  givebackPercent?: number;
  isStagnant?: boolean;
}

export type IAlertContextParams = IAlertContextInput;

export interface IAlertContextOutput {
  ltpStr: string;
  stopStr: string;
  ptsToStopStr: string;
  ticksToStopStr: string;
  currentRStr: string;
  peakRStr: string;
  floatingNetPnLStr: string;
  ifSlLossAmount: Decimal;
  ifSlLossStr: string;
  exitNowSavesAmount: Decimal;
  exitNowSavesStr: string;
  velocity60sStr: string;
  timeInTradeStr: string;
  dayLossUsageStr: string;
  totalOpenRiskStr: string;
  retestNotice: string;
  deterministicHint: string;
  cardText: string;
}

/**
 * Computes deterministic institutional alert metrics including exact "If SL" loss,
 * "Exit now saves", price velocity, and rule-based trading recommendations.
 */
export function buildAlertContext(params: IAlertContextInput): IAlertContextOutput {
  const dEntry = new Decimal(params.entryPrice);
  const dLtp = new Decimal(params.currentLtp);
  const mult = new Decimal(params.contractMultiplier || 1);
  const qty = new Decimal(params.quantity);
  const isLong = params.direction === 'LONG';

  // 1. Current Floating Gross & Net Calculations
  const priceDelta = isLong ? dLtp.minus(dEntry) : dEntry.minus(dLtp);
  const floatingGross = priceDelta.times(qty).times(mult);

  const chargesNow = calculateIndianCharges({
    assetClass: (params.assetClass as any) || 'EQUITY',
    entryPrice: dEntry,
    exitPrice: dLtp,
    quantity: qty.times(mult),
  });
  const floatingNet = floatingGross.minus(chargesNow.totalCostsDecimal);

  // 2. "If SL" Loss Calculation (net of full statutory charges upon stop exit)
  let ifSlLoss = new Decimal(0);
  let exitNowSaves = new Decimal(0);
  let stopStr = 'NO STOP';
  let ptsToStopStr = '—';
  let ticksToStopStr = '—';

  if (params.stopLoss !== null && params.stopLoss !== undefined && params.stopLoss > 0) {
    const dStop = new Decimal(params.stopLoss);
    stopStr = `₹${dStop.toFixed(2)}`;

    const slPriceDelta = isLong ? dStop.minus(dEntry) : dEntry.minus(dStop);
    const slGross = slPriceDelta.times(qty).times(mult);

    const chargesSl = calculateIndianCharges({
      assetClass: (params.assetClass as any) || 'EQUITY',
      entryPrice: dEntry,
      exitPrice: dStop,
      quantity: qty.times(mult),
    });
    // Net loss at stop (typically negative)
    ifSlLoss = slGross.minus(chargesSl.totalCostsDecimal);

    // Distance remaining to stop
    const distPts = isLong ? dLtp.minus(dStop) : dStop.minus(dLtp);
    ptsToStopStr = `${distPts.toFixed(1)} pts`;
    const tick = new Decimal('0.05');
    const ticks = distPts.dividedBy(tick).round().toNumber();
    ticksToStopStr = `${ticks} ticks`;

    // Exit now saves = (Loss at SL) - (Loss now)
    // Both are negative or relative. E.g. If SL = -3610 and Current = -2340: saves = 1270
    exitNowSaves = floatingNet.minus(ifSlLoss);
    if (exitNowSaves.isNegative()) exitNowSaves = new Decimal(0);
  }

  // 3. 60-Second Velocity
  let velocity60sStr = '—';
  if (params.priceDeltaPoints60s !== undefined) {
    const dV = new Decimal(params.priceDeltaPoints60s);
    const sign = dV.isPositive() ? '+' : '';
    velocity60sStr = `${sign}${dV.toFixed(2)} / 60s`;
  }

  // 4. Retest Notice
  const enterCount = params.enterCount || 1;
  const retestNotice = enterCount > 1 ? `↩️ ${enterCount}${getOrdinalSuffix(enterCount)} test` : '';

  // 5. Day Loss Usage
  let dayLossUsageStr = '—';
  const maxDayLoss = params.maxDailyLoss ?? params.dayLossLimit;
  const curDayLoss = params.currentDailyLoss ?? params.dayLossUsed;
  if (maxDayLoss && maxDayLoss > 0) {
    const currentLoss = Math.abs(curDayLoss || 0);
    const pct = Math.min(100, Math.round((currentLoss / maxDayLoss) * 100));
    dayLossUsageStr = `₹${currentLoss.toLocaleString('en-IN')} / ₹${maxDayLoss.toLocaleString('en-IN')} (${pct}%)`;
  }

  // 6. Total Open Risk
  const totalOpenRisk = params.totalOpenRiskAcrossTrades ?? params.portfolioOpenRisk;
  const totalOpenRiskStr = totalOpenRisk !== undefined
    ? `₹${Math.round(totalOpenRisk).toLocaleString('en-IN')}`
    : '—';

  // 7. Deterministic Trading Engine Hint
  let deterministicHint = 'Maintain stop loss discipline. Do not widen risk.';
  if (params.givebackPercent && params.givebackPercent >= 50) {
    deterministicHint = 'Critical Giveback: >50% peak profit surrendered. Book 50% or trail stop immediately.';
  } else if (params.givebackPercent && params.givebackPercent >= 35) {
    deterministicHint = 'Profit leaking: consider locking True Breakeven to guarantee net positive outcome.';
  } else if (params.isStagnant) {
    deterministicHint = 'Momentum stalled: trade holding duration exceeds average with zero expansion.';
  } else if (exitNowSaves.greaterThan(500)) {
    deterministicHint = `Exiting at market saves ~₹${exitNowSaves.toFixed(0)} vs full stop out.`;
  }

  const pR = params.peakR ?? params.peakUnrealizedR;
  const uR = params.unrealizedR;
  const peakRStr = pR !== undefined && pR !== null ? `+${pR.toFixed(2)}R` : '—';
  const currentRStr = uR !== undefined && uR !== null ? `${uR >= 0 ? '+' : ''}${uR.toFixed(2)}R` : '—';
  const floatingNetPnLStr = `${floatingNet.isPositive() ? '+' : ''}₹${floatingNet.toFixed(2)}`;
  const ifSlLossStr = ifSlLoss.isZero() && stopStr === '—' ? '—' : `-₹${ifSlLoss.abs().toFixed(2)}`;
  const exitNowSavesStr = `₹${exitNowSaves.toFixed(2)}`;
  const timeInTradeStr = params.minutesInTrade !== undefined
    ? `${params.minutesInTrade}m`
    : params.entryTime
    ? `${Math.max(1, Math.round((Date.now() - new Date(params.entryTime).getTime()) / 60000))}m`
    : '—';

  const sev = params.severity ?? 2;
  const sevIcon = sev === 3 ? '🔴' : sev === 2 ? '🔴' : sev === 1 ? '🟡' : 'ℹ️';
  const sevLabel = sev === 3 ? 'BREACHED' : sev === 2 ? 'CRITICAL' : sev === 1 ? 'ATTENTION' : 'INFO';
  const sym = params.symbol || 'TRADE';
  const title = `${sevIcon} ${sevLabel} · ${sym} · ${params.direction}`;
  const situation = params.type === 'GIVEBACK'
    ? 'Profit giveback exceeds threshold'
    : params.type === 'NAKED_POSITION'
    ? 'Active position without resting stop loss'
    : 'Price approaching stop loss boundary';

  const cardLines = [
    `<b>${title}</b>${retestNotice ? `   ${retestNotice}` : ''}`,
    `<i>${situation}</i>\n`,
    '<pre>',
    `LTP      ${`₹${dLtp.toFixed(2)}`.padEnd(10)} (${velocity60sStr})`,
    ...(stopStr !== '—' ? [`SL       ${stopStr.padEnd(10)} ${ptsToStopStr} · ${ticksToStopStr}`] : []),
    `R now    ${currentRStr.padEnd(10)} (peak ${peakRStr})`,
    `Float    ${floatingNetPnLStr.padEnd(10)} net of est. fees`,
    ...(ifSlLossStr !== '—' ? [`If SL    ${ifSlLossStr.padEnd(10)} incl. charges`] : []),
    `Time     ${timeInTradeStr} in trade`,
    ...(dayLossUsageStr !== '—' ? [`Day      ${dayLossUsageStr}`] : []),
    ...(totalOpenRiskStr !== '—' ? [`Open risk (all trades) ${totalOpenRiskStr}`] : []),
    '</pre>\n',
    `💡 <i>${deterministicHint}</i>`,
  ];

  return {
    ltpStr: `₹${dLtp.toFixed(2)}`,
    stopStr,
    ptsToStopStr,
    ticksToStopStr,
    currentRStr,
    peakRStr,
    floatingNetPnLStr,
    ifSlLossAmount: ifSlLoss,
    ifSlLossStr,
    exitNowSavesAmount: exitNowSaves,
    exitNowSavesStr,
    velocity60sStr,
    timeInTradeStr,
    dayLossUsageStr,
    totalOpenRiskStr,
    retestNotice,
    deterministicHint,
    cardText: cardLines.join('\n'),
  };
}

export function formatAlertCard(title: string, situation: string, context: IAlertContextOutput): string {
  return context.cardText;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
