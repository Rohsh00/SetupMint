import Decimal from 'decimal.js';
import { CALIBRATION_MIN_AGREEMENT, IWhatIfCalibration } from '@tradevault/shared';
import { IWhatIfEligibleTrade, IWhatIfEngineOptions } from './types.js';
import { computeLevels } from './levels.js';
import { replayTrade } from './replay.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Data-quality calibration gate ("identity check").
 * Replays trades whose actual exit was at or beyond the original stop with stopR = 1.0 and no target.
 * Verifies that the candle replay accurately reproduces the real stop execution.
 *
 * Catches:
 *  - Incorrect timezone / bar-start alignments
 *  - Gaps or corrupted candle data
 *  - Inverted direction or prices
 */
export function runCalibrationCheck(
  trades: IWhatIfEligibleTrade[],
  options: Pick<IWhatIfEngineOptions, 'fillModel' | 'slippageTicks'>
): IWhatIfCalibration {
  let testedCount = 0;
  let matchingStopCount = 0;
  let sumPessOptSpread = 0;

  for (const trade of trades) {
    const dTick = trade.tickSize;
    const tolerance = Decimal.max(dTick, dTick.times(options.slippageTicks));

    // Check if real trade exited at or beyond original stop
    let exitedAtOriginalStop = false;
    if (trade.direction === 'LONG') {
      if (trade.actualExitPrice.lessThanOrEqualTo(trade.initialStopLoss.plus(tolerance))) {
        exitedAtOriginalStop = true;
      }
    } else {
      // SHORT
      if (trade.actualExitPrice.greaterThanOrEqualTo(trade.initialStopLoss.minus(tolerance))) {
        exitedAtOriginalStop = true;
      }
    }

    if (!exitedAtOriginalStop) {
      continue;
    }

    testedCount++;

    // Replay with stopR = 1.0 and targetR = null
    const levels = computeLevels(
      trade.entryPrice,
      trade.direction,
      trade.unitRisk,
      1.0,
      null,
      trade.tickSize
    );

    const pessReplay = replayTrade({
      candles: trade.candles,
      indices: { e: trade.entryIndex, x: trade.exitIndex },
      direction: trade.direction,
      levels,
      policy: 'PESSIMISTIC',
      fillModel: options.fillModel,
      slippageTicks: options.slippageTicks,
      tickSize: trade.tickSize,
      actualExitPrice: trade.actualExitPrice,
    });

    const optReplay = replayTrade({
      candles: trade.candles,
      indices: { e: trade.entryIndex, x: trade.exitIndex },
      direction: trade.direction,
      levels,
      policy: 'OPTIMISTIC',
      fillModel: options.fillModel,
      slippageTicks: options.slippageTicks,
      tickSize: trade.tickSize,
      actualExitPrice: trade.actualExitPrice,
    });

    const hitInEither = pessReplay.outcome === 'STOP' || optReplay.outcome === 'STOP';
    if (hitInEither) {
      matchingStopCount++;
    }

    // Spread between opt and pess
    const pessR = pessReplay.outcome === 'STOP' ? -1.0 : trade.actualR.toNumber();
    const optR = optReplay.outcome === 'STOP' ? -1.0 : trade.actualR.toNumber();
    sumPessOptSpread += Math.abs(optR - pessR);
  }

  // If no trades in sample exited at stop, default agreement to 1.0 (no warning)
  const agreement = testedCount > 0 ? Number((matchingStopCount / testedCount).toFixed(4)) : 1.0;
  const pessOptSpread = testedCount > 0 ? Number((sumPessOptSpread / testedCount).toFixed(4)) : 0;
  const calibrationWarning = testedCount > 0 && agreement < CALIBRATION_MIN_AGREEMENT;

  return {
    testedCount,
    matchingStopCount,
    agreement,
    pessOptSpread,
    calibrationWarning,
  };
}
