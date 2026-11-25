import { describe, it, expect } from 'vitest';
import { calculateDashboardMetrics, PerformanceInputTrade } from '../src/metrics.js';

describe('Financial Engine - Performance Metrics & Analytics', () => {
  it('correctly calculates win rate, profit factor, expectancy, streaks, and max drawdown', () => {
    // 5 trades:
    // 1: +5000 (Win) -> Peak 105,000, DD 0
    // 2: -2000 (Loss) -> Equity 103,000, DD 2000 (1.9%)
    // 3: -3000 (Loss) -> Equity 100,000, DD 5000 (4.76%)
    // 4: +8000 (Win) -> Equity 108,000, Peak 108,000, DD 0
    // 5: +4000 (Win) -> Equity 112,000, Peak 112,000, DD 0
    // Initial balance: 100,000
    // Total Net P&L = 5000 - 2000 - 3000 + 8000 + 4000 = 12,000
    // Wins = 3, Losses = 2. Win rate = (3/5)*100 = 60%
    // Gross Profits = 5000 + 8000 + 4000 = 17,000. Avg Win = 17000 / 3 = 5666.67
    // Gross Losses = 2000 + 3000 = 5000. Avg Loss = 5000 / 2 = 2500.00
    // Profit factor = 17000 / 5000 = 3.4
    // Expectancy = 12000 / 5 = 2400.00
    // Max DD amount = 5,000. Max DD % = (5000 / 105000) * 100 = 4.76%
    // Max win streak = 2 (trades 4, 5). Max loss streak = 2 (trades 2, 3)

    const trades: PerformanceInputTrade[] = [
      {
        id: 't1',
        tradeDate: '2026-10-01',
        symbol: 'NIFTY',
        status: 'CLOSED',
        calculated: { netPnL: 5000, grossPnL: 5100, totalCosts: 100, outcome: 'WIN', realizedRMultiple: 2.0 },
        psychology: { rulesFollowed: true },
      },
      {
        id: 't2',
        tradeDate: '2026-10-02',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        calculated: { netPnL: -2000, grossPnL: -1950, totalCosts: 50, outcome: 'LOSS', realizedRMultiple: -1.0 },
        psychology: { rulesFollowed: true },
      },
      {
        id: 't3',
        tradeDate: '2026-10-03',
        symbol: 'RELIANCE',
        status: 'CLOSED',
        calculated: { netPnL: -3000, grossPnL: -2900, totalCosts: 100, outcome: 'LOSS', realizedRMultiple: -1.5 },
        psychology: { rulesFollowed: false },
      },
      {
        id: 't4',
        tradeDate: '2026-10-04',
        symbol: 'NIFTY',
        status: 'CLOSED',
        calculated: { netPnL: 8000, grossPnL: 8120, totalCosts: 120, outcome: 'WIN', realizedRMultiple: 3.2 },
        psychology: { rulesFollowed: true },
      },
      {
        id: 't5',
        tradeDate: '2026-10-05',
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        calculated: { netPnL: 4000, grossPnL: 4150, totalCosts: 150, outcome: 'WIN', realizedRMultiple: 1.6 },
        psychology: { rulesFollowed: true },
      },
    ];

    const stats = calculateDashboardMetrics(trades, 100000);

    expect(stats.netPnL).toBe(12000);
    expect(stats.closedTradesCount).toBe(5);
    expect(stats.winningTradesCount).toBe(3);
    expect(stats.losingTradesCount).toBe(2);
    expect(stats.winRate).toBe(60);
    expect(stats.avgWinningTrade).toBeCloseTo(5666.67, 1);
    expect(stats.avgLosingTrade).toBe(2500);
    expect(stats.profitFactor).toBe(3.4);
    expect(stats.expectancy).toBe(2400);
    expect(stats.maxDrawdownAmount).toBe(5000);
    expect(stats.maxDrawdownPercent).toBeCloseTo(4.76, 1);
    expect(stats.maxConsecutiveWins).toBe(2);
    expect(stats.maxConsecutiveLosses).toBe(2);
    expect(stats.ruleAdherencePercent).toBe(80); // 4 out of 5 followed rules
  });

  it('handles empty trades list safely without division by zero errors', () => {
    const stats = calculateDashboardMetrics([], 50000);

    expect(stats.closedTradesCount).toBe(0);
    expect(stats.netPnL).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.profitFactor).toBe(0);
    expect(stats.expectancy).toBe(0);
    expect(stats.maxDrawdownAmount).toBe(0);
    expect(stats.equityCurve.length).toBe(1);
    expect(stats.equityCurve[0].cumulativeEquity).toBe(50000);
  });

  it('correctly groups multiple trades on the same day with ISO timestamps into a single dailyPnL entry', () => {
    const trades: PerformanceInputTrade[] = [
      {
        id: 'trade-1',
        tradeDate: '2026-11-17T09:15:00.000Z',
        symbol: 'EURUSD',
        status: 'CLOSED',
        calculated: { netPnL: 150, grossPnL: 160, totalCosts: 10, outcome: 'WIN', realizedRMultiple: 1.5 },
      },
      {
        id: 'trade-2',
        tradeDate: '2026-11-17T11:30:22.848Z',
        symbol: 'GBPUSD',
        status: 'CLOSED',
        calculated: { netPnL: -50, grossPnL: -45, totalCosts: 5, outcome: 'LOSS', realizedRMultiple: -0.5 },
      },
      {
        id: 'trade-3',
        tradeDate: '2026-11-17T14:45:10.123Z',
        symbol: 'EURUSD',
        status: 'CLOSED',
        calculated: { netPnL: 200, grossPnL: 210, totalCosts: 10, outcome: 'WIN', realizedRMultiple: 2.0 },
      },
      {
        id: 'trade-4',
        tradeDate: '2026-11-18T10:00:00.000Z',
        symbol: 'USDJPY',
        status: 'CLOSED',
        calculated: { netPnL: 75, grossPnL: 80, totalCosts: 5, outcome: 'WIN', realizedRMultiple: 0.75 },
      },
    ];

    const stats = calculateDashboardMetrics(trades, 10000, { timezone: 'UTC' });

    // Expect exactly 2 daily bars: 2026-11-17 and 2026-11-18
    expect(stats.dailyPnL).toHaveLength(2);
    expect(stats.dailyPnL[0].date).toBe('2026-11-17');
    expect(stats.dailyPnL[0].tradesCount).toBe(3);
    expect(stats.dailyPnL[0].winCount).toBe(2);
    expect(stats.dailyPnL[0].lossCount).toBe(1);
    expect(stats.dailyPnL[0].netPnL).toBe(300); // 150 - 50 + 200

    expect(stats.dailyPnL[1].date).toBe('2026-11-18');
    expect(stats.dailyPnL[1].tradesCount).toBe(1);
    expect(stats.dailyPnL[1].netPnL).toBe(75);

    // Best trading day should be 2026-11-17 with 300 net PnL
    expect(stats.bestTradingDay?.date).toBe('2026-11-17');
    expect(stats.bestTradingDay?.netPnL).toBe(300);
  });

  it('correctly processes external cash flows during and after trades for drawdown and equity curve', () => {
    const trades: PerformanceInputTrade[] = [
      {
        id: 'trade-1',
        tradeDate: '2026-11-10T10:00:00.000Z',
        symbol: 'XAUUSD',
        status: 'CLOSED',
        calculated: { netPnL: 50, grossPnL: 50, totalCosts: 0, outcome: 'WIN' },
      },
      {
        id: 'trade-2',
        tradeDate: '2026-11-11T10:00:00.000Z',
        symbol: 'XAUUSD',
        status: 'CLOSED',
        calculated: { netPnL: 20, grossPnL: 20, totalCosts: 0, outcome: 'WIN' },
      },
    ];

    // Starting 100 + trade1 (+50) = 150 -> withdrawal of 30 on 10 Nov -> equity 120, peak 120 (0 drawdown)
    // trade2 (+20) = 140 -> withdrawal of 40 on 12 Nov (after trades) -> equity 100
    const stats = calculateDashboardMetrics(trades, 100, {
      timezone: 'UTC',
      cashFlows: [
        { date: '2026-11-10T15:00:00.000Z', signedAmount: -30, currency: 'USD' },
        { date: '2026-11-12T10:00:00.000Z', signedAmount: -40, currency: 'USD' },
      ],
    });

    // Final equity should be 100 + 50 - 30 + 20 - 40 = 100
    const finalPt = stats.equityCurve[stats.equityCurve.length - 1];
    expect(finalPt.cumulativeEquity).toBe(100);
    // Cash withdrawal should not create artificial drawdown
    expect(stats.maxDrawdownAmount).toBe(0);
  });

  it('generates adaptive micro-lot P&L distribution buckets for Elefin USD trades', () => {
    // 5 micro-lot XAUUSD trades like in Elefin:
    // -2.28, -0.40, +6.10, +2.07, -5.44
    const elefinTrades: PerformanceInputTrade[] = [
      { id: 'e1', tradeDate: '2026-11-09T19:01:00Z', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: -2.28, grossPnL: -2.28, totalCosts: 0, outcome: 'LOSS' } },
      { id: 'e2', tradeDate: '2026-11-09T19:10:00Z', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: -0.40, grossPnL: -0.40, totalCosts: 0, outcome: 'LOSS' } },
      { id: 'e3', tradeDate: '2026-11-09T20:14:00Z', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: 6.10, grossPnL: 6.10, totalCosts: 0, outcome: 'WIN' } },
      { id: 'e4', tradeDate: '2026-11-10T08:30:00Z', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: 2.07, grossPnL: 2.07, totalCosts: 0, outcome: 'WIN' } },
      { id: 'e5', tradeDate: '2026-11-10T07:27:00Z', symbol: 'XAUUSD', status: 'CLOSED', calculated: { netPnL: -5.44, grossPnL: -5.44, totalCosts: 0, outcome: 'LOSS' } },
    ];

    const stats = calculateDashboardMetrics(elefinTrades, 27, { currency: 'USD', timezone: 'UTC' });

    // Assert that distribution ranges are micro-scale (-10 to -5, -5 to 0, 0 to 5, 5 to 10) instead of collapsed INR -1000..0
    expect(stats.pnlDistribution.map((b) => b.range)).toEqual([
      '< -10',
      '-10 to -5',
      '-5 to 0',
      '0 to 5',
      '5 to 10',
      '> 10',
    ]);

    // Check counts:
    // -5.44 -> in '-10 to -5'
    // -2.28, -0.40 -> in '-5 to 0' (2 trades)
    // +2.07 -> in '0 to 5' (1 trade)
    // +6.10 -> in '5 to 10' (1 trade)
    const countMap = Object.fromEntries(stats.pnlDistribution.map((b) => [b.range, b.count]));
    expect(countMap['-10 to -5']).toBe(1);
    expect(countMap['-5 to 0']).toBe(2);
    expect(countMap['0 to 5']).toBe(1);
    expect(countMap['5 to 10']).toBe(1);
    expect(countMap['< -10']).toBe(0);
    expect(countMap['> 10']).toBe(0);
  });
});
