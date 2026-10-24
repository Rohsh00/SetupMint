import Decimal from 'decimal.js';
import moment from 'moment';
import {
  StopMoveType,
  IStopLossMoveEvent,
  IStopMoveSummary,
  MistakeTag,
} from '@tradevault/shared';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IRawStopModification {
  stopPrice: number | string | Decimal;
  modifiedAt: Date | string | number;
  orderId?: string;
  orderType?: number;
  reason?: string;
}

export interface IDetectStopMovesParams {
  direction: 'LONG' | 'SHORT';
  entryPrice?: number | string | Decimal;
  initialStopLoss?: number | string | Decimal | null;
  modifications: IRawStopModification[];
}

export interface IStopMoveDetectionResult {
  moves: IStopLossMoveEvent[];
  summary: IStopMoveSummary;
  mistakeSuggestions: MistakeTag[];
  flags: Array<'STOP_WIDENED' | 'STOP_TRAILED_FAVORABLY'>;
}

/**
 * Pure domain calculation for tracking stop-loss modifications,
 * classifying each move as 'TRAILED_FAVORABLY' or 'WIDENED_RISK',
 * and detecting 'STOP_MOVED' discipline mistake suggestions.
 */
export function detectStopMoves(params: IDetectStopMovesParams): IStopMoveDetectionResult {
  const { direction, modifications = [] } = params;

  if (!modifications || modifications.length === 0) {
    const initStop = params.initialStopLoss ? new Decimal(params.initialStopLoss).toNumber() : undefined;
    return {
      moves: [],
      summary: {
        totalMoves: 0,
        widenedCount: 0,
        trailedCount: 0,
        initialStop: initStop,
        finalStop: initStop,
        netRiskChangePoints: 0,
        hasWidenedRisk: false,
        detectedAt: moment().toISOString(),
      },
      mistakeSuggestions: [],
      flags: [],
    };
  }

  // 1. Chronologically sort modifications using moment
  const sorted = [...modifications].sort((a, b) => {
    return moment(a.modifiedAt).valueOf() - moment(b.modifiedAt).valueOf();
  });

  const moves: IStopLossMoveEvent[] = [];
  let widenedCount = 0;
  let trailedCount = 0;

  // 2. Establish initial baseline stop loss
  let initialStopDecimal: Decimal | null = null;
  if (params.initialStopLoss !== undefined && params.initialStopLoss !== null) {
    const parsedInit = new Decimal(params.initialStopLoss);
    if (parsedInit.greaterThan(0)) {
      initialStopDecimal = parsedInit;
    }
  }

  let currentStopDecimal = initialStopDecimal;
  let startIndex = 0;

  // If initialStopLoss was not pre-set, the very first stop order establishes baseline
  if (!currentStopDecimal && sorted.length > 0) {
    const firstValid = sorted.find((m) => new Decimal(m.stopPrice || 0).greaterThan(0));
    if (firstValid) {
      currentStopDecimal = new Decimal(firstValid.stopPrice);
      initialStopDecimal = currentStopDecimal;
      startIndex = sorted.indexOf(firstValid) + 1;
    }
  }

  if (!currentStopDecimal) {
    return {
      moves: [],
      summary: {
        totalMoves: 0,
        widenedCount: 0,
        trailedCount: 0,
        netRiskChangePoints: 0,
        hasWidenedRisk: false,
        detectedAt: moment().toISOString(),
      },
      mistakeSuggestions: [],
      flags: [],
    };
  }

  // 3. Evaluate each modification in succession
  for (let i = startIndex; i < sorted.length; i++) {
    const mod = sorted[i];
    const newStopDecimal = new Decimal(mod.stopPrice || 0);

    if (newStopDecimal.lessThanOrEqualTo(0)) {
      continue;
    }

    if (newStopDecimal.equals(currentStopDecimal)) {
      continue;
    }

    let moveType: StopMoveType = 'UNCHANGED';

    if (direction === 'LONG') {
      if (newStopDecimal.greaterThan(currentStopDecimal)) {
        // Stop moved up (closer to entry or locking in profit) -> Trailed
        moveType = 'TRAILED_FAVORABLY';
        trailedCount++;
      } else {
        // Stop moved down (widening risk) -> Widened
        moveType = 'WIDENED_RISK';
        widenedCount++;
      }
    } else {
      // SHORT trade
      if (newStopDecimal.lessThan(currentStopDecimal)) {
        // Stop moved down (closer to entry or locking in profit) -> Trailed
        moveType = 'TRAILED_FAVORABLY';
        trailedCount++;
      } else {
        // Stop moved up (widening risk) -> Widened
        moveType = 'WIDENED_RISK';
        widenedCount++;
      }
    }

    const changePoints = newStopDecimal.minus(currentStopDecimal).abs();
    const changePercent = currentStopDecimal.greaterThan(0)
      ? changePoints.dividedBy(currentStopDecimal).times(100)
      : new Decimal(0);

    moves.push({
      previousStop: currentStopDecimal.toNumber(),
      newStop: newStopDecimal.toNumber(),
      changePoints: Number(changePoints.toFixed(4)),
      changePercent: Number(changePercent.toFixed(2)),
      moveType,
      movedAt: moment(mod.modifiedAt).toISOString(),
      orderId: mod.orderId,
      orderType: mod.orderType,
      reason: mod.reason,
    });

    currentStopDecimal = newStopDecimal;
  }

  // 4. Calculate Net Risk Points Change
  const init = initialStopDecimal || currentStopDecimal;
  let netRiskChange = new Decimal(0);
  if (direction === 'LONG') {
    // If final stop is lower than initial, risk widened by (initial - final)
    netRiskChange = init.minus(currentStopDecimal);
  } else {
    // If final stop is higher than initial, risk widened by (final - initial)
    netRiskChange = currentStopDecimal.minus(init);
  }

  const hasWidenedRisk = widenedCount > 0;
  const mistakeSuggestions: MistakeTag[] = [];
  const flags: Array<'STOP_WIDENED' | 'STOP_TRAILED_FAVORABLY'> = [];

  if (hasWidenedRisk) {
    mistakeSuggestions.push('STOP_MOVED');
    flags.push('STOP_WIDENED');
  } else if (trailedCount > 0) {
    flags.push('STOP_TRAILED_FAVORABLY');
  }

  return {
    moves,
    summary: {
      totalMoves: moves.length,
      widenedCount,
      trailedCount,
      initialStop: init.toNumber(),
      finalStop: currentStopDecimal.toNumber(),
      netRiskChangePoints: Number(netRiskChange.toFixed(4)),
      hasWidenedRisk,
      detectedAt: moment().toISOString(),
    },
    mistakeSuggestions,
    flags,
  };
}
