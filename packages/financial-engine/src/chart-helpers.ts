import Decimal from 'decimal.js';
import { IExcursionCandle } from './excursion.js';
import {
  NSE_HOLIDAYS_2026,
  getNseHolidaysForYear,
  getPresetSpec,
  ChartResolution,
  CHART_RESOLUTIONS,
  CHART_RESOLUTION_LABELS,
} from '@tradevault/shared';

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
  holidays?: readonly string[]
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

  // Account for verified holidays in the span dynamically
  const explicitHolidaySet = holidays ? new Set(holidays) : null;
  const checkHolidaySpan = (startMs: number, endMs: number): number => {
    let count = 0;
    const cur = new Date(startMs);
    const end = new Date(endMs);
    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      if (explicitHolidaySet) {
        if (explicitHolidaySet.has(dateStr)) count++;
      } else {
        const y = cur.getUTCFullYear();
        const yearHolidays = getNseHolidaysForYear(y);
        if (yearHolidays.includes(dateStr)) count++;
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

/**
 * Normalizes any trading symbol into its base underlying.
 * Strips broker prefixes (NSE:, BSE:, MCX:), option details (strikes, expiries, CE/PE),
 * and futures tokens (FUT).
 */
export function normalizeUnderlying(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') return '';

  let clean = symbol.trim().toUpperCase();

  // 1. Strip broker/exchange prefixes: NSE:, BSE:, MCX:, BINANCE:, FOREX:
  clean = clean.replace(/^(NSE|BSE|MCX|BINANCE|FOREX):/i, '').trim();

  // 1b. Strip standard Indian cash equity series suffix: -EQ, -BE and Yahoo/broker .NS, .BO suffixes
  clean = clean.replace(/-EQ|-BE$/i, '').replace(/\.(NS|BO)$/i, '').trim();

  // 2. Direct check against known preset symbols
  const directPreset = getPresetSpec(clean);
  if (directPreset) {
    return directPreset.symbol;
  }

  // 3. Known index roots & commodity prefixes check
  const knownRoots: Array<{ root: string; standard: string }> = [
    { root: 'BANKNIFTY', standard: 'BANKNIFTY' },
    { root: 'FINNIFTY', standard: 'FINNIFTY' },
    { root: 'MIDCPNIFTY', standard: 'MIDCPNIFTY' },
    { root: 'NIFTY', standard: 'NIFTY' },
    { root: 'BANKEX', standard: 'BANKEX' },
    { root: 'SENSEX', standard: 'SENSEX' },
    { root: 'CRUDEOILMINI', standard: 'CRUDEOILMINI' },
    { root: 'CRUDEOILM', standard: 'CRUDEOILMINI' },
    { root: 'CRUDEOIL', standard: 'CRUDEOIL' },
    { root: 'NATGASMINI', standard: 'NATGASMINI' },
    { root: 'NATGAS', standard: 'NATURALGAS' },
    { root: 'NATURALGAS', standard: 'NATURALGAS' },
    { root: 'GOLDGUINEA', standard: 'GOLDGUINEA' },
    { root: 'GOLDPETAL', standard: 'GOLDPETAL' },
    { root: 'GOLDM', standard: 'GOLDM' },
    { root: 'GOLD', standard: 'GOLD' },
    { root: 'SILVERMIC', standard: 'SILVERMIC' },
    { root: 'SILVERM', standard: 'SILVERM' },
    { root: 'SILVER', standard: 'SILVER' },
    { root: 'COPPER', standard: 'COPPER' },
    { root: 'ZINC', standard: 'ZINC' },
    { root: 'NICKEL', standard: 'NICKEL' },
    { root: 'ALUMINIUM', standard: 'ALUMINIUM' },
    { root: 'LEAD', standard: 'LEAD' },
  ];

  for (const { root, standard } of knownRoots) {
    if (clean === root) return standard;
    if (clean.startsWith(root)) {
      const remainder = clean.slice(root.length).trim();
      if (
        remainder === '' ||
        /^(\s*|\d{2}[A-Z]{3}|\d{2}[0-9OND]\d{2}|\d+).*(CE|PE|FUT|FUTURES)?$/i.test(remainder) ||
        /^(FUT|CE|PE)$/i.test(remainder)
      ) {
        return standard;
      }
    }
  }

  // 4. Common Indian Stock / Currency Derivative Patterns
  // A) Standard Monthly Options: e.g. RELIANCE24OCT3000CE
  const monthlyOptionMatch = clean.match(/^([A-Z0-9&-]+?)\s*(\d{2}[A-Z]{3})\s*(\d+(?:\.\d+)?)\s*(CE|PE)$/);
  if (monthlyOptionMatch && monthlyOptionMatch[1]) {
    return monthlyOptionMatch[1];
  }

  // B) Weekly Options: e.g. RELIANCE24O173000CE
  const weeklyOptionMatch = clean.match(/^([A-Z0-9&-]+?)\s*(\d{2}[1-9OND]\d{2})\s*(\d+(?:\.\d+)?)\s*(CE|PE)$/);
  if (weeklyOptionMatch && weeklyOptionMatch[1]) {
    return weeklyOptionMatch[1];
  }

  // C) Spaced Option formats: e.g. "RELIANCE 3000 CE", "TCS 4200 PE"
  const spacedOptionMatch = clean.match(/^([A-Z0-9&-]+?)\s+(?:\d{2}\s+[A-Z]{3}\s+)?(\d+(?:\.\d+)?)\s+(CE|PE|CALL|PUT)$/);
  if (spacedOptionMatch && spacedOptionMatch[1]) {
    return spacedOptionMatch[1];
  }

  // D) Futures contracts: e.g. TCS24OCTFUT, INFY24NOVFUT, RELIANCEFUT
  const futuresMatch = clean.match(/^([A-Z0-9&-]+?)\s*(\d{2}[A-Z]{3})?\s*(FUT|FUTURES)$/);
  if (futuresMatch && futuresMatch[1]) {
    return futuresMatch[1];
  }

  // E) General Trailing Strike + Option Type
  const trailingOptionMatch = clean.match(/^([A-Z0-9&-]+?)\s*(\d{4,})\s*(CE|PE)$/);
  if (trailingOptionMatch && trailingOptionMatch[1]) {
    return trailingOptionMatch[1];
  }

  return clean;
}

export type SnapshotResolutionSource = 'INSTRUMENT_OVERRIDE' | 'DEFAULT' | 'ADAPTIVE_FALLBACK';

export interface ISnapshotTimeframeResolution {
  resolutions: ChartResolution[];
  source: SnapshotResolutionSource;
  warnings: string[];
  htf: ChartResolution;
  ltf: ChartResolution;
  matchedSymbol?: string;
  preferredStrategyId?: string;
  preferredStrategyName?: string;
  settingsDescription: string;
}

/**
 * Normalizes timeframe string (e.g. '4h', '5m', '240', '5', '1D') into a supported ChartResolution.
 * Supported resolutions: ['1', '5', '15', '30', '60', '240', 'D'].
 * If unsupported, maps to the nearest supported resolution and returns a warning.
 */
export function normalizeChartResolution(rawVal?: string | number): {
  resolution: ChartResolution;
  warning?: string;
} {
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return { resolution: '5', warning: 'Missing resolution value, defaulted to 5m' };
  }

  const str = String(rawVal).trim().toLowerCase();

  // Direct matches
  if (str === '1' || str === '1m' || str === '1min') return { resolution: '1' };
  if (str === '5' || str === '5m' || str === '5min') return { resolution: '5' };
  if (str === '15' || str === '15m' || str === '15min') return { resolution: '15' };
  if (str === '30' || str === '30m' || str === '30min') return { resolution: '30' };
  if (str === '60' || str === '60m' || str === '1h' || str === '1hour') return { resolution: '60' };
  if (str === '240' || str === '240m' || str === '4h' || str === '4hours') return { resolution: '240' };
  if (str === 'd' || str === '1d' || str === 'daily' || str === 'day') return { resolution: 'D' };

  // Nearest mappings for common unsupported timeframes
  if (str === '3' || str === '3m') {
    return { resolution: '5', warning: "Unsupported timeframe '3m' mapped to nearest supported '5m'" };
  }
  if (str === '2' || str === '2m') {
    return { resolution: '1', warning: "Unsupported timeframe '2m' mapped to nearest supported '1m'" };
  }
  if (str === '10' || str === '10m') {
    return { resolution: '5', warning: "Unsupported timeframe '10m' mapped to nearest supported '5m'" };
  }
  if (str === '45' || str === '45m') {
    return { resolution: '30', warning: "Unsupported timeframe '45m' mapped to nearest supported '30m'" };
  }
  if (str === '120' || str === '120m' || str === '2h') {
    return { resolution: '60', warning: "Unsupported timeframe '2h' mapped to nearest supported '1h'" };
  }
  if (str === 'w' || str === '1w' || str === 'weekly') {
    return { resolution: 'D', warning: "Unsupported timeframe 'Weekly' mapped to nearest supported '1D'" };
  }

  // Parse numeric minutes as fallback
  const num = parseInt(str, 10);
  if (!isNaN(num) && num > 0) {
    if (num <= 2) return { resolution: '1', warning: `Unsupported timeframe '${rawVal}' mapped to '1m'` };
    if (num <= 8) return { resolution: '5', warning: `Unsupported timeframe '${rawVal}' mapped to '5m'` };
    if (num <= 20) return { resolution: '15', warning: `Unsupported timeframe '${rawVal}' mapped to '15m'` };
    if (num <= 45) return { resolution: '30', warning: `Unsupported timeframe '${rawVal}' mapped to '30m'` };
    if (num <= 150) return { resolution: '60', warning: `Unsupported timeframe '${rawVal}' mapped to '1h'` };
    if (num <= 720) return { resolution: '240', warning: `Unsupported timeframe '${rawVal}' mapped to '4h'` };
    return { resolution: 'D', warning: `Unsupported timeframe '${rawVal}' mapped to '1D'` };
  }

  return { resolution: '5', warning: `Unrecognized timeframe '${rawVal}' mapped to default '5m'` };
}

/**
 * Pure function resolving the 1-2 candlestick snapshot timeframes for a closed trade
 * based on the user's Pattern Detection settings and instrument-specific overrides.
 *
 * Rules:
 * 1. Normalize trade.underlying ?? trade.symbol with normalizeUnderlying, match case-insensitively with overrides.
 * 2. If override matches: use its { htf, ltf }, source = 'INSTRUMENT_OVERRIDE'.
 *    Else: use defaultHtf / defaultLtf, source = 'DEFAULT'.
 *    If settings missing or invalid: adaptive fallback (trade <= 4h -> '1'/'5', else '5'/'15'), source = 'ADAPTIVE_FALLBACK'.
 * 3. Always generate LTF first (execution view). Generate HTF second (context view) if it differs from LTF.
 * 4. Max 2 resolutions per auto-snapshot.
 */
export function resolveSnapshotTimeframes(
  trade: {
    symbol?: string;
    underlying?: string;
    entryTime?: Date | string | number;
    exitTime?: Date | string | number;
    entryDate?: Date | string | number;
    exitDate?: Date | string | number;
    durationMinutes?: number;
    holdingTimeMinutes?: number;
    [key: string]: any;
  },
  patternDetectionSettings?: {
    defaultHtf?: string;
    defaultLtf?: string;
    defaultHtfResolution?: string;
    defaultLtfResolution?: string;
    instrumentOverrides?: Array<{
      symbol: string;
      htf?: string;
      ltf?: string;
      htfResolution?: string;
      ltfResolution?: string;
      strategyId?: string;
      preferredStrategyId?: string;
      preferredStrategyName?: string;
    }>;
    [key: string]: any;
  } | null
): ISnapshotTimeframeResolution {
  const warnings: string[] = [];

  // Calculate trade duration for adaptive fallback
  let durationMs = 0;
  const entryVal = trade?.entryTime || trade?.entryDate;
  const exitVal = trade?.exitTime || trade?.exitDate;

  if (trade?.durationMinutes && typeof trade.durationMinutes === 'number') {
    durationMs = trade.durationMinutes * 60 * 1000;
  } else if (trade?.holdingTimeMinutes && typeof trade.holdingTimeMinutes === 'number') {
    durationMs = trade.holdingTimeMinutes * 60 * 1000;
  } else if (entryVal && exitVal) {
    const entryEpoch = new Date(entryVal).getTime();
    const exitEpoch = new Date(exitVal).getTime();
    if (!isNaN(entryEpoch) && !isNaN(exitEpoch) && exitEpoch >= entryEpoch) {
      durationMs = exitEpoch - entryEpoch;
    }
  }
  const isShortDuration = durationMs <= 4 * 60 * 60 * 1000; // <= 4 hours

  const rawTradeSymbol = (trade?.underlying || trade?.symbol || '').trim();
  const normalizedTradeSym = normalizeUnderlying(rawTradeSymbol).toUpperCase();

  const overrides = Array.isArray(patternDetectionSettings?.instrumentOverrides)
    ? patternDetectionSettings!.instrumentOverrides
    : [];

  let matchedOverride: (typeof overrides)[0] | undefined;

  if (normalizedTradeSym && overrides.length > 0) {
    matchedOverride = overrides.find((o) => {
      if (!o || !o.symbol) return false;
      const oSym = o.symbol.trim().toUpperCase();
      const normOSym = normalizeUnderlying(oSym).toUpperCase();

      return (
        normalizedTradeSym === normOSym ||
        normalizedTradeSym === oSym ||
        rawTradeSymbol.toUpperCase() === oSym
      );
    });
  }

  let source: SnapshotResolutionSource = 'DEFAULT';
  let rawHtf: string | undefined;
  let rawLtf: string | undefined;
  let matchedSymbol: string | undefined;
  let preferredStrategyId: string | undefined;
  let preferredStrategyName: string | undefined;

  if (matchedOverride) {
    source = 'INSTRUMENT_OVERRIDE';
    rawHtf = matchedOverride.htf ?? matchedOverride.htfResolution;
    rawLtf = matchedOverride.ltf ?? matchedOverride.ltfResolution;
    matchedSymbol = matchedOverride.symbol;
    preferredStrategyId = matchedOverride.preferredStrategyId ?? matchedOverride.strategyId;
    preferredStrategyName = matchedOverride.preferredStrategyName;
  } else if (
    patternDetectionSettings?.defaultHtf !== undefined ||
    patternDetectionSettings?.defaultLtf !== undefined ||
    patternDetectionSettings?.defaultHtfResolution !== undefined ||
    patternDetectionSettings?.defaultLtfResolution !== undefined
  ) {
    source = 'DEFAULT';
    rawHtf = patternDetectionSettings?.defaultHtf ?? patternDetectionSettings?.defaultHtfResolution;
    rawLtf = patternDetectionSettings?.defaultLtf ?? patternDetectionSettings?.defaultLtfResolution;
  } else {
    source = 'ADAPTIVE_FALLBACK';
  }

  // Handle adaptive fallback when settings missing or invalid
  if (source === 'ADAPTIVE_FALLBACK' || (!rawHtf && !rawLtf)) {
    source = 'ADAPTIVE_FALLBACK';
    const ltf: ChartResolution = isShortDuration ? '1' : '5';
    const htf: ChartResolution = isShortDuration ? '5' : '15';
    const ltfLabel = CHART_RESOLUTION_LABELS[ltf] || `${ltf}m`;
    const htfLabel = CHART_RESOLUTION_LABELS[htf] || `${htf}m`;

    return {
      resolutions: ltf === htf ? [ltf] : [ltf, htf],
      source,
      warnings,
      htf,
      ltf,
      settingsDescription: `Generated using adaptive fallback (${htfLabel}/${ltfLabel})`,
    };
  }

  // Normalize LTF and HTF
  const normLtfResult = normalizeChartResolution(rawLtf || '5');
  if (normLtfResult.warning) warnings.push(normLtfResult.warning);

  const normHtfResult = normalizeChartResolution(rawHtf || '240');
  if (normHtfResult.warning) warnings.push(normHtfResult.warning);

  const ltf = normLtfResult.resolution;
  const htf = normHtfResult.resolution;

  const ltfLabel = CHART_RESOLUTION_LABELS[ltf] || `${ltf}m`;
  const htfLabel = CHART_RESOLUTION_LABELS[htf] || `${htf}m`;

  let settingsDescription = '';
  if (source === 'INSTRUMENT_OVERRIDE' && matchedSymbol) {
    settingsDescription = `Generated using your ${matchedSymbol} override (${htfLabel}/${ltfLabel})`;
  } else {
    settingsDescription = `Generated using default settings (${htfLabel}/${ltfLabel})`;
  }

  // Always generate LTF (execution view) first. Also generate HTF (context view) if distinct. Max 2.
  const resolutions: ChartResolution[] = ltf === htf ? [ltf] : [ltf, htf];

  return {
    resolutions,
    source,
    warnings,
    htf,
    ltf,
    matchedSymbol,
    preferredStrategyId,
    preferredStrategyName,
    settingsDescription,
  };
}

export interface IRLadderLevel {
  r: number;
  price: number;
  label: string;
}

/**
 * Pure helper computing standard R-multiple price ladder levels (1R, 2R, 3R, ...)
 * using Decimal.js with 30-digit precision.
 * Distance R = |entryPrice - initialStopLoss|.
 */
export function calculateRLadderLevels(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  initialStopLoss: number,
  rMultiples: number[] = [1, 2, 3]
): IRLadderLevel[] {
  if (
    typeof entryPrice !== 'number' ||
    typeof initialStopLoss !== 'number' ||
    isNaN(entryPrice) ||
    isNaN(initialStopLoss) ||
    entryPrice <= 0 ||
    initialStopLoss <= 0
  ) {
    return [];
  }

  const isLong = direction === 'LONG';
  const entry = new Decimal(entryPrice);
  const sl = new Decimal(initialStopLoss);

  // For LONG trades, SL must be strictly below entry. For SHORT trades, SL must be strictly above entry.
  if (isLong && sl.gte(entry)) {
    return [];
  }
  if (!isLong && sl.lte(entry)) {
    return [];
  }

  const riskDist = entry.minus(sl).abs();
  if (riskDist.isZero()) {
    return [];
  }

  return rMultiples.map((r) => {
    const rDec = new Decimal(r);
    const targetPrice = isLong
      ? entry.plus(riskDist.times(rDec))
      : entry.minus(riskDist.times(rDec));

    return {
      r,
      price: targetPrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      label: `${r}R`,
    };
  });
}

