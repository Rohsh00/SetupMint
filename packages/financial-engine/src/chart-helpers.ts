import Decimal from 'decimal.js';
import { IExcursionCandle } from './excursion.js';
import { NSE_HOLIDAYS_2026 } from '@tradevault/shared';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IAggregateCandlesResult {
  candles: IExcursionCandle[];
  droppedCount: number;
}

export interface ISelectChartWindowResult {
  candles: IExcursionCandle[];
  entryIndex: number;
  exitIndex: number;
  requestedBefore: number;
  requestedAfter: number;
  appliedBefore: number;
  appliedAfter: number;
  truncated: boolean;
}

export interface IEstimateFetchRangeResult {
  from: Date;
  to: Date;
}

function parseEpochMs(input: Date | string | number): number {
  if (typeof input === 'number') {
    return input < 1e11 ? input * 1000 : input;
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Aggregates lower-timeframe candles (e.g. 1m or 5m) into a higher timeframe (e.g. 15m, 30m, 60m).
 * Buckets are anchored to the session open in IST (default 09:15 for NSE, 09:00 for MCX),
 * ensuring buckets align with session start rather than arbitrary UTC epochs.
 *
 * Drops malformed or incomplete candles and returns the dropped count.
 * Output candles are strictly sorted by timestamp with unique timestamps.
 */
export function aggregateCandles(
  candles: IExcursionCandle[],
  targetMinutes: number,
  sessionAnchor: string = '09:15'
): IAggregateCandlesResult {
  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return { candles: [], droppedCount: 0 };
  }

  if (targetMinutes <= 0) {
    throw new Error('targetMinutes must be a positive number');
  }

  // Parse session anchor (e.g. "09:15" -> 555 minutes from IST midnight)
  const parts = sessionAnchor.split(':');
  const anchorHour = parseInt(parts[0], 10) || 9;
  const anchorMin = parseInt(parts[1], 10) || 15;
  const anchorMinutesFromMidnight = anchorHour * 60 + anchorMin;

  let droppedCount = 0;
  const validCandles: Array<IExcursionCandle & { tMs: number }> = [];

  const isInputSeconds = candles.some(
    (c) => c && typeof c.t === 'number' && c.t > 0 && c.t < 1e11
  );

  for (const c of candles) {
    if (
      !c ||
      typeof c.t !== 'number' ||
      typeof c.o !== 'number' ||
      typeof c.h !== 'number' ||
      typeof c.l !== 'number' ||
      typeof c.c !== 'number' ||
      isNaN(c.t) ||
      isNaN(c.o) ||
      isNaN(c.h) ||
      isNaN(c.l) ||
      isNaN(c.c) ||
      c.t <= 0 ||
      c.o < 0 ||
      c.h < 0 ||
      c.l < 0 ||
      c.c < 0 ||
      c.h < c.l ||
      c.h < c.o ||
      c.h < c.c ||
      c.l > c.o ||
      c.l > c.c
    ) {
      droppedCount++;
      continue;
    }

    const tMs = c.t < 1e11 ? c.t * 1000 : c.t;
    validCandles.push({
      t: c.t,
      tMs,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: c.v !== undefined && !isNaN(c.v) ? c.v : 0,
    });
  }

  if (validCandles.length === 0) {
    return { candles: [], droppedCount };
  }

  // Sort valid input candles by timestamp
  validCandles.sort((a, b) => a.tMs - b.tMs);

  // Group into IST session-anchored buckets
  const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30
  const bucketMap = new Map<number, Array<IExcursionCandle & { tMs: number }>>();

  for (const c of validCandles) {
    const istMs = c.tMs + IST_OFFSET_MS;
    const istDate = new Date(istMs);
    const year = istDate.getUTCFullYear();
    const month = istDate.getUTCMonth();
    const day = istDate.getUTCDate();
    const totalMins = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

    const diffFromAnchor = totalMins - anchorMinutesFromMidnight;
    const bucketIndex = Math.floor(diffFromAnchor / targetMinutes);
    const bucketStartMins = anchorMinutesFromMidnight + bucketIndex * targetMinutes;

    // Calculate exact bucket start in UTC
    const istMidnightUtc = Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS;
    const bucketStartMs = istMidnightUtc + bucketStartMins * 60 * 1000;

    let bucket = bucketMap.get(bucketStartMs);
    if (!bucket) {
      bucket = [];
      bucketMap.set(bucketStartMs, bucket);
    }
    bucket.push(c);
  }

  // Aggregate each bucket
  const sortedBucketKeys = Array.from(bucketMap.keys()).sort((a, b) => a - b);
  const resultCandles: IExcursionCandle[] = [];

  for (const bucketStartMs of sortedBucketKeys) {
    const bCandles = bucketMap.get(bucketStartMs)!;
    bCandles.sort((a, b) => a.tMs - b.tMs);

    const open = bCandles[0].o;
    const close = bCandles[bCandles.length - 1].c;
    let high = -Infinity;
    let low = Infinity;
    let volumeSum = new Decimal(0);

    for (const bc of bCandles) {
      if (bc.h > high) high = bc.h;
      if (bc.l < low) low = bc.l;
      if (bc.v !== undefined) {
        volumeSum = volumeSum.plus(new Decimal(bc.v));
      }
    }

    resultCandles.push({
      t: isInputSeconds ? Math.floor(bucketStartMs / 1000) : bucketStartMs,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volumeSum.toNumber(),
    });
  }

  return {
    candles: resultCandles,
    droppedCount,
  };
}

/**
 * Selects a slice of candles around the trade window [entryIndex - paddingBefore, exitIndex + paddingAfter].
 * Padding is counted in candles of the given timeframe.
 *
 * If (span + paddingBefore + paddingAfter) exceeds maxCandles:
 * - If span <= maxCandles: keeps the full entry-to-exit span, and scales paddingBefore and paddingAfter
 *   down proportionally, preserving their ratio (floor, deterministic), setting truncated = true.
 * - If span > maxCandles: keeps a window starting at entryIndex up to maxCandles, zero padding, truncated = true.
 */
export function selectChartWindow(
  candles: IExcursionCandle[],
  entryTs: Date | string | number,
  exitTs: Date | string | number,
  paddingBefore: number,
  paddingAfter: number,
  maxCandles: number = 1500
): ISelectChartWindowResult {
  const reqBefore = Math.max(0, Math.floor(paddingBefore || 0));
  const reqAfter = Math.max(0, Math.floor(paddingAfter || 0));

  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return {
      candles: [],
      entryIndex: -1,
      exitIndex: -1,
      requestedBefore: reqBefore,
      requestedAfter: reqAfter,
      appliedBefore: 0,
      appliedAfter: 0,
      truncated: false,
    };
  }

  const entryMs = parseEpochMs(entryTs);
  const exitMs = parseEpochMs(exitTs);

  // Snap entry and exit to candles
  let entryIndex = -1;
  let exitIndex = -1;

  for (let i = 0; i < candles.length; i++) {
    const cMs = parseEpochMs(candles[i].t);
    const nextMs = i < candles.length - 1 ? parseEpochMs(candles[i + 1].t) : Infinity;

    if (entryIndex === -1 && entryMs >= cMs && entryMs < nextMs) {
      entryIndex = i;
    }
    if (exitIndex === -1 && exitMs >= cMs && exitMs < nextMs) {
      exitIndex = i;
    }
  }

  if (entryIndex === -1) {
    entryIndex = entryMs < parseEpochMs(candles[0].t) ? 0 : candles.length - 1;
  }
  if (exitIndex === -1) {
    exitIndex = exitMs < parseEpochMs(candles[0].t) ? 0 : candles.length - 1;
  }
  if (exitIndex < entryIndex) {
    exitIndex = entryIndex;
  }

  const span = exitIndex - entryIndex + 1;
  let appliedBefore = reqBefore;
  let appliedAfter = reqAfter;
  let truncated = false;

  if (span > maxCandles) {
    // Span alone exceeds maxCandles
    truncated = true;
    appliedBefore = 0;
    appliedAfter = 0;
    const windowStart = entryIndex;
    const windowEnd = Math.min(candles.length - 1, entryIndex + maxCandles - 1);
    const windowSlice = candles.slice(windowStart, windowEnd + 1);

    return {
      candles: windowSlice,
      entryIndex: entryIndex - windowStart,
      exitIndex: Math.min(windowSlice.length - 1, exitIndex - windowStart),
      requestedBefore: reqBefore,
      requestedAfter: reqAfter,
      appliedBefore: 0,
      appliedAfter: 0,
      truncated: true,
    };
  }

  const totalRequested = span + appliedBefore + appliedAfter;
  if (totalRequested > maxCandles) {
    truncated = true;
    const availablePadding = maxCandles - span;
    const sumPadding = appliedBefore + appliedAfter;
    if (sumPadding > 0) {
      const ratio = availablePadding / sumPadding;
      appliedBefore = Math.floor(appliedBefore * ratio);
      appliedAfter = Math.floor(appliedAfter * ratio);
    } else {
      appliedBefore = 0;
      appliedAfter = 0;
    }
  }

  // Clamp to available candles in dataset
  let startIndex = entryIndex - appliedBefore;
  let endIndex = exitIndex + appliedAfter;

  if (startIndex < 0) {
    startIndex = 0;
  }
  if (endIndex >= candles.length) {
    endIndex = candles.length - 1;
  }

  appliedBefore = entryIndex - startIndex;
  appliedAfter = endIndex - exitIndex;

  const windowSlice = candles.slice(startIndex, endIndex + 1);

  return {
    candles: windowSlice,
    entryIndex: entryIndex - startIndex,
    exitIndex: exitIndex - startIndex,
    requestedBefore: reqBefore,
    requestedAfter: reqAfter,
    appliedBefore,
    appliedAfter,
    truncated,
  };
}

/**
 * Estimates the required fetch range in UTC [from, to] to guarantee that requested candle
 * padding will be fulfilled, even when weekends, holidays, or off-market hours are present.
 *
 * Buffer logic:
 * Adds extra calendar days (~1 trading day per 75 requested intraday candles, plus weekend bridge)
 * so market closures do not leave the fetch window short of candles.
 */
export function estimateFetchRange(
  entryTs: Date | string | number,
  exitTs: Date | string | number,
  timeframeMinutes: number,
  paddingBefore: number,
  paddingAfter: number,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): IEstimateFetchRangeResult {
  const entryMs = parseEpochMs(entryTs);
  const exitMs = parseEpochMs(exitTs);

  const pBefore = Math.max(0, Math.floor(paddingBefore || 0));
  const pAfter = Math.max(0, Math.floor(paddingAfter || 0));

  const tfMins = Math.max(1, timeframeMinutes || 1);

  // Base raw times in milliseconds
  const rawBeforeMs = pBefore * tfMins * 60 * 1000;
  const rawAfterMs = pAfter * tfMins * 60 * 1000;

  // Calendar widening buffer (1 extra trading day per 75 candles + weekend allowance)
  let bufferDaysBefore = 0;
  let bufferDaysAfter = 0;

  if (tfMins < 1440) {
    const daysFromCandlesBefore = Math.ceil((pBefore * tfMins) / 375);
    bufferDaysBefore = Math.ceil(pBefore / 75) + (daysFromCandlesBefore > 0 ? 2 : 0);

    const daysFromCandlesAfter = Math.ceil((pAfter * tfMins) / 375);
    bufferDaysAfter = Math.ceil(pAfter / 75) + (daysFromCandlesAfter > 0 ? 2 : 0);
  } else {
    // Daily candles
    bufferDaysBefore = Math.ceil(pBefore * 0.45) + (pBefore > 0 ? 3 : 0);
    bufferDaysAfter = Math.ceil(pAfter * 0.45) + (pAfter > 0 ? 3 : 0);
  }

  // Account for verified holidays in the span
  const holidaySet = new Set(holidays);
  const checkHolidaySpan = (startMs: number, endMs: number): number => {
    let count = 0;
    const cur = new Date(startMs);
    const end = new Date(endMs);
    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      if (holidaySet.has(dateStr)) {
        count++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  };

  const estStartMs = entryMs - rawBeforeMs - bufferDaysBefore * 86_400_000;
  const holidaysBefore = checkHolidaySpan(estStartMs, entryMs);
  bufferDaysBefore += holidaysBefore;

  const estEndMs = exitMs + rawAfterMs + bufferDaysAfter * 86_400_000;
  const holidaysAfter = checkHolidaySpan(exitMs, estEndMs);
  bufferDaysAfter += holidaysAfter;

  const finalFromMs = entryMs - rawBeforeMs - bufferDaysBefore * 86_400_000;
  const finalToMs = exitMs + rawAfterMs + bufferDaysAfter * 86_400_000;

  return {
    from: new Date(finalFromMs),
    to: new Date(finalToMs),
  };
}
