import Decimal from './decimal.js';

export interface PropGuardViolation {
  code:
    | 'MISSING_STOP_LOSS'
    | 'DAILY_LOSS_EXCEEDED'
    | 'MAX_LOSS_EXCEEDED'
    | 'LOT_CAP_EXCEEDED'
    | 'NEWS_WINDOW_ACTIVE'
    | 'WEEKEND_HOLD_BLOCKED';
  message: string;
  severity: 'BLOCKING' | 'WARNING';
}

export interface PropPreTradeGuardParams {
  accountBalance: number | string | Decimal;
  accountDailyLossRemaining?: number | string | Decimal | null;
  accountMaxLossRemaining?: number | string | Decimal | null;
  plannedRiskAmount?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  priceDistanceToSL?: number | string | Decimal;
  hasStopLoss: boolean;
  isAutomated?: boolean;
  isNewsWindowActive?: boolean;
  isNearWeekendClose?: boolean;
  currency?: string;
  rules?: {
    prohibitNewsTrading?: boolean;
    prohibitWeekendHolding?: boolean;
    requireStopLoss?: boolean;
    lotCap?: number;
    maxDailyLoss?: number;
    maxLoss?: number;
  };
}

export interface PropPreTradeGuardResult {
  passed: boolean;
  violations: PropGuardViolation[];
  hasBlockingViolations: boolean;
  canAutoExecute: boolean;
  canManualOverride: boolean;
  maxAllowedRisk: number;
  recommendedCappedQuantity: number;
  dailyLossBuffer: number;
  maxLossBuffer: number;
}

export function evaluatePropPreTradeGuard(
  params: PropPreTradeGuardParams
): PropPreTradeGuardResult {
  const violations: PropGuardViolation[] = [];
  const qty = new Decimal(params.quantity || 0);
  const contractMult = new Decimal(params.contractMultiplier || 1);

  // 1. Missing Stop Loss Check
  const requireSL = params.rules?.requireStopLoss !== false;
  if (!params.hasStopLoss) {
    if (requireSL || params.isAutomated) {
      violations.push({
        code: 'MISSING_STOP_LOSS',
        message: 'A predefined stop-loss order is mandatory for prop accounts to guarantee risk containment.',
        severity: 'BLOCKING',
      });
    }
  }

  // 2. Daily Loss Buffer Check
  const dailyBufferDec = params.accountDailyLossRemaining !== undefined && params.accountDailyLossRemaining !== null
    ? new Decimal(params.accountDailyLossRemaining)
    : new Decimal(999999);

  // 3. Max Loss Buffer Check
  const maxLossBufferDec = params.accountMaxLossRemaining !== undefined && params.accountMaxLossRemaining !== null
    ? new Decimal(params.accountMaxLossRemaining)
    : new Decimal(999999);

  // Max allowed single-trade risk is bounded by remaining daily & max loss buffers
  const maxAllowedRiskDec = Decimal.max(0, Decimal.min(dailyBufferDec, maxLossBufferDec));

  // Calculate planned trade risk
  let plannedRiskDec = new Decimal(0);
  if (params.plannedRiskAmount !== undefined && params.plannedRiskAmount !== null) {
    plannedRiskDec = new Decimal(params.plannedRiskAmount);
  } else if (params.priceDistanceToSL && qty.greaterThan(0)) {
    plannedRiskDec = new Decimal(params.priceDistanceToSL).times(qty).times(contractMult);
  }

  if (dailyBufferDec.lessThanOrEqualTo(0)) {
    violations.push({
      code: 'DAILY_LOSS_EXCEEDED',
      message: 'Account has reached or breached its daily loss buffer. No new risk allowed today.',
      severity: 'BLOCKING',
    });
  } else if (plannedRiskDec.greaterThan(dailyBufferDec)) {
    violations.push({
      code: 'DAILY_LOSS_EXCEEDED',
      message: `Planned trade risk of ${plannedRiskDec.toFixed(2)} exceeds remaining daily buffer of ${dailyBufferDec.toFixed(2)}.`,
      severity: 'BLOCKING',
    });
  }

  if (maxLossBufferDec.lessThanOrEqualTo(0)) {
    violations.push({
      code: 'MAX_LOSS_EXCEEDED',
      message: 'Account has reached or breached its maximum trailing/static loss limit. Challenge breached.',
      severity: 'BLOCKING',
    });
  } else if (plannedRiskDec.greaterThan(maxLossBufferDec)) {
    violations.push({
      code: 'MAX_LOSS_EXCEEDED',
      message: `Planned trade risk of ${plannedRiskDec.toFixed(2)} exceeds remaining maximum loss buffer of ${maxLossBufferDec.toFixed(2)}.`,
      severity: 'BLOCKING',
    });
  }

  // 4. Lot Cap Check
  let cappedQty = qty;
  const lotCap = params.rules?.lotCap;
  if (typeof lotCap === 'number' && lotCap > 0) {
    if (qty.greaterThan(lotCap)) {
      violations.push({
        code: 'LOT_CAP_EXCEEDED',
        message: `Position size of ${qty.toString()} exceeds firm lot cap limit of ${lotCap}.`,
        severity: 'BLOCKING',
      });
      cappedQty = Decimal.min(cappedQty, new Decimal(lotCap));
    }
  }

  // Also cap quantity to max allowed risk if stop distance is known
  if (params.priceDistanceToSL && new Decimal(params.priceDistanceToSL).greaterThan(0)) {
    const riskPerUnit = new Decimal(params.priceDistanceToSL).times(contractMult);
    if (riskPerUnit.greaterThan(0) && maxAllowedRiskDec.greaterThan(0)) {
      const maxUnitsForRisk = maxAllowedRiskDec.dividedBy(riskPerUnit);
      cappedQty = Decimal.min(cappedQty, maxUnitsForRisk);
    }
  }

  // 5. News Window Check
  if (params.rules?.prohibitNewsTrading && params.isNewsWindowActive) {
    violations.push({
      code: 'NEWS_WINDOW_ACTIVE',
      message: 'High-impact economic news event window is active (±2 to 5 mins). Trading is prohibited by firm rules.',
      severity: 'BLOCKING',
    });
  }

  // 6. Weekend Holding Block
  if (params.rules?.prohibitWeekendHolding && params.isNearWeekendClose) {
    violations.push({
      code: 'WEEKEND_HOLD_BLOCKED',
      message: 'Holding positions over the weekend is strictly prohibited by firm rules. Entry blocked ahead of Friday market close.',
      severity: 'BLOCKING',
    });
  }

  const hasBlocking = violations.some((v) => v.severity === 'BLOCKING');
  const canAutoExecute = !hasBlocking;
  // Manual override is permitted ONLY if not breached beyond account floor (e.g. dailyBuffer > 0) and user explicitly signs confirmation
  const canManualOverride = dailyBufferDec.greaterThan(0) && maxLossBufferDec.greaterThan(0);

  return {
    passed: violations.length === 0,
    violations,
    hasBlockingViolations: hasBlocking,
    canAutoExecute,
    canManualOverride,
    maxAllowedRisk: Number(maxAllowedRiskDec.toFixed(2)),
    recommendedCappedQuantity: Number(cappedQty.toFixed(2)),
    dailyLossBuffer: Number(dailyBufferDec.toFixed(2)),
    maxLossBuffer: Number(maxLossBufferDec.toFixed(2)),
  };
}

