import { describe, it, expect } from 'vitest';
import {
  normalizeUnderlying,
  normalizeChartResolution,
  resolveSnapshotTimeframes,
  calculateRLadderLevels,
} from '../src/chart-helpers.js';

describe('Financial Engine - Snapshot Resolver & Chart Helpers', () => {
  describe('normalizeUnderlying', () => {
    it('strips exchange prefixes and standard Indian derivative formats', () => {
      expect(normalizeUnderlying('NSE:NIFTY24OCT24500CE')).toBe('NIFTY');
      expect(normalizeUnderlying('NIFTY24OCT24500PE')).toBe('NIFTY');
      expect(normalizeUnderlying('BANKNIFTY24D1252000CE')).toBe('BANKNIFTY');
      expect(normalizeUnderlying('FINNIFTY24NOVFUT')).toBe('FINNIFTY');
      expect(normalizeUnderlying('MCX:CRUDEOIL24NOVFUT')).toBe('CRUDEOIL');
    });

    it('strips equity suffixes and handles raw symbols', () => {
      expect(normalizeUnderlying('NSE:RELIANCE-EQ')).toBe('RELIANCE');
      expect(normalizeUnderlying('TCS.NS')).toBe('TCS');
      expect(normalizeUnderlying('INFY')).toBe('INFY');
      expect(normalizeUnderlying('nifty')).toBe('NIFTY');
    });

    it('handles empty or missing inputs gracefully', () => {
      expect(normalizeUnderlying('')).toBe('');
      expect(normalizeUnderlying(undefined as any)).toBe('');
    });
  });

  describe('normalizeChartResolution', () => {
    it('maps standard string and numeric timeframes', () => {
      expect(normalizeChartResolution('1').resolution).toBe('1');
      expect(normalizeChartResolution('5m').resolution).toBe('5');
      expect(normalizeChartResolution('15m').resolution).toBe('15');
      expect(normalizeChartResolution('30m').resolution).toBe('30');
      expect(normalizeChartResolution('1h').resolution).toBe('60');
      expect(normalizeChartResolution('60m').resolution).toBe('60');
      expect(normalizeChartResolution('4h').resolution).toBe('240');
      expect(normalizeChartResolution('240m').resolution).toBe('240');
      expect(normalizeChartResolution('1d').resolution).toBe('D');
      expect(normalizeChartResolution('Daily').resolution).toBe('D');
      expect(normalizeChartResolution('D').resolution).toBe('D');
    });

    it('maps non-standard timeframes to closest supported with warnings', () => {
      const res3m = normalizeChartResolution('3m');
      expect(res3m.resolution).toBe('5');
      expect(res3m.warning?.toLowerCase()).toContain('unsupported');

      const res2h = normalizeChartResolution('120m');
      expect(res2h.resolution).toBe('60');
      expect(res2h.warning).toBeDefined();

      const resW = normalizeChartResolution('1W');
      expect(resW.resolution).toBe('D');
      expect(resW.warning).toBeDefined();
    });
  });

  describe('resolveSnapshotTimeframes', () => {
    const defaultSettings = {
      defaultHtfResolution: '240',
      defaultLtfResolution: '5',
      instrumentOverrides: [
        {
          symbol: 'NIFTY',
          htfResolution: '60',
          ltfResolution: '1',
          strategyId: 'strat-nifty-momentum',
          preferredStrategyName: 'Nifty 1m Scalp',
        },
        {
          symbol: 'BANKNIFTY',
          htfResolution: '240',
          ltfResolution: '240', // HTF == LTF
          strategyId: 'strat-bn-swing',
          preferredStrategyName: 'BankNifty 4H Swing',
        },
      ],
    };

    it('matches exact and derived underlying symbols in instrument overrides', () => {
      const tradeOption = {
        symbol: 'NSE:NIFTY24OCT24500CE',
        durationMinutes: 45,
      };

      const result = resolveSnapshotTimeframes(tradeOption, defaultSettings);
      expect(result.source).toBe('INSTRUMENT_OVERRIDE');
      expect(result.matchedSymbol).toBe('NIFTY');
      expect(result.resolutions).toEqual(['1', '60']);
      expect(result.htf).toBe('60');
      expect(result.ltf).toBe('1');
      expect(result.preferredStrategyId).toBe('strat-nifty-momentum');
      expect(result.preferredStrategyName).toBe('Nifty 1m Scalp');
      expect(result.settingsDescription).toContain('NIFTY override');
    });

    it('falls back to user default settings when no override matches', () => {
      const tradeEquity = {
        symbol: 'TATASTEEL',
        durationMinutes: 120,
      };

      const result = resolveSnapshotTimeframes(tradeEquity, defaultSettings);
      expect(result.source).toBe('DEFAULT');
      expect(result.resolutions).toEqual(['5', '240']);
      expect(result.htf).toBe('240');
      expect(result.ltf).toBe('5');
      expect(result.settingsDescription).toContain('Generated using default settings');
    });

    it('deduplicates resolutions when HTF == LTF producing 1 resolution', () => {
      const tradeBn = {
        symbol: 'BANKNIFTY24NOVFUT',
        durationMinutes: 300,
      };

      const result = resolveSnapshotTimeframes(tradeBn, defaultSettings);
      expect(result.source).toBe('INSTRUMENT_OVERRIDE');
      expect(result.resolutions).toEqual(['240']);
      expect(result.htf).toBe('240');
      expect(result.ltf).toBe('240');
    });

    it('uses legacy adaptive fallback when settings are missing or empty', () => {
      // Short duration <= 4 hours (240 min) -> 1m, 5m
      const shortTrade = {
        symbol: 'RELIANCE',
        entryDate: '2026-10-21T09:15:00Z',
        exitDate: '2026-10-21T10:30:00Z',
      };
      const resShort = resolveSnapshotTimeframes(shortTrade, null);
      expect(resShort.source).toBe('ADAPTIVE_FALLBACK');
      expect(resShort.resolutions).toEqual(['1', '5']);

      // Long duration > 4 hours -> 5m, 15m
      const longTrade = {
        symbol: 'RELIANCE',
        entryDate: '2026-10-20T09:15:00Z',
        exitDate: '2026-10-21T15:30:00Z',
      };
      const resLong = resolveSnapshotTimeframes(longTrade, undefined);
      expect(resLong.source).toBe('ADAPTIVE_FALLBACK');
      expect(resLong.resolutions).toEqual(['5', '15']);
    });
  });

  describe('calculateRLadderLevels', () => {
    it('calculates 1R, 2R, 3R target levels correctly for LONG trades', () => {
      // Entry: 100, SL: 95 -> 1R risk = 5
      const levels = calculateRLadderLevels('LONG', 100, 95, [1, 2, 3]);
      expect(levels).toHaveLength(3);
      expect(levels[0]).toEqual({ r: 1, price: 105, label: '1R' });
      expect(levels[1]).toEqual({ r: 2, price: 110, label: '2R' });
      expect(levels[2]).toEqual({ r: 3, price: 115, label: '3R' });
    });

    it('calculates 1R, 2R, 3R target levels correctly for SHORT trades', () => {
      // Entry: 200, SL: 210 -> 1R risk = 10
      const levels = calculateRLadderLevels('SHORT', 200, 210, [1, 2, 3]);
      expect(levels).toHaveLength(3);
      expect(levels[0]).toEqual({ r: 1, price: 190, label: '1R' });
      expect(levels[1]).toEqual({ r: 2, price: 180, label: '2R' });
      expect(levels[2]).toEqual({ r: 3, price: 170, label: '3R' });
    });

    it('returns empty array when stop loss is invalid or inverted', () => {
      // LONG with SL >= Entry
      expect(calculateRLadderLevels('LONG', 100, 105)).toEqual([]);
      expect(calculateRLadderLevels('LONG', 100, 100)).toEqual([]);

      // SHORT with SL <= Entry
      expect(calculateRLadderLevels('SHORT', 100, 95)).toEqual([]);
      expect(calculateRLadderLevels('SHORT', 100, 100)).toEqual([]);

      // Non-positive prices
      expect(calculateRLadderLevels('LONG', 0, -5)).toEqual([]);
    });

    it('preserves decimal accuracy without floating point errors', () => {
      // Entry: 100.1, SL: 100.0 -> Risk = 0.1
      const levels = calculateRLadderLevels('LONG', 100.1, 100.0, [1, 2, 3]);
      expect(levels[0].price).toBe(100.2);
      expect(levels[1].price).toBe(100.3);
      expect(levels[2].price).toBe(100.4);
    });
  });
});
