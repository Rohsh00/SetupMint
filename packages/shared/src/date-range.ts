import { z } from 'zod';

export type DateRangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | '7D'
  | '30D'
  | '90D'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'YTD'
  | 'THIS_FY'
  | 'LAST_FY'
  | 'ALL_TIME'
  | 'CUSTOM';

export interface IDateRange {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface INormalizedDateRange {
  startDate?: string;
  endDate?: string;
  startUtc?: Date;
  endUtc?: Date;
  start?: Date;
  end?: Date;
}

export const DATE_RANGE_PRESETS: ReadonlyArray<{
  readonly id: DateRangePreset;
  readonly label: string;
  readonly group?: 'quick' | 'week' | 'month' | 'financial';
}> = [
  { id: 'TODAY', label: 'Today', group: 'quick' },
  { id: 'YESTERDAY', label: 'Yesterday', group: 'quick' },
  { id: '7D', label: 'Last 7 Days', group: 'quick' },
  { id: '30D', label: 'Last 30 Days', group: 'quick' },
  { id: '90D', label: 'Last 90 Days', group: 'quick' },
  { id: 'THIS_WEEK', label: 'This Week', group: 'week' },
  { id: 'LAST_WEEK', label: 'Last Week', group: 'week' },
  { id: 'THIS_MONTH', label: 'This Month', group: 'month' },
  { id: 'LAST_MONTH', label: 'Last Month', group: 'month' },
  { id: 'THIS_QUARTER', label: 'This Quarter', group: 'month' },
  { id: 'YTD', label: 'Year to Date', group: 'financial' },
  { id: 'THIS_FY', label: 'Current FY (India)', group: 'financial' },
  { id: 'LAST_FY', label: 'Previous FY (India)', group: 'financial' },
  { id: 'ALL_TIME', label: 'All Time', group: 'quick' },
  { id: 'CUSTOM', label: 'Custom Range' },
];

export const DATE_RANGE_PRESET_IDS: readonly DateRangePreset[] = DATE_RANGE_PRESETS.map((p) => p.id);

/**
 * Validates strictly formatted calendar date in YYYY-MM-DD notation.
 * Rejects nonexistent dates such as leap-year mismatches (e.g. 2023-02-29).
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return (
    utcDate.getUTCFullYear() === y &&
    utcDate.getUTCMonth() === m - 1 &&
    utcDate.getUTCDate() === d
  );
}

/**
 * Formats a given Date instance into YYYY-MM-DD string within a specific timezone (default Asia/Kolkata).
 */
export function formatDateInTz(date: Date, tz = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function getDayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Factory creating the dateRangeSchema, allowing injection of reference clock and timezone.
 */
export function createDateRangeSchema(
  getNow: () => Date = () => new Date(),
  tz = 'Asia/Kolkata'
) {
  return z
    .object({
      startDate: z.preprocess(
        (val) => (val === '' || val === null || val === undefined ? undefined : String(val)),
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid startDate format (expected YYYY-MM-DD)')
          .refine(isValidCalendarDate, 'Invalid calendar startDate')
          .optional()
      ),
      endDate: z.preprocess(
        (val) => (val === '' || val === null || val === undefined ? undefined : String(val)),
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid endDate format (expected YYYY-MM-DD)')
          .refine(isValidCalendarDate, 'Invalid calendar endDate')
          .optional()
      ),
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return data.startDate <= data.endDate;
        }
        return true;
      },
      {
        message: 'startDate must be on or before endDate',
        path: ['startDate'],
      }
    )
    .refine(
      (data) => {
        if (data.endDate) {
          const todayStr = formatDateInTz(getNow(), tz);
          return data.endDate <= todayStr;
        }
        return true;
      },
      {
        message: 'endDate cannot be in the future',
        path: ['endDate'],
      }
    );
}

export const dateRangeSchema = createDateRangeSchema();
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/**
 * Resolves a date preset relative to a reference time (default now in IST).
 * All presets clip ongoing ranges to today.
 *
 * Indian Financial Year:
 * - April 1 to March 31.
 * - THIS_FY in Oct 2026 = 2026-04-01 to 2027-03-31 (clipped to today for display).
 * - LAST_FY in Oct 2026 = 2025-04-01 to 2026-03-31.
 */
export function resolvePreset(
  preset: DateRangePreset,
  now: Date = new Date(),
  tz = 'Asia/Kolkata',
  customRange?: IDateRange
): IDateRange {
  if (preset === 'ALL_TIME') {
    return { startDate: undefined, endDate: undefined };
  }
  if (preset === 'CUSTOM') {
    return {
      startDate: customRange?.startDate,
      endDate: customRange?.endDate,
    };
  }

  const todayStr = formatDateInTz(now, tz);
  const [year, month, day] = todayStr.split('-').map(Number);

  switch (preset) {
    case 'TODAY':
      return { startDate: todayStr, endDate: todayStr };

    case 'YESTERDAY': {
      const yesterday = addDays(todayStr, -1);
      return { startDate: yesterday, endDate: yesterday };
    }

    case '7D':
      return { startDate: addDays(todayStr, -7), endDate: todayStr };

    case '30D':
      return { startDate: addDays(todayStr, -30), endDate: todayStr };

    case '90D':
      return { startDate: addDays(todayStr, -90), endDate: todayStr };

    case 'THIS_WEEK': {
      // Week starts Monday (1). Sunday is 0.
      const dow = getDayOfWeek(todayStr);
      const daysSinceMonday = dow === 0 ? 6 : dow - 1;
      const monday = addDays(todayStr, -daysSinceMonday);
      return { startDate: monday, endDate: todayStr };
    }

    case 'LAST_WEEK': {
      const dow = getDayOfWeek(todayStr);
      const daysSinceMonday = dow === 0 ? 6 : dow - 1;
      const thisMonday = addDays(todayStr, -daysSinceMonday);
      const lastMonday = addDays(thisMonday, -7);
      const lastSunday = addDays(thisMonday, -1);
      return { startDate: lastMonday, endDate: lastSunday };
    }

    case 'THIS_MONTH':
      return { startDate: toYmd(year, month, 1), endDate: todayStr };

    case 'LAST_MONTH': {
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const lastDayOfPrevM = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
      return {
        startDate: toYmd(prevY, prevM, 1),
        endDate: toYmd(prevY, prevM, lastDayOfPrevM),
      };
    }

    case 'THIS_QUARTER': {
      const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return { startDate: toYmd(year, qStartMonth, 1), endDate: todayStr };
    }

    case 'YTD':
      return { startDate: toYmd(year, 1, 1), endDate: todayStr };

    case 'THIS_FY': {
      // Indian FY starts April 1 (month 4) and ends March 31
      const fyStartYear = month >= 4 ? year : year - 1;
      const fyEndYear = fyStartYear + 1;
      const nominalEnd = toYmd(fyEndYear, 3, 31);
      const endDate = todayStr < nominalEnd ? todayStr : nominalEnd;
      return { startDate: toYmd(fyStartYear, 4, 1), endDate };
    }

    case 'LAST_FY': {
      const currentFyStartYear = month >= 4 ? year : year - 1;
      const lastFyStartYear = currentFyStartYear - 1;
      return {
        startDate: toYmd(lastFyStartYear, 4, 1),
        endDate: toYmd(currentFyStartYear, 3, 31),
      };
    }

    default:
      return { startDate: undefined, endDate: undefined };
  }
}

/**
 * Converts a YYYY-MM-DD date range into inclusive UTC boundaries computed from IST.
 * Start: YYYY-MM-DDT00:00:00.000+05:30 (e.g. previous day 18:30:00.000Z)
 * End:   YYYY-MM-DDT23:59:59.999+05:30 (e.g. same day 18:29:59.999Z)
 *
 * This prevents any timezone day-shift across database queries.
 */
export function normalizeRange(range: IDateRange = {}): INormalizedDateRange {
  const { startDate, endDate } = range;

  if (startDate && endDate && startDate > endDate) {
    throw new Error(
      `Invalid date range: startDate (${startDate}) must be on or before endDate (${endDate})`
    );
  }

  let startUtc: Date | undefined;
  let endUtc: Date | undefined;

  if (startDate) {
    if (!isValidCalendarDate(startDate)) {
      throw new Error(`Invalid calendar startDate: ${startDate}`);
    }
    startUtc = new Date(`${startDate}T00:00:00.000+05:30`);
  }

  if (endDate) {
    if (!isValidCalendarDate(endDate)) {
      throw new Error(`Invalid calendar endDate: ${endDate}`);
    }
    endUtc = new Date(`${endDate}T23:59:59.999+05:30`);
  }

  return {
    startDate,
    endDate,
    startUtc,
    endUtc,
    start: startUtc,
    end: endUtc,
  };
}

/**
 * Builds a MongoDB query clause for `tradeDate` using inclusive UTC boundaries computed from IST.
 * Returns `{ tradeDate: { $gte?: Date, $lte?: Date } }` or `{}` if range is unconstrained.
 */
export function buildDateRangeClause(range?: IDateRange): {
  tradeDate?: { $gte?: Date; $lte?: Date };
} {
  if (!range) return {};
  const { startUtc, endUtc } = normalizeRange(range);
  const tradeDateClause: { $gte?: Date; $lte?: Date } = {};
  if (startUtc) tradeDateClause.$gte = startUtc;
  if (endUtc) tradeDateClause.$lte = endUtc;
  if (Object.keys(tradeDateClause).length === 0) return {};
  return { tradeDate: tradeDateClause };
}
