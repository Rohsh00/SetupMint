import { TradingSession } from '@tradevault/shared';

/**
 * Derives the active trading session based on the trade's entry timestamp, exchange, and market segment.
 *
 * Timings:
 * - NSE Regular: 09:15 to 15:30 IST (Indian Equities and F&O)
 * - MCX Evening: 17:00 to 23:30 / 23:55 IST (Commodities)
 * - London Session: 08:00 to 16:30 GMT (approx 13:30 to 22:00 IST)
 * - New York Session: 09:30 to 16:00 EST (approx 19:00 to 01:30 IST)
 * - Off Hours / Crypto: Weekends (Sat/Sun) or 24/7 Crypto markets
 */
export function deriveSessionFromTime(
  entryTime: string | Date | null | undefined,
  exchange?: string,
  marketSegment?: string
): TradingSession {
  if (!entryTime) {
    if (exchange?.toUpperCase() === 'MCX' || marketSegment === 'MCX') {
      return 'MCX_EVENING';
    }
    return 'NSE_REGULAR';
  }

  const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
  if (isNaN(date.getTime())) {
    return 'NSE_REGULAR';
  }

  // 1. Check Weekend or Crypto -> OFF_HOURS
  const dayOfWeek = date.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isCrypto =
    exchange?.toUpperCase() === 'BINANCE' ||
    exchange?.toUpperCase() === 'CRYPTO' ||
    marketSegment === 'CRYPTO';

  if (isWeekend || isCrypto) {
    return 'OFF_HOURS';
  }

  // If exchange is explicit MCX
  if (exchange?.toUpperCase() === 'MCX' || marketSegment === 'MCX') {
    return 'MCX_EVENING';
  }

  // If exchange is US
  if (
    exchange?.toUpperCase() === 'NYSE' ||
    exchange?.toUpperCase() === 'NASDAQ' ||
    exchange?.toUpperCase() === 'CME' ||
    marketSegment === 'US_EQUITY' ||
    marketSegment === 'CME'
  ) {
    return 'NEW_YORK';
  }

  // If exchange is London / UK
  if (exchange?.toUpperCase() === 'LSE') {
    return 'LONDON';
  }

  // Calculate IST (UTC + 5:30) time in minutes from midnight
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const istOffsetMinutes = 330; // 5 hours 30 mins
  const istTotalMinutes = (utcHours * 60 + utcMinutes + istOffsetMinutes) % 1440;

  // NSE / BSE Cash and F&O: 09:15 IST (555 min) - 15:30 IST (930 min)
  // We provide a slight buffer 09:00 (540 min) - 16:00 (960 min)
  if (istTotalMinutes >= 540 && istTotalMinutes <= 960) {
    return 'NSE_REGULAR';
  }

  // MCX Commodities evening session: 17:00 (1020 min) - 23:55 (1435 min)
  if (istTotalMinutes >= 1020 && istTotalMinutes <= 1435) {
    return 'MCX_EVENING';
  }

  // Default to NSE_REGULAR during typical business day, otherwise OFF_HOURS
  if (istTotalMinutes >= 480 && istTotalMinutes < 1020) {
    return 'NSE_REGULAR';
  }

  return 'OFF_HOURS';
}
