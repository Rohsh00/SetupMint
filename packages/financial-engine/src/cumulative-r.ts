import Decimal from 'decimal.js';

export interface CumulativeRTradeInput {
  id: string;
  tradeDate: string;
  symbol: string;
  status: string;
  strategyId?: string;
  strategyName?: string;
  calculated?: {
    netPnL?: number;
    realizedRMultiple?: number;
  };
  realizedRMultiple?: number;
  netPnL?: number;
  plannedRiskAmount?: number;
}

export interface CumulativeRPoint {
  date: string;
  tradeId?: string;
  symbol?: string;
  strategyId?: string;
  strategyName?: string;
  rMultiple: number;
  cumulativeR: number;
}

export interface CumulativeRCurveResult {
  curve: CumulativeRPoint[];
  totalTrades: number;
  eligibleTrades: number;
  excludedTrades: number;
  coveragePercent: number;
  coverageText: string;
  exclusionReasons: string[];
}

/**
 * Calculates a cumulative R-multiple curve across trades.
 *
 * Rules (consistent with edge.ts):
 * - Only CLOSED trades are eligible.
 * - Missing or non-positive planned risk trades without a finite realizedRMultiple are EXCLUDED with a recorded reason.
 * - Zero/missing planned risk is never silently coerced to 0R.
 * - Initial baseline point (0R) is established at the start.
 * - Realized R-multiples are summed with Decimal.js for zero floating-point accumulation drift.
 */
export function cumulativeRCurve(trades: CumulativeRTradeInput[]): CumulativeRCurveResult {
  if (!trades || trades.length === 0) {
    return {
      curve: [],
      totalTrades: 0,
      eligibleTrades: 0,
      excludedTrades: 0,
      coveragePercent: 0,
      coverageText: 'R available for 0 of 0 trades (0%)',
      exclusionReasons: [],
    };
  }

  // Canonical sorting by tradeDate then id
  const sorted = [...trades].sort((a, b) => {
    const timeA = a.tradeDate ? new Date(a.tradeDate).getTime() : 0;
    const timeB = b.tradeDate ? new Date(b.tradeDate).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const exclusionReasons: string[] = [];
  const eligiblePoints: Array<{
    trade: CumulativeRTradeInput;
    r: Decimal;
  }> = [];

  for (const trade of sorted) {
    if (trade.status !== 'CLOSED') {
      exclusionReasons.push(`Trade ${trade.id || 'unidentified'}: status is not CLOSED (${trade.status})`);
      continue;
    }

    let rDec: Decimal | null = null;
    const directR = trade.calculated?.realizedRMultiple ?? trade.realizedRMultiple;

    if (directR !== undefined && directR !== null && Number.isFinite(directR)) {
      rDec = new Decimal(directR);
    } else {
      const pnl = trade.calculated?.netPnL ?? trade.netPnL;
      const risk = trade.plannedRiskAmount;

      if (
        pnl !== undefined &&
        pnl !== null &&
        risk !== undefined &&
        risk !== null &&
        Number.isFinite(pnl) &&
        Number.isFinite(risk) &&
        risk > 0
      ) {
        rDec = new Decimal(pnl).dividedBy(new Decimal(risk));
      }
    }

    if (rDec === null) {
      exclusionReasons.push(`Trade ${trade.id || 'unidentified'}: missing valid realized R-multiple or planned risk amount`);
      continue;
    }

    eligiblePoints.push({ trade, r: rDec });
  }

  const eligibleTrades = eligiblePoints.length;
  const totalTrades = sorted.length;
  const excludedTrades = totalTrades - eligibleTrades;
  const coveragePercent = totalTrades > 0 ? Number(((eligibleTrades / totalTrades) * 100).toFixed(1)) : 0;
  const coverageText = `R available for ${eligibleTrades} of ${totalTrades} trades (${coveragePercent}%)`;

  const curve: CumulativeRPoint[] = [];

  // Anchor curve at 0R
  const firstDate = eligiblePoints.length > 0 ? eligiblePoints[0].trade.tradeDate : sorted[0].tradeDate;
  curve.push({
    date: firstDate,
    rMultiple: 0,
    cumulativeR: 0,
  });

  let runningR = new Decimal(0);

  for (const { trade, r } of eligiblePoints) {
    runningR = runningR.plus(r);
    curve.push({
      date: trade.tradeDate,
      tradeId: trade.id,
      symbol: trade.symbol,
      strategyId: trade.strategyId,
      strategyName: trade.strategyName,
      rMultiple: Number(r.toFixed(2)),
      cumulativeR: Number(runningR.toFixed(2)),
    });
  }

  return {
    curve,
    totalTrades,
    eligibleTrades,
    excludedTrades,
    coveragePercent,
    coverageText,
    exclusionReasons,
  };
}
