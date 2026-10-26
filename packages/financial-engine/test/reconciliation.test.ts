import { describe, it, expect } from 'vitest';
import { calculateDrilldownAggregate } from '../src/reconciliation.js';

describe('calculateDrilldownAggregate Reconciliation Engine', () => {
  it('1. Computes exact Decimal.js sums, win rate, and avg R', () => {
    const trades = [
      {
        id: '1',
        status: 'CLOSED',
        netPnL: 1250.55,
        grossPnL: 1300.0,
        totalCosts: 49.45,
        realizedRMultiple: 1.25,
      },
      {
        id: '2',
        status: 'CLOSED',
        netPnL: -1000.0,
        grossPnL: -950.0,
        totalCosts: 50.0,
        realizedRMultiple: -1.0,
      },
      {
        id: '3',
        status: 'CLOSED',
        netPnL: 2500.45,
        grossPnL: 2560.0,
        totalCosts: 59.55,
        realizedRMultiple: 2.5,
      },
    ];

    const agg = calculateDrilldownAggregate(trades);
    // 1250.55 - 1000 + 2500.45 = 2751.00
    expect(agg.count).toBe(3);
    expect(agg.closedCount).toBe(3);
    expect(agg.netPnL).toBe(2751.0);
    // 2 wins out of 3 = 66.67%
    expect(agg.winRate).toBe(66.67);
    expect(agg.winsCount).toBe(2);
    expect(agg.lossesCount).toBe(1);
    // (1.25 - 1.0 + 2.5) / 3 = 2.75 / 3 = 0.92
    expect(agg.avgR).toBe(0.92);
  });

  it('2. Distinguishes OPEN trades from CLOSED trades in win rate', () => {
    const trades = [
      {
        id: '1',
        status: 'OPEN',
        netPnL: 500,
      },
      {
        id: '2',
        status: 'CLOSED',
        netPnL: 1000,
      },
    ];

    const agg = calculateDrilldownAggregate(trades);
    expect(agg.count).toBe(2);
    expect(agg.closedCount).toBe(1);
    expect(agg.winRate).toBe(100);
  });
});
