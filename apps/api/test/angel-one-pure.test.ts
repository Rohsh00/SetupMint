import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { mapTradeToAngelOneSymbol } from '../src/services/market-data/pure/symbol-mapper.js';
import { normalizeAngelOneCandles } from '../src/services/market-data/pure/normalizer.js';
import {
  planAngelOneChunks,
  getAngelOneIntervalName,
  checkAngelOneLookback,
} from '../src/services/market-data/pure/chunk-planner.js';
import { CircuitBreaker } from '../src/services/market-data/circuit-breaker.js';

describe('Angel One Pure Logic Unit Tests', () => {
  describe('Symbol Mapper (mapTradeToAngelOneSymbol)', () => {
    const mockCandidates: any[] = [
      {
        exchange: 'NSE',
        tradingsymbol: 'RELIANCE-EQ',
        symboltoken: '2885',
        name: 'RELIANCE',
        instrumenttype: '',
      },
      {
        exchange: 'BSE',
        tradingsymbol: 'TCS-EQ',
        symboltoken: '532540',
        name: 'TCS',
        instrumenttype: '',
      },
      {
        exchange: 'NSE',
        tradingsymbol: 'Nifty 50',
        symboltoken: '99926000',
        name: 'NIFTY',
        instrumenttype: 'INDEX',
      },
      {
        exchange: 'NSE',
        tradingsymbol: 'Nifty Bank',
        symboltoken: '99926009',
        name: 'BANKNIFTY',
        instrumenttype: 'INDEX',
      },
      {
        exchange: 'NFO',
        tradingsymbol: 'NIFTY26OCT25000CE',
        symboltoken: '45892',
        name: 'NIFTY',
        expiry: '28-OCT-2026',
        strike: 25000,
        instrumenttype: 'OPTIDX',
      },
      {
        exchange: 'MCX',
        tradingsymbol: 'CRUDEOIL26NOVFUT',
        symboltoken: '245601',
        name: 'CRUDEOIL',
        expiry: '19-NOV-2026',
        instrumenttype: 'FUTCOM',
      },
    ];

    it('maps Equity trade on NSE to Angel One format', () => {
      const trade: any = {
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).not.toBeNull();
      expect(result?.exchange).toBe('NSE');
      expect(result?.tradingsymbol).toBe('RELIANCE-EQ');
      expect(result?.symboltoken).toBe('2885');
    });

    it('maps Equity trade on BSE to Angel One format', () => {
      const trade: any = {
        symbol: 'TCS',
        assetClass: 'EQUITY',
        exchange: 'BSE',
        marketSegment: 'BSE_EQ',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).not.toBeNull();
      expect(result?.exchange).toBe('BSE');
      expect(result?.tradingsymbol).toBe('TCS-EQ');
      expect(result?.symboltoken).toBe('532540');
    });

    it('maps Major Index (NIFTY 50) to NSE index token', () => {
      const trade: any = {
        symbol: 'NIFTY 50',
        underlying: 'NIFTY',
        assetClass: 'INDEX',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).not.toBeNull();
      expect(result?.exchange).toBe('NSE');
      expect(result?.symboltoken).toBe('99926000');
      expect(result?.tradingsymbol).toBe('Nifty 50');
    });

    it('maps Options contract using scrip candidate list', () => {
      const trade: any = {
        symbol: 'NIFTY26OCT25000CE',
        underlying: 'NIFTY',
        assetClass: 'OPTIONS',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        optionType: 'CE',
        strikePrice: 25000,
        expiryDate: '2026-10-28',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).not.toBeNull();
      expect(result?.exchange).toBe('NFO');
      expect(result?.tradingsymbol).toBe('NIFTY26OCT25000CE');
      expect(result?.symboltoken).toBe('45892');
    });

    it('maps MCX commodity futures trade', () => {
      const trade: any = {
        symbol: 'CRUDEOIL26NOVFUT',
        underlying: 'CRUDEOIL',
        assetClass: 'FUTURES',
        exchange: 'MCX',
        marketSegment: 'MCX',
        expiryDate: '2026-11-19',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).not.toBeNull();
      expect(result?.exchange).toBe('MCX');
      expect(result?.tradingsymbol).toBe('CRUDEOIL26NOVFUT');
      expect(result?.symboltoken).toBe('245601');
    });

    it('returns null when candidates list is empty or contract does not match', () => {
      const trade: any = {
        symbol: 'NONEXISTENT_CO',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
      };
      const result = mapTradeToAngelOneSymbol(trade, mockCandidates);
      expect(result).toBeNull();

      const emptyResult = mapTradeToAngelOneSymbol(trade, []);
      expect(emptyResult).toBeNull();
    });
  });

  describe('Candle Normalizer (normalizeAngelOneCandles)', () => {
    it('normalizes valid SmartAPI IST rows into UTC epoch seconds and sorted candles', () => {
      const rawRows: [string, number, number, number, number, number][] = [
        ['2026-10-21T09:15:00+05:30', 100, 105, 99, 104, 1000],
        ['2026-10-21T09:16:00+05:30', 104, 108, 103, 107, 1500],
        ['2026-10-21T09:17:00+05:30', 107, 109, 106, 108, 800],
      ];
      const result = normalizeAngelOneCandles(rawRows);
      expect(result.candles).toHaveLength(3);
      expect(result.droppedCount).toBe(0);

      // Verify ascending order
      expect(result.candles[0].t).toBeLessThan(result.candles[1].t);
      expect(result.candles[1].t).toBeLessThan(result.candles[2].t);

      // Verify UTC timestamp conversion (09:15 IST is 03:45 UTC)
      const expectedUtc = moment('2026-10-21T09:15:00+05:30').unix();
      expect(result.candles[0].t).toBe(expectedUtc);
      expect(result.candles[0].o).toBe(100);
      expect(result.candles[0].h).toBe(105);
      expect(result.candles[0].l).toBe(99);
      expect(result.candles[0].c).toBe(104);
      expect(result.candles[0].v).toBe(1000);
    });

    it('drops and counts invalid OHLC rows (h < max(o,c) or l > min(o,c))', () => {
      const rawRows: [string, number, number, number, number, number][] = [
        ['2026-10-21T09:15:00+05:30', 100, 105, 99, 104, 1000], // Valid
        ['2026-10-21T09:16:00+05:30', 100, 95, 90, 92, 500],    // Invalid: high (95) < open (100)
        ['2026-10-21T09:17:00+05:30', 100, 108, 102, 104, 600], // Invalid: low (102) > open (100)
        ['2026-10-21T09:18:00+05:30', 100, 105, 98, 102, -10],  // Invalid: negative volume
        ['2026-10-21T09:19:00+05:30', 102, 106, 101, 105, 1200],// Valid
      ];
      const result = normalizeAngelOneCandles(rawRows);
      expect(result.candles).toHaveLength(2);
      expect(result.droppedCount).toBe(3);
    });

    it('deduplicates identical timestamps keeping the first valid candle and incrementing droppedCount', () => {
      const rawRows: [string, number, number, number, number, number][] = [
        ['2026-10-21T09:15:00+05:30', 100, 105, 99, 104, 1000],
        ['2026-10-21T09:15:00+05:30', 100, 106, 98, 105, 1200], // Duplicate timestamp
        ['2026-10-21T09:16:00+05:30', 104, 108, 103, 107, 1500],
      ];
      const result = normalizeAngelOneCandles(rawRows);
      expect(result.candles).toHaveLength(2);
      expect(result.candles[0].h).toBe(105); // First kept
      expect(result.droppedCount).toBe(1);
    });

    // Property-style randomized test with seeded pseudo-random data
    it('property test: maintains ascending unique timestamps over arbitrary randomized inputs', () => {
      let seed = 42;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      const syntheticRows: [string, number, number, number, number, number][] = [];
      const baseMoment = moment('2026-10-01T09:15:00+05:30');

      for (let i = 0; i < 200; i++) {
        const offsetMinutes = Math.floor(random() * 500);
        const timeStr = baseMoment.clone().add(offsetMinutes, 'minutes').format('YYYY-MM-DDTHH:mm:ss+05:30');
        const open = 100 + Math.floor(random() * 50);
        const close = 100 + Math.floor(random() * 50);
        const high = Math.max(open, close) + Math.floor(random() * 10);
        const low = Math.min(open, close) - Math.floor(random() * 10);
        const volume = Math.floor(random() * 5000);
        syntheticRows.push([timeStr, open, high, low, close, volume]);
      }

      const result = normalizeAngelOneCandles(syntheticRows);
      for (let i = 1; i < result.candles.length; i++) {
        expect(result.candles[i].t).toBeGreaterThan(result.candles[i - 1].t);
        expect(result.candles[i].h).toBeGreaterThanOrEqual(result.candles[i].o);
        expect(result.candles[i].h).toBeGreaterThanOrEqual(result.candles[i].c);
        expect(result.candles[i].l).toBeLessThanOrEqual(result.candles[i].o);
        expect(result.candles[i].l).toBeLessThanOrEqual(result.candles[i].c);
      }
    });
  });

  describe('Chunk Planner (planAngelOneChunks & checkAngelOneLookback)', () => {
    it('maps resolutions to SmartAPI interval names', () => {
      expect(getAngelOneIntervalName('1')).toBe('ONE_MINUTE');
      expect(getAngelOneIntervalName('5')).toBe('FIVE_MINUTE');
      expect(getAngelOneIntervalName('D')).toBe('ONE_DAY');
    });

    it('enforces lookback limits correctly', () => {
      const now = new Date('2026-10-25T12:00:00Z');
      const inside1m = new Date('2026-10-10T12:00:00Z'); // 15 days ago
      const outside1m = new Date('2025-01-01T12:00:00Z'); // > 365 days ago

      expect(checkAngelOneLookback(inside1m, '1', now).ok).toBe(true);
      const outsideRes = checkAngelOneLookback(outside1m, '1', now);
      expect(outsideRes.ok).toBe(false);
      if (!outsideRes.ok) {
        expect(outsideRes.reason).toBe('OUTSIDE_PROVIDER_LOOKBACK');
      }
    });

    it('plans single chunk for intra-day range', () => {
      const from = new Date('2026-10-21T03:45:00Z');
      const to = new Date('2026-10-21T09:30:00Z');
      const result = planAngelOneChunks('1', from, to);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.chunks).toHaveLength(1);
        expect(result.interval).toBe('ONE_MINUTE');
      }
    });

    it('splits large 1-minute ranges into chunks of at most 15 days without gaps', () => {
      const from = new Date('2026-10-01T03:45:00Z');
      const to = new Date('2026-10-28T09:30:00Z'); // 27 days
      const result = planAngelOneChunks('1', from, to);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.chunks.length).toBeGreaterThan(1);
        expect(result.chunks[0].fromdate).toBeDefined();
        expect(result.chunks[0].todate).toBeDefined();
      }
    });
  });

  describe('Circuit Breaker (in-memory per-user fail-fast)', () => {
    it('transitions from CLOSED to OPEN after failure threshold and enters HALF-OPEN after cooldown', () => {
      let currentTime = 1000000;
      const fakeClock = () => currentTime;

      const breaker = new CircuitBreaker(3, 60000, fakeClock);
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe('CLOSED');

      // Record 2 failures -> stays CLOSED
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe('CLOSED');

      // 3rd failure -> trips OPEN
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);

      // Advance time by 30 seconds -> still within cooldown (60s) -> stays OPEN
      currentTime += 30000;
      expect(breaker.canExecute()).toBe(false);

      // Advance time past cooldown -> becomes HALF-OPEN
      currentTime += 35000; // Total 65s
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Successful probe in HALF-OPEN resets breaker to CLOSED
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);
    });

    it('re-opens immediately if a probe fails during HALF-OPEN state', () => {
      let currentTime = 1000000;
      const fakeClock = () => currentTime;

      const breaker = new CircuitBreaker(3, 60000, fakeClock);
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');

      // Advance past cooldown
      currentTime += 65000;
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Failed probe in HALF-OPEN trips back to OPEN
      breaker.recordFailure();
      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);
    });
  });
});
