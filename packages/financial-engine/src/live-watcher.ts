import Decimal from 'decimal.js';
import {
  AssetClass,
  Direction,
  MarketSegment,
} from '@tradevault/shared';
import { calculateLinearPnL } from './pnl.js';
import { calculateIndianCharges } from './charges.js';
import { calculateRealizedRMultiple } from './risk.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type StopThreatLevel = 'SAFE' | 'ATTENTION' | 'CRITICAL' | 'BREACHED' | 'NO_STOP';

export type LiveQuoteProvider = 'FYERS' | 'ANGEL_ONE' | 'SIMULATED' | 'MIXED';

export interface ILiveQuote {
  symbol: string;
  ltp: number | string | Decimal;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
  timestamp?: number;
  provider?: LiveQuoteProvider;
}

export interface ILiveOpenTradeCalculationParams {
  tradeId: string;
  symbol: string;
  direction: Direction;
  entryPrice: number | string | Decimal;
  currentLtp: number | string | Decimal;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  stopLoss?: number | string | Decimal | null;
  target?: number | string | Decimal | null;
  plannedRiskAmount?: number | string | Decimal | null;
  tickSize?: number | string | Decimal | null;
  assetClass?: AssetClass;
  marketSegment?: MarketSegment;
  provider?: LiveQuoteProvider;
  asOf?: Date | number;
}

export interface ILiveOpenTradeMetric {
  tradeId: string;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  currentLtp: number;
  priceDeltaPoints: number;
  priceDeltaPercent: number;
  floatingGrossPnL: number;
  estimatedCharges: number;
  floatingNetPnL: number;
  initialRiskAmount: number | null;
  unrealizedR: number | null;
  stopLoss: number | null;
  target: number | null;
  distanceToStopPoints: number | null;
  distanceToStopTicks: number | null;
  distanceToStopPercent: number | null;
  stopThreatLevel: StopThreatLevel;
  distanceToTargetPoints: number | null;
  distanceToTargetTicks: number | null;
  targetProgressPercent: number | null;
  tickSize: number;
  provider: LiveQuoteProvider;
  asOf: Date;
}

export interface ILiveWatcherSummary {
  openTradesCount: number;
  totalFloatingGrossPnL: number;
  totalEstimatedCharges: number;
  totalFloatingNetPnL: number;
  totalRiskCapital: number;
  portfolioUnrealizedR: number | null;
  profitableCount: number;
  losingCount: number;
  breakevenCount: number;
  positions: ILiveOpenTradeMetric[];
  provider: LiveQuoteProvider;
  asOf: Date;
}

/**
 * Calculates live open trade metrics (floating gross/net P&L, unrealized R,
 * distance to stop loss in points and ticks, distance to target, and stop threat level)
 * using exact Decimal.js financial arithmetic with 30-digit precision.
 */
export function calculateLiveOpenTradeMetric(
  params: ILiveOpenTradeCalculationParams
): ILiveOpenTradeMetric {
  const dEntry = new Decimal(params.entryPrice);
  const dLtp = new Decimal(params.currentLtp);
  const dQty = new Decimal(params.quantity);
  const dMultiplier = params.contractMultiplier ? new Decimal(params.contractMultiplier) : new Decimal(1);
  const dTick = params.tickSize && new Decimal(params.tickSize).greaterThan(0)
    ? new Decimal(params.tickSize)
    : new Decimal('0.05'); // Default tick size for NSE/MCX

  const isLong = params.direction === 'LONG';
  const asOfDate = params.asOf ? new Date(params.asOf) : new Date();
  const provider = params.provider || 'SIMULATED';

  // 1. Price delta (points & percentage)
  // Positive delta means favorable movement; negative means adverse.
  const priceDeltaPoints = isLong
    ? dLtp.minus(dEntry)
    : dEntry.minus(dLtp);

  const priceDeltaPercent = dEntry.isZero()
    ? new Decimal(0)
    : priceDeltaPoints.dividedBy(dEntry).times(100);

  // 2. Linear Floating Gross P&L
  const linearResult = calculateLinearPnL({
    direction: params.direction,
    entryPrice: dEntry,
    exitPrice: dLtp,
    quantity: dQty,
    contractMultiplier: dMultiplier,
  });

  // 3. Estimated Round-Trip Indian Regulatory & Brokerage Charges
  let estimatedCharges = new Decimal(0);
  try {
    const charges = calculateIndianCharges({
      assetClass: params.assetClass || 'EQUITY',
      marketSegment: params.marketSegment || 'NSE_EQ',
      entryPrice: dEntry,
      exitPrice: dLtp,
      quantity: dQty,
      contractMultiplier: dMultiplier,
    });
    estimatedCharges = new Decimal(charges.totalCosts);
  } catch {
    // If charges calculation fails (e.g. unknown asset class), fallback to 0
    estimatedCharges = new Decimal(0);
  }

  const floatingGrossPnL = linearResult.grossPnL;
  const floatingNetPnL = floatingGrossPnL.minus(estimatedCharges);

  // 4. Initial Planned Risk & Unrealized R-multiple
  let initialRiskAmount: Decimal | null = null;
  if (params.plannedRiskAmount !== undefined && params.plannedRiskAmount !== null && Number(params.plannedRiskAmount) > 0) {
    initialRiskAmount = new Decimal(params.plannedRiskAmount);
  } else if (params.stopLoss !== undefined && params.stopLoss !== null) {
    const dStop = new Decimal(params.stopLoss);
    const stopDistance = dEntry.minus(dStop).abs();
    if (!stopDistance.isZero()) {
      initialRiskAmount = stopDistance.times(dQty).times(dMultiplier);
    }
  }

  let unrealizedR: number | null = null;
  if (initialRiskAmount && initialRiskAmount.greaterThan(0)) {
    const rVal = calculateRealizedRMultiple(floatingNetPnL, initialRiskAmount);
    unrealizedR = rVal !== undefined ? rVal : null;
  }

  // 5. Distance to Stop Loss (Points, Ticks, Percent & Threat Level)
  let distanceToStopPoints: Decimal | null = null;
  let distanceToStopTicks: number | null = null;
  let distanceToStopPercent: Decimal | null = null;
  let stopThreatLevel: StopThreatLevel = 'NO_STOP';

  if (params.stopLoss !== undefined && params.stopLoss !== null) {
    const dStop = new Decimal(params.stopLoss);

    // Distance remaining to stop loss
    // For LONG: buffer = currentLtp - stopLoss
    // For SHORT: buffer = stopLoss - currentLtp
    const buffer = isLong ? dLtp.minus(dStop) : dStop.minus(dLtp);
    distanceToStopPoints = buffer;
    distanceToStopTicks = Math.round(buffer.dividedBy(dTick).toNumber());

    distanceToStopPercent = dLtp.isZero()
      ? new Decimal(0)
      : buffer.abs().dividedBy(dLtp).times(100);

    // Initial stop distance
    const initialDistance = isLong ? dEntry.minus(dStop) : dStop.minus(dEntry);

    if (buffer.lessThanOrEqualTo(0)) {
      stopThreatLevel = 'BREACHED';
    } else if (initialDistance.greaterThan(0)) {
      const bufferRatio = buffer.dividedBy(initialDistance);
      if (bufferRatio.lessThanOrEqualTo('0.25')) {
        stopThreatLevel = 'CRITICAL';
      } else if (bufferRatio.lessThanOrEqualTo('0.50')) {
        stopThreatLevel = 'ATTENTION';
      } else {
        stopThreatLevel = 'SAFE';
      }
    } else {
      stopThreatLevel = 'SAFE';
    }
  }

  // 6. Distance to Target (Points, Ticks & Progress %)
  let distanceToTargetPoints: Decimal | null = null;
  let distanceToTargetTicks: number | null = null;
  let targetProgressPercent: number | null = null;

  if (params.target !== undefined && params.target !== null) {
    const dTarget = new Decimal(params.target);

    // Remaining distance to hit target
    // For LONG: distance = target - currentLtp
    // For SHORT: distance = currentLtp - target
    const remainingToTarget = isLong ? dTarget.minus(dLtp) : dLtp.minus(dTarget);
    distanceToTargetPoints = remainingToTarget;
    distanceToTargetTicks = Math.round(remainingToTarget.dividedBy(dTick).toNumber());

    // Planned target run
    const plannedTargetRun = isLong ? dTarget.minus(dEntry) : dEntry.minus(dTarget);
    if (!plannedTargetRun.isZero()) {
      const currentRun = isLong ? dLtp.minus(dEntry) : dEntry.minus(dLtp);
      const progress = currentRun.dividedBy(plannedTargetRun).times(100);
      targetProgressPercent = Number(progress.toFixed(1));
    }
  }

  return {
    tradeId: params.tradeId,
    symbol: params.symbol,
    direction: params.direction,
    entryPrice: Number(dEntry.toFixed(2)),
    currentLtp: Number(dLtp.toFixed(2)),
    priceDeltaPoints: Number(priceDeltaPoints.toFixed(2)),
    priceDeltaPercent: Number(priceDeltaPercent.toFixed(2)),
    floatingGrossPnL: Number(floatingGrossPnL.toFixed(2)),
    estimatedCharges: Number(estimatedCharges.toFixed(2)),
    floatingNetPnL: Number(floatingNetPnL.toFixed(2)),
    initialRiskAmount: initialRiskAmount ? Number(initialRiskAmount.toFixed(2)) : null,
    unrealizedR,
    stopLoss: params.stopLoss !== undefined && params.stopLoss !== null ? Number(new Decimal(params.stopLoss).toFixed(2)) : null,
    target: params.target !== undefined && params.target !== null ? Number(new Decimal(params.target).toFixed(2)) : null,
    distanceToStopPoints: distanceToStopPoints !== null ? Number(distanceToStopPoints.toFixed(2)) : null,
    distanceToStopTicks,
    distanceToStopPercent: distanceToStopPercent !== null ? Number(distanceToStopPercent.toFixed(2)) : null,
    stopThreatLevel,
    distanceToTargetPoints: distanceToTargetPoints !== null ? Number(distanceToTargetPoints.toFixed(2)) : null,
    distanceToTargetTicks,
    targetProgressPercent,
    tickSize: Number(dTick.toFixed(4)),
    provider,
    asOf: asOfDate,
  };
}

/**
 * Aggregates individual live open trade metrics into a high-level summary.
 */
export function calculateLiveWatcherSummary(
  positions: ILiveOpenTradeMetric[],
  asOf: Date = new Date()
): ILiveWatcherSummary {
  let totalGross = new Decimal(0);
  let totalCharges = new Decimal(0);
  let totalNet = new Decimal(0);
  let totalRisk = new Decimal(0);

  let profitableCount = 0;
  let losingCount = 0;
  let breakevenCount = 0;

  const providers = new Set<LiveQuoteProvider>();

  for (const pos of positions) {
    totalGross = totalGross.plus(pos.floatingGrossPnL);
    totalCharges = totalCharges.plus(pos.estimatedCharges);
    totalNet = totalNet.plus(pos.floatingNetPnL);

    if (pos.initialRiskAmount && pos.initialRiskAmount > 0) {
      totalRisk = totalRisk.plus(pos.initialRiskAmount);
    }

    if (pos.floatingNetPnL > 0) {
      profitableCount++;
    } else if (pos.floatingNetPnL < 0) {
      losingCount++;
    } else {
      breakevenCount++;
    }

    providers.add(pos.provider);
  }

  let portfolioUnrealizedR: number | null = null;
  if (totalRisk.greaterThan(0)) {
    const r = totalNet.dividedBy(totalRisk);
    portfolioUnrealizedR = Number(r.toFixed(2));
  }

  const provider: LiveQuoteProvider = providers.size === 0
    ? 'SIMULATED'
    : providers.size === 1
    ? Array.from(providers)[0]
    : 'MIXED';

  return {
    openTradesCount: positions.length,
    totalFloatingGrossPnL: Number(totalGross.toFixed(2)),
    totalEstimatedCharges: Number(totalCharges.toFixed(2)),
    totalFloatingNetPnL: Number(totalNet.toFixed(2)),
    totalRiskCapital: Number(totalRisk.toFixed(2)),
    portfolioUnrealizedR,
    profitableCount,
    losingCount,
    breakevenCount,
    positions,
    provider,
    asOf,
  };
}
