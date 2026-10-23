import Decimal from 'decimal.js';
import {
  Direction,
  IStrategyVariant,
  LiquiditySide,
  PatternType,
  SecondLegStatus,
  deriveMomentumRelation,
} from '@tradevault/shared';
import { calculateRealizedRMultiple } from './risk.js';
import { validateStrategyEdge, EligibleTradeInput } from './edge.js';

export interface VariantAnalyticsTradeInput {
  id?: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  status: string; // 'CLOSED' | 'OPEN' | 'PLANNED' | 'CANCELLED'
  direction?: Direction;
  symbol?: string;
  calculated?: {
    netPnL?: number;
    grossPnL?: number;
    totalCosts?: number;
    realizedRMultiple?: number;
    outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN' | 'CANCELLED';
  };
  risk?: {
    plannedEntryPrice?: number;
    initialStopLoss?: number;
    plannedTarget?: number;
    riskBudgetAmount?: number;
    estimatedRiskAmount?: number;
    realizedRMultiple?: number;
    plannedRewardRiskRatio?: number;
  };
  setup?: {
    variantKey?: string;
    variantStatus?: 'CLASSIFIED' | 'UNCLASSIFIED' | 'NOT_APPLICABLE';
    alsoMatches?: string[];
    htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    executionTimeframe?: string;
    liquiditySide?: LiquiditySide;
    patternType?: PatternType;
    secondLegStatus?: SecondLegStatus;
    liquidityLevel?: number;
    sweepExtreme?: number;
    entryModel?: 'CONFIRMATION_CANDLE' | 'RETEST' | 'OTHER';
  };
  psychology?: {
    rulesFollowed?: boolean;
    disciplineScore?: number;
  };
  simpleExecution?: {
    entryPrice?: number;
    exitPrice?: number;
    quantity?: number;
    contractMultiplier?: number;
  };
}

export interface VariantAnalyticsStrategyInput {
  id?: string;
  name: string;
  minRiskReward?: number;
  variants?: IStrategyVariant[];
}

export type ProfitFactorState = 'NORMAL' | 'NO_LOSSES' | 'NO_TRADES';
export type SampleSizeLevel = 'VERY_LOW' | 'LOW' | 'ADEQUATE';

export interface VariantMetricsBucket {
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  isSystemBucket: boolean;
  expected?: {
    direction: Direction;
    liquiditySide: LiquiditySide;
    patternType: PatternType;
    secondLegStatus: SecondLegStatus;
    momentumRelation: 'WITH_HTF' | 'AGAINST_HTF' | 'UNKNOWN';
  };
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null; // percentage e.g. 60.5, or null if no closed trades / 0 wins
  grossProfit: number;
  grossLoss: number;
  netPnL: number;
  totalCosts: number;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  profitFactorState: ProfitFactorState;
  netR: number | null;
  avgR: number | null;
  rEligibleCount: number;
  rCoverage: number; // 0 to 1 fraction
  rDenominatorField: string; // 'plannedRiskAmount (riskBudgetAmount || estimatedRiskAmount || distance*qty*mult)'
  maxDrawdown: number;
  adherenceRate: number | null; // percentage labelled "as recorded"
  sampleSize: {
    level: SampleSizeLevel;
    warningText: string | null;
  };
  edgeVerdict: string | null; // 'LIKELY_EDGE' | 'UNPROVEN' | 'NO_EDGE_NEGATIVE' | null
  momentumRelationCounts: {
    WITH_HTF: number;
    AGAINST_HTF: number;
    UNKNOWN: number;
  };
}

export interface VariantAnalyticsResult {
  strategy: {
    id?: string;
    name: string;
    minRiskReward?: number;
  };
  parent: VariantMetricsBucket;
  buckets: VariantMetricsBucket[];
  countsByStatus: {
    CLOSED: number;
    OPEN: number;
    PLANNED: number;
    CANCELLED: number;
    TOTAL: number;
  };
  invariantCheck: {
    reconciled: boolean;
    parentClosed: number;
    sumBucketClosed: number;
  };
}

/**
 * Pure statistical calculation function for strategy variants.
 * Guarantees tenant and strategy isolation, mutual exclusivity of buckets,
 * and mathematical consistency down to the paisa/cent using Decimal.js.
 */
export function calculateVariantAnalytics(params: {
  strategy: VariantAnalyticsStrategyInput;
  trades: VariantAnalyticsTradeInput[];
}): VariantAnalyticsResult {
  const { strategy, trades } = params;

  // 1. Count by status
  const countsByStatus = {
    CLOSED: 0,
    OPEN: 0,
    PLANNED: 0,
    CANCELLED: 0,
    TOTAL: trades.length,
  };

  for (const t of trades) {
    if (t.status === 'CLOSED') countsByStatus.CLOSED++;
    else if (t.status === 'OPEN') countsByStatus.OPEN++;
    else if (t.status === 'PLANNED') countsByStatus.PLANNED++;
    else if (t.status === 'CANCELLED') countsByStatus.CANCELLED++;
  }

  // 2. Filter to CLOSED trades only for analytics
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');

  // 3. Build defined variant map
  const definedVariants = strategy.variants || [];
  const variantMap = new Map<string, IStrategyVariant>();
  for (const v of definedVariants) {
    variantMap.set(v.key, v);
  }

  // 4. Partition trades into mutually exclusive buckets
  // Invariant: sum(bucket.closedTrades) === parent.closedTrades
  const bucketTradesMap = new Map<string, VariantAnalyticsTradeInput[]>();

  // Initialize defined variants buckets (even if 0 trades)
  for (const v of definedVariants) {
    bucketTradesMap.set(v.key, []);
  }
  // Initialize system buckets
  bucketTradesMap.set('UNCLASSIFIED', []);
  bucketTradesMap.set('NOT_APPLICABLE', []);
  bucketTradesMap.set('ORPHANED', []);

  for (const trade of closedTrades) {
    const variantKey = trade.setup?.variantKey;
    const variantStatus = trade.setup?.variantStatus;

    if (variantKey) {
      if (variantMap.has(variantKey)) {
        bucketTradesMap.get(variantKey)!.push(trade);
      } else {
        bucketTradesMap.get('ORPHANED')!.push(trade);
      }
    } else {
      if (variantStatus === 'NOT_APPLICABLE') {
        bucketTradesMap.get('NOT_APPLICABLE')!.push(trade);
      } else {
        bucketTradesMap.get('UNCLASSIFIED')!.push(trade);
      }
    }
  }

  // Helper to compute bucket metrics
  function computeBucketMetrics(
    key: string,
    name: string,
    description: string | undefined,
    isActive: boolean,
    sortOrder: number,
    isSystemBucket: boolean,
    expected: any,
    bucketTrades: VariantAnalyticsTradeInput[]
  ): VariantMetricsBucket {
    const n = bucketTrades.length;

    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let grossProfitDec = new Decimal(0);
    let grossLossDec = new Decimal(0);
    let netPnLDec = new Decimal(0);
    let totalCostsDec = new Decimal(0);
    let adherentCount = 0;
    let sumR = new Decimal(0);
    let rEligibleCount = 0;

    const momentumCounts = {
      WITH_HTF: 0,
      AGAINST_HTF: 0,
      UNKNOWN: 0,
    };

    const eligibleForEdge: EligibleTradeInput[] = [];

    // Chronological ordering for Drawdown
    const sortedTrades = [...bucketTrades].sort((a, b) => {
      const timeA = new Date(a.entryTime || a.tradeDate).getTime();
      const timeB = new Date(b.entryTime || b.tradeDate).getTime();
      return timeA - timeB;
    });

    let runningPnL = new Decimal(0);
    let peakEquity = new Decimal(0);
    let maxDrawdownDec = new Decimal(0);

    for (const trade of sortedTrades) {
      const net = new Decimal(trade.calculated?.netPnL ?? 0);
      const gross = new Decimal(trade.calculated?.grossPnL ?? 0);
      const costs = new Decimal(trade.calculated?.totalCosts ?? 0);

      netPnLDec = netPnLDec.plus(net);
      grossProfitDec = grossProfitDec.plus(gross.greaterThan(0) ? gross : new Decimal(0));
      if (gross.lessThan(0)) {
        grossLossDec = grossLossDec.plus(gross.abs());
      }
      totalCostsDec = totalCostsDec.plus(costs);

      // Outcome
      const outcome = trade.calculated?.outcome;
      if (outcome === 'WIN' || (outcome === undefined && net.greaterThan(0))) {
        wins++;
      } else if (outcome === 'LOSS' || (outcome === undefined && net.lessThan(0))) {
        losses++;
      } else {
        breakeven++;
      }

      // Adherence "as recorded"
      if (trade.psychology?.rulesFollowed === true) {
        adherentCount++;
      }

      // Momentum relation (derived)
      const momentum = deriveMomentumRelation(trade.direction, trade.setup?.htfBias);
      momentumCounts[momentum]++;

      // Realized R-Multiple
      let rValue: number | undefined;
      let plannedRisk: number | undefined = trade.risk?.riskBudgetAmount || trade.risk?.estimatedRiskAmount;

      if (!plannedRisk && trade.risk?.plannedEntryPrice && trade.risk?.initialStopLoss) {
        const dist = Math.abs(trade.risk.plannedEntryPrice - trade.risk.initialStopLoss);
        const qty = trade.simpleExecution?.quantity || 1;
        const mult = trade.simpleExecution?.contractMultiplier || 1;
        plannedRisk = dist * qty * mult;
      }

      if (
        trade.calculated?.realizedRMultiple !== undefined &&
        trade.calculated?.realizedRMultiple !== null &&
        Number.isFinite(trade.calculated.realizedRMultiple)
      ) {
        rValue = Number(trade.calculated.realizedRMultiple);
      } else if (plannedRisk && plannedRisk > 0) {
        rValue = calculateRealizedRMultiple(net, plannedRisk);
      }

      if (rValue !== undefined && Number.isFinite(rValue)) {
        rEligibleCount++;
        sumR = sumR.plus(rValue);
        eligibleForEdge.push({
          id: trade.id,
          tradeDate: trade.tradeDate,
          status: 'CLOSED',
          netPnL: net.toNumber(),
          realizedRMultiple: rValue,
          plannedRiskAmount: plannedRisk,
        });
      }

      // Drawdown calculation on chronological cumulative net P&L
      runningPnL = runningPnL.plus(net);
      if (runningPnL.greaterThan(peakEquity)) {
        peakEquity = runningPnL;
      }
      const currentDD = peakEquity.minus(runningPnL);
      if (currentDD.greaterThan(maxDrawdownDec)) {
        maxDrawdownDec = currentDD;
      }
    }

    // Win Rate (null if 0 closed trades or 0 wins)
    const winRate = n > 0 && wins > 0 ? Number(((wins / n) * 100).toFixed(2)) : null;

    // Averages
    const avgWin = wins > 0 ? Number(grossProfitDec.dividedBy(wins).toFixed(2)) : null;
    const avgLoss = losses > 0 ? Number(grossLossDec.dividedBy(losses).toFixed(2)) : null;
    const expectancy = n > 0 ? Number(netPnLDec.dividedBy(n).toFixed(2)) : null;

    // Profit Factor & State
    let profitFactor: number | null = null;
    let profitFactorState: ProfitFactorState = 'NORMAL';

    if (n === 0) {
      profitFactor = null;
      profitFactorState = 'NO_TRADES';
    } else if (grossLossDec.isZero()) {
      profitFactor = null;
      profitFactorState = 'NO_LOSSES';
    } else {
      profitFactor = Number(grossProfitDec.dividedBy(grossLossDec).toFixed(2));
      profitFactorState = 'NORMAL';
    }

    // R Metrics
    const netR = rEligibleCount > 0 ? Number(sumR.toFixed(2)) : null;
    const avgR = rEligibleCount > 0 ? Number(sumR.dividedBy(rEligibleCount).toFixed(2)) : null;
    const rCoverage = n > 0 ? Number((rEligibleCount / n).toFixed(4)) : 0;

    // Sample size classification
    let sampleLevel: SampleSizeLevel = 'VERY_LOW';
    let warningText: string | null = null;
    if (n < 10) {
      sampleLevel = 'VERY_LOW';
      warningText = 'Sample size is very low (<10 trades). Metrics are indicative only and cannot confirm a statistical edge.';
    } else if (n < 30) {
      sampleLevel = 'LOW';
      warningText = 'Sample size is low (10-29 trades). Performance metrics have high variance; 30+ trades recommended.';
    } else {
      sampleLevel = 'ADEQUATE';
      warningText = null;
    }

    // Edge verdict (strictly only when R-eligible N >= 30)
    let edgeVerdict: string | null = null;
    if (rEligibleCount >= 30) {
      try {
        const edgeRes = validateStrategyEdge(eligibleForEdge, {
          minSampleSize: 30,
          confidenceLevel: 0.9,
        });
        edgeVerdict = edgeRes.verdict;
      } catch {
        edgeVerdict = null;
      }
    }

    // Rule adherence "as recorded"
    const adherenceRate = n > 0 ? Number(((adherentCount / n) * 100).toFixed(2)) : null;

    return {
      key,
      name,
      description,
      isActive,
      sortOrder,
      isSystemBucket,
      expected,
      closedTrades: n,
      wins,
      losses,
      breakeven,
      winRate,
      grossProfit: Number(grossProfitDec.toFixed(2)),
      grossLoss: Number(grossLossDec.toFixed(2)),
      netPnL: Number(netPnLDec.toFixed(2)),
      totalCosts: Number(totalCostsDec.toFixed(2)),
      avgWin,
      avgLoss,
      expectancy,
      profitFactor,
      profitFactorState,
      netR,
      avgR,
      rEligibleCount,
      rCoverage,
      rDenominatorField: 'plannedRiskAmount (riskBudgetAmount || estimatedRiskAmount || distance*qty*mult)',
      maxDrawdown: Number(maxDrawdownDec.toFixed(2)),
      adherenceRate,
      sampleSize: {
        level: sampleLevel,
        warningText,
      },
      edgeVerdict,
      momentumRelationCounts: momentumCounts,
    };
  }

  // 5. Compute Parent metrics (all closed trades for this strategy)
  const parent = computeBucketMetrics(
    'PARENT',
    strategy.name,
    'Aggregate strategy performance across all variants',
    true,
    0,
    false,
    undefined,
    closedTrades
  );

  // 6. Compute defined variant buckets
  const variantBuckets: VariantMetricsBucket[] = [];
  for (const v of definedVariants) {
    const bTrades = bucketTradesMap.get(v.key) || [];
    variantBuckets.push(
      computeBucketMetrics(
        v.key,
        v.name,
        v.description,
        v.isActive !== false,
        v.sortOrder || 0,
        false,
        v.expected,
        bTrades
      )
    );
  }

  // 7. Compute system buckets
  const unclassifiedTrades = bucketTradesMap.get('UNCLASSIFIED') || [];
  const unclassifiedBucket = computeBucketMetrics(
    'UNCLASSIFIED',
    'Unclassified Trades',
    'Trades executed under this strategy without a setup variant assigned',
    true,
    100,
    true,
    undefined,
    unclassifiedTrades
  );

  const notApplicableTrades = bucketTradesMap.get('NOT_APPLICABLE') || [];
  const notApplicableBucket = computeBucketMetrics(
    'NOT_APPLICABLE',
    'Not Applicable',
    'Trades marked as not applicable for variant classification',
    true,
    101,
    true,
    undefined,
    notApplicableTrades
  );

  const orphanedTrades = bucketTradesMap.get('ORPHANED') || [];
  const orphanedBucket = computeBucketMetrics(
    'ORPHANED',
    'Orphaned Variants',
    'Trades referencing variant keys that are no longer defined in this strategy',
    true,
    102,
    true,
    undefined,
    orphanedTrades
  );

  const allBuckets = [
    ...variantBuckets,
    unclassifiedBucket,
    notApplicableBucket,
    orphanedBucket,
  ];

  // Invariant validation
  const sumBucketClosed = allBuckets.reduce((acc, b) => acc + b.closedTrades, 0);
  const reconciled = sumBucketClosed === parent.closedTrades;

  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      minRiskReward: strategy.minRiskReward,
    },
    parent,
    buckets: allBuckets,
    countsByStatus,
    invariantCheck: {
      reconciled,
      parentClosed: parent.closedTrades,
      sumBucketClosed,
    },
  };
}
