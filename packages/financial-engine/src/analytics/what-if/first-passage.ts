import Decimal from 'decimal.js';
import { WhatIfPolicy, WhatIfFillModel, ITradeCandle } from '@tradevault/shared';
import { IWhatIfReplayResult } from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IStopFirstPassage {
  stopPrice: Decimal;
  firstGapIndex: number; // -1 if none
  gapOpenPrice: Decimal | null;
  firstDefiniteTouchIndex: number; // -1 if none
  firstPartialTouchIndex: number; // -1 if none
}

export interface ITargetFirstPassage {
  targetPrice: Decimal;
  firstGapIndex: number; // -1 if none
  gapOpenPrice: Decimal | null;
  firstDefiniteTouchPessIndex: number; // -1 if none (trade-through)
  firstDefiniteTouchOptIndex: number; // -1 if none (touch)
  firstPartialTouchOptIndex: number; // -1 if none (touch on e or x)
}

export interface ITradePrecomputedPassages {
  tradeId: string;
  stops: Map<string, IStopFirstPassage>; // keyed by stopPrice.toString()
  targets: Map<string, ITargetFirstPassage>; // keyed by targetPrice.toString()
}

/**
 * Precomputes first-passage records for a trade over all distinct stop and target price levels.
 *
 * Complexity:
 *   - Precomputation: O( (S + T) * C ) where S is count of distinct stop levels, T count of distinct targets,
 *     and C is the number of candles in [e, x].
 *   - Evaluation per cell: O(1) comparison of precomputed first-passage indices.
 *   - Overall complexity for G cells: O( (S + T) * C + G ) instead of O( G * C ).
 *     For 7x7 = 49 cells, this reduces candle scans from 49 * C down to (7 + 7) * C = 14 * C.
 */
export function precomputeTradePassages(
  candles: ITradeCandle[],
  e: number,
  x: number,
  direction: 'LONG' | 'SHORT',
  distinctStopPrices: Decimal[],
  distinctTargetPrices: Decimal[],
  tickSize: Decimal | number = 0.05
): {
  stops: Map<string, IStopFirstPassage>;
  targets: Map<string, ITargetFirstPassage>;
} {
  const dTick = new Decimal(tickSize);
  const stops = new Map<string, IStopFirstPassage>();
  const targets = new Map<string, ITargetFirstPassage>();

  // Initialize stop records
  for (const sp of distinctStopPrices) {
    stops.set(sp.toString(), {
      stopPrice: sp,
      firstGapIndex: -1,
      gapOpenPrice: null,
      firstDefiniteTouchIndex: -1,
      firstPartialTouchIndex: -1,
    });
  }

  // Initialize target records
  for (const tp of distinctTargetPrices) {
    targets.set(tp.toString(), {
      targetPrice: tp,
      firstGapIndex: -1,
      gapOpenPrice: null,
      firstDefiniteTouchPessIndex: -1,
      firstDefiniteTouchOptIndex: -1,
      firstPartialTouchOptIndex: -1,
    });
  }

  // Single pass over candles from e to x
  for (let i = e; i <= x; i++) {
    const candle = candles[i];
    if (!candle) continue;

    const isPartial = i === e || i === x;
    const isAfterEntry = i > e;

    const open = new Decimal(candle.o);
    const high = new Decimal(candle.h);
    const low = new Decimal(candle.l);

    // Scan distinct stops
    for (const sp of distinctStopPrices) {
      const rec = stops.get(sp.toString())!;

      // Check gap on definite candle after entry
      if (isAfterEntry && rec.firstGapIndex === -1) {
        const isGap = direction === 'LONG' ? open.lte(sp) : open.gte(sp);
        if (isGap) {
          rec.firstGapIndex = i;
          rec.gapOpenPrice = open;
        }
      }

      // Check touch
      const isTouch = direction === 'LONG' ? low.lte(sp) : high.gte(sp);
      if (isTouch) {
        if (isPartial) {
          if (rec.firstPartialTouchIndex === -1) {
            rec.firstPartialTouchIndex = i;
          }
        } else {
          if (rec.firstDefiniteTouchIndex === -1) {
            rec.firstDefiniteTouchIndex = i;
          }
        }
      }
    }

    // Scan distinct targets
    for (const tp of distinctTargetPrices) {
      const rec = targets.get(tp.toString())!;

      // Check gap on definite candle after entry
      if (isAfterEntry && rec.firstGapIndex === -1) {
        const isGap = direction === 'LONG' ? open.gte(tp) : open.lte(tp);
        if (isGap) {
          rec.firstGapIndex = i;
          rec.gapOpenPrice = open;
        }
      }

      // Check trade-through (Pessimistic) and touch (Optimistic)
      if (direction === 'LONG') {
        const isTradeThrough = high.gte(tp.plus(dTick));
        const isTouch = high.gte(tp);

        if (isPartial) {
          if (isTouch && rec.firstPartialTouchOptIndex === -1) {
            rec.firstPartialTouchOptIndex = i;
          }
        } else {
          if (isTradeThrough && rec.firstDefiniteTouchPessIndex === -1) {
            rec.firstDefiniteTouchPessIndex = i;
          }
          if (isTouch && rec.firstDefiniteTouchOptIndex === -1) {
            rec.firstDefiniteTouchOptIndex = i;
          }
        }
      } else {
        // SHORT
        const isTradeThrough = low.lte(tp.minus(dTick));
        const isTouch = low.lte(tp);

        if (isPartial) {
          if (isTouch && rec.firstPartialTouchOptIndex === -1) {
            rec.firstPartialTouchOptIndex = i;
          }
        } else {
          if (isTradeThrough && rec.firstDefiniteTouchPessIndex === -1) {
            rec.firstDefiniteTouchPessIndex = i;
          }
          if (isTouch && rec.firstDefiniteTouchOptIndex === -1) {
            rec.firstDefiniteTouchOptIndex = i;
          }
        }
      }
    }
  }

  return { stops, targets };
}

/**
 * Combines precomputed stop and target passages in O(1) to evaluate outcome under a given policy.
 * Guaranteed to produce results identical to naive replayTrade.
 */
export function evaluateFirstPassageCell(
  stopRec: IStopFirstPassage | null,
  targetRec: ITargetFirstPassage | null,
  direction: 'LONG' | 'SHORT',
  policy: WhatIfPolicy,
  fillModel: WhatIfFillModel,
  slippageTicks: number,
  tickSize: Decimal | number,
  actualExitPrice: Decimal,
  exitIndex: number
): IWhatIfReplayResult {
  const dTick = new Decimal(tickSize);
  const dSlippage = dTick.times(Math.max(0, slippageTicks));

  if (!stopRec && !targetRec) {
    return {
      outcome: 'ACTUAL',
      fillPrice: actualExitPrice,
      candleIndex: exitIndex,
      viaPartialCandle: false,
      gapFill: false,
    };
  }

  // Determine earliest stop hit index and earliest target hit index under policy
  let stopHitIndex = -1;
  let stopIsPartial = false;
  let stopIsGap = false;
  let stopFillPrice: Decimal | null = null;

  if (stopRec) {
    const gapIdx = fillModel === 'GAP_AWARE' ? stopRec.firstGapIndex : -1;
    const defIdx = stopRec.firstDefiniteTouchIndex;
    const partialIdx = policy === 'PESSIMISTIC' ? stopRec.firstPartialTouchIndex : -1; // Pessimistic accepts partial stop touch

    // Candidate indices: find minimum positive index
    const candidates: { idx: number; isPartial: boolean; isGap: boolean; fill: Decimal }[] = [];
    if (gapIdx !== -1) {
      const raw = stopRec.gapOpenPrice!;
      const fill = direction === 'LONG' ? raw.minus(dSlippage) : raw.plus(dSlippage);
      candidates.push({ idx: gapIdx, isPartial: false, isGap: true, fill });
    }
    if (defIdx !== -1) {
      const raw = stopRec.stopPrice;
      const fill = direction === 'LONG' ? raw.minus(dSlippage) : raw.plus(dSlippage);
      candidates.push({ idx: defIdx, isPartial: false, isGap: false, fill });
    }
    if (partialIdx !== -1) {
      const raw = stopRec.stopPrice;
      const fill = direction === 'LONG' ? raw.minus(dSlippage) : raw.plus(dSlippage);
      candidates.push({ idx: partialIdx, isPartial: true, isGap: false, fill });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.idx - b.idx);
      stopHitIndex = candidates[0].idx;
      stopIsPartial = candidates[0].isPartial;
      stopIsGap = candidates[0].isGap;
      stopFillPrice = candidates[0].fill;
    }
  }

  let targetHitIndex = -1;
  let targetIsPartial = false;
  let targetIsGap = false;
  let targetFillPrice: Decimal | null = null;

  if (targetRec) {
    const gapIdx = fillModel === 'GAP_AWARE' ? targetRec.firstGapIndex : -1;
    const defIdx =
      policy === 'PESSIMISTIC'
        ? targetRec.firstDefiniteTouchPessIndex
        : targetRec.firstDefiniteTouchOptIndex;
    const partialIdx = policy === 'OPTIMISTIC' ? targetRec.firstPartialTouchOptIndex : -1; // Optimistic accepts partial target touch

    const candidates: { idx: number; isPartial: boolean; isGap: boolean; fill: Decimal }[] = [];
    if (gapIdx !== -1) {
      candidates.push({ idx: gapIdx, isPartial: false, isGap: true, fill: targetRec.gapOpenPrice! });
    }
    if (defIdx !== -1) {
      candidates.push({ idx: defIdx, isPartial: false, isGap: false, fill: targetRec.targetPrice });
    }
    if (partialIdx !== -1) {
      candidates.push({ idx: partialIdx, isPartial: true, isGap: false, fill: targetRec.targetPrice });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.idx - b.idx);
      targetHitIndex = candidates[0].idx;
      targetIsPartial = candidates[0].isPartial;
      targetIsGap = candidates[0].isGap;
      targetFillPrice = candidates[0].fill;
    }
  }

  // Resolve which level was hit first
  if (stopHitIndex !== -1 && targetHitIndex !== -1) {
    if (stopHitIndex < targetHitIndex) {
      return {
        outcome: 'STOP',
        fillPrice: stopFillPrice!,
        candleIndex: stopHitIndex,
        viaPartialCandle: stopIsPartial,
        gapFill: stopIsGap,
      };
    } else if (targetHitIndex < stopHitIndex) {
      return {
        outcome: 'TARGET',
        fillPrice: targetFillPrice!,
        candleIndex: targetHitIndex,
        viaPartialCandle: targetIsPartial,
        gapFill: targetIsGap,
      };
    } else {
      // Same candle tie-breaker according to policy (Section 1.8)
      if (policy === 'PESSIMISTIC') {
        return {
          outcome: 'STOP',
          fillPrice: stopFillPrice!,
          candleIndex: stopHitIndex,
          viaPartialCandle: stopIsPartial,
          gapFill: stopIsGap,
        };
      } else {
        return {
          outcome: 'TARGET',
          fillPrice: targetFillPrice!,
          candleIndex: targetHitIndex,
          viaPartialCandle: targetIsPartial,
          gapFill: targetIsGap,
        };
      }
    }
  } else if (stopHitIndex !== -1) {
    return {
      outcome: 'STOP',
      fillPrice: stopFillPrice!,
      candleIndex: stopHitIndex,
      viaPartialCandle: stopIsPartial,
      gapFill: stopIsGap,
    };
  } else if (targetHitIndex !== -1) {
    return {
      outcome: 'TARGET',
      fillPrice: targetFillPrice!,
      candleIndex: targetHitIndex,
      viaPartialCandle: targetIsPartial,
      gapFill: targetIsGap,
    };
  }

  return {
    outcome: 'ACTUAL',
    fillPrice: actualExitPrice,
    candleIndex: exitIndex,
    viaPartialCandle: false,
    gapFill: false,
  };
}
