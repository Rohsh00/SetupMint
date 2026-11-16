import { TradingSession, SessionCalendarKey } from '@tradevault/shared';
import { SessionCalendarRegistry } from './registries/calendar-registry.js';

/**
 * Derives the active trading session based on the trade's entry timestamp, exchange, market segment, calendar key, and symbol.
 *
 * Supported Session Calendars:
 * - FOREX_24_5 (Forex, Metals, CFDs, Elefin, The5ers): ASIA, LONDON, NEW_YORK, OFF_HOURS
 * - NSE (Indian Equities, F&O): NSE_REGULAR, OFF_HOURS
 * - MCX (Indian Commodities): MCX_EVENING, NSE_REGULAR, OFF_HOURS
 * - CRYPTO_24_7 (Continuous Crypto): ASIA, LONDON, NEW_YORK
 */
export function deriveSessionFromTime(
  entryTime: string | Date | null | undefined,
  exchange?: string,
  marketSegment?: string,
  calendarKey?: SessionCalendarKey | string,
  symbol?: string
): TradingSession {
  const exUpper = (exchange || '').toUpperCase().trim();
  const segUpper = (marketSegment || '').toUpperCase().trim();
  const symUpper = (symbol || '').toUpperCase().trim();
  const calUpper = (calendarKey || '').toUpperCase().trim();

  // If explicit calendarKey is FOREX_24_5, or Forex/CFD/Elefin exchange/segment/symbol
  const isForex =
    calUpper === 'FOREX_24_5' ||
    exUpper === 'FOREX' ||
    exUpper === 'CFD' ||
    exUpper === 'GLOBAL' ||
    exUpper === 'METATRADER' ||
    exUpper === 'ELEFIN' ||
    exUpper === 'THE5ERS' ||
    segUpper === 'FOREX_SPOT' ||
    segUpper === 'CFD' ||
    /^(XAU|XAG|EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|US30|NAS100|SPX500|GER30|GER40)/i.test(symUpper);

  if (!entryTime) {
    if (exUpper === 'MCX' || segUpper === 'MCX' || calUpper === 'MCX') {
      return 'MCX_EVENING';
    }
    if (isForex) {
      return 'NEW_YORK';
    }
    return 'NSE_REGULAR';
  }

  const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
  if (isNaN(date.getTime())) {
    if (isForex) return 'NEW_YORK';
    if (exUpper === 'MCX' || segUpper === 'MCX') return 'MCX_EVENING';
    return 'NSE_REGULAR';
  }

  // 1. Explicit calendar key delegation
  if (calUpper === 'FOREX_24_5') {
    return SessionCalendarRegistry.detectSession(date, 'FOREX_24_5', exchange, marketSegment);
  }
  if (calUpper === 'CRYPTO_24_7') {
    return SessionCalendarRegistry.detectSession(date, 'CRYPTO_24_7', exchange, marketSegment);
  }
  if (calUpper === 'MCX') {
    return SessionCalendarRegistry.detectSession(date, 'MCX', exchange, marketSegment);
  }
  if (calUpper === 'NSE') {
    return SessionCalendarRegistry.detectSession(date, 'NSE', exchange, marketSegment);
  }

  // 2. Forex / Metals / CFD autodetection
  if (isForex) {
    return SessionCalendarRegistry.detectSession(date, 'FOREX_24_5', exchange, marketSegment);
  }

  // 3. Crypto autodetect
  const isCrypto =
    exUpper === 'BINANCE' ||
    exUpper === 'CRYPTO' ||
    segUpper === 'CRYPTO';

  if (isCrypto) {
    return 'OFF_HOURS';
  }

  // 4. Weekend check for non-forex / non-crypto standard markets
  const dayOfWeek = date.getUTCDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'OFF_HOURS';
  }

  // 5. MCX Commodities (Evening / Morning)
  if (exUpper === 'MCX' || segUpper === 'MCX') {
    return 'MCX_EVENING';
  }

  // 6. US Equities & UK LSE
  if (
    exUpper === 'NYSE' ||
    exUpper === 'NASDAQ' ||
    exUpper === 'CME' ||
    segUpper === 'US_EQUITY' ||
    segUpper === 'CME'
  ) {
    return 'NEW_YORK';
  }

  if (exUpper === 'LSE') {
    return 'LONDON';
  }

  // 7. Calculate IST (UTC + 5:30) time in minutes from midnight for NSE/BSE
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const istOffsetMinutes = 330; // 5 hours 30 mins
  const istTotalMinutes = (utcHours * 60 + utcMinutes + istOffsetMinutes) % 1440;

  // NSE / BSE Cash and F&O: 09:15 IST (555 min) - 15:30 IST (930 min)
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
