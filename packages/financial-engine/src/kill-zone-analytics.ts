import Decimal from './decimal.js';

export type KillZoneKey =
  | 'LONDON_OPEN'
  | 'NY_OPEN'
  | 'LONDON_CLOSE'
  | 'ASIA_SESSION'
  | 'LONDON_MIDDAY'
  | 'NY_AFTERNOON'
  | 'OFF_HOURS'
  | 'NSE_OPENING'
  | 'NSE_MIDDAY'
  | 'NSE_POWER_HOUR'
  | 'MCX_EVENING';

export interface KillZoneMetadata {
  key: KillZoneKey;
  name: string;
  shortCode: string;
  timing: string;
  description: string;
  isMajorKillZone: boolean;
  marketType: 'FOREX_GLOBAL' | 'INDIAN_EQUITY' | 'COMMODITY' | 'OFF_HOURS';
}

export const KILL_ZONE_DEFINITIONS: Record<KillZoneKey, KillZoneMetadata> = {
  LONDON_OPEN: {
    key: 'LONDON_OPEN',
    name: 'London Open Kill-Zone (LOKZ)',
    shortCode: 'LOKZ',
    timing: '07:00 - 10:00 UTC (12:30 - 15:30 IST)',
    description: 'European session open with massive institutional liquidity, expansion on GBP, EUR, and Gold (XAUUSD).',
    isMajorKillZone: true,
    marketType: 'FOREX_GLOBAL',
  },
  NY_OPEN: {
    key: 'NY_OPEN',
    name: 'New York Open Kill-Zone (NYOKZ)',
    shortCode: 'NYOKZ',
    timing: '12:00 - 15:00 UTC (17:30 - 20:30 IST)',
    description: 'London-NY overlap with peak global liquidity, major US economic releases, and US equity market open.',
    isMajorKillZone: true,
    marketType: 'FOREX_GLOBAL',
  },
  LONDON_CLOSE: {
    key: 'LONDON_CLOSE',
    name: 'London Close Kill-Zone (LCKZ)',
    shortCode: 'LCKZ',
    timing: '15:00 - 17:00 UTC (20:30 - 22:30 IST)',
    description: 'London 4 PM Fix and European market close; institutional position squaring, trend exhaustion or reversal.',
    isMajorKillZone: true,
    marketType: 'FOREX_GLOBAL',
  },
  LONDON_MIDDAY: {
    key: 'LONDON_MIDDAY',
    name: 'London Mid-Day / Pre-NY',
    shortCode: 'LON-MID',
    timing: '10:00 - 12:00 UTC (15:30 - 17:30 IST)',
    description: 'European mid-day lunch lull prior to US morning economic releases; typically consolidating range.',
    isMajorKillZone: false,
    marketType: 'FOREX_GLOBAL',
  },
  ASIA_SESSION: {
    key: 'ASIA_SESSION',
    name: 'Asian Session / Range (ARKZ)',
    shortCode: 'ASIA',
    timing: '00:00 - 07:00 UTC (05:30 - 12:30 IST)',
    description: 'Tokyo and Sydney market sessions; accumulation range, JPY/AUD activity, and initial daily range creation.',
    isMajorKillZone: false,
    marketType: 'FOREX_GLOBAL',
  },
  NY_AFTERNOON: {
    key: 'NY_AFTERNOON',
    name: 'New York Afternoon Drift',
    shortCode: 'NY-AFT',
    timing: '17:00 - 21:00 UTC (22:30 - 02:30 IST)',
    description: 'Late US session after London closure; lower volume drift and pre-settlement rebalancing.',
    isMajorKillZone: false,
    marketType: 'FOREX_GLOBAL',
  },
  OFF_HOURS: {
    key: 'OFF_HOURS',
    name: 'Off-Hours & Rollover Dead Zone',
    shortCode: 'DEAD-ZONE',
    timing: '21:00 - 24:00 UTC & Weekends',
    description: 'Broker rollover hour with wide spreads, thin liquidity, or weekend markets; high slippage risk.',
    isMajorKillZone: false,
    marketType: 'OFF_HOURS',
  },
  NSE_OPENING: {
    key: 'NSE_OPENING',
    name: 'NSE Opening Range Kill-Zone',
    shortCode: 'NSE-OPEN',
    timing: '09:15 - 10:15 IST',
    description: 'Indian equity cash & F&O opening hour with highest volume, initial range breakout, and gap resolution.',
    isMajorKillZone: true,
    marketType: 'INDIAN_EQUITY',
  },
  NSE_MIDDAY: {
    key: 'NSE_MIDDAY',
    name: 'NSE Mid-Day Consolidation',
    shortCode: 'NSE-MID',
    timing: '10:15 - 13:30 IST',
    description: 'Mid-session mean-reversion and option premium decay window across NIFTY and BANKNIFTY.',
    isMajorKillZone: false,
    marketType: 'INDIAN_EQUITY',
  },
  NSE_POWER_HOUR: {
    key: 'NSE_POWER_HOUR',
    name: 'NSE Afternoon Power Hour',
    shortCode: 'NSE-PWR',
    timing: '13:30 - 15:30 IST',
    description: 'Expiry day gamma moves, institutional squaring, and late trend continuation on Indian indices.',
    isMajorKillZone: true,
    marketType: 'INDIAN_EQUITY',
  },
  MCX_EVENING: {
    key: 'MCX_EVENING',
    name: 'MCX Evening Peak Session',
    shortCode: 'MCX-EVE',
    timing: '17:00 - 23:30 IST',
    description: 'Indian commodity evening session overlapping with US NYMEX/COMEX crude oil and gold liquidity.',
    isMajorKillZone: true,
    marketType: 'COMMODITY',
  },
};

export interface KillZoneTradeInput {
  id?: string;
  symbol?: string;
  exchange?: string;
  marketSegment?: string;
  entryTime?: string | Date | null;
  tradeDate?: string | Date | null;
  exitTime?: string | Date | null;
  netPnL: number;
  grossPnL?: number;
  realizedR?: number;
  tags?: string[];
  status?: string;
}

/**
 * Derives the exact Market Kill-Zone for any trade based on its timestamp and market context.
 */
export function deriveKillZone(trade: {
  entryTime?: string | Date | null;
  tradeDate?: string | Date | null;
  exchange?: string;
  marketSegment?: string;
  symbol?: string;
}): KillZoneKey {
  const exUpper = (trade.exchange || '').toUpperCase().trim();
  const segUpper = (trade.marketSegment || '').toUpperCase().trim();
  const symUpper = (trade.symbol || '').toUpperCase().trim();

  const isForexOrGlobal =
    exUpper === 'FOREX' ||
    exUpper === 'CFD' ||
    exUpper === 'GLOBAL' ||
    exUpper === 'METATRADER' ||
    exUpper === 'ELEFIN' ||
    exUpper === 'THE5ERS' ||
    exUpper === 'BINANCE' ||
    exUpper === 'CRYPTO' ||
    segUpper === 'FOREX_SPOT' ||
    segUpper === 'CFD' ||
    segUpper === 'CRYPTO' ||
    /^(XAU|XAG|EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|US30|NAS100|SPX500|GER30|GER40|BTC|ETH|SOL)/i.test(symUpper);

  const isIndianMcx = exUpper === 'MCX' || segUpper === 'MCX';
  const isIndianNse =
    exUpper === 'NSE' ||
    exUpper === 'BSE' ||
    exUpper === 'FYERS' ||
    segUpper === 'EQUITY' ||
    segUpper === 'INDEX_OPT' ||
    segUpper === 'INDEX_FUT' ||
    segUpper === 'STOCK_OPT' ||
    segUpper === 'STOCK_FUT' ||
    /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX)/i.test(symUpper);

  const rawDate = trade.entryTime || trade.tradeDate;
  if (!rawDate) {
    if (isIndianMcx) return 'MCX_EVENING';
    if (isIndianNse) return 'NSE_OPENING';
    return 'LONDON_OPEN';
  }

  const date = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
  if (isNaN(date.getTime())) {
    if (isIndianMcx) return 'MCX_EVENING';
    if (isIndianNse) return 'NSE_OPENING';
    return 'LONDON_OPEN';
  }

  // 1. Forex & Global Markets: Anchor on UTC minutes
  if (isForexOrGlobal || (!isIndianMcx && !isIndianNse)) {
    const utcHours = date.getUTCHours();
    const utcMins = utcHours * 60 + date.getUTCMinutes();
    const dayOfWeek = date.getUTCDay(); // 0 = Sun, 6 = Sat

    // Weekend dead zone for standard Forex
    if (dayOfWeek === 6 || (dayOfWeek === 5 && utcMins >= 21 * 60) || (dayOfWeek === 0 && utcMins < 21 * 60)) {
      if (!segUpper.includes('CRYPTO') && !exUpper.includes('CRYPTO') && !/^(BTC|ETH|SOL)/.test(symUpper)) {
        return 'OFF_HOURS';
      }
    }

    // 07:00 - 10:00 UTC: London Open Kill-Zone
    if (utcMins >= 420 && utcMins < 600) {
      return 'LONDON_OPEN';
    }
    // 10:00 - 12:00 UTC: London Mid-Day
    if (utcMins >= 600 && utcMins < 720) {
      return 'LONDON_MIDDAY';
    }
    // 12:00 - 15:00 UTC: New York Open Kill-Zone & London/NY Overlap
    if (utcMins >= 720 && utcMins < 900) {
      return 'NY_OPEN';
    }
    // 15:00 - 17:00 UTC: London Close Kill-Zone (4 PM London Fix)
    if (utcMins >= 900 && utcMins < 1020) {
      return 'LONDON_CLOSE';
    }
    // 17:00 - 21:00 UTC: New York Afternoon Drift
    if (utcMins >= 1020 && utcMins < 1260) {
      return 'NY_AFTERNOON';
    }
    // 00:00 - 07:00 UTC: Asian Session Range
    if (utcMins >= 0 && utcMins < 420) {
      return 'ASIA_SESSION';
    }
    // 21:00 - 24:00 UTC: High spread rollover dead zone
    return 'OFF_HOURS';
  }

  // 2. Indian Equities & Derivatives (IST = UTC + 5h30m)
  const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
  const istDayOfWeek = (date.getUTCDay() + (date.getUTCHours() * 60 + date.getUTCMinutes() + 330 >= 1440 ? 1 : 0)) % 7;

  if (istDayOfWeek === 0 || istDayOfWeek === 6) {
    return 'OFF_HOURS';
  }

  if (isIndianMcx) {
    if (istMinutes >= 1020 && istMinutes <= 1435) {
      return 'MCX_EVENING';
    }
    if (istMinutes >= 540 && istMinutes < 1020) {
      return 'NSE_MIDDAY';
    }
    return 'OFF_HOURS';
  }

  // NSE / BSE cash & F&O
  if (istMinutes >= 555 && istMinutes < 615) {
    return 'NSE_OPENING'; // 09:15 - 10:15 IST
  }
  if (istMinutes >= 615 && istMinutes < 810) {
    return 'NSE_MIDDAY'; // 10:15 - 13:30 IST
  }
  if (istMinutes >= 810 && istMinutes <= 930) {
    return 'NSE_POWER_HOUR'; // 13:30 - 15:30 IST
  }

  return 'OFF_HOURS';
}

export interface IKillZonePerformanceItem {
  key: KillZoneKey;
  name: string;
  shortCode: string;
  timing: string;
  description: string;
  isMajorKillZone: boolean;
  marketType: 'FOREX_GLOBAL' | 'INDIAN_EQUITY' | 'COMMODITY' | 'OFF_HOURS';
  totalTrades: number;
  tradeIds?: string[];
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number; // 0 - 100
  netPnL: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancy: number;
  avgRealizedR?: number;
  avgWin: number;
  avgLoss: number;
  winLossRatio: number;
  avgHoldingMinutes: number;
  bestTradePnL: number;
  worstTradePnL: number;
  topSymbols: Array<{ symbol: string; tradesCount: number; netPnL: number; winRate: number }>;
  edgeRating: 'PRIME' | 'PROFITABLE' | 'NEUTRAL' | 'LEAK';
  recommendation: string;
}

export interface IKillZoneAnalyticsReport {
  killZones: IKillZonePerformanceItem[];
  overallSummary: {
    bestKillZone: { key: KillZoneKey; name: string; netPnL: number; winRate: number } | null;
    worstKillZone: { key: KillZoneKey; name: string; netPnL: number; winRate: number } | null;
    inMajorKillZones: {
      totalTrades: number;
      winRate: number;
      netPnL: number;
      profitFactor: number;
      expectancy: number;
    };
    outsideMajorKillZones: {
      totalTrades: number;
      winRate: number;
      netPnL: number;
      profitFactor: number;
      expectancy: number;
    };
    edgeDeltaPnL: number;
    edgeDeltaWinRate: number;
    verdict: string;
  };
}

/**
 * Calculates comprehensive Kill-Zone and Session Edge Analytics.
 * Evaluates performance metrics per session window with 30-digit Decimal precision.
 */
export function calculateKillZoneAnalytics(trades: KillZoneTradeInput[]): IKillZoneAnalyticsReport {
  // Map per kill zone
  interface Accumulator {
    trades: KillZoneTradeInput[];
    winCount: number;
    lossCount: number;
    beCount: number;
    sumNetPnL: Decimal;
    sumGrossWin: Decimal;
    sumGrossLoss: Decimal;
    sumRealizedR: Decimal;
    rTradesCount: number;
    sumHoldingMinutes: number;
    holdingCount: number;
    bestPnL: number;
    worstPnL: number;
    symbolMap: Map<string, { count: number; netPnL: Decimal; wins: number }>;
  }

  const zoneMap = new Map<KillZoneKey, Accumulator>();

  // Initialize all known zones
  for (const key of Object.keys(KILL_ZONE_DEFINITIONS) as KillZoneKey[]) {
    zoneMap.set(key, {
      trades: [],
      winCount: 0,
      lossCount: 0,
      beCount: 0,
      sumNetPnL: new Decimal(0),
      sumGrossWin: new Decimal(0),
      sumGrossLoss: new Decimal(0),
      sumRealizedR: new Decimal(0),
      rTradesCount: 0,
      sumHoldingMinutes: 0,
      holdingCount: 0,
      bestPnL: 0,
      worstPnL: 0,
      symbolMap: new Map(),
    });
  }

  // Accumulate trade data
  for (const t of trades) {
    if (t.status && t.status !== 'CLOSED') {
      continue;
    }

    const zoneKey = deriveKillZone(t);
    let acc = zoneMap.get(zoneKey);
    if (!acc) {
      acc = {
        trades: [],
        winCount: 0,
        lossCount: 0,
        beCount: 0,
        sumNetPnL: new Decimal(0),
        sumGrossWin: new Decimal(0),
        sumGrossLoss: new Decimal(0),
        sumRealizedR: new Decimal(0),
        rTradesCount: 0,
        sumHoldingMinutes: 0,
        holdingCount: 0,
        bestPnL: 0,
        worstPnL: 0,
        symbolMap: new Map(),
      };
      zoneMap.set(zoneKey, acc);
    }

    acc.trades.push(t);
    const pnl = Number.isFinite(t.netPnL) ? t.netPnL : 0;
    const pnlDec = new Decimal(pnl);
    acc.sumNetPnL = acc.sumNetPnL.plus(pnlDec);

    if (pnl > 0.0001) {
      acc.winCount++;
      acc.sumGrossWin = acc.sumGrossWin.plus(pnlDec);
    } else if (pnl < -0.0001) {
      acc.lossCount++;
      acc.sumGrossLoss = acc.sumGrossLoss.plus(pnlDec.abs());
    } else {
      acc.beCount++;
    }

    if (acc.trades.length === 1) {
      acc.bestPnL = pnl;
      acc.worstPnL = pnl;
    } else {
      if (pnl > acc.bestPnL) acc.bestPnL = pnl;
      if (pnl < acc.worstPnL) acc.worstPnL = pnl;
    }

    if (t.realizedR !== undefined && Number.isFinite(t.realizedR)) {
      acc.sumRealizedR = acc.sumRealizedR.plus(new Decimal(t.realizedR));
      acc.rTradesCount++;
    }

    // Holding duration
    if (t.entryTime && t.exitTime) {
      const entryTs = new Date(t.entryTime).getTime();
      const exitTs = new Date(t.exitTime).getTime();
      if (!isNaN(entryTs) && !isNaN(exitTs) && exitTs >= entryTs) {
        acc.sumHoldingMinutes += (exitTs - entryTs) / (1000 * 60);
        acc.holdingCount++;
      }
    }

    // Symbol accumulation
    const sym = (t.symbol || 'OTHER').toUpperCase().trim();
    let symStat = acc.symbolMap.get(sym);
    if (!symStat) {
      symStat = { count: 0, netPnL: new Decimal(0), wins: 0 };
      acc.symbolMap.set(sym, symStat);
    }
    symStat.count++;
    symStat.netPnL = symStat.netPnL.plus(pnlDec);
    if (pnl > 0) symStat.wins++;
  }

  // Format each zone performance item
  const killZones: IKillZonePerformanceItem[] = [];

  for (const [key, meta] of Object.entries(KILL_ZONE_DEFINITIONS) as [KillZoneKey, KillZoneMetadata][]) {
    const acc = zoneMap.get(key);
    const count = acc ? acc.trades.length : 0;
    if (count === 0) {
      continue; // Only report zones that have at least 1 trade or let's include if trades > 0
    }

    const wins = acc!.winCount;
    const losses = acc!.lossCount;
    const be = acc!.beCount;
    const winRate = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0;
    const netPnL = Number(acc!.sumNetPnL.toFixed(2));
    const grossProfit = Number(acc!.sumGrossWin.toFixed(2));
    const grossLoss = Number(acc!.sumGrossLoss.toFixed(2));

    let profitFactor = 0;
    if (acc!.sumGrossLoss.isZero()) {
      profitFactor = acc!.sumGrossWin.greaterThan(0) ? 999.99 : 0;
    } else {
      profitFactor = Number(acc!.sumGrossWin.dividedBy(acc!.sumGrossLoss).toFixed(2));
    }

    const expectancy = count > 0 ? Number(acc!.sumNetPnL.dividedBy(count).toFixed(2)) : 0;
    const avgWin = wins > 0 ? Number(acc!.sumGrossWin.dividedBy(wins).toFixed(2)) : 0;
    const avgLoss = losses > 0 ? Number(acc!.sumGrossLoss.dividedBy(losses).toFixed(2)) : 0;
    const winLossRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : avgWin > 0 ? 999.99 : 0;
    const avgHoldingMinutes = acc!.holdingCount > 0 ? Math.round(acc!.sumHoldingMinutes / acc!.holdingCount) : 0;
    const avgRealizedR =
      acc!.rTradesCount > 0 ? Number(acc!.sumRealizedR.dividedBy(acc!.rTradesCount).toFixed(2)) : undefined;

    // Top 3 symbols
    const topSymbols = Array.from(acc!.symbolMap.entries())
      .map(([symbol, s]) => ({
        symbol,
        tradesCount: s.count,
        netPnL: Number(s.netPnL.toFixed(2)),
        winRate: s.count > 0 ? Number(((s.wins / s.count) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.netPnL - a.netPnL)
      .slice(0, 3);

    // Edge Rating & Actionable Recommendation
    let edgeRating: 'PRIME' | 'PROFITABLE' | 'NEUTRAL' | 'LEAK' = 'NEUTRAL';
    let recommendation = 'Standard sample size; monitor execution discipline.';

    if (netPnL < 0 || profitFactor < 0.85) {
      edgeRating = 'LEAK';
      recommendation = `Capital leak zone with negative expectancy (${expectancy < 0 ? expectancy : `PF ${profitFactor}`}). Recommend restricting entries during this session.`;
    } else if (profitFactor >= 1.75 && winRate >= 50) {
      edgeRating = 'PRIME';
      recommendation = `Prime institutional edge window (${winRate}% win rate, ${profitFactor} PF). Focus highest quality setups and full position sizing here.`;
    } else if (netPnL > 0 && profitFactor >= 1.15) {
      edgeRating = 'PROFITABLE';
      recommendation = `Consistent profitable session. Maintain standard risk rules and selective criteria.`;
    } else {
      edgeRating = 'NEUTRAL';
      recommendation = `Break-even to slight profitability. Watch spread costs and lower time-frame chop.`;
    }

    killZones.push({
      key,
      name: meta.name,
      shortCode: meta.shortCode,
      timing: meta.timing,
      description: meta.description,
      isMajorKillZone: meta.isMajorKillZone,
      marketType: meta.marketType,
      totalTrades: count,
      tradeIds: acc ? acc.trades.map((t) => t.id).filter((id): id is string => Boolean(id)) : [],
      winningTrades: wins,
      losingTrades: losses,
      breakEvenTrades: be,
      winRate,
      netPnL,
      grossProfit,
      grossLoss,
      profitFactor,
      expectancy,
      avgRealizedR,
      avgWin,
      avgLoss,
      winLossRatio,
      avgHoldingMinutes,
      bestTradePnL: acc!.bestPnL,
      worstTradePnL: acc!.worstPnL,
      topSymbols,
      edgeRating,
      recommendation,
    });
  }

  // Sort kill-zones by netPnL descending
  killZones.sort((a, b) => b.netPnL - a.netPnL);

  // Calculate In-Major-Kill-Zones vs Outside
  let inCount = 0;
  let inWins = 0;
  let inLosses = 0;
  let inNet = new Decimal(0);
  let inGrossWin = new Decimal(0);
  let inGrossLoss = new Decimal(0);

  let outCount = 0;
  let outWins = 0;
  let outLosses = 0;
  let outNet = new Decimal(0);
  let outGrossWin = new Decimal(0);
  let outGrossLoss = new Decimal(0);

  for (const kz of killZones) {
    if (kz.isMajorKillZone) {
      inCount += kz.totalTrades;
      inWins += kz.winningTrades;
      inLosses += kz.losingTrades;
      inNet = inNet.plus(new Decimal(kz.netPnL));
      inGrossWin = inGrossWin.plus(new Decimal(kz.grossProfit));
      inGrossLoss = inGrossLoss.plus(new Decimal(kz.grossLoss));
    } else {
      outCount += kz.totalTrades;
      outWins += kz.winningTrades;
      outLosses += kz.losingTrades;
      outNet = outNet.plus(new Decimal(kz.netPnL));
      outGrossWin = outGrossWin.plus(new Decimal(kz.grossProfit));
      outGrossLoss = outGrossLoss.plus(new Decimal(kz.grossLoss));
    }
  }

  const inWinRate = inCount > 0 ? Number(((inWins / inCount) * 100).toFixed(1)) : 0;
  const inPf = inGrossLoss.isZero()
    ? inGrossWin.greaterThan(0)
      ? 999.99
      : 0
    : Number(inGrossWin.dividedBy(inGrossLoss).toFixed(2));
  const inExp = inCount > 0 ? Number(inNet.dividedBy(inCount).toFixed(2)) : 0;

  const outWinRate = outCount > 0 ? Number(((outWins / outCount) * 100).toFixed(1)) : 0;
  const outPf = outGrossLoss.isZero()
    ? outGrossWin.greaterThan(0)
      ? 999.99
      : 0
    : Number(outGrossWin.dividedBy(outGrossLoss).toFixed(2));
  const outExp = outCount > 0 ? Number(outNet.dividedBy(outCount).toFixed(2)) : 0;

  const bestZone = killZones.length > 0 ? killZones[0] : null;
  const worstZone = killZones.length > 0 ? killZones[killZones.length - 1] : null;

  const edgeDeltaPnL = Number(inNet.minus(outNet).toFixed(2));
  const edgeDeltaWinRate = Number((inWinRate - outWinRate).toFixed(1));

  let verdict = 'No closed trades in selected range.';
  if (killZones.length > 0) {
    if (inCount > 0 && outCount > 0) {
      if (edgeDeltaWinRate > 0 && edgeDeltaPnL > 0) {
        verdict = `Trading strictly within institutional Kill-Zones boosts your win rate by +${edgeDeltaWinRate}% and generated $${Math.abs(edgeDeltaPnL).toLocaleString()} more net profit compared to off-hours.`;
      } else if (outNet.greaterThan(inNet)) {
        verdict = `Off-hours / secondary sessions are generating higher returns ($${outNet.toFixed(2)}) than primary kill-zones. Inspect whether spread widening or news slippage is impacting kill-zone fills.`;
      } else {
        verdict = `Kill-zones provide a ${inWinRate}% win rate across ${inCount} trades. Focus entries during ${bestZone?.name || 'high-volume windows'}.`;
      }
    } else if (inCount > 0) {
      verdict = `100% of your executions are concentrated within high-probability Kill-Zones (${inWinRate}% win rate, ${inPf} profit factor). Excellent session discipline!`;
    } else {
      verdict = `All trades were executed outside of primary Kill-Zones. Consider aligning entries with the London or New York Open for cleaner liquidity momentum.`;
    }
  }

  return {
    killZones,
    overallSummary: {
      bestKillZone: bestZone
        ? { key: bestZone.key, name: bestZone.name, netPnL: bestZone.netPnL, winRate: bestZone.winRate }
        : null,
      worstKillZone:
        worstZone && worstZone.netPnL < 0
          ? { key: worstZone.key, name: worstZone.name, netPnL: worstZone.netPnL, winRate: worstZone.winRate }
          : null,
      inMajorKillZones: {
        totalTrades: inCount,
        winRate: inWinRate,
        netPnL: Number(inNet.toFixed(2)),
        profitFactor: inPf,
        expectancy: inExp,
      },
      outsideMajorKillZones: {
        totalTrades: outCount,
        winRate: outWinRate,
        netPnL: Number(outNet.toFixed(2)),
        profitFactor: outPf,
        expectancy: outExp,
      },
      edgeDeltaPnL,
      edgeDeltaWinRate,
      verdict,
    },
  };
}
