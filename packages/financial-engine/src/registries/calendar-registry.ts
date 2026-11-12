import { SessionCalendarKey, TradingSession } from '@tradevault/shared';

export interface ISessionCalendar {
  readonly key: SessionCalendarKey;
  readonly name: string;
  readonly defaultTimezone: string;
  deriveSession(entryTime: string | Date | null | undefined, exchange?: string, segment?: string): TradingSession;
  isMarketOpen(date: string | Date): boolean;
  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date };
}

/**
 * Extracts local day-of-week (0=Sun..6=Sat) and minutes-from-midnight in an IANA timezone
 * so DST transitions (America/New_York EDT/EST, Europe/London BST/GMT) are always exact.
 */
function getLocalClock(date: Date, timeZone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayOfWeek: weekdayMap[weekdayStr] ?? 1,
    minutes: hour * 60 + minute,
  };
}

function buildIstDayBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const istOffsetMs = 330 * 60 * 1000;
  const istDate = new Date(d.getTime() + istOffsetMs);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const day = istDate.getUTCDate();

  const startOfDay = new Date(Date.UTC(y, m, day, 0, 0, 0) - istOffsetMs);
  const endOfDay = new Date(Date.UTC(y, m, day, 23, 59, 59, 999) - istOffsetMs);
  return { startOfDay, endOfDay };
}

function buildUtcDayBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const startOfDay = new Date(Date.UTC(y, m, day, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
  return { startOfDay, endOfDay };
}

export class NseSessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'NSE';
  readonly name = 'NSE Indian Equities & Derivatives';
  readonly defaultTimezone = 'Asia/Kolkata';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'NSE_REGULAR';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'NSE_REGULAR';

    const { dayOfWeek, minutes: istMinutes } = getLocalClock(date, 'Asia/Kolkata');
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'OFF_HOURS';

    // 09:00 IST (pre-open 540 min) - 16:00 IST (post-close 960 min)
    if (istMinutes >= 540 && istMinutes <= 960) {
      return 'NSE_REGULAR';
    }
    return 'OFF_HOURS';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return false;
    const { dayOfWeek, minutes: istMinutes } = getLocalClock(d, 'Asia/Kolkata');
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return istMinutes >= 555 && istMinutes <= 930;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    return buildIstDayBoundary(date);
  }
}

export class McxSessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'MCX';
  readonly name = 'MCX Indian Commodities';
  readonly defaultTimezone = 'Asia/Kolkata';

  private getMcxCloseMinutesIst(date: Date): number {
    // MCX non-agri evening closes at 23:30 IST during US EDT, 23:55 IST during US EST
    const nyOffsetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzName = nyOffsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
    const isEdt = tzName.includes('-4');
    return isEdt ? 23 * 60 + 30 : 23 * 60 + 55;
  }

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'MCX_EVENING';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'MCX_EVENING';

    // Evaluate day-of-week strictly in IST (prevents Friday UTC rollover false positives)
    const { dayOfWeek, minutes: istMinutes } = getLocalClock(date, 'Asia/Kolkata');
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'OFF_HOURS';

    const closeMin = this.getMcxCloseMinutesIst(date);
    if (istMinutes >= 540 && istMinutes <= 1020) {
      return 'NSE_REGULAR'; // Morning commodity session (09:00 - 17:00 IST)
    }
    if (istMinutes > 1020 && istMinutes <= closeMin) {
      return 'MCX_EVENING'; // Evening commodity session (17:00 - 23:30/23:55 IST)
    }
    return 'OFF_HOURS';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return false;
    const { dayOfWeek, minutes: istMinutes } = getLocalClock(d, 'Asia/Kolkata');
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return istMinutes >= 540 && istMinutes <= this.getMcxCloseMinutesIst(d);
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    return buildIstDayBoundary(date);
  }
}

export class Forex24_5SessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'FOREX_24_5';
  readonly name = 'Global 24/5 Forex & CFD Sessions';
  readonly defaultTimezone = 'UTC';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'LONDON';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'LONDON';

    const ny = getLocalClock(date, 'America/New_York');
    const london = getLocalClock(date, 'Europe/London');

    // Weekend closure anchored to New York 17:00 Friday -> 17:00 Sunday
    if (
      ny.dayOfWeek === 6 ||
      (ny.dayOfWeek === 5 && ny.minutes >= 17 * 60) ||
      (ny.dayOfWeek === 0 && ny.minutes < 17 * 60)
    ) {
      return 'OFF_HOURS';
    }

    // DST-aware session mapping:
    // New York cash/core window: 08:00 - 17:00 America/New_York
    if (ny.minutes >= 8 * 60 && ny.minutes < 17 * 60) {
      return 'NEW_YORK';
    }
    // London window: 08:00 Europe/London until NY open (08:00 NY)
    if (london.minutes >= 8 * 60 && london.minutes < 17 * 60) {
      return 'LONDON';
    }
    return 'ASIA';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return false;
    const ny = getLocalClock(d, 'America/New_York');
    if (ny.dayOfWeek === 6) return false;
    if (ny.dayOfWeek === 5 && ny.minutes >= 17 * 60) return false;
    if (ny.dayOfWeek === 0 && ny.minutes < 17 * 60) return false;
    return true;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    return buildUtcDayBoundary(date);
  }
}

export class Crypto24_7SessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'CRYPTO_24_7';
  readonly name = 'Crypto 24/7 Continuous';
  readonly defaultTimezone = 'UTC';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'NEW_YORK';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'NEW_YORK';
    const hour = date.getUTCHours();
    if (hour >= 0 && hour < 8) return 'ASIA';
    if (hour >= 8 && hour < 13) return 'LONDON';
    return 'NEW_YORK';
  }

  isMarketOpen(): boolean {
    return true;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    return buildUtcDayBoundary(date);
  }
}

const calendars: Record<SessionCalendarKey, ISessionCalendar> = {
  NSE: new NseSessionCalendar(),
  MCX: new McxSessionCalendar(),
  FOREX_24_5: new Forex24_5SessionCalendar(),
  CRYPTO_24_7: new Crypto24_7SessionCalendar(),
};

export class SessionCalendarRegistry {
  static get(key: SessionCalendarKey | string): ISessionCalendar {
    const norm = (key || 'NSE').toUpperCase().trim() as SessionCalendarKey;
    return calendars[norm] || calendars.NSE;
  }

  static deriveSession(
    calendarKey: SessionCalendarKey | string,
    entryTime: string | Date | null | undefined,
    exchange?: string,
    segment?: string
  ): TradingSession {
    return this.get(calendarKey).deriveSession(entryTime, exchange, segment);
  }

  static detectSession(
    entryTime: string | Date | null | undefined,
    calendarKey: SessionCalendarKey | string = 'FOREX_24_5',
    exchange?: string,
    segment?: string
  ): TradingSession {
    return this.deriveSession(calendarKey, entryTime, exchange, segment);
  }

  static isMarketOpen(calendarKey: SessionCalendarKey | string, date: string | Date): boolean {
    return this.get(calendarKey).isMarketOpen(date);
  }

  static list(): ISessionCalendar[] {
    return Object.values(calendars);
  }
}
