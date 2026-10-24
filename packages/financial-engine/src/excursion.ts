import Decimal from 'decimal.js';
import moment from 'moment';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type ExcursionFlag =
  | 'GAVE_BACK_PROFIT'
  | 'EXITED_EARLY'
  | 'STOP_TOO_TIGHT_EVIDENCE'
  | 'STOP_TOO_LOOSE_EVIDENCE';

export interface IExcursionCandle {
  t: number; // Unix timestamp in seconds or milliseconds
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface ICalculateExcursionParams {
  direction: 'LONG' | 'SHORT';
  entryPrice: number | string | Decimal;
  exitPrice?: number | string | Decimal | null;
  stopLoss?: number | string | Decimal | null;
  target?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  candles: IExcursionCandle[];
  entryTime: Date | string | number;
  exitTime?: Date | string | number | null;
  plannedRiskAmount?: number | string | Decimal | null;
  resolution?: string;
}

export interface IExcursionCalculationResult {
  status: 'COMPUTED' | 'UNAVAILABLE' | 'FAILED';
  failureReason?: string;
  maePoints: number;
  mfePoints: number;
  maeAmount: number;
  mfeAmount: number;
  maeR?: number;
  mfeR?: number;
  exitEfficiency: number;
  stopEfficiency?: number;
  stopHit: boolean;
  reversedAfterStopHit: boolean;
  timeToMfeMinutes: number;
  timeToMaeMinutes: number;
  candleCount: number;
  resolution: string;
  excursionFlags: ExcursionFlag[];
}

/**
 * Normalizes input date/timestamp into Unix epoch milliseconds using moment.
 */
function toEpochMs(input: Date | string | number): number {
  if (typeof input === 'number') {
    // If timestamp is in seconds, convert to milliseconds
    return input < 10_000_000_000 ? input * 1000 : input;
  }
  const m = moment(input);
  return m.isValid() ? m.valueOf() : 0;
}

/**
 * Calculates Maximum Adverse Excursion (MAE), Maximum Favorable Excursion (MFE),
 * exit efficiency, and stop dynamics using exact Decimal.js financial arithmetic.
 *
 * Partial Candle Convention:
 * Candles are evaluated over the interval [entryTime, exitTime].
 * Since tick-level intra-candle sequence is absent in standard OHLC bars:
 * - For the initial entry bar, price excursion is bounded by entryPrice.
 * - For intermediate bars, full high/low extremes are evaluated.
 * - For the exit bar, excursion is evaluated and bounded by exitPrice.
 * - Overall extremes across the trade lifecycle include entryPrice and exitPrice.
 */
export function calculateExcursion(params: ICalculateExcursionParams): IExcursionCalculationResult {
  const { direction, resolution = '1' } = params;

  // 1. Guard against open or missing exit data
  if (params.exitPrice === undefined || params.exitPrice === null || !params.exitTime) {
    return {
      status: 'UNAVAILABLE',
      failureReason: 'Trade is still open or missing exit details',
      maePoints: 0,
      mfePoints: 0,
      maeAmount: 0,
      mfeAmount: 0,
      exitEfficiency: 0,
      stopHit: false,
      reversedAfterStopHit: false,
      timeToMfeMinutes: 0,
      timeToMaeMinutes: 0,
      candleCount: 0,
      resolution,
      excursionFlags: [],
    };
  }

  const entryMs = toEpochMs(params.entryTime);
  const exitMs = toEpochMs(params.exitTime);

  if (exitMs < entryMs) {
    return {
      status: 'FAILED',
      failureReason: 'Exit timestamp precedes entry timestamp',
      maePoints: 0,
      mfePoints: 0,
      maeAmount: 0,
      mfeAmount: 0,
      exitEfficiency: 0,
      stopHit: false,
      reversedAfterStopHit: false,
      timeToMfeMinutes: 0,
      timeToMaeMinutes: 0,
      candleCount: 0,
      resolution,
      excursionFlags: [],
    };
  }

  if (!params.candles || !Array.isArray(params.candles) || params.candles.length === 0) {
    return {
      status: 'UNAVAILABLE',
      failureReason: 'No candle data available for time window',
      maePoints: 0,
      mfePoints: 0,
      maeAmount: 0,
      mfeAmount: 0,
      exitEfficiency: 0,
      stopHit: false,
      reversedAfterStopHit: false,
      timeToMfeMinutes: 0,
      timeToMaeMinutes: 0,
      candleCount: 0,
      resolution,
      excursionFlags: [],
    };
  }

  // 2. Resolve resolution duration in milliseconds
  let barDurationMs = 60_000; // default 1m
  const resNum = parseInt(resolution, 10);
  if (!isNaN(resNum) && resNum > 0) {
    barDurationMs = resNum * 60_000;
  } else if (resolution.toUpperCase() === 'D' || resolution.toUpperCase() === '1D') {
    barDurationMs = 86_400_000;
  }

  // Filter candles overlapping [entryMs, exitMs]
  // A bar at start t spans [t, t + barDurationMs].
  const overlappingCandles = params.candles
    .map((c) => ({
      tMs: toEpochMs(c.t),
      o: new Decimal(c.o),
      h: new Decimal(c.h),
      l: new Decimal(c.l),
      c: new Decimal(c.c),
      v: c.v,
    }))
    .filter((c) => {
      const candleEndMs = c.tMs + barDurationMs;
      return candleEndMs > entryMs && c.tMs <= exitMs;
    })
    .sort((a, b) => a.tMs - b.tMs);

  if (overlappingCandles.length === 0) {
    return {
      status: 'UNAVAILABLE',
      failureReason: 'No candles overlap trade execution window',
      maePoints: 0,
      mfePoints: 0,
      maeAmount: 0,
      mfeAmount: 0,
      exitEfficiency: 0,
      stopHit: false,
      reversedAfterStopHit: false,
      timeToMfeMinutes: 0,
      timeToMaeMinutes: 0,
      candleCount: 0,
      resolution,
      excursionFlags: [],
    };
  }

  const dEntry = new Decimal(params.entryPrice);
  const dExit = new Decimal(params.exitPrice);
  const dQty = new Decimal(params.quantity).abs();
  const dMultiplier = params.contractMultiplier ? new Decimal(params.contractMultiplier) : new Decimal(1);
  const dStop = params.stopLoss !== undefined && params.stopLoss !== null ? new Decimal(params.stopLoss) : null;
  const dPlannedRisk = params.plannedRiskAmount !== undefined && params.plannedRiskAmount !== null ? new Decimal(params.plannedRiskAmount) : null;

  // 3. Track extremes and time of occurrence
  let highestPrice = Decimal.max(dEntry, dExit);
  let lowestPrice = Decimal.min(dEntry, dExit);
  let highestTimeMs = entryMs;
  let lowestTimeMs = entryMs;

  let stopHit = false;
  let stopHitCandleIndex = -1;

  for (let i = 0; i < overlappingCandles.length; i++) {
    const bar = overlappingCandles[i];

    if (bar.h.greaterThan(highestPrice)) {
      highestPrice = bar.h;
      highestTimeMs = bar.tMs;
    }
    if (bar.l.lessThan(lowestPrice)) {
      lowestPrice = bar.l;
      lowestTimeMs = bar.tMs;
    }

    // Check stop hit condition
    if (dStop) {
      if (direction === 'LONG' && bar.l.lessThanOrEqualTo(dStop)) {
        if (!stopHit) {
          stopHit = true;
          stopHitCandleIndex = i;
        }
      } else if (direction === 'SHORT' && bar.h.greaterThanOrEqualTo(dStop)) {
        if (!stopHit) {
          stopHit = true;
          stopHitCandleIndex = i;
        }
      }
    }
  }

  // 4. Calculate MAE and MFE points
  let mfePoints: Decimal;
  let maePoints: Decimal;
  let mfeTimeMs: number;
  let maeTimeMs: number;

  if (direction === 'LONG') {
    mfePoints = Decimal.max(0, highestPrice.minus(dEntry));
    maePoints = Decimal.max(0, dEntry.minus(lowestPrice));
    mfeTimeMs = highestTimeMs;
    maeTimeMs = lowestTimeMs;
  } else {
    // SHORT
    mfePoints = Decimal.max(0, dEntry.minus(lowestPrice));
    maePoints = Decimal.max(0, highestPrice.minus(dEntry));
    mfeTimeMs = lowestTimeMs;
    maeTimeMs = highestTimeMs;
  }

  const maeAmount = maePoints.times(dQty).times(dMultiplier);
  const mfeAmount = mfePoints.times(dQty).times(dMultiplier);

  // 5. MAE / MFE in terms of R-multiple (relative to plannedRiskAmount)
  let maeR: number | undefined;
  let mfeR: number | undefined;

  if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
    maeR = Number(maeAmount.dividedBy(dPlannedRisk).toFixed(4));
    mfeR = Number(mfeAmount.dividedBy(dPlannedRisk).toFixed(4));
  }

  // 6. Exit Efficiency = realized gross move / MFE move (clamped to [0, 1])
  // Documented edge case: if MFE move is zero or realized gross move <= 0, efficiency is 0.
  let realizedMovePoints: Decimal;
  if (direction === 'LONG') {
    realizedMovePoints = dExit.minus(dEntry);
  } else {
    realizedMovePoints = dEntry.minus(dExit);
  }

  let exitEfficiency = new Decimal(0);
  if (mfePoints.greaterThan(0) && realizedMovePoints.greaterThan(0)) {
    const rawEff = realizedMovePoints.dividedBy(mfePoints);
    exitEfficiency = Decimal.min(new Decimal(1), Decimal.max(new Decimal(0), rawEff));
  }

  // 7. Stop efficiency and reversal after stop hit
  let stopEfficiency: number | undefined;
  let reversedAfterStopHit = false;

  if (dStop) {
    const stopDistance = dEntry.minus(dStop).abs();
    if (stopDistance.greaterThan(0)) {
      stopEfficiency = Number(maePoints.dividedBy(stopDistance).toFixed(4));
    }

    if (stopHit && stopHitCandleIndex >= 0) {
      // Check if price reached entry or better in subsequent candles after stop hit
      for (let j = stopHitCandleIndex + 1; j < overlappingCandles.length; j++) {
        const subsequentBar = overlappingCandles[j];
        if (direction === 'LONG' && subsequentBar.h.greaterThanOrEqualTo(dEntry)) {
          reversedAfterStopHit = true;
          break;
        } else if (direction === 'SHORT' && subsequentBar.l.lessThanOrEqualTo(dEntry)) {
          reversedAfterStopHit = true;
          break;
        }
      }
      if (!reversedAfterStopHit) {
        if (direction === 'LONG' && dExit.greaterThanOrEqualTo(dEntry)) {
          reversedAfterStopHit = true;
        } else if (direction === 'SHORT' && dExit.lessThanOrEqualTo(dEntry)) {
          reversedAfterStopHit = true;
        }
      }
    }
  }

  // 8. Time to MFE / MAE in minutes
  const timeToMfeMinutes = Math.max(0, Math.round(moment(mfeTimeMs).diff(moment(entryMs), 'minutes', true)));
  const timeToMaeMinutes = Math.max(0, Math.round(moment(maeTimeMs).diff(moment(entryMs), 'minutes', true)));

  // 9. Advisory Excursion Flags
  const excursionFlags: ExcursionFlag[] = [];

  // GAVE_BACK_PROFIT: Peak profit was substantial, but exited with < 50% efficiency or ended at a loss
  if (mfePoints.greaterThan(0)) {
    if (exitEfficiency.lessThan(0.50) && realizedMovePoints.greaterThan(0)) {
      excursionFlags.push('GAVE_BACK_PROFIT');
    } else if (realizedMovePoints.lessThanOrEqualTo(0) && (mfeR !== undefined ? mfeR >= 1.0 : mfePoints.greaterThan(dEntry.times(0.01)))) {
      excursionFlags.push('GAVE_BACK_PROFIT');
    }
  }

  // EXITED_EARLY: Left the majority of move on the table
  if (exitEfficiency.lessThan(0.35) && realizedMovePoints.greaterThan(0) && mfePoints.greaterThan(realizedMovePoints.times(2))) {
    if (!excursionFlags.includes('GAVE_BACK_PROFIT')) {
      excursionFlags.push('EXITED_EARLY');
    }
  }

  // STOP_TOO_TIGHT_EVIDENCE: Stop hit and then price reclaimed entry or reached target
  if (reversedAfterStopHit) {
    excursionFlags.push('STOP_TOO_TIGHT_EVIDENCE');
  }

  // STOP_TOO_LOOSE_EVIDENCE: MAE significantly exceeded planned stop distance
  if (dStop) {
    const stopDist = dEntry.minus(dStop).abs();
    if (stopDist.greaterThan(0) && maePoints.greaterThan(stopDist.times(1.25))) {
      excursionFlags.push('STOP_TOO_LOOSE_EVIDENCE');
    }
  } else if (maeR !== undefined && maeR > 1.5) {
    excursionFlags.push('STOP_TOO_LOOSE_EVIDENCE');
  }

  return {
    status: 'COMPUTED',
    maePoints: Number(maePoints.toFixed(2)),
    mfePoints: Number(mfePoints.toFixed(2)),
    maeAmount: Number(maeAmount.toFixed(2)),
    mfeAmount: Number(mfeAmount.toFixed(2)),
    maeR,
    mfeR,
    exitEfficiency: Number(exitEfficiency.toFixed(4)),
    stopEfficiency,
    stopHit,
    reversedAfterStopHit,
    timeToMfeMinutes,
    timeToMaeMinutes,
    candleCount: overlappingCandles.length,
    resolution,
    excursionFlags,
  };
}
