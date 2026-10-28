import { describe, it, expect } from 'vitest';
import {
  resolvePreset,
  normalizeRange,
  buildDateRangeClause,
  createDateRangeSchema,
  isValidCalendarDate,
  formatDateInTz,
  IDateRange,
  isoWeekToRange,
  dateToIsoWeek,
  getAdjacentIsoWeek,
} from '@tradevault/shared';

describe('Shared Date-Range Model & Pure Helpers', () => {
  describe('Calendar Date Validation', () => {
    it('accepts valid calendar dates', () => {
      expect(isValidCalendarDate('2026-10-26')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // Leap year
      expect(isValidCalendarDate('2024-12-31')).toBe(true);
      expect(isValidCalendarDate('2000-02-29')).toBe(true); // Century leap year
    });

    it('rejects invalid format and nonexistent calendar dates', () => {
      expect(isValidCalendarDate('2023-02-29')).toBe(false); // Non-leap year
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-13-01')).toBe(false); // Month 13
      expect(isValidCalendarDate('2026-00-10')).toBe(false); // Month 0
      expect(isValidCalendarDate('invalid-date')).toBe(false);
      expect(isValidCalendarDate('26-10-2026')).toBe(false);
    });
  });

  describe('resolvePreset', () => {
    // Reference date: Monday, October 26, 2026 at 12:00:00 IST
    const nowMonday = new Date('2026-10-26T12:00:00+05:30');

    it('resolves TODAY and YESTERDAY', () => {
      expect(resolvePreset('TODAY', nowMonday)).toEqual({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
      });
      expect(resolvePreset('YESTERDAY', nowMonday)).toEqual({
        startDate: '2026-10-25',
        endDate: '2026-25-25'.replace('25-25', '10-25'),
      });
    });

    it('resolves 7D, 30D, and 90D', () => {
      expect(resolvePreset('7D', nowMonday)).toEqual({
        startDate: '2026-10-19',
        endDate: '2026-10-26',
      });
      expect(resolvePreset('30D', nowMonday)).toEqual({
        startDate: '2026-09-26',
        endDate: '2026-10-26',
      });
      expect(resolvePreset('90D', nowMonday)).toEqual({
        startDate: '2026-07-28',
        endDate: '2026-10-26',
      });
    });

    it('resolves THIS_WEEK with Monday start and clipping to today', () => {
      // Monday Oct 26 -> start Monday Oct 26, end Oct 26
      expect(resolvePreset('THIS_WEEK', nowMonday)).toEqual({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
      });

      // Wednesday Oct 28 -> start Monday Oct 26, end Oct 28
      const nowWed = new Date('2026-10-28T10:00:00+05:30');
      expect(resolvePreset('THIS_WEEK', nowWed)).toEqual({
        startDate: '2026-10-26',
        endDate: '2026-10-28',
      });

      // Sunday Nov 1 -> start Monday Oct 26, end Nov 1
      const nowSun = new Date('2026-11-01T18:00:00+05:30');
      expect(resolvePreset('THIS_WEEK', nowSun)).toEqual({
        startDate: '2026-10-26',
        endDate: '2026-11-01',
      });
    });

    it('resolves LAST_WEEK from Monday to Sunday of previous week', () => {
      // For any day in week of Oct 26-Nov 1, previous week is Oct 19 (Mon) to Oct 25 (Sun)
      expect(resolvePreset('LAST_WEEK', nowMonday)).toEqual({
        startDate: '2026-10-19',
        endDate: '2026-10-25',
      });
      const nowWed = new Date('2026-10-28T10:00:00+05:30');
      expect(resolvePreset('LAST_WEEK', nowWed)).toEqual({
        startDate: '2026-10-19',
        endDate: '2026-10-25',
      });
    });

    it('resolves THIS_MONTH and THIS_QUARTER', () => {
      expect(resolvePreset('THIS_MONTH', nowMonday)).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-10-26',
      });
      expect(resolvePreset('THIS_QUARTER', nowMonday)).toEqual({
        startDate: '2026-10-01', // Q4 starts Oct 1
        endDate: '2026-10-26',
      });

      // Test Q2 (May)
      const nowMay = new Date('2026-05-15T12:00:00+05:30');
      expect(resolvePreset('THIS_QUARTER', nowMay)).toEqual({
        startDate: '2026-04-01',
        endDate: '2026-05-15',
      });
    });

    it('resolves LAST_MONTH including leap year February', () => {
      // In October -> last month is September (30 days)
      expect(resolvePreset('LAST_MONTH', nowMonday)).toEqual({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      // In March 2024 (leap year) -> last month is Feb 2024 (29 days)
      const nowMarchLeap = new Date('2024-03-15T12:00:00+05:30');
      expect(resolvePreset('LAST_MONTH', nowMarchLeap)).toEqual({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      });

      // In March 2025 (non-leap year) -> last month is Feb 2025 (28 days)
      const nowMarchNonLeap = new Date('2025-03-15T12:00:00+05:30');
      expect(resolvePreset('LAST_MONTH', nowMarchNonLeap)).toEqual({
        startDate: '2025-02-01',
        endDate: '2025-02-28',
      });

      // In January 2026 -> last month is December 2025 (year rollover)
      const nowJan = new Date('2026-01-10T12:00:00+05:30');
      expect(resolvePreset('LAST_MONTH', nowJan)).toEqual({
        startDate: '2025-12-01',
        endDate: '2025-12-31',
      });
    });

    it('resolves YTD', () => {
      expect(resolvePreset('YTD', nowMonday)).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-10-26',
      });
    });

    it('resolves Indian Financial Year (THIS_FY and LAST_FY) correctly', () => {
      // In Oct 2026: FY 2026-27 (starts 2026-04-01, clipped to 2026-10-26)
      expect(resolvePreset('THIS_FY', nowMonday)).toEqual({
        startDate: '2026-04-01',
        endDate: '2026-10-26',
      });
      // LAST_FY: FY 2025-26 (2025-04-01 to 2026-03-31)
      expect(resolvePreset('LAST_FY', nowMonday)).toEqual({
        startDate: '2025-04-01',
        endDate: '2026-03-31',
      });

      // In Feb 2026: FY 2025-26 (starts 2025-04-01, clipped to 2026-02-15)
      const nowFeb = new Date('2026-02-15T12:00:00+05:30');
      expect(resolvePreset('THIS_FY', nowFeb)).toEqual({
        startDate: '2025-04-01',
        endDate: '2026-02-15',
      });
      // LAST_FY: FY 2024-25 (2024-04-01 to 2025-03-31)
      expect(resolvePreset('LAST_FY', nowFeb)).toEqual({
        startDate: '2024-04-01',
        endDate: '2025-03-31',
      });

      // On April 1 (FY boundary start day)
      const nowApr1 = new Date('2026-04-01T09:15:00+05:30');
      expect(resolvePreset('THIS_FY', nowApr1)).toEqual({
        startDate: '2026-04-01',
        endDate: '2026-04-01',
      });
      expect(resolvePreset('LAST_FY', nowApr1)).toEqual({
        startDate: '2025-04-01',
        endDate: '2026-03-31',
      });
    });

    it('resolves ALL_TIME and CUSTOM', () => {
      expect(resolvePreset('ALL_TIME', nowMonday)).toEqual({
        startDate: undefined,
        endDate: undefined,
      });

      expect(
        resolvePreset('CUSTOM', nowMonday, 'Asia/Kolkata', {
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        })
      ).toEqual({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });
    });
  });

  describe('normalizeRange & IST UTC Boundaries', () => {
    it('computes exact inclusive UTC boundaries for IST trading day', () => {
      const normalized = normalizeRange({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
      });

      // 2026-10-26 00:00:00.000 IST = 2026-10-25 18:30:00.000 UTC
      expect(normalized.startUtc?.toISOString()).toBe('2026-10-25T18:30:00.000Z');
      // 2026-10-26 23:59:59.999 IST = 2026-10-26 18:29:59.999 UTC
      expect(normalized.endUtc?.toISOString()).toBe('2026-10-26T18:29:59.999Z');
    });

    it('verifies trade inclusion at 23:59 IST and exclusion at 00:00 IST next day', () => {
      const { startUtc, endUtc } = normalizeRange({
        startDate: '2026-10-26',
        endDate: '2026-10-26',
      });

      const tradeAtEndOfDay = new Date('2026-10-26T23:59:00+05:30');
      const tradeAtNextDayStart = new Date('2026-10-27T00:00:00+05:30');
      const tradeAtPrevDayEnd = new Date('2026-10-25T23:59:59+05:30');
      const tradeAtStartOfDay = new Date('2026-10-26T00:00:00+05:30');

      // Included
      expect(tradeAtEndOfDay.getTime()).toBeLessThanOrEqual(endUtc!.getTime());
      expect(tradeAtStartOfDay.getTime()).toBeGreaterThanOrEqual(startUtc!.getTime());

      // Excluded
      expect(tradeAtNextDayStart.getTime()).toBeGreaterThan(endUtc!.getTime());
      expect(tradeAtPrevDayEnd.getTime()).toBeLessThan(startUtc!.getTime());
    });

    it('supports open-ended ranges', () => {
      const onlyStart = normalizeRange({ startDate: '2026-10-01' });
      expect(onlyStart.startUtc?.toISOString()).toBe('2026-09-30T18:30:00.000Z');
      expect(onlyStart.endUtc).toBeUndefined();

      const onlyEnd = normalizeRange({ endDate: '2026-10-26' });
      expect(onlyEnd.startUtc).toBeUndefined();
      expect(onlyEnd.endUtc?.toISOString()).toBe('2026-10-26T18:29:59.999Z');
    });

    it('throws error when startDate > endDate', () => {
      expect(() =>
        normalizeRange({ startDate: '2026-10-27', endDate: '2026-10-26' })
      ).toThrowError(/startDate.*must be on or before endDate/);
    });

    it('throws error on invalid calendar date', () => {
      expect(() => normalizeRange({ startDate: '2023-02-29' })).toThrowError(
        /Invalid calendar startDate/
      );
    });
  });

  describe('buildDateRangeClause', () => {
    it('builds MongoDB filter clause for tradeDate', () => {
      const clause = buildDateRangeClause({
        startDate: '2026-10-20',
        endDate: '2026-10-26',
      });

      expect(clause.tradeDate).toBeDefined();
      expect(clause.tradeDate?.$gte?.toISOString()).toBe('2026-10-19T18:30:00.000Z');
      expect(clause.tradeDate?.$lte?.toISOString()).toBe('2026-10-26T18:29:59.999Z');
    });

    it('returns empty object for undefined or empty range', () => {
      expect(buildDateRangeClause(undefined)).toEqual({});
      expect(buildDateRangeClause({})).toEqual({});
    });
  });

  describe('dateRangeSchema Zod Validation', () => {
    const fixedNow = new Date('2026-10-26T12:00:00+05:30');
    const testSchema = createDateRangeSchema(() => fixedNow, 'Asia/Kolkata');

    it('passes for valid range up to today', () => {
      const res = testSchema.safeParse({
        startDate: '2026-10-01',
        endDate: '2026-10-26',
      });
      expect(res.success).toBe(true);
    });

    it('passes for open-ended ranges and empty object', () => {
      expect(testSchema.safeParse({ startDate: '2026-10-01' }).success).toBe(true);
      expect(testSchema.safeParse({ endDate: '2026-10-26' }).success).toBe(true);
      expect(testSchema.safeParse({}).success).toBe(true);
      expect(testSchema.safeParse({ startDate: '', endDate: '' }).success).toBe(true);
    });

    it('rejects when startDate > endDate', () => {
      const res = testSchema.safeParse({
        startDate: '2026-10-27',
        endDate: '2026-10-26',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('startDate must be on or before endDate');
      }
    });

    it('rejects future-dated endDate beyond today', () => {
      const res = testSchema.safeParse({
        startDate: '2026-10-20',
        endDate: '2026-10-27', // tomorrow relative to fixedNow (Oct 26)
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('endDate cannot be in the future');
      }
    });

    it('rejects invalid calendar dates', () => {
      const res = testSchema.safeParse({
        startDate: '2023-02-29',
        endDate: '2026-10-26',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('ISO Week Helpers (isoWeekToRange & dateToIsoWeek)', () => {
    it('converts typical ISO week 2026-W43 to IST date boundaries', () => {
      const range = isoWeekToRange('2026-W43');
      expect(range.startDate).toBe('2026-10-19'); // Monday
      expect(range.endDate).toBe('2026-10-25'); // Sunday
      expect(range.startUtc?.toISOString()).toBe('2026-10-18T18:30:00.000Z');
      expect(range.endUtc?.toISOString()).toBe('2026-10-25T18:29:59.999Z');
    });

    it('converts calendar dates in 2026-W43 back to ISO week', () => {
      expect(dateToIsoWeek('2026-10-19')).toBe('2026-W43'); // Monday
      expect(dateToIsoWeek('2026-10-21')).toBe('2026-W43'); // Wednesday
      expect(dateToIsoWeek('2026-10-25')).toBe('2026-W43'); // Sunday
    });

    it('handles year boundary and 53-week year: 2026-W53 to 2027-W01', () => {
      // 2026 starts on Thursday, so it contains 53 ISO weeks
      const w53 = isoWeekToRange('2026-W53');
      expect(w53.startDate).toBe('2026-12-28'); // Monday
      expect(w53.endDate).toBe('2027-01-03'); // Sunday

      expect(dateToIsoWeek('2026-12-28')).toBe('2026-W53');
      expect(dateToIsoWeek('2026-12-31')).toBe('2026-W53');
      expect(dateToIsoWeek('2027-01-01')).toBe('2026-W53'); // Friday in W53
      expect(dateToIsoWeek('2027-01-03')).toBe('2026-W53'); // Sunday in W53

      // 2027-W01 begins on Monday 2027-01-04
      const w01 = isoWeekToRange('2027-W01');
      expect(w01.startDate).toBe('2027-01-04'); // Monday
      expect(w01.endDate).toBe('2027-01-10'); // Sunday

      expect(dateToIsoWeek('2027-01-04')).toBe('2027-W01');
      expect(dateToIsoWeek('2027-01-10')).toBe('2027-W01');

      // Adjacent week transitions across year boundary
      expect(getAdjacentIsoWeek('2026-W53', 1)).toBe('2027-W01');
      expect(getAdjacentIsoWeek('2027-W01', -1)).toBe('2026-W53');
    });

    it('handles leap year week conversion (2024-W09)', () => {
      // 2024 is a leap year with Feb 29 on Thursday
      const w09 = isoWeekToRange('2024-W09');
      expect(w09.startDate).toBe('2024-02-26'); // Monday
      expect(w09.endDate).toBe('2024-03-03'); // Sunday

      expect(dateToIsoWeek('2024-02-26')).toBe('2024-W09');
      expect(dateToIsoWeek('2024-02-29')).toBe('2024-W09'); // Leap day
      expect(dateToIsoWeek('2024-03-01')).toBe('2024-W09');
      expect(dateToIsoWeek('2024-03-03')).toBe('2024-W09');
    });

    it('rejects malformed ISO week strings', () => {
      expect(() => isoWeekToRange('2026-W00')).toThrow(/Invalid ISO week/);
      expect(() => isoWeekToRange('2026-W54')).toThrow(/Invalid ISO week/);
      expect(() => isoWeekToRange('2026-43')).toThrow(/Invalid ISO week/);
      expect(() => isoWeekToRange('invalid')).toThrow(/Invalid ISO week/);
    });
  });
});

