import { describe, it, expect } from 'vitest';
import { cumulativeRCurve, CumulativeRTradeInput } from '../src/cumulative-r.js';

describe('cumulativeRCurve Engine', () => {
  it('1. Handles empty trades list gracefully', () => {
    const res = cumulativeRCurve([]);
    expect(res.curve).toHaveLength(0);
    expect(res.totalTrades).toBe(0);
    expect(res.eligibleTrades).toBe(0);
    expect(res.coveragePercent).toBe(0);
  });

  it('2. Excludes OPEN and PLANNED trades with documented reasons', () => {
    const trades: CumulativeRTradeInput[] = [
      {
        id: 'T1',
        tradeDate: '2026-02-01',
        symbol: 'NIFTY',
        status: 'OPEN',
        calculated: { realizedRMultiple: 1.5 },
      },
      {
        id: 'T2',
        tradeDate: '2026-02-02',
        symbol: 'NIFTY',
        status: 'CLOSED',
        calculated: { realizedRMultiple: 2.0 },
      },
    ];

    const res = cumulativeRCurve(trades);
    expect(res.totalTrades).toBe(2);
    expect(res.eligibleTrades).toBe(1);
    expect(res.excludedTrades).toBe(1);
    expect(res.exclusionReasons[0]).toContain('status is not CLOSED (OPEN)');
    expect(res.curve).toHaveLength(2); // anchor 0R + T2 (2R)
    expect(res.curve[1].cumulativeR).toBe(2.0);
  });

  it('3. Excludes trades without planned risk or realized R without zeroing', () => {
    const trades: CumulativeRTradeInput[] = [
      {
        id: 'T1',
        tradeDate: '2026-03-01',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        netPnL: 5000,
        // no plannedRiskAmount, no realizedRMultiple
      },
      {
        id: 'T2',
        tradeDate: '2026-03-02',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        netPnL: 4000,
        plannedRiskAmount: 2000, // R = 2.0
      },
    ];

    const res = cumulativeRCurve(trades);
    expect(res.eligibleTrades).toBe(1);
    expect(res.excludedTrades).toBe(1);
    expect(res.exclusionReasons[0]).toContain('missing valid realized R-multiple or planned risk amount');
    expect(res.coveragePercent).toBe(50.0);
    expect(res.curve[1].rMultiple).toBe(2.0);
    expect(res.curve[1].cumulativeR).toBe(2.0);
  });

  it('4. Realized R accumulates accurately with Decimal.js', () => {
    const trades: CumulativeRTradeInput[] = [
      {
        id: 'T1',
        tradeDate: '2026-04-01',
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        calculated: { realizedRMultiple: 1.15 },
      },
      {
        id: 'T2',
        tradeDate: '2026-04-02',
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        calculated: { realizedRMultiple: -1.0 },
      },
      {
        id: 'T3',
        tradeDate: '2026-04-03',
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        calculated: { realizedRMultiple: 2.85 },
      },
    ];

    const res = cumulativeRCurve(trades);
    expect(res.eligibleTrades).toBe(3);
    // 0 -> +1.15 -> +0.15 -> +3.00
    expect(res.curve[1].cumulativeR).toBe(1.15);
    expect(res.curve[2].cumulativeR).toBe(0.15);
    expect(res.curve[3].cumulativeR).toBe(3.0);
  });
});
