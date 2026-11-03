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
  ICustomLadderRules,
  IDynamicTrailingRule,
  IGivebackAutoExitRule,
  ILiveDataHealth,
  LiveConnectionState,
  NextActionHintType,
  INextActionHint,
  IPostTradeReviewData,
  ISuggestedMistake,
  INormalizedPulseCheckIn,
} from '@tradevault/shared';
import { calculateLinearPnL } from './pnl.js';
import { calculateIndianCharges, calculateTrueBreakevenPrice } from './charges.js';
import { calculateRealizedRMultiple } from './risk.js';
import { IPositionGreeksSummary } from './options-greeks.js';
import { ITradeStagnationMetric } from './stagnation.js';
import { calculatePortfolioRisk, IPortfolioRiskResult } from './portfolio-risk.js';

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
  lotSize?: number | string | Decimal;
  stopLoss?: number | string | Decimal | null;
  initialStopLoss?: number | string | Decimal | null;
  target?: number | string | Decimal | null;
  plannedTarget?: number | string | Decimal | null;
  plannedRiskAmount?: number | string | Decimal | null;
  tickSize?: number | string | Decimal | null;
  assetClass?: AssetClass;
  marketSegment?: MarketSegment;
  provider?: LiveQuoteProvider;
  asOf?: Date | number;
  customRules?: ICustomLadderRules;
  previousPeakMfe?: {
    peakLtp?: number;
    peakFloatingNetPnL?: number;
    peakUnrealizedR?: number;
  };
  dataHealth?: ILiveDataHealth;
}

export interface ILiveOpenTradeMetric {
  tradeId: string;
  symbol: string;
  direction: Direction;
  quantity: number;
  contractMultiplier?: number;
  lotSize?: number;
  totalLots?: number;
  trueBreakevenPrice?: number;
  nominalBreakevenPrice?: number;
  feeBufferPoints?: number;
  entryPrice: number;
  currentLtp: number;
  priceDeltaPoints: number;
  priceDeltaPercent: number;
  floatingGrossPnL: number;
  estimatedCharges: number;
  floatingNetPnL: number;
  initialRiskAmount: number | null;
  initialStopLoss?: number | null;
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
  asOf: Date | string;
  giveback?: ILiveGivebackMetric;
  targetLadder?: ILiveTargetLadder;
  optionsGreeks?: IPositionGreeksSummary;
  stagnation?: ITradeStagnationMetric;
  underlying?: string;
  sparkline?: Array<{ timestamp: number; pnl: number; r: number; price: number; isLowestMae?: boolean; isPeakMfe?: boolean }>;
  hasRestingBrokerSl?: boolean;
  isNakedPosition?: boolean;
  restingSlOrderId?: string;
  restingSlPrice?: number;
  setupEdgeStats?: {
    setupName?: string;
    totalSampleTrades?: number;
    sampleSize?: number;
    winRate: number;
    avgMfeR: number;
    avgMaeR: number;
    expectancyR: number;
    confidenceLevel: 'HIGH' | 'MODERATE' | 'LOW';
  };
  serverAutoExecutionArmed?: boolean;
  dataHealth?: ILiveDataHealth;
  nextActionHint?: INextActionHint | null;
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
  asOf: Date | string;
  portfolioRisk?: IPortfolioRiskResult;
  dataHealth?: ILiveDataHealth;
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
  dataHealth?: ILiveDataHealth;
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
  entryPrice: Decimal | number;
  currentLtp: Decimal | number;
  quantity?: Decimal | number;
  contractMultiplier?: Decimal | number;
  lotSize?: Decimal | number;
  initialRiskAmount?: Decimal | number | null;
  initialStopLoss?: Decimal | number | null;
  stopLoss: Decimal | number | null;
  plannedTarget?: Decimal | number | null;
  tickSize?: Decimal | number;
  customRules?: ICustomLadderRules;
  estimatedCharges?: Decimal | number;
}): ILiveTargetLadder | undefined {
  const isLong = params.direction === 'LONG';
  const dEntry = params.entryPrice instanceof Decimal ? params.entryPrice : new Decimal(params.entryPrice);
  const dLtp = params.currentLtp instanceof Decimal ? params.currentLtp : new Decimal(params.currentLtp);
  const dQty = params.quantity !== undefined
    ? (params.quantity instanceof Decimal ? params.quantity : new Decimal(params.quantity))
    : new Decimal(1);
  const totalQty = dQty.toNumber();
  const dMult = params.contractMultiplier !== undefined
    ? (params.contractMultiplier instanceof Decimal ? params.contractMultiplier : new Decimal(params.contractMultiplier))
    : new Decimal(1);

  const dLotSize = params.lotSize
    ? (params.lotSize instanceof Decimal ? params.lotSize : new Decimal(params.lotSize))
    : new Decimal(1);
  const lotSizeNum = Math.max(1, dLotSize.toNumber());
  const totalLots = Math.max(1, Math.floor(totalQty / lotSizeNum));
  const dTick = params.tickSize
    ? (params.tickSize instanceof Decimal ? params.tickSize : new Decimal(params.tickSize))
    : new Decimal(0.05);

  const dInitialStopLoss = params.initialStopLoss !== null && params.initialStopLoss !== undefined
    ? (params.initialStopLoss instanceof Decimal ? params.initialStopLoss : new Decimal(params.initialStopLoss))
    : null;
  const dStopLoss = params.stopLoss !== null && params.stopLoss !== undefined
    ? (params.stopLoss instanceof Decimal ? params.stopLoss : new Decimal(params.stopLoss))
    : null;
  const dPlannedTarget = params.plannedTarget !== null && params.plannedTarget !== undefined
    ? (params.plannedTarget instanceof Decimal ? params.plannedTarget : new Decimal(params.plannedTarget))
    : null;
  const dInitialRiskAmount = params.initialRiskAmount !== null && params.initialRiskAmount !== undefined
    ? (params.initialRiskAmount instanceof Decimal ? params.initialRiskAmount : new Decimal(params.initialRiskAmount))
    : null;

  // Determine initial risk in price points.
  // CRITICAL INVARIANT: 1R is anchored to initialStopLoss or initialRiskAmount.
  // Trailed / current stopLoss must ONLY be used as a last-resort fallback if initial metrics are missing.
  let riskPoints = new Decimal(0);
  if (dInitialStopLoss && !dEntry.minus(dInitialStopLoss).isZero()) {
    riskPoints = dEntry.minus(dInitialStopLoss).abs();
  } else if (dInitialRiskAmount && totalQty > 0 && dMult.greaterThan(0)) {
    riskPoints = dInitialRiskAmount.dividedBy(dQty.times(dMult));
  } else if (dStopLoss) {
    riskPoints = dEntry.minus(dStopLoss).abs();
  }

  if (riskPoints.isZero() || totalQty <= 0) {
    return undefined;
  }

  const initialRiskPoints = Number(riskPoints.toFixed(2));
  const initialRiskAmountVal = dInitialRiskAmount
    ? Number(dInitialRiskAmount.toFixed(2))
    : Number(riskPoints.times(dQty).times(dMult).toFixed(2));

  // Calculate True Breakeven (with estimated fees/taxes protected)
  let trueBePrice: number | undefined;
  let feeBufferPts: number | undefined;
  if (params.estimatedCharges) {
    const beRes = calculateTrueBreakevenPrice({
      direction: params.direction,
      entryPrice: dEntry,
      quantity: dQty,
      contractMultiplier: dMult,
      estimatedCharges: params.estimatedCharges,
      tickSize: dTick,
    });
    trueBePrice = beRes.trueBreakevenPrice;
    feeBufferPts = beRes.feeBufferPoints;
  }

  const rules = params.customRules;
  const t1TargetR = rules?.t1?.targetR ?? 1.0;
  const t2TargetR = rules?.t2?.targetR ?? 2.0;
  const t3TargetR = rules?.t3?.targetR ?? 3.0;

  // T1: Target 1
  const t1RiskPoints = riskPoints.times(t1TargetR);
  const t1Price = isLong ? dEntry.plus(t1RiskPoints) : dEntry.minus(t1RiskPoints);
  const isT1Met = isLong ? dLtp.greaterThanOrEqualTo(t1Price) : dLtp.lessThanOrEqualTo(t1Price);

  let t1ExitLots = 1;
  let t1ExitRatio = totalLots > 2 ? 0.33 : 0.5;
  if (totalLots > 1) {
    if (rules?.t1?.customLots && rules.t1.customLots > 0) {
      t1ExitLots = Math.min(totalLots - 1, rules.t1.customLots);
      t1ExitRatio = Number((t1ExitLots / totalLots).toFixed(2));
    } else {
      t1ExitRatio = rules?.t1?.exitRatio ?? (totalLots >= 3 ? 0.33 : 0.5);
      t1ExitLots = Math.max(1, Math.min(totalLots - 1, Math.round(totalLots * t1ExitRatio)));
    }
  }
  const t1ExitQty = totalLots > 1 ? t1ExitLots * lotSizeNum : totalQty;

  const t1Dist = isLong ? t1Price.minus(dLtp) : dLtp.minus(t1Price);
  const t1Run = isLong ? dLtp.minus(dEntry) : dEntry.minus(dLtp);
  const t1Progress = Math.min(100, Math.max(0, Number(t1Run.dividedBy(t1RiskPoints).times(100).toFixed(1))));

  let t1StopLoss = Number(dEntry.toFixed(2));
  let t1StopLabel = `Lock BE (₹${t1StopLoss})`;
  if (rules?.t1?.trailAction === 'TRUE_BE_WITH_FEES' && trueBePrice) {
    t1StopLoss = trueBePrice;
    t1StopLabel = `Lock True BE + Fees (₹${trueBePrice})`;
  } else if (rules?.t1?.trailAction === 'CUSTOM_POINTS' && rules.t1.trailPoints) {
    const pts = new Decimal(rules.t1.trailPoints);
    const sl = isLong ? dEntry.plus(pts) : dEntry.minus(pts);
    t1StopLoss = Number(sl.toFixed(2));
    t1StopLabel = `Trail +${rules.t1.trailPoints} pts (₹${t1StopLoss})`;
  } else if (rules?.t1?.trailAction === 'NOMINAL_BE') {
    t1StopLoss = Number(dEntry.toFixed(2));
    t1StopLabel = `Lock BE (₹${t1StopLoss})`;
  }

  const isT1AllOut = t1ExitRatio >= 1.0;
  const t2Enabled = !isT1AllOut && (rules?.t2 ? rules.t2.enabled !== false : true);
  const isRunnerFree = rules?.t3?.isFreeRunner === true;
  const t3Enabled = !isT1AllOut && (rules?.t3 ? rules.t3.enabled !== false : true);

  // T2: Target 2
  const t2RiskPoints = riskPoints.times(t2TargetR);
  const t2Price = isLong ? dEntry.plus(t2RiskPoints) : dEntry.minus(t2RiskPoints);
  const isT2Met = isLong ? dLtp.greaterThanOrEqualTo(t2Price) : dLtp.lessThanOrEqualTo(t2Price);

  const remLotsAfterT1 = Math.max(0, totalLots - t1ExitLots);
  let t2ExitLots = 0;
  let t2ExitRatio = 0.5;
  if (remLotsAfterT1 > 1) {
    if (rules?.t2?.customLots && rules.t2.customLots > 0) {
      t2ExitLots = Math.min(remLotsAfterT1 - 1, rules.t2.customLots);
      t2ExitRatio = Number((t2ExitLots / remLotsAfterT1).toFixed(2));
    } else {
      t2ExitRatio = rules?.t2?.exitRatio ?? 0.5;
      t2ExitLots = Math.max(1, Math.min(remLotsAfterT1 - 1, Math.round(remLotsAfterT1 * t2ExitRatio)));
    }
  } else if (remLotsAfterT1 === 1) {
    t2ExitLots = 1;
    t2ExitRatio = 1.0;
  }
  const t2ExitQty = totalLots > 1 ? Math.max(1, t2ExitLots * lotSizeNum) : totalQty;

  const t2Dist = isLong ? t2Price.minus(dLtp) : dLtp.minus(t2Price);
  const t2Progress = Math.min(100, Math.max(0, Number(t1Run.dividedBy(t2RiskPoints).times(100).toFixed(1))));

  let t2StopLoss = Number(t1Price.toFixed(2));
  let t2StopLabel = `Trail Stop to +${t1TargetR}R (₹${t2StopLoss})`;
  if (rules?.t2?.trailAction === 'CUSTOM_POINTS' && rules.t2.trailPoints) {
    const pts = new Decimal(rules.t2.trailPoints);
    const sl = isLong ? dEntry.plus(pts) : dEntry.minus(pts);
    t2StopLoss = Number(sl.toFixed(2));
    t2StopLabel = `Trail +${rules.t2.trailPoints} pts (₹${t2StopLoss})`;
  }

  // T3: Runner (Free Move or Fixed Target)
  const t3RiskPoints = riskPoints.times(t3TargetR);
  const t3Price = dPlannedTarget && !dPlannedTarget.isZero()
    ? dPlannedTarget
    : isLong ? dEntry.plus(t3RiskPoints) : dEntry.minus(t3RiskPoints);
  const isT3Met = isLong ? dLtp.greaterThanOrEqualTo(t3Price) : dLtp.lessThanOrEqualTo(t3Price);
  const runnerLots = rules?.t3?.customLots && rules.t3.customLots > 0
    ? rules.t3.customLots
    : (t2Enabled
      ? Math.max(1, totalLots - t1ExitLots - t2ExitLots)
      : Math.max(1, totalLots - t1ExitLots));
  const runnerQty = totalLots > 1
    ? runnerLots * lotSizeNum
    : Math.max(1, totalQty - t1ExitQty - (t2Enabled ? t2ExitQty : 0));

  const t3Dist = isLong ? t3Price.minus(dLtp) : dLtp.minus(t3Price);
  const t3PlannedRun = isLong ? t3Price.minus(dEntry).abs() : dEntry.minus(t3Price).abs();
  const t3Progress = t3PlannedRun.isZero()
    ? 0
    : Math.min(100, Math.max(0, Number(t1Run.dividedBy(t3PlannedRun).times(100).toFixed(1))));

  const steps: ILiveTargetLadderStep[] = [];

  // Step 1: Target 1 (R1)
  steps.push({
    targetIndex: 1,
    name: `T1 (+${t1TargetR.toFixed(1)}R)`,
    targetR: t1TargetR,
    targetPrice: Number(t1Price.toFixed(2)),
    plannedExitRatio: t1ExitRatio,
    plannedExitQty: t1ExitQty,
    plannedExitLots: totalLots > 1 ? t1ExitLots : 1,
    lotSize: lotSizeNum,
    suggestedStopLoss: t1StopLoss,
    suggestedStopLabel: t1StopLabel,
    distancePoints: Number(t1Dist.toFixed(2)),
    distancePercent: Number(t1Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
    progressPercent: t1Progress,
    status: isT1Met ? 'MET' : t1Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
    isActionable: isT1Met,
  });

  // Step 2: Target 2 (R2) if enabled
  if (t2Enabled) {
    steps.push({
      targetIndex: steps.length + 1,
      name: `T2 (+${t2TargetR.toFixed(1)}R)`,
      targetR: t2TargetR,
      targetPrice: Number(t2Price.toFixed(2)),
      plannedExitRatio: t2ExitRatio,
      plannedExitQty: t2ExitQty,
      plannedExitLots: totalLots > 1 ? t2ExitLots : 1,
      lotSize: lotSizeNum,
      suggestedStopLoss: t2StopLoss,
      suggestedStopLabel: t2StopLabel,
      distancePoints: Number(t2Dist.toFixed(2)),
      distancePercent: Number(t2Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
      progressPercent: t2Progress,
      status: isT2Met ? 'MET' : t2Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
      isActionable: isT2Met,
    });
  }

  // Step 3 (or 2): Runner (Free Move or Fixed Target)
  if (t3Enabled) {
    if (isRunnerFree) {
      steps.push({
        targetIndex: steps.length + 1,
        name: 'Runner (Free Move)',
        targetR: 0,
        targetPrice: 0,
        plannedExitRatio: 1.0,
        plannedExitQty: runnerQty,
        plannedExitLots: totalLots > 1 ? runnerLots : 1,
        lotSize: lotSizeNum,
        suggestedStopLoss: t2Enabled ? Number(t2Price.toFixed(2)) : t1StopLoss,
        suggestedStopLabel: `Open Trail (SL: ₹${t2Enabled ? Number(t2Price.toFixed(2)) : t1StopLoss})`,
        distancePoints: 0,
        distancePercent: 0,
        progressPercent: isT1Met ? 100 : 0,
        status: isT1Met ? 'IN_PROGRESS' : 'PENDING',
        isActionable: isT1Met,
        isFreeRunner: true,
      });
    } else {
      steps.push({
        targetIndex: steps.length + 1,
        name: `Runner (+${t3TargetR.toFixed(1)}R)`,
        targetR: t3TargetR,
        targetPrice: Number(t3Price.toFixed(2)),
        plannedExitRatio: 1.0,
        plannedExitQty: runnerQty,
        plannedExitLots: totalLots > 1 ? runnerLots : 1,
        lotSize: lotSizeNum,
        suggestedStopLoss: Number(t2Price.toFixed(2)),
        suggestedStopLabel: `Trail Behind Swing (₹${Number(t2Price.toFixed(2))})`,
        distancePoints: Number(t3Dist.toFixed(2)),
        distancePercent: Number(t3Dist.dividedBy(dLtp).abs().times(100).toFixed(2)),
        progressPercent: t3Progress,
        status: isT3Met ? 'MET' : t3Progress > 0 ? 'IN_PROGRESS' : 'PENDING',
        isActionable: isT3Met,
      });
    }
  }

  let activeStepIndex = 1;
  if (t2Enabled && isT2Met) {
    activeStepIndex = steps.length;
  } else if (isT1Met) {
    activeStepIndex = Math.min(2, steps.length);
  }

  return {
    initialRiskPoints,
    initialRiskAmount: initialRiskAmountVal,
    lotSize: lotSizeNum,
    totalLots,
    trueBreakevenPrice: trueBePrice,
    nominalBreakevenPrice: Number(dEntry.toFixed(2)),
    feeBufferPoints: feeBufferPts,
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
      direction: params.direction,
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
  const effectiveStopLoss = params.stopLoss !== undefined && params.stopLoss !== null
    ? params.stopLoss
    : params.initialStopLoss;
  const effectiveTarget = params.target !== undefined && params.target !== null
    ? params.target
    : params.plannedTarget;

  let initialRiskAmount: Decimal | null = null;
  if (params.initialStopLoss !== undefined && params.initialStopLoss !== null) {
    const dStop = new Decimal(params.initialStopLoss);
    const stopDistance = dEntry.minus(dStop).abs();
    if (!stopDistance.isZero()) {
      initialRiskAmount = stopDistance.times(dQty).times(dMultiplier);
    }
  }

  if (!initialRiskAmount && params.plannedRiskAmount !== undefined && params.plannedRiskAmount !== null && Number(params.plannedRiskAmount) > 0) {
    initialRiskAmount = new Decimal(params.plannedRiskAmount);
  } else if (!initialRiskAmount && effectiveStopLoss !== undefined && effectiveStopLoss !== null) {
    const dStop = new Decimal(effectiveStopLoss);
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

  if (effectiveStopLoss !== undefined && effectiveStopLoss !== null) {
    const dStop = new Decimal(effectiveStopLoss);

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

  if (effectiveTarget !== undefined && effectiveTarget !== null) {
    const dTarget = new Decimal(effectiveTarget);

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

    // 6. Compute True Breakeven (with charges & fees covered)
    const dLotSize = params.lotSize ? new Decimal(params.lotSize) : new Decimal(1);
    const lotSizeNum = Math.max(1, dLotSize.toNumber());
    const totalLots = Math.max(1, Math.floor(dQty.toNumber() / lotSizeNum));

    const beRes = calculateTrueBreakevenPrice({
      direction: params.direction,
      entryPrice: dEntry,
      quantity: dQty,
      contractMultiplier: dMultiplier,
      estimatedCharges,
      tickSize: dTick,
    });

    const targetLadder = calculateTargetLadder({
      direction: params.direction,
      entryPrice: dEntry,
      currentLtp: dLtp,
      quantity: dQty,
      contractMultiplier: dMultiplier,
      lotSize: dLotSize,
      initialRiskAmount,
      initialStopLoss: params.initialStopLoss !== undefined && params.initialStopLoss !== null ? new Decimal(params.initialStopLoss) : null,
      stopLoss: params.stopLoss !== undefined && params.stopLoss !== null ? new Decimal(params.stopLoss) : null,
      plannedTarget: params.target !== undefined && params.target !== null ? new Decimal(params.target) : null,
      tickSize: dTick,
      customRules: params.customRules,
      estimatedCharges,
    });

    const metric: ILiveOpenTradeMetric = {
      tradeId: params.tradeId,
      symbol: params.symbol,
      direction: params.direction,
      quantity: Number(dQty.toNumber()),
      contractMultiplier: Number(dMultiplier.toNumber()),
      lotSize: lotSizeNum,
      totalLots,
      trueBreakevenPrice: beRes.trueBreakevenPrice,
      nominalBreakevenPrice: beRes.nominalBreakevenPrice,
      feeBufferPoints: beRes.feeBufferPoints,
      entryPrice: Number(dEntry.toFixed(2)),
      currentLtp: Number(dLtp.toFixed(2)),
      priceDeltaPoints: Number(priceDeltaPoints.toFixed(2)),
      priceDeltaPercent: Number(priceDeltaPercent.toFixed(2)),
      floatingGrossPnL: Number(floatingGrossPnL.toFixed(2)),
      estimatedCharges: Number(estimatedCharges.toFixed(2)),
      floatingNetPnL: Number(floatingNetPnL.toFixed(2)),
      initialRiskAmount: initialRiskAmount ? Number(initialRiskAmount.toFixed(2)) : null,
      initialStopLoss: params.initialStopLoss !== undefined && params.initialStopLoss !== null ? Number(new Decimal(params.initialStopLoss).toFixed(2)) : null,
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
      targetLadder,
      dataHealth: params.dataHealth,
    };

    metric.nextActionHint = selectNextActionHint(metric);

    return metric;
}

/**
 * Deterministically selects ONE high-conviction next-action hint for an open trade.
 * Priority hierarchy:
 * 1. Stop loss BREACHED (Highest priority emergency exit)
 * 2. Stop loss CRITICAL (Immediate risk mitigation)
 * 3. CRITICAL_REVERSAL (Severe giveback from >= 1R peak)
 * 4. Ladder Step MET (Take profit scale-out milestone)
 * 5. PROFIT_LEAKING (35%+ giveback from peak)
 * 6. TRADE_STAGNANT (Theta burn / time stop suggestion)
 * Returns null if no action is triggered.
 */
export function selectNextActionHint(metric: ILiveOpenTradeMetric): INextActionHint | null {
  // Priority 1: Stop Breached
  if (metric.stopThreatLevel === 'BREACHED') {
    return {
      type: 'STOP_BREACHED',
      priority: 1,
      label: 'Stop Loss Breached',
      description: 'LTP has breached your stop loss level. Exit immediately to prevent uncontrolled slippage.',
      actionText: 'Market Exit 100%',
      severity: 'error',
      dialogType: 'CLOSE_ALL',
      dialogPayload: {
        suggestedExitRatio: 1.0,
        recommendedReason: 'STOP_BREACHED',
      },
    };
  }

  // Priority 2: Stop Threat Critical
  if (metric.stopThreatLevel === 'CRITICAL') {
    const pts = metric.distanceToStopPoints !== null ? `${metric.distanceToStopPoints.toFixed(1)} pts` : 'few ticks';
    return {
      type: 'STOP_CRITICAL',
      priority: 2,
      label: 'Stop Loss Critical',
      description: `LTP is within ${pts} of Stop Loss (${metric.stopLoss}). Cut early to save slippage or confirm broker SL.`,
      actionText: 'Cut Position Now',
      severity: 'error',
      dialogType: 'CLOSE_ALL',
      dialogPayload: {
        suggestedExitRatio: 1.0,
        recommendedReason: 'STOP_CRITICAL',
      },
    };
  }

  // Priority 3: Critical Giveback Reversal
  if (metric.giveback?.threatLevel === 'CRITICAL_REVERSAL') {
    const peakR = metric.giveback.peakUnrealizedR.toFixed(2);
    const curR = (metric.unrealizedR ?? 0).toFixed(2);
    return {
      type: 'CRITICAL_REVERSAL',
      priority: 3,
      label: 'Critical Giveback Reversal',
      description: `Peak +${peakR}R collapsed to +${curR}R. Protect capital before trade turns negative.`,
      actionText: 'Flatten Trade Now',
      severity: 'error',
      dialogType: 'CLOSE_ALL',
      dialogPayload: {
        suggestedExitRatio: 1.0,
        recommendedReason: 'CRITICAL_REVERSAL',
      },
    };
  }

  // Priority 4: Target Ladder Step Met
  if (metric.targetLadder?.steps && metric.targetLadder.steps.length > 0) {
    const metStep = metric.targetLadder.steps.find((s) => s.status === 'MET');
    if (metStep) {
      const stepKey = metStep.targetIndex === 1 ? 't1' : metStep.targetIndex === 2 ? 't2' : 't3';
      const pctStr = `${Math.round(metStep.plannedExitRatio * 100)}%`;
      return {
        type: 'LADDER_STEP_MET',
        priority: 4,
        label: `${metStep.name} Target Met`,
        description: `LTP reached ₹${metStep.targetPrice.toLocaleString('en-IN')}. Book ${pctStr} and ${metStep.suggestedStopLabel}.`,
        actionText: `Execute ${metStep.name} (${pctStr})`,
        severity: 'warning',
        dialogType: 'PARTIAL_LADDER',
        dialogPayload: {
          ladderStep: stepKey,
          suggestedExitRatio: metStep.plannedExitRatio,
          suggestedNewStopLoss: metStep.suggestedStopLoss,
          recommendedReason: 'LADDER_STEP_MET',
        },
      };
    }
  }

  // Priority 5: Profit Leaking
  if (metric.giveback?.threatLevel === 'LEAKING') {
    return {
      type: 'PROFIT_LEAKING',
      priority: 5,
      label: `Profit Leaking (-${metric.giveback.givebackPercent}%)`,
      description: `Gave back ₹${metric.giveback.givebackAmount.toLocaleString('en-IN')} (${metric.giveback.givebackPercent}%) from +${metric.giveback.peakUnrealizedR.toFixed(2)}R peak. Lock profit!`,
      actionText: 'Book 50% Partial',
      severity: 'warning',
      dialogType: 'CLOSE_ALL',
      dialogPayload: {
        suggestedExitRatio: 0.5,
        recommendedReason: 'PROFIT_LEAKING',
      },
    };
  }

  // Priority 6: Stagnation
  if (metric.stagnation && (metric.stagnation.isStagnant || metric.stagnation.timeStopSuggested)) {
    return {
      type: 'TRADE_STAGNANT',
      priority: 6,
      label: 'Trade Stagnant (Time Decay)',
      description: metric.stagnation.message || `No momentum for ${metric.stagnation.minutesSincePeakMfe} mins. Free capital for higher-velocity setups.`,
      actionText: 'Review Time Exit',
      severity: 'info',
      dialogType: 'CLOSE_ALL',
      dialogPayload: {
        suggestedExitRatio: 1.0,
        recommendedReason: 'TRADE_STAGNANT',
      },
    };
  }

  return null;
}

/**
 * Aggregates individual live open trade metrics into a high-level summary.
 */
export function calculateLiveWatcherSummary(
  positions: ILiveOpenTradeMetric[],
  asOf: Date = new Date(),
  dataHealth?: ILiveDataHealth
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

  const portfolioRisk = calculatePortfolioRisk(
    positions.map((p) => ({
      tradeId: p.tradeId,
      symbol: p.symbol,
      underlying: p.underlying || p.symbol,
      direction: p.direction,
      quantity: p.quantity,
      contractMultiplier: p.contractMultiplier ?? 1,
      floatingNetPnL: p.floatingNetPnL,
      unrealizedR: p.unrealizedR,
      cashDeltaSensitivity: p.optionsGreeks?.cashDeltaSensitivity,
      thetaHourlyDecay: p.optionsGreeks?.positionThetaHourly,
      isOption: Boolean(p.optionsGreeks),
      optionType: p.optionsGreeks ? (p.optionsGreeks.unitGreeks.delta >= 0 ? 'CALL' : 'PUT') : undefined,
    }))
  );

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
    portfolioRisk,
    dataHealth,
  };
}

export interface IDynamicTrailingEvaluation {
  shouldTrail: boolean;
  newStopPrice: number;
  reason: string;
  lockedR?: number;
}

/**
 * Evaluates dynamic trailing stop rules (Step-R or High-Water Mark points).
 * Uses Decimal.js for exact 30-digit precision.
 */
export function calculateDynamicTrailingStop(params: {
  direction: Direction;
  entryPrice: number | Decimal;
  currentLtp: number | Decimal;
  peakLtp: number | Decimal;
  currentStopLoss: number | Decimal | null;
  initialRiskPoints: number | Decimal;
  rule: IDynamicTrailingRule;
}): IDynamicTrailingEvaluation {
  const { direction, rule } = params;
  if (!rule || !rule.enabled) {
    return { shouldTrail: false, newStopPrice: 0, reason: 'Rule disabled' };
  }

  const isLong = direction === 'LONG';
  const dEntry = params.entryPrice instanceof Decimal ? params.entryPrice : new Decimal(params.entryPrice);
  const dLtp = params.currentLtp instanceof Decimal ? params.currentLtp : new Decimal(params.currentLtp);
  const dPeak = params.peakLtp instanceof Decimal ? params.peakLtp : new Decimal(params.peakLtp);
  const dCurrentStop = params.currentStopLoss !== null && params.currentStopLoss !== undefined
    ? (params.currentStopLoss instanceof Decimal ? params.currentStopLoss : new Decimal(params.currentStopLoss))
    : null;
  const dRiskPts = params.initialRiskPoints instanceof Decimal
    ? params.initialRiskPoints
    : new Decimal(params.initialRiskPoints);

  if (dRiskPts.isZero() || dRiskPts.isNegative()) {
    return { shouldTrail: false, newStopPrice: 0, reason: 'Invalid risk points' };
  }

  const triggerR = new Decimal(rule.triggerR ?? 1.5);
  const triggerPoints = dRiskPts.times(triggerR);

  // Peak excursion in points
  const peakGainPts = isLong ? dPeak.minus(dEntry) : dEntry.minus(dPeak);
  if (peakGainPts.lessThan(triggerPoints)) {
    return {
      shouldTrail: false,
      newStopPrice: 0,
      reason: `Peak gain (${peakGainPts.toFixed(2)} pts) below activation threshold (${triggerPoints.toFixed(2)} pts / ${triggerR}R)`,
    };
  }

  let dCandidateStop: Decimal;
  let reason = '';
  let lockedR: number | undefined;

  if (rule.trailType === 'HIGH_WATER_POINTS') {
    const pts = new Decimal(rule.trailPoints && rule.trailPoints > 0 ? rule.trailPoints : dRiskPts);
    dCandidateStop = isLong ? dPeak.minus(pts) : dPeak.plus(pts);
    reason = `Trailing ${pts.toFixed(2)} pts behind high-water mark ₹${dPeak.toFixed(2)}`;
  } else {
    // STEP_R mode (e.g., at +1.5R lock +1.0R, at +2.0R lock +1.5R)
    const stepR = new Decimal(rule.trailStepR && rule.trailStepR > 0 ? rule.trailStepR : 0.5);
    const currentPeakR = peakGainPts.dividedBy(dRiskPts);
    const stepsAbove = currentPeakR.minus(triggerR).dividedBy(stepR).floor();
    const targetLockedR = triggerR.minus(stepR).plus(stepsAbove.times(stepR));
    lockedR = Number(targetLockedR.toFixed(2));

    const lockPoints = dRiskPts.times(targetLockedR);
    dCandidateStop = isLong ? dEntry.plus(lockPoints) : dEntry.minus(lockPoints);
    reason = `Locked +${lockedR}R step trail at ₹${dCandidateStop.toFixed(2)} (Peak MFE: +${currentPeakR.toFixed(2)}R)`;
  }

  const candidateStopNum = Number(dCandidateStop.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2));

  // Verify candidate stop strictly tightens risk
  if (dCurrentStop) {
    if (isLong && dCandidateStop.lessThanOrEqualTo(dCurrentStop)) {
      return {
        shouldTrail: false,
        newStopPrice: candidateStopNum,
        reason: `Candidate stop (₹${candidateStopNum}) is not higher than current stop (₹${dCurrentStop.toFixed(2)})`,
      };
    }
    if (!isLong && dCandidateStop.greaterThanOrEqualTo(dCurrentStop)) {
      return {
        shouldTrail: false,
        newStopPrice: candidateStopNum,
        reason: `Candidate stop (₹${candidateStopNum}) is not lower than current stop (₹${dCurrentStop.toFixed(2)})`,
      };
    }
  }

  return {
    shouldTrail: true,
    newStopPrice: candidateStopNum,
    reason,
    lockedR,
  };
}

export interface IGivebackAutoExitEvaluation {
  shouldExit: boolean;
  reason: string;
}

/**
 * Evaluates Giveback protection rule to automatically trigger exit when
 * a high-MFE trade surrenders too much profit.
 */
export function evaluateGivebackAutoExit(params: {
  giveback?: ILiveGivebackMetric;
  rule?: IGivebackAutoExitRule;
}): IGivebackAutoExitEvaluation {
  const { giveback, rule } = params;
  if (!rule || !rule.enabled || !giveback) {
    return { shouldExit: false, reason: 'Giveback rule disabled or no giveback metric' };
  }

  const minPeakR = rule.minPeakR ?? 1.5;
  const maxGivebackPercent = rule.maxGivebackPercent ?? 40;

  if (giveback.peakUnrealizedR < minPeakR) {
    return {
      shouldExit: false,
      reason: `Peak MFE (+${giveback.peakUnrealizedR.toFixed(2)}R) did not reach minimum +${minPeakR}R requirement`,
    };
  }

  if (giveback.givebackPercent >= maxGivebackPercent || giveback.threatLevel === 'CRITICAL_REVERSAL') {
    return {
      shouldExit: true,
      reason: `Giveback reached ${giveback.givebackPercent.toFixed(1)}% (Threshold: ${maxGivebackPercent}%) from peak +${giveback.peakUnrealizedR.toFixed(2)}R MFE`,
    };
  }

  return {
    shouldExit: false,
    reason: `Giveback ${giveback.givebackPercent.toFixed(1)}% within acceptable threshold (${maxGivebackPercent}%)`,
  };
}

export interface IEvaluateDataHealthParams {
  provider: LiveQuoteProvider;
  lastTickAt?: Date | number | string | null;
  asOf?: Date | number | string;
  isMarketOpen?: boolean;
  staleThresholdSeconds?: number;
  tokenExpiresAt?: Date | number | string | null;
  hasActiveBrokerConnection?: boolean;
}

/**
 * Pure evaluation of data freshness, token expiration, and broker order execution eligibility.
 */
export function evaluateDataHealth(params: IEvaluateDataHealthParams): ILiveDataHealth {
  const asOfTime = params.asOf ? new Date(params.asOf) : new Date();
  const nowMs = asOfTime.getTime();

  // 1. Token expiration check
  let isTokenExpired = false;
  let tokenRemainingSeconds: number | undefined;
  let tokenExpiresDate: Date | undefined;

  if (params.tokenExpiresAt) {
    tokenExpiresDate = new Date(params.tokenExpiresAt);
    if (!isNaN(tokenExpiresDate.getTime())) {
      const diffSec = Math.floor((tokenExpiresDate.getTime() - nowMs) / 1000);
      tokenRemainingSeconds = Math.max(0, diffSec);
      isTokenExpired = diffSec <= 0;
    }
  }

  // 2. Tick Age calculation
  let tickAgeMs = 0;
  let lastTickDate: Date | undefined;
  if (params.lastTickAt) {
    lastTickDate = new Date(params.lastTickAt);
    if (!isNaN(lastTickDate.getTime())) {
      tickAgeMs = Math.max(0, nowMs - lastTickDate.getTime());
    }
  }

  const thresholdSec = params.staleThresholdSeconds ?? 10;
  const thresholdMs = thresholdSec * 1000;
  const isMarketOpen = params.isMarketOpen !== false;

  // 3. Connection State resolution
  let connectionState: LiveConnectionState = 'LIVE';
  let isStale = false;

  if (params.provider === 'SIMULATED') {
    connectionState = isMarketOpen ? 'LIVE' : 'MARKET_CLOSED';
    isStale = false;
  } else {
    // FYERS / Real Broker
    if (params.hasActiveBrokerConnection === false || isTokenExpired) {
      connectionState = 'DISCONNECTED';
      isStale = true;
    } else if (!isMarketOpen) {
      connectionState = 'MARKET_CLOSED';
      isStale = false;
    } else if (tickAgeMs > thresholdMs) {
      connectionState = 'STALE';
      isStale = true;
    } else if (tickAgeMs > 3000) {
      connectionState = 'DELAYED';
      isStale = false;
    } else {
      connectionState = 'LIVE';
      isStale = false;
    }
  }

  // 4. Broker Execution Blocked Reason
  let brokerExecutionBlockedReason: string | null = null;
  if (params.provider === 'SIMULATED') {
    brokerExecutionBlockedReason = 'Broker execution blocked: Simulated demo quotes active (Journal mode only)';
  } else if (isTokenExpired) {
    brokerExecutionBlockedReason = 'Broker execution blocked: FYERS broker session token has expired';
  } else if (connectionState === 'DISCONNECTED') {
    brokerExecutionBlockedReason = 'Broker execution blocked: Broker connection is disconnected';
  } else if (isStale) {
    brokerExecutionBlockedReason = `Broker execution blocked: Quote feed is stale (${(tickAgeMs / 1000).toFixed(1)}s old > ${thresholdSec}s threshold)`;
  }

  const tickAgeSeconds = Number((tickAgeMs / 1000).toFixed(1));
  const canExecuteBroker = brokerExecutionBlockedReason === null;

  let tokenCountdownStr: string | null = null;
  let tokenRemainingMinutes: number | null = null;
  let tokenRemainingMs: number | null = null;
  if (tokenRemainingSeconds !== undefined) {
    tokenRemainingMs = tokenRemainingSeconds * 1000;
    tokenRemainingMinutes = Math.floor(tokenRemainingSeconds / 60);
    const hrs = Math.floor(tokenRemainingSeconds / 3600);
    const mins = Math.floor((tokenRemainingSeconds % 3600) / 60);
    tokenCountdownStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  }

  return {
    provider: params.provider,
    connectionState,
    lastTickAt: lastTickDate ? lastTickDate.toISOString() : null,
    tickAgeMs,
    tickAgeSeconds,
    isStale,
    staleThresholdSeconds: thresholdSec,
    tokenExpiresAt: tokenExpiresDate ? tokenExpiresDate.toISOString() : null,
    tokenRemainingMs,
    tokenRemainingMinutes,
    tokenRemainingSeconds,
    tokenCountdownStr,
    isTokenExpired,
    isMarketOpen,
    canExecuteBroker,
    brokerExecutionBlockedReason,
  };
}

export interface IPreFlightExecutionPreviewParams {
  entryPrice: number | string | Decimal;
  currentLtp: number | string | Decimal;
  totalOpenQuantity: number | string | Decimal;
  exitQuantity: number | string | Decimal;
  direction: Direction;
  contractMultiplier?: number | string | Decimal;
  lotSize?: number | string | Decimal;
  initialStopLoss?: number | string | Decimal | null;
  currentStopLoss?: number | string | Decimal | null;
  newStopLoss?: number | string | Decimal | null;
  initialRiskAmount?: number | string | Decimal | null;
  assetClass?: AssetClass;
  marketSegment?: MarketSegment;
  slippageGuardPercent?: number; // default 0.5%
  referencePrice?: number | string | Decimal;
}

export interface IPreFlightExecutionPreviewResult {
  exitQuantity: number;
  exitLots: number;
  remainingQuantity: number;
  remainingLots: number;
  isFullClose: boolean;
  estimatedFillPrice: number;
  priceDeltaPoints: number;
  grossPnL: number;
  estimatedCharges: number;
  netPnL: number;
  realizedR: number | null;
  initialRiskAmount: number | null;
  newStopLevel: number | null;
  isSlippageWarning: boolean;
  slippagePercent: number;
  slippageMessage?: string;
}

/**
 * Computes exact pre-flight financial outcome preview for closing or scaling out of a live position
 * using 30-digit Decimal.js precision and statutory Indian regulatory charges.
 */
export function calculatePreFlightExecutionPreview(
  params: IPreFlightExecutionPreviewParams
): IPreFlightExecutionPreviewResult {
  const dEntry = new Decimal(params.entryPrice);
  const dLtp = new Decimal(params.currentLtp);
  const dTotalQty = new Decimal(params.totalOpenQuantity);
  const dExitQty = new Decimal(params.exitQuantity);
  const dMultiplier = new Decimal(params.contractMultiplier ?? 1);
  const dLotSize = new Decimal(params.lotSize ?? 1);

  if (dExitQty.isNegative() || dExitQty.isZero()) {
    throw new Error('Exit quantity must be greater than zero');
  }

  const clampedExitQty = Decimal.min(dExitQty, dTotalQty);
  const remainingQty = Decimal.max(new Decimal(0), dTotalQty.minus(clampedExitQty));
  const isFullClose = remainingQty.isZero();

  const isLong = params.direction === 'LONG';
  const priceDelta = isLong ? dLtp.minus(dEntry) : dEntry.minus(dLtp);
  const grossPnL = priceDelta.times(clampedExitQty).times(dMultiplier);

  const charges = calculateIndianCharges({
    direction: params.direction,
    assetClass: params.assetClass || 'EQUITY',
    marketSegment: params.marketSegment || 'NSE_EQ',
    entryPrice: dEntry,
    exitPrice: dLtp,
    quantity: clampedExitQty,
    contractMultiplier: dMultiplier,
  });

  const netPnL = grossPnL.minus(charges.totalCostsDecimal);

  // Initial risk budget calculation for proportional realized R
  let dInitialRiskBudget: Decimal | null = null;
  if (params.initialRiskAmount !== undefined && params.initialRiskAmount !== null) {
    const rawRisk = new Decimal(params.initialRiskAmount);
    if (rawRisk.greaterThan(0)) {
      dInitialRiskBudget = dTotalQty.greaterThan(0)
        ? rawRisk.times(clampedExitQty).dividedBy(dTotalQty)
        : rawRisk;
    }
  } else if (params.initialStopLoss !== undefined && params.initialStopLoss !== null) {
    const dInitStop = new Decimal(params.initialStopLoss);
    const stopDistance = dEntry.minus(dInitStop).abs();
    if (stopDistance.greaterThan(0)) {
      dInitialRiskBudget = stopDistance.times(clampedExitQty).times(dMultiplier);
    }
  }

  let realizedR: number | null = null;
  if (dInitialRiskBudget && dInitialRiskBudget.greaterThan(0)) {
    realizedR = Number(netPnL.dividedBy(dInitialRiskBudget).toFixed(2));
  }

  // Slippage check
  let isSlippageWarning = false;
  let slippagePercent = 0;
  let slippageMessage: string | undefined;

  if (params.referencePrice !== undefined && params.referencePrice !== null) {
    const dRef = new Decimal(params.referencePrice);
    if (dRef.greaterThan(0)) {
      const dev = dLtp.minus(dRef).abs().dividedBy(dRef).times(100);
      slippagePercent = Number(dev.toFixed(2));
      const guard = params.slippageGuardPercent ?? 0.5;
      if (slippagePercent > guard) {
        isSlippageWarning = true;
        slippageMessage = `Price shifted ${slippagePercent}% (from ₹${dRef.toFixed(2)} to ₹${dLtp.toFixed(2)}), exceeding ${guard}% slippage guard`;
      }
    }
  }

  const exitLots = dLotSize.greaterThan(1)
    ? Math.max(1, Math.round(clampedExitQty.dividedBy(dLotSize).toNumber()))
    : clampedExitQty.toNumber();
  const remainingLots = dLotSize.greaterThan(1)
    ? Math.max(0, Math.floor(remainingQty.dividedBy(dLotSize).toNumber()))
    : remainingQty.toNumber();

  return {
    exitQuantity: clampedExitQty.toNumber(),
    exitLots,
    remainingQuantity: remainingQty.toNumber(),
    remainingLots,
    isFullClose,
    estimatedFillPrice: Number(dLtp.toFixed(2)),
    priceDeltaPoints: Number(priceDelta.toFixed(2)),
    grossPnL: Number(grossPnL.toFixed(2)),
    estimatedCharges: charges.totalCosts,
    netPnL: Number(netPnL.toFixed(2)),
    realizedR,
    initialRiskAmount: dInitialRiskBudget ? Number(dInitialRiskBudget.toFixed(2)) : null,
    newStopLevel: params.newStopLoss ? Number(new Decimal(params.newStopLoss).toFixed(2)) : null,
    isSlippageWarning,
    slippagePercent,
    slippageMessage,
  };
}

/**
 * Computes deterministic post-trade review metrics, MFE capture efficiency,
 * surrendered giveback, execution quality grade, algorithmic mistake suggestions,
 * and normalized in-trade emotional pulse checkpoints.
 * All math strictly computed with Decimal.js for financial accuracy.
 */
export function generatePostTradeReviewSummary(params: {
  netPnL: number | Decimal;
  grossPnL: number | Decimal;
  realizedR?: number | null;
  peakMfePnl?: number | null;
  peakMfeR?: number | null;
  maeR?: number | null;
  stopLossMoved?: boolean;
  plannedRiskAmount?: number | null;
  durationMinutes?: number | null;
  auditLog?: Array<{
    action?: string;
    event?: string;
    timestamp?: Date | string;
    details?: any;
  }>;
  existingMistakes?: string[];
}): IPostTradeReviewData {
  const dNet = new Decimal(params.netPnL);
  const dPeakMfe = params.peakMfePnl !== undefined && params.peakMfePnl !== null
    ? new Decimal(params.peakMfePnl)
    : dNet;

  let mfeCaptureEfficiency = 100;
  let dSurrenderedPnl = new Decimal(0);
  let surrenderedGivebackPercent = 0;

  if (dPeakMfe.greaterThan(0)) {
    dSurrenderedPnl = Decimal.max(0, dPeakMfe.minus(dNet));
    if (dNet.greaterThan(0)) {
      mfeCaptureEfficiency = Number(
        Decimal.min(100, Decimal.max(0, dNet.dividedBy(dPeakMfe).times(100))).toFixed(1)
      );
      surrenderedGivebackPercent = Number(
        Decimal.min(100, Decimal.max(0, dSurrenderedPnl.dividedBy(dPeakMfe).times(100))).toFixed(1)
      );
    } else {
      // Trade achieved positive MFE but closed at scratch or loss
      mfeCaptureEfficiency = 0;
      surrenderedGivebackPercent = 100;
    }
  } else {
    mfeCaptureEfficiency = dNet.greaterThanOrEqualTo(0) ? 100 : 0;
    surrenderedGivebackPercent = 0;
  }

  // Determine Execution Quality Grade & Reason
  let executionGrade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' = 'B';
  let gradeReason = '';

  const mistakes = params.existingMistakes || [];
  const isSevereDiscipline = mistakes.includes('REVENGE_TRADING') || mistakes.includes('OVERTRADING');

  if (isSevereDiscipline) {
    executionGrade = 'F';
    gradeReason = 'Severe discipline violation (Revenge trading / Overtrading)';
  } else if (params.stopLossMoved) {
    executionGrade = 'D';
    gradeReason = 'Rule broken: Stop loss moved or widened during trade';
  } else if (dNet.greaterThanOrEqualTo(0)) {
    if (mfeCaptureEfficiency >= 75) {
      executionGrade = 'A+';
      gradeReason = 'Elite execution: Captured ≥75% of peak MFE move';
    } else if (mfeCaptureEfficiency >= 50) {
      executionGrade = 'A';
      gradeReason = 'Target met: Solid partial scaling & profit lock';
    } else {
      executionGrade = 'B';
      gradeReason = 'Sub-optimal harvest: Surrendered >50% of peak MFE profit';
    }
  } else {
    // Loss
    if (params.realizedR !== null && params.realizedR !== undefined && params.realizedR >= -1.1) {
      executionGrade = 'B+';
      gradeReason = 'Planned loss: Respected initial 1R stop loss budget cleanly';
    } else {
      executionGrade = 'C';
      gradeReason = 'Excessive heat: Loss exceeded planned 1R risk budget';
    }
  }

  // Algorithmic Mistake Suggestions
  const suggestedMistakes: ISuggestedMistake[] = [];

  if (surrenderedGivebackPercent >= 50 && (params.peakMfeR ?? 0) >= 1.0) {
    suggestedMistakes.push({
      id: 'GAVE_BACK_PROFIT',
      label: 'Gave Back Profit',
      description: `Surrendered ₹${dSurrenderedPnl.toFixed(0)} (${surrenderedGivebackPercent}%) of peak floating profit`,
      severity: 'warning',
    });
  }

  if (params.stopLossMoved) {
    suggestedMistakes.push({
      id: 'WIDENED_STOP_LOSS',
      label: 'Widened Stop Loss',
      description: 'Stop loss was widened during active trade execution',
      severity: 'error',
    });
  }

  if (params.realizedR !== null && params.realizedR !== undefined && params.realizedR < -1.25) {
    suggestedMistakes.push({
      id: 'EXCESSIVE_RISK',
      label: 'Loss Beyond 1R Budget',
      description: `Loss reached ${params.realizedR}R (exceeded planned 1R risk boundary)`,
      severity: 'error',
    });
  }

  if (params.durationMinutes !== undefined && params.durationMinutes !== null && params.durationMinutes < 3 && dNet.isNegative()) {
    suggestedMistakes.push({
      id: 'IMPULSIVE_EXIT',
      label: 'Impulsive Exit',
      description: 'Exited within <3 minutes at a loss before thesis could play out',
      severity: 'warning',
    });
  }

  // Extract & normalize in-trade pulse checkpoints from auditLog
  const pulseCheckIns: INormalizedPulseCheckIn[] = [];
  if (params.auditLog && Array.isArray(params.auditLog)) {
    for (const entry of params.auditLog) {
      if (entry.action === 'LIVE_PULSE_CHECK' || entry.event === 'LIVE_PULSE_CHECK') {
        pulseCheckIns.push({
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
          emotion: entry.details?.emotion || 'CALM',
          notes: entry.details?.notes || '',
          currentLtp: entry.details?.currentLtp,
          floatingNetPnL: entry.details?.floatingNetPnL,
          unrealizedR: entry.details?.unrealizedR,
        });
      }
    }
  }

  // Sort pulse check-ins chronologically
  pulseCheckIns.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const lastPulseEmotion = pulseCheckIns.length > 0
    ? pulseCheckIns[pulseCheckIns.length - 1].emotion
    : undefined;

  return {
    mfeCaptureEfficiency,
    surrenderedGivebackPnl: Number(dSurrenderedPnl.toFixed(2)),
    surrenderedGivebackPercent,
    executionGrade,
    gradeReason,
    suggestedMistakes,
    pulseCheckIns,
    lastPulseEmotion,
  };
}

