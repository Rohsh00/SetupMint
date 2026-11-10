/**
 * Timezone-aware date boundaries and formatting for accounts.
 * Eliminates UTC/local drift across Indian (IST), US (EST/EDT), London (GMT/BST), and UTC accounts.
 */

export interface DayBoundaries {
  start: Date;
  end: Date;
  dateStr: string; // YYYY-MM-DD
}

export interface WeekBoundaries {
  start: Date;
  end: Date;
  year: number;
  weekNumber: number;
  weekStr: string; // e.g. "2026-W42"
}

/**
 * Gets the exact start of day (00:00:00.000) and end of day (23:59:59.999) in the specified IANA timezone,
 * converted to real UTC Date instances.
 */
export function getAccountDayBoundaries(
  inputDate: Date | string,
  timezone = 'UTC'
): DayBoundaries {
  const d = typeof inputDate === 'string' ? new Date(inputDate) : inputDate;
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  // Format YYYY-MM-DD in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(validDate); // "YYYY-MM-DD"

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  // Determine timezone offset for midnight of that day in that timezone
  // Use Intl to parse the exact UTC instant of midnight in that timezone
  const approxUtc = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(approxUtc);

  let targetHour = 12;
  let targetMin = 0;
  for (const p of tzParts) {
    if (p.type === 'hour') targetHour = parseInt(p.value, 10);
    if (p.type === 'minute') targetMin = parseInt(p.value, 10);
  }

  const offsetMinutes = targetHour * 60 + targetMin - 720;
  const offsetMs = offsetMinutes * 60 * 1000;

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMs);
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMs);

  return { start, end, dateStr };
}

/**
 * Calculates ISO 8601 week boundaries (Monday to Sunday) in the account's timezone.
 */
export function getAccountISOWeekBoundaries(
  inputDate: Date | string,
  timezone = 'UTC'
): WeekBoundaries {
  const dayB = getAccountDayBoundaries(inputDate, timezone);
  const d = new Date(dayB.start.getTime());

  // Determine day of week in timezone (0 is Sunday, 1 is Monday ... 6 is Saturday)
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const weekdayStr = weekdayFormatter.format(d);
  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };
  const currentDay = dayMap[weekdayStr] ?? 1;

  // Monday is day 1. If Sunday (0), distance to Monday is -6. Otherwise distance is 1 - currentDay.
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const startMonday = new Date(d.getTime() + diffToMonday * 86400000);
  const endSunday = new Date(startMonday.getTime() + 6 * 86400000 + 86399999);

  // Calculate ISO week number
  const thursday = new Date(startMonday.getTime() + 3 * 86400000);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const weekNumber = Math.round(
    ((thursday.getTime() - firstThursday.getTime()) / 86400000 + (firstThursday.getUTCDay() + 6) % 7) / 7
  );

  const weekStr = `${year}-W${String(weekNumber).padStart(2, '0')}`;

  return {
    start: startMonday,
    end: endSunday,
    year,
    weekNumber,
    weekStr,
  };
}

/**
 * Format timestamp in account's designated timezone.
 */
export function formatInAccountTimezone(
  date: Date | string | null | undefined,
  timezone = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

