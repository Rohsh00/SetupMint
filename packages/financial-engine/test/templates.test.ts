import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  ITradeTemplate,
  NSE_HOLIDAYS_2026,
  AssetClass,
} from '@tradevault/shared';
import {
  resolveTemplate,
  rankTemplates,
  templatesForAssetClass,
  isNiftyWeeklyExpiry,
  isNseMonthlyExpiry,
  isExpiryDay,
  roundToTick,
} from '../src/templates.js';
import { Decimal } from 'decimal.js';

describe('Financial Engine — Rule-Driven Trade Templates', () => {
  const samplePercentTemplate: ITradeTemplate = {
    id: 'test-fno-orb',
    name: 'Opening Range Breakout',
    description: 'Breakout of initial 15-minute range',
    group: 'FNO',
    markets: ['FUTURES', 'OPTIONS', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.5 },
    minRR: 2.0,
    titlePattern: '{SYMBOL} ORB {DIR}',
    tags: ['FNO', 'ORB', 'INTRADAY'],
    confluences: ['BOS', 'VWAP'],
    checklist: ['15m High/Low marked', 'Volume confirmation'],
    strategyName: 'Opening Range Breakout',
    timeWindow: { start: '09:15', end: '10:15' },
    isBuiltIn: true,
  };

  const samplePointsTemplate: ITradeTemplate = {
    id: 'test-points',
    name: 'Points Setup',
    description: 'Fixed points stop loss',
    group: 'FNO',
    markets: ['FUTURES'],
    slRule: { type: 'POINTS', value: 40 },
    minRR: 2.5,
    titlePattern: '{SYMBOL} Points Scalp {DIR}',
    tags: ['FNO', 'POINTS'],
    isBuiltIn: true,
  };

  const samplePremiumTemplate: ITradeTemplate = {
    id: 'test-options-directional',
    name: 'Options Directional Buy',
    description: 'Long premium directional momentum',
    group: 'FNO',
    markets: ['OPTIONS'],
    direction: 'LONG',
    slRule: { type: 'PREMIUM_PERCENT', value: 20 },
    minRR: 2.0,
    titlePattern: '{SYMBOL} Option Directional Long',
    tags: ['OPTIONS', 'LONG_PREMIUM'],
    isBuiltIn: true,
  };

  const sampleManualTemplate: ITradeTemplate = {
    id: 'test-smc-bos-fvg',
    name: 'SMC BOS + FVG Retest',
    description: 'Structure-based invalidation',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place beyond invalidation order block / FVG origin',
    },
    minRR: 2.5,
    titlePattern: '{SYMBOL} SMC BOS+FVG {DIR}',
    tags: ['PRICE_ACTION', 'SMC', 'BOS'],
    isBuiltIn: true,
  };

  describe('resolveTemplate — Stop Loss & Target Math', () => {
    it('computes accurate LONG SL and target for PERCENT rule with tick rounding', () => {
      // Entry: 24,000, SL %: 0.5% = 120 points.
      // LONG SL = 24,000 - 120 = 23,880.
      // Target = 24,000 + (120 * 2) = 24,240.
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        direction: 'LONG',
        entryPrice: 24000,
        tickSize: 0.05,
      });

      expect(patch.risk?.initialStopLoss).toBe(23880);
      expect(patch.risk?.plannedTarget).toBe(24240);
      expect(patch.risk?.plannedRewardRiskRatio).toBe(2.0);
      expect(patch.provenance['risk.initialStopLoss']).toBe('RULE');
      expect(patch.provenance['risk.plannedTarget']).toBe('RULE');
    });

    it('computes accurate SHORT SL and target for PERCENT rule with tick rounding', () => {
      // Entry: 24,000, SL %: 0.5% = 120 points.
      // SHORT SL = 24,000 + 120 = 24,120.
      // Target = 24,000 - (120 * 2) = 23,760.
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        direction: 'SHORT',
        entryPrice: 24000,
        tickSize: 0.05,
      });

      expect(patch.risk?.initialStopLoss).toBe(24120);
      expect(patch.risk?.plannedTarget).toBe(23760);
    });

    it('computes accurate LONG and SHORT math for POINTS rule', () => {
      // Entry: 50,000, Points: 40, RR: 2.5
      // LONG: SL = 49,960, Target = 50,000 + (40 * 2.5) = 50,100
      const longPatch = resolveTemplate(samplePointsTemplate, {
        symbol: 'BANKNIFTY',
        assetClass: 'FUTURES',
        direction: 'LONG',
        entryPrice: 50000,
        tickSize: 0.05,
      });
      expect(longPatch.risk?.initialStopLoss).toBe(49960);
      expect(longPatch.risk?.plannedTarget).toBe(50100);

      // SHORT: SL = 50,040, Target = 50,000 - (40 * 2.5) = 49,900
      const shortPatch = resolveTemplate(samplePointsTemplate, {
        symbol: 'BANKNIFTY',
        assetClass: 'FUTURES',
        direction: 'SHORT',
        entryPrice: 50000,
        tickSize: 0.05,
      });
      expect(shortPatch.risk?.initialStopLoss).toBe(50040);
      expect(shortPatch.risk?.plannedTarget).toBe(49900);
    });

    it('computes PREMIUM_PERCENT rule for option buying (strictly LONG)', () => {
      // Premium entry: 150, SL: 20% = 30 points
      // SL = 150 - 30 = 120. Target = 150 + (30 * 2) = 210.
      const patch = resolveTemplate(samplePremiumTemplate, {
        symbol: 'NIFTY24OCT24000CE',
        assetClass: 'OPTIONS',
        entryPrice: 150,
        tickSize: 0.05,
      });

      expect(patch.direction).toBe('LONG');
      expect(patch.risk?.initialStopLoss).toBe(120);
      expect(patch.risk?.plannedTarget).toBe(210);
    });

    it('MANUAL slRule returns slHint and NEVER guesses numeric prices', () => {
      const patch = resolveTemplate(sampleManualTemplate, {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        direction: 'LONG',
        entryPrice: 2500,
      });

      expect(patch.risk?.initialStopLoss).toBeUndefined();
      expect(patch.risk?.plannedTarget).toBeUndefined();
      expect(patch.risk?.slHint).toBe(
        'Structure SL: Place beyond invalidation order block / FVG origin'
      );
      expect(patch.provenance['risk.slHint']).toBe('RULE');
    });

    it('omits initialStopLoss and plannedTarget if entryPrice <= 0 or missing', () => {
      const patchNoEntry = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        direction: 'LONG',
      });
      expect(patchNoEntry.risk?.initialStopLoss).toBeUndefined();
      expect(patchNoEntry.risk?.plannedTarget).toBeUndefined();

      const patchZeroEntry = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        direction: 'LONG',
        entryPrice: 0,
      });
      expect(patchZeroEntry.risk?.initialStopLoss).toBeUndefined();
      expect(patchZeroEntry.risk?.plannedTarget).toBeUndefined();
    });

    it('omits initialStopLoss and plannedTarget if direction is unknown and template does not fix it', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        entryPrice: 24000,
      });
      expect(patch.risk?.initialStopLoss).toBeUndefined();
      expect(patch.risk?.plannedTarget).toBeUndefined();
    });

    it('skips SL if calculated stop loss <= 0', () => {
      // Entry: 10, SL %: 150% -> dist = 15 -> SL = -5 <= 0
      const wideSlTemplate: ITradeTemplate = {
        ...samplePercentTemplate,
        slRule: { type: 'PERCENT', value: 150 },
      };
      const patch = resolveTemplate(wideSlTemplate, {
        symbol: 'PENNY',
        assetClass: 'EQUITY',
        direction: 'LONG',
        entryPrice: 10,
      });
      expect(patch.risk?.initialStopLoss).toBeUndefined();
      expect(patch.risk?.plannedTarget).toBeUndefined();
    });

    it('rounds prices accurately to custom tickSize (e.g. 0.05 or 0.25)', () => {
      // Entry: 100.03, tick 0.05, SL %: 1% = 1.0003 -> raw SL = 99.0297 -> rounded to 99.05
      const tickDecimal = roundToTick(new Decimal('99.0297'), 0.05);
      expect(tickDecimal.toNumber()).toBe(99.05);
    });
  });

  describe('resolveTemplate — Title Tokens & Same-Day Repeats', () => {
    it('substitutes {SYMBOL} and {DIR} properly', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'XAUUSD',
        direction: 'LONG',
      });
      expect(patch.tradeTitle).toBe('XAUUSD ORB Long');
    });

    it('substitutes {DIR} as Short when direction is SHORT', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'BTCUSDT',
        direction: 'SHORT',
      });
      expect(patch.tradeTitle).toBe('BTCUSDT ORB Short');
    });

    it('collapses multiple spaces when direction is missing', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
      });
      expect(patch.tradeTitle).toBe('NIFTY ORB');
    });

    it('appends #2 suffix for same-day repeats via sameDayTradeCount', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        direction: 'LONG',
        sameDayTradeCount: 1,
      });
      expect(patch.tradeTitle).toBe('NIFTY ORB Long #2');
    });

    it('appends #2 suffix when matching existing title is present today', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        direction: 'LONG',
        existingTitlesToday: ['NIFTY ORB Long'],
      });
      expect(patch.tradeTitle).toBe('NIFTY ORB Long #2');
    });
  });

  describe('resolveTemplate — Contextual Tags', () => {
    it('always adds the asset class tag and template tags', () => {
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        entryTime: '2026-10-19T05:00:00.000Z', // 10:30 IST (MIDDAY)
      });
      expect(patch.tags).toContain('FUTURES');
      expect(patch.tags).toContain('FNO');
      expect(patch.tags).toContain('ORB');
    });

    it('adds NSE time tags at boundary minutes', () => {
      // 09:15 IST = 03:45 UTC
      const patchOpening = resolveTemplate(samplePercentTemplate, {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        entryTime: '2026-10-19T03:45:00.000Z',
      });
      expect(patchOpening.tags).toContain('OPENING_30MIN');

      // 09:45 IST = 04:15 UTC
      const patchOpeningEnd = resolveTemplate(samplePercentTemplate, {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        entryTime: '2026-10-19T04:15:00.000Z',
      });
      expect(patchOpeningEnd.tags).toContain('OPENING_30MIN');

      // 11:30 IST = 06:00 UTC (MIDDAY start)
      const patchMidday = resolveTemplate(samplePercentTemplate, {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        entryTime: '2026-10-19T06:00:00.000Z',
      });
      expect(patchMidday.tags).toContain('MIDDAY');

      // 14:30 IST = 09:00 UTC (POWER_HOUR start)
      const patchPowerHour = resolveTemplate(samplePercentTemplate, {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        entryTime: '2026-10-19T09:00:00.000Z',
      });
      expect(patchPowerHour.tags).toContain('POWER_HOUR');
    });

    it('adds EVENING_SESSION for COMMODITY after 17:00 IST', () => {
      // 17:30 IST = 12:00 UTC
      const patch = resolveTemplate(samplePercentTemplate, {
        symbol: 'CRUDEOIL',
        assetClass: 'COMMODITY',
        entryTime: '2026-10-19T12:00:00.000Z',
      });
      expect(patch.tags).toContain('EVENING_SESSION');
    });

    it('adds UTC session tags for FOREX and CRYPTO', () => {
      // 14:00 UTC = London & NY overlap
      const patch = resolveTemplate(sampleManualTemplate, {
        symbol: 'BTCUSDT',
        assetClass: 'CRYPTO',
        entryTime: '2026-10-19T14:00:00.000Z',
      });
      expect(patch.tags).toContain('LONDON_SESSION');
      expect(patch.tags).toContain('LONDON_NY_OVERLAP');
      expect(patch.tags).toContain('NY_SESSION');
      // Must NOT contain NSE tags
      expect(patch.tags).not.toContain('OPENING_30MIN');
      expect(patch.tags).not.toContain('MIDDAY');
      expect(patch.tags).not.toContain('POWER_HOUR');
    });
  });

  describe('NSE Expiry Rules & Holiday Shifts', () => {
    it('identifies Nifty weekly expiry on a normal Tuesday', () => {
      // 2026-10-06 is a normal Tuesday
      expect(isNiftyWeeklyExpiry('2026-10-06')).toBe(true);
      expect(isExpiryDay('NIFTY', '2026-10-06')).toBe(true);
    });

    it('shifts Tuesday holiday to Monday (e.g. Dussehra 2026-10-20 -> 2026-10-19)', () => {
      // 2026-10-20 is Dussehra (Tuesday holiday in NSE_HOLIDAYS_2026)
      // Expiry moves to Monday 2026-10-19
      expect(isNiftyWeeklyExpiry('2026-10-19')).toBe(true);
      expect(isNiftyWeeklyExpiry('2026-10-20')).toBe(false);
      expect(isExpiryDay('NIFTY', '2026-10-19')).toBe(true);
    });

    it('identifies NSE Monthly Expiry on the last Tuesday of the month', () => {
      // In October 2026, Tuesdays are 06, 13, 20 (holiday), 27.
      // Last Tuesday is 2026-10-27 (not a holiday).
      expect(isNseMonthlyExpiry('2026-10-27')).toBe(true);
      expect(isNseMonthlyExpiry('2026-10-20')).toBe(false);
      expect(isExpiryDay('BANKNIFTY', '2026-10-27')).toBe(true);
    });

    it('shifts Monthly Expiry when last Tuesday is a holiday (e.g. Guru Nanak Jayanti 2026-11-24 -> 2026-11-23)', () => {
      // In November 2026, last Tuesday is 2026-11-24 (Guru Nanak Jayanti holiday).
      // Shifts to Monday 2026-11-23.
      expect(isNseMonthlyExpiry('2026-11-23')).toBe(true);
      expect(isNseMonthlyExpiry('2026-11-24')).toBe(false);
      expect(isExpiryDay('BANKNIFTY', '2026-11-23')).toBe(true);
    });

    it('handles consecutive holidays shifting further back', () => {
      // Custom test holidays where Tuesday AND Monday are holidays
      const customHolidays = ['2026-03-10', '2026-03-09']; // Tue & Mon
      // Tuesday 2026-03-10 should shift past Mon 2026-03-09, past Sun/Sat, to Friday 2026-03-06!
      expect(isNiftyWeeklyExpiry('2026-03-06', customHolidays)).toBe(true);
    });

    it('returns false for weekly expiry on non-Nifty symbols (e.g. BANKNIFTY)', () => {
      // 2026-10-06 is a normal Tuesday (weekly for Nifty, NOT for Bank Nifty)
      expect(isExpiryDay('BANKNIFTY', '2026-10-06')).toBe(false);
      expect(isExpiryDay('FINNIFTY', '2026-10-06')).toBe(false);
      expect(isExpiryDay('RELIANCE', '2026-10-06')).toBe(false);
    });
  });

  describe('rankTemplates — Dynamic Scoring & Filtering', () => {
    it('filters strictly by market assetClass (no Crypto templates for EQUITY)', () => {
      const ranked = rankTemplates(BUILT_IN_TEMPLATES, {
        assetClass: 'EQUITY',
        symbol: 'RELIANCE',
      });
      const hasCrypto = ranked.some((t) => t.group === 'CRYPTO');
      expect(hasCrypto).toBe(false);
      const allSupportEquity = ranked.every((t) => t.markets.includes('EQUITY'));
      expect(allSupportEquity).toBe(true);
    });

    it('hides expiryDayOnly templates off expiry days', () => {
      // A non-expiry Wednesday
      const nonExpiryDate = '2026-10-21T05:00:00.000Z';
      const ranked = rankTemplates(BUILT_IN_TEMPLATES, {
        assetClass: 'OPTIONS',
        symbol: 'NIFTY',
        entryTime: nonExpiryDate,
      });

      const expiryScalp = ranked.find((t) => t.id === 'fno-expiry-day-scalp');
      expect(expiryScalp).toBeUndefined();
    });

    it('boosts expiryDayOnly templates on an active expiry day', () => {
      // 2026-10-19 is Nifty weekly expiry day (shifted from Dussehra)
      const expiryDate = '2026-10-19T08:00:00.000Z'; // 13:30 IST (in time window 13:00-15:15)
      const ranked = rankTemplates(BUILT_IN_TEMPLATES, {
        assetClass: 'OPTIONS',
        symbol: 'NIFTY',
        entryTime: expiryDate,
      });

      const expiryScalp = ranked.find((t) => t.id === 'fno-expiry-day-scalp');
      expect(expiryScalp).toBeDefined();
      // Should be near top due to time window + expiry fit boost
      expect(ranked[0].id).toBe('fno-expiry-day-scalp');
    });

    it('prioritizes favourites and higher usage counts', () => {
      const templateA: ITradeTemplate = {
        ...samplePercentTemplate,
        id: 'tpl-a',
        name: 'Template A',
        usageCount: 2,
      };
      const templateB: ITradeTemplate = {
        ...samplePercentTemplate,
        id: 'tpl-b',
        name: 'Template B',
        usageCount: 15,
      };
      const templateFav: ITradeTemplate = {
        ...samplePercentTemplate,
        id: 'tpl-fav',
        name: 'Template Favorite',
        isFavorite: true,
        usageCount: 0,
      };

      const ranked = rankTemplates([templateA, templateB, templateFav], {
        assetClass: 'FUTURES',
        symbol: 'NIFTY',
        entryTime: '2026-10-21T06:00:00.000Z', // 11:30 IST (outside ORB window)
      });

      // templateFav has +25 favourite boost, templateB has +15 usage, templateA has +2
      expect(ranked[0].id).toBe('tpl-fav');
      expect(ranked[1].id).toBe('tpl-b');
      expect(ranked[2].id).toBe('tpl-a');
    });
  });

  describe('templatesForAssetClass — Universal Coverage', () => {
    const allAssetClasses: AssetClass[] = [
      'EQUITY',
      'FUTURES',
      'OPTIONS',
      'COMMODITY',
      'FOREX',
      'CRYPTO',
      'INDEX',
    ];

    it('returns at least one template for every asset class in the platform', () => {
      for (const ac of allAssetClasses) {
        const templates = templatesForAssetClass(ac, BUILT_IN_TEMPLATES);
        expect(templates.length).toBeGreaterThan(0);
      }
    });

    it('contains ZERO symbol names inside BUILT_IN_TEMPLATES', () => {
      for (const t of BUILT_IN_TEMPLATES) {
        expect(t).not.toHaveProperty('symbol');
        expect(t.name).not.toContain('NIFTY');
        expect(t.name).not.toContain('BANKNIFTY');
        expect(t.name).not.toContain('RELIANCE');
      }
    });
  });
});
