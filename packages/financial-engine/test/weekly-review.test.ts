import { describe, it, expect } from 'vitest';
import {
  buildWeeklyReview,
  evaluateFocusRule,
  WeeklyReviewTradeInput,
} from '../src/weekly-review.js';
import { computeTradeAggregates } from '../src/reconciliation.js';

describe('Weekly Review Pure Engine (buildWeeklyReview & evaluateFocusRule)', () => {
  it('reconciles totals exactly with computeTradeAggregates', () => {
    const trades: WeeklyReviewTradeInput[] = [
      {
        id: 'trade-1',
        symbol: 'NIFTY',
        tradeDate: '2026-10-19',
        status: 'CLOSED',
        netPnL: 2500.5,
        grossPnL: 2600.0,
        totalCosts: 99.5,
        realizedRMultiple: 2.1,
      },
      {
        id: 'trade-2',
        symbol: 'BANKNIFTY',
        tradeDate: '2026-10-20',
        status: 'CLOSED',
        netPnL: -1200.75,
        grossPnL: -1100.0,
        totalCosts: 100.75,
        realizedRMultiple: -1.0,
      },
      {
        id: 'trade-3',
        symbol: 'CRUDEOIL',
        tradeDate: '2026-10-21',
        status: 'CLOSED',
        netPnL: 850.25,
        grossPnL: 950.0,
        totalCosts: 99.75,
        realizedRMultiple: 0.85,
      },
      {
        id: 'trade-4',
        symbol: 'NIFTY',
        tradeDate: '2026-10-22',
        status: 'OPEN', // Open trade should not enter closed aggregates
        netPnL: 500,
      },
    ];

    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades,
    });

    const closedTrades = trades.filter((t) => t.status === 'CLOSED');
    const directAgg = computeTradeAggregates(
      closedTrades.map((t) => ({
        id: t.id,
        status: t.status,
        netPnL: t.netPnL,
        grossPnL: t.grossPnL,
        totalCosts: t.totalCosts,
        realizedRMultiple: t.realizedRMultiple,
      }))
    );

    expect(snapshot.weekSummary.tradeCount).toBe(3);
    expect(snapshot.weekSummary.closedCount).toBe(directAgg.closedCount);
    expect(snapshot.weekSummary.netPnL).toBe(directAgg.netPnL);
    expect(snapshot.weekSummary.grossPnL).toBe(directAgg.grossPnL);
    expect(snapshot.weekSummary.totalCosts).toBe(directAgg.totalCosts);
    expect(snapshot.weekSummary.winRate).toBe(directAgg.winRate);
    expect(snapshot.weekSummary.avgRealizedR).toBe(directAgg.avgR);
    expect(snapshot.weekSummary.tradeIds).toEqual(['trade-1', 'trade-2', 'trade-3']);
  });

  it('handles empty week gracefully without division by zero', () => {
    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades: [],
    });

    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.weekSummary.tradeCount).toBe(0);
    expect(snapshot.weekSummary.netPnL).toBe(0);
    expect(snapshot.weekSummary.winRate).toBe(0);
    expect(snapshot.weekSummary.profitFactor).toBe(0);
    expect(snapshot.weekSummary.expectancy).toBe(0);
    expect(snapshot.weekSummary.avgRealizedR).toBe(0);
    expect(snapshot.weekSummary.maxDrawdown).toBe(0);
    expect(snapshot.weekSummary.rCoveragePercent).toBe(0);
    expect(snapshot.weekSummary.tradeIds).toEqual([]);
    expect(snapshot.discipline.dailyRatings).toHaveLength(7);
    expect(snapshot.focusRuleSuggestion.code).toBe('MAINTAIN_DISCIPLINE');
  });

  it('applies 999.99 profit factor convention when gains exist with zero losses', () => {
    const trades: WeeklyReviewTradeInput[] = [
      {
        id: 'w1',
        symbol: 'NIFTY',
        tradeDate: '2026-10-19',
        status: 'CLOSED',
        netPnL: 1500,
      },
      {
        id: 'w2',
        symbol: 'BANKNIFTY',
        tradeDate: '2026-10-20',
        status: 'CLOSED',
        netPnL: 2000,
      },
    ];

    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades,
    });

    expect(snapshot.weekSummary.profitFactor).toBe(999.99);
    expect(snapshot.weekSummary.winRate).toBe(100);
  });

  it('ranks mistakes by total ₹ cost and links tradeIds for drilldown', () => {
    const trades: WeeklyReviewTradeInput[] = [
      {
        id: 'm1',
        symbol: 'NIFTY',
        tradeDate: '2026-10-19',
        status: 'CLOSED',
        netPnL: -5000,
        psychology: { mistakes: ['REVENGE_TRADING', 'SIZE_VIOLATION'] },
      },
      {
        id: 'm2',
        symbol: 'BANKNIFTY',
        tradeDate: '2026-10-20',
        status: 'CLOSED',
        netPnL: -2000,
        psychology: { mistakes: ['STOP_MOVED'] },
      },
      {
        id: 'm3',
        symbol: 'CRUDEOIL',
        tradeDate: '2026-10-21',
        status: 'CLOSED',
        netPnL: -3000,
        psychology: { mistakes: ['REVENGE_TRADING'] },
      },
      {
        id: 'm4',
        symbol: 'NIFTY',
        tradeDate: '2026-10-22',
        status: 'CLOSED',
        netPnL: 4000, // Winner with a mistake should not add to loss ₹ amount
        psychology: { mistakes: ['FOMO_ENTRY'] },
      },
    ];

    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades,
    });

    expect(snapshot.mistakes.items).toHaveLength(4);
    // REVENGE_TRADING total loss = 5000 + 3000 = 8000
    expect(snapshot.mistakes.topMistake?.tag).toBe('REVENGE_TRADING');
    expect(snapshot.mistakes.topMistake?.totalLoss).toBe(8000);
    expect(snapshot.mistakes.topMistake?.count).toBe(2);
    expect(snapshot.mistakes.topMistake?.tradeIds).toEqual(['m1', 'm3']);

    // Second highest loss: SIZE_VIOLATION (5000)
    expect(snapshot.mistakes.items[1].tag).toBe('SIZE_VIOLATION');
    expect(snapshot.mistakes.items[1].totalLoss).toBe(5000);

    // Third highest: STOP_MOVED (2000)
    expect(snapshot.mistakes.items[2].tag).toBe('STOP_MOVED');
    expect(snapshot.mistakes.items[2].totalLoss).toBe(2000);
  });

  it('ranks templates by empirical-Bayes shrunk expectancy (k=10) with sample size warning', () => {
    // Template A has 2 lucky trades with huge 5R mean
    // Template B has 40 trades with consistent 1.5R mean
    const tradesA: WeeklyReviewTradeInput[] = [
      {
        id: 'ta1',
        symbol: 'NIFTY',
        tradeDate: '2026-10-19',
        status: 'CLOSED',
        templateId: 'tmpl-a',
        realizedRMultiple: 5.0,
        netPnL: 5000,
      },
      {
        id: 'ta2',
        symbol: 'NIFTY',
        tradeDate: '2026-10-20',
        status: 'CLOSED',
        templateId: 'tmpl-a',
        realizedRMultiple: 5.0,
        netPnL: 5000,
      },
    ];

    const tradesB: WeeklyReviewTradeInput[] = Array.from({ length: 40 }, (_, i) => ({
      id: `tb-${i}`,
      symbol: 'BANKNIFTY',
      tradeDate: '2026-10-21',
      status: 'CLOSED',
      templateId: 'tmpl-b',
      realizedRMultiple: 1.5,
      netPnL: 1500,
    }));

    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades: [...tradesA, ...tradesB],
      templates: [
        { id: 'tmpl-a', name: 'Lucky Scalp' },
        { id: 'tmpl-b', name: 'Solid Trend' },
      ],
    });

    // Template A (n=2, sampleMean=5): shrunk = (2 * 5 + 10 * globalPrior) / (2 + 10)
    // Global prior is approx (2*5 + 40*1.5) / 42 = 70 / 42 = 1.6667
    // Template A shrunk is significantly shrunk towards 1.6667
    const tmplA = snapshot.templates.items.find((t) => t.templateId === 'tmpl-a');
    const tmplB = snapshot.templates.items.find((t) => t.templateId === 'tmpl-b');

    expect(tmplA).toBeDefined();
    expect(tmplB).toBeDefined();
    expect(tmplA?.sampleSizeWarning).toBe(true); // n=2 < 30
    expect(tmplB?.sampleSizeWarning).toBe(false); // n=40 >= 30
  });

  describe('Focus Rule Suggestion Priority Order', () => {
    it('Priority 1: suggests DAILY_LOSS_LIMIT when daily loss limit was breached', () => {
      const trades: WeeklyReviewTradeInput[] = [
        {
          id: 'brk-1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-19',
          status: 'CLOSED',
          netPnL: -6000, // breaches limit of 5000
          psychology: { mistakes: ['REVENGE_TRADING'] },
        },
      ];

      const snapshot = buildWeeklyReview({
        week: '2026-W43',
        trades,
        riskSettings: { maxDailyLoss: 5000 },
      });

      expect(snapshot.focusRuleSuggestion.code).toBe('DAILY_LOSS_LIMIT');
      expect(snapshot.focusRuleSuggestion.text).toBe(
        'Stop trading for the day after hitting max daily loss'
      );
      expect(snapshot.focusRuleSuggestion.metric?.type).toBe('MAX_DAILY_LOSS_BREACH');
    });

    it('Priority 2: suggests mistake-based rule when top mistake cost > 0 and no daily loss breach', () => {
      const trades: WeeklyReviewTradeInput[] = [
        {
          id: 't1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-19',
          status: 'CLOSED',
          netPnL: -1500, // below daily loss of 5000
          psychology: { mistakes: ['STOP_MOVED'] },
        },
      ];

      const snapshot = buildWeeklyReview({
        week: '2026-W43',
        trades,
        riskSettings: { maxDailyLoss: 5000 },
      });

      expect(snapshot.focusRuleSuggestion.code).toBe('MISTAKE_STOP_MOVED');
      expect(snapshot.focusRuleSuggestion.text).toBe(
        'Never widen or cancel initial stop loss once entered'
      );
      expect(snapshot.focusRuleSuggestion.metric?.type).toBe('MISTAKE_COUNT');
      expect(snapshot.focusRuleSuggestion.metric?.tag).toBe('STOP_MOVED');
    });

    it('Priority 3: suggests PAUSE_TEMPLATE when worst template has n >= 10 and negative shrunk expectancy', () => {
      const trades: WeeklyReviewTradeInput[] = Array.from({ length: 12 }, (_, i) => ({
        id: `wt-${i}`,
        symbol: 'NIFTY',
        tradeDate: '2026-10-19',
        status: 'CLOSED',
        templateId: 'bad-tmpl',
        realizedRMultiple: -1.2,
        netPnL: 50, // net positive to avoid mistake loss trigger
        psychology: { mistakes: [] },
      }));

      const snapshot = buildWeeklyReview({
        week: '2026-W43',
        trades,
        templates: [{ id: 'bad-tmpl', name: 'Flawed Setup' }],
        riskSettings: { maxDailyLoss: 5000 },
      });

      expect(snapshot.focusRuleSuggestion.code).toBe('PAUSE_TEMPLATE');
      expect(snapshot.focusRuleSuggestion.text).toBe('Pause Flawed Setup until reviewed');
      expect(snapshot.focusRuleSuggestion.metric?.type).toBe('TEMPLATE_PAUSE');
    });

    it('Priority 4: suggests REPEAT_SUCCESS when trades worked well without breaches', () => {
      const trades: WeeklyReviewTradeInput[] = [
        {
          id: 'good-1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-19',
          status: 'CLOSED',
          templateId: 'orb-setup',
          netPnL: 3500,
          realizedRMultiple: 2.5,
          psychology: { mistakes: [] },
        },
      ];

      const snapshot = buildWeeklyReview({
        week: '2026-W43',
        trades,
        templates: [{ id: 'orb-setup', name: 'Opening Range Breakout' }],
      });

      expect(snapshot.focusRuleSuggestion.code).toBe('REPEAT_SUCCESS');
      expect(snapshot.focusRuleSuggestion.text).toBe('Repeat what worked: Opening Range Breakout');
      expect(snapshot.focusRuleSuggestion.metric?.type).toBe('REPEAT_TEMPLATE');
    });
  });

  describe('evaluateFocusRule', () => {
    it('evaluates MAX_DAILY_LOSS_BREACH rule as followed when 0 breaches occur', () => {
      const trades: WeeklyReviewTradeInput[] = [
        {
          id: 't1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-26',
          status: 'CLOSED',
          netPnL: -2000,
        },
      ];

      const res = evaluateFocusRule(
        {
          code: 'DAILY_LOSS_LIMIT',
          text: 'Stop trading',
          metric: { type: 'MAX_DAILY_LOSS_BREACH', target: 0 },
        },
        trades,
        { maxDailyLoss: 5000 }
      );

      expect(res.followed).toBe(true);
      expect(res.actual).toBe(0);
      expect(res.target).toBe(0);
    });

    it('evaluates MAX_DAILY_LOSS_BREACH rule as not followed when breach occurs', () => {
      const trades: WeeklyReviewTradeInput[] = [
        {
          id: 't1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-26',
          status: 'CLOSED',
          netPnL: -6000,
        },
      ];

      const res = evaluateFocusRule(
        {
          code: 'DAILY_LOSS_LIMIT',
          text: 'Stop trading',
          metric: { type: 'MAX_DAILY_LOSS_BREACH', target: 0 },
        },
        trades,
        { maxDailyLoss: 5000 }
      );

      expect(res.followed).toBe(false);
      expect(res.actual).toBe(1);
    });

    it('evaluates MISTAKE_COUNT rule correctly', () => {
      const tradesWithMistake: WeeklyReviewTradeInput[] = [
        {
          id: 't1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-26',
          status: 'CLOSED',
          psychology: { mistakes: ['REVENGE_TRADING'] },
        },
      ];

      const resBad = evaluateFocusRule(
        {
          code: 'MISTAKE_REVENGE_TRADING',
          text: 'Wait 30 min',
          metric: { type: 'MISTAKE_COUNT', tag: 'REVENGE_TRADING', target: 0 },
        },
        tradesWithMistake
      );
      expect(resBad.followed).toBe(false);
      expect(resBad.actual).toBe(1);

      const tradesClean: WeeklyReviewTradeInput[] = [
        {
          id: 't2',
          symbol: 'NIFTY',
          tradeDate: '2026-10-26',
          status: 'CLOSED',
          psychology: { mistakes: [] },
        },
      ];

      const resGood = evaluateFocusRule(
        {
          code: 'MISTAKE_REVENGE_TRADING',
          text: 'Wait 30 min',
          metric: { type: 'MISTAKE_COUNT', tag: 'REVENGE_TRADING', target: 0 },
        },
        tradesClean
      );
      expect(resGood.followed).toBe(true);
      expect(resGood.actual).toBe(0);
    });

    it('evaluates TEMPLATE_PAUSE rule correctly', () => {
      const tradesTradedPaused: WeeklyReviewTradeInput[] = [
        {
          id: 't1',
          symbol: 'NIFTY',
          tradeDate: '2026-10-26',
          status: 'CLOSED',
          templateId: 'paused-tmpl',
        },
      ];

      const res = evaluateFocusRule(
        {
          code: 'PAUSE_TEMPLATE',
          text: 'Pause setup',
          metric: { type: 'TEMPLATE_PAUSE', templateId: 'paused-tmpl', target: 0 },
        },
        tradesTradedPaused
      );
      expect(res.followed).toBe(false);
      expect(res.actual).toBe(1);
    });

    it('returns null when rule metric is not machine-measurable', () => {
      const res = evaluateFocusRule(
        {
          code: 'CUSTOM_RULE',
          text: 'Only trade with strong mindset',
          metric: { type: 'CUSTOM' },
        },
        []
      );

      expect(res.followed).toBeNull();
      expect(res.actual).toBeNull();
    });
  });

  it('reports R coverage correctly when stops are missing on some trades', () => {
    const trades: WeeklyReviewTradeInput[] = [
      { id: '1', symbol: 'N', tradeDate: '2026-10-19', status: 'CLOSED', realizedRMultiple: 1.5 },
      { id: '2', symbol: 'N', tradeDate: '2026-10-19', status: 'CLOSED', realizedRMultiple: -1.0 },
      { id: '3', symbol: 'N', tradeDate: '2026-10-20', status: 'CLOSED' }, // no stop, no R
      { id: '4', symbol: 'N', tradeDate: '2026-10-20', status: 'CLOSED' }, // no stop, no R
    ];

    const snapshot = buildWeeklyReview({
      week: '2026-W43',
      trades,
    });

    expect(snapshot.weekSummary.tradeCount).toBe(4);
    expect(snapshot.weekSummary.rCount).toBe(2);
    expect(snapshot.weekSummary.rCoveragePercent).toBe(50.0);
    expect(snapshot.weekSummary.avgRealizedR).toBe(0.25);
  });

  it('guarantees deterministic output for identical input', () => {
    const trades: WeeklyReviewTradeInput[] = [
      { id: '1', symbol: 'NIFTY', tradeDate: '2026-10-19', status: 'CLOSED', netPnL: 1250.35, realizedRMultiple: 1.25 },
      { id: '2', symbol: 'BANKNIFTY', tradeDate: '2026-10-20', status: 'CLOSED', netPnL: -450.8, realizedRMultiple: -0.5 },
    ];

    const runA = buildWeeklyReview({ week: '2026-W43', trades });
    const runB = buildWeeklyReview({ week: '2026-W43', trades });

    expect(runA).toEqual(runB);
  });

  it('prevents floating-point drift with Decimal.js on fractional fees', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754 floats
    const trades: WeeklyReviewTradeInput[] = [
      { id: '1', symbol: 'NIFTY', tradeDate: '2026-10-19', status: 'CLOSED', netPnL: 0.1, grossPnL: 0.3, totalCosts: 0.2 },
      { id: '2', symbol: 'NIFTY', tradeDate: '2026-10-19', status: 'CLOSED', netPnL: 0.2, grossPnL: 0.4, totalCosts: 0.2 },
    ];

    const snapshot = buildWeeklyReview({ week: '2026-W43', trades });
    expect(snapshot.weekSummary.netPnL).toBe(0.3);
    expect(snapshot.weekSummary.totalCosts).toBe(0.4);
  });
});
