import { describe, it, expect } from 'vitest';
import {
  aggregateCandles,
  selectChartWindow,
  estimateFetchRange,
  IExcursionCandle,
} from '../src/chart-helpers.js';

describe('Chart Helpers - aggregateCandles', () => {
  // 2026-10-21 (Wednesday)
  // IST 09:15 = UTC 03:45 = 1761018300000 ms
  const baseUtcMs = Date.UTC(2026, 9, 21, 3, 45, 0, 0);

  it('correctly aggregates 1m candles into 5m buckets anchored at 09:15 IST', () => {
    // 10 1m candles: 09:15 to 09:24
    const candles1m: IExcursionCandle[] = [];
    for (let i = 0; i < 10; i++) {
      candles1m.push({
        t: baseUtcMs + i * 60_000,
        o: 100 + i,
        h: 105 + i,
        l: 95 + i,
        c: 102 + i,
        v: 100,
      });
    }

    const { candles, droppedCount } = aggregateCandles(candles1m, 5, '09:15');

    expect(droppedCount).toBe(0);
    expect(candles).toHaveLength(2);

    // Bucket 1: 09:15 - 09:19 (indices 0 to 4)
    expect(candles[0].t).toBe(baseUtcMs);
    expect(candles[0].o).toBe(100); // open of 09:15
    expect(candles[0].c).toBe(106); // close of 09:19 (102 + 4)
    expect(candles[0].h).toBe(109); // max of 105..109
    expect(candles[0].l).toBe(95); // min of 95..99
    expect(candles[0].v).toBe(500); // 5 * 100

    // Bucket 2: 09:20 - 09:24 (indices 5 to 9)
    expect(candles[1].t).toBe(baseUtcMs + 5 * 60_000);
    expect(candles[1].o).toBe(105); // open of 09:20
    expect(candles[1].c).toBe(111); // close of 09:24
    expect(candles[1].h).toBe(114);
    expect(candles[1].l).toBe(100);
    expect(candles[1].v).toBe(500);
  });

  it('handles partial last bucket and gaps properly', () => {
    // 7 1m candles: 09:15 to 09:21
    const candles1m: IExcursionCandle[] = [];
    for (let i = 0; i < 7; i++) {
      candles1m.push({
        t: baseUtcMs + i * 60_000,
        o: 200 + i,
        h: 210 + i,
        l: 195 + i,
        c: 205 + i,
        v: 50,
      });
    }

    const { candles, droppedCount } = aggregateCandles(candles1m, 5, '09:15');
    expect(droppedCount).toBe(0);
    expect(candles).toHaveLength(2);
    // Bucket 1 has 5 candles, Bucket 2 has partial 2 candles
    expect(candles[1].v).toBe(100);
    expect(candles[1].o).toBe(205);
    expect(candles[1].c).toBe(211);
  });

  it('guarantees 1m -> 5m -> 15m equivalence', () => {
    // Generate 15 1m candles
    const candles1m: IExcursionCandle[] = [];
    for (let i = 0; i < 15; i++) {
      candles1m.push({
        t: baseUtcMs + i * 60_000,
        o: 1000 + i * 2,
        h: 1010 + i * 2,
        l: 990 + i * 2,
        c: 1005 + i * 2,
        v: 10 + i,
      });
    }

    // Direct 1m -> 15m
    const direct15m = aggregateCandles(candles1m, 15, '09:15').candles;

    // Two-step: 1m -> 5m -> 15m
    const step5m = aggregateCandles(candles1m, 5, '09:15').candles;
    const twoStep15m = aggregateCandles(step5m, 15, '09:15').candles;

    expect(direct15m).toHaveLength(1);
    expect(twoStep15m).toHaveLength(1);
    expect(direct15m[0].o).toBe(twoStep15m[0].o);
    expect(direct15m[0].h).toBe(twoStep15m[0].h);
    expect(direct15m[0].l).toBe(twoStep15m[0].l);
    expect(direct15m[0].c).toBe(twoStep15m[0].c);
    expect(direct15m[0].v).toBe(twoStep15m[0].v);
  });

  it('drops malformed candles and counts dropped rows accurately', () => {
    const rawWithMalformed: any[] = [
      { t: baseUtcMs, o: 100, h: 105, l: 95, c: 102, v: 10 },
      { t: baseUtcMs + 60_000, o: -5, h: 105, l: 95, c: 102, v: 10 }, // negative open
      { t: baseUtcMs + 120_000, o: 100, h: 90, l: 95, c: 102, v: 10 }, // high < low
      { t: 'invalid', o: 100, h: 105, l: 95, c: 102, v: 10 }, // invalid t
      null, // null
      { t: baseUtcMs + 180_000, o: 100, h: 105, l: 95, c: 102, v: 20 }, // valid
    ];

    const result = aggregateCandles(rawWithMalformed, 5, '09:15');
    expect(result.droppedCount).toBe(4);
    expect(result.candles).toHaveLength(1);
    expect(result.candles[0].v).toBe(30);
  });

  it('is strictly deterministic', () => {
    const candles1m: IExcursionCandle[] = [
      { t: baseUtcMs, o: 50, h: 55, l: 45, c: 52, v: 100 },
      { t: baseUtcMs + 60_000, o: 52, h: 58, l: 50, c: 56, v: 150 },
      { t: baseUtcMs + 120_000, o: 56, h: 60, l: 54, c: 59, v: 200 },
    ];

    const run1 = aggregateCandles(candles1m, 15, '09:15');
    const run2 = aggregateCandles(candles1m, 15, '09:15');

    expect(run1).toEqual(run2);
  });
});

describe('Chart Helpers - selectChartWindow', () => {
  const baseUtcMs = Date.UTC(2026, 9, 21, 3, 45, 0, 0); // 09:15 IST
  // Generate 200 5m candles
  const generateCandles = (count: number): IExcursionCandle[] => {
    const arr: IExcursionCandle[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        t: baseUtcMs + i * 5 * 60_000,
        o: 1000 + i,
        h: 1005 + i,
        l: 995 + i,
        c: 1002 + i,
        v: 100,
      });
    }
    return arr;
  };

  const sampleCandles = generateCandles(200);

  it('handles standard padding before and after (45, 45)', () => {
    // Entry at index 60, Exit at index 70 (span = 11 candles)
    const entryTime = baseUtcMs + 60 * 5 * 60_000;
    const exitTime = baseUtcMs + 70 * 5 * 60_000;

    const res = selectChartWindow(sampleCandles, entryTime, exitTime, 45, 45, 1500);

    expect(res.truncated).toBe(false);
    expect(res.requestedBefore).toBe(45);
    expect(res.requestedAfter).toBe(45);
    expect(res.appliedBefore).toBe(45);
    expect(res.appliedAfter).toBe(45);
    expect(res.candles).toHaveLength(45 + 11 + 45); // 101 candles
    expect(res.entryIndex).toBe(45);
    expect(res.exitIndex).toBe(45 + 10);
  });

  it('handles 0 padding before and after', () => {
    const entryTime = baseUtcMs + 60 * 5 * 60_000;
    const exitTime = baseUtcMs + 70 * 5 * 60_000;

    const res = selectChartWindow(sampleCandles, entryTime, exitTime, 0, 0, 1500);

    expect(res.truncated).toBe(false);
    expect(res.appliedBefore).toBe(0);
    expect(res.appliedAfter).toBe(0);
    expect(res.candles).toHaveLength(11);
    expect(res.entryIndex).toBe(0);
    expect(res.exitIndex).toBe(10);
  });

  it('handles asymmetric padding (10 before / 100 after)', () => {
    const entryTime = baseUtcMs + 20 * 5 * 60_000;
    const exitTime = baseUtcMs + 30 * 5 * 60_000;

    const res = selectChartWindow(sampleCandles, entryTime, exitTime, 10, 100, 1500);

    expect(res.appliedBefore).toBe(10);
    expect(res.appliedAfter).toBe(100);
    expect(res.candles).toHaveLength(10 + 11 + 100);
    expect(res.entryIndex).toBe(10);
  });

  it('clamps padding when entry is near the start of dataset', () => {
    const entryTime = baseUtcMs + 5 * 5 * 60_000; // index 5
    const exitTime = baseUtcMs + 10 * 5 * 60_000; // index 10

    const res = selectChartWindow(sampleCandles, entryTime, exitTime, 45, 20, 1500);

    // Only 5 candles available before entry
    expect(res.requestedBefore).toBe(45);
    expect(res.appliedBefore).toBe(5);
    expect(res.appliedAfter).toBe(20);
    expect(res.entryIndex).toBe(5);
  });

  it('clamps padding when exit is near the end of dataset', () => {
    const entryTime = baseUtcMs + 180 * 5 * 60_000; // index 180
    const exitTime = baseUtcMs + 195 * 5 * 60_000; // index 195

    const res = selectChartWindow(sampleCandles, entryTime, exitTime, 20, 45, 1500);

    // Only 4 candles after exit in 200 candle array (indices 196, 197, 198, 199)
    expect(res.requestedAfter).toBe(45);
    expect(res.appliedAfter).toBe(4);
    expect(res.appliedBefore).toBe(20);
  });

  it('scales padding proportionally when span + padding > maxCandles, preserving ratio', () => {
    const largeDataset = generateCandles(2000);
    // Span = 1300 candles (from index 200 to 1499)
    const entryTime = baseUtcMs + 200 * 5 * 60_000;
    const exitTime = baseUtcMs + 1499 * 5 * 60_000;
    const span = 1300;

    // Requested: 200 before, 100 after (total 300 padding). Max is 1500.
    // Available budget = 1500 - 1300 = 200.
    // Ratio = 200 / 300 = 2/3.
    // appliedBefore = floor(200 * 2/3) = 133
    // appliedAfter = floor(100 * 2/3) = 66
    const res = selectChartWindow(largeDataset, entryTime, exitTime, 200, 100, 1500);

    expect(res.truncated).toBe(true);
    expect(res.appliedBefore).toBe(133);
    expect(res.appliedAfter).toBe(66);
    expect(res.candles.length).toBeLessThanOrEqual(1500);
  });

  it('truncates window and zeroes padding when trade span alone exceeds maxCandles', () => {
    const hugeDataset = generateCandles(2000);
    // Span = 1600 candles (exceeds 1500)
    const entryTime = baseUtcMs + 100 * 5 * 60_000;
    const exitTime = baseUtcMs + 1699 * 5 * 60_000;

    const res = selectChartWindow(hugeDataset, entryTime, exitTime, 45, 45, 1500);

    expect(res.truncated).toBe(true);
    expect(res.appliedBefore).toBe(0);
    expect(res.appliedAfter).toBe(0);
    expect(res.candles).toHaveLength(1500);
    expect(res.entryIndex).toBe(0);
  });
});

describe('Chart Helpers - estimateFetchRange', () => {
  const entryDate = new Date('2026-10-21T09:30:00.000Z');
  const exitDate = new Date('2026-10-21T10:30:00.000Z');

  it('computes asymmetric fetch range with calendar widening buffer', () => {
    const { from, to } = estimateFetchRange(entryDate, exitDate, 5, 45, 15);

    expect(from.getTime()).toBeLessThan(entryDate.getTime());
    expect(to.getTime()).toBeGreaterThan(exitDate.getTime());

    // Before padding is 45 x 5m = 225m + calendar buffer
    const diffBeforeMs = entryDate.getTime() - from.getTime();
    expect(diffBeforeMs).toBeGreaterThan(45 * 5 * 60_000);

    // After padding is 15 x 5m = 75m + calendar buffer
    const diffAfterMs = to.getTime() - exitDate.getTime();
    expect(diffAfterMs).toBeGreaterThan(15 * 5 * 60_000);
  });

  it('widens range when span intersects an official NSE holiday', () => {
    // 2026-10-20 was Dussehra (holiday in NSE_HOLIDAYS_2026)
    const postHolidayEntry = new Date('2026-10-21T09:30:00.000Z');
    const postHolidayExit = new Date('2026-10-21T10:00:00.000Z');

    const resWithHoliday = estimateFetchRange(postHolidayEntry, postHolidayExit, 5, 60, 10);
    const resWithoutHoliday = estimateFetchRange(
      postHolidayEntry,
      postHolidayExit,
      5,
      60,
      10,
      [] // empty holidays
    );

    // Holiday buffer should push 'from' further back
    expect(resWithHoliday.from.getTime()).toBeLessThan(resWithoutHoliday.from.getTime());
  });

  it('is deterministic', () => {
    const res1 = estimateFetchRange(entryDate, exitDate, 15, 30, 30);
    const res2 = estimateFetchRange(entryDate, exitDate, 15, 30, 30);

    expect(res1.from.getTime()).toBe(res2.from.getTime());
    expect(res1.to.getTime()).toBe(res2.to.getTime());
  });
});
