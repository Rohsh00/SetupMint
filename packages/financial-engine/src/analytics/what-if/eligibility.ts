import Decimal from 'decimal.js';
import { WhatIfExclusionReason } from '@tradevault/shared';
import {
  IWhatIfTradeInput,
  IWhatIfSnapshotInput,
  IWhatIfEligibleTrade,
  IWhatIfEngineOptions,
} from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type EligibilityResult =
  | { eligible: true; input: IWhatIfEligibleTrade }
  | { eligible: false; reason: WhatIfExclusionReason; details?: string };

function toMs(dateVal: Date | string | number | undefined | null): number {
  if (dateVal === undefined || dateVal === null) return 0;
  if (typeof dateVal === 'number') {
    return dateVal < 10_000_000_000 ? dateVal * 1000 : dateVal;
  }
  const t = new Date(dateVal).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Classifies trade eligibility for the What-If simulation.
 * Strict, deterministic gating according to specification section 1.4.
 */
export function classifyEligibility(
  trade: IWhatIfTradeInput,
  snapshot: IWhatIfSnapshotInput | null | undefined,
  options: Pick<IWhatIfEngineOptions, 'excludeManagedStopTrades' | 'resolutionPolicy'>
): EligibilityResult {
  // 1. Status CLOSED
  if (trade.status !== 'CLOSED') {
    return { eligible: false, reason: 'EXCLUDED_OTHER', details: 'Trade is not closed' };
  }

  // 2. Single-fill requirement: executionMode SIMPLE or ADVANCED with exactly 1 ENTRY and 1 EXIT fill
  const executionMode = trade.executionMode || 'SIMPLE';
  if (executionMode === 'ADVANCED') {
    const fills = trade.fills || [];
    const entryFills = fills.filter((f) => f.type === 'ENTRY');
    const exitFills = fills.filter((f) => f.type === 'EXIT');
    if (entryFills.length !== 1 || exitFills.length !== 1) {
      return {
        eligible: false,
        reason: 'EXCLUDED_MULTI_FILL',
        details: `Advanced trade has ${entryFills.length} entry and ${exitFills.length} exit fills (requires exactly 1 entry and 1 exit)`,
      };
    }
  }

  // 3. Managed Stop Exclusion (if enabled)
  if (options.excludeManagedStopTrades) {
    const totalMoves = trade.calculated?.stopMoveSummary?.totalMoves ?? 0;
    const hasMoveEvents = (trade.stopLossMoveEvents && trade.stopLossMoveEvents.length > 0) || false;
    const psychologyMoved = trade.psychology?.stopLossMoved === true;
    if (totalMoves > 0 || hasMoveEvents || psychologyMoved) {
      return {
        eligible: false,
        reason: 'EXCLUDED_MANAGED_STOP',
        details: 'Trade has managed/moved stop loss during holding period',
      };
    }
  }

  // 4. Initial Stop Loss and Unit Risk
  const initialStopLossNum = trade.risk?.initialStopLoss;
  if (initialStopLossNum === undefined || initialStopLossNum === null || initialStopLossNum <= 0) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_STOP',
      details: 'Missing or non-positive initialStopLoss',
    };
  }

  // Extract entry and exit prices
  let entryPriceNum: number | undefined;
  let exitPriceNum: number | undefined;
  let qtyNum: number | undefined;
  let multNum: number | undefined;

  if (executionMode === 'SIMPLE' && trade.simpleExecution) {
    entryPriceNum = trade.simpleExecution.entryPrice;
    exitPriceNum = trade.simpleExecution.exitPrice;
    qtyNum = trade.simpleExecution.quantity;
    multNum = trade.simpleExecution.contractMultiplier;
  }

  if (entryPriceNum === undefined || entryPriceNum === null) {
    entryPriceNum = trade.calculated?.averageEntryPrice;
  }
  if (exitPriceNum === undefined || exitPriceNum === null) {
    exitPriceNum = trade.calculated?.averageExitPrice;
  }
  if (qtyNum === undefined || qtyNum === null) {
    qtyNum = trade.calculated?.closedQuantity;
  }

  if (executionMode === 'ADVANCED' && trade.fills) {
    const entryFill = trade.fills.find((f) => f.type === 'ENTRY');
    const exitFill = trade.fills.find((f) => f.type === 'EXIT');
    if (entryPriceNum === undefined) entryPriceNum = entryFill?.price;
    if (exitPriceNum === undefined) exitPriceNum = exitFill?.price;
    if (qtyNum === undefined) qtyNum = entryFill?.quantity;
  }

  if (!entryPriceNum || entryPriceNum <= 0 || !qtyNum || qtyNum <= 0) {
    return {
      eligible: false,
      reason: 'EXCLUDED_OTHER',
      details: 'Missing or invalid entry price or quantity',
    };
  }

  if (exitPriceNum === undefined || exitPriceNum === null || exitPriceNum <= 0) {
    return {
      eligible: false,
      reason: 'EXCLUDED_OTHER',
      details: 'Missing or invalid actual exit price',
    };
  }

  const dEntry = new Decimal(entryPriceNum);
  const dActualExit = new Decimal(exitPriceNum);
  const dInitialStop = new Decimal(initialStopLossNum);
  const dQty = new Decimal(qtyNum);
  const dMult = new Decimal(multNum || 1);

  // Direction and Stop side verification
  const direction = trade.direction;
  if (direction === 'LONG') {
    if (dInitialStop.greaterThanOrEqualTo(dEntry)) {
      return {
        eligible: false,
        reason: 'EXCLUDED_NO_STOP',
        details: 'LONG trade stop loss must be strictly below entry price',
      };
    }
  } else if (direction === 'SHORT') {
    if (dInitialStop.lessThanOrEqualTo(dEntry)) {
      return {
        eligible: false,
        reason: 'EXCLUDED_NO_STOP',
        details: 'SHORT trade stop loss must be strictly above entry price',
      };
    }
  } else {
    return { eligible: false, reason: 'EXCLUDED_OTHER', details: 'Invalid direction' };
  }

  const unitRisk = dEntry.minus(dInitialStop).abs();
  if (unitRisk.isZero() || unitRisk.isNegative()) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_STOP',
      details: 'Unit risk is zero or negative',
    };
  }

  const rUnitAmount = unitRisk.times(dQty).times(dMult);
  if (rUnitAmount.isZero() || rUnitAmount.isNegative()) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_STOP',
      details: 'R-unit amount is zero or negative',
    };
  }

  // 5. Candle Snapshot Availability
  if (!snapshot || !snapshot.candles || snapshot.candles.length === 0) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_CANDLES',
      details: 'No cached candle snapshot found for trade',
    };
  }

  // Check Underlying Fallback
  if (snapshot.isUnderlyingFallback === true) {
    return {
      eligible: false,
      reason: 'EXCLUDED_UNDERLYING_FALLBACK',
      details: 'Snapshot uses underlying spot/index proxy instead of actual contract candles',
    };
  }

  // Resolution policy check
  const resolution = snapshot.resolution;
  if (options.resolutionPolicy === 'ONE_MINUTE_ONLY' && resolution !== '1') {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_CANDLES',
      details: `Resolution is '${resolution}', but ONE_MINUTE_ONLY policy required`,
    };
  }
  if (!['1', '5'].includes(resolution)) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_CANDLES',
      details: `Resolution '${resolution}' is unsupported for What-If replay (must be '1' or '5')`,
    };
  }

  const entryTimeMs = toMs(trade.entryTime);
  const exitTimeMs = toMs(trade.exitTime);
  if (entryTimeMs === 0 || exitTimeMs === 0 || exitTimeMs < entryTimeMs) {
    return {
      eligible: false,
      reason: 'EXCLUDED_OTHER',
      details: 'Invalid or inverted trade entry/exit timestamps',
    };
  }

  // 6. Overlapping candle window selection
  // Bar duration in seconds:
  const barDurationSec = parseInt(resolution, 10) * 60;
  const barDurationMs = barDurationSec * 1000;

  // Find all bars overlapping [entryTimeMs, exitTimeMs]
  // Bar at t covers [tMs, tMs + barDurationMs).
  const sortedCandles = [...snapshot.candles].sort((a, b) => a.t - b.t);

  const overlapping: { candle: typeof sortedCandles[0]; originalIndex: number }[] = [];
  let entryIndexInOverlapping = -1;
  let exitIndexInOverlapping = -1;

  for (let i = 0; i < sortedCandles.length; i++) {
    const c = sortedCandles[i];
    const barStartMs = toMs(c.t);
    const barEndMs = barStartMs + barDurationMs;

    // Check overlap with [entryTimeMs, exitTimeMs]
    if (barEndMs > entryTimeMs && barStartMs <= exitTimeMs) {
      overlapping.push({ candle: c, originalIndex: i });
      const currentIdx = overlapping.length - 1;

      // Identify e: candle containing entryTime
      if (barStartMs <= entryTimeMs && entryTimeMs < barEndMs && entryIndexInOverlapping === -1) {
        entryIndexInOverlapping = currentIdx;
      }
      // Identify x: candle containing exitTime
      if (barStartMs <= exitTimeMs && exitTimeMs <= barEndMs) {
        exitIndexInOverlapping = currentIdx;
      }
    }
  }

  if (overlapping.length === 0) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_CANDLES',
      details: 'No candle bars overlap trade holding window [entry, exit]',
    };
  }

  // Fallbacks if entry/exit falls slightly before first or after last overlapping candle
  if (entryIndexInOverlapping === -1) {
    entryIndexInOverlapping = 0;
  }
  if (exitIndexInOverlapping === -1) {
    exitIndexInOverlapping = overlapping.length - 1;
  }

  // Ensure index ordering
  if (entryIndexInOverlapping > exitIndexInOverlapping) {
    return {
      eligible: false,
      reason: 'EXCLUDED_NO_CANDLES',
      details: 'Entry candle index exceeds exit candle index',
    };
  }

  const candidateCandles = overlapping.map((item) => item.candle);

  // Tick size (default 0.05 for NSE)
  const tickSize = new Decimal(0.05);

  // Actual Net P&L and Total Costs
  const actualNetPnL = new Decimal(trade.calculated?.netPnL ?? 0);
  const actualTotalCosts = new Decimal(trade.calculated?.totalCosts ?? 0);
  const actualR = rUnitAmount.isZero() ? new Decimal(0) : actualNetPnL.dividedBy(rUnitAmount);

  const plannedTarget =
    trade.risk?.plannedTarget !== undefined && trade.risk?.plannedTarget !== null
      ? new Decimal(trade.risk.plannedTarget)
      : null;

  const tradeId = (trade._id?.toString() || trade.id || '').toString();

  const eligibleTrade: IWhatIfEligibleTrade = {
    tradeId,
    direction,
    entryTimeMs,
    exitTimeMs,
    entryPrice: dEntry,
    actualExitPrice: dActualExit,
    quantity: dQty,
    contractMultiplier: dMult,
    initialStopLoss: dInitialStop,
    unitRisk,
    rUnitAmount,
    plannedTarget,
    actualTotalCosts,
    actualNetPnL,
    actualR,
    assetClass: trade.assetClass,
    marketSegment: trade.marketSegment,
    symbol: trade.symbol,
    broker: trade.accountBroker,
    brokerFlatFeePerLeg:
      trade.brokerFlatFeePerLeg !== undefined ? new Decimal(trade.brokerFlatFeePerLeg) : undefined,
    resolution,
    candles: candidateCandles,
    entryIndex: entryIndexInOverlapping,
    exitIndex: exitIndexInOverlapping,
    tickSize,
  };

  return {
    eligible: true,
    input: eligibleTrade,
  };
}
