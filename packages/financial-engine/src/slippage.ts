import Decimal from 'decimal.js';

// Configure 30-digit precision with standard half-up rounding
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface ICalculateSlippageParams {
  direction: 'LONG' | 'SHORT';
  quantity: number;
  contractMultiplier?: number;
  actualEntryPrice: number;
  plannedEntryPrice?: number;
  actualExitPrice?: number;
  plannedExitPrice?: number;
  initialStopLoss?: number;
  plannedTarget?: number;
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN' | 'CANCELLED' | string;
}

export interface IExecutionSlippage {
  hasSlippageData: boolean;

  // Entry slippage
  entrySlippagePoints?: number;
  entrySlippagePercent?: number;
  entrySlippageCost?: number;
  isEntryAdverse?: boolean; // true = paid worse price (drag); false = price improvement

  // Exit slippage
  exitSlippagePoints?: number;
  exitSlippagePercent?: number;
  exitSlippageCost?: number;
  isExitAdverse?: boolean; // true = exited worse than plan (drag); false = price improvement

  // Combined
  totalSlippageCost?: number; // Total monetary drag in account currency (positive = net loss/drag, negative = net savings)
  summaryText?: string;
}

export interface ISlippageAggregate {
  totalSlippageCost: number;
  avgSlippagePerTrade: number;
  adverseTradesCount: number;
  favorableTradesCount: number;
  neutralTradesCount: number;
  tradesWithSlippageCount: number;
  adverseEntryCount: number;
  favorableEntryCount: number;
  adverseExitCount: number;
  favorableExitCount: number;
}

/**
 * Calculates trade execution slippage with 30-digit Decimal precision.
 * Evaluates entry and exit fills against pre-trade planned levels.
 *
 * Directional rules:
 * - LONG Entry:
 *   Adverse when actualEntry > plannedEntry (paid higher price).
 *   Favorable when actualEntry < plannedEntry (price improvement).
 * - SHORT Entry:
 *   Adverse when actualEntry < plannedEntry (sold at lower price).
 *   Favorable when actualEntry > plannedEntry (price improvement).
 * - LONG Exit:
 *   Adverse when actualExit < plannedExit (received lower price on sale).
 *   Favorable when actualExit > plannedExit (received higher price).
 * - SHORT Exit:
 *   Adverse when actualExit > plannedExit (bought to cover at higher price).
 *   Favorable when actualExit < plannedExit (bought to cover at lower price).
 */
export function calculateExecutionSlippage(params: ICalculateSlippageParams): IExecutionSlippage {
  const {
    direction,
    quantity,
    contractMultiplier = 1,
    actualEntryPrice,
    plannedEntryPrice,
    actualExitPrice,
    plannedExitPrice,
    initialStopLoss,
    plannedTarget,
    outcome,
  } = params;

  let hasEntrySlippage = false;
  let entrySlippagePoints: Decimal | undefined;
  let entrySlippagePercent: Decimal | undefined;
  let entrySlippageCost: Decimal | undefined;
  let isEntryAdverse: boolean | undefined;

  const qty = new Decimal(quantity || 0);
  const mult = new Decimal(contractMultiplier || 1);
  const units = qty.mul(mult);

  // 1. Calculate Entry Slippage
  if (plannedEntryPrice && plannedEntryPrice > 0 && actualEntryPrice > 0) {
    const plannedEntry = new Decimal(plannedEntryPrice);
    const actualEntry = new Decimal(actualEntryPrice);

    if (!plannedEntry.isZero()) {
      hasEntrySlippage = true;
      if (direction === 'LONG') {
        // LONG: actual > planned => adverse (points > 0)
        entrySlippagePoints = actualEntry.minus(plannedEntry);
      } else {
        // SHORT: planned > actual => adverse (points > 0)
        entrySlippagePoints = plannedEntry.minus(actualEntry);
      }

      isEntryAdverse = entrySlippagePoints.gt(0);
      entrySlippagePercent = actualEntry.minus(plannedEntry).abs().div(plannedEntry).mul(100);
      entrySlippageCost = entrySlippagePoints.mul(units);
    }
  }

  // 2. Calculate Exit Slippage
  let hasExitSlippage = false;
  let exitSlippagePoints: Decimal | undefined;
  let exitSlippagePercent: Decimal | undefined;
  let exitSlippageCost: Decimal | undefined;
  let isExitAdverse: boolean | undefined;

  // Resolve effective planned exit level
  let effectivePlannedExit: number | undefined = plannedExitPrice;
  if (!effectivePlannedExit || effectivePlannedExit <= 0) {
    if (outcome === 'LOSS' && initialStopLoss && initialStopLoss > 0) {
      effectivePlannedExit = initialStopLoss;
    } else if (outcome === 'WIN' && plannedTarget && plannedTarget > 0) {
      effectivePlannedExit = plannedTarget;
    }
  }

  if (effectivePlannedExit && effectivePlannedExit > 0 && actualExitPrice && actualExitPrice > 0) {
    const plannedExit = new Decimal(effectivePlannedExit);
    const actualExit = new Decimal(actualExitPrice);

    if (!plannedExit.isZero()) {
      hasExitSlippage = true;
      if (direction === 'LONG') {
        // LONG Exit: sell order. planned > actual => adverse (points > 0)
        exitSlippagePoints = plannedExit.minus(actualExit);
      } else {
        // SHORT Exit: buy-to-cover order. actual > planned => adverse (points > 0)
        exitSlippagePoints = actualExit.minus(plannedExit);
      }

      isExitAdverse = exitSlippagePoints.gt(0);
      exitSlippagePercent = actualExit.minus(plannedExit).abs().div(plannedExit).mul(100);
      exitSlippageCost = exitSlippagePoints.mul(units);
    }
  }

  const hasSlippageData = hasEntrySlippage || hasExitSlippage;

  if (!hasSlippageData) {
    return {
      hasSlippageData: false,
    };
  }

  const totalCostDec = (entrySlippageCost || new Decimal(0)).plus(exitSlippageCost || new Decimal(0));

  // Build descriptive human-readable summary
  const summaryParts: string[] = [];
  if (hasEntrySlippage && entrySlippagePoints) {
    const ptsStr = Math.abs(entrySlippagePoints.toNumber()).toFixed(2);
    if (isEntryAdverse) {
      summaryParts.push(`Entry adverse (+${ptsStr} pts drag)`);
    } else if (entrySlippagePoints.lt(0)) {
      summaryParts.push(`Entry improved (-${ptsStr} pts saved)`);
    } else {
      summaryParts.push(`Entry filled at exact target`);
    }
  }

  if (hasExitSlippage && exitSlippagePoints) {
    const ptsStr = Math.abs(exitSlippagePoints.toNumber()).toFixed(2);
    if (isExitAdverse) {
      summaryParts.push(`Exit adverse (+${ptsStr} pts drag)`);
    } else if (exitSlippagePoints.lt(0)) {
      summaryParts.push(`Exit improved (-${ptsStr} pts saved)`);
    } else {
      summaryParts.push(`Exit filled at exact plan`);
    }
  }

  return {
    hasSlippageData: true,
    entrySlippagePoints: entrySlippagePoints ? Number(entrySlippagePoints.toFixed(4)) : undefined,
    entrySlippagePercent: entrySlippagePercent ? Number(entrySlippagePercent.toFixed(2)) : undefined,
    entrySlippageCost: entrySlippageCost ? Number(entrySlippageCost.toFixed(2)) : undefined,
    isEntryAdverse,
    exitSlippagePoints: exitSlippagePoints ? Number(exitSlippagePoints.toFixed(4)) : undefined,
    exitSlippagePercent: exitSlippagePercent ? Number(exitSlippagePercent.toFixed(2)) : undefined,
    exitSlippageCost: exitSlippageCost ? Number(exitSlippageCost.toFixed(2)) : undefined,
    isExitAdverse,
    totalSlippageCost: Number(totalCostDec.toFixed(2)),
    summaryText: summaryParts.join(' • '),
  };
}

/**
 * Aggregates slippage metrics across a collection of trades.
 */
export function aggregateSlippageMetrics(trades: any[]): ISlippageAggregate {
  let totalCost = new Decimal(0);
  let tradesWithSlippage = 0;
  let adverseTrades = 0;
  let favorableTrades = 0;
  let neutralTrades = 0;

  let adverseEntryCount = 0;
  let favorableEntryCount = 0;
  let adverseExitCount = 0;
  let favorableExitCount = 0;

  for (const t of trades) {
    const slippage: IExecutionSlippage | undefined = t.calculated?.slippage || t.slippage;
    if (!slippage || !slippage.hasSlippageData) continue;

    tradesWithSlippage++;
    const cost = slippage.totalSlippageCost ?? 0;
    totalCost = totalCost.plus(cost);

    if (cost > 0.01) {
      adverseTrades++;
    } else if (cost < -0.01) {
      favorableTrades++;
    } else {
      neutralTrades++;
    }

    if (slippage.entrySlippagePoints !== undefined) {
      if (slippage.isEntryAdverse) adverseEntryCount++;
      else if (slippage.entrySlippagePoints < 0) favorableEntryCount++;
    }

    if (slippage.exitSlippagePoints !== undefined) {
      if (slippage.isExitAdverse) adverseExitCount++;
      else if (slippage.exitSlippagePoints < 0) favorableExitCount++;
    }
  }

  const avgCost = tradesWithSlippage > 0
    ? totalCost.div(tradesWithSlippage).toNumber()
    : 0;

  return {
    totalSlippageCost: Number(totalCost.toFixed(2)),
    avgSlippagePerTrade: Number(avgCost.toFixed(2)),
    adverseTradesCount: adverseTrades,
    favorableTradesCount: favorableTrades,
    neutralTradesCount: neutralTrades,
    tradesWithSlippageCount: tradesWithSlippage,
    adverseEntryCount,
    favorableEntryCount,
    adverseExitCount,
    favorableExitCount,
  };
}
