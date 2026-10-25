import Decimal from 'decimal.js';
import { calculateIndianCharges } from '../../charges.js';
import { computeLevels } from './levels.js';
import { replayTrade } from './replay.js';
import { isCensored } from './censoring.js';
import {
  IWhatIfEligibleTrade,
  IWhatIfTradeCellSimulation,
  IWhatIfEngineOptions,
} from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface ISimulateTradeCellParams {
  trade: IWhatIfEligibleTrade;
  stopR: number | null;
  targetR: number | null;
  options: Pick<IWhatIfEngineOptions, 'fillModel' | 'slippageTicks'>;
}

/**
 * Simulates a single trade against a single (stopR, targetR) grid cell.
 * Evaluates both PESSIMISTIC and OPTIMISTIC policies, recomputes statutory costs,
 * determines right-censoring, and computes R multiples on the strict stop-distance basis.
 */
export function simulateTradeCell(params: ISimulateTradeCellParams): IWhatIfTradeCellSimulation {
  const { trade, stopR, targetR, options } = params;

  // 1. Compute price levels
  const levels = computeLevels(
    trade.entryPrice,
    trade.direction,
    trade.unitRisk,
    stopR,
    targetR,
    trade.tickSize
  );

  // 2. Replay under PESSIMISTIC policy
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

  // 3. Replay under OPTIMISTIC policy
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

  // 4. Check Right-Censoring (Section 1.10)
  // A trade is evaluable if either policy hit a simulated level before exit, or if neither hit and no censoring condition triggered
  const anyHit = pessReplay.outcome !== 'ACTUAL' || optReplay.outcome !== 'ACTUAL';
  const censorCheck = isCensored({
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    actualExitPrice: trade.actualExitPrice,
    initialStopLoss: trade.initialStopLoss,
    plannedTarget: trade.plannedTarget,
    unitRisk: trade.unitRisk,
    stopR,
    targetR,
    hitBeforeExit: anyHit,
    slippageTicks: options.slippageTicks,
    tickSize: trade.tickSize,
  });

  const status = censorCheck.censored ? 'CENSORED' : 'EVALUABLE';

  // 5. Compute P&L and Statutory Costs for Pessimistic
  const pessResult = computeOutcomeMetrics(trade, pessReplay.outcome, pessReplay.fillPrice);

  // 6. Compute P&L and Statutory Costs for Optimistic
  const optResult = computeOutcomeMetrics(trade, optReplay.outcome, optReplay.fillPrice);

  // Cost model: if either fell back to actual costs, flag ACTUAL_FALLBACK
  const costModel =
    pessResult.costModel === 'ACTUAL_FALLBACK' || optResult.costModel === 'ACTUAL_FALLBACK'
      ? 'ACTUAL_FALLBACK'
      : 'RECOMPUTED';

  // Ambiguity check: pess vs opt
  const ambiguous =
    pessReplay.outcome !== optReplay.outcome ||
    !pessResult.r.equals(optResult.r) ||
    !pessResult.netPnL.equals(optResult.netPnL);

  return {
    tradeId: trade.tradeId,
    status,
    censoredReason: censorCheck.reason,
    pess: {
      outcome: pessReplay.outcome,
      fillPrice: pessReplay.fillPrice,
      grossPnL: pessResult.grossPnL,
      costs: pessResult.costs,
      netPnL: pessResult.netPnL,
      r: pessResult.r,
      viaPartialCandle: pessReplay.viaPartialCandle,
    },
    opt: {
      outcome: optReplay.outcome,
      fillPrice: optReplay.fillPrice,
      grossPnL: optResult.grossPnL,
      costs: optResult.costs,
      netPnL: optResult.netPnL,
      r: optResult.r,
      viaPartialCandle: optReplay.viaPartialCandle,
    },
    actualSameSubset: {
      netPnL: trade.actualNetPnL,
      r: trade.actualR,
    },
    ambiguous,
    costModel,
  };
}

/**
 * Computes Gross P&L, recomputed statutory charges (or fallback), Net P&L, and R multiple.
 */
function computeOutcomeMetrics(
  trade: IWhatIfEligibleTrade,
  outcome: 'STOP' | 'TARGET' | 'ACTUAL',
  fillPrice: Decimal
): {
  grossPnL: Decimal;
  costs: Decimal;
  netPnL: Decimal;
  r: Decimal;
  costModel: 'RECOMPUTED' | 'ACTUAL_FALLBACK';
} {
  if (outcome === 'ACTUAL') {
    // Return actual recorded figures
    return {
      grossPnL: trade.actualNetPnL.plus(trade.actualTotalCosts),
      costs: trade.actualTotalCosts,
      netPnL: trade.actualNetPnL,
      r: trade.actualR,
      costModel: 'RECOMPUTED',
    };
  }

  // Simulated STOP or TARGET hit
  let grossPoints: Decimal;
  if (trade.direction === 'LONG') {
    grossPoints = fillPrice.minus(trade.entryPrice);
  } else {
    // SHORT
    grossPoints = trade.entryPrice.minus(fillPrice);
  }

  const grossPnL = grossPoints.times(trade.quantity).times(trade.contractMultiplier);

  // Attempt recomputing statutory costs via IndianChargesCalculator
  let costs: Decimal;
  let costModel: 'RECOMPUTED' | 'ACTUAL_FALLBACK' = 'RECOMPUTED';

  try {
    const charges = calculateIndianCharges({
      assetClass: trade.assetClass,
      marketSegment: trade.marketSegment,
      entryPrice: trade.entryPrice.toNumber(),
      exitPrice: fillPrice.toNumber(),
      quantity: trade.quantity.toNumber(),
      contractMultiplier: trade.contractMultiplier.toNumber(),
      brokerFlatFeePerLeg: trade.brokerFlatFeePerLeg?.toNumber(),
      broker: trade.broker,
    });
    costs = charges.totalCostsDecimal;
  } catch {
    // Fall back to trade's actual total costs
    costs = trade.actualTotalCosts;
    costModel = 'ACTUAL_FALLBACK';
  }

  const netPnL = grossPnL.minus(costs);
  const r = trade.rUnitAmount.isZero() ? new Decimal(0) : netPnL.dividedBy(trade.rUnitAmount);

  return {
    grossPnL,
    costs,
    netPnL,
    r,
    costModel,
  };
}
