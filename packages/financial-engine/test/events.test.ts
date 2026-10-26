import { describe, it, expect } from 'vitest';
import { calculateDailyEventMarkers } from '../src/events.js';

describe('calculateDailyEventMarkers Engine', () => {
  it('1. Detects daily loss breach days accurately against maxDailyLoss', () => {
    const trades = [
      {
        id: 'T1',
        tradeDate: '2026-05-01',
        symbol: 'NIFTY',
        status: 'CLOSED',
        netPnL: -3000,
      },
      {
        id: 'T2',
        tradeDate: '2026-05-01',
        symbol: 'NIFTY',
        status: 'CLOSED',
        netPnL: -2500, // Total = -5,500 on May 1
      },
      {
        id: 'T3',
        tradeDate: '2026-05-02',
        symbol: 'NIFTY',
        status: 'CLOSED',
        netPnL: 1000,
      },
    ];

    const res = calculateDailyEventMarkers(trades, 5000);
    expect(res.breachDays).toHaveLength(1);
    expect(res.breachDays[0].date).toBe('2026-05-01');
    expect(res.breachDays[0].currentDailyLoss).toBe(5500);
    expect(res.breachDays[0].breachAmount).toBe(500);
  });

  it('2. Evaluates continuous tilt and marks first trade reaching score >= 61', () => {
    // 3 consecutive losses with large size escalation and rapid entry
    const trades = [
      {
        id: 'T1',
        tradeDate: '2026-06-01T09:30:00Z',
        entryTime: '2026-06-01T09:30:00Z',
        exitTime: '2026-06-01T09:40:00Z',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        quantity: 15,
        netPnL: -2000,
      },
      {
        id: 'T2',
        tradeDate: '2026-06-01T09:42:00Z',
        entryTime: '2026-06-01T09:42:00Z',
        exitTime: '2026-06-01T09:50:00Z',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        quantity: 15,
        netPnL: -2500,
      },
      {
        id: 'T3',
        tradeDate: '2026-06-01T09:52:00Z',
        entryTime: '2026-06-01T09:52:00Z',
        exitTime: '2026-06-01T10:00:00Z',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        quantity: 60, // 4x size escalation
        netPnL: -5000,
      },
    ];

    const res = calculateDailyEventMarkers(trades, 5000);
    expect(res.tiltDays).toHaveLength(1);
    expect(res.tiltDays[0].tradeId).toBe('T3');
    expect(res.tiltDays[0].score).toBeGreaterThanOrEqual(61);
    expect(res.tiltDays[0].components.lossStreakScore).toBeGreaterThan(0);
    expect(res.tiltDays[0].components.sizeEscalationScore).toBeGreaterThan(0);
  });
});
