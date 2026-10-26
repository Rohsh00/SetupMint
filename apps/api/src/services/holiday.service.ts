import { HolidayCalendar, IHolidayCalendarDoc } from '../db/models/HolidayCalendar.js';
import { getNseHolidaysForYear, NSE_TRADING_HOLIDAYS_BY_YEAR } from '@tradevault/shared';

export interface UpstoxHolidayItem {
  date: string;
  description: string;
  holiday_type: string;
  closed_sessions?: string[];
  open_sessions?: string[];
}

export class HolidayService {
  // In-memory cache keyed by "exchange:year" -> Set of YYYY-MM-DD
  private static cache = new Map<string, { holidays: Set<string>; cachedAt: number }>();
  private static CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Returns trading holiday dates (YYYY-MM-DD) for a specified exchange and year.
   * Hits memory cache first, then MongoDB HolidayCalendar, falling back to multi-year seeds.
   */
  static async getTradingHolidays(year: number, exchange = 'NSE'): Promise<string[]> {
    const ex = exchange.toUpperCase();
    const cacheKey = `${ex}:${year}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      return Array.from(cached.holidays);
    }

    try {
      const records = await HolidayCalendar.find({
        exchange: ex,
        year,
        isTradingHoliday: true,
      })
        .select('date')
        .lean();

      if (records.length > 0) {
        const holidayDates = records.map((r) => r.date);
        this.cache.set(cacheKey, {
          holidays: new Set(holidayDates),
          cachedAt: now,
        });
        return holidayDates;
      }

      // If DB has no entries for NSE, seed from multi-year seed
      if (ex === 'NSE') {
        const fallbackDates = getNseHolidaysForYear(year);
        if (fallbackDates.length > 0) {
          // Pre-populate MongoDB asynchronously
          this.seedYearHolidays(year, fallbackDates).catch((err) => {
            console.error(`[HolidayService] Background seed error for ${year}:`, err);
          });

          this.cache.set(cacheKey, {
            holidays: new Set(fallbackDates),
            cachedAt: now,
          });
          return Array.from(fallbackDates);
        }
      }
    } catch (err) {
      // Resilience: on DB error, fall back to built-in multi-year map
      const fallback = getNseHolidaysForYear(year);
      return Array.from(fallback);
    }

    return [];
  }

  /**
   * Synchronously checks if a date string is in the local memory cache or fallback.
   */
  static isHolidaySync(dateStr: string, exchange = 'NSE'): boolean {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const ex = exchange.toUpperCase();
    const cacheKey = `${ex}:${year}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached.holidays.has(dateStr);
    }

    // Direct fallback from multi-year definitions
    const fallback = getNseHolidaysForYear(year);
    return fallback.includes(dateStr);
  }

  /**
   * Seeds holidays for a specific year into MongoDB.
   */
  private static async seedYearHolidays(year: number, dates: readonly string[]): Promise<void> {
    const ops: any[] = dates.map((date) => ({
      updateOne: {
        filter: { exchange: 'NSE', date, segment: 'ALL' },
        update: {
          $setOnInsert: {
            exchange: 'NSE',
            segment: 'ALL',
            date,
            year,
            description: 'NSE Official Trading Holiday',
            isTradingHoliday: true,
            morningSessionClosed: true,
            eveningSessionClosed: true,
            source: 'OFFICIAL_CIRCULAR',
          },
        },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await HolidayCalendar.bulkWrite(ops, { ordered: false });
    }
  }

  /**
   * Fetches official holidays from external Upstox Market Holidays API and persists to DB.
   * Upstox Public Holidays API: https://api.upstox.com/v2/market/holidays
   */
  static async syncFromUpstox(): Promise<{ syncedCount: number; years: number[] }> {
    try {
      const response = await fetch('https://api.upstox.com/v2/market/holidays', {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Upstox holiday API returned HTTP ${response.status}`);
      }

      const payload: any = await response.json();
      const holidayData: UpstoxHolidayItem[] = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      if (holidayData.length === 0) {
        return { syncedCount: 0, years: [] };
      }

      const yearsAffected = new Set<number>();
      const bulkOps: any[] = [];

      for (const item of holidayData) {
        if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
        const yr = parseInt(item.date.slice(0, 4), 10);
        yearsAffected.add(yr);

        const isMorningClosed = item.closed_sessions?.includes('morning') ?? true;
        const isEveningClosed = item.closed_sessions?.includes('evening') ?? true;
        const isSpecialTrading = item.holiday_type === 'SPECIAL_TRADING';

        bulkOps.push({
          updateOne: {
            filter: { exchange: 'NSE', date: item.date, segment: 'ALL' },
            update: {
              $set: {
                exchange: 'NSE',
                segment: 'ALL',
                date: item.date,
                year: yr,
                description: item.description || 'NSE Market Holiday',
                isTradingHoliday: !isSpecialTrading,
                morningSessionClosed: isMorningClosed,
                eveningSessionClosed: isEveningClosed,
                isSpecialTrading,
                source: 'UPSTOX_API',
              },
            },
            upsert: true,
          },
        });
      }

      if (bulkOps.length > 0) {
        await HolidayCalendar.bulkWrite(bulkOps, { ordered: false });
      }

      // Invalidate memory cache for all touched years
      for (const yr of yearsAffected) {
        this.cache.delete(`NSE:${yr}`);
        this.cache.delete(`BSE:${yr}`);
        this.cache.delete(`MCX:${yr}`);
      }

      return {
        syncedCount: bulkOps.length,
        years: Array.from(yearsAffected),
      };
    } catch (err: any) {
      console.warn('[HolidayService] Upstox API sync failed (falling back to pre-seeded calendar):', err.message);
      throw err;
    }
  }

  /**
   * Initializes the database on server startup with all configured multi-year holidays.
   */
  static async initializeDefaults(): Promise<void> {
    try {
      const existingCount = await HolidayCalendar.countDocuments();
      if (existingCount > 0) return;

      for (const [yearStr, dates] of Object.entries(NSE_TRADING_HOLIDAYS_BY_YEAR)) {
        const yr = parseInt(yearStr, 10);
        await this.seedYearHolidays(yr, dates);
      }
    } catch (err) {
      console.error('[HolidayService] Failed to initialize default holiday calendar:', err);
    }
  }
}
