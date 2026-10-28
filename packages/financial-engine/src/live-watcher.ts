import Decimal from 'decimal.js';
import {
  AssetClass,
  Direction,
  MarketSegment,
  GivebackThreatLevel,
  ILiveGivebackMetric,
  TargetLadderStepStatus,
  ILiveTargetLadderStep,
  ILiveTargetLadder,
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
  previousPeakMfe?: {
    peakLtp?: number;
    peakFloatingNetPnL?: number;
    peakUnrealizedR?: number;
  };
}

export interface ILiveOpenTradeMetric {
  tradeId: string;
  symbol: string;
  direction: Direction;
  quantity: number;
  contractMultiplier?: number;
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
  giveback?: ILiveGivebackMetric;
  targetLadder?: ILiveTargetLadder;
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

export function calculateLiveGiveback(params: {
  direction: Direction;
  currentLtp: Decimal;
  floatingNetPnL: Decimal;
  unrealizedR: number | null;
  previousPeakMfe?: {
    peakLtp?: number;
    peakFloatingNetPnL?: number;
    peakUnrealizedR?: number;
  };
}): ILiveGivebackMetric {
  const isLong = params.direction === 'LONG';
  const curNet = Number(params.floatingNetPnL.toFixed(2));
  const curR = params.unrealizedR !== null ? Number(params.unrealizedR.toFixed(2)) : 0;
  const curLtp = Number(params.currentLtp.toFixed(2));

  // Determine Peak
  const prevNet = params.previousPeakMfe?.peakFloatingNetPnL ?? curNet;
  const prevR = params.previousPeakMfe?.peakUnrealizedR ?? curR;
  const prevLtp = params.previousPeakMfe?.peakLtp ?? curLtp;

  const peakFloatingNetPnL = Math.max(curNet, prevNet);
  const peakUnrealizedR = Math.max(curR, prevR);
  const peakLtp = isLong
    ? Math.max(curLtp, prevLtp)
    : Math.min(curLtp, prevLtp);

  const rawGiveback = Math.max(0, peakFloatingNetPnL - curNet);
  const givebackAmount = Number(rawGiveback.toFixed(2));

  let givebackPercent = 0;
  if (peakFloatingNetPnL > 0) {
    givebackPercent = Math.min(100, Math.max(0, Number(((givebackAmount / peakFloatingNetPnL) * 100).toFixed(1))));
  }
  const retentionPercent = Number((100 - givebackPercent).toFixed(1));

  let threatLevel: GivebackThreatLevel = 'SAFE';
  let alertMessage: string | undefined;

  if (peakUnrealizedR >= 1.0 && curR <= 0.2) {
    threatLevel = 'CRITICAL_REVERSAL';
    alertMessage = `🚨 Reversal Threat: Reached +${peakUnrealizedR.toFixed(2)}R (+₹${peakFloatingNetPnL.toLocaleString('en-IN')}), now dropped to +${curR.toFixed(2)}R. Protect capital!`;
  } else if (peakUnrealizedR >= 1.0 && givebackPercent >= 35) {
    threatLevel = 'LEAKING';
    alertMessage = `⚠️ Profit Leaking: Gave back ${givebackPercent}% (-₹${givebackAmount.toLocaleString('en-IN')}) from +${peakUnrealizedR.toFixed(2)}R peak. Consider booking profit!`;
  } else if (peakUnrealizedR >= 0.8 && givebackPercent >= 20) {
    threatLevel = 'WATCH';
    alertMessage = `👀 Pullback Watch: ${givebackPercent}% off peak (+${peakUnrealizedR.toFixed(2)}R).`;
  }

  return {
    peakFloatingNetPnL,
    peakUnrealizedR,
    peakLtp,
    givebackAmount,
    givebackPercent,
    retentionPercent,
    threatLevel,
    alertMessage,
  };
}

export function calculateTargetLadder(params: {
  direction: Direction;
  entryPrice: Decimal;
  currentLtp: Decimal;
  quantity: Decimal;
  contractMultiplier: Decimal;
  initialRiskAmount: Decimal | null;
  stopLoss: Decimal | null;
  plannedTarget: Decimal | null;
  tickSize: Decimal;
}): ILiveTargetLadder | undefined {
  const isLong = params.direction === 'LONG';
  const dEntry = params.entryPrice;
  const dLtp = params.currentLtp;
  const totalQty = params.quantity.toNumber();
  const dMult = params.contractMultiplier;

  // Determine initial risk in price points
  let riskPoints = new Decimal(0);
  if (params.stopLoss) {
    riskPoints = dEntry.minus(params.stopLoss).abs();
  } else if (params.initialRiskAmount && totalQty > 0 && dMult.greaterThan(0)) {
    riskPoints = params.initialRiskAmount.dividedBy(params.quantity.times(dMult));
  }

  if (riskPoints.isZero() || totalQty <= 0) {
    return undefined;
  }

  const initialRiskPoints = Number(riskPoints.toFixed(2));
  const initialRiskAmountVal = params.initialRiskAmount
    ? Number(params.initialRiskAmount.toFixed(2))
    : Number(riskPoints.times(params.quantity).times(dMult).toFixed(2));

  // T1: +1.0 R
  const t1Price = isLong ? dEntry.plus(riskPoints) : dEntry.minus(riskPoints);
  const isT1Met = isLong ? dLtp.greaterThanOrEqualTo(t1Price) : dLtp.lessThanOrEqualTo(t1Price);
  const t1ExitRatio = totalQty > 2 ? 0.33 : 0.5;
  const t1ExitQty = Math.max(1, Math.round(totalQty * t1ExitRatio));

  const t1Dist = isLong ? t1Price.minus(dLtp) : dLtp.minus(t1Price);
  const t1Run = isLong ? dLtp.minus(dEntry) : dEntry.minus(dLtp);
  const t1Progress = Math.min(100, Math.max(0, Number(t1Run.dividedBy(riskPoints).times(100).toFixed(1))));

  // T2: +2.0 R
  const t2RiskPoints = riskPoints.times(2);
  const t2Price = isLong ? dEntry.plus(t2RiskPoints) : dEntry.minus(t2RiskPoints);
  const isT2Met = isLong ? dLtp.greaterThanOrEqualTo(t2Price) : dLtp.lessThanOrEqualTo(t2Price);
  const remAfterT1 = Math.max(1, totalQty - t1ExitQty);
  const t2ExitQty = Math.max(1, Math.round(remAfterT1 * 0.5));

  const t2Dist = isLong ? t2Price.minus(dLtp) : dLtp.minus(t2Price);
  const t2Progress = Math.min(100, Math.max(0, Number(t1Run.dividedBy(t2RiskPoints).times(100).toFixed(1))));

  // T3 / Runner: +3.0 R or planned target
  const t3RiskPoints = riskPoints.times(3);
  const t3Price = params.plannedTarget && !params.plannedTarget.isZero()
    ? params.plannedTarget
    : isLong ? dEntry.plus(t3RiskPoints) : dEntry.minus(t3RiskPoints);
  const isT3Met = isLong ? dLtp.greaterThanOrEqualTo(t3Price) : dLtp.lessThanOrEqualTo(t3Price);
  const runnerQty = Math.max(1, totalQty - t1ExitQty - (isT2Met ? t2ExitQty : 0));

  const t3Dist = isLong ? t3Price.minus(dLtp) : dLtp.minus(t3Price);
  const t3PlannedRun = isLong ? t3Price.minus(dEntry).abs() : dEntry.minus(t3Price).abs();
  const t3Progress = t3PlannedRun.isZero()
    ? 0
    : Math.min(100, Math.max(0, Number(t1Run.dividedBy(t3PlannedRun).times(100).toFixed(1))));

  let activeStepIndex = 1;
  if (isT2Met) activeStepIndex = 3;
  else if (isT1Met) activeStepIndex = 2;

  const steps: ILiveTargetLadderStep[] = [
    {
      targetIndex: 1,
      name: 'T1 (+1.0R)',
      targetR: 1.0,
      targetPrice: Number(t1Price.toFixed(2)),
      plannedExitRatio: t1ExitRatio,
      plannedExitQty: t1ExitQty,
      suggestedStopLoss: Number(dEntry.toFixed(2)),
      suggestedStopLabel: `Lock BE (₹${Number(dEntry.toFixed(2))})`,
      distancePoints: Number(t1Dist.toFixed(2)),
      distancePercent: Number(t1Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
      progressPercent: t1Progress,
      status: isT1Met ? 'MET' : t1Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
      isActionable: isT1Met,
    },
    {
      targetIndex: 2,
      name: 'T2 (+2.0R)',
      targetR: 2.0,
      targetPrice: Number(t2Price.toFixed(2)),
      plannedExitRatio: 0.33,
      plannedExitQty: t2ExitQty,
      suggestedStopLoss: Number(t1Price.toFixed(2)),
      suggestedStopLabel: `Trail Stop to +1R (₹${Number(t1Price.toFixed(2))})`,
      distancePoints: Number(t2Dist.toFixed(2)),
      distancePercent: Number(t2Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
      progressPercent: t2Progress,
      status: isT2Met ? 'MET' : t2Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
      isActionable: isT2Met,
    },
    {
      targetIndex: 3,
      name: 'Runner (+3.0R)',
      targetR: 3.0,
      targetPrice: Number(t3Price.toFixed(2)),
      plannedExitRatio: 1.0,
      plannedExitQty: runnerQty,
      suggestedStopLoss: Number(t2Price.toFixed(2)),
      suggestedStopLabel: `Trail Behind Swing (₹${Number(t2Price.toFixed(2))})`,
      distancePoints: Number(t3Dist.toFixed(2)),
      distancePercent: Number(t3Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
      progressPercent: t3Progress,
      status: isT3Met ? 'MET' : t3Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
      isActionable: isT3Met,
    },
  ];

  return {
    initialRiskPoints,
    initialRiskAmount: initialRiskAmountVal,
    steps,
    activeStepIndex,
  };
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
    quantity: Number(dQty.toNumber()),
    contractMultiplier: Number(dMultiplier.toNumber()),
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
    giveback: calculateLiveGiveback({
      direction: params.direction,
      currentLtp: dLtp,
      floatingNetPnL,
      unrealizedR,
      previousPeakMfe: params.previousPeakMfe,
    }),
    targetLadder: calculateTargetLadder({
      direction: params.direction,
      entryPrice: dEntry,
      currentLtp: dLtp,
      quantity: dQty,
      contractMultiplier: dMultiplier,
      initialRiskAmount,
      stopLoss: params.stopLoss !== undefined && params.stopLoss !== null ? new Decimal(params.stopLoss) : null,
      plannedTarget: params.target !== undefined && params.target !== null ? new Decimal(params.target) : null,
      tickSize: dTick,
    }),
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
