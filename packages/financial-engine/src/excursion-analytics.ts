import Decimal from 'decimal.js';
import { Mulberry32PRNG } from './prng.js';
import { calculateEmpiricalBayesShrinkage } from './edge.js';
import { MIN_RELIABLE_SAMPLE } from '@tradevault/shared';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface IExcursionSummaryStatistics {
  count: number;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
  ci90?: [number, number];
}

export interface IExcursionCohort {
  cohortName: string;
  count: number;
  avgExitEfficiency?: number;
  medianExitEfficiency?: number;
  avgMaeR?: number;
  avgMfeR?: number;
  avgRLostOrLeftOnTable?: number;
  gaveBackProfitPercent: number;
}

export interface IExcursionRollingPoint {
  index: number;
  tradeDate: string;
  rollingExitEfficiency?: number;
  rollingMaeR?: number;
  rollingMfeR?: number;
}

export interface IExcursionSegment {
  key: string;
  label: string;
  count: number;
  sampleMeanMaeR?: number;
  shrunkMaeR?: number;
  sampleMeanMfeR?: number;
  shrunkMfeR?: number;
  sampleMeanExitEfficiency?: number;
  shrunkExitEfficiency?: number;
}

export interface IWhatIfPrefillSuggestion {
  suggestedStopR: number;
  suggestedTargetR: number;
  stopGrid: number[];
  targetGrid: number[];
  rationale: string;
}

export interface ITradeForExcursionAnalytics {
  id: string;
  symbol: string;
  tradeDate: Date | string;
  netPnL: number;
  outcome?: string;
  session?: string;
  strategyId?: string;
  variantKey?: string;
  mistakes?: string[];
  stopLossMoved?: boolean;
  assetClass?: string;
  underlying?: string;
  optionType?: string;
  strikePrice?: number;
  tradeManagementPlan?: string;
  risk?: {
    initialStopLoss?: number;
    plannedTarget?: number;
    estimatedRiskAmount?: number;
    riskBudgetAmount?: number;
  };
  calculated?: {
    netPnL?: number;
    outcome?: string;
    realizedRMultiple?: number;
    stopMoveSummary?: {
      widenedCount?: number;
      trailedCount?: number;
      hasWidenedRisk?: boolean;
    };
    excursion?: {
      status?: string;
      source?: string;
      isUnderlyingFallback?: boolean;
      resolution?: string;
      isLowResolution?: boolean;
      failureReason?: string;
      maePoints?: number;
      mfePoints?: number;
      maeAmount?: number;
      mfeAmount?: number;
      maeR?: number;
      mfeR?: number;
      feeAdjustedMaePoints?: number;
      feeAdjustedMfePoints?: number;
      feeAdjustedMaeAmount?: number;
      feeAdjustedMfeAmount?: number;
      feeAdjustedMaeR?: number;
      feeAdjustedMfeR?: number;
      rLeftOnTable?: number;
      exitEfficiency?: number | null;
      stopEfficiency?: number;
      entryQualityScore?: number;
      earlyMfePoints?: number;
      earlyMaePoints?: number;
      maeBeforeMfe?: boolean;
      timeOrdering?: string;
      stopHit?: boolean;
      reversedAfterStopHit?: boolean;
      candleCount?: number;
      excursionFlags?: string[];
      warnings?: string[];
    };
  };
}

export interface IExcursionAnalyticsResult {
  coverage: {
    totalClosedTrades: number;
    computedTrades: number;
    coveragePercent: number;
    excludedUnderlyingFallbackCount: number;
    uncomputedBreakdown: Record<string, number>;
  };
  sampleReliability: 'INSUFFICIENT' | 'LOW' | 'RELIABLE';
  summary: {
    totalEvaluated: number;
    countWithStop: number;
    maeR: IExcursionSummaryStatistics;
    mfeR: IExcursionSummaryStatistics;
    exitEfficiency: IExcursionSummaryStatistics;
    rLeftOnTable: IExcursionSummaryStatistics;
    stopEfficiency: IExcursionSummaryStatistics;
    entryQualityScore: {
      mean?: number;
      median?: number;
    };
    feeAdjusted: {
      avgMaeR?: number;
      avgMfeR?: number;
    };
    timeOrdering: {
      heatFirstCount: number;
      runFirstCount: number;
      simultaneousCount: number;
      heatFirstPercent: number;
    };
    gaveBackProfitPercent: number;
    reversalAfterStopPercent: number;
  };
  winnersMaeDistribution: {
    buckets: Array<{
      range: string;
      minR: number;
      maxR: number;
      count: number;
      pct: number;
      tradeIds: string[];
    }>;
    p50?: number;
    p75?: number;
    p90?: number;
    insight: string;
  };
  cohorts: {
    winnersVsLosers: [IExcursionCohort, IExcursionCohort];
    morningVsAfternoon: [IExcursionCohort, IExcursionCohort];
    disciplinedVsBrokeRules: [IExcursionCohort, IExcursionCohort];
    movedStopsVsFixedStops: [IExcursionCohort, IExcursionCohort];
  };
  rollingTrend: IExcursionRollingPoint[];
  segments: {
    byStrategyVariant: IExcursionSegment[];
    bySession: IExcursionSegment[];
    bySymbol: IExcursionSegment[];
  };
  whatIfSuggestion: IWhatIfPrefillSuggestion;
  scatterPoints: Array<{
    tradeId: string;
    symbol: string;
    tradeDate: string;
    netPnL: number;
    outcome: string;
    maeR?: number;
    mfeR?: number;
    maePoints?: number;
    mfePoints?: number;
    maeAmount?: number;
    mfeAmount?: number;
    exitEfficiency?: number | null;
    stopEfficiency?: number;
    rLeftOnTable?: number;
    entryQualityScore?: number;
    maeBeforeMfe?: boolean;
    timeOrdering?: string;
    isLowResolution?: boolean;
    excursionFlags?: string[];
    warnings?: string[];
  }>;
}

/**
 * Calculates exact percentile (0 to 1) from an array of numbers.
 */
export function calculatePercentile(values: number[], p: number): number | undefined {
  if (!values || values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return Number(sorted[0].toFixed(4));

  const rank = p * (sorted.length - 1);
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  const weight = rank - lowIndex;

  if (lowIndex === highIndex) {
    return Number(sorted[lowIndex].toFixed(4));
  }
  const interpolated = sorted[lowIndex] * (1 - weight) + sorted[highIndex] * weight;
  return Number(interpolated.toFixed(4));
}

/**
 * Computes a non-parametric bootstrap confidence interval for the sample mean.
 * Resamples with replacement using the deterministic Mulberry32 PRNG.
 */
export function bootstrapMeanConfidenceInterval(
  values: number[],
  iterations = 2000,
  confidence = 0.90,
  seed = 42
): [number, number] | undefined {
  if (!values || values.length < 2) return undefined;

  const prng = new Mulberry32PRNG(seed);
  const n = values.length;
  const bootstrapMeans = new Float64Array(iterations);

  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = prng.nextInt(0, n - 1);
      sum += values[idx];
    }
    bootstrapMeans[b] = sum / n;
  }

  bootstrapMeans.sort();

  const alpha = (1 - confidence) / 2;
  const lowIdx = Math.max(0, Math.floor(alpha * iterations));
  const highIdx = Math.min(iterations - 1, Math.ceil((1 - alpha) * iterations));

  return [
    Number(bootstrapMeans[lowIdx].toFixed(4)),
    Number(bootstrapMeans[highIdx].toFixed(4)),
  ];
}

/**
 * Builds standard summary stats (mean, median, p25, p75, ci90) for a metric series.
 */
function buildSeriesStats(values: number[], seed: number): IExcursionSummaryStatistics {
  const count = values.length;
  if (count === 0) {
    return { count: 0 };
  }

  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / count).toFixed(4));
  const median = calculatePercentile(values, 0.5);
  const p25 = calculatePercentile(values, 0.25);
  const p75 = calculatePercentile(values, 0.75);
  const ci90 = bootstrapMeanConfidenceInterval(values, 2000, 0.90, seed);

  return {
    count,
    mean,
    median,
    p25,
    p75,
    ci90,
  };
}

/**
 * Builds a cohort comparison object for a subset of trades.
 */
function buildCohort(name: string, trades: ITradeForExcursionAnalytics[]): IExcursionCohort {
  const count = trades.length;
  if (count === 0) {
    return {
      cohortName: name,
      count: 0,
      gaveBackProfitPercent: 0,
    };
  }

  const exitEffs = trades
    .map((t) => t.calculated?.excursion?.exitEfficiency)
    .filter((v): v is number => typeof v === 'number');

  const maeRs = trades
    .map((t) => t.calculated?.excursion?.maeR)
    .filter((v): v is number => typeof v === 'number');

  const mfeRs = trades
    .map((t) => t.calculated?.excursion?.mfeR)
    .filter((v): v is number => typeof v === 'number');

  const rLefts = trades
    .map((t) => t.calculated?.excursion?.rLeftOnTable)
    .filter((v): v is number => typeof v === 'number');

  const gaveBackCount = trades.filter((t) =>
    t.calculated?.excursion?.excursionFlags?.includes('GAVE_BACK_PROFIT')
  ).length;

  const avgExitEfficiency =
    exitEffs.length > 0
      ? Number((exitEffs.reduce((a, b) => a + b, 0) / exitEffs.length).toFixed(4))
      : undefined;

  const medianExitEfficiency = calculatePercentile(exitEffs, 0.5);

  const avgMaeR =
    maeRs.length > 0
      ? Number((maeRs.reduce((a, b) => a + b, 0) / maeRs.length).toFixed(2))
      : undefined;

  const avgMfeR =
    mfeRs.length > 0
      ? Number((mfeRs.reduce((a, b) => a + b, 0) / mfeRs.length).toFixed(2))
      : undefined;

  const avgRLostOrLeftOnTable =
    rLefts.length > 0
      ? Number((rLefts.reduce((a, b) => a + b, 0) / rLefts.length).toFixed(2))
      : undefined;

  const gaveBackProfitPercent = Number(((gaveBackCount / count) * 100).toFixed(1));

  return {
    cohortName: name,
    count,
    avgExitEfficiency,
    medianExitEfficiency,
    avgMaeR,
    avgMfeR,
    avgRLostOrLeftOnTable,
    gaveBackProfitPercent,
  };
}

/**
 * Computes comprehensive statistical, cohort, segmented, and decision analytics
 * for Maximum Adverse Excursion (MAE) and Maximum Favorable Excursion (MFE).
 */
export function calculateExcursionAggregates(params: {
  allClosedTrades: ITradeForExcursionAnalytics[];
  uncomputedReasonCounts?: Record<string, number>;
}): IExcursionAnalyticsResult {
  const { allClosedTrades, uncomputedReasonCounts = {} } = params;
  const totalClosedTrades = allClosedTrades.length;

  // Separate trades with underlying fallback on options from aggregates
  const validEvaluatedTrades: ITradeForExcursionAnalytics[] = [];
  let excludedUnderlyingFallbackCount = 0;

  for (const t of allClosedTrades) {
    const exc = t.calculated?.excursion;
    if (exc && exc.status === 'COMPUTED') {
      const isOption =
        t.assetClass === 'OPTIONS' ||
        Boolean(t.optionType) ||
        Boolean(t.strikePrice) ||
        /(\d+(?:CE|PE))$/i.test(t.symbol);

      if (isOption && (exc.isUnderlyingFallback || exc.source === 'UNDERLYING_FALLBACK')) {
        excludedUnderlyingFallbackCount++;
      } else {
        validEvaluatedTrades.push(t);
      }
    }
  }

  const computedTrades = validEvaluatedTrades.length;
  const coveragePercent =
    totalClosedTrades > 0
      ? Number(((computedTrades / totalClosedTrades) * 100).toFixed(1))
      : 0;

  // Reliability Badge
  let sampleReliability: 'INSUFFICIENT' | 'LOW' | 'RELIABLE' = 'INSUFFICIENT';
  if (computedTrades >= MIN_RELIABLE_SAMPLE) {
    sampleReliability = 'RELIABLE';
  } else if (computedTrades >= 10) {
    sampleReliability = 'LOW';
  }

  // Extract metric series
  const maeRList: number[] = [];
  const mfeRList: number[] = [];
  const exitEffList: number[] = [];
  const rLeftList: number[] = [];
  const stopEffList: number[] = [];
  const entryQualityList: number[] = [];
  const feeAdjustedMaeRList: number[] = [];
  const feeAdjustedMfeRList: number[] = [];

  let countWithStop = 0;
  let gaveBackProfitCount = 0;
  let stopReversalCount = 0;
  let totalWithStop = 0;

  let heatFirstCount = 0;
  let runFirstCount = 0;
  let simultaneousCount = 0;

  const scatterPoints: IExcursionAnalyticsResult['scatterPoints'] = [];

  for (const t of validEvaluatedTrades) {
    const exc = t.calculated?.excursion;
    if (!exc) continue;

    if (exc.maeR !== undefined && exc.maeR !== null) {
      maeRList.push(exc.maeR);
      countWithStop++;
    }
    if (exc.mfeR !== undefined && exc.mfeR !== null) {
      mfeRList.push(exc.mfeR);
    }
    if (exc.exitEfficiency !== undefined && exc.exitEfficiency !== null) {
      exitEffList.push(exc.exitEfficiency);
    }
    if (exc.rLeftOnTable !== undefined && exc.rLeftOnTable !== null) {
      rLeftList.push(exc.rLeftOnTable);
    }
    if (exc.stopEfficiency !== undefined && exc.stopEfficiency !== null) {
      stopEffList.push(exc.stopEfficiency);
    }
    if (exc.entryQualityScore !== undefined && exc.entryQualityScore !== null) {
      entryQualityList.push(exc.entryQualityScore);
    }
    if (exc.feeAdjustedMaeR !== undefined && exc.feeAdjustedMaeR !== null) {
      feeAdjustedMaeRList.push(exc.feeAdjustedMaeR);
    }
    if (exc.feeAdjustedMfeR !== undefined && exc.feeAdjustedMfeR !== null) {
      feeAdjustedMfeRList.push(exc.feeAdjustedMfeR);
    }

    if (exc.timeOrdering === 'HEAT_FIRST') heatFirstCount++;
    else if (exc.timeOrdering === 'RUN_FIRST') runFirstCount++;
    else simultaneousCount++;

    if (exc.excursionFlags?.includes('GAVE_BACK_PROFIT')) {
      gaveBackProfitCount++;
    }

    if (t.risk?.initialStopLoss) {
      totalWithStop++;
      if (exc.reversedAfterStopHit || exc.excursionFlags?.includes('STOP_TOO_TIGHT_EVIDENCE')) {
        stopReversalCount++;
      }
    }

    const tradeDateStr =
      typeof t.tradeDate === 'string'
        ? t.tradeDate.split('T')[0]
        : t.tradeDate instanceof Date
        ? t.tradeDate.toISOString().split('T')[0]
        : '';

    scatterPoints.push({
      tradeId: t.id,
      symbol: t.symbol,
      tradeDate: tradeDateStr,
      netPnL: t.calculated?.netPnL ?? t.netPnL ?? 0,
      outcome: t.calculated?.outcome ?? t.outcome ?? 'BREAKEVEN',
      maeR: exc.maeR,
      mfeR: exc.mfeR,
      maePoints: exc.maePoints,
      mfePoints: exc.mfePoints,
      maeAmount: exc.maeAmount,
      mfeAmount: exc.mfeAmount,
      exitEfficiency: exc.exitEfficiency,
      stopEfficiency: exc.stopEfficiency,
      rLeftOnTable: exc.rLeftOnTable,
      entryQualityScore: exc.entryQualityScore,
      maeBeforeMfe: exc.maeBeforeMfe,
      timeOrdering: exc.timeOrdering,
      isLowResolution: exc.isLowResolution,
      excursionFlags: exc.excursionFlags,
      warnings: exc.warnings,
    });
  }

  // Summary statistics with percentiles & bootstrap intervals
  const summary: IExcursionAnalyticsResult['summary'] = {
    totalEvaluated: computedTrades,
    countWithStop,
    maeR: buildSeriesStats(maeRList, 101),
    mfeR: buildSeriesStats(mfeRList, 102),
    exitEfficiency: buildSeriesStats(exitEffList, 103),
    rLeftOnTable: buildSeriesStats(rLeftList, 104),
    stopEfficiency: buildSeriesStats(stopEffList, 105),
    entryQualityScore: {
      mean:
        entryQualityList.length > 0
          ? Math.round(entryQualityList.reduce((a, b) => a + b, 0) / entryQualityList.length)
          : undefined,
      median: calculatePercentile(entryQualityList, 0.5),
    },
    feeAdjusted: {
      avgMaeR:
        feeAdjustedMaeRList.length > 0
          ? Number((feeAdjustedMaeRList.reduce((a, b) => a + b, 0) / feeAdjustedMaeRList.length).toFixed(2))
          : undefined,
      avgMfeR:
        feeAdjustedMfeRList.length > 0
          ? Number((feeAdjustedMfeRList.reduce((a, b) => a + b, 0) / feeAdjustedMfeRList.length).toFixed(2))
          : undefined,
    },
    timeOrdering: {
      heatFirstCount,
      runFirstCount,
      simultaneousCount,
      heatFirstPercent:
        computedTrades > 0 ? Number(((heatFirstCount / computedTrades) * 100).toFixed(1)) : 0,
    },
    gaveBackProfitPercent:
      computedTrades > 0 ? Number(((gaveBackProfitCount / computedTrades) * 100).toFixed(1)) : 0,
    reversalAfterStopPercent:
      totalWithStop > 0 ? Number(((stopReversalCount / totalWithStop) * 100).toFixed(1)) : 0,
  };

  // Winner-Only MAE Distribution (promoted from What-If)
  const winningTrades = validEvaluatedTrades.filter((t) => {
    const pnl = t.calculated?.netPnL ?? t.netPnL ?? 0;
    return pnl > 0 && typeof t.calculated?.excursion?.maeR === 'number';
  });

  const winnersMaeBucketDefs = [
    { range: '0.00R – 0.25R', minR: 0, maxR: 0.25 },
    { range: '0.25R – 0.50R', minR: 0.25, maxR: 0.50 },
    { range: '0.50R – 0.75R', minR: 0.50, maxR: 0.75 },
    { range: '0.75R – 1.00R', minR: 0.75, maxR: 1.00 },
    { range: '> 1.00R (Adverse)', minR: 1.00, maxR: Infinity },
  ];

  const winnersMaeBuckets = winnersMaeBucketDefs.map((b) => ({
    ...b,
    count: 0,
    pct: 0,
    tradeIds: [] as string[],
  }));

  const winnersMaeValues: number[] = [];
  for (const wt of winningTrades) {
    const maeR = wt.calculated!.excursion!.maeR!;
    winnersMaeValues.push(maeR);

    for (const b of winnersMaeBuckets) {
      if (maeR >= b.minR && (b.maxR === Infinity ? true : maeR < b.maxR)) {
        b.count++;
        b.tradeIds.push(wt.id);
        break;
      }
    }
  }

  const winCount = winningTrades.length;
  if (winCount > 0) {
    for (const b of winnersMaeBuckets) {
      b.pct = Number(((b.count / winCount) * 100).toFixed(1));
    }
  }

  const winnersP50 = calculatePercentile(winnersMaeValues, 0.5);
  const winnersP75 = calculatePercentile(winnersMaeValues, 0.75);
  const winnersP90 = calculatePercentile(winnersMaeValues, 0.90);

  let winnerInsight = 'Insufficient winning trades with stop loss to determine optimal stop placement.';
  if (winCount >= 5 && winnersP90 !== undefined) {
    if (winnersP90 <= 0.45) {
      winnerInsight = `90% of your winners never dip beyond ${winnersP90}R adverse excursion. Your current 1.0R stop may be too loose, risking unnecessary capital on true failures.`;
    } else if (winnersP90 >= 0.85) {
      winnerInsight = `Many of your winners experience deep adverse excursions (${winnersP90}R at 90th percentile). Tightening stops will prematurely stop out valid winning setups.`;
    } else {
      winnerInsight = `75% of winners stay within ${winnersP75 ?? 0.5}R adverse heat. A stop around ${Number(((winnersP75 ?? 0.5) * 1.2).toFixed(2))}R accommodates typical noise.`;
    }
  }

  const winnersMaeDistribution: IExcursionAnalyticsResult['winnersMaeDistribution'] = {
    buckets: winnersMaeBuckets,
    p50: winnersP50,
    p75: winnersP75,
    p90: winnersP90,
    insight: winnerInsight,
  };

  // Cohort Comparisons
  const winners = validEvaluatedTrades.filter((t) => (t.calculated?.netPnL ?? t.netPnL ?? 0) > 0);
  const losers = validEvaluatedTrades.filter((t) => (t.calculated?.netPnL ?? t.netPnL ?? 0) < 0);

  const morning = validEvaluatedTrades.filter((t) => t.session === 'MORNING' || t.session === 'NSE_REGULAR');
  const afternoon = validEvaluatedTrades.filter((t) => t.session === 'AFTERNOON' || t.session === 'MCX_EVENING');

  const disciplined = validEvaluatedTrades.filter((t) => !t.mistakes || t.mistakes.length === 0);
  const brokeRules = validEvaluatedTrades.filter((t) => Boolean(t.mistakes && t.mistakes.length > 0));

  const movedStops = validEvaluatedTrades.filter(
    (t) =>
      t.stopLossMoved === true ||
      (t.calculated?.stopMoveSummary?.widenedCount !== undefined && t.calculated.stopMoveSummary.widenedCount > 0) ||
      t.calculated?.stopMoveSummary?.hasWidenedRisk === true
  );
  const fixedStops = validEvaluatedTrades.filter(
    (t) =>
      !t.stopLossMoved &&
      (!t.calculated?.stopMoveSummary || t.calculated.stopMoveSummary.widenedCount === 0)
  );

  const cohorts: IExcursionAnalyticsResult['cohorts'] = {
    winnersVsLosers: [buildCohort('Winning Trades', winners), buildCohort('Losing Trades', losers)],
    morningVsAfternoon: [buildCohort('Morning / Regular', morning), buildCohort('Afternoon / Late', afternoon)],
    disciplinedVsBrokeRules: [buildCohort('Disciplined (No Mistakes)', disciplined), buildCohort('Broke Rules (Mistakes Logged)', brokeRules)],
    movedStopsVsFixedStops: [buildCohort('Moved / Widened Stops', movedStops), buildCohort('Fixed / Unmodified Stops', fixedStops)],
  };

  // Rolling 20-Trade Trend (chronological order)
  const chronologicalTrades = [...validEvaluatedTrades].sort((a, b) => {
    const timeA = new Date(a.tradeDate).getTime();
    const timeB = new Date(b.tradeDate).getTime();
    return timeA - timeB;
  });

  const rollingTrend: IExcursionRollingPoint[] = [];
  const windowSize = 20;

  for (let i = 0; i < chronologicalTrades.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1);
    const windowSlice = chronologicalTrades.slice(startIdx, i + 1);

    const effs = windowSlice
      .map((t) => t.calculated?.excursion?.exitEfficiency)
      .filter((v): v is number => typeof v === 'number');

    const maes = windowSlice
      .map((t) => t.calculated?.excursion?.maeR)
      .filter((v): v is number => typeof v === 'number');

    const mfes = windowSlice
      .map((t) => t.calculated?.excursion?.mfeR)
      .filter((v): v is number => typeof v === 'number');

    const tDate = chronologicalTrades[i].tradeDate;
    const dateStr =
      typeof tDate === 'string'
        ? tDate.split('T')[0]
        : tDate instanceof Date
        ? tDate.toISOString().split('T')[0]
        : '';

    rollingTrend.push({
      index: i + 1,
      tradeDate: dateStr,
      rollingExitEfficiency:
        effs.length > 0 ? Number((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(4)) : undefined,
      rollingMaeR:
        maes.length > 0 ? Number((maes.reduce((a, b) => a + b, 0) / maes.length).toFixed(2)) : undefined,
      rollingMfeR:
        mfes.length > 0 ? Number((mfes.reduce((a, b) => a + b, 0) / mfes.length).toFixed(2)) : undefined,
    });
  }

  // Segmentations with Empirical Bayes Shrinkage
  const globalMaeMean = summary.maeR.mean ?? 0.5;
  const globalMfeMean = summary.mfeR.mean ?? 1.5;
  const globalEffMean = summary.exitEfficiency.mean ?? 0.45;

  const buildSegments = (
    groupByFn: (t: ITradeForExcursionAnalytics) => { key: string; label: string }
  ): IExcursionSegment[] => {
    const map = new Map<string, { label: string; trades: ITradeForExcursionAnalytics[] }>();

    for (const t of validEvaluatedTrades) {
      const { key, label } = groupByFn(t);
      if (!map.has(key)) {
        map.set(key, { label, trades: [] });
      }
      map.get(key)!.trades.push(t);
    }

    const segments: IExcursionSegment[] = [];
    for (const [key, val] of map.entries()) {
      const count = val.trades.length;
      if (count === 0) continue;

      const maes = val.trades
        .map((t) => t.calculated?.excursion?.maeR)
        .filter((v): v is number => typeof v === 'number');

      const mfes = val.trades
        .map((t) => t.calculated?.excursion?.mfeR)
        .filter((v): v is number => typeof v === 'number');

      const effs = val.trades
        .map((t) => t.calculated?.excursion?.exitEfficiency)
        .filter((v): v is number => typeof v === 'number');

      const sampleMeanMaeR =
        maes.length > 0 ? Number((maes.reduce((a, b) => a + b, 0) / maes.length).toFixed(2)) : undefined;

      const sampleMeanMfeR =
        mfes.length > 0 ? Number((mfes.reduce((a, b) => a + b, 0) / mfes.length).toFixed(2)) : undefined;

      const sampleMeanExitEfficiency =
        effs.length > 0 ? Number((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(4)) : undefined;

      const shrunkMaeR =
        sampleMeanMaeR !== undefined
          ? calculateEmpiricalBayesShrinkage(sampleMeanMaeR, count, globalMaeMean, 10)
          : undefined;

      const shrunkMfeR =
        sampleMeanMfeR !== undefined
          ? calculateEmpiricalBayesShrinkage(sampleMeanMfeR, count, globalMfeMean, 10)
          : undefined;

      const shrunkExitEfficiency =
        sampleMeanExitEfficiency !== undefined
          ? calculateEmpiricalBayesShrinkage(sampleMeanExitEfficiency, count, globalEffMean, 10)
          : undefined;

      segments.push({
        key,
        label: val.label,
        count,
        sampleMeanMaeR,
        shrunkMaeR,
        sampleMeanMfeR,
        shrunkMfeR,
        sampleMeanExitEfficiency,
        shrunkExitEfficiency,
      });
    }

    return segments.sort((a, b) => b.count - a.count);
  };

  const segments = {
    byStrategyVariant: buildSegments((t) => {
      const sId = t.strategyId || 'Unassigned';
      const vKey = t.variantKey || 'Default';
      return {
        key: `${sId}_${vKey}`,
        label: `${t.strategyId ? 'Strategy ' + t.strategyId.substring(0, 6) : 'Unassigned'} (${vKey})`,
      };
    }),
    bySession: buildSegments((t) => ({
      key: t.session || 'OFF_HOURS',
      label: t.session || 'OFF_HOURS',
    })),
    bySymbol: buildSegments((t) => ({
      key: t.symbol,
      label: t.symbol,
    })),
  };

  // What-If Stop/Target Decision Suggestion
  const suggestedStopR = winnersP75 ? Math.max(0.5, Number((winnersP75 * 1.15).toFixed(1))) : 1.0;
  const suggestedTargetR = summary.mfeR.median
    ? Math.max(1.5, Number(summary.mfeR.median.toFixed(1)))
    : 2.0;

  const whatIfSuggestion: IWhatIfPrefillSuggestion = {
    suggestedStopR,
    suggestedTargetR,
    stopGrid: [0.5, 0.75, 1.0, 1.25, 1.5],
    targetGrid: [1.5, 2.0, 2.5, 3.0, 4.0],
    rationale: `Derived from 75th percentile of winners' MAE (${winnersP75 ?? 0.5}R) with 15% noise buffer and median MFE reach (${summary.mfeR.median ?? 2.0}R).`,
  };

  return {
    coverage: {
      totalClosedTrades,
      computedTrades,
      coveragePercent,
      excludedUnderlyingFallbackCount,
      uncomputedBreakdown: uncomputedReasonCounts,
    },
    sampleReliability,
    summary,
    winnersMaeDistribution,
    cohorts,
    rollingTrend,
    segments,
    whatIfSuggestion,
    scatterPoints,
  };
}
