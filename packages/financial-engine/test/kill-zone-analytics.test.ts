import { describe, it, expect } from 'vitest';
import {
  deriveKillZone,
  calculateKillZoneAnalytics,
  KillZoneTradeInput,
} from '../src/kill-zone-analytics.js';

describe('Kill-Zone Performance Analytics', () => {
  it('correctly classifies Forex trades into London and New York Kill-Zones', () => {
    // 08:30 UTC -> London Open Kill-Zone (07:00 - 10:00 UTC)
    expect(
      deriveKillZone({
        symbol: 'EURUSD',
        entryTime: '2026-11-20T08:30:00.000Z',
      })
    ).toBe('LONDON_OPEN');

    // 13:15 UTC -> New York Open Kill-Zone (12:00 - 15:00 UTC)
    expect(
      deriveKillZone({
        symbol: 'XAUUSD',
        entryTime: '2026-11-20T13:15:00.000Z',
      })
    ).toBe('NY_OPEN');

    // 16:00 UTC -> London Close Kill-Zone (15:00 - 17:00 UTC)
    expect(
      deriveKillZone({
        symbol: 'GBPUSD',
        entryTime: '2026-11-20T16:00:00.000Z',
      })
    ).toBe('LONDON_CLOSE');

    // 03:00 UTC -> Asian Session Range (00:00 - 07:00 UTC)
    expect(
      deriveKillZone({
        symbol: 'USDJPY',
        entryTime: '2026-11-20T03:00:00.000Z',
      })
    ).toBe('ASIA_SESSION');

    // 22:30 UTC -> Off-Hours Dead Zone
    expect(
      deriveKillZone({
        symbol: 'EURUSD',
        entryTime: '2026-11-20T22:30:00.000Z',
      })
    ).toBe('OFF_HOURS');
  });

  it('correctly classifies Indian market trades into NSE Opening, Mid-Day, and Power Hour', () => {
    // 09:30 IST is 04:00 UTC -> NSE Opening
    expect(
      deriveKillZone({
        symbol: 'NIFTY26NOVFUT',
        exchange: 'NSE',
        entryTime: '2026-11-20T04:00:00.000Z', // 09:30 IST
      })
    ).toBe('NSE_OPENING');

    // 12:00 IST is 06:30 UTC -> NSE Mid-day
    expect(
      deriveKillZone({
        symbol: 'BANKNIFTY26NOVFUT',
        exchange: 'NSE',
        entryTime: '2026-11-20T06:30:00.000Z', // 12:00 IST
      })
    ).toBe('NSE_MIDDAY');

    // 14:45 IST is 09:15 UTC -> NSE Power Hour
    expect(
      deriveKillZone({
        symbol: 'NIFTY26NOV24000CE',
        exchange: 'NSE',
        entryTime: '2026-11-20T09:15:00.000Z', // 14:45 IST
      })
    ).toBe('NSE_POWER_HOUR');

    // 19:30 IST is 14:00 UTC -> MCX Evening
    expect(
      deriveKillZone({
        symbol: 'CRUDEOIL26NOVFUT',
        exchange: 'MCX',
        entryTime: '2026-11-20T14:00:00.000Z', // 19:30 IST
      })
    ).toBe('MCX_EVENING');
  });

  it('calculates comprehensive Kill-Zone performance metrics with precision', () => {
    const mockTrades: KillZoneTradeInput[] = [
      // 3 trades in London Open (2 wins +$500, +$300, 1 loss -$200) -> Net +$600, 66.7% WR
      {
        id: 't1',
        symbol: 'XAUUSD',
        entryTime: '2026-11-20T07:45:00.000Z',
        netPnL: 500,
        realizedR: 2.5,
        status: 'CLOSED',
      },
      {
        id: 't2',
        symbol: 'XAUUSD',
        entryTime: '2026-11-20T08:15:00.000Z',
        netPnL: 300,
        realizedR: 1.5,
        status: 'CLOSED',
      },
      {
        id: 't3',
        symbol: 'EURUSD',
        entryTime: '2026-11-20T09:00:00.000Z',
        netPnL: -200,
        realizedR: -1.0,
        status: 'CLOSED',
      },

      // 2 trades in New York Open (2 wins +$800, +$400) -> Net +$1200, 100% WR
      {
        id: 't4',
        symbol: 'XAUUSD',
        entryTime: '2026-11-20T12:30:00.000Z',
        netPnL: 800,
        realizedR: 4.0,
        status: 'CLOSED',
      },
      {
        id: 't5',
        symbol: 'US30',
        entryTime: '2026-11-20T14:00:00.000Z',
        netPnL: 400,
        realizedR: 2.0,
        status: 'CLOSED',
      },

      // 2 trades in Dead Zone (2 losses -$400, -$300) -> Net -$700, 0% WR
      {
        id: 't6',
        symbol: 'XAUUSD',
        entryTime: '2026-11-20T22:30:00.000Z',
        netPnL: -400,
        realizedR: -2.0,
        status: 'CLOSED',
      },
      {
        id: 't7',
        symbol: 'EURUSD',
        entryTime: '2026-11-20T23:00:00.000Z',
        netPnL: -300,
        realizedR: -1.5,
        status: 'CLOSED',
      },
    ];

    const result = calculateKillZoneAnalytics(mockTrades);

    expect(result.killZones.length).toBe(3);

    const nyZone = result.killZones.find((z) => z.key === 'NY_OPEN');
    expect(nyZone).toBeDefined();
    expect(nyZone?.totalTrades).toBe(2);
    expect(nyZone?.netPnL).toBe(1200);
    expect(nyZone?.winRate).toBe(100);
    expect(nyZone?.profitFactor).toBe(999.99);
    expect(nyZone?.edgeRating).toBe('PRIME');

    const londonZone = result.killZones.find((z) => z.key === 'LONDON_OPEN');
    expect(londonZone).toBeDefined();
    expect(londonZone?.totalTrades).toBe(3);
    expect(londonZone?.netPnL).toBe(600);
    expect(londonZone?.winRate).toBe(66.7);
    expect(londonZone?.profitFactor).toBe(4.0);
    expect(londonZone?.edgeRating).toBe('PRIME');

    const deadZone = result.killZones.find((z) => z.key === 'OFF_HOURS');
    expect(deadZone).toBeDefined();
    expect(deadZone?.totalTrades).toBe(2);
    expect(deadZone?.netPnL).toBe(-700);
    expect(deadZone?.winRate).toBe(0);
    expect(deadZone?.edgeRating).toBe('LEAK');

    // Summary checks
    expect(result.overallSummary.bestKillZone?.key).toBe('NY_OPEN');
    expect(result.overallSummary.worstKillZone?.key).toBe('OFF_HOURS');
    expect(result.overallSummary.inMajorKillZones.totalTrades).toBe(5);
    expect(result.overallSummary.inMajorKillZones.netPnL).toBe(1800);
    expect(result.overallSummary.inMajorKillZones.winRate).toBe(80);
    expect(result.overallSummary.outsideMajorKillZones.totalTrades).toBe(2);
    expect(result.overallSummary.outsideMajorKillZones.netPnL).toBe(-700);
    expect(result.overallSummary.edgeDeltaPnL).toBe(2500);
    expect(result.overallSummary.edgeDeltaWinRate).toBe(80);
  });
});
