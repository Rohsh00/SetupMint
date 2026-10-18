import { describe, it, expect } from 'vitest';
import {
  detectMistakeSuggestions,
  checkDailyLossBreach,
  calculateDailySessionSummary,
  ITradeSummaryForDetection,
} from '../src/mistakes.js';

describe('Financial Engine - Mistake Detection & Discipline Scoring', () => {
  it('flags REVENGE_TRADING when new trade is opened within 30m of a loss with larger or equal size', () => {
    const trades: ITradeSummaryForDetection[] = [
      {
        id: 'trade-1',
        symbol: 'NIFTY24OCT25000CE',
        status: 'CLOSED',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:00:00.000Z',
        quantity: 50,
        entryPrice: 120,
        exitPrice: 90,
        netPnL: -1500,
      },
      {
        id: 'trade-2',
        symbol: 'BANKNIFTY24OCT52000CE',
        status: 'OPEN',
        entryTime: '2026-10-18T10:15:00.000Z', // 15 mins after trade-1 exit
        quantity: 60, // larger size
        entryPrice: 250,
      },
    ];

    const result = detectMistakeSuggestions({ trades });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].rule).toBe('REVENGE_TRADING');
    expect(result.suggestions[0].mistakeTag).toBe('REVENGE_TRADING');
    expect(result.suggestions[0].tradeId).toBe('trade-2');
    expect(result.suggestions[0].severity).toBe('CRITICAL');
    expect(result.suggestions[0].message).toContain('within 15m of a losing trade');
  });

  it('does NOT flag revenge trading when previous trade was profitable or outside time window', () => {
    // Case 1: Previous trade was profitable
    const profitableTrades: ITradeSummaryForDetection[] = [
      {
        id: 't-win',
        symbol: 'RELIANCE',
        status: 'CLOSED',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:00:00.000Z',
        quantity: 100,
        entryPrice: 2500,
        exitPrice: 2550,
        netPnL: 5000,
      },
      {
        id: 't-next',
        symbol: 'TCS',
        status: 'OPEN',
        entryTime: '2026-10-18T10:10:00.000Z',
        quantity: 100,
        entryPrice: 3800,
      },
    ];

    const res1 = detectMistakeSuggestions({ trades: profitableTrades });
    expect(res1.suggestions.some((s) => s.rule === 'REVENGE_TRADING')).toBe(false);

    // Case 2: Outside revenge window (e.g. 45 mins later when threshold is 30m)
    const delayedTrades: ITradeSummaryForDetection[] = [
      {
        id: 't-loss',
        symbol: 'INFY',
        status: 'CLOSED',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:00:00.000Z',
        quantity: 100,
        entryPrice: 1900,
        exitPrice: 1850,
        netPnL: -5000,
      },
      {
        id: 't-later',
        symbol: 'WIPRO',
        status: 'OPEN',
        entryTime: '2026-10-18T11:00:00.000Z', // 60 mins later
        quantity: 200,
        entryPrice: 500,
      },
    ];

    const res2 = detectMistakeSuggestions({ trades: delayedTrades, thresholds: { revengeTradingMinutes: 30 } });
    expect(res2.suggestions.some((s) => s.rule === 'REVENGE_TRADING')).toBe(false);
  });

  it('flags OVERTRADING when daily trades count exceeds maxDailyTrades threshold', () => {
    const trades: ITradeSummaryForDetection[] = [];
    // Create 4 trades on 2026-10-18
    for (let i = 1; i <= 4; i++) {
      trades.push({
        id: `trade-${i}`,
        symbol: 'NIFTY',
        status: 'CLOSED',
        entryTime: `2026-10-18T09:${i * 10}:00.000Z`,
        exitTime: `2026-10-18T09:${i * 10 + 5}:00.000Z`,
        quantity: 25,
        entryPrice: 24000,
        exitPrice: 24020,
        netPnL: 500,
      });
    }

    // Threshold: max 3 trades per day
    const result = detectMistakeSuggestions({
      trades,
      thresholds: { maxDailyTrades: 3 },
    });

    const overtrading = result.suggestions.filter((s) => s.rule === 'OVERTRADING');
    expect(overtrading.length).toBeGreaterThanOrEqual(1);
    expect(overtrading[0].tradeId).toBe('trade-4');
    expect(overtrading[0].message).toContain('exceeds maximum allowed daily trades limit');
  });

  it('flags OVERTRADING when concurrent open positions exceed maxOpenTrades', () => {
    const trades: ITradeSummaryForDetection[] = [
      {
        id: 't1',
        symbol: 'TCS',
        status: 'OPEN',
        entryTime: '2026-10-18T09:15:00.000Z',
        quantity: 10,
        entryPrice: 3500,
      },
      {
        id: 't2',
        symbol: 'INFY',
        status: 'OPEN',
        entryTime: '2026-10-18T09:20:00.000Z',
        quantity: 20,
        entryPrice: 1800,
      },
      {
        id: 't3',
        symbol: 'HDFCBANK',
        status: 'OPEN',
        entryTime: '2026-10-18T09:25:00.000Z',
        quantity: 30,
        entryPrice: 1600,
      },
    ];

    // maxOpenTrades = 2, so trade t3 opens a 3rd concurrent position
    const result = detectMistakeSuggestions({
      trades,
      thresholds: { maxOpenTrades: 2, maxDailyTrades: 10 },
    });

    const overtrading = result.suggestions.filter((s) => s.message.includes('concurrent open'));
    expect(overtrading).toHaveLength(1);
    expect(overtrading[0].tradeId).toBe('t3');
  });

  it('flags SIZE_VIOLATION when risk percent exceeds maxRiskPerTradePercent', () => {
    const trades: ITradeSummaryForDetection[] = [
      {
        id: 'risk-high',
        symbol: 'NIFTY',
        status: 'OPEN',
        entryTime: '2026-10-18T09:30:00.000Z',
        quantity: 100,
        entryPrice: 24000,
        riskPercent: 3.5, // 3.5%
      },
    ];

    const result = detectMistakeSuggestions({
      trades,
      thresholds: { maxRiskPerTradePercent: 2.0 },
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].rule).toBe('SIZE_VIOLATION');
    expect(result.suggestions[0].mistakeTag).toBe('SIZE_VIOLATION');
    expect(result.suggestions[0].severity).toBe('CRITICAL');
  });

  it('detects maxDailyLoss breach accurately', () => {
    const closedTrades: ITradeSummaryForDetection[] = [
      {
        id: 'loss-1',
        symbol: 'NIFTY',
        status: 'CLOSED',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:00:00.000Z',
        quantity: 50,
        entryPrice: 200,
        exitPrice: 150,
        netPnL: -2500,
      },
      {
        id: 'loss-2',
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        entryTime: '2026-10-18T10:15:00.000Z',
        exitTime: '2026-10-18T11:00:00.000Z',
        quantity: 30,
        entryPrice: 400,
        exitPrice: 300,
        netPnL: -3000,
      },
    ];

    // Cumulative net loss: -5,500 INR. Threshold: 5,000 INR
    const breach = checkDailyLossBreach(closedTrades, 5000);
    expect(breach.breached).toBe(true);
    expect(breach.currentDailyLoss).toBe(5500);
    expect(breach.message).toContain('Maximum daily loss limit of ₹5,000 breached');

    // Threshold 6,000 INR -> not breached
    const noBreach = checkDailyLossBreach(closedTrades, 6000);
    expect(noBreach.breached).toBe(false);
  });

  it('calculates daily session prefill with best/worst trade and suggested discipline rating', () => {
    const trades: ITradeSummaryForDetection[] = [
      {
        id: 't-best',
        symbol: 'NIFTY24OCT25000CE',
        status: 'CLOSED',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:00:00.000Z',
        quantity: 50,
        entryPrice: 100,
        exitPrice: 180,
        netPnL: 4000,
        mistakes: [],
      },
      {
        id: 't-worst',
        symbol: 'BANKNIFTY24OCT52000PE',
        status: 'CLOSED',
        entryTime: '2026-10-18T11:00:00.000Z',
        exitTime: '2026-10-18T11:30:00.000Z',
        quantity: 30,
        entryPrice: 200,
        exitPrice: 160,
        netPnL: -1200,
        mistakes: ['CHASED_MARKET'],
      },
    ];

    const prefill = calculateDailySessionSummary('2026-10-18', trades);

    expect(prefill.date).toBe('2026-10-18');
    expect(prefill.tradesCount).toBe(2);
    expect(prefill.netPnL).toBe(2800);
    expect(prefill.suggestedBestTrade).toEqual({
      id: 't-best',
      symbol: 'NIFTY24OCT25000CE',
      netPnL: 4000,
    });
    expect(prefill.suggestedWorstTrade).toEqual({
      id: 't-worst',
      symbol: 'BANKNIFTY24OCT52000PE',
      netPnL: -1200,
    });
    expect(prefill.aggregatedMistakes).toContain('CHASED_MARKET');
    expect(prefill.suggestedDisciplineRating).toBe(3); // Logged mistake present
  });
});
