import Decimal from 'decimal.js';
import {
  Direction,
  IRiskCalculationParams,
  IRiskCalculationResult,
} from '@tradevault/shared';

/**
 * Calculates position sizing, suggested quantity, lot rounding, and risk/reward.
 */
export function calculateRiskAndPositionSize(
  params: IRiskCalculationParams
): IRiskCalculationResult {
  const dEquity = new Decimal(params.accountEquity);
  const dEntry = new Decimal(params.entryPrice);
  const dStop = new Decimal(params.stopLossPrice);
  const dMultiplier = new Decimal(params.contractMultiplier ?? 1);
  const dLotSize = new Decimal(params.lotSize ?? 1);
  const dIncrement = new Decimal(params.quantityIncrement ?? params.lotSize ?? 1);
  const dCosts = new Decimal(params.estimatedCosts ?? 0);

  const warnings: string[] = [];

  // 1. Zero stop distance check
  const stopDistance = dEntry.minus(dStop).abs();
  const isStopDistanceZero = stopDistance.isZero();
  if (isStopDistanceZero) {
    warnings.push('Stop-loss price cannot be equal to entry price (zero stop distance).');
  }

  // 2. Direction validity check
  let isDirectionValid = true;
  if (params.direction === 'LONG') {
    if (dStop.greaterThanOrEqualTo(dEntry)) {
      isDirectionValid = false;
      warnings.push('For LONG trades, initial stop-loss must be lower than the entry price.');
    }
    if (params.targetPrice !== undefined && new Decimal(params.targetPrice).lessThanOrEqualTo(dEntry)) {
      warnings.push('For LONG trades, profit target should be higher than the entry price.');
    }
  } else {
    // SHORT
    if (dStop.lessThanOrEqualTo(dEntry)) {
      isDirectionValid = false;
      warnings.push('For SHORT trades, initial stop-loss must be higher than the entry price.');
    }
    if (params.targetPrice !== undefined && new Decimal(params.targetPrice).greaterThanOrEqualTo(dEntry)) {
      warnings.push('For SHORT trades, profit target should be lower than the entry price.');
    }
  }

  // 3. Planned Risk Budget
  let plannedRiskAmount = new Decimal(0);
  let riskPercentage = new Decimal(0);

  if (params.fixedRiskAmount !== undefined && params.fixedRiskAmount > 0) {
    plannedRiskAmount = new Decimal(params.fixedRiskAmount);
    riskPercentage = dEquity.isZero()
      ? new Decimal(0)
      : plannedRiskAmount.dividedBy(dEquity).times(100);
  } else if (params.riskPercent !== undefined && params.riskPercent > 0) {
    riskPercentage = new Decimal(params.riskPercent);
    plannedRiskAmount = dEquity.times(riskPercentage.dividedBy(100));
  }

  if (isStopDistanceZero) {
    return {
      plannedRiskAmount: Number(plannedRiskAmount.toFixed(2)),
      riskPercentage: Number(riskPercentage.toFixed(2)),
      stopLossDistance: 0,
      lossPerUnitAtStop: 0,
      rawSuggestedQuantity: 0,
      roundedLotQuantity: 0,
      estimatedMonetaryLoss: 0,
      actualRiskPercentage: 0,
      isDirectionValid,
      isStopDistanceZero: true,
      warnings,
    };
  }

  // Loss per unit at stop
  const lossPerUnitAtStop = stopDistance.times(dMultiplier);

  // Raw suggested quantity
  const rawSuggestedQuantity = lossPerUnitAtStop.isZero()
    ? new Decimal(0)
    : plannedRiskAmount.dividedBy(lossPerUnitAtStop);

  // Round down to valid lot size or increment
  const unitStep = dIncrement.greaterThan(0) ? dIncrement : dLotSize;
  let roundedLotQuantity = rawSuggestedQuantity
    .dividedBy(unitStep)
    .floor()
    .times(unitStep);

  if (roundedLotQuantity.isNegative()) {
    roundedLotQuantity = new Decimal(0);
  }

  if (roundedLotQuantity.isZero() && rawSuggestedQuantity.greaterThan(0)) {
    warnings.push(
      `Risk budget of ${plannedRiskAmount.toFixed(2)} is too small for a minimum lot of ${unitStep}. Suggested minimum lot would exceed intended risk.`
    );
  }

  // Estimated monetary loss with valid quantity
  const estimatedMonetaryLoss = roundedLotQuantity.times(lossPerUnitAtStop).plus(dCosts);

  const actualRiskPercentage = dEquity.isZero()
    ? new Decimal(0)
    : estimatedMonetaryLoss.dividedBy(dEquity).times(100);

  // Reward calculations if target provided
  let estimatedReward: number | undefined;
  let rewardRiskRatio: number | undefined;
  let estimatedNetReward: number | undefined;

  if (params.targetPrice !== undefined && params.targetPrice > 0) {
    const dTarget = new Decimal(params.targetPrice);
    const rewardDistance = dTarget.minus(dEntry).abs();
    const grossReward = rewardDistance.times(dMultiplier).times(roundedLotQuantity);
    const netReward = grossReward.minus(dCosts);

    estimatedReward = Number(grossReward.toFixed(2));
    estimatedNetReward = Number(netReward.toFixed(2));

    if (!stopDistance.isZero()) {
      rewardRiskRatio = Number(rewardDistance.dividedBy(stopDistance).toFixed(2));
    }
  }

  return {
    plannedRiskAmount: Number(plannedRiskAmount.toFixed(2)),
    riskPercentage: Number(riskPercentage.toFixed(2)),
    stopLossDistance: Number(stopDistance.toFixed(4)),
    lossPerUnitAtStop: Number(lossPerUnitAtStop.toFixed(4)),
    rawSuggestedQuantity: Number(rawSuggestedQuantity.toFixed(4)),
    roundedLotQuantity: Number(roundedLotQuantity.toFixed(4)),
    estimatedMonetaryLoss: Number(estimatedMonetaryLoss.toFixed(2)),
    actualRiskPercentage: Number(actualRiskPercentage.toFixed(2)),
    estimatedReward,
    rewardRiskRatio,
    estimatedNetReward,
    isDirectionValid,
    isStopDistanceZero: false,
    warnings,
  };
}

/**
 * Calculates realized R-multiple: Net P&L / Initial Planned Risk
 */
export function calculateRealizedRMultiple(
  realizedNetPnL: number | Decimal,
  plannedRiskAmount?: number | Decimal | null
): number | undefined {
  if (plannedRiskAmount === undefined || plannedRiskAmount === null) return undefined;
  const dRisk = new Decimal(plannedRiskAmount);
  if (dRisk.lessThanOrEqualTo(0)) return undefined;

  const dPnL = new Decimal(realizedNetPnL);
  return Number(dPnL.dividedBy(dRisk).toFixed(2));
}
