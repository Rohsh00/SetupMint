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

  it('handles null/undefined fallback gracefully', () => {
    expect(deriveSessionFromTime(null, 'NSE')).toBe('NSE_REGULAR');
    expect(deriveSessionFromTime(undefined, 'MCX')).toBe('MCX_EVENING');
  });
});
