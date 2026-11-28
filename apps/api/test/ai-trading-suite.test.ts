import { describe, it, expect, vi } from 'vitest';
import { AiPreTradeCheckService } from '../src/services/ai-pretrade-check.service.js';
import { AiDailyBriefingService } from '../src/services/ai-daily-briefing.service.js';
import { AiStrategyAuditorService } from '../src/services/ai-strategy-auditor.service.js';
import { AiWeeklyReviewService } from '../src/services/ai-weekly-review.service.js';

describe('AI Suite - Pre-Trade Sanity & Decision Copilot', () => {
  it('approves a disciplined trade with valid stop and favorable R:R', () => {
    // Calling evaluateQuantPreTrade directly through any cast
    const result = (AiPreTradeCheckService as any).evaluateQuantPreTrade({
      symbol: 'NIFTY',
      direction: 'LONG',
      entry: 24000,
      stop: 23950,
      target: 24150,
      riskRewardRatio: 3.0,
      todayCount: 1,
      netPnLToday: 250,
      consecutiveLosses: 0,
      dailyLossRemaining: 5000,
      dailyLossLimitBreached: false,
      isRevengeDanger: false,
      minutesSinceLastLoss: 120,
      sampleSize: 15,
      winRate: 60,
      profitFactor: 2.1,
      avgR: 1.8,
      frequentMistakes: [],
      userRiskMaxPercent: 1.5,
      plannedRiskPercent: 1.0,
    });

    expect(result.verdict).toBe('APPROVED_HIGH_EDGE');
    expect(result.edgeScore).toBeGreaterThanOrEqual(75);
    expect(result.tiltRisk).toBe('LOW');
    expect(result.keyChecks.some((c: any) => c.text.includes('Stop loss properly set'))).toBe(true);
    expect(result.keyChecks.some((c: any) => c.text.includes('Favorable Risk-to-Reward'))).toBe(true);
  });

  it('triggers HALT/WARNING if stop loss is invalid (e.g. LONG with stop above entry)', () => {
    const result = (AiPreTradeCheckService as any).evaluateQuantPreTrade({
      symbol: 'XAUUSD',
      direction: 'LONG',
      entry: 2650,
      stop: 2660, // Invalid stop above entry for a LONG
      target: 2680,
      riskRewardRatio: 3.0,
      todayCount: 0,
      netPnLToday: 0,
      consecutiveLosses: 0,
      dailyLossRemaining: 2000,
      dailyLossLimitBreached: false,
      isRevengeDanger: false,
      minutesSinceLastLoss: 999,
      sampleSize: 0,
      winRate: 0,
      profitFactor: 0,
      avgR: 0,
      frequentMistakes: [],
      userRiskMaxPercent: 2.0,
    });

    expect(result.verdict).toBe('WARNING_HIGH_RISK');
    expect(result.keyChecks.some((c: any) => c.text.includes('Stop Loss must be logically placed'))).toBe(true);
  });

  it('flags CRITICAL tilt risk if trader is on a 3-loss streak', () => {
    const result = (AiPreTradeCheckService as any).evaluateQuantPreTrade({
      symbol: 'EURUSD',
      direction: 'SHORT',
      entry: 1.085,
      stop: 1.087,
      target: 1.08,
      riskRewardRatio: 2.5,
      todayCount: 3,
      netPnLToday: -450,
      consecutiveLosses: 3,
      dailyLossRemaining: 550,
      dailyLossLimitBreached: false,
      isRevengeDanger: false,
      minutesSinceLastLoss: 45,
      sampleSize: 10,
      winRate: 50,
      profitFactor: 1.2,
      avgR: 0.8,
      frequentMistakes: ['REVENGE_TRADING'],
      userRiskMaxPercent: 1.0,
    });

    expect(result.tiltRisk).toBe('CRITICAL');
    expect(result.verdict).toBe('WARNING_HIGH_RISK');
    expect(result.keyChecks.some((c: any) => c.text.includes('HIGH TILT WARNING'))).toBe(true);
  });
});

describe('AI Suite - Morning Daily Readiness Briefing', () => {
  it('generates a readiness briefing reflecting yesterday telemetry', () => {
    const briefing = (AiDailyBriefingService as any).evaluateQuantBriefing({
      date: '2026-11-28',
      lastJournal: {
        disciplineRating: 5,
        netPnL: 850,
        tradesCount: 2,
        aiDebrief: { leaks: [], ruleForTomorrow: 'Hold winners to 2R target' },
      },
      recentTradesCount: 10,
      recentWinRate: 70,
      recentTotalPnL: 2100,
      topSymbol: 'ETHUSD',
      topSymbolWinRate: 75,
      maxDailyLoss: 500,
      maxDailyTrades: 3,
    });

    expect(briefing.date).toBe('2026-11-28');
    expect(briefing.readinessScore).toBeGreaterThanOrEqual(90);
    expect(briefing.psychologicalState).toBe('FOCUSED_AND_CENTERED');
    expect(briefing.topEdgeInsight).toContain('ETHUSD');
    expect(briefing.focusRuleForToday).toBe('Hold winners to 2R target');
    expect(briefing.dailyDirectives.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AI Suite - Strategy Playbook Auditor', () => {
  it('audits a high-performing strategy and diagnoses STRONG_EDGE', () => {
    const audit = (AiStrategyAuditorService as any).evaluateQuantAudit({
      strategyId: 'strat-123',
      strategyName: 'Opening Range Breakout',
      totalTrades: 25,
      winRate: 64,
      profitFactor: 2.45,
      avgRealizedR: 1.75,
      edgeStatus: 'STRONG_EDGE',
      avgWinnerMae: 0.35,
      avgWinnerMfe: 2.6,
      topWinnerConfluences: ['15m Breakout Bar', 'Volume Spike'],
      topLoserMistakes: ['Premature Exit'],
    });

    expect(audit.edgeStatus).toBe('STRONG_EDGE');
    expect(audit.executiveSummary).toContain('robust institutional edge');
    expect(audit.winningTraits.length).toBeGreaterThan(0);
    expect(audit.maeMfeOptimization).toContain('0.35R');
    expect(audit.recommendedRuleChanges.length).toBeGreaterThan(0);
  });
});

describe('AI Suite - Weekly Executive Review', () => {
  it('grades a positive and disciplined week with an A or A+', () => {
    const weekly = (AiWeeklyReviewService as any).evaluateQuantWeeklySummary({
      week: '2026-W42',
      totalTrades: 12,
      netPnL: 1450,
      winRate: 66,
      profitFactor: 2.8,
      avgDiscipline: 5,
      dailyJournalsCount: 5,
      mostFrequentMistake: undefined,
    });

    expect(weekly.weeklyGrade).toBe('A+');
    expect(weekly.capitalDisciplineReview).toContain('Exemplary');
    expect(weekly.recommendedFocusRule).toBeTruthy();
    expect(weekly.coachingAdvice).toBeTruthy();
  });
});
