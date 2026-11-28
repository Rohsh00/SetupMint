import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiCoachService } from '../src/services/ai-coach.service.js';

describe('AiCoachService - Deterministic Quant Engine (100% Free / Zero-Cost)', () => {
  it('handles empty trading days with zero crashes and patience recognition', () => {
    const debrief = AiCoachService.analyzeQuantitativeMetrics('2026-11-28', []);
    expect(debrief.date).toBe('2026-11-28');
    expect(debrief.disciplineScore).toBe(5);
    expect(debrief.verdict).toBe('NO_TRADING_ACTIVITY');
    expect(debrief.isAiGenerated).toBe(false);
    expect(debrief.modelUsed).toContain('Quant Engine');
    expect(debrief.ruleForTomorrow).toBeTruthy();
  });

  it('evaluates a winning disciplined session with high score', () => {
    const mockTrades = [
      {
        symbol: 'XAUUSD',
        status: 'CLOSED',
        direction: 'BUY',
        calculated: {
          netPnL: 350,
          realizedRMultiple: 2.1,
          excursion: { maxFavorableR: 2.4, maxAdverseR: 0.3 },
        },
        simpleExecution: { quantity: 0.1 },
        entryTime: new Date('2026-11-28T13:30:00Z'),
        exitTime: new Date('2026-11-28T14:15:00Z'),
      },
      {
        symbol: 'XAUUSD',
        status: 'CLOSED',
        direction: 'SELL',
        calculated: {
          netPnL: 180,
          realizedRMultiple: 1.2,
          excursion: { maxFavorableR: 1.5, maxAdverseR: 0.2 },
        },
        simpleExecution: { quantity: 0.1 },
        entryTime: new Date('2026-11-28T15:00:00Z'),
        exitTime: new Date('2026-11-28T15:45:00Z'),
      },
    ];

    const debrief = AiCoachService.analyzeQuantitativeMetrics('2026-11-28', mockTrades, {
      maxDailyTrades: 5,
      maxDailyLoss: 500,
    });

    expect(debrief.disciplineScore).toBe(5);
    expect(debrief.verdict).toBe('EXEMPLARY_EDGE_MONETIZATION');
    expect(debrief.strengths.length).toBeGreaterThan(0);
    expect(debrief.leaks.length).toBe(0);
  });

  it('detects severe profit giveback (reaching +2.5R but exiting at breakeven/loss)', () => {
    const mockTrades = [
      {
        symbol: 'NIFTY',
        status: 'CLOSED',
        direction: 'BUY',
        calculated: {
          netPnL: -20,
          realizedRMultiple: -0.1,
          excursion: { maxFavorableR: 2.5, maxAdverseR: 0.8 },
        },
        simpleExecution: { quantity: 50 },
        entryTime: new Date('2026-11-28T09:30:00Z'),
        exitTime: new Date('2026-11-28T11:00:00Z'),
      },
    ];

    const debrief = AiCoachService.analyzeQuantitativeMetrics('2026-11-28', mockTrades);

    expect(debrief.disciplineScore).toBeLessThanOrEqual(3);
    expect(debrief.verdict).toBe('RULE_DRIFT_AND_GIVEBACK');
    expect(debrief.leaks.some((l) => l.includes('Surrendered'))).toBe(true);
    expect(debrief.ruleForTomorrow).toContain('breakeven');
  });

  it('detects Martingale sizing escalation after a losing trade', () => {
    const mockTrades = [
      {
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        direction: 'BUY',
        calculated: {
          netPnL: -4500,
          realizedRMultiple: -1.0,
        },
        simpleExecution: { quantity: 100 },
        entryTime: new Date('2026-11-28T17:00:00Z'),
        exitTime: new Date('2026-11-28T17:30:00Z'),
      },
      {
        symbol: 'CRUDEOIL',
        status: 'CLOSED',
        direction: 'BUY',
        calculated: {
          netPnL: -9000,
          realizedRMultiple: -1.0,
        },
        simpleExecution: { quantity: 200 }, // 2x position size!
        entryTime: new Date('2026-11-28T17:35:00Z'),
        exitTime: new Date('2026-11-28T18:00:00Z'),
      },
    ];

    const debrief = AiCoachService.analyzeQuantitativeMetrics('2026-11-28', mockTrades);

    expect(debrief.disciplineScore).toBe(1);
    expect(debrief.verdict).toBe('CRITICAL_TILT_BREACH');
    expect(debrief.leaks.some((l) => l.includes('Martingale') || l.includes('size'))).toBe(true);
    expect(debrief.ruleForTomorrow).toContain('lot size cap');
  });

  it('detects rapid revenge re-entry within 15 minutes of being stopped out', () => {
    const mockTrades = [
      {
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        direction: 'BUY',
        calculated: {
          netPnL: -2500,
          realizedRMultiple: -1.0,
        },
        simpleExecution: { quantity: 30 },
        entryTime: new Date('2026-11-28T10:00:00Z'),
        exitTime: new Date('2026-11-28T10:20:00Z'),
      },
      {
        symbol: 'BANKNIFTY',
        status: 'CLOSED',
        direction: 'SELL',
        calculated: {
          netPnL: 500,
          realizedRMultiple: 0.2,
        },
        simpleExecution: { quantity: 30 },
        entryTime: new Date('2026-11-28T10:25:00Z'), // 5 minutes after stop out
        exitTime: new Date('2026-11-28T11:00:00Z'),
      },
    ];

    const debrief = AiCoachService.analyzeQuantitativeMetrics('2026-11-28', mockTrades);

    expect(debrief.disciplineScore).toBeLessThanOrEqual(3);
    expect(debrief.leaks.some((l) => l.includes('Re-entered market within') || l.includes('minutes'))).toBe(true);
  });
});
