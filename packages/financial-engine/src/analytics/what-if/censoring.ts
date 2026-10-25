import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface ICensoringParams {
  direction: 'LONG' | 'SHORT';
  entryPrice: Decimal;
  actualExitPrice: Decimal;
  initialStopLoss: Decimal;
  plannedTarget: Decimal | null;
  unitRisk: Decimal;
  stopR: number | null;
  targetR: number | null;
  hitBeforeExit: boolean;
  slippageTicks: number;
  tickSize: Decimal | number;
}

/**
 * Evaluates whether a trade is right-censored for a specific stopR/targetR cell.
 * Implements Section 1.10.
 *
 * If a simulated level IS hit through x, the trade is evaluable regardless.
 * If NO simulated level was hit, we check if the actual exit was level-driven:
 * 1. Stopped out: actual exit was at or beyond the original stop while cell's stopR > 1 (looser stop).
 * 2. Target hit: actual exit was at or beyond plannedTarget while cell's targetR is farther than planned target distance.
 */
export function isCensored(params: ICensoringParams): { censored: boolean; reason?: string } {
  // If simulated level was hit before or at x, the event occurred within the observed window
  if (params.hitBeforeExit) {
    return { censored: false };
  }

  const {
    direction,
    entryPrice,
    actualExitPrice,
    initialStopLoss,
    plannedTarget,
    unitRisk,
    stopR,
    targetR,
    slippageTicks,
    tickSize,
  } = params;

  const dTick = new Decimal(tickSize || 0.05);
  const tolerance = Decimal.max(dTick, dTick.times(slippageTicks));

  // 1. Check if actual exit was at or beyond original stop
  // For LONG: exit <= initialStop + tolerance
  // For SHORT: exit >= initialStop - tolerance
  let actualExitedAtOrBeyondOriginalStop = false;
  if (direction === 'LONG') {
    if (actualExitPrice.lessThanOrEqualTo(initialStopLoss.plus(tolerance))) {
      actualExitedAtOrBeyondOriginalStop = true;
    }
  } else {
    // SHORT
    if (actualExitPrice.greaterThanOrEqualTo(initialStopLoss.minus(tolerance))) {
      actualExitedAtOrBeyondOriginalStop = true;
    }
  }

  // If trade exited at original stop and tested cell has a looser stop (stopR > 1 or stopR is null/none)
  // Note: if stopR is null (no stop) or stopR > 1, the looser stop would not have exited where the real trade exited.
  // The true outcome would have depended on post-exit prices!
  if (actualExitedAtOrBeyondOriginalStop && (stopR === null || stopR > 1.0)) {
    return {
      censored: true,
      reason: `Actual trade exited at original stop, but cell tests a looser stop (${stopR === null ? 'none' : stopR + 'R'})`,
    };
  }

  // 2. Check if actual exit was at or beyond planned target (if plannedTarget exists)
  if (plannedTarget) {
    let actualExitedAtOrBeyondPlannedTarget = false;
    const plannedTargetDistance = plannedTarget.minus(entryPrice).abs();
    const plannedTargetR = unitRisk.isZero() ? 0 : plannedTargetDistance.dividedBy(unitRisk).toNumber();

    if (direction === 'LONG') {
      if (actualExitPrice.greaterThanOrEqualTo(plannedTarget.minus(tolerance))) {
        actualExitedAtOrBeyondPlannedTarget = true;
      }
    } else {
      // SHORT
      if (actualExitPrice.lessThanOrEqualTo(plannedTarget.plus(tolerance))) {
        actualExitedAtOrBeyondPlannedTarget = true;
      }
    }

    // If trade reached planned target, but cell tests a farther target (targetR > plannedTargetR or targetR is null/none)
    if (actualExitedAtOrBeyondPlannedTarget && (targetR === null || targetR > plannedTargetR)) {
      return {
        censored: true,
        reason: `Actual trade exited at planned target, but cell tests a farther target (${targetR === null ? 'none' : targetR + 'R'})`,
      };
    }
  }

  return { censored: false };
}
