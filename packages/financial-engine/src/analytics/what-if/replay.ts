import Decimal from 'decimal.js';
import { WhatIfPolicy, WhatIfFillModel, ITradeCandle } from '@tradevault/shared';
import { IWhatIfReplayResult } from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IReplayTradeParams {
  candles: ITradeCandle[];
  indices: { e: number; x: number };
  direction: 'LONG' | 'SHORT';
  levels: { stopPrice: Decimal | null; targetPrice: Decimal | null };
  policy: WhatIfPolicy;
  fillModel: WhatIfFillModel;
  slippageTicks: number;
  tickSize: Decimal | number;
  actualExitPrice: Decimal;
}

/**
 * Replays trade against candle sequence over [e, x] under a deterministic policy.
 * Implements Sections 1.5, 1.6, 1.7, 1.8.
 */
export function replayTrade(params: IReplayTradeParams): IWhatIfReplayResult {
  const {
    candles,
    indices: { e, x },
    direction,
    levels: { stopPrice, targetPrice },
    policy,
    fillModel,
    slippageTicks,
    actualExitPrice,
  } = params;

  const dTick = new Decimal(params.tickSize || 0.05);
  const dSlippage = dTick.times(Math.max(0, slippageTicks));

  // If both levels are null (baseline cell), immediately return ACTUAL
  if (!stopPrice && !targetPrice) {
    return {
      outcome: 'ACTUAL',
      fillPrice: actualExitPrice,
      candleIndex: x,
      viaPartialCandle: false,
      gapFill: false,
    };
  }

  // Iterate over candles from e to x
  for (let i = e; i <= x; i++) {
    const candle = candles[i];
    if (!candle) continue;

    const isPartial = i === e || i === x;
    const isAfterEntry = i > e;

    const open = new Decimal(candle.o);
    const high = new Decimal(candle.h);
    const low = new Decimal(candle.l);

    // 1. GAP-AWARE OPEN CHECK (Section 1.7)
    // Applies on definite candles after entry candle (i > e)
    if (fillModel === 'GAP_AWARE' && isAfterEntry) {
      let stopGapped = false;
      let targetGapped = false;

      if (direction === 'LONG') {
        if (stopPrice && open.lessThanOrEqualTo(stopPrice)) stopGapped = true;
        if (targetPrice && open.greaterThanOrEqualTo(targetPrice)) targetGapped = true;
      } else {
        // SHORT
        if (stopPrice && open.greaterThanOrEqualTo(stopPrice)) stopGapped = true;
        if (targetPrice && open.lessThanOrEqualTo(targetPrice)) targetGapped = true;
      }

      // If open gapped through both, policy decides
      if (stopGapped && targetGapped) {
        if (policy === 'PESSIMISTIC') {
          const rawFill = open;
          const fillPrice = direction === 'LONG' ? rawFill.minus(dSlippage) : rawFill.plus(dSlippage);
          return { outcome: 'STOP', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: true };
        } else {
          return { outcome: 'TARGET', fillPrice: open, candleIndex: i, viaPartialCandle: isPartial, gapFill: true };
        }
      } else if (stopGapped) {
        const rawFill = open;
        const fillPrice = direction === 'LONG' ? rawFill.minus(dSlippage) : rawFill.plus(dSlippage);
        return { outcome: 'STOP', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: true };
      } else if (targetGapped) {
        return { outcome: 'TARGET', fillPrice: open, candleIndex: i, viaPartialCandle: isPartial, gapFill: true };
      }
    }

    // 2. TOUCH EVALUATION (Section 1.6 & 1.8)
    let stopTouched = false;
    let targetTouched = false;

    if (direction === 'LONG') {
      if (stopPrice && low.lessThanOrEqualTo(stopPrice)) {
        stopTouched = true;
      }
      if (targetPrice) {
        if (policy === 'PESSIMISTIC') {
          // Trade-through required: high must exceed target by at least 1 tick
          if (high.greaterThanOrEqualTo(targetPrice.plus(dTick))) {
            targetTouched = true;
          }
        } else {
          // Optimistic: touch is accepted
          if (high.greaterThanOrEqualTo(targetPrice)) {
            targetTouched = true;
          }
        }
      }
    } else {
      // SHORT
      if (stopPrice && high.greaterThanOrEqualTo(stopPrice)) {
        stopTouched = true;
      }
      if (targetPrice) {
        if (policy === 'PESSIMISTIC') {
          // Trade-through required: low must exceed target by at least 1 tick below
          if (low.lessThanOrEqualTo(targetPrice.minus(dTick))) {
            targetTouched = true;
          }
        } else {
          // Optimistic: touch is accepted
          if (low.lessThanOrEqualTo(targetPrice)) {
            targetTouched = true;
          }
        }
      }
    }

    // Filter partial candle touches based on policy (Section 1.8)
    if (isPartial) {
      if (policy === 'PESSIMISTIC') {
        // Partial candle touch of STOP counts; TARGET does not count
        targetTouched = false;
      } else {
        // Optimistic: partial candle touch of STOP does NOT count; TARGET counts
        stopTouched = false;
      }
    }

    // 3. RESOLUTION OF ORDER WITHIN CANDLE (Section 1.8)
    if (stopTouched && targetTouched) {
      if (policy === 'PESSIMISTIC') {
        // Stop first
        const rawFill =
          fillModel === 'GAP_AWARE' && isAfterEntry && (direction === 'LONG' ? open.lte(stopPrice!) : open.gte(stopPrice!))
            ? open
            : stopPrice!;
        const fillPrice = direction === 'LONG' ? rawFill.minus(dSlippage) : rawFill.plus(dSlippage);
        return { outcome: 'STOP', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: false };
      } else {
        // Target first
        const fillPrice =
          fillModel === 'GAP_AWARE' && isAfterEntry && (direction === 'LONG' ? open.gte(targetPrice!) : open.lte(targetPrice!))
            ? open
            : targetPrice!;
        return { outcome: 'TARGET', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: false };
      }
    } else if (stopTouched) {
      const rawFill =
        fillModel === 'GAP_AWARE' && isAfterEntry && (direction === 'LONG' ? open.lte(stopPrice!) : open.gte(stopPrice!))
          ? open
          : stopPrice!;
      const fillPrice = direction === 'LONG' ? rawFill.minus(dSlippage) : rawFill.plus(dSlippage);
      return { outcome: 'STOP', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: false };
    } else if (targetTouched) {
      const fillPrice =
        fillModel === 'GAP_AWARE' && isAfterEntry && (direction === 'LONG' ? open.gte(targetPrice!) : open.lte(targetPrice!))
          ? open
          : targetPrice!;
      return { outcome: 'TARGET', fillPrice, candleIndex: i, viaPartialCandle: isPartial, gapFill: false };
    }
  }

  // If no level hit through x, result stands as ACTUAL
  return {
    outcome: 'ACTUAL',
    fillPrice: actualExitPrice,
    candleIndex: x,
    viaPartialCandle: false,
    gapFill: false,
  };
}
