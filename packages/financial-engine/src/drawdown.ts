import Decimal from 'decimal.js';

export interface DrawdownCurvePoint {
  date: string;
  cumulativeEquity: number;
  drawdown?: number;
  drawdownPercent?: number;
}

export interface DrawdownEpisode {
  peakDate: string;
  peakEquity: number;
  troughDate: string;
  troughEquity: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  recoveryDate?: string;
  isRecovered: boolean;
  durationDays: number;
  durationPoints: number;
}

export interface DrawdownRecoveryStats {
  currentDrawdown: number;
  currentDrawdownPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  longestRecoveryDays: number;
  longestRecoveryPoints: number;
  longestEpisode?: DrawdownEpisode;
  episodes: DrawdownEpisode[];
}

/**
 * Calculates peak-to-trough-to-recovery drawdown episodes and longest recovery duration.
 * Uses Decimal.js for strict floating-point precision.
 */
export function calculateLongestDrawdownRecovery(
  points: DrawdownCurvePoint[]
): DrawdownRecoveryStats {
  if (!points || points.length === 0) {
    return {
      currentDrawdown: 0,
      currentDrawdownPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      longestRecoveryDays: 0,
      longestRecoveryPoints: 0,
      episodes: [],
    };
  }

  // Sort chronological
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let peakEquity = new Decimal(sorted[0].cumulativeEquity);
  let peakDate = sorted[0].date;
  let peakIndex = 0;

  let troughEquity = peakEquity;
  let troughDate = peakDate;
  let maxEpisodeDDAmt = new Decimal(0);
  let maxEpisodeDDPct = new Decimal(0);
  let inDrawdown = false;

  const episodes: DrawdownEpisode[] = [];

  let globalMaxDDAmt = new Decimal(0);
  let globalMaxDDPct = new Decimal(0);

  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i];
    const equity = new Decimal(pt.cumulativeEquity);

    if (equity.lessThan(peakEquity)) {
      // Drawdown ongoing or starting
      if (!inDrawdown) {
        inDrawdown = true;
        troughEquity = equity;
        troughDate = pt.date;
        maxEpisodeDDAmt = peakEquity.minus(equity);
        maxEpisodeDDPct = peakEquity.greaterThan(0)
          ? maxEpisodeDDAmt.dividedBy(peakEquity).times(100)
          : new Decimal(0);
      } else {
        const currentDDAmt = peakEquity.minus(equity);
        const currentDDPct = peakEquity.greaterThan(0)
          ? currentDDAmt.dividedBy(peakEquity).times(100)
          : new Decimal(0);

        if (equity.lessThan(troughEquity)) {
          troughEquity = equity;
          troughDate = pt.date;
        }
        if (currentDDAmt.greaterThan(maxEpisodeDDAmt)) {
          maxEpisodeDDAmt = currentDDAmt;
        }
        if (currentDDPct.greaterThan(maxEpisodeDDPct)) {
          maxEpisodeDDPct = currentDDPct;
        }
      }

      if (maxEpisodeDDAmt.greaterThan(globalMaxDDAmt)) {
        globalMaxDDAmt = maxEpisodeDDAmt;
      }
      if (maxEpisodeDDPct.greaterThan(globalMaxDDPct)) {
        globalMaxDDPct = maxEpisodeDDPct;
      }
    } else {
      // Equity >= peakEquity
      if (inDrawdown) {
        // Recovery achieved
        const peakTime = new Date(peakDate).getTime();
        const recoveryTime = new Date(pt.date).getTime();
        const durationDays = Math.max(0, Math.round((recoveryTime - peakTime) / (1000 * 60 * 60 * 24)));
        const durationPoints = i - peakIndex;

        episodes.push({
          peakDate,
          peakEquity: Number(peakEquity.toFixed(2)),
          troughDate,
          troughEquity: Number(troughEquity.toFixed(2)),
          maxDrawdownAmount: Number(maxEpisodeDDAmt.toFixed(2)),
          maxDrawdownPercent: Number(maxEpisodeDDPct.toFixed(2)),
          recoveryDate: pt.date,
          isRecovered: true,
          durationDays,
          durationPoints,
        });

        inDrawdown = false;
      }

      // Establish new peak
      peakEquity = equity;
      peakDate = pt.date;
      peakIndex = i;
      troughEquity = equity;
      troughDate = pt.date;
      maxEpisodeDDAmt = new Decimal(0);
      maxEpisodeDDPct = new Decimal(0);
    }
  }

  // If still in drawdown at the end of the series
  if (inDrawdown) {
    const lastPoint = sorted[sorted.length - 1];
    const peakTime = new Date(peakDate).getTime();
    const lastTime = new Date(lastPoint.date).getTime();
    const durationDays = Math.max(0, Math.round((lastTime - peakTime) / (1000 * 60 * 60 * 24)));
    const durationPoints = sorted.length - 1 - peakIndex;

    episodes.push({
      peakDate,
      peakEquity: Number(peakEquity.toFixed(2)),
      troughDate,
      troughEquity: Number(troughEquity.toFixed(2)),
      maxDrawdownAmount: Number(maxEpisodeDDAmt.toFixed(2)),
      maxDrawdownPercent: Number(maxEpisodeDDPct.toFixed(2)),
      isRecovered: false,
      durationDays,
      durationPoints,
    });
  }

  // Find longest recovery episode
  let longestDays = 0;
  let longestPoints = 0;
  let longestEpisode: DrawdownEpisode | undefined;

  for (const ep of episodes) {
    if (ep.durationDays > longestDays) {
      longestDays = ep.durationDays;
      longestPoints = ep.durationPoints;
      longestEpisode = ep;
    }
  }

  const lastPoint = sorted[sorted.length - 1];
  const lastEquity = new Decimal(lastPoint.cumulativeEquity);
  const currentDrawdownAmt = peakEquity.greaterThan(lastEquity) ? peakEquity.minus(lastEquity) : new Decimal(0);
  const currentDrawdownPct = peakEquity.greaterThan(0)
    ? currentDrawdownAmt.dividedBy(peakEquity).times(100)
    : new Decimal(0);

  return {
    currentDrawdown: Number(currentDrawdownAmt.toFixed(2)),
    currentDrawdownPercent: Number(currentDrawdownPct.toFixed(2)),
    maxDrawdown: Number(globalMaxDDAmt.toFixed(2)),
    maxDrawdownPercent: Number(globalMaxDDPct.toFixed(2)),
    longestRecoveryDays: longestDays,
    longestRecoveryPoints: longestPoints,
    longestEpisode,
    episodes,
  };
}
