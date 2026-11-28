import Decimal from './decimal.js';
import moment from 'moment';
import type {
  ExcursionFlag,
  IExcursionSettings,
} from '@tradevault/shared';
import {
  DEFAULT_EXCURSION_SETTINGS,
} from '@tradevault/shared';

export type { ExcursionFlag };

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
  totalCharges?: number | string | Decimal | null;
  tickSize?: number | string | Decimal | null;
  settings?: IExcursionSettings;
  tradeManagementPlan?: 'RUNNER' | 'FIXED' | 'DISCRETIONARY' | string;
  hasTrailedStop?: boolean;
  realizedR?: number | null;
  postExitLookaheadMinutes?: number;
  adaptiveLookahead?: boolean;
  sessionCloseTime?: Date | string | number;
  clampToSessionClose?: boolean;
}

export interface IExcursionCalculationResult {
  status: 'COMPUTED' | 'UNAVAILABLE' | 'FAILED';
  failureReason?: string;
  excursionVersion: number;
  thresholdVersion: string;
  maePoints: number;
  mfePoints: number;
  maeAmount: number;
  mfeAmount: number;
  maeR?: number;
  mfeR?: number;
  feeAdjustedMaePoints?: number;
  feeAdjustedMfePoints?: number;
  feeAdjustedMaeAmount?: number;
  feeAdjustedMfeAmount?: number;
  feeAdjustedMaeR?: number;
  feeAdjustedMfeR?: number;
  rLeftOnTable?: number;
  exitEfficiency: number | null; // null (N/A) when MFE is 0
  stopEfficiency?: number;
  entryQualityScore?: number;
  earlyMfePoints?: number;
  earlyMaePoints?: number;
  maeBeforeMfe: boolean;
  timeOrdering: 'HEAT_FIRST' | 'RUN_FIRST' | 'SIMULTANEOUS';
  stopHit: boolean;
  reversedAfterStopHit: boolean;
  timeToMfeMinutes: number;
  timeToMaeMinutes: number;
  candleCount: number;
  resolution: string;
  isLowResolution: boolean;
  excursionFlags: ExcursionFlag[];
  warnings: string[];
  postExitMfePoints?: number;
  postExitMfeAmount?: number;
  postExitMfeR?: number;
  postExitPeakPrice?: number;
  postExitPeakTime?: Date | string;
  postExitLookaheadMinutes?: number;
  postExitCandleCount?: number;
  postExitRunBeyondExitPoints?: number;
  postExitRunBeyondExitR?: number;
  postExitMaePoints?: number;
  postExitMaeAmount?: number;
  postExitMaeR?: number;
  postExitTroughPrice?: number;
  postExitTroughTime?: Date | string;
  postExitAdverseBeyondExitPoints?: number;
  postExitAdverseBeyondExitR?: number;
  postExitTimeToPeakMinutes?: number;
  postExitVelocityRPerMin?: number;
  postStopMfePoints?: number;
  postStopMfeR?: number;
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
 * fee-adjusted excursions, exit efficiency, stop dynamics, early entry quality,
 * and time-aware heat ordering using exact Decimal.js financial arithmetic.
 */
export function calculateExcursion(params: ICalculateExcursionParams): IExcursionCalculationResult {
  const { direction, resolution = '1' } = params;
  const settings: Required<IExcursionSettings> = {
    ...DEFAULT_EXCURSION_SETTINGS,
    ...(params.settings || {}),
  } as Required<IExcursionSettings>;

  const excursionVersion = 2;
  const thresholdVersion = 'v2';
  const isLowResolution = resolution !== '1';

  // Base fallback result for open / invalid trades
  const makeEmptyResult = (
    status: 'COMPUTED' | 'UNAVAILABLE' | 'FAILED',
    failureReason?: string,
    warnings: string[] = []
  ): IExcursionCalculationResult => ({
    status,
    failureReason,
    excursionVersion,
    thresholdVersion,
    maePoints: 0,
    mfePoints: 0,
    maeAmount: 0,
    mfeAmount: 0,
    exitEfficiency: null,
    maeBeforeMfe: false,
    timeOrdering: 'SIMULTANEOUS',
    stopHit: false,
    reversedAfterStopHit: false,
    timeToMfeMinutes: 0,
    timeToMaeMinutes: 0,
    candleCount: 0,
    resolution,
    isLowResolution,
    excursionFlags: isLowResolution ? ['LOW_RESOLUTION'] : [],
    warnings: isLowResolution ? [...warnings, 'LOW_RESOLUTION'] : warnings,
  });

  // 1. Guard against open or missing exit data
  if (params.exitPrice === undefined || params.exitPrice === null || !params.exitTime) {
    return makeEmptyResult('UNAVAILABLE', 'Trade is still open or missing exit details');
  }

  const entryMs = toEpochMs(params.entryTime);
  const exitMs = toEpochMs(params.exitTime);

  if (exitMs < entryMs) {
    return makeEmptyResult('FAILED', 'Exit timestamp precedes entry timestamp');
  }

  if (!params.candles || !Array.isArray(params.candles) || params.candles.length === 0) {
    return makeEmptyResult('UNAVAILABLE', 'No candle data available for time window');
  }

  // 2. Resolve resolution duration in milliseconds
  let barDurationMs = 60_000; // default 1m
  const resNum = parseInt(resolution, 10);
  if (!isNaN(resNum) && resNum > 0) {
    barDurationMs = resNum * 60_000;
  } else if (resolution.toUpperCase() === 'D' || resolution.toUpperCase() === '1D') {
    barDurationMs = 86_400_000;
  }

  // Map all candidate candles
  const allParsedCandles = params.candles
    .map((c) => ({
      tMs: toEpochMs(c.t),
      o: new Decimal(c.o),
      h: new Decimal(c.h),
      l: new Decimal(c.l),
      c: new Decimal(c.c),
      v: c.v,
    }))
    .sort((a, b) => a.tMs - b.tMs);

  // Filter candles overlapping in-trade window [entryMs, exitMs]
  const overlappingCandles = allParsedCandles.filter((c) => {
    const candleEndMs = c.tMs + barDurationMs;
    return candleEndMs > entryMs && c.tMs <= exitMs;
  });

  const tradeDurationMinutes = Math.max(1, Math.round((exitMs - entryMs) / 60_000));
  const isAdaptive = params.adaptiveLookahead ?? settings.adaptiveLookahead ?? false;
  let postExitLookaheadMinutes = isAdaptive
    ? Math.min(180, Math.max(15, Math.round(tradeDurationMinutes * 1.5)))
    : (params.postExitLookaheadMinutes ?? settings.postExitLookaheadMinutes ?? 60);

  let postExitEndMs = exitMs + postExitLookaheadMinutes * 60_000;

  // Session boundary clamping: prevent post-exit lookahead from bleeding past session close or end of day
  if (params.sessionCloseTime) {
    const sessionCloseMs = toEpochMs(params.sessionCloseTime);
    if (sessionCloseMs > exitMs && postExitEndMs > sessionCloseMs) {
      postExitEndMs = sessionCloseMs;
      postExitLookaheadMinutes = Math.max(1, Math.round((sessionCloseMs - exitMs) / 60_000));
    }
  }

  // Post-exit candles: strictly after exitMs up to postExitEndMs
  const postExitCandles = allParsedCandles.filter((c) => c.tMs > exitMs && c.tMs <= postExitEndMs);

  if (overlappingCandles.length === 0) {
    return makeEmptyResult('UNAVAILABLE', 'No candles overlap trade execution window');
  }

  const warnings: string[] = [];
  const excursionFlags: ExcursionFlag[] = [];

  if (isLowResolution) {
    excursionFlags.push('LOW_RESOLUTION');
    warnings.push('LOW_RESOLUTION');
  }

  const dEntry = new Decimal(params.entryPrice);
  const dExit = new Decimal(params.exitPrice);
  const dQty = new Decimal(params.quantity).abs();
  const dMultiplier = params.contractMultiplier ? new Decimal(params.contractMultiplier) : new Decimal(1);
  const dStop = params.stopLoss !== undefined && params.stopLoss !== null ? new Decimal(params.stopLoss) : null;
  const dPlannedRisk =
    params.plannedRiskAmount !== undefined && params.plannedRiskAmount !== null
      ? new Decimal(params.plannedRiskAmount)
      : null;
  const dTick = params.tickSize
    ? new Decimal(params.tickSize)
    : dEntry.isZero()
    ? new Decimal(0.05)
    : dEntry.times(0.001); // 0.1% tolerance fallback

  // 3. Entry & Exit Candle Bounds Sanity Check
  const entryCandle = overlappingCandles[0];
  if (entryCandle) {
    const entryMinBound = entryCandle.l.minus(dTick);
    const entryMaxBound = entryCandle.h.plus(dTick);
    if (dEntry.lessThan(entryMinBound) || dEntry.greaterThan(entryMaxBound)) {
      warnings.push('ENTRY_OUTSIDE_CANDLE');
      excursionFlags.push('ENTRY_OUTSIDE_CANDLE');
    }
  }

  const exitCandle = overlappingCandles[overlappingCandles.length - 1];
  if (exitCandle) {
    const exitMinBound = exitCandle.l.minus(dTick);
    const exitMaxBound = exitCandle.h.plus(dTick);
    if (dExit.lessThan(exitMinBound) || dExit.greaterThan(exitMaxBound)) {
      warnings.push('EXIT_OUTSIDE_CANDLE');
      excursionFlags.push('EXIT_OUTSIDE_CANDLE');
    }
  }

  // 4. Track extremes and time of occurrence
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

  // 5. Calculate MAE and MFE points & timings
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

  // Time-aware Heat Ordering: did heat (MAE) precede favorable run (MFE)?
  let maeBeforeMfe = false;
  let timeOrdering: 'HEAT_FIRST' | 'RUN_FIRST' | 'SIMULTANEOUS' = 'SIMULTANEOUS';
  if (maeTimeMs < mfeTimeMs) {
    maeBeforeMfe = true;
    timeOrdering = 'HEAT_FIRST';
  } else if (mfeTimeMs < maeTimeMs) {
    maeBeforeMfe = false;
    timeOrdering = 'RUN_FIRST';
  }

  // 6. MAE / MFE in terms of R-multiple (relative to plannedRiskAmount)
  let maeR: number | undefined;
  let mfeR: number | undefined;

  if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
    maeR = Number(maeAmount.dividedBy(dPlannedRisk).toFixed(4));
    mfeR = Number(mfeAmount.dividedBy(dPlannedRisk).toFixed(4));
  } else if (dStop) {
    const stopDist = dEntry.minus(dStop).abs();
    if (stopDist.greaterThan(0)) {
      maeR = Number(maePoints.dividedBy(stopDist).toFixed(4));
      mfeR = Number(mfePoints.dividedBy(stopDist).toFixed(4));
    }
  }

  // 6b. Post-Exit Extended Excursion (Runners, Premature Exit & Adverse Drop Evaluation)
  let postExitMfePoints: number | undefined;
  let postExitMfeAmount: number | undefined;
  let postExitMfeR: number | undefined;
  let postExitPeakPrice: number | undefined;
  let postExitPeakTime: Date | string | undefined;
  const postExitCandleCount = postExitCandles.length;
  let postExitRunBeyondExitPoints: number | undefined;
  let postExitRunBeyondExitR: number | undefined;
  let postExitMaePoints: number | undefined;
  let postExitMaeAmount: number | undefined;
  let postExitMaeR: number | undefined;
  let postExitTroughPrice: number | undefined;
  let postExitTroughTime: Date | string | undefined;
  let postExitAdverseBeyondExitPoints: number | undefined;
  let postExitAdverseBeyondExitR: number | undefined;
  let postExitTimeToPeakMinutes: number | undefined;
  let postExitVelocityRPerMin: number | undefined;

  if (postExitCandles.length > 0) {
    let postHighestPrice = postExitCandles[0].h;
    let postLowestPrice = postExitCandles[0].l;
    let postHighestTimeMs = postExitCandles[0].tMs;
    let postLowestTimeMs = postExitCandles[0].tMs;

    for (const pBar of postExitCandles) {
      if (pBar.h.greaterThan(postHighestPrice)) {
        postHighestPrice = pBar.h;
        postHighestTimeMs = pBar.tMs;
      }
      if (pBar.l.lessThan(postLowestPrice)) {
        postLowestPrice = pBar.l;
        postLowestTimeMs = pBar.tMs;
      }
    }

    let pMfePointsDec: Decimal;
    let pRunBeyondExitDec: Decimal;
    let pMaePointsDec: Decimal;
    let pAdverseBeyondExitDec: Decimal;

    if (direction === 'LONG') {
      pMfePointsDec = Decimal.max(0, postHighestPrice.minus(dEntry));
      pRunBeyondExitDec = Decimal.max(0, postHighestPrice.minus(dExit));
      postExitPeakPrice = Number(postHighestPrice.toFixed(4));
      postExitPeakTime = new Date(postHighestTimeMs);
      postExitTimeToPeakMinutes = Math.max(0, Math.round((postHighestTimeMs - exitMs) / 60_000));

      pMaePointsDec = Decimal.max(0, dEntry.minus(postLowestPrice));
      pAdverseBeyondExitDec = Decimal.max(0, dExit.minus(postLowestPrice));
      postExitTroughPrice = Number(postLowestPrice.toFixed(4));
      postExitTroughTime = new Date(postLowestTimeMs);
    } else {
      // SHORT
      pMfePointsDec = Decimal.max(0, dEntry.minus(postLowestPrice));
      pRunBeyondExitDec = Decimal.max(0, dExit.minus(postLowestPrice));
      postExitPeakPrice = Number(postLowestPrice.toFixed(4));
      postExitPeakTime = new Date(postLowestTimeMs);
      postExitTimeToPeakMinutes = Math.max(0, Math.round((postLowestTimeMs - exitMs) / 60_000));

      pMaePointsDec = Decimal.max(0, postHighestPrice.minus(dEntry));
      pAdverseBeyondExitDec = Decimal.max(0, postHighestPrice.minus(dExit));
      postExitTroughPrice = Number(postHighestPrice.toFixed(4));
      postExitTroughTime = new Date(postHighestTimeMs);
    }

    postExitMfePoints = Number(pMfePointsDec.toFixed(4));
    postExitRunBeyondExitPoints = Number(pRunBeyondExitDec.toFixed(4));
    postExitMaePoints = Number(pMaePointsDec.toFixed(4));
    postExitAdverseBeyondExitPoints = Number(pAdverseBeyondExitDec.toFixed(4));

    const pMfeAmtDec = pMfePointsDec.times(dQty).times(dMultiplier);
    postExitMfeAmount = Number(pMfeAmtDec.toFixed(2));
    const pMaeAmtDec = pMaePointsDec.times(dQty).times(dMultiplier);
    postExitMaeAmount = Number(pMaeAmtDec.toFixed(2));

    if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
      postExitMfeR = Number(pMfeAmtDec.dividedBy(dPlannedRisk).toFixed(4));
      const runBeyondAmt = pRunBeyondExitDec.times(dQty).times(dMultiplier);
      postExitRunBeyondExitR = Number(runBeyondAmt.dividedBy(dPlannedRisk).toFixed(4));
      postExitMaeR = Number(pMaeAmtDec.dividedBy(dPlannedRisk).toFixed(4));
      const adverseBeyondAmt = pAdverseBeyondExitDec.times(dQty).times(dMultiplier);
      postExitAdverseBeyondExitR = Number(adverseBeyondAmt.dividedBy(dPlannedRisk).toFixed(4));
    } else if (dStop) {
      const stopDist = dEntry.minus(dStop).abs();
      if (stopDist.greaterThan(0)) {
        postExitMfeR = Number(pMfePointsDec.dividedBy(stopDist).toFixed(4));
        postExitRunBeyondExitR = Number(pRunBeyondExitDec.dividedBy(stopDist).toFixed(4));
        postExitMaeR = Number(pMaePointsDec.dividedBy(stopDist).toFixed(4));
        postExitAdverseBeyondExitR = Number(pAdverseBeyondExitDec.dividedBy(stopDist).toFixed(4));
      }
    }

    if (postExitTimeToPeakMinutes !== undefined && postExitTimeToPeakMinutes > 0 && postExitRunBeyondExitR !== undefined) {
      postExitVelocityRPerMin = Number((postExitRunBeyondExitR / postExitTimeToPeakMinutes).toFixed(4));
    }

    if (postExitRunBeyondExitR !== undefined && postExitRunBeyondExitR >= (settings.gaveBackMinMfeR ?? 1.0)) {
      if (!excursionFlags.includes('RUNNER_LEFT_ON_TABLE')) {
        excursionFlags.push('RUNNER_LEFT_ON_TABLE');
      }
      if (!excursionFlags.includes('PREMATURE_EXIT')) {
        excursionFlags.push('PREMATURE_EXIT');
      }
    }

    // Optimal Exit Detection:
    // If the trade was a winner and post-exit price suffered major adverse drop (>= optimalExitMinAdverseR, default 0.75R)
    // while running very little beyond exit (<= optimalExitMaxRunBeyondR, default 0.35R),
    // this identifies top-tick/bottom-tick exit precision right before a steep reversal.
    const optMinAdverseR = settings.optimalExitMinAdverseR ?? 0.75;
    const optMaxRunBeyondR = settings.optimalExitMaxRunBeyondR ?? 0.35;
    const isWinner = direction === 'LONG' ? dExit.greaterThan(dEntry) : dExit.lessThan(dEntry);
    if (
      isWinner &&
      postExitAdverseBeyondExitR !== undefined &&
      postExitAdverseBeyondExitR >= optMinAdverseR &&
      (postExitRunBeyondExitR === undefined || postExitRunBeyondExitR <= optMaxRunBeyondR)
    ) {
      if (!excursionFlags.includes('OPTIMAL_EXIT')) {
        excursionFlags.push('OPTIMAL_EXIT');
      }
    }
  }

  // 7. Early follow-through & Entry Quality Score (over first N candles)
  const earlyCandleLimit = Math.min(
    Math.max(1, settings.entryQualityCandleCount || 3),
    overlappingCandles.length
  );
  let earlyHigh = dEntry;
  let earlyLow = dEntry;
  for (let k = 0; k < earlyCandleLimit; k++) {
    const b = overlappingCandles[k];
    if (b.h.greaterThan(earlyHigh)) earlyHigh = b.h;
    if (b.l.lessThan(earlyLow)) earlyLow = b.l;
  }

  let earlyMfeDec: Decimal;
  let earlyMaeDec: Decimal;
  if (direction === 'LONG') {
    earlyMfeDec = Decimal.max(0, earlyHigh.minus(dEntry));
    earlyMaeDec = Decimal.max(0, dEntry.minus(earlyLow));
  } else {
    earlyMfeDec = Decimal.max(0, dEntry.minus(earlyLow));
    earlyMaeDec = Decimal.max(0, earlyHigh.minus(dEntry));
  }
  const earlyMfePoints = Number(earlyMfeDec.toFixed(2));
  const earlyMaePoints = Number(earlyMaeDec.toFixed(2));

  let entryQualityScore = 50;
  const earlyTotal = earlyMfeDec.plus(earlyMaeDec);
  if (earlyTotal.greaterThan(0)) {
    entryQualityScore = Math.round(earlyMfeDec.dividedBy(earlyTotal).times(100).toNumber());
  }

  // 8. Fee-adjusted Excursion Metrics
  let feeAdjustedMaePoints: number | undefined;
  let feeAdjustedMfePoints: number | undefined;
  let feeAdjustedMaeAmount: number | undefined;
  let feeAdjustedMfeAmount: number | undefined;
  let feeAdjustedMaeR: number | undefined;
  let feeAdjustedMfeR: number | undefined;

  const totalChargesVal = params.totalCharges ? new Decimal(params.totalCharges) : null;
  if (totalChargesVal && totalChargesVal.greaterThan(0) && dQty.greaterThan(0)) {
    const perUnitFee = totalChargesVal.dividedBy(dQty.times(dMultiplier));
    const feeMaePts = maePoints.plus(perUnitFee);
    const feeMfePts = Decimal.max(0, mfePoints.minus(perUnitFee));
    const feeMaeAmt = maeAmount.plus(totalChargesVal);
    const feeMfeAmt = Decimal.max(0, mfeAmount.minus(totalChargesVal));

    feeAdjustedMaePoints = Number(feeMaePts.toFixed(2));
    feeAdjustedMfePoints = Number(feeMfePts.toFixed(2));
    feeAdjustedMaeAmount = Number(feeMaeAmt.toFixed(2));
    feeAdjustedMfeAmount = Number(feeMfeAmt.toFixed(2));

    if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
      feeAdjustedMaeR = Number(feeMaeAmt.dividedBy(dPlannedRisk).toFixed(4));
      feeAdjustedMfeR = Number(feeMfeAmt.dividedBy(dPlannedRisk).toFixed(4));
    }
  }

  // 9. Exit Efficiency = realized move / MFE move
  // Edge case fix: At MFE = 0 with exit equal to entry, efficiency is undefined / null (N/A).
  // At MFE = 0 with exit != entry (losing trade with zero favorable traction), efficiency is 0.
  let realizedMovePoints: Decimal;
  if (direction === 'LONG') {
    realizedMovePoints = dExit.minus(dEntry);
  } else {
    realizedMovePoints = dEntry.minus(dExit);
  }

  let exitEfficiency: number | null = null;
  if (mfePoints.greaterThan(0)) {
    if (realizedMovePoints.greaterThan(0)) {
      const rawEff = realizedMovePoints.dividedBy(mfePoints);
      exitEfficiency = Decimal.min(new Decimal(1), Decimal.max(new Decimal(0), rawEff)).toNumber();
      exitEfficiency = Number(exitEfficiency.toFixed(4));
    } else {
      // Exited at loss or breakeven after having had favorable potential
      exitEfficiency = 0;
    }
  } else {
    // MFE is zero (never moved in favor)
    if (realizedMovePoints.isZero()) {
      exitEfficiency = null; // Flat scratch trade -> N/A
    } else {
      exitEfficiency = 0; // Pure adverse loser
    }
  }

  // 10. R Left On The Table: peak MFE in R - realized R
  let rLeftOnTable: number | undefined;
  if (mfeR !== undefined) {
    let tradeRealizedR = params.realizedR;
    if (tradeRealizedR === undefined || tradeRealizedR === null) {
      if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
        const netPnLPoints = realizedMovePoints.times(dQty).times(dMultiplier);
        tradeRealizedR = Number(netPnLPoints.dividedBy(dPlannedRisk).toFixed(4));
      } else if (dStop) {
        const stopDistance = dEntry.minus(dStop).abs();
        if (stopDistance.greaterThan(0)) {
          tradeRealizedR = Number(realizedMovePoints.dividedBy(stopDistance).toFixed(4));
        }
      }
    }
    if (tradeRealizedR !== undefined && tradeRealizedR !== null) {
      const peakOverallMfeR = Math.max(mfeR, postExitMfeR ?? 0);
      // For losing trades (tradeRealizedR < 0), subtracting a negative number inflated rLeftOnTable:
      // e.g. peak MFE 0.9083 - (-1.43) = 2.3383R.
      // A trader cannot leave on the table more than the peak favorable excursion!
      const effectiveRealizedR = Math.max(0, tradeRealizedR);
      rLeftOnTable = Math.max(0, Number((peakOverallMfeR - effectiveRealizedR).toFixed(4)));
    }
  }

  // 11. Stop efficiency and precise reversal detection after stop hit
  let stopEfficiency: number | undefined;
  let reversedAfterStopHit = false;

  if (dStop) {
    const stopDistance = dEntry.minus(dStop).abs();
    if (stopDistance.greaterThan(0)) {
      stopEfficiency = Number(maePoints.dividedBy(stopDistance).toFixed(4));
    }

    if (stopHit && stopHitCandleIndex >= 0 && stopDistance.greaterThan(0)) {
      const maxBreachBuffer = stopDistance.times(settings.stopTooTightMaxBreachBufferR ?? 0.75);
      const targetRDist = stopDistance.times(settings.stopTooTightReversalR ?? 1.0);
      const lookaheadLimit = Math.min(
        overlappingCandles.length,
        stopHitCandleIndex + 1 + (settings.stopTooTightCandleLookahead ?? 20)
      );

      let hadStructuralBreach = false;
      for (let j = stopHitCandleIndex + 1; j < lookaheadLimit; j++) {
        const subBar = overlappingCandles[j];
        if (direction === 'LONG') {
          if (subBar.l.lessThan(dStop.minus(maxBreachBuffer))) {
            hadStructuralBreach = true;
          }
          if (!hadStructuralBreach && (subBar.h.greaterThanOrEqualTo(dEntry.plus(targetRDist)) || (params.target && subBar.h.greaterThanOrEqualTo(new Decimal(params.target))))) {
            reversedAfterStopHit = true;
            break;
          }
        } else {
          // SHORT
          if (subBar.h.greaterThan(dStop.plus(maxBreachBuffer))) {
            hadStructuralBreach = true;
          }
          if (!hadStructuralBreach && (subBar.l.lessThanOrEqualTo(dEntry.minus(targetRDist)) || (params.target && subBar.l.lessThanOrEqualTo(new Decimal(params.target))))) {
            reversedAfterStopHit = true;
            break;
          }
        }
      }

      // Check exit price if trade exited during the window
      if (!hadStructuralBreach && !reversedAfterStopHit) {
        if (direction === 'LONG' && (dExit.greaterThanOrEqualTo(dEntry.plus(targetRDist)) || (params.target && dExit.greaterThanOrEqualTo(new Decimal(params.target))))) {
          reversedAfterStopHit = true;
        } else if (direction === 'SHORT' && (dExit.lessThanOrEqualTo(dEntry.minus(targetRDist)) || (params.target && dExit.lessThanOrEqualTo(new Decimal(params.target))))) {
          reversedAfterStopHit = true;
        }
      }
    }
  }

  // 11b. Post-Stop Shakeout & Recovery Excursion
  let postStopMfePoints: number | undefined;
  let postStopMfeR: number | undefined;

  if (stopHit && stopHitCandleIndex >= 0 && dStop) {
    const stopDistance = dEntry.minus(dStop).abs();
    const postStopCandles = [
      ...overlappingCandles.slice(stopHitCandleIndex + 1),
      ...postExitCandles,
    ];

    if (postStopCandles.length > 0 && stopDistance.greaterThan(0)) {
      let postStopPeakDec: Decimal = new Decimal(0);
      if (direction === 'LONG') {
        let maxH = postStopCandles[0].h;
        for (const bar of postStopCandles) {
          if (bar.h.greaterThan(maxH)) maxH = bar.h;
        }
        postStopPeakDec = Decimal.max(0, maxH.minus(dEntry));
      } else {
        // SHORT
        let minL = postStopCandles[0].l;
        for (const bar of postStopCandles) {
          if (bar.l.lessThan(minL)) minL = bar.l;
        }
        postStopPeakDec = Decimal.max(0, dEntry.minus(minL));
      }

      postStopMfePoints = Number(postStopPeakDec.toFixed(4));
      if (dPlannedRisk && dPlannedRisk.greaterThan(0)) {
        const amt = postStopPeakDec.times(dQty).times(dMultiplier);
        postStopMfeR = Number(amt.dividedBy(dPlannedRisk).toFixed(4));
      } else {
        postStopMfeR = Number(postStopPeakDec.dividedBy(stopDistance).toFixed(4));
      }

      const reversalRThreshold = settings.stopTooTightReversalR ?? 1.0;
      if (postStopMfeR >= reversalRThreshold || reversedAfterStopHit) {
        if (!excursionFlags.includes('SHAKEOUT_STOP')) {
          excursionFlags.push('SHAKEOUT_STOP');
        }
      }
    }
  }

  // 12. Time to MFE / MAE in minutes
  const timeToMfeMinutes = Math.max(0, Math.round(moment(mfeTimeMs).diff(moment(entryMs), 'minutes', true)));
  const timeToMaeMinutes = Math.max(0, Math.round(moment(maeTimeMs).diff(moment(entryMs), 'minutes', true)));

  // 13. Advisory Excursion Flags (R/normalized-only; no hardcoded 15-point threshold)
  const isPlannedRunner =
    params.tradeManagementPlan === 'RUNNER' ||
    params.hasTrailedStop === true;

  // GAVE_BACK_PROFIT: Peak run >= 1.0R (or 1% move), but surrendered profit and exited with < 50% efficiency or loss
  const gaveBackMinR = settings.gaveBackMinMfeR ?? 1.0;
  const gaveBackEffThresh = settings.gaveBackEfficiencyThreshold ?? 0.50;
  const reachedSubstantialMfe =
    (mfeR !== undefined && mfeR >= gaveBackMinR) ||
    mfePoints.greaterThanOrEqualTo(dEntry.times(0.01));

  if (reachedSubstantialMfe && !isPlannedRunner) {
    if (exitEfficiency !== null && exitEfficiency < gaveBackEffThresh && realizedMovePoints.greaterThan(0)) {
      excursionFlags.push('GAVE_BACK_PROFIT');
    } else if (realizedMovePoints.lessThanOrEqualTo(0)) {
      excursionFlags.push('GAVE_BACK_PROFIT');
    }
  }

  // EXITED_EARLY: Left the majority of move on the table (< 35% efficiency while MFE ran far beyond realized)
  const earlyExitEffThresh = settings.earlyExitEfficiencyThreshold ?? 0.35;
  if (
    exitEfficiency !== null &&
    exitEfficiency < earlyExitEffThresh &&
    realizedMovePoints.greaterThan(0) &&
    mfePoints.greaterThan(realizedMovePoints.times(2))
  ) {
    if (!excursionFlags.includes('GAVE_BACK_PROFIT')) {
      excursionFlags.push('EXITED_EARLY');
    }
  }

  // STOP_TOO_TIGHT_EVIDENCE: Stop hit and then price reversed into target territory without deep breach
  if (reversedAfterStopHit) {
    excursionFlags.push('STOP_TOO_TIGHT_EVIDENCE');
  }

  // STOP_TOO_LOOSE_EVIDENCE: MAE significantly exceeded planned stop distance
  if (dStop) {
    const stopDist = dEntry.minus(dStop).abs();
    if (stopDist.greaterThan(0) && maePoints.greaterThan(stopDist.times(1.25))) {
      excursionFlags.push('STOP_TOO_LOOSE_EVIDENCE');
    }
  } else if (maeR !== undefined && maeR > 1.25) {
    excursionFlags.push('STOP_TOO_LOOSE_EVIDENCE');
  }

  return {
    status: 'COMPUTED',
    excursionVersion,
    thresholdVersion,
    maePoints: Number(maePoints.toFixed(2)),
    mfePoints: Number(mfePoints.toFixed(2)),
    maeAmount: Number(maeAmount.toFixed(2)),
    mfeAmount: Number(mfeAmount.toFixed(2)),
    maeR,
    mfeR,
    feeAdjustedMaePoints,
    feeAdjustedMfePoints,
    feeAdjustedMaeAmount,
    feeAdjustedMfeAmount,
    feeAdjustedMaeR,
    feeAdjustedMfeR,
    rLeftOnTable,
    exitEfficiency,
    stopEfficiency,
    entryQualityScore,
    earlyMfePoints,
    earlyMaePoints,
    maeBeforeMfe,
    timeOrdering,
    stopHit,
    reversedAfterStopHit,
    timeToMfeMinutes,
    timeToMaeMinutes,
    candleCount: overlappingCandles.length,
    resolution,
    isLowResolution,
    excursionFlags,
    warnings,
    postExitMfePoints,
    postExitMfeAmount,
    postExitMfeR,
    postExitPeakPrice,
    postExitPeakTime,
    postExitLookaheadMinutes: postExitCandleCount > 0 ? postExitLookaheadMinutes : undefined,
    postExitCandleCount,
    postExitRunBeyondExitPoints,
    postExitRunBeyondExitR,
    postExitMaePoints,
    postExitMaeAmount,
    postExitMaeR,
    postExitTroughPrice,
    postExitTroughTime,
    postExitAdverseBeyondExitPoints,
    postExitAdverseBeyondExitR,
    postExitTimeToPeakMinutes,
    postExitVelocityRPerMin,
    postStopMfePoints,
    postStopMfeR,
  };
}
