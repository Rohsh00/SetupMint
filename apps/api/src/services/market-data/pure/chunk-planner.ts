import moment from 'moment';
import { CandleUnavailableReason } from '@tradevault/shared';

export interface ChunkPlanSuccess {
  ok: true;
  interval: string;
  chunks: Array<{ fromdate: string; todate: string }>;
}

export interface ChunkPlanError {
  ok: false;
  reason: CandleUnavailableReason;
  message: string;
}

export type ChunkPlanResult = ChunkPlanSuccess | ChunkPlanError;

/**
 * Pure function to map resolution to SmartAPI interval, validate lookbacks,
 * and chunk date ranges to avoid truncation and adhere to SmartAPI limits.
 * Dates are converted to IST (+05:30) strings formatted as 'YYYY-MM-DD HH:mm'.
 */
export function planAngelOneChunks(
  resolution: string,
  from: Date | string | number,
  to: Date | string | number,
  now: Date | number = Date.now()
): ChunkPlanResult {
  const fromMoment = moment(from).utcOffset('+05:30');
  const toMoment = moment(to).utcOffset('+05:30');
  const nowMoment = moment(now).utcOffset('+05:30');

  if (!fromMoment.isValid() || !toMoment.isValid()) {
    return {
      ok: false,
      reason: 'UPSTREAM_ERROR',
      message: 'Invalid from or to timestamp for candle chunk planning',
    };
  }

  if (toMoment.isBefore(fromMoment)) {
    return {
      ok: false,
      reason: 'UPSTREAM_ERROR',
      message: 'End date precedes start date in execution window',
    };
  }

  const cleanRes = (resolution || '1').trim().toUpperCase();

  let interval = 'ONE_MINUTE';
  let chunkDays = 15; // Safe window under 8,000 candles ceiling
  let maxLookbackDays = 365;

  if (cleanRes === '5' || cleanRes === '5M') {
    interval = 'FIVE_MINUTE';
    chunkDays = 60;
    maxLookbackDays = 365 * 3; // 3 years
  } else if (cleanRes === 'D' || cleanRes === '1D') {
    interval = 'ONE_DAY';
    chunkDays = 365;
    maxLookbackDays = 2000;
  } else {
    // Default 1m
    interval = 'ONE_MINUTE';
    chunkDays = 15;
    maxLookbackDays = 365;
  }

  // Check if requested window is outside provider's historical lookback capability
  const daysAgo = nowMoment.diff(fromMoment, 'days');
  if (daysAgo > maxLookbackDays) {
    return {
      ok: false,
      reason: 'OUTSIDE_PROVIDER_LOOKBACK',
      message: `Requested date range (${daysAgo} days ago) exceeds Angel One ${interval} lookback limit of ${maxLookbackDays} days`,
    };
  }

  const chunks: Array<{ fromdate: string; todate: string }> = [];
  let cur = fromMoment.clone();

  while (cur.isSameOrBefore(toMoment)) {
    const nextEnd = cur.clone().add(chunkDays, 'days');
    const chunkEnd = nextEnd.isAfter(toMoment) ? toMoment.clone() : nextEnd;

    chunks.push({
      fromdate: cur.format('YYYY-MM-DD HH:mm'),
      todate: chunkEnd.format('YYYY-MM-DD HH:mm'),
    });

    if (chunkEnd.isSame(toMoment)) {
      break;
    }

    cur = chunkEnd.clone().add(1, 'minute');
  }

  return {
    ok: true,
    interval,
    chunks,
  };
}

export function getAngelOneIntervalName(resolution: string): string {
  const cleanRes = (resolution || '1').trim().toUpperCase();
  if (cleanRes === '5' || cleanRes === '5M') return 'FIVE_MINUTE';
  if (cleanRes === 'D' || cleanRes === '1D') return 'ONE_DAY';
  return 'ONE_MINUTE';
}

export function checkAngelOneLookback(
  from: Date | string | number,
  resolution: string,
  now: Date | number = Date.now()
): { ok: true } | { ok: false; reason: CandleUnavailableReason; message: string } {
  const fromMoment = moment(from).utcOffset('+05:30');
  const nowMoment = moment(now).utcOffset('+05:30');
  const cleanRes = (resolution || '1').trim().toUpperCase();
  const maxLookbackDays =
    cleanRes === '5' || cleanRes === '5M' ? 365 * 3 : cleanRes === 'D' || cleanRes === '1D' ? 2000 : 365;
  const daysAgo = nowMoment.diff(fromMoment, 'days');
  if (daysAgo > maxLookbackDays) {
    return {
      ok: false,
      reason: 'OUTSIDE_PROVIDER_LOOKBACK',
      message: `Requested date range (${daysAgo} days ago) exceeds Angel One lookback limit of ${maxLookbackDays} days`,
    };
  }
  return { ok: true };
}
