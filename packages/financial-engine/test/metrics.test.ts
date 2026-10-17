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
});
