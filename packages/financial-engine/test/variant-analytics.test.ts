import { describe, it, expect } from 'vitest';
import {
  calculateVariantAnalytics,
  VariantAnalyticsStrategyInput,
  VariantAnalyticsTradeInput,
} from '../src/variant-analytics.js';
import {
  suggestTradeVariant,
  deriveMomentumRelation,
  getEffectiveStrategyRules,
  IStrategyVariant,
} from '@tradevault/shared';

describe('Financial Engine: Strategy Variant Analytics & Classification', () => {
  const sampleStrategy: VariantAnalyticsStrategyInput = {
    id: 'strat-123',
    name: 'Bullish HTF Retracement - LTF Liquidity Sweep & Confirmation',
    minRiskReward: 2.0,
    variants: [
      {
        key: 'BULL-SSL-EQL',
        name: 'Equal Lows Sweep',
        description: 'Sweep of equal lows',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'LONG',
          liquiditySide: 'SELL_SIDE',
          patternType: 'EQUAL_LOWS',
          secondLegStatus: 'NOT_APPLICABLE',
          momentumRelation: 'WITH_HTF',
        },
      },
      {
        key: 'BULL-SSL-W-SWEEP',
        name: 'W Pattern, Second-Leg Sweep',
        description: 'W second leg sweeps first low',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'LONG',
          liquiditySide: 'SELL_SIDE',
          patternType: 'W',
          secondLegStatus: 'SWEPT',
          momentumRelation: 'WITH_HTF',
        },
      },
      {
        key: 'BULL-W-UNSWEPT',
        name: 'W Pattern, Second-Leg Unswept',
        description: 'W second leg stays higher',
        isActive: false, // archived variant test
        sortOrder: 3,
        expected: {
          direction: 'LONG',
          liquiditySide: 'NONE',
          patternType: 'W',
          secondLegStatus: 'UNSWEPT',
          momentumRelation: 'WITH_HTF',
        },
      },
    ],
  };

  it('1. Reconciles bucket closed trades to parent closed trades and excludes non-CLOSED statuses', () => {
    const trades: VariantAnalyticsTradeInput[] = [
      {
        id: 't1',
        tradeDate: '2026-10-01',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 5000, grossPnL: 5100, totalCosts: 100, outcome: 'WIN' },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
      },
      {
        id: 't2',
        tradeDate: '2026-10-02',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: -2000, grossPnL: -1900, totalCosts: 100, outcome: 'LOSS' },
        setup: { variantKey: 'BULL-SSL-W-SWEEP', variantStatus: 'CLASSIFIED' },
      },
      {
        id: 't3',
        tradeDate: '2026-10-03',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 0, grossPnL: 50, totalCosts: 50, outcome: 'BREAKEVEN' },
        setup: { variantStatus: 'UNCLASSIFIED' },
      },
      {
        id: 't4',
        tradeDate: '2026-10-04',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 3000, grossPnL: 3100, totalCosts: 100, outcome: 'WIN' },
        setup: { variantStatus: 'NOT_APPLICABLE' },
      },
      {
        id: 't5',
        tradeDate: '2026-10-05',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 1500, grossPnL: 1600, totalCosts: 100, outcome: 'WIN' },
        setup: { variantKey: 'UNKNOWN-LEGACY', variantStatus: 'CLASSIFIED' }, // Orphaned
      },
      // Non-closed trades should NOT be included in metrics
      {
        id: 't6-open',
        tradeDate: '2026-10-06',
        status: 'OPEN',
        direction: 'LONG',
        calculated: { netPnL: 1000 },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
      },
      {
        id: 't7-planned',
        tradeDate: '2026-10-07',
        status: 'PLANNED',
        direction: 'LONG',
        calculated: { netPnL: 0 },
      },
      {
        id: 't8-cancelled',
        tradeDate: '2026-10-08',
        status: 'CANCELLED',
        direction: 'LONG',
        calculated: { netPnL: 0 },
      },
    ];

    const result = calculateVariantAnalytics({ strategy: sampleStrategy, trades });

    expect(result.countsByStatus.CLOSED).toBe(5);
    expect(result.countsByStatus.OPEN).toBe(1);
    expect(result.countsByStatus.PLANNED).toBe(1);
    expect(result.countsByStatus.CANCELLED).toBe(1);
    expect(result.countsByStatus.TOTAL).toBe(8);

    expect(result.invariantCheck.reconciled).toBe(true);
    expect(result.invariantCheck.parentClosed).toBe(5);
    expect(result.invariantCheck.sumBucketClosed).toBe(5);
    expect(result.parent.closedTrades).toBe(5);

    // Verify buckets exist
    const eqlBucket = result.buckets.find((b) => b.key === 'BULL-SSL-EQL')!;
    const wSweepBucket = result.buckets.find((b) => b.key === 'BULL-SSL-W-SWEEP')!;
    const wUnsweptBucket = result.buckets.find((b) => b.key === 'BULL-W-UNSWEPT')!; // zero-trade & archived
    const unclassifiedBucket = result.buckets.find((b) => b.key === 'UNCLASSIFIED')!;
    const notAppBucket = result.buckets.find((b) => b.key === 'NOT_APPLICABLE')!;
    const orphanedBucket = result.buckets.find((b) => b.key === 'ORPHANED')!;

    expect(eqlBucket.closedTrades).toBe(1);
    expect(wSweepBucket.closedTrades).toBe(1);
    expect(wUnsweptBucket.closedTrades).toBe(0);
    expect(unclassifiedBucket.closedTrades).toBe(1);
    expect(notAppBucket.closedTrades).toBe(1);
    expect(orphanedBucket.closedTrades).toBe(1);

    expect(wUnsweptBucket.profitFactorState).toBe('NO_TRADES');
    expect(wUnsweptBucket.profitFactor).toBeNull();
  });

  it('2. Correctly calculates metric correctness, breakeven handling, and adherence rate', () => {
    const trades: VariantAnalyticsTradeInput[] = [
      {
        id: 't1',
        tradeDate: '2026-10-01',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 4000, grossPnL: 4100, totalCosts: 100, outcome: 'WIN' },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
        psychology: { rulesFollowed: true },
      },
      {
        id: 't2',
        tradeDate: '2026-10-02',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: -2000, grossPnL: -1900, totalCosts: 100, outcome: 'LOSS' },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
        psychology: { rulesFollowed: false },
      },
      {
        id: 't3',
        tradeDate: '2026-10-03',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 0, grossPnL: 50, totalCosts: 50, outcome: 'BREAKEVEN' },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
        psychology: { rulesFollowed: true },
      },
    ];

    const result = calculateVariantAnalytics({ strategy: sampleStrategy, trades });
    const bucket = result.buckets.find((b) => b.key === 'BULL-SSL-EQL')!;

    expect(bucket.closedTrades).toBe(3);
    expect(bucket.wins).toBe(1);
    expect(bucket.losses).toBe(1);
    expect(bucket.breakeven).toBe(1);
    expect(bucket.winRate).toBe(33.33); // 1 / 3 = 33.33%
    expect(bucket.netPnL).toBe(2000);
    expect(bucket.grossProfit).toBe(4150);
    expect(bucket.grossLoss).toBe(1900);
    expect(bucket.totalCosts).toBe(250);
    expect(bucket.profitFactor).toBe(2.18); // 4150 / 1900 = 2.18
    expect(bucket.profitFactorState).toBe('NORMAL');
    expect(bucket.avgWin).toBe(4150);
    expect(bucket.avgLoss).toBe(1900);
    expect(bucket.expectancy).toBe(666.67); // 2000 / 3
    expect(bucket.adherenceRate).toBe(66.67); // 2 of 3 rulesFollowed
  });

  it('3. Handles profitFactor null states without returning 999.99 or Infinity', () => {
    // Zero loss scenario
    const winTrades: VariantAnalyticsTradeInput[] = [
      {
        id: 'w1',
        tradeDate: '2026-10-01',
        status: 'CLOSED',
        direction: 'LONG',
        calculated: { netPnL: 3000, grossPnL: 3050, totalCosts: 50, outcome: 'WIN' },
        setup: { variantKey: 'BULL-SSL-EQL', variantStatus: 'CLASSIFIED' },
      },
    ];

    const res = calculateVariantAnalytics({ strategy: sampleStrategy, trades: winTrades });
    const b = res.buckets.find((x) => x.key === 'BULL-SSL-EQL')!;
    expect(b.losses).toBe(0);
    expect(b.profitFactor).toBeNull();
    expect(b.profitFactorState).toBe('NO_LOSSES');
    expect(b.profitFactor).not.toBe(999.99);
    expect(b.profitFactor).not.toBe(Infinity);
  });

  it('4. Handles R-multiple coverage and exclusion with planned risk > 0', () => {
    const trades: VariantAnalyticsTradeInput[] = [
      {
        id: 't1',
        tradeDate: '2026-10-01',
        status: 'CLOSED',
        calculated: { netPnL: 5000, realizedRMultiple: 2.5 },
        risk: { riskBudgetAmount: 2000 },
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't2',
        tradeDate: '2026-10-02',
        status: 'CLOSED',
        calculated: { netPnL: -2000 },
        risk: { riskBudgetAmount: 2000 }, // R = -1.0
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't3',
        tradeDate: '2026-10-03',
        status: 'CLOSED',
        calculated: { netPnL: 1000 },
        risk: {}, // No planned risk, cannot compute R
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
    ];

    const res = calculateVariantAnalytics({ strategy: sampleStrategy, trades });
    const b = res.buckets.find((x) => x.key === 'BULL-SSL-EQL')!;

    expect(b.closedTrades).toBe(3);
    expect(b.rEligibleCount).toBe(2);
    expect(b.rCoverage).toBe(0.6667);
    expect(b.netR).toBe(1.5); // 2.5 + (-1.0)
    expect(b.avgR).toBe(0.75); // 1.5 / 2
  });

  it('5. Computes maxDrawdown correctly on chronological cumulative net P&L', () => {
    // Trades in scrambled order
    const trades: VariantAnalyticsTradeInput[] = [
      {
        id: 't3',
        tradeDate: '2026-10-03',
        status: 'CLOSED',
        calculated: { netPnL: -4000 }, // cumulative: 6000 - 4000 = 2000 (DD: 4000)
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't1',
        tradeDate: '2026-10-01',
        status: 'CLOSED',
        calculated: { netPnL: 5000 }, // cumulative: 5000
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't4',
        tradeDate: '2026-10-04',
        status: 'CLOSED',
        calculated: { netPnL: 8000 }, // cumulative: 10000 (peak: 10000)
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't2',
        tradeDate: '2026-10-02',
        status: 'CLOSED',
        calculated: { netPnL: 1000 }, // cumulative: 6000 (peak: 6000)
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
      {
        id: 't5',
        tradeDate: '2026-10-05',
        status: 'CLOSED',
        calculated: { netPnL: -1000 }, // cumulative: 9000 (DD: 1000)
        setup: { variantKey: 'BULL-SSL-EQL' },
      },
    ];

    const res = calculateVariantAnalytics({ strategy: sampleStrategy, trades });
    const b = res.buckets.find((x) => x.key === 'BULL-SSL-EQL')!;

    // Max drawdown occurred between t2 (peak 6000) and t3 (net -4000 -> 2000), DD = 4000
    expect(b.maxDrawdown).toBe(4000);
  });

  it('6. Evaluates sample size levels and edge verdicts appropriately', () => {
    // Create 35 trades for adequate sample size
    const trades35: VariantAnalyticsTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `trade-${i}`,
      tradeDate: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
      status: 'CLOSED',
      direction: 'LONG',
      calculated: {
        netPnL: i % 3 === 0 ? -1000 : 2000,
        realizedRMultiple: i % 3 === 0 ? -1.0 : 2.0,
        outcome: i % 3 === 0 ? 'LOSS' : 'WIN',
      },
      setup: { variantKey: 'BULL-SSL-EQL' },
    }));

    const res = calculateVariantAnalytics({ strategy: sampleStrategy, trades: trades35 });
    const b = res.buckets.find((x) => x.key === 'BULL-SSL-EQL')!;

    expect(b.closedTrades).toBe(35);
    expect(b.sampleSize.level).toBe('ADEQUATE');
    expect(b.sampleSize.warningText).toBeNull();
    expect(b.edgeVerdict).not.toBeNull(); // Edge calculation was evaluated because N >= 30
  });

  it('7. Tests pure suggestTradeVariant dynamic matching with availableVariants', () => {
    const bullishVariants = sampleStrategy.variants!.map((v) => ({ ...v, isActive: true }));
    const bearishVariants: IStrategyVariant[] = [
      {
        key: 'BEAR-BSL-EQH',
        name: 'Equal Highs Sweep',
        description: 'Sweep of equal highs',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'BUY_SIDE',
          patternType: 'EQUAL_HIGHS',
          secondLegStatus: 'NOT_APPLICABLE',
          momentumRelation: 'WITH_HTF',
        },
      },
      {
        key: 'BEAR-BSL-M-SWEEP',
        name: 'M Pattern, Second-Leg Sweep',
        description: 'M second leg sweeps first high',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'BUY_SIDE',
          patternType: 'M',
          secondLegStatus: 'SWEPT',
          momentumRelation: 'WITH_HTF',
        },
      },
      {
        key: 'BEAR-M-UNSWEPT',
        name: 'M Pattern, Second-Leg Unswept',
        description: 'M second leg stays lower',
        isActive: true,
        sortOrder: 3,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'NONE',
          patternType: 'M',
          secondLegStatus: 'UNSWEPT',
          momentumRelation: 'WITH_HTF',
        },
      },
    ];

    // LONG + W + SWEPT -> BULL-SSL-W-SWEEP, with alsoMatches BULL-SSL-EQL if liquiditySide SELL_SIDE
    const s1 = suggestTradeVariant({
      direction: 'LONG',
      patternType: 'W',
      secondLegStatus: 'SWEPT',
      liquiditySide: 'SELL_SIDE',
      availableVariants: bullishVariants,
    });
    expect(s1.primaryVariantKey).toBe('BULL-SSL-W-SWEEP');
    expect(s1.suggestedStatus).toBe('CLASSIFIED');

    // LONG + W + UNSWEPT -> BULL-W-UNSWEPT
    const s2 = suggestTradeVariant({
      direction: 'LONG',
      patternType: 'W',
      secondLegStatus: 'UNSWEPT',
      liquiditySide: 'NONE',
      availableVariants: bullishVariants,
    });
    expect(s2.primaryVariantKey).toBe('BULL-W-UNSWEPT');
    expect(s2.suggestedStatus).toBe('CLASSIFIED');

    // LONG + EQUAL_LOWS -> BULL-SSL-EQL
    const s3 = suggestTradeVariant({
      direction: 'LONG',
      patternType: 'EQUAL_LOWS',
      liquiditySide: 'SELL_SIDE',
      availableVariants: bullishVariants,
    });
    expect(s3.primaryVariantKey).toBe('BULL-SSL-EQL');
    expect(s3.suggestedStatus).toBe('CLASSIFIED');

    // SHORT + M + SWEPT -> BEAR-BSL-M-SWEEP, with alsoMatches BEAR-BSL-EQH if liquiditySide BUY_SIDE
    const s4 = suggestTradeVariant({
      direction: 'SHORT',
      patternType: 'M',
      secondLegStatus: 'SWEPT',
      liquiditySide: 'BUY_SIDE',
      availableVariants: bearishVariants,
    });
    expect(s4.primaryVariantKey).toBe('BEAR-BSL-M-SWEEP');
    expect(s4.suggestedStatus).toBe('CLASSIFIED');

    // SHORT + M + UNSWEPT -> BEAR-M-UNSWEPT
    const s5 = suggestTradeVariant({
      direction: 'SHORT',
      patternType: 'M',
      secondLegStatus: 'UNSWEPT',
      liquiditySide: 'NONE',
      availableVariants: bearishVariants,
    });
    expect(s5.primaryVariantKey).toBe('BEAR-M-UNSWEPT');
    expect(s5.suggestedStatus).toBe('CLASSIFIED');

    // SHORT + EQUAL_HIGHS -> BEAR-BSL-EQH
    const s6 = suggestTradeVariant({
      direction: 'SHORT',
      patternType: 'EQUAL_HIGHS',
      liquiditySide: 'BUY_SIDE',
      availableVariants: bearishVariants,
    });
    expect(s6.primaryVariantKey).toBe('BEAR-BSL-EQH');
    expect(s6.suggestedStatus).toBe('CLASSIFIED');

    // Unmatched
    const s7 = suggestTradeVariant({
      direction: 'LONG',
      patternType: 'OTHER',
      secondLegStatus: 'NOT_APPLICABLE',
      liquiditySide: 'NONE',
      availableVariants: bullishVariants,
    });
    expect(s7.primaryVariantKey).toBeUndefined();
    expect(s7.suggestedStatus).toBe('UNCLASSIFIED');
  });

  it('8. Tests deriveMomentumRelation pure function', () => {
    expect(deriveMomentumRelation('LONG', 'BULLISH')).toBe('WITH_HTF');
    expect(deriveMomentumRelation('SHORT', 'BEARISH')).toBe('WITH_HTF');
    expect(deriveMomentumRelation('LONG', 'BEARISH')).toBe('AGAINST_HTF');
    expect(deriveMomentumRelation('SHORT', 'BULLISH')).toBe('AGAINST_HTF');
    expect(deriveMomentumRelation('LONG', 'NEUTRAL')).toBe('UNKNOWN');
    expect(deriveMomentumRelation(null, 'BULLISH')).toBe('UNKNOWN');
  });

  it('9. Tests getEffectiveStrategyRules inheritance and override', () => {
    const parentRules = {
      entryRules: ['Parent Entry 1'],
      stopLossRules: ['Parent SL 1'],
      targetRules: ['Parent Target 1'],
      invalidationCriteria: ['Parent Inval 1'],
      checklist: ['Parent Check 1'],
      minRiskReward: 1.5,
    };

    // Variant with empty lists inherits parent
    const vEmpty: IStrategyVariant = {
      key: 'V1',
      name: 'Variant 1',
      description: '',
      isActive: true,
      sortOrder: 1,
      expected: {} as any,
      entryRules: [],
      minRiskReward: null,
    };
    const effective1 = getEffectiveStrategyRules(parentRules, vEmpty);
    expect(effective1.entryRules).toEqual(['Parent Entry 1']);
    expect(effective1.minRiskReward).toBe(1.5);

    // Variant with non-empty list combines parent + variant
    const vNonEmpty: IStrategyVariant = {
      key: 'V2',
      name: 'Variant 2',
      description: '',
      isActive: true,
      sortOrder: 2,
      expected: {} as any,
      entryRules: ['Variant Specific Entry'],
      minRiskReward: 2.5,
    };
    const effective2 = getEffectiveStrategyRules(parentRules, vNonEmpty);
    expect(effective2.entryRules).toEqual(['Parent Entry 1', 'Variant Specific Entry']);
    expect(effective2.minRiskReward).toBe(2.5);
  });
});
