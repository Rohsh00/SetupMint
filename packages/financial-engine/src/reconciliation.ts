import Decimal from 'decimal.js';

export interface DrilldownTradeItem {
  id: string;
  status: string;
  calculated?: {
    netPnL?: number;
    grossPnL?: number;
    totalCosts?: number;
    realizedRMultiple?: number;
    outcome?: string;
  };
  netPnL?: number;
  grossPnL?: number;
  totalCosts?: number;
  realizedRMultiple?: number;
  outcome?: string;
  exclusionReasons?: string[];
}

export interface DrilldownAggregateResult {
  count: number;
  closedCount: number;
  netPnL: number;
  grossPnL: number;
  totalCosts: number;
  winRate: number; // e.g. 62.5
  avgR: number;    // e.g. 1.45
  winsCount: number;
  lossesCount: number;
  breakevenCount: number;
  rCount: number;
}

/**
 * Computes authoritative reconciled aggregates for the Trade Drill Drawer header.
 * Uses Decimal.js with 30-digit precision to ensure exact match with chart analytics.
 */
export function calculateDrilldownAggregate(
  trades: DrilldownTradeItem[]
): DrilldownAggregateResult {

  if (!trades || trades.length === 0) {
    return {
      count: 0,
      closedCount: 0,
      netPnL: 0,
      grossPnL: 0,
      totalCosts: 0,
      winRate: 0,
      avgR: 0,
      winsCount: 0,
      lossesCount: 0,
      breakevenCount: 0,
      rCount: 0,
    };
  }

  let totalNet = new Decimal(0);
  let totalGross = new Decimal(0);
  let totalCosts = new Decimal(0);
  let totalR = new Decimal(0);

  let winsCount = 0;
  let lossesCount = 0;
  let breakevenCount = 0;
  let closedCount = 0;
  let rCount = 0;

  for (const t of trades) {
    const net = t.calculated?.netPnL ?? t.netPnL ?? 0;
    const gross = t.calculated?.grossPnL ?? t.grossPnL ?? 0;
    const costs = t.calculated?.totalCosts ?? t.totalCosts ?? 0;
    const r = t.calculated?.realizedRMultiple ?? t.realizedRMultiple;
    const status = t.status;

    totalNet = totalNet.plus(new Decimal(net));
    totalGross = totalGross.plus(new Decimal(gross));
    totalCosts = totalCosts.plus(new Decimal(costs));

    if (status === 'CLOSED') {
      closedCount++;
      if (net > 0) winsCount++;
      else if (net < 0) lossesCount++;
      else breakevenCount++;
    }

    if (r !== undefined && r !== null && Number.isFinite(r)) {
      totalR = totalR.plus(new Decimal(r));
      rCount++;
    }
  }

  const winRate = closedCount > 0
    ? Number(new Decimal(winsCount).dividedBy(closedCount).times(100).toFixed(2))
    : 0;

  const avgR = rCount > 0
    ? Number(totalR.dividedBy(rCount).toFixed(2))
    : 0;

  return {
    count: trades.length,
    closedCount,
    netPnL: Number(totalNet.toFixed(2)),
    grossPnL: Number(totalGross.toFixed(2)),
    totalCosts: Number(totalCosts.toFixed(2)),
    winRate,
    avgR,
    winsCount,
    lossesCount,
    breakevenCount,
    rCount,
  };
}

export const computeTradeAggregates = calculateDrilldownAggregate;

