import moment from 'moment';
import { ITradeCandle } from '@tradevault/shared';

export interface CandleNormalizationResult {
  candles: ITradeCandle[];
  droppedCount: number;
}

/**
 * Pure function to validate, sanitize, and normalize raw Angel One candle arrays.
 * Handles IST (+05:30) timestamps, validates OHLC relationships, drops malformed
 * rows with counters, and returns unique monotonically sorted candles.
 */
export function normalizeAngelOneCandles(rawCandles: any[]): CandleNormalizationResult {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    return { candles: [], droppedCount: 0 };
  }

  const validCandles: ITradeCandle[] = [];
  let droppedCount = 0;

  for (let i = 0; i < rawCandles.length; i++) {
    const item = rawCandles[i];

    if (!Array.isArray(item) || item.length < 5) {
      droppedCount++;
      continue;
    }

    const [rawTime, rawO, rawH, rawL, rawC, rawV] = item;

    // Parse timestamp: Angel One returns IST formatted strings
    const m = moment(rawTime, [
      moment.ISO_8601,
      'YYYY-MM-DDTHH:mm:ssZ',
      'YYYY-MM-DDTHH:mm:ss+05:30',
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD HH:mm',
    ]);

    if (!m.isValid()) {
      droppedCount++;
      continue;
    }

    const t = Math.floor(m.valueOf() / 1000);
    const o = Number(rawO);
    const h = Number(rawH);
    const l = Number(rawL);
    const c = Number(rawC);
    const v = rawV !== undefined ? Number(rawV) : undefined;

    // Validate finite non-negative numbers
    if (
      !Number.isFinite(t) ||
      !Number.isFinite(o) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l) ||
      !Number.isFinite(c) ||
      o <= 0 ||
      h <= 0 ||
      l <= 0 ||
      c <= 0 ||
      (v !== undefined && (!Number.isFinite(v) || v < 0))
    ) {
      droppedCount++;
      continue;
    }

    // Validate OHLC structural consistency with micro-epsilon for floating tolerances
    const maxOC = Math.max(o, c);
    const minOC = Math.min(o, c);
    if (h < maxOC - 1e-4 || l > minOC + 1e-4) {
      droppedCount++;
      continue;
    }

    validCandles.push({
      t,
      o: Number(o.toFixed(4)),
      h: Number(h.toFixed(4)),
      l: Number(l.toFixed(4)),
      c: Number(c.toFixed(4)),
      v: v !== undefined ? Number(v.toFixed(2)) : undefined,
    });
  }

  // Deduplicate by timestamp (keeping first occurrence) and sort ascending
  const candleMap = new Map<number, ITradeCandle>();
  for (const candle of validCandles) {
    if (!candleMap.has(candle.t)) {
      candleMap.set(candle.t, candle);
    } else {
      droppedCount++;
    }
  }

  const sorted = Array.from(candleMap.values()).sort((a, b) => a.t - b.t);

  return {
    candles: sorted,
    droppedCount,
  };
}
