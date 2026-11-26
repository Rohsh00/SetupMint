import { describe, it, expect } from 'vitest';
import {
  calculateActionableSummary,
  IActionableSummaryTradeInput,
} from '../src/actionable-summary.js';

describe('calculateActionableSummary', () => {
  it('handles empty trades gracefully with safe fallbacks and zero crash', () => {
    const report = calculateActionableSummary([]);

    expect(report).toBeDefined();
    expect(report.scorecard.totalClosedTrades).toBe(0);
    expect(report.scorecard.netPnL).toBe(0);
    expect(report.scorecard.winRate).toBe(0);
    expect(report.scorecard.hasSufficientData).toBe(false);
    expect(report.dos.length).toBeGreaterThan(0);
    expect(report.donts.length).toBeGreaterThan(0);
    expect(report.priorityDirectives.length).toBeGreaterThan(0);
    expect(report.circuitBreakers.maxDailyLossR).toBe(2.0);
    expect(report.deskCheatSheet.preTradeChecklist.length).toBeGreaterThan(0);
  });

  it('detects mistake leaks (STOP_MOVED, REVENGE_TRADING) and calculates preventable loss', () => {
    const sampleTrades: IActionableSummaryTradeInput[] = [
      {
        id: 't1',
        tradeDate: '2026-11-01T09:30:00Z',
        symbol: 'NIFTY',
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 50,
        calculated: { netPnL: 500, realizedRMultiple: 2.0, outcome: 'WIN' },
        psychology: { rulesFollowed: true, disciplineScore: 5 },
      },
      {
        id: 't2',
        tradeDate: '2026-11-01T10:30:00Z',
        symbol: 'NIFTY',
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 50,
        calculated: { netPnL: -600, realizedRMultiple: -2.4, outcome: 'LOSS' },
        psychology: {
          rulesFollowed: false,
          disciplineScore: 1,
          stopLossMoved: true,
          mistakes: ['STOP_MOVED'],
        },
      },
      {
        id: 't3',
        tradeDate: '2026-11-01T11:00:00Z',
        symbol: 'NIFTY',
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 100,
        calculated: { netPnL: -800, realizedRMultiple: -3.2, outcome: 'LOSS' },
        psychology: {
          rulesFollowed: false,
          disciplineScore: 1,
          revengeTrading: true,
          mistakes: ['REVENGE_TRADING'],
        },
      },
      {
        id: 't4',
        tradeDate: '2026-11-02T09:30:00Z',
        symbol: 'NIFTY',
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 50,
        calculated: { netPnL: -500, realizedRMultiple: -2.0, outcome: 'LOSS' },
        psychology: {
          rulesFollowed: false,
          disciplineScore: 2,
          stopLossMoved: true,
          mistakes: ['STOP_MOVED'],
        },
      },
      {
        id: 't5',
        tradeDate: '2026-11-03T09:30:00Z',
        symbol: 'NIFTY',
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 50,
        calculated: { netPnL: 600, realizedRMultiple: 2.4, outcome: 'WIN' },
        psychology: { rulesFollowed: true, disciplineScore: 5 },
      },
    ];

    const report = calculateActionableSummary(sampleTrades, { currency: 'INR' });

    expect(report.scorecard.totalClosedTrades).toBe(5);
    expect(report.scorecard.hasSufficientData).toBe(true);
    // Preventable loss is -600 + -800 + -500 = 1900
    expect(report.scorecard.totalPreventableLoss).toBe(1900);
    expect(report.scorecard.currency).toBe('INR');

    // Should generate DONT for STOP_MOVED and REVENGE_TRADING
    const stopMovedDont = report.donts.find((d) => d.id.includes('stop_moved'));
    expect(stopMovedDont).toBeDefined();
    expect(stopMovedDont?.metrics.leakPnL).toBe(1100);
    expect(stopMovedDont?.metrics.occurrences).toBe(2);

    const revengeDont = report.donts.find((d) => d.id.includes('revenge_trading'));
    expect(revengeDont).toBeDefined();
    expect(revengeDont?.metrics.leakPnL).toBe(800);
  });

  it('identifies winning asset as DO and losing asset as DONT', () => {
    const trades: IActionableSummaryTradeInput[] = [
      // XAUUSD: 4 trades, 3 wins, 1 loss, net +$1200
      { id: '1', tradeDate: '2026-11-01', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: 500, realizedRMultiple: 2.5 } },
      { id: '2', tradeDate: '2026-11-02', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: 400, realizedRMultiple: 2.0 } },
      { id: '3', tradeDate: '2026-11-03', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: 500, realizedRMultiple: 2.5 } },
      { id: '4', tradeDate: '2026-11-04', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: -200, realizedRMultiple: -1.0 } },
      // EURUSD: 4 trades, 1 win, 3 losses, net -$700
      { id: '5', tradeDate: '2026-11-01', symbol: 'EURUSD', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0 } },
      { id: '6', tradeDate: '2026-11-02', symbol: 'EURUSD', status: 'CLOSED', calculated: { netPnL: -300, realizedRMultiple: -1.0 } },
      { id: '7', tradeDate: '2026-11-03', symbol: 'EURUSD', status: 'CLOSED', calculated: { netPnL: -250, realizedRMultiple: -1.0 } },
      { id: '8', tradeDate: '2026-11-04', symbol: 'EURUSD', status: 'CLOSED', calculated: { netPnL: -250, realizedRMultiple: -1.0 } },
    ];

    const report = calculateActionableSummary(trades, { currency: 'USD' });

    const xauDo = report.dos.find((d) => d.category === 'INSTRUMENT' && d.title.includes('XAUUSD'));
    expect(xauDo).toBeDefined();
    expect(xauDo?.metrics.winRate).toBe(75);
    expect(xauDo?.metrics.netPnL).toBe(1200);

    const eurusdDont = report.donts.find((d) => d.category === 'INSTRUMENT' && d.title.includes('EURUSD'));
    expect(eurusdDont).toBeDefined();
    expect(eurusdDont?.metrics.leakPnL).toBe(700);
  });

  it('detects directional edge asymmetry (Long alpha vs Short drag)', () => {
    const trades: IActionableSummaryTradeInput[] = [
      // 4 Longs: 4 wins
      { id: '1', tradeDate: '2026-11-01', symbol: 'NIFTY', direction: 'LONG', status: 'CLOSED', calculated: { netPnL: 300, realizedRMultiple: 1.5 } },
      { id: '2', tradeDate: '2026-11-02', symbol: 'NIFTY', direction: 'LONG', status: 'CLOSED', calculated: { netPnL: 400, realizedRMultiple: 2.0 } },
      { id: '3', tradeDate: '2026-11-03', symbol: 'NIFTY', direction: 'LONG', status: 'CLOSED', calculated: { netPnL: 200, realizedRMultiple: 1.0 } },
      { id: '4', tradeDate: '2026-11-04', symbol: 'NIFTY', direction: 'LONG', status: 'CLOSED', calculated: { netPnL: 350, realizedRMultiple: 1.8 } },
      // 4 Shorts: 1 win, 3 losses
      { id: '5', tradeDate: '2026-11-01', symbol: 'NIFTY', direction: 'SHORT', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0 } },
      { id: '6', tradeDate: '2026-11-02', symbol: 'NIFTY', direction: 'SHORT', status: 'CLOSED', calculated: { netPnL: -300, realizedRMultiple: -1.0 } },
      { id: '7', tradeDate: '2026-11-03', symbol: 'NIFTY', direction: 'SHORT', status: 'CLOSED', calculated: { netPnL: -400, realizedRMultiple: -1.2 } },
      { id: '8', tradeDate: '2026-11-04', symbol: 'NIFTY', direction: 'SHORT', status: 'CLOSED', calculated: { netPnL: -250, realizedRMultiple: -1.0 } },
    ];

    const report = calculateActionableSummary(trades);

    const shortDont = report.donts.find((d) => d.id === 'dont-direction-short-bias');
    expect(shortDont).toBeDefined();
    expect(shortDont?.metrics.leakPnL).toBe(850);

    const longDo = report.dos.find((d) => d.id === 'do-direction-long-focus');
    expect(longDo).toBeDefined();
    expect(longDo?.metrics.winRate).toBe(100);
  });

  it('detects overtrading on Trade #3+ and recommends daily trade cap', () => {
    const trades: IActionableSummaryTradeInput[] = [
      // Day 1: Trades 1 & 2 Win, Trade 3 Losses
      { id: '1', tradeDate: '2026-11-01', entryTime: '2026-11-01T09:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 300 } },
      { id: '2', tradeDate: '2026-11-01', entryTime: '2026-11-01T10:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 400 } },
      { id: '3', tradeDate: '2026-11-01', entryTime: '2026-11-01T14:00:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: -500 } },
      // Day 2: Trades 1 & 2 Win, Trade 3 Losses
      { id: '4', tradeDate: '2026-11-02', entryTime: '2026-11-02T09:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 200 } },
      { id: '5', tradeDate: '2026-11-02', entryTime: '2026-11-02T10:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 350 } },
      { id: '6', tradeDate: '2026-11-02', entryTime: '2026-11-02T14:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: -450 } },
      // Day 3: Trade 3 and 4 Losses
      { id: '7', tradeDate: '2026-11-03', entryTime: '2026-11-03T09:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 150 } },
      { id: '8', tradeDate: '2026-11-03', entryTime: '2026-11-03T10:00:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 250 } },
      { id: '9', tradeDate: '2026-11-03', entryTime: '2026-11-03T13:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: -400 } },
      { id: '10', tradeDate: '2026-11-03', entryTime: '2026-11-03T14:30:00Z', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: -300 } },
    ];

    const report = calculateActionableSummary(trades);

    const overtradingDont = report.donts.find((d) => d.id === 'dont-overtrading-trade3plus');
    expect(overtradingDont).toBeDefined();
    expect(overtradingDont?.metrics.leakPnL).toBe(1650);
    expect(report.circuitBreakers.maxDailyTrades).toBe(2);
  });

  it('incorporates MFE excursion into target discipline DO', () => {
    const trades: IActionableSummaryTradeInput[] = [
      { id: '1', tradeDate: '2026-11-01', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.2 } } },
      { id: '2', tradeDate: '2026-11-02', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.4 } } },
      { id: '3', tradeDate: '2026-11-03', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.1 } } },
      { id: '4', tradeDate: '2026-11-04', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.5 } } },
      { id: '5', tradeDate: '2026-11-05', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.3 } } },
      { id: '6', tradeDate: '2026-11-06', symbol: 'NIFTY', status: 'CLOSED', calculated: { netPnL: 100, realizedRMultiple: 1.0, excursion: { mfeR: 2.0 } } },
    ];

    const report = calculateActionableSummary(trades);

    const targetDo = report.dos.find((d) => d.id === 'do-execution-target-mfe');
    expect(targetDo).toBeDefined();
    expect(targetDo?.instruction).toContain('take-profit target at 2.3R');
  });
});

