export interface IEconomicCalendarEvent {
  id: string;
  title: string;
  country: string;
  impact: 'HIGH' | 'MEDIUM';
  isGoldMover: boolean;
  timestamp: string;
  istTimeStr: string;
  countdownStr: string;
  minutesUntil: number;
  forecast: string;
  previous: string;
  status: 'BLACKOUT_NOW' | 'IMMINENT' | 'TODAY' | 'UPCOMING' | 'JUST_RELEASED';
}

export interface IEconomicCalendarOverview {
  source: 'FOREX_FACTORY_LIVE' | 'SCHEDULE_FALLBACK';
  fetchedAt: string;
  activeAlert: {
    level: 'BLACKOUT' | 'IMMINENT' | 'TODAY' | 'CLEAR';
    headline: string;
    subtext: string;
    eventTitle?: string;
    minutesUntil?: number;
  };
  upcomingEvents: IEconomicCalendarEvent[];
}

interface RawForexFactoryEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

const GOLD_MOVER_KEYWORDS = [
  'cpi',
  'non-farm',
  'nfp',
  'unemployment',
  'fomc',
  'federal funds',
  'powell',
  'ism',
  'jolts',
  'pce',
  'gdp',
  'retail sales',
  'adp',
  'ppi',
  'consumer sentiment',
  'inflation',
  'payrolls',
  'hourly earnings',
  'treasury',
  'election',
];

let cachedRawEvents: RawForexFactoryEvent[] | null = null;
let lastFetchedMs = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function isGoldMoverEvent(title: string, country: string, impact: string): boolean {
  if (country !== 'USD') return impact === 'High';
  if (impact === 'High') return true;
  const lower = title.toLowerCase();
  return GOLD_MOVER_KEYWORDS.some((kw) => lower.includes(kw));
}

function formatIstDateTime(eventDate: Date, now: Date): string {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const istEvent = new Date(eventDate.getTime() + istOffsetMs);
  const istNow = new Date(now.getTime() + istOffsetMs);

  const isSameDay =
    istEvent.getUTCFullYear() === istNow.getUTCFullYear() &&
    istEvent.getUTCMonth() === istNow.getUTCMonth() &&
    istEvent.getUTCDate() === istNow.getUTCDate();

  const tomorrow = new Date(istNow.getTime() + 24 * 3600 * 1000);
  const isTomorrow =
    istEvent.getUTCFullYear() === tomorrow.getUTCFullYear() &&
    istEvent.getUTCMonth() === tomorrow.getUTCMonth() &&
    istEvent.getUTCDate() === tomorrow.getUTCDate();

  const hh = String(istEvent.getUTCHours()).padStart(2, '0');
  const mm = String(istEvent.getUTCMinutes()).padStart(2, '0');

  if (isSameDay) {
    return `Today ${hh}:${mm} IST`;
  }
  if (isTomorrow) {
    return `Tomorrow ${hh}:${mm} IST`;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[istEvent.getUTCDay()];
  const monthName = months[istEvent.getUTCMonth()];
  const dateNum = istEvent.getUTCDate();
  return `${dayName}, ${monthName} ${dateNum} • ${hh}:${mm} IST`;
}

function formatCountdown(minutesUntil: number): string {
  if (minutesUntil >= -5 && minutesUntil <= 5) {
    return 'LIVE NOW (±5m Blackout)';
  }
  if (minutesUntil < -5) {
    return `${Math.abs(minutesUntil)}m ago`;
  }
  if (minutesUntil < 60) {
    return `in ${minutesUntil}m`;
  }
  const hrs = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  if (hrs < 24) {
    return mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`;
  }
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `in ${days}d ${remHrs}h` : `in ${days}d`;
}

function buildFallbackRawEvents(now: Date): RawForexFactoryEvent[] {
  // Generate realistic upcoming US macro windows for the current week (13:30 UTC / 15:00 UTC)
  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth();
  const baseDate = now.getUTCDate();

  const events: RawForexFactoryEvent[] = [];
  for (let offset = 0; offset <= 5; offset++) {
    const d1 = new Date(Date.UTC(baseYear, baseMonth, baseDate + offset, 13, 30, 0));
    const dow = d1.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    if (dow === 4) {
      events.push({
        title: 'Unemployment Claims',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '215K',
        previous: '212K',
      });
    } else if (dow === 5) {
      events.push({
        title: 'Non-Farm Employment Change (NFP)',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '160K',
        previous: '145K',
      });
    } else {
      events.push({
        title: 'US Core Macro Release (8:30 AM EST)',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '',
        previous: '',
      });
    }

    const d2 = new Date(Date.UTC(baseYear, baseMonth, baseDate + offset, 15, 0, 0));
    events.push({
      title: 'ISM PMI / Consumer Sentiment (10:00 AM EST)',
      country: 'USD',
      date: d2.toISOString(),
      impact: 'Medium',
      forecast: '54.8',
      previous: '54.9',
    });
  }
  return events;
}

export class EconomicCalendarService {
  static async getCalendarOverview(now: Date = new Date()): Promise<IEconomicCalendarOverview> {
    let rawEvents = cachedRawEvents;
    let source: 'FOREX_FACTORY_LIVE' | 'SCHEDULE_FALLBACK' = 'FOREX_FACTORY_LIVE';

    if (!rawEvents || Date.now() - lastFetchedMs > CACHE_TTL_MS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SetupMint/1.0',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const parsed = (await res.json()) as RawForexFactoryEvent[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            cachedRawEvents = parsed;
            lastFetchedMs = Date.now();
            rawEvents = parsed;
          }
        }
      } catch {
        // Fallback to cached or schedule fallback
      }
    }

    if (!rawEvents || rawEvents.length === 0) {
      rawEvents = buildFallbackRawEvents(now);
      source = 'SCHEDULE_FALLBACK';
    }

    const nowMs = now.getTime();
    const relevant: IEconomicCalendarEvent[] = [];

    for (let i = 0; i < rawEvents.length; i++) {
      const ev = rawEvents[i];
      if (!ev || !ev.date || !ev.title) continue;
      if (ev.country !== 'USD') continue;
      if (ev.impact !== 'High' && ev.impact !== 'Medium') continue;

      const goldMover = isGoldMoverEvent(ev.title, ev.country, ev.impact);
      if (ev.impact === 'Medium' && !goldMover) continue;

      const evDate = new Date(ev.date);
      if (Number.isNaN(evDate.getTime())) continue;

      const minutesUntil = Math.round((evDate.getTime() - nowMs) / 60000);
      // Keep events from 20 minutes ago up to 7 days ahead
      if (minutesUntil < -20) continue;

      const istTimeStr = formatIstDateTime(evDate, now);
      const isToday = istTimeStr.startsWith('Today');

      let status: IEconomicCalendarEvent['status'] = 'UPCOMING';
      if (minutesUntil >= -5 && minutesUntil <= 5) {
        status = 'BLACKOUT_NOW';
      } else if (minutesUntil < -5) {
        status = 'JUST_RELEASED';
      } else if (minutesUntil <= 45) {
        status = 'IMMINENT';
      } else if (isToday) {
        status = 'TODAY';
      }

      relevant.push({
        id: `${ev.country}_${evDate.getTime()}_${i}`,
        title: ev.title,
        country: ev.country,
        impact: ev.impact === 'High' || goldMover ? 'HIGH' : 'MEDIUM',
        isGoldMover: goldMover,
        timestamp: evDate.toISOString(),
        istTimeStr,
        countdownStr: formatCountdown(minutesUntil),
        minutesUntil,
        forecast: ev.forecast || '—',
        previous: ev.previous || '—',
        status,
      });
    }

    relevant.sort((a, b) => a.minutesUntil - b.minutesUntil);
    const upcomingEvents = relevant.slice(0, 6);

    const blackoutEv = upcomingEvents.find((e) => e.status === 'BLACKOUT_NOW');
    const imminentEv = upcomingEvents.find((e) => e.status === 'IMMINENT');
    const todayEv = upcomingEvents.find((e) => e.status === 'TODAY');
    const nextEv = upcomingEvents.find((e) => e.minutesUntil > 0);

    let activeAlert: IEconomicCalendarOverview['activeAlert'];
    if (blackoutEv) {
      activeAlert = {
        level: 'BLACKOUT',
        headline: `🚨 RED-FOLDER USD BLACKOUT: ${blackoutEv.title}`,
        subtext: `Avoid opening/closing market orders within ±5 mins (${blackoutEv.istTimeStr}) • Forecast: ${blackoutEv.forecast} (Prev: ${blackoutEv.previous})`,
        eventTitle: blackoutEv.title,
        minutesUntil: blackoutEv.minutesUntil,
      };
    } else if (imminentEv) {
      activeAlert = {
        level: 'IMMINENT',
        headline: `⚠️ Upcoming USD Catalyst ${imminentEv.countdownStr}: ${imminentEv.title}`,
        subtext: `${imminentEv.istTimeStr} • Tighten XAUUSD stops or lock BE before release (Forecast: ${imminentEv.forecast}, Prev: ${imminentEv.previous})`,
        eventTitle: imminentEv.title,
        minutesUntil: imminentEv.minutesUntil,
      };
    } else if (todayEv) {
      activeAlert = {
        level: 'TODAY',
        headline: `📅 Today's USD Gold Catalyst: ${todayEv.title} (${todayEv.countdownStr})`,
        subtext: `${todayEv.istTimeStr} • Forecast: ${todayEv.forecast} (Prev: ${todayEv.previous})`,
        eventTitle: todayEv.title,
        minutesUntil: todayEv.minutesUntil,
      };
    } else if (nextEv) {
      activeAlert = {
        level: 'CLEAR',
        headline: `✅ Clear Trading Window • Next USD Catalyst: ${nextEv.title} (${nextEv.countdownStr})`,
        subtext: `${nextEv.istTimeStr} • Forecast: ${nextEv.forecast} (Prev: ${nextEv.previous})`,
        eventTitle: nextEv.title,
        minutesUntil: nextEv.minutesUntil,
      };
    } else {
      activeAlert = {
        level: 'CLEAR',
        headline: '✅ No High-Impact USD News Imminent',
        subtext: 'Clear technical execution window for XAUUSD / Forex.',
      };
    }

    return {
      source,
      fetchedAt: new Date(lastFetchedMs || Date.now()).toISOString(),
      activeAlert,
      upcomingEvents,
    };
  }
}
