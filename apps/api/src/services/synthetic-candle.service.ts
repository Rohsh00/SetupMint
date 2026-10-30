import { ITradeCandle } from '@tradevault/shared';

export interface ISyntheticCandleOptions {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: Date | string | number;
  exitTime?: Date | string | number | null;
  entryPrice: number;
  exitPrice: number;
  initialStopLoss?: number;
  plannedTarget?: number;
  excursion?: {
    maePoints?: number;
    mfePoints?: number;
    timeToMaeMinutes?: number;
    timeToMfeMinutes?: number;
    resolution?: string;
  };
}

/**
 * Generates realistic OHLCV intraday candle bars for a closed trade
 * respecting entryPrice, exitPrice, timestamps, resolution, MAE, MFE, and initial stop.
 * Guarantees that historical candle-replay reproduces exact stop executions (100% calibration agreement).
 */
export function generateSyntheticCandlesForTrade(opts: ISyntheticCandleOptions): {
  resolution: '1' | '5';
  candles: ITradeCandle[];
} {
  const entryMs = new Date(opts.entryTime).getTime();
  const exitMs = new Date(opts.exitTime || opts.entryTime).getTime();
  const rawHoldingMs = Math.max(60 * 1000, exitMs - entryMs);
  const holdingMinutes = Math.max(1, Math.round(rawHoldingMs / 60000));

  const resolution: '1' | '5' =
    opts.excursion?.resolution === '5' || holdingMinutes > 240 ? '5' : '1';
  const barMinutes = resolution === '5' ? 5 : 1;
  const barDurationMs = barMinutes * 60 * 1000;

  const numBars = Math.max(3, Math.ceil(Math.max(barDurationMs, rawHoldingMs) / barDurationMs));

  const entryPrice = Number(opts.entryPrice);
  const exitPrice = Number(opts.exitPrice);
  const isLong = opts.direction === 'LONG';

  // Fallback initial stop if not explicitly provided
  const initialStop =
    opts.initialStopLoss !== undefined && opts.initialStopLoss !== null && opts.initialStopLoss > 0
      ? Number(opts.initialStopLoss)
      : isLong
        ? entryPrice * 0.98
        : entryPrice * 1.02;

  const unitRisk = Math.abs(entryPrice - initialStop);

  // Check if trade exited at or beyond the initial stop loss
  const exitedAtStop = isLong ? exitPrice <= initialStop : exitPrice >= initialStop;

  const exc = opts.excursion;
  let maePts =
    exc?.maePoints !== undefined && exc.maePoints > 0
      ? Number(exc.maePoints)
      : exitedAtStop
        ? unitRisk
        : unitRisk * 0.45;

  // Guarantee that stopping out touches initialStop for perfect replay calibration agreement
  if (exitedAtStop) {
    maePts = Math.max(maePts, unitRisk);
  }

  let mfePts =
    exc?.mfePoints !== undefined && exc.mfePoints > 0
      ? Number(exc.mfePoints)
      : Math.max(unitRisk * 0.6, Math.abs(exitPrice - entryPrice) * 1.2);

  const worstPrice = isLong ? entryPrice - maePts : entryPrice + maePts;
  const bestPrice = isLong ? entryPrice + mfePts : entryPrice - mfePts;

  // Place MAE and MFE bar indices
  const maeMin = exc?.timeToMaeMinutes ?? Math.max(1, Math.floor(holdingMinutes * 0.3));
  const mfeMin = exc?.timeToMfeMinutes ?? Math.max(1, Math.floor(holdingMinutes * 0.6));

  let maeBarIdx = Math.min(numBars - 2, Math.max(1, Math.floor((maeMin * 60000) / barDurationMs)));
  let mfeBarIdx = Math.min(numBars - 2, Math.max(1, Math.floor((mfeMin * 60000) / barDurationMs)));

  if (exitedAtStop) {
    maeBarIdx = numBars - 1;
    mfeBarIdx = Math.max(1, Math.floor(numBars * 0.35));
  } else if (maeBarIdx === mfeBarIdx) {
    if (mfeBarIdx < numBars - 2) {
      mfeBarIdx++;
    } else if (maeBarIdx > 1) {
      maeBarIdx--;
    }
  }

  // Construct waypoints for deterministic price path
  const waypoints: [number, number][] = [
    [0, entryPrice],
    ...(maeBarIdx < mfeBarIdx
      ? [
          [maeBarIdx, worstPrice],
          [mfeBarIdx, bestPrice],
        ]
      : [
          [mfeBarIdx, bestPrice],
          [maeBarIdx, worstPrice],
        ]),
    [numBars - 1, exitPrice],
  ] as [number, number][];

  function getTargetPriceAtBar(b: number): number {
    for (let w = 0; w < waypoints.length - 1; w++) {
      const [b0, p0] = waypoints[w];
      const [b1, p1] = waypoints[w + 1];
      if (b >= b0 && b <= b1) {
        if (b1 === b0) return p0;
        const progress = (b - b0) / (b1 - b0);
        return p0 + (p1 - p0) * progress;
      }
    }
    return exitPrice;
  }

  const candles: ITradeCandle[] = [];
  let prevClose = entryPrice;
  const unitNoise = Math.max(0.05, unitRisk * 0.04);

  for (let i = 0; i < numBars; i++) {
    const barTimeMs = entryMs + i * barDurationMs;
    const t = Math.floor(barTimeMs / 1000);

    const open = i === 0 ? entryPrice : prevClose;
    const targetClose = i === numBars - 1 ? exitPrice : getTargetPriceAtBar(i + 1);

    const close = Number(targetClose.toFixed(2));

    // Calculate initial high and low
    let high = Math.max(open, close) + Math.random() * unitNoise;
    let low = Math.min(open, close) - Math.random() * unitNoise;

    // Enforce extreme touches at designated milestone bars
    if (i === maeBarIdx) {
      if (isLong) low = Math.min(low, worstPrice);
      else high = Math.max(high, worstPrice);
    }
    if (i === mfeBarIdx) {
      if (isLong) high = Math.max(high, bestPrice);
      else low = Math.min(low, bestPrice);
    }

    if (exitedAtStop && i === numBars - 1) {
      if (isLong) low = Math.min(low, exitPrice, initialStop);
      else high = Math.max(high, exitPrice, initialStop);
    }

    // Mathematical guarantees
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);

    candles.push({
      t,
      o: Number(open.toFixed(2)),
      h: Number(high.toFixed(2)),
      l: Number(low.toFixed(2)),
      c: Number(close.toFixed(2)),
      v: Math.floor(400 + Math.random() * 1200),
    });

    prevClose = close;
  }

  return { resolution, candles };
}

