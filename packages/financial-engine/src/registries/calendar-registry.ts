import { SessionCalendarKey, TradingSession } from '@tradevault/shared';

export interface ISessionCalendar {
  readonly key: SessionCalendarKey;
  readonly name: string;
  readonly defaultTimezone: string;
  deriveSession(entryTime: string | Date | null | undefined, exchange?: string, segment?: string): TradingSession;
  isMarketOpen(date: string | Date): boolean;
  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date };
}

export class NseSessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'NSE';
  readonly name = 'NSE Indian Equities & Derivatives';
  readonly defaultTimezone = 'Asia/Kolkata';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'NSE_REGULAR';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'NSE_REGULAR';

    const day = date.getUTCDay();
    if (day === 0 || day === 6) return 'OFF_HOURS';

    // IST is UTC + 5:30 (330 min)
    const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
    // 09:15 IST (555 min) - 15:30 IST (930 min)
    if (istMinutes >= 540 && istMinutes <= 960) {
      return 'NSE_REGULAR';
    }
    return 'OFF_HOURS';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getUTCDay();
    if (day === 0 || day === 6) return false;
    const istMinutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
    return istMinutes >= 555 && istMinutes <= 930;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Convert to IST calendar date
    const istOffsetMs = 330 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffsetMs);
    const y = istDate.getUTCFullYear();
    const m = istDate.getUTCMonth();
    const day = istDate.getUTCDate();

    // Midnight IST in UTC
    const startOfDay = new Date(Date.UTC(y, m, day, 0, 0, 0) - istOffsetMs);
    const endOfDay = new Date(Date.UTC(y, m, day, 23, 59, 59, 999) - istOffsetMs);
    return { startOfDay, endOfDay };
  }
}

export class McxSessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'MCX';
  readonly name = 'MCX Indian Commodities';
  readonly defaultTimezone = 'Asia/Kolkata';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'MCX_EVENING';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'MCX_EVENING';

    const day = date.getUTCDay();
    if (day === 0 || day === 6) return 'OFF_HOURS';

    const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
    if (istMinutes >= 540 && istMinutes <= 1020) {
      return 'NSE_REGULAR'; // Morning commodity session
    }
    if (istMinutes > 1020 && istMinutes <= 1435) {
      return 'MCX_EVENING';
    }
    return 'OFF_HOURS';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getUTCDay();
    if (day === 0 || day === 6) return false;
    const istMinutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
    return istMinutes >= 540 && istMinutes <= 1435;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
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
}

export class Forex24_5SessionCalendar implements ISessionCalendar {
  readonly key: SessionCalendarKey = 'FOREX_24_5';
  readonly name = 'Global 24/5 Forex & CFD Sessions';
  readonly defaultTimezone = 'UTC';

  deriveSession(entryTime: string | Date | null | undefined): TradingSession {
    if (!entryTime) return 'LONDON';
    const date = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    if (isNaN(date.getTime())) return 'LONDON';

    const day = date.getUTCDay(); // 0 Sun, 5 Fri, 6 Sat
    const hour = date.getUTCHours();

    // Weekend: Friday 22:00 UTC to Sunday 21:00 UTC
    if (day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 21)) {
      return 'OFF_HOURS';
    }

    // Asian Session (Tokyo/Sydney): 00:00 - 08:00 UTC
    if (hour >= 0 && hour < 8) {
      return 'ASIA';
    }
    // London Session: 08:00 - 13:00 UTC (primary) / 13:00 - 16:30 (overlap)
    if (hour >= 8 && hour < 13) {
      return 'LONDON';
    }
    // New York Session: 13:00 - 21:00 UTC
    if (hour >= 13 && hour < 21) {
      return 'NEW_YORK';
    }

    return 'ASIA';
  }

  isMarketOpen(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    if (day === 6) return false;
    if (day === 5 && hour >= 22) return false;
    if (day === 0 && hour < 21) return false;
    return true;
  }

  getDayResetBoundary(date: string | Date): { startOfDay: Date; endOfDay: Date } {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Prop accounts usually reset at 17:00 EST / 21:00 or 00:00 UTC
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const startOfDay = new Date(Date.UTC(y, m, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
    return { startOfDay, endOfDay };
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
    const d = typeof date === 'string' ? new Date(date) : date;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const startOfDay = new Date(Date.UTC(y, m, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
    return { startOfDay, endOfDay };
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
