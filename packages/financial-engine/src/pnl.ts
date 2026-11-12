import Decimal, { roundHalfUp } from './decimal.js';
import { Direction, ISimpleExecution, TradeOutcome } from '@tradevault/shared';

// Uses isolated CalcDecimal (30-digit precision, standard ROUND_HALF_UP)

export interface LinearPnLParams {
  direction: Direction;
  entryPrice: number | string | Decimal;
  exitPrice?: number | string | Decimal | null;
  quantity: number | string | Decimal;
  contractMultiplier?: number | string | Decimal;
  brokerage?: number | string | Decimal;
  exchangeFees?: number | string | Decimal;
  regulatoryFees?: number | string | Decimal;
  taxes?: number | string | Decimal;
  otherFees?: number | string | Decimal;
  explicitAdjustments?: number | string | Decimal;
  precision?: number;
}

export interface LinearPnLResult {
  grossPnL: Decimal;
  totalCosts: Decimal;
  netPnL: Decimal;
  grossPnLNumber: number;
  totalCostsNumber: number;
  netPnLNumber: number;
  outcome: TradeOutcome;
  isClosed: boolean;
}

/**
 * Calculates deterministic Gross P&L, Total Costs, and Net P&L for linear instruments.
 * Long gross P&L = (Exit price - Entry price) * Quantity * Multiplier
 * Short gross P&L = (Entry price - Exit price) * Quantity * Multiplier
 * Net P&L = Gross P&L - Total Costs + Explicit Adjustments
 *
 * All currency outputs are rounded to `precision` decimal places (default 2) with ROUND_HALF_UP
 * before outcome classification so netPnL === 0.00 is consistently classified as 'BREAKEVEN'.
 */
export function calculateLinearPnL(params: LinearPnLParams): LinearPnLResult {
  const dEntry = new Decimal(params.entryPrice);
  const dQty = new Decimal(params.quantity);
  const dMultiplier = params.contractMultiplier
    ? new Decimal(params.contractMultiplier)
    : new Decimal(1);
  const precision = params.precision ?? 2;

  if (dQty.isNegative()) {
    throw new Error('Quantity cannot be negative');
  }

  const dBrokerage = new Decimal(params.brokerage ?? 0);
  const dExchange = new Decimal(params.exchangeFees ?? 0);
  const dRegulatory = new Decimal(params.regulatoryFees ?? 0);
  const dTaxes = new Decimal(params.taxes ?? 0);
  const dOther = new Decimal(params.otherFees ?? 0);
  const dAdjustments = new Decimal(params.explicitAdjustments ?? 0);

  const rawCosts = dBrokerage.plus(dExchange).plus(dRegulatory).plus(dTaxes).plus(dOther);
  const totalCosts = roundHalfUp(rawCosts, precision);

  if (params.exitPrice === undefined || params.exitPrice === null) {
    const rawOpenNet = new Decimal(0).minus(rawCosts).plus(dAdjustments);
    const openNet = roundHalfUp(rawOpenNet, precision);
    return {
      grossPnL: new Decimal(0),
      totalCosts,
      netPnL: openNet,
      grossPnLNumber: 0,
      totalCostsNumber: totalCosts.toNumber(),
      netPnLNumber: openNet.toNumber(),
      outcome: 'OPEN',
      isClosed: false,
    };
  }

  const dExit = new Decimal(params.exitPrice);

  let rawGrossPnL: Decimal;
  if (params.direction === 'LONG') {
    rawGrossPnL = dExit.minus(dEntry).times(dQty).times(dMultiplier);
  } else {
    rawGrossPnL = dEntry.minus(dExit).times(dQty).times(dMultiplier);
  }

  const grossPnL = roundHalfUp(rawGrossPnL, precision);
  const netPnL = roundHalfUp(rawGrossPnL.minus(rawCosts).plus(dAdjustments), precision);

  let outcome: TradeOutcome = 'BREAKEVEN';
  if (netPnL.greaterThan(0)) {
    outcome = 'WIN';
  } else if (netPnL.lessThan(0)) {
    outcome = 'LOSS';
  }

  return {
    grossPnL,
    totalCosts,
    netPnL,
    grossPnLNumber: grossPnL.toNumber(),
    totalCostsNumber: totalCosts.toNumber(),
    netPnLNumber: netPnL.toNumber(),
    outcome,
    isClosed: true,
  };
}

/**
 * Calculates Simple Execution P&L from ISimpleExecution parameters
 */
export function calculateSimpleExecutionPnL(
  direction: Direction,
  exec: ISimpleExecution,
  precision = 2
): LinearPnLResult {
  return calculateLinearPnL({
    direction,
    entryPrice: exec.entryPrice,
    exitPrice: exec.exitPrice,
    quantity: exec.quantity,
    contractMultiplier: exec.contractMultiplier,
    brokerage: exec.brokerage,
    exchangeFees: exec.exchangeFees,
    regulatoryFees: exec.regulatoryFees,
    taxes: exec.taxes,
    otherFees: exec.otherFees,
    explicitAdjustments: exec.explicitAdjustments,
    precision,
  });
}
