import { describe, it, expect } from 'vitest';
import {
  detectHtfTrend4h,
  detectLtfSetup5m,
  matchStrategyAndVariant,
  IExcursionCandle,
} from '../src/index.js';

describe('Pattern Recognition Engine (4H Trend + 5M Setup)', () => {
  // Helper to generate simulated candles
  function generateCandle(
    t: number,
    o: number,
    h: number,
    l: number,
    c: number
  ): IExcursionCandle {
    return { t, o, h, l, c, v: 1000 };
  }

  describe('1. 4H Trend Detection (detectHtfTrend4h)', () => {
    it('detects a BULLISH 4H trend with Higher Highs and Higher Lows above 20 EMA', () => {
      const candles: IExcursionCandle[] = [];
      const baseTime = 1700000000;
      let price = 100;

      // 25 candles with an upward staircase
      for (let i = 0; i < 25; i++) {
        const o = price;
        const c = price + 2;
        const h = c + 1;
        const l = o - 0.5;
        candles.push(generateCandle(baseTime + i * 14400, o, h, l, c));
        price += 1.5;
      }

      const res = detectHtfTrend4h(candles);
      expect(res.htfTrend).toBe('BULLISH');
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
      expect(res.reasoning).toContain('4H');
    });

    it('detects a BEARISH 4H trend with Lower Highs and Lower Lows below 20 EMA', () => {
      const candles: IExcursionCandle[] = [];
      const baseTime = 1700000000;
      let price = 200;

      for (let i = 0; i < 25; i++) {
        const o = price;
        const c = price - 2;
        const h = o + 0.5;
        const l = c - 1;
        candles.push(generateCandle(baseTime + i * 14400, o, h, l, c));
        price -= 1.5;
      }

      const res = detectHtfTrend4h(candles);
      expect(res.htfTrend).toBe('BEARISH');
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
      expect(res.reasoning).toContain('4H');
    });

    it('returns NEUTRAL when candle history is sparse or sideways', () => {
      const candles = [
        generateCandle(1000, 100, 101, 99, 100),
        generateCandle(2000, 100, 101, 99, 100),
      ];
      const res = detectHtfTrend4h(candles);
      expect(res.htfTrend).toBe('NEUTRAL');
      expect(res.confidence).toBe(0.5);
    });
  });

  describe('2. 5M Lower Timeframe Setup Detection (detectLtfSetup5m)', () => {
    const baseTime = 1700000000;

    it('detects Equal Lows Liquidity Sweep (EQL) for LONG', () => {
      const candles: IExcursionCandle[] = [
        // Prior approach
        generateCandle(baseTime - 300, 106, 107, 104, 105),
        // First low at 100.00
        generateCandle(baseTime, 105, 105.5, 100.0, 102),
        // Small bounce to 103 (neckline)
        generateCandle(baseTime + 300, 102, 103.5, 101.5, 103),
        // Second dip to equal low ~100.05 (diff 0.05% <= 0.2%)
        generateCandle(baseTime + 600, 103, 103.2, 100.05, 102.2),
        // Rebound / Entry candle
        generateCandle(baseTime + 900, 102.2, 105.0, 102.0, 104.5),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'LONG',
        entryTimeMs: (baseTime + 900) * 1000,
        entryPrice: 104.0,
      });

      expect(res.pattern).toBe('EQL');
      expect(res.patternType).toBe('EQUAL_LOWS');
      expect(res.secondLegStatus).toBe('NOT_APPLICABLE');
      expect(res.liquiditySide).toBe('SELL_SIDE');
      expect(res.confidence).toBeGreaterThan(0.8);
      expect(res.reasoning).toContain('Equal Lows');
    });

    it('detects W-Pattern Second-Leg Sweep (W-SWEEP) for LONG', () => {
      const candles: IExcursionCandle[] = [
        // First low at 100
        generateCandle(baseTime, 104, 105, 100.0, 102),
        // Neckline rally to 106
        generateCandle(baseTime + 300, 102, 106.0, 101.5, 105.5),
        // Second leg sweeps below 100 down to 98.2 (L2 < L1)
        generateCandle(baseTime + 600, 105.5, 105.8, 98.2, 101.0),
        // Bullish MSS / displacement
        generateCandle(baseTime + 900, 101.0, 104.5, 100.8, 104.2),
        // Entry
        generateCandle(baseTime + 1200, 104.2, 107.0, 103.9, 106.8),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'LONG',
        entryTimeMs: (baseTime + 1200) * 1000,
        entryPrice: 106.0,
      });

      expect(res.pattern).toBe('W-SWEEP');
      expect(res.patternType).toBe('W');
      expect(res.secondLegStatus).toBe('SWEPT');
      expect(res.liquiditySide).toBe('SELL_SIDE');
      expect(res.leg2Price).toBeLessThan(res.leg1Price!);
      expect(res.reasoning).toContain('Second-Leg Sweep');
    });

    it('detects W-Pattern Unswept Higher Low (W-UNSWEPT) for LONG', () => {
      const candles: IExcursionCandle[] = [
        // First low at 95.0
        generateCandle(baseTime, 100, 101, 95.0, 98),
        // Neckline rally to 102
        generateCandle(baseTime + 300, 98, 102.0, 97.5, 101),
        // Second leg holds at 97.5 (higher low, L2 > L1)
        generateCandle(baseTime + 600, 101, 101.5, 97.5, 99.8),
        // Bullish displacement & Entry
        generateCandle(baseTime + 900, 99.8, 104.0, 99.5, 103.5),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'LONG',
        entryTimeMs: (baseTime + 900) * 1000,
        entryPrice: 103.0,
      });

      expect(res.pattern).toBe('W-UNSWEPT');
      expect(res.patternType).toBe('W');
      expect(res.secondLegStatus).toBe('UNSWEPT');
      expect(res.liquiditySide).toBe('NONE');
      expect(res.leg2Price).toBeGreaterThanOrEqual(res.leg1Price!);
      expect(res.reasoning).toContain('Unswept');
    });

    it('detects Equal Highs Liquidity Sweep (EQH) for SHORT', () => {
      const candles: IExcursionCandle[] = [
        // Prior approach
        generateCandle(baseTime - 300, 194, 195, 193, 194),
        // First high at 200.00
        generateCandle(baseTime, 194, 200.0, 193.5, 198),
        // Pullback to 196 (neckline)
        generateCandle(baseTime + 300, 198, 198.5, 196.0, 196.5),
        // Second high to near equal high 200.05 (diff 0.025% <= 0.2%)
        generateCandle(baseTime + 600, 196.5, 200.05, 196.0, 198),
        // Breakdown & Entry
        generateCandle(baseTime + 900, 198, 198.5, 193.0, 193.5),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'SHORT',
        entryTimeMs: (baseTime + 900) * 1000,
        entryPrice: 194.0,
      });

      expect(res.pattern).toBe('EQH');
      expect(res.patternType).toBe('EQUAL_HIGHS');
      expect(res.secondLegStatus).toBe('NOT_APPLICABLE');
      expect(res.liquiditySide).toBe('BUY_SIDE');
      expect(res.reasoning).toContain('Equal Highs');
    });

    it('detects M-Pattern Second-Leg Sweep (M-SWEEP) for SHORT', () => {
      const candles: IExcursionCandle[] = [
        // First high at 200
        generateCandle(baseTime, 195, 200.0, 194, 198),
        // Neckline low at 194
        generateCandle(baseTime + 300, 198, 198.5, 194.0, 195),
        // Second leg sweeps higher to 203.5 (H2 > H1)
        generateCandle(baseTime + 600, 195, 203.5, 194.8, 198),
        // Bearish MSS / displacement
        generateCandle(baseTime + 900, 198, 198.5, 192.0, 192.5),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'SHORT',
        entryTimeMs: (baseTime + 900) * 1000,
        entryPrice: 193.0,
      });

      expect(res.pattern).toBe('M-SWEEP');
      expect(res.patternType).toBe('M');
      expect(res.secondLegStatus).toBe('SWEPT');
      expect(res.liquiditySide).toBe('BUY_SIDE');
      expect(res.leg2Price).toBeGreaterThan(res.leg1Price!);
      expect(res.reasoning).toContain('Second-Leg Sweep');
    });

    it('detects M-Pattern Unswept Lower High (M-UNSWEPT) for SHORT', () => {
      const candles: IExcursionCandle[] = [
        // First high at 205.0
        generateCandle(baseTime, 198, 205.0, 197, 201),
        // Neckline low at 195
        generateCandle(baseTime + 300, 201, 201.5, 195.0, 196),
        // Second leg holds at 201.0 (lower high, H2 < H1)
        generateCandle(baseTime + 600, 196, 201.0, 195.5, 198),
        // Bearish displacement & Entry
        generateCandle(baseTime + 900, 198, 198.2, 191.0, 191.5),
      ];

      const res = detectLtfSetup5m({
        candles5m: candles,
        direction: 'SHORT',
        entryTimeMs: (baseTime + 900) * 1000,
        entryPrice: 192.0,
      });

      expect(res.pattern).toBe('M-UNSWEPT');
      expect(res.patternType).toBe('M');
      expect(res.secondLegStatus).toBe('UNSWEPT');
      expect(res.liquiditySide).toBe('NONE');
      expect(res.leg2Price).toBeLessThanOrEqual(res.leg1Price!);
      expect(res.reasoning).toContain('Unswept');
    });
  });

  describe('3. Strategy and Variant Matching (matchStrategyAndVariant)', () => {
    const mockStrategies = [
      {
        _id: 'strat-1',
        name: 'Bullish HTF Retracement — LTF Liquidity Sweep & Confirmation',
        variants: [
          { key: 'BULL-SSL-EQL', name: 'Equal Lows Liquidity Sweep', expected: { direction: 'LONG', patternType: 'EQUAL_LOWS' } },
          { key: 'BULL-SSL-W-SWEEP', name: 'W Pattern — Second-Leg Sweep', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'SWEPT' } },
          { key: 'BULL-W-UNSWEPT', name: 'W Pattern — Unswept Higher Low', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'UNSWEPT' } },
        ],
      },
      {
        _id: 'strat-2',
        name: 'Bearish HTF Retracement — LTF Liquidity Sweep & Confirmation',
        variants: [
          { key: 'BEAR-BSL-EQH', name: 'Equal Highs Liquidity Sweep', expected: { direction: 'SHORT', patternType: 'EQUAL_HIGHS' } },
          { key: 'BEAR-BSL-M-SWEEP', name: 'M Pattern — Second-Leg Sweep', expected: { direction: 'SHORT', patternType: 'M', secondLegStatus: 'SWEPT' } },
          { key: 'BEAR-M-UNSWEPT', name: 'M Pattern — Unswept Lower High', expected: { direction: 'SHORT', patternType: 'M', secondLegStatus: 'UNSWEPT' } },
        ],
      },
      {
        _id: 'strat-3',
        name: 'Bullish HTF Reversal — LTF Liquidity Sweep & Confirmation',
        variants: [
          { key: 'BULL-REV-SSL-EQL', name: 'Bullish Reversal — Equal Lows', expected: { direction: 'LONG', patternType: 'EQUAL_LOWS' } },
          { key: 'BULL-REV-SSL-W-SWEEP', name: 'Bullish Reversal — W Sweep', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'SWEPT' } },
          { key: 'BULL-REV-W-UNSWEPT', name: 'Bullish Reversal — W Unswept', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'UNSWEPT' } },
        ],
      },
      {
        _id: 'strat-4',
        name: 'Bearish HTF Reversal — LTF Liquidity Sweep & Confirmation',
        variants: [
          { key: 'BEAR-REV-BSL-EQH', name: 'Bearish Reversal — Equal Highs', expected: { direction: 'SHORT', patternType: 'EQUAL_HIGHS' } },
          { key: 'BEAR-REV-BSL-M-SWEEP', name: 'Bearish Reversal — M Sweep', expected: { direction: 'SHORT', patternType: 'M', secondLegStatus: 'SWEPT' } },
          { key: 'BEAR-REV-M-UNSWEPT', name: 'Bearish Reversal — M Unswept', expected: { direction: 'SHORT', patternType: 'M', secondLegStatus: 'UNSWEPT' } },
        ],
      },
    ];

    it('matches 4H BULLISH + LONG W-SWEEP -> Bullish Retracement with BULL-SSL-W-SWEEP', () => {
      const match = matchStrategyAndVariant({
        htfTrend: 'BULLISH',
        ltfSetup: {
          pattern: 'W-SWEEP',
          patternType: 'W',
          secondLegStatus: 'SWEPT',
          liquiditySide: 'SELL_SIDE',
          confidence: 0.9,
          reasoning: 'W-Pattern Second-Leg Sweep',
        },
        direction: 'LONG',
        availableStrategies: mockStrategies,
      });

      expect(match.strategyId).toBe('strat-1');
      expect(match.strategyName).toContain('Bullish HTF Retracement');
      expect(match.variantKey).toBe('BULL-SSL-W-SWEEP');
      expect(match.momentumRelation).toBe('WITH_HTF');
    });

    it('matches 4H BEARISH + LONG W-SWEEP -> Bullish Reversal with BULL-REV-SSL-W-SWEEP', () => {
      const match = matchStrategyAndVariant({
        htfTrend: 'BEARISH',
        ltfSetup: {
          pattern: 'W-SWEEP',
          patternType: 'W',
          secondLegStatus: 'SWEPT',
          liquiditySide: 'SELL_SIDE',
          confidence: 0.9,
          reasoning: 'W-Pattern Second-Leg Sweep',
        },
        direction: 'LONG',
        availableStrategies: mockStrategies,
      });

      expect(match.strategyId).toBe('strat-3');
      expect(match.strategyName).toContain('Bullish HTF Reversal');
      expect(match.variantKey).toBe('BULL-REV-SSL-W-SWEEP');
      expect(match.momentumRelation).toBe('AGAINST_HTF');
    });

    it('matches 4H BEARISH + SHORT M-SWEEP -> Bearish Retracement with BEAR-BSL-M-SWEEP', () => {
      const match = matchStrategyAndVariant({
        htfTrend: 'BEARISH',
        ltfSetup: {
          pattern: 'M-SWEEP',
          patternType: 'M',
          secondLegStatus: 'SWEPT',
          liquiditySide: 'BUY_SIDE',
          confidence: 0.9,
          reasoning: 'M-Pattern Second-Leg Sweep',
        },
        direction: 'SHORT',
        availableStrategies: mockStrategies,
      });

      expect(match.strategyId).toBe('strat-2');
      expect(match.strategyName).toContain('Bearish HTF Retracement');
      expect(match.variantKey).toBe('BEAR-BSL-M-SWEEP');
      expect(match.momentumRelation).toBe('WITH_HTF');
    });

    it('matches 4H BULLISH + SHORT EQH -> Bearish Reversal with BEAR-REV-BSL-EQH', () => {
      const match = matchStrategyAndVariant({
        htfTrend: 'BULLISH',
        ltfSetup: {
          pattern: 'EQH',
          patternType: 'EQUAL_HIGHS',
          secondLegStatus: 'NOT_APPLICABLE',
          liquiditySide: 'BUY_SIDE',
          confidence: 0.92,
          reasoning: 'Equal Highs Sweep',
        },
        direction: 'SHORT',
        availableStrategies: mockStrategies,
      });

      expect(match.strategyId).toBe('strat-4');
      expect(match.strategyName).toContain('Bearish HTF Reversal');
      expect(match.variantKey).toBe('BEAR-REV-BSL-EQH');
      expect(match.momentumRelation).toBe('AGAINST_HTF');
    });
  });
});
