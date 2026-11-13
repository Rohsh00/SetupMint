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
  actual?: string;
  actualNum?: number;
  deviation?: string;
  deviationDirection?: 'BEAT' | 'MISS' | 'IN_LINE';
  actualBiasOutcome?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  actualSummaryNote?: string;
  releasedAt?: string;
  status: 'BLACKOUT_NOW' | 'IMMINENT' | 'TODAY' | 'UPCOMING' | 'JUST_RELEASED';
  goldImpactNote?: string;
  goldBias?: 'BULLISH_IF_LOW' | 'BEARISH_IF_HIGH' | 'HIGH_VOLATILITY' | 'NEUTRAL';
  recommendedAction?: string;
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
  goldNewsReminderSettings?: {
    enabled: boolean;
    leadTimesMinutes: number[];
    impactFilter: 'ALL_GOLD_MOVERS' | 'HIGH_IMPACT_ONLY';
  };
}

interface RawForexFactoryEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

export const GOLD_MOVER_KEYWORDS = [
  'cpi',
  'non-farm',
  'nfp',
  'unemployment',
  'fomc',
  'federal funds',
  'interest rate',
  'rate decision',
  'powell',
  'fed chair',
  'fed governor',
  'ism',
  'jolts',
  'pce',
  'gdp',
  'retail sales',
  'adp',
  'ppi',
  'consumer sentiment',
  'michigan',
  'inflation',
  'payrolls',
  'hourly earnings',
  'jobless claims',
  'initial claims',
  'durable goods',
  'consumer confidence',
  'treasury',
  'refunding',
  'jackson hole',
  'beige book',
  'employment change',
  'press conference',
  'election',
];

export function getGoldImpactAnalysis(title: string, impact: string): {
  goldImpactNote: string;
  goldBias: 'BULLISH_IF_LOW' | 'BEARISH_IF_HIGH' | 'HIGH_VOLATILITY' | 'NEUTRAL';
  recommendedAction: string;
} {
  const t = title.toLowerCase();

  if (t.includes('cpi') || t.includes('inflation') || t.includes('pce') || t.includes('ppi')) {
    return {
      goldImpactNote: 'Directly influences Fed interest rate trajectory. Higher inflation/yields strengthen USD, putting sharp downward pressure on non-yielding Gold (XAUUSD). Softer inflation sparks rate-cut rallies in Gold.',
      goldBias: 'BULLISH_IF_LOW',
      recommendedAction: 'Tighten stops or lock Breakeven (BE). Extreme spread widening and slippage expected ±5m around release.',
    };
  }

  if (
    t.includes('fomc') ||
    t.includes('federal funds') ||
    t.includes('powell') ||
    t.includes('rate decision') ||
    t.includes('interest rate') ||
    t.includes('fed chair')
  ) {
    return {
      goldImpactNote: 'Highest-impact fundamental catalyst for Gold. Hawkish statements bolster the Dollar and crush Gold; dovish pauses or rate reductions trigger explosive multi-dollar surges.',
      goldBias: 'HIGH_VOLATILITY',
      recommendedAction: 'Strict caution: Lock Breakeven (BE) or flatten active positions before the statement and press conference.',
    };
  }

  if (
    t.includes('non-farm') ||
    t.includes('nfp') ||
    t.includes('unemployment') ||
    t.includes('payrolls') ||
    t.includes('adp') ||
    t.includes('jobless claims') ||
    t.includes('claims')
  ) {
    return {
      goldImpactNote: 'Premier US labor market metric. High job creation strengthens the Greenback and dampens Gold demand; rising unemployment or cooling payrolls fuel safe-haven and rate cut bids for Gold.',
      goldBias: 'BULLISH_IF_LOW',
      recommendedAction: 'Severe two-way whip-saw risk. Avoid placing naked market orders at release time without adequate margin buffer.',
    };
  }

  if (t.includes('gdp') || t.includes('retail sales') || t.includes('ism') || t.includes('pmi') || t.includes('durable goods')) {
    return {
      goldImpactNote: 'Key gauge of US economic momentum. Strong growth bolsters the US Dollar (bearish for XAUUSD); economic contraction or recession fears drive flight-to-safety into Gold.',
      goldBias: 'BULLISH_IF_LOW',
      recommendedAction: 'Monitor DXY reaction. Align technical setups with post-release order flow momentum.',
    };
  }

  return {
    goldImpactNote:
      impact === 'High' || impact === 'HIGH'
        ? 'High-impact USD catalyst. Highly likely to induce sharp volatility and rapid directional sweeps on XAUUSD.'
        : 'Medium-impact USD data release. Capable of driving liquidity runs on Gold around intraday key levels.',
    goldBias: 'HIGH_VOLATILITY',
    recommendedAction: 'Check open trade stop-loss runway and observe the ±5 minute execution blackout buffer.',
  };
}

let cachedRawEvents: RawForexFactoryEvent[] | null = null;
let lastFetchedMs = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BiquoteCalendarEvent {
  id?: string;
  eventId?: string;
  time?: string;
  countryCode?: string;
  currency?: string;
  name?: string;
  importance?: string;
  actual?: number | null;
  forecast?: number | null;
  previous?: number | null;
  revisedPrevious?: number | null;
  unit?: string;
}

let cachedLiveActuals: BiquoteCalendarEvent[] | null = null;
let lastLiveActualsFetchedMs = 0;
const LIVE_ACTUALS_CACHE_TTL_MS = 25 * 1000; // 25 seconds live poll

export async function fetchLiveUsEconomicActuals(): Promise<BiquoteCalendarEvent[]> {
  if (cachedLiveActuals && Date.now() - lastLiveActualsFetchedMs < LIVE_ACTUALS_CACHE_TTL_MS) {
    return cachedLiveActuals;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://biquote.io/api/calendar?countries=US', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SetupMint/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const parsed = (await res.json()) as BiquoteCalendarEvent[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedLiveActuals = parsed;
        lastLiveActualsFetchedMs = Date.now();
        return parsed;
      }
    }
  } catch {
    // Fail silently, fallback to cached
  }
  return cachedLiveActuals || [];
}

export function matchLiveActualEvent(evTitle: string, evDate: Date, liveEvents: BiquoteCalendarEvent[]): BiquoteCalendarEvent | undefined {
  if (!liveEvents || liveEvents.length === 0) return undefined;
  const cleanTitle = evTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const evTime = evDate.getTime();

  return liveEvents.find((b) => {
    if (!b || !b.name || !b.time) return false;
    const bTime = new Date(b.time).getTime();
    if (Number.isNaN(bTime)) return false;
    // Must be within 4 hours window (handles timezone / daylight savings shifts)
    if (Math.abs(evTime - bTime) > 4 * 3600 * 1000) return false;

    const bClean = b.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    // Match common core keywords
    const keywords = cleanTitle.split(' ').filter((w) => w.length >= 3 && !['and', 'the', 'for', 'index', 'rates', 'rate'].includes(w));
    if (keywords.length === 0) return false;
    return keywords.some((k) => bClean.includes(k));
  });
}

export function evaluateActualGoldImpact(
  title: string,
  actual: number,
  forecastNum?: number,
  previousNum?: number
): {
  deviation: string;
  deviationDirection: 'BEAT' | 'MISS' | 'IN_LINE';
  goldBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summaryNote: string;
} {
  const t = title.toLowerCase();
  const benchmark = forecastNum !== undefined ? forecastNum : previousNum;

  let deviation = '—';
  let deviationDirection: 'BEAT' | 'MISS' | 'IN_LINE' = 'IN_LINE';
  let diff = 0;

  if (benchmark !== undefined && Number.isFinite(benchmark)) {
    diff = Number((actual - benchmark).toFixed(2));
    const prefix = diff > 0 ? '+' : '';
    deviation = `${prefix}${diff}`;
    if (Math.abs(diff) < 0.001) {
      deviationDirection = 'IN_LINE';
    } else if (diff > 0) {
      deviationDirection = 'BEAT';
    } else {
      deviationDirection = 'MISS';
    }
  }

  // 1. Unemployment Rate / Jobless Claims: Higher numbers mean WEAKER labor -> BULLISH for Gold!
  if (t.includes('unemployment') || t.includes('jobless') || t.includes('claims')) {
    if (deviationDirection === 'BEAT') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BULLISH',
        summaryNote: `Rising claims/unemployment (${actual} vs exp ${benchmark}) signals labor cooling, boosting Fed rate-cut expectations and driving safe-haven bids for Gold.`,
      };
    } else if (deviationDirection === 'MISS') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BEARISH',
        summaryNote: `Low claims/unemployment (${actual} vs exp ${benchmark}) reflects a tight US labor market, strengthening the US Dollar and pressuring Gold downward.`,
      };
    } else {
      return {
        deviation,
        deviationDirection,
        goldBias: 'NEUTRAL',
        summaryNote: `Claims in-line with consensus (${actual}). Directional follow-through depends on underlying technical structure.`,
      };
    }
  }

  // 2. Inflation Metrics (CPI, PPI, PCE, Hourly Earnings)
  if (t.includes('cpi') || t.includes('ppi') || t.includes('pce') || t.includes('inflation') || t.includes('earnings')) {
    if (deviationDirection === 'BEAT') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BEARISH',
        summaryNote: `Hotter inflation (${actual} vs exp ${benchmark}) bolsters US Dollar yields and delays Fed rate cuts, creating sharp headwinds for Gold.`,
      };
    } else if (deviationDirection === 'MISS') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BULLISH',
        summaryNote: `Softer inflation (${actual} vs exp ${benchmark}) cools Treasury yields, triggering rallies in non-yielding Gold (XAUUSD).`,
      };
    } else {
      return {
        deviation,
        deviationDirection,
        goldBias: 'NEUTRAL',
        summaryNote: `Inflation matched estimates (${actual}). Mild initial chop expected with focus shifting to next key macro print.`,
      };
    }
  }

  // 3. Growth & Labor (NFP, ADP, GDP, Retail Sales, ISM PMI)
  if (
    t.includes('non-farm') ||
    t.includes('nfp') ||
    t.includes('payrolls') ||
    t.includes('gdp') ||
    t.includes('retail sales') ||
    t.includes('ism') ||
    t.includes('pmi')
  ) {
    if (deviationDirection === 'BEAT') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BEARISH',
        summaryNote: `Stronger economic output (${actual} vs exp ${benchmark}) strengthens the Greenback, dampening Gold's immediate upside momentum.`,
      };
    } else if (deviationDirection === 'MISS') {
      return {
        deviation,
        deviationDirection,
        goldBias: 'BULLISH',
        summaryNote: `Weaker economic momentum (${actual} vs exp ${benchmark}) boosts safe-haven and rate-cut sentiment, supporting Gold upside.`,
      };
    } else {
      return {
        deviation,
        deviationDirection,
        goldBias: 'NEUTRAL',
        summaryNote: `Data in-line with forecasts (${actual}). Watch post-release order flow and DXY correlation.`,
      };
    }
  }

  // Default fallback
  const isHawkish = deviationDirection === 'BEAT';
  return {
    deviation,
    deviationDirection,
    goldBias: isHawkish ? 'BEARISH' : deviationDirection === 'MISS' ? 'BULLISH' : 'NEUTRAL',
    summaryNote: `US catalyst printed ${actual} (vs ${benchmark}). ${
      isHawkish ? 'Supports US Dollar momentum.' : 'Supports Gold upside momentum.'
    }`,
  };
}

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

    if (dow === 2) {
      events.push({
        title: 'Core CPI m/m & y/y (Consumer Price Index)',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '0.3%',
        previous: '0.3%',
      });
    } else if (dow === 3) {
      events.push({
        title: 'FOMC Rate Decision & Press Conference',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '5.00%',
        previous: '5.25%',
      });
    } else if (dow === 4) {
      events.push({
        title: 'Unemployment Claims & PPI Final Demand',
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
        title: 'US Retail Sales & Core PCE Price Index',
        country: 'USD',
        date: d1.toISOString(),
        impact: 'High',
        forecast: '0.4%',
        previous: '0.1%',
      });
    }

    const d2 = new Date(Date.UTC(baseYear, baseMonth, baseDate + offset, 15, 0, 0));
    events.push({
      title: 'ISM Manufacturing / Services PMI',
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
    const liveActuals = await fetchLiveUsEconomicActuals();

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
      // Keep events from 2 hours ago up to 7 days ahead
      if (minutesUntil < -120) continue;

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

      const goldImpact = getGoldImpactAnalysis(ev.title, ev.impact);

      let actual: string | undefined = undefined;
      let actualNum: number | undefined = undefined;
      let deviation: string | undefined = undefined;
      let deviationDirection: 'BEAT' | 'MISS' | 'IN_LINE' | undefined = undefined;
      let actualBiasOutcome: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | undefined = undefined;
      let actualSummaryNote: string | undefined = undefined;

      const matchedBq = matchLiveActualEvent(ev.title, evDate, liveActuals);
      if (matchedBq && matchedBq.actual !== null && matchedBq.actual !== undefined) {
        actualNum = matchedBq.actual;
        actual = `${matchedBq.actual}${matchedBq.unit === 'percent' ? '%' : ''}`;
        const forecastNum =
          matchedBq.forecast !== null && matchedBq.forecast !== undefined
            ? matchedBq.forecast
            : parseFloat(ev.forecast || '');
        const previousNum =
          matchedBq.previous !== null && matchedBq.previous !== undefined
            ? matchedBq.previous
            : parseFloat(ev.previous || '');
        const evalRes = evaluateActualGoldImpact(
          ev.title,
          actualNum,
          Number.isFinite(forecastNum) ? forecastNum : undefined,
          Number.isFinite(previousNum) ? previousNum : undefined
        );
        deviation = evalRes.deviation;
        deviationDirection = evalRes.deviationDirection;
        actualBiasOutcome = evalRes.goldBias;
        actualSummaryNote = evalRes.summaryNote;
      }

      const resolvedForecast =
        ev.forecast && ev.forecast !== '—'
          ? ev.forecast
          : matchedBq?.forecast !== null && matchedBq?.forecast !== undefined
          ? `${matchedBq.forecast}`
          : '—';
      const resolvedPrevious =
        ev.previous && ev.previous !== '—'
          ? ev.previous
          : matchedBq?.previous !== null && matchedBq?.previous !== undefined
          ? `${matchedBq.previous}`
          : '—';

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
        forecast: resolvedForecast,
        previous: resolvedPrevious,
        actual,
        actualNum,
        deviation,
        deviationDirection,
        actualBiasOutcome,
        actualSummaryNote,
        releasedAt: actual ? evDate.toISOString() : undefined,
        status,
        goldImpactNote: goldImpact.goldImpactNote,
        goldBias: goldImpact.goldBias,
        recommendedAction: goldImpact.recommendedAction,
      });
    }

    relevant.sort((a, b) => a.minutesUntil - b.minutesUntil);
    const upcomingEvents = relevant.slice(0, 10);

    const blackoutEv = upcomingEvents.find((e) => e.status === 'BLACKOUT_NOW');
    const imminentEv = upcomingEvents.find((e) => e.status === 'IMMINENT');
    const todayEv = upcomingEvents.find((e) => e.status === 'TODAY');
    const nextEv = upcomingEvents.find((e) => e.minutesUntil > 0);
    const justReleasedEv = upcomingEvents.find(
      (e) => e.status === 'JUST_RELEASED' && e.actual && e.minutesUntil >= -25
    );

    let activeAlert: IEconomicCalendarOverview['activeAlert'];
    if (justReleasedEv) {
      const biasBadge =
        justReleasedEv.actualBiasOutcome === 'BULLISH'
          ? '🟢 Bullish for Gold'
          : justReleasedEv.actualBiasOutcome === 'BEARISH'
          ? '🔴 Bearish for Gold'
          : '⚪ Neutral';
      activeAlert = {
        level: 'CLEAR',
        headline: `⚡ NEWS FLASH: ${justReleasedEv.title} • Actual ${justReleasedEv.actual} (${biasBadge})`,
        subtext: `Fcst: ${justReleasedEv.forecast} • Prev: ${justReleasedEv.previous} • ${justReleasedEv.actualSummaryNote || ''}`,
        eventTitle: justReleasedEv.title,
        minutesUntil: justReleasedEv.minutesUntil,
      };
    } else if (blackoutEv) {
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

  /**
   * Retrieves all upcoming Gold-moving news events sorted chronologically.
   * Includes recently released catalysts (down to -60m) so actual results can be audited and alerted on.
   */
  static async getUpcomingGoldNews(now: Date = new Date(), hoursAhead: number = 72): Promise<IEconomicCalendarEvent[]> {
    const overview = await this.getCalendarOverview(now);
    const maxMinutes = hoursAhead * 60;
    return overview.upcomingEvents.filter(
      (e) => e.isGoldMover && e.minutesUntil >= -60 && e.minutesUntil <= maxMinutes
    );
  }

  /**
   * Formats a Telegram alert card for a Gold (XAUUSD) catalyst reminder.
   */
  static formatGoldNewsTelegramAlert(
    event: IEconomicCalendarEvent,
    leadTimeMinutes: number
  ): { text: string; buttons: any[][] } {
    const isImminent = leadTimeMinutes <= 5;
    const urgencyEmoji = isImminent ? '🚨' : leadTimeMinutes <= 15 ? '⚠️' : '⏰';
    const impactEmoji = event.impact === 'HIGH' ? '🔴 HIGH (Red-Folder)' : '🟠 MEDIUM (Orange-Folder)';

    const timeTitle = isImminent
      ? `<b>LIVE BLACKOUT WINDOW (Releases in ${leadTimeMinutes} mins)</b>`
      : `<b>Releases in ${leadTimeMinutes} mins</b> (${event.istTimeStr})`;

    const text =
      `${urgencyEmoji} <b>GOLD (XAUUSD) CATALYST ALERT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ ${timeTitle}\n\n` +
      `📊 <b>Event:</b> ${event.title}\n` +
      `🌍 <b>Currency:</b> ${event.country} | <b>Impact:</b> ${impactEmoji}\n` +
      `📈 <b>Forecast:</b> <code>${event.forecast}</code> | <b>Previous:</b> <code>${event.previous}</code>\n\n` +
      `💡 <b>XAUUSD Market Impact:</b>\n` +
      `${event.goldImpactNote || 'High volatility expected on Gold (XAUUSD). Watch USD reactions.'}\n\n` +
      `🛡️ <b>Trading Safety Guidance:</b>\n` +
      `${event.recommendedAction || 'Consider locking Breakeven (BE) or tightening stops on open positions.'}\n` +
      `<i>Prop Challenge rule guard: Observe ±5m news blackout.</i>`;

    const buttons = [
      [
        { text: '📈 Live XAUUSD Chart', callback_data: 'chart_xauusd' },
        { text: '📋 Open Trades', callback_data: 'show_trades' },
      ],
      [
        { text: '🔕 Mute News (1h)', callback_data: 'snooze_news_60' },
        { text: '✅ Acknowledged', callback_data: 'ack_news' },
      ],
    ];

    return { text, buttons };
  }

  /**
   * Formats a Telegram alert card for a post-release actual economic news flash.
   */
  static formatGoldNewsResultTelegramAlert(
    event: IEconomicCalendarEvent,
    liveGoldPrice?: number | string,
    openTrades?: any[]
  ): { text: string; buttons: any[][] } {
    const biasEmoji =
      event.actualBiasOutcome === 'BULLISH' ? '🟢' : event.actualBiasOutcome === 'BEARISH' ? '🔴' : '⚪';
    const biasTitle =
      event.actualBiasOutcome === 'BULLISH'
        ? 'BULLISH FOR GOLD'
        : event.actualBiasOutcome === 'BEARISH'
        ? 'BEARISH FOR GOLD'
        : 'NEUTRAL / IN-LINE';
    const usdTitle =
      event.actualBiasOutcome === 'BULLISH'
        ? 'BEARISH (DXY Drop)'
        : event.actualBiasOutcome === 'BEARISH'
        ? 'BULLISH (DXY Rally)'
        : 'NEUTRAL';

    let text =
      `⚡ <b>US ECONOMIC DATA FLASH: ${event.title}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ <b>Released:</b> ${event.istTimeStr}\n\n` +
      `📊 <b>FIGURES BREAKDOWN:</b>\n` +
      `• 🎯 <b>Actual:</b>   <code>${event.actual || '—'}</code>\n` +
      `• 🔮 <b>Forecast:</b> <code>${event.forecast}</code>\n` +
      `• 📜 <b>Previous:</b> <code>${event.previous}</code>\n`;

    if (event.deviation && event.deviation !== '—') {
      const devBadge =
        event.deviationDirection === 'BEAT'
          ? '🔥 BEAT (Above Exp)'
          : event.deviationDirection === 'MISS'
          ? '❄️ MISS (Below Exp)'
          : '🎯 IN-LINE';
      text += `• 📈 <b>Variance:</b> <code>${event.deviation}</code> (${devBadge})\n\n`;
    } else {
      text += `\n`;
    }

    text +=
      `${biasEmoji} <b>Gold (XAUUSD) Bias:</b> <b>${biasTitle}</b>\n` +
      `💵 <b>USD Impact:</b> <b>${usdTitle}</b>\n` +
      `💡 <i>${event.actualSummaryNote || event.goldImpactNote || 'Monitor live reaction.'}</i>\n\n`;

    const numericGoldPrice = typeof liveGoldPrice === 'string' ? parseFloat(liveGoldPrice) : liveGoldPrice;
    if (Number.isFinite(numericGoldPrice) && numericGoldPrice! > 0) {
      text += `📈 <b>XAUUSD Live LTP:</b> <code>$${numericGoldPrice!.toFixed(2)}</code>\n\n`;
    }

    if (openTrades && openTrades.length > 0) {
      const primaryTrade = openTrades[0];
      const dir = primaryTrade.direction || 'LONG';
      const qty = primaryTrade.calculated?.openQuantity || primaryTrade.simpleExecution?.quantity || 0.01;
      const netPnl = primaryTrade.calculated?.netPnL || 0;
      const pnlSign = netPnl >= 0 ? '+' : '';
      text +=
        `⚠️ <b>YOUR OPEN EXPOSURE:</b>\n` +
        `• <b>XAUUSD ${dir}</b> (${qty} lot) | Net MTM: <b>${pnlSign}$${netPnl.toFixed(2)}</b>\n\n`;
    }

    text +=
      `🛡️ <b>Trading Guidance:</b>\n` +
      `• Allow 1-minute spread volatility and candle wicks to settle.\n` +
      `• Consider trailing Stop Loss to Breakeven (+fees) if holding through news volatility.\n`;

    const buttons = [
      [
        { text: '📈 Live XAUUSD Chart', callback_data: 'chart_xauusd' },
        { text: '📋 Open Positions', callback_data: 'show_trades' },
      ],
      [
        { text: '🛡️ Lock Breakeven (BE)', callback_data: 'lock_be_all' },
        { text: '✅ Acknowledged', callback_data: 'ack_news' },
      ],
    ];

    return { text, buttons };
  }

  static evaluateActualGoldImpact = evaluateActualGoldImpact;
}

