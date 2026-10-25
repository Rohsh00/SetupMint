import Decimal from 'decimal.js';
import { IWhatIfExcursionDistributionBucket } from '@tradevault/shared';
import { IWhatIfEligibleTrade } from './types.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IComputedExcursionsResult {
  winnersMaeDistribution: IWhatIfExcursionDistributionBucket[];
  allTradesMfeDistribution: IWhatIfExcursionDistributionBucket[];
}

/**
 * Computes Winners' MAE and All Trades' MFE distributions in the exact same
 * stop-distance R unit from overlapping candles inside [entry, exit].
 */
export function computeWhatIfExcursionDistributions(
  trades: IWhatIfEligibleTrade[]
): IComputedExcursionsResult {
  // Buckets definitions for Winners' MAE (0 to 1+ R)
  const maeBucketDefs = [
    { range: '0.00R – 0.25R', minR: 0, maxR: 0.25 },
    { range: '0.25R – 0.50R', minR: 0.25, maxR: 0.50 },
    { range: '0.50R – 0.75R', minR: 0.50, maxR: 0.75 },
    { range: '0.75R – 1.00R', minR: 0.75, maxR: 1.00 },
    { range: '> 1.00R (Adverse)', minR: 1.00, maxR: Infinity },
  ];

  // Buckets definitions for All Trades' MFE (0 to 5+ R)
  const mfeBucketDefs = [
    { range: '0.00R – 1.00R', minR: 0, maxR: 1.0 },
    { range: '1.00R – 2.00R', minR: 1.0, maxR: 2.0 },
    { range: '2.00R – 3.00R', minR: 2.0, maxR: 3.0 },
    { range: '3.00R – 5.00R', minR: 3.0, maxR: 5.0 },
    { range: '> 5.00R', minR: 5.0, maxR: Infinity },
  ];

  const maeBuckets = maeBucketDefs.map((b) => ({
    ...b,
    count: 0,
    tradeIds: [] as string[],
  }));

  const mfeBuckets = mfeBucketDefs.map((b) => ({
    ...b,
    count: 0,
    tradeIds: [] as string[],
  }));

  for (const trade of trades) {
    if (!trade.candles || trade.candles.length === 0) continue;

    // Scan candle highs and lows in [entryIndex, exitIndex]
    let highest = trade.entryPrice;
    let lowest = trade.entryPrice;

    for (let i = trade.entryIndex; i <= trade.exitIndex; i++) {
      const c = trade.candles[i];
      if (!c) continue;
      const h = new Decimal(c.h);
      const l = new Decimal(c.l);
      if (h.greaterThan(highest)) highest = h;
      if (l.lessThan(lowest)) lowest = l;
    }

    let mfePoints: Decimal;
    let maePoints: Decimal;

    if (trade.direction === 'LONG') {
      mfePoints = Decimal.max(0, highest.minus(trade.entryPrice));
      maePoints = Decimal.max(0, trade.entryPrice.minus(lowest));
    } else {
      // SHORT
      mfePoints = Decimal.max(0, trade.entryPrice.minus(lowest));
      maePoints = Decimal.max(0, highest.minus(trade.entryPrice));
    }

    const unitRisk = trade.unitRisk;
    const maeR = unitRisk.isZero() ? 0 : maePoints.dividedBy(unitRisk).toNumber();
    const mfeR = unitRisk.isZero() ? 0 : mfePoints.dividedBy(unitRisk).toNumber();

    // All trades MFE bucket
    for (const b of mfeBuckets) {
      if (mfeR >= b.minR && (b.maxR === Infinity ? true : mfeR < b.maxR)) {
        b.count++;
        b.tradeIds.push(trade.tradeId);
        break;
      }
    }

    // Winners MAE bucket (actualNetPnL > 0)
    if (trade.actualNetPnL.greaterThan(0)) {
      for (const b of maeBuckets) {
        if (maeR >= b.minR && (b.maxR === Infinity ? true : maeR < b.maxR)) {
          b.count++;
          b.tradeIds.push(trade.tradeId);
          break;
        }
      }
    }
  }

  return {
    winnersMaeDistribution: maeBuckets,
    allTradesMfeDistribution: mfeBuckets,
  };
}
