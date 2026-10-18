/**
 * Indian Market Date and Calendar Generator.
 * Respects NSE/BSE and MCX trading schedules, weekends, Indian public holidays,
 * and covers multi-year, current/previous FY, and current/previous month distributions.
 */

// Major recurring Indian national and stock exchange holidays (MM-DD)
export const INDIAN_MARKET_HOLIDAYS_FIXED = [
  '01-26', // Republic Day
  '05-01', // Maharashtra Day
  '08-15', // Independence Day
  '10-02', // Mahatma Gandhi Jayanti
  '12-25', // Christmas
];

// Variable annual holidays (approximate calendar dates across 2024-2026)
export const KNOWN_MARKET_HOLIDAYS: Set<string> = new Set([
  // 2024
  '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29', '2024-04-11',
  '2024-04-17', '2024-05-01', '2024-06-17', '2024-07-17', '2024-08-15',
  '2024-10-02', '2024-11-01', '2024-11-15', '2024-12-25',
  // 2025
  '2025-01-26', '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-18',
  '2025-05-01', '2025-08-15', '2025-08-27', '2025-10-02', '2025-10-21',
  '2025-11-05', '2025-12-25',
  // 2026
  '2026-01-26', '2026-03-03', '2026-03-20', '2026-04-03', '2026-05-01',
  '2026-08-15', '2026-10-02', '2026-10-20', '2026-11-08', '2026-12-25',
]);

export interface MarketCalendarDay {
  dateStr: string; // YYYY-MM-DD
  date: Date;
  isTradingDay: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  financialYear: string; // e.g. "2026-27"
}

export class IndianMarketCalendar {
  /**
   * Checks if a given YYYY-MM-DD date is a valid Indian trading day.
   */
  static isTradingDay(date: Date): boolean {
    const dayOfWeek = date.getUTCDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    const dateStr = date.toISOString().slice(0, 10);
    if (KNOWN_MARKET_HOLIDAYS.has(dateStr)) {
      return false;
    }

    const monthDay = dateStr.slice(5);
    if (INDIAN_MARKET_HOLIDAYS_FIXED.includes(monthDay)) {
      return false;
    }

    return true;
  }

  /**
   * Computes the Indian Financial Year (April 1 to March 31) for a given date.
   */
  static getFinancialYear(date: Date): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed (3 = April)
    if (month >= 3) {
      const nextShortYear = (year + 1).toString().slice(-2);
      return `${year}-${nextShortYear}`;
    } else {
      const prevYear = year - 1;
      const currentShortYear = year.toString().slice(-2);
      return `${prevYear}-${currentShortYear}`;
    }
  }

  /**
   * Generates a list of all trading days between startDate and endDate.
   */
  static getTradingDays(startDate: Date, endDate: Date): MarketCalendarDay[] {
    const days: MarketCalendarDay[] = [];
    const current = new Date(startDate.getTime());
    // Normalise to midnight UTC
    current.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate.getTime());
    end.setUTCHours(23, 59, 59, 999);

    while (current <= end) {
      const dayOfWeek = current.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dateStr = current.toISOString().slice(0, 10);
      const isHoliday = KNOWN_MARKET_HOLIDAYS.has(dateStr) || INDIAN_MARKET_HOLIDAYS_FIXED.includes(dateStr.slice(5));
      const isTradingDay = !isWeekend && !isHoliday;

      days.push({
        dateStr,
        date: new Date(current.getTime()),
        isTradingDay,
        isWeekend,
        isHoliday,
        financialYear: this.getFinancialYear(current),
      });

      // Advance by 1 day
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return days;
  }

  /**
   * Formats an IST execution timestamp for a given date string.
   * session 'NSE_REGULAR': 09:15 - 15:30 IST (03:45 - 10:00 UTC)
   * session 'MCX_EVENING': 17:00 - 23:30 IST (11:30 - 18:00 UTC)
   */
  static createExecutionTimestamps(
    dateStr: string,
    session: 'NSE_REGULAR' | 'MCX_EVENING',
    entryHourMinute: { hour: number; minute: number },
    durationMinutes: number
  ): { entryTime: Date; exitTime: Date } {
    // Parse year, month, day
    const [y, m, d] = dateStr.split('-').map(Number);

    // Convert IST (UTC+5:30) to UTC Date
    // IST = UTC + 5h30m -> UTC = IST - 5h30m
    const istMinutes = entryHourMinute.hour * 60 + entryHourMinute.minute;
    const utcMinutes = istMinutes - 330;

    const entryTime = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    entryTime.setUTCMinutes(utcMinutes);

    const exitTime = new Date(entryTime.getTime() + durationMinutes * 60 * 1000);

    return { entryTime, exitTime };
  }
}
