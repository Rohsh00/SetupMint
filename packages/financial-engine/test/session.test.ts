import { describe, it, expect } from 'vitest';
import { deriveSessionFromTime } from '../src/session.js';

describe('Financial Engine - Trading Session Derivation', () => {
  it('derives NSE_REGULAR for Indian trading hours on weekdays', () => {
    // 2026-10-14 is Wednesday. 09:30 IST is 04:00 UTC
    const date = new Date('2026-10-14T04:00:00Z');
    expect(deriveSessionFromTime(date, 'NSE')).toBe('NSE_REGULAR');

    // 14:00 IST is 08:30 UTC
    const afternoon = new Date('2026-10-14T08:30:00Z');
    expect(deriveSessionFromTime(afternoon, 'NSE', 'NSE_FNO')).toBe('NSE_REGULAR');
  });

  it('derives MCX_EVENING for MCX commodity trades', () => {
    // 19:30 IST is 14:00 UTC
    const eveningDate = new Date('2026-10-14T14:00:00Z');
    expect(deriveSessionFromTime(eveningDate, 'MCX', 'MCX')).toBe('MCX_EVENING');

    // Even earlier if exchange is MCX
    expect(deriveSessionFromTime(new Date('2026-10-14T05:00:00Z'), 'MCX')).toBe('MCX_EVENING');
  });

  it('derives OFF_HOURS for weekend trades and Crypto', () => {
    // 2026-10-18 is Sunday
    const sundayDate = new Date('2026-10-18T10:00:00Z');
    expect(deriveSessionFromTime(sundayDate, 'NSE')).toBe('OFF_HOURS');

    // Crypto on weekday
    const weekday = new Date('2026-10-14T10:00:00Z');
    expect(deriveSessionFromTime(weekday, 'BINANCE', 'CRYPTO')).toBe('OFF_HOURS');
  });

  it('derives NEW_YORK and LONDON for foreign exchanges', () => {
    const nyDate = new Date('2026-10-14T15:00:00Z');
    expect(deriveSessionFromTime(nyDate, 'NASDAQ')).toBe('NEW_YORK');

    expect(deriveSessionFromTime(nyDate, 'LSE')).toBe('LONDON');
  });

  it('derives NEW_YORK, LONDON, and ASIA for Forex / Elefin trades', () => {
    // 2026-11-09 is Monday: 20:14 UTC is 15:14 America/New_York (New York Session)
    const nyTrade = new Date('2026-11-09T20:14:00Z');
    expect(deriveSessionFromTime(nyTrade, 'FOREX', 'FOREX_SPOT', 'FOREX_24_5', 'XAUUSD')).toBe('NEW_YORK');
    expect(deriveSessionFromTime(nyTrade, 'ELEFIN', 'CFD', undefined, 'XAUUSD')).toBe('NEW_YORK');

    // 2026-11-10 is Tuesday: 09:44 UTC is 09:44 Europe/London (London Session, before NY open)
    const londonTrade = new Date('2026-11-10T09:44:38Z');
    expect(deriveSessionFromTime(londonTrade, 'FOREX', 'FOREX_SPOT', 'FOREX_24_5', 'XAUUSD')).toBe('LONDON');
    expect(deriveSessionFromTime(londonTrade, undefined, undefined, 'FOREX_24_5')).toBe('LONDON');

    // 2026-11-10 is Tuesday: 05:21 UTC is 14:21 Tokyo / Asian session
    const asiaTrade = new Date('2026-11-10T05:21:42Z');
    expect(deriveSessionFromTime(asiaTrade, 'FOREX', 'FOREX_SPOT', 'FOREX_24_5', 'XAUUSD')).toBe('ASIA');
    expect(deriveSessionFromTime(asiaTrade, 'ELEFIN', undefined, undefined, 'EURUSD')).toBe('ASIA');

    // Saturday weekend trade
    const satTrade = new Date('2026-11-14T09:07:32Z');
    expect(deriveSessionFromTime(satTrade, 'FOREX', 'FOREX_SPOT', 'FOREX_24_5', 'XAUUSD')).toBe('OFF_HOURS');
  });

  it('handles null/undefined fallback gracefully', () => {
    expect(deriveSessionFromTime(null, 'NSE')).toBe('NSE_REGULAR');
    expect(deriveSessionFromTime(undefined, 'MCX')).toBe('MCX_EVENING');
    expect(deriveSessionFromTime(null, 'FOREX')).toBe('NEW_YORK');
    expect(deriveSessionFromTime(null, undefined, undefined, 'FOREX_24_5')).toBe('NEW_YORK');
  });
});
