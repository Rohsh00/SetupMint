import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { AnalyticsAiAdvisorService } from '../src/services/analytics-ai-advisor.service.js';

describe('AnalyticsAiAdvisorService - Multi-Tab Performance Copilot', () => {
  it('generates deterministic quantitative audit for disciplined winning trades', async () => {
    const mockTrades = [
      {
        _id: new mongoose.Types.ObjectId(),
        status: 'CLOSED',
        symbol: 'BANKNIFTY',
        direction: 'LONG',
        session: 'MORNING_LONDON',
        tradeDate: new Date('2026-11-20T09:30:00Z'),
        calculated: {
          netPnL: 8500,
          grossPnL: 8650,
          totalCosts: 150,
          realizedRMultiple: 2.2,
          excursion: { maeR: 0.3, mfeR: 2.5, exitEfficiency: 0.88 },
          stopMoveSummary: { widenedCount: 0, trailedCount: 1 },
        },
        quantity: 30,
        psychology: { disciplineScore: 5, emotionBefore: 'CALM', mistakes: [] },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        status: 'CLOSED',
        symbol: 'GOLD',
        direction: 'LONG',
        session: 'NY_OPEN',
        tradeDate: new Date('2026-11-21T14:30:00Z'),
        calculated: {
          netPnL: 12000,
          grossPnL: 12150,
          totalCosts: 150,
          realizedRMultiple: 3.1,
          excursion: { maeR: 0.2, mfeR: 3.5, exitEfficiency: 0.90 },
          stopMoveSummary: { widenedCount: 0, trailedCount: 1 },
        },
        quantity: 30,
        psychology: { disciplineScore: 5, emotionBefore: 'CONFIDENT', mistakes: [] },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        status: 'CLOSED',
        symbol: 'NIFTY',
        direction: 'SHORT',
        session: 'AFTERNOON',
        tradeDate: new Date('2026-11-22T11:00:00Z'),
        calculated: {
          netPnL: -3000,
          grossPnL: -2900,
          totalCosts: 100,
          realizedRMultiple: -1.0,
          excursion: { maeR: 1.0, mfeR: 0.2, exitEfficiency: 0.2 },
          stopMoveSummary: { widenedCount: 0, trailedCount: 0 },
        },
        quantity: 30,
        psychology: { disciplineScore: 4, emotionBefore: 'NEUTRAL', mistakes: [] },
      },
    ];

    const audit = (AnalyticsAiAdvisorService as any).generateDeterministicAudit({
      totalCount: 3,
      winCount: 2,
      lossCount: 1,
      winRate: 66.7,
      profitFactor: 5.3,
      netPnL: 17500,
      avgR: 1.43,
      avgMaeR: 0.5,
      avgMfeR: 2.06,
      avgExitEfficiency: 66.0,
      widenedStopsCount: 0,
      martingaleRiskEvents: 0,
      sizingDispersionRatio: 1.0,
      mistakeCounts: {},
      sessionPnL: { MORNING_LONDON: { pnl: 8500, count: 1, wins: 1 } },
      dayOfWeekPnL: {},
      symbolPnL: {},
      scopeCurrency: 'INR',
    });

    expect(audit).toBeDefined();
    expect(audit.edgeGrade).toBe('B'); // < 5 trades sample size
    expect(audit.overallVerdict).toBe('INSUFFICIENT_SAMPLE_SIZE');
    expect(audit.topStrengths.length).toBeGreaterThan(0);
    expect(audit.actionDirectives.length).toBe(3);
    expect(audit.tabInsights.summary).toContain('INR');
    expect(audit.tabInsights.psychology).toBeDefined();
    expect(audit.tabInsights.execution).toBeDefined();
    expect(audit.tabInsights.sizing).toBeDefined();
    expect(audit.tabInsights.time).toBeDefined();
    expect(audit.rulesForNextCycle.length).toBe(3);
  });

  it('detects critical leaks: widened stops and revenge sizing escalation', async () => {
    const audit = (AnalyticsAiAdvisorService as any).generateDeterministicAudit({
      totalCount: 10,
      winCount: 3,
      lossCount: 7,
      winRate: 30.0,
      profitFactor: 0.6,
      netPnL: -15000,
      avgR: -0.7,
      avgMaeR: 1.5,
      avgMfeR: 0.8,
      avgExitEfficiency: 35.0,
      widenedStopsCount: 4,
      martingaleRiskEvents: 3,
      sizingDispersionRatio: 4.5,
      mistakeCounts: { 'Moved Stop Loss': 4, 'Revenge Trading': 3 },
      sessionPnL: {},
      dayOfWeekPnL: {},
      symbolPnL: {},
      scopeCurrency: 'USD',
    });

    expect(audit.edgeGrade).toBe('D');
    expect(audit.overallVerdict).toBe('CRITICAL_CAPITAL_EROSION');
    expect(audit.criticalLeaks.some((l: string) => l.includes('Stop Loss Widening'))).toBe(true);
    expect(audit.criticalLeaks.some((l: string) => l.includes('Revenge Sizing Escalation'))).toBe(true);
    expect(audit.actionDirectives.some((d: any) => d.impact === 'CRITICAL')).toBe(true);
  });
});
