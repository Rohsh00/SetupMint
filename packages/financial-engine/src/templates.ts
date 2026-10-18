import { Decimal } from 'decimal.js';
import {
  AssetClass,
  BUILT_IN_TEMPLATES,
  Direction,
  ITradeTemplate,
  NSE_HOLIDAYS_2026,
  ProvenanceSource,
  TemplateContext,
  TemplatePatch,
} from '@tradevault/shared';

// Configure Decimal precision (30 digits, ROUND_HALF_UP)
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Helper to extract IST (UTC+5:30) date components and date string 'YYYY-MM-DD'.
 */
export function getIstDateComponents(dateInput?: Date | string | null): {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  dateStr: string;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  istHours: number;
  istMinutes: number;
  totalIstMinutes: number;
  utcHours: number;
  utcMinutes: number;
} {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)); // 09:30 IST
    return {
      year: y,
      month: m - 1,
      day: d,
      dateStr: dateInput,
      dayOfWeek: utcDate.getUTCDay(),
      istHours: 9,
      istMinutes: 30,
      totalIstMinutes: 570,
      utcHours: 4,
      utcMinutes: 0,
    };
  }

  const d = dateInput
    ? (typeof dateInput === 'string' ? new Date(dateInput) : dateInput)
    : new Date();

  const safeDate = isNaN(d.getTime()) ? new Date() : d;

  // Add 330 minutes to UTC timestamp to compute IST date/time
  const istTimeMs = safeDate.getTime() + 330 * 60 * 1000;
  const istDate = new Date(istTimeMs);

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate();
  const dayOfWeek = istDate.getUTCDay();
  const istHours = istDate.getUTCHours();
  const istMinutes = istDate.getUTCMinutes();
  const totalIstMinutes = istHours * 60 + istMinutes;

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    dateStr,
    dayOfWeek,
    istHours,
    istMinutes,
    totalIstMinutes,
    utcHours: safeDate.getUTCHours(),
    utcMinutes: safeDate.getUTCMinutes(),
  };
}

/**
 * Checks if the given date is an NSE Monthly F&O Expiry Day.
 *
 * Domain Rules (Verified Oct 2026):
 * - Monthly F&O expiry for all NSE index and stock F&O contracts is the LAST TUESDAY of the month.
 * - If the last Tuesday is a weekend or an official NSE trading holiday, the expiry moves backward
 *   to the immediately preceding trading day (e.g. Monday). Consecutive holidays shift further back.
 */
export function isNseMonthlyExpiry(
  dateInput: Date | string,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): boolean {
  const parsed = getIstDateComponents(dateInput);
  const { year, month } = parsed;

  // Find the last day of the month in IST
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Find the last Tuesday of this month
  let candidateDay = lastDayOfMonth;
  while (new Date(Date.UTC(year, month, candidateDay)).getUTCDay() !== 2) {
    candidateDay--;
  }

  // Check for holidays or weekends and shift backward
  let cur = new Date(Date.UTC(year, month, candidateDay));
  while (true) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth();
    const d = cur.getUTCDate();
    const curStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = cur.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(curStr);

    if (!isWeekend && !isHoliday) {
      return curStr === parsed.dateStr;
    }
    // Shift backward by 1 calendar day
    cur = new Date(cur.getTime() - 24 * 60 * 60 * 1000);
  }
}

/**
 * Checks if the given date is a NIFTY 50 Weekly Options Expiry Day.
 *
 * Domain Rules (Verified Oct 2026):
 * - ONLY Nifty 50 has weekly index options on NSE, expiring every TUESDAY.
 * - Bank Nifty, FinNifty, Midcap Select, Nifty Next 50 are MONTHLY only.
 * - If any weekly Tuesday falls on an NSE holiday or weekend, expiry moves backward to the previous trading day.
 * - The monthly expiry Tuesday is also a valid weekly expiry for Nifty.
 */
export function isNiftyWeeklyExpiry(
  dateInput: Date | string,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): boolean {
  const parsed = getIstDateComponents(dateInput);
  const { year, month } = parsed;

  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Inspect each Tuesday of the month
  for (let d = 1; d <= lastDayOfMonth; d++) {
    const checkDate = new Date(Date.UTC(year, month, d));
    if (checkDate.getUTCDay() === 2) {
      // Shift backward if this Tuesday is a holiday
      let cur = checkDate;
      while (true) {
        const y = cur.getUTCFullYear();
        const m = cur.getUTCMonth();
        const dayNum = cur.getUTCDate();
        const curStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const dayOfWeek = cur.getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidays.includes(curStr);

        if (!isWeekend && !isHoliday) {
          if (curStr === parsed.dateStr) {
            return true;
          }
          break;
        }
        cur = new Date(cur.getTime() - 24 * 60 * 60 * 1000);
      }
    }
  }

  return false;
}

/**
 * Evaluates whether the given symbol on the specified date is on an active expiry day.
 * - Nifty 50: true on weekly Tuesdays (or shifted holiday dates) and monthly expiry.
 * - Other NSE instruments (Bank Nifty, Stocks, etc.): true ONLY on monthly expiry day.
 * - Non-NSE / Global symbols (Forex, Crypto): returns false.
 */
export function isExpiryDay(
  symbol: string | undefined,
  dateInput: Date | string,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): boolean {
  if (!symbol) return false;
  const sym = symbol.toUpperCase().trim();

  // Strict check: only NIFTY 50 has weekly expiry.
  // Symbols like BANKNIFTY, FINNIFTY, MIDCPNIFTY are monthly only.
  const isNifty50 =
    sym === 'NIFTY' ||
    sym === 'NIFTY50' ||
    sym === 'NIFTY 50' ||
    (sym.startsWith('NIFTY') && !sym.includes('BANK') && !sym.includes('FIN') && !sym.includes('MID') && !sym.includes('NEXT'));

  if (isNifty50) {
    return isNiftyWeeklyExpiry(dateInput, holidays) || isNseMonthlyExpiry(dateInput, holidays);
  }

  // Other Indian F&O contracts expire strictly monthly
  return isNseMonthlyExpiry(dateInput, holidays);
}

/**
 * Rounds a price to the instrument's tick size using Decimal.js.
 */
export function roundToTick(price: Decimal, tickSize: number | Decimal = 0.05): Decimal {
  const tick = new Decimal(tickSize);
  if (tick.lte(0)) return price;
  return price.dividedBy(tick).round().times(tick);
}

/**
 * Filters the template collection by instrument AssetClass.
 */
export function templatesForAssetClass(
  assetClass: AssetClass,
  templates: ITradeTemplate[] = BUILT_IN_TEMPLATES
): ITradeTemplate[] {
  return templates.filter((t) => t.markets.includes(assetClass));
}

/**
 * Scores and ranks templates dynamically for the selected instrument context.
 *
 * Scoring factors:
 * 1. Filter: template.markets MUST include ctx.assetClass. Never show templates from another market.
 * 2. Expiry Day: templates with expiryDayOnly=true are hidden off expiry days (-100 penalty / filtered out).
 * 3. Time Window match (+30): entryTime (IST) falls within template.timeWindow.
 * 4. Expiry-day fit (+30): trade is on expiry day and template specializes in expiry scalp.
 * 5. Favourite (+25): template is marked as favourite.
 * 6. Usage count (+0 to +20, capped): based on historical usage frequency.
 * 7. Market-specific over generic (+5): dedicated market group over universal PRICE_ACTION.
 */
export function rankTemplates(
  templates: ITradeTemplate[],
  ctx: TemplateContext,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): ITradeTemplate[] {
  const assetClass = ctx.assetClass;
  const ist = getIstDateComponents(ctx.entryTime);
  const activeExpiry = isExpiryDay(ctx.symbol, ctx.entryTime || new Date(), holidays);
  const isGenericMonthlyExpiry = isNseMonthlyExpiry(ctx.entryTime || new Date(), holidays);
  const isAnyExpiry = activeExpiry || isGenericMonthlyExpiry;

  // 1. Filter by market asset class
  const marketFiltered = assetClass
    ? templates.filter((t) => t.markets.includes(assetClass))
    : templates;

  // 2. Score templates
  const scored = marketFiltered
    .map((template) => {
      let score = 0;

      // Expiry-day rule: if expiryDayOnly is true and today is NOT expiry day, exclude/penalize heavily
      if (template.expiryDayOnly) {
        if (!isAnyExpiry) {
          // Off-expiry: penalty of -100 to hide completely
          return { template, score: -100 };
        }
        score += 30; // Expiry-day boost on an active expiry day
      }

      // Time window match (+30 in IST)
      if (template.timeWindow) {
        const currentIstStr = `${String(ist.istHours).padStart(2, '0')}:${String(ist.istMinutes).padStart(2, '0')}`;
        if (
          currentIstStr >= template.timeWindow.start &&
          currentIstStr <= template.timeWindow.end
        ) {
          score += 30;
        }
      }

      // Favourite (+25)
      if (template.isFavorite || ctx.isFavorite) {
        score += 25;
      }

      // Usage count (capped at +20)
      const usage = template.usageCount ?? ctx.usageCount ?? 0;
      score += Math.min(20, Math.max(0, usage));

      // Market-specific over generic (+5)
      if (template.group !== 'PRICE_ACTION') {
        score += 5;
      }

      return { template, score };
    })
    // Hide templates with negative score (e.g. expiryDayOnly off expiry days)
    .filter((item) => item.score >= 0);

  // Sort descending by score, tiebreak by usage count and template name
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aUsage = a.template.usageCount || 0;
    const bUsage = b.template.usageCount || 0;
    if (bUsage !== aUsage) return bUsage - aUsage;
    return a.template.name.localeCompare(b.template.name);
  });

  return scored.map((item) => item.template);
}

/**
 * Resolves a trade template against active instrument and form context.
 *
 * Prefills:
 * - tradeTitle with {SYMBOL} and {DIR} token substitution.
 * - tags: combines template tags and automated contextual tags (session, market timing, expiry).
 * - strategyName, confluences, checklist, direction.
 * - initialStopLoss and plannedTarget: calculated with Decimal.js when entryPrice > 0, direction is known,
 *   and slRule is not MANUAL. Round to instrument tickSize. Skip if SL <= 0.
 * - provenance map for origin chips ('TEMPLATE' | 'RULE' | 'AUTO').
 */
export function resolveTemplate(
  template: ITradeTemplate,
  ctx: TemplateContext,
  holidays: readonly string[] = NSE_HOLIDAYS_2026
): TemplatePatch {
  const provenance: Record<string, ProvenanceSource> = {};

  // 1. Resolve Direction
  let resolvedDirection: Direction | undefined = template.direction;
  if (!resolvedDirection && ctx.direction) {
    resolvedDirection = ctx.direction;
  }
  if (template.direction) {
    provenance['direction'] = 'TEMPLATE';
  }

  // 2. Resolve Trade Title with Tokens
  const symToken = (ctx.symbol || '').toUpperCase().trim();
  const dirToken = resolvedDirection
    ? resolvedDirection === 'LONG'
      ? 'Long'
      : 'Short'
    : '';

  let title = template.titlePattern
    .replace('{SYMBOL}', symToken)
    .replace('{DIR}', dirToken);

  // Collapse multiple consecutive spaces and trim
  title = title.replace(/\s+/g, ' ').trim();

  // Append #2, #3 for same-day repeats
  if (ctx.sameDayTradeCount && ctx.sameDayTradeCount >= 1) {
    title = `${title} #${ctx.sameDayTradeCount + 1}`;
  } else if (ctx.existingTitlesToday && ctx.existingTitlesToday.length > 0) {
    const baseTitle = title;
    const matchingCount = ctx.existingTitlesToday.filter(
      (t: string) => t === baseTitle || t.startsWith(`${baseTitle} #`)
    ).length;
    if (matchingCount >= 1) {
      title = `${baseTitle} #${matchingCount + 1}`;
    }
  }

  provenance['tradeTitle'] = 'TEMPLATE';

  // 3. Resolve Tags (Template tags + Contextual Tags)
  const templateTags = template.tags ? [...template.tags] : [];
  templateTags.forEach((tag) => {
    provenance[`tag:${tag}`] = 'TEMPLATE';
  });

  const contextualTags: string[] = [];

  // Asset class tag
  if (ctx.assetClass) {
    contextualTags.push(ctx.assetClass.toUpperCase());
  }

  const ist = getIstDateComponents(ctx.entryTime);
  const nseAssetClasses: AssetClass[] = ['EQUITY', 'FUTURES', 'OPTIONS', 'INDEX'];
  const isNseMarket = ctx.assetClass && nseAssetClasses.includes(ctx.assetClass);

  if (isNseMarket) {
    // NSE Market Timing Tags:
    // OPENING_30MIN: 09:15 to 09:45 IST (555 to 585 total minutes)
    if (ist.totalIstMinutes >= 555 && ist.totalIstMinutes <= 585) {
      contextualTags.push('OPENING_30MIN');
    }
    // MIDDAY: 11:30 to 13:30 IST (690 to 810 total minutes)
    if (ist.totalIstMinutes >= 690 && ist.totalIstMinutes <= 810) {
      contextualTags.push('MIDDAY');
    }
    // POWER_HOUR: 14:30 to 15:30 IST (870 to 930 total minutes)
    if (ist.totalIstMinutes >= 870 && ist.totalIstMinutes <= 930) {
      contextualTags.push('POWER_HOUR');
    }

    // Expiry Day tags
    const activeExpiry = isExpiryDay(ctx.symbol, ctx.entryTime || new Date(), holidays);
    if (activeExpiry) {
      contextualTags.push('EXPIRY_DAY');
    }
    if (isNseMonthlyExpiry(ctx.entryTime || new Date(), holidays)) {
      contextualTags.push('MONTHLY_EXPIRY');
    }
  }

  // MCX Commodities evening session tag
  if (ctx.assetClass === 'COMMODITY' && ist.totalIstMinutes >= 1020) {
    // 17:00 IST onwards
    contextualTags.push('EVENING_SESSION');
  }

  // Forex, Crypto, Commodity Global UTC session tags
  // Note: Approximated by UTC hour, Daylight Saving Time (DST) shifts ignored for consistent journaling.
  const globalClasses: AssetClass[] = ['FOREX', 'CRYPTO', 'COMMODITY'];
  if (ctx.assetClass && globalClasses.includes(ctx.assetClass)) {
    const utcHour = ist.utcHours;
    if (utcHour >= 0 && utcHour < 9) {
      contextualTags.push('ASIA_SESSION');
    }
    if (utcHour >= 8 && utcHour < 17) {
      contextualTags.push('LONDON_SESSION');
    }
    if (utcHour >= 13 && utcHour < 16) {
      contextualTags.push('LONDON_NY_OVERLAP');
    }
    if (utcHour >= 13 && utcHour < 22) {
      contextualTags.push('NY_SESSION');
    }
  }

  contextualTags.forEach((tag) => {
    provenance[`tag:${tag}`] = 'AUTO';
  });

  const mergedTags = Array.from(new Set([...templateTags, ...contextualTags]));

  // 4. Resolve Strategy & Confluences & Checklist
  if (template.strategyName) {
    provenance['strategyName'] = 'TEMPLATE';
  }
  if (template.confluences && template.confluences.length > 0) {
    provenance['confluences'] = 'TEMPLATE';
  }
  if (template.checklist && template.checklist.length > 0) {
    provenance['checklist'] = 'TEMPLATE';
  }

  // 5. Resolve Risk & Stop Loss / Target
  const riskPatch: {
    plannedRewardRiskRatio?: number;
    initialStopLoss?: number;
    plannedTarget?: number;
    slHint?: string;
  } = {};

  if (template.minRR) {
    riskPatch.plannedRewardRiskRatio = template.minRR;
    provenance['risk.plannedRewardRiskRatio'] = 'TEMPLATE';
  }

  const { slRule } = template;
  if (slRule.type === 'MANUAL') {
    riskPatch.slHint = slRule.manualHint || 'Structure-based stop loss required';
    provenance['risk.slHint'] = 'RULE';
  } else if (
    ctx.entryPrice &&
    ctx.entryPrice > 0 &&
    resolvedDirection &&
    slRule.value !== undefined
  ) {
    const entry = new Decimal(ctx.entryPrice);
    const tick = new Decimal(ctx.tickSize || 0.05);
    const rr = new Decimal(template.minRR || 2.0);
    let dist = new Decimal(0);

    if (slRule.type === 'PERCENT' || slRule.type === 'PREMIUM_PERCENT') {
      dist = entry.times(slRule.value).dividedBy(100);
    } else if (slRule.type === 'POINTS') {
      dist = new Decimal(slRule.value);
    }

    if (dist.gt(0)) {
      let rawSL: Decimal;
      let rawTarget: Decimal;

      if (resolvedDirection === 'LONG') {
        rawSL = entry.minus(dist);
        rawTarget = entry.plus(dist.times(rr));
      } else {
        rawSL = entry.plus(dist);
        rawTarget = entry.minus(dist.times(rr));
      }

      const roundedSL = roundToTick(rawSL, tick);
      const roundedTarget = roundToTick(rawTarget, tick);

      // Skip if stop loss is less than or equal to zero
      if (roundedSL.gt(0)) {
        riskPatch.initialStopLoss = roundedSL.toNumber();
        riskPatch.plannedTarget = roundedTarget.toNumber();
        provenance['risk.initialStopLoss'] = 'RULE';
        provenance['risk.plannedTarget'] = 'RULE';
      }
    }
  }

  // 6. Session
  let patchSession = template.session;
  if (patchSession) {
    provenance['session'] = 'TEMPLATE';
  }

  return {
    tradeTitle: title,
    direction: template.direction,
    strategyName: template.strategyName,
    tags: mergedTags,
    confluences: template.confluences ? [...template.confluences] : undefined,
    checklist: template.checklist ? [...template.checklist] : undefined,
    session: patchSession,
    risk: riskPatch,
    provenance,
  };
}
