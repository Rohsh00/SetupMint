import Decimal from './decimal.js';

export interface SizingAnalyticsTradeInput {
  id?: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  exitTime?: string | Date;
  symbol?: string;
  direction?: 'LONG' | 'SHORT';
  quantity: number;
  netPnL: number;
  grossPnL?: number;
  realizedRMultiple?: number;
  disciplineScore?: number;
  status?: string;
  strategyId?: string;
  strategyName?: string;
}

export type SizingTierVerdict = 'OPTIMAL' | 'HEALTHY' | 'MARGINAL' | 'VALUE_DESTRUCTIVE';
export type SizingAlphaVerdict = 'POSITIVE_ALPHA' | 'NEUTRAL' | 'VALUE_DESTRUCTIVE';
export type SizingHealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type PostLossMultiplierTierKey = 'MILD_DRIFT' | 'AGGRESSIVE' | 'MARTINGALE_2X' | 'EXTREME_BLOWOUT';
export type PostLossLatencyBucketKey = 'FLASH_REVENGE' | 'SIMMERING_TILT' | 'COOLING_DOWN' | 'RESET_SESSION';

export interface IPostLossEscalationTier {
  tierKey: PostLossMultiplierTierKey;
  label: string;
  multiplierRange: string;
  count: number;
  winRate: number;
  netPnL: number;
  avgPnL: number;
  tradeIds: string[];
}

export interface IPostLossLatencyBucket {
  bucketKey: PostLossLatencyBucketKey;
  label: string;
  count: number;
  winRate: number;
  netPnL: number;
  avgPnL: number;
  tradeIds: string[];
}

export interface IPostLossTradePair {
  lossTradeId: string;
  lossDate: string;
  lossSymbol: string;
  lossDirection?: string;
  lossQuantity: number;
  lossPnL: number;
  lossRMultiple?: number;

  upsizedTradeId: string;
  upsizedDate: string;
  upsizedSymbol: string;
  upsizedDirection?: string;
  upsizedQuantity: number;
  upsizedPnL: number;
  upsizedRMultiple?: number;

  sizingMultiplier: number;
  cooldownMinutes?: number;
  isConsecutiveCascade: boolean;
  cascadeDepth: number;
  directionFlip: boolean;
  assetHopped: boolean;
}

export interface IPostLossCounterfactualPoint {
  tradeIndex: number;
  tradeId: string;
  date: string;
  actualPnL: number;
  actualCumulativePnL: number;
  disciplinedPnL: number;
  disciplinedCumulativePnL: number;
}

export interface IPostLossSizingReport {
  totalLossTrades: number;
  escalationCount: number;
  escalationRate: number;
  totalEscalationNetPnL: number;
  sizingAlphaDeficit: number;
  escalationWinRate: number;
  baselineWinRate: number;
  avgMultiplier: number;
  maxMultiplier: number;
  maxCascadeStreak: number;
  consecutiveCascadesCount: number;
  assetHoppingCount: number;
  directionFlippingCount: number;
  worstEscalationTradePair?: IPostLossTradePair;
  multiplierTiers: IPostLossEscalationTier[];
  latencyBuckets: IPostLossLatencyBucket[];
  tradePairs: IPostLossTradePair[];
  counterfactualCurve: IPostLossCounterfactualPoint[];
  counterfactualCapitalSaved: number;
}

export interface ISizingTierSummary {
  tierKey: string;
  label: string;
  minQuantity: number;
  maxQuantity: number;
  tradeCount: number;
  tradePercent: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  grossPnL: number;
  netPnL: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;
  avgRMultiple: number;
  expectancyPerTrade: number;
  maxDrawdownInTier: number;
  pnlSharePercent: number;
  drawdownContributionPercent: number;
  verdict: SizingTierVerdict;
}

export interface ISizingProgressionPoint {
  tradeIndex: number;
  tradeId: string;
  date: string;
  symbol: string;
  quantity: number;
  actualPnL: number;
  actualCumulativePnL: number;
  flatBaseCumulativePnL: number;
  constantSizeCumulativePnL: number;
  isWin: boolean;
  isEscalation: boolean;
  isRevengeEscalation: boolean;
  realizedR?: number;
}

export interface ISizingTriggerAnalysis {
  totalEscalations: number;
  compoundingEscalations: number;
  revengeEscalations: number;
  compoundingWinRate: number;
  revengeWinRate: number;
  compoundingAvgPnL: number;
  revengeAvgPnL: number;
  revengeEscalationRate: number;
}

export interface ISizingAnalyticsResult {
  summary: {
    totalTrades: number;
    actualTotalNetPnL: number;
    normalizedConstantPnL: number;
    baseLotQuantity: number;
    averageLotQuantity: number;
    sizingAlpha: number;
    sizingAlphaVerdict: SizingAlphaVerdict;
    sizingHealthGrade: SizingHealthGrade;
    sizingHealthScore: number;
    mostProfitableTier: string;
    leastProfitableTier: string;
    maxDrawdownActual: number;
    maxDrawdownConstant: number;
    insights: string[];
  };
  tiers: ISizingTierSummary[];
  progression: ISizingProgressionPoint[];
  triggerAnalysis: ISizingTriggerAnalysis;
  postLossReport: IPostLossSizingReport;
  availableSymbols?: string[];
  selectedSymbol?: string;
}

/**
 * Calculates peak-to-trough max drawdown on an array of cumulative values.
 */
function calculateMaxDrawdown(cumValues: number[]): number {
  if (cumValues.length === 0) return 0;
  let peak = cumValues[0];
  let maxDd = 0;
  for (const v of cumValues) {
    if (v > peak) {
      peak = v;
    }
    const dd = peak - v;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }
  return Number(maxDd.toFixed(2));
}

/**
 * Evaluates position sizing evolution, tier-by-tier metrics, and sizing alpha.
 */
export function calculatePositionSizingDiagnostics(
  trades: SizingAnalyticsTradeInput[]
): ISizingAnalyticsResult {
  // 1. Filter valid closed trades with positive quantity
  const validTrades = trades
    .filter(
      (t) =>
        t &&
        t.quantity > 0 &&
        Number.isFinite(t.quantity) &&
        Number.isFinite(t.netPnL) &&
        (!t.status || t.status === 'CLOSED')
    )
    .sort((a, b) => {
      const timeA = new Date(a.entryTime || a.tradeDate).getTime();
      const timeB = new Date(b.entryTime || b.tradeDate).getTime();
      return timeA - timeB;
    });

  if (validTrades.length === 0) {
    return {
      summary: {
        totalTrades: 0,
        actualTotalNetPnL: 0,
        normalizedConstantPnL: 0,
        baseLotQuantity: 0,
        averageLotQuantity: 0,
        sizingAlpha: 0,
        sizingAlphaVerdict: 'NEUTRAL',
        sizingHealthGrade: 'A',
        sizingHealthScore: 100,
        mostProfitableTier: 'None',
        leastProfitableTier: 'None',
        maxDrawdownActual: 0,
        maxDrawdownConstant: 0,
        insights: ['No closed trades with valid position sizing found.'],
      },
      tiers: [],
      progression: [],
      triggerAnalysis: {
        totalEscalations: 0,
        compoundingEscalations: 0,
        revengeEscalations: 0,
        compoundingWinRate: 0,
        revengeWinRate: 0,
        compoundingAvgPnL: 0,
        revengeAvgPnL: 0,
        revengeEscalationRate: 0,
      },
      postLossReport: {
        totalLossTrades: 0,
        escalationCount: 0,
        escalationRate: 0,
        totalEscalationNetPnL: 0,
        sizingAlphaDeficit: 0,
        escalationWinRate: 0,
        baselineWinRate: 0,
        avgMultiplier: 1,
        maxMultiplier: 1,
        maxCascadeStreak: 0,
        consecutiveCascadesCount: 0,
        assetHoppingCount: 0,
        directionFlippingCount: 0,
        multiplierTiers: [],
        latencyBuckets: [],
        tradePairs: [],
        counterfactualCurve: [],
        counterfactualCapitalSaved: 0,
      },
    };
  }

  // 2. Identify base quantity and average quantity
  const quantities = validTrades.map((t) => t.quantity);
  const minQty = Math.min(...quantities);
  const totalVolume = quantities.reduce((acc, q) => acc + q, 0);
  const avgQty = Number((totalVolume / validTrades.length).toFixed(4));

  // 3. Dynamic Tier Bucketing:
  // If unique quantities <= 6, map each distinct quantity directly (e.g. 0.01, 0.02, 0.04)
  const uniqueQuantities = Array.from(new Set(quantities)).sort((a, b) => a - b);
  let tierDefinitions: Array<{ key: string; label: string; min: number; max: number }>;

  const formatLotLabel = (val: number) => Number(val.toFixed(4)).toString();

  if (uniqueQuantities.length <= 6) {
    tierDefinitions = uniqueQuantities.map((q) => ({
      key: String(q),
      label: `${formatLotLabel(q)} Lot${q !== 1 ? 's' : ''}`,
      min: q,
      max: q,
    }));
  } else {
    // Quantile-based / range clustering into up to 5 tiers
    const qCount = uniqueQuantities.length;
    const step = Math.ceil(qCount / 4);
    tierDefinitions = [];
    for (let i = 0; i < qCount; i += step) {
      const slice = uniqueQuantities.slice(i, i + step);
      const minVal = slice[0];
      const maxVal = slice[slice.length - 1];
      const label =
        minVal === maxVal
          ? `${formatLotLabel(minVal)} Lots`
          : `${formatLotLabel(minVal)} - ${formatLotLabel(maxVal)} Lots`;
      tierDefinitions.push({
        key: `${minVal}_${maxVal}`,
        label,
        min: minVal,
        max: maxVal,
      });
    }
  }

  // 4. Calculate progression & escalation triggers
  let actualCum = new Decimal(0);
  let flatBaseCum = new Decimal(0);
  let constantCum = new Decimal(0);
  let disciplinedPostLossCum = new Decimal(0);

  const actualCumArray: number[] = [];
  const constantCumArray: number[] = [];
  const progression: ISizingProgressionPoint[] = [];
  const counterfactualCurve: IPostLossCounterfactualPoint[] = [];
  const postLossTradePairs: IPostLossTradePair[] = [];
  let totalSizingAlphaDeficit = new Decimal(0);

  let compoundingEscalations = 0;
  let revengeEscalations = 0;
  const compoundingTrades: SizingAnalyticsTradeInput[] = [];
  const revengeTrades: SizingAnalyticsTradeInput[] = [];

  let currentCascadeStreak = 0;
  let maxCascadeStreak = 0;
  let consecutiveCascadesCount = 0;
  let assetHoppingCount = 0;
  let directionFlippingCount = 0;

  for (let i = 0; i < validTrades.length; i++) {
    const trade = validTrades[i];
    const prevTrade = i > 0 ? validTrades[i - 1] : null;

    const dActual = new Decimal(trade.netPnL);
    const dQty = new Decimal(trade.quantity);
    const dMin = new Decimal(minQty);
    const dAvg = new Decimal(avgQty);

    actualCum = actualCum.plus(dActual);
    actualCumArray.push(Number(actualCum.toFixed(2)));

    // Flat base PnL (as if traded at minQty)
    const dFlatBasePnL = dActual.times(dMin).dividedBy(dQty);
    flatBaseCum = flatBaseCum.plus(dFlatBasePnL);

    // Constant size PnL (as if traded at identical volume avgQty)
    const dConstantPnL = dActual.times(dAvg).dividedBy(dQty);
    constantCum = constantCum.plus(dConstantPnL);
    constantCumArray.push(Number(constantCum.toFixed(2)));

    // Check escalation from previous trade
    let isEscalation = false;
    let isRevengeEscalation = false;
    let dDisciplined = dActual;

    if (prevTrade && trade.quantity > prevTrade.quantity) {
      isEscalation = true;
      if (prevTrade.netPnL < 0) {
        isRevengeEscalation = true;
        revengeEscalations++;
        revengeTrades.push(trade);

        // Calculate disciplined counterfactual PnL (as if trade kept previous trade's quantity)
        dDisciplined = dActual.times(new Decimal(prevTrade.quantity)).dividedBy(dQty);
        const diff = dActual.minus(dDisciplined);
        totalSizingAlphaDeficit = totalSizingAlphaDeficit.plus(diff);

        const multiplier = Number(dQty.dividedBy(new Decimal(prevTrade.quantity)).toFixed(2));

        // Cooldown calculation in minutes
        let cooldownMinutes: number | undefined;
        const prevEnd = prevTrade.exitTime || prevTrade.entryTime || prevTrade.tradeDate;
        const currStart = trade.entryTime || trade.tradeDate;
        if (prevEnd && currStart) {
          const diffMs = new Date(currStart).getTime() - new Date(prevEnd).getTime();
          if (diffMs >= 0) {
            cooldownMinutes = Math.round(diffMs / 60000);
          }
        }

        // Cascade depth tracking
        if (currentCascadeStreak > 0) {
          currentCascadeStreak++;
          consecutiveCascadesCount++;
        } else {
          currentCascadeStreak = 1;
        }
        maxCascadeStreak = Math.max(maxCascadeStreak, currentCascadeStreak);

        const directionFlip = Boolean(
          trade.direction && prevTrade.direction && trade.direction !== prevTrade.direction
        );
        if (directionFlip) directionFlippingCount++;

        const assetHopped = Boolean(
          trade.symbol &&
            prevTrade.symbol &&
            trade.symbol.toUpperCase().trim() !== prevTrade.symbol.toUpperCase().trim()
        );
        if (assetHopped) assetHoppingCount++;

        postLossTradePairs.push({
          lossTradeId: prevTrade.id || `trade-${i}`,
          lossDate: new Date(prevTrade.tradeDate).toISOString().split('T')[0],
          lossSymbol: prevTrade.symbol || 'N/A',
          lossDirection: prevTrade.direction,
          lossQuantity: prevTrade.quantity,
          lossPnL: Number(new Decimal(prevTrade.netPnL).toFixed(2)),
          lossRMultiple: prevTrade.realizedRMultiple,

          upsizedTradeId: trade.id || `trade-${i + 1}`,
          upsizedDate: new Date(trade.tradeDate).toISOString().split('T')[0],
          upsizedSymbol: trade.symbol || 'N/A',
          upsizedDirection: trade.direction,
          upsizedQuantity: trade.quantity,
          upsizedPnL: Number(dActual.toFixed(2)),
          upsizedRMultiple: trade.realizedRMultiple,

          sizingMultiplier: multiplier,
          cooldownMinutes,
          isConsecutiveCascade: currentCascadeStreak > 1,
          cascadeDepth: currentCascadeStreak,
          directionFlip,
          assetHopped,
        });

        // If this upsized trade was a win, break the cascade streak
        if (trade.netPnL >= 0) {
          currentCascadeStreak = 0;
        }
      } else {
        compoundingEscalations++;
        compoundingTrades.push(trade);
        currentCascadeStreak = 0;
      }
    } else {
      currentCascadeStreak = 0;
    }

    disciplinedPostLossCum = disciplinedPostLossCum.plus(dDisciplined);
    counterfactualCurve.push({
      tradeIndex: i + 1,
      tradeId: trade.id || `trade-${i + 1}`,
      date: new Date(trade.tradeDate).toISOString().split('T')[0],
      actualPnL: Number(dActual.toFixed(2)),
      actualCumulativePnL: Number(actualCum.toFixed(2)),
      disciplinedPnL: Number(dDisciplined.toFixed(2)),
      disciplinedCumulativePnL: Number(disciplinedPostLossCum.toFixed(2)),
    });

    progression.push({
      tradeIndex: i + 1,
      tradeId: trade.id || `trade-${i + 1}`,
      date: new Date(trade.tradeDate).toISOString().split('T')[0],
      symbol: trade.symbol || 'N/A',
      quantity: trade.quantity,
      actualPnL: Number(dActual.toFixed(2)),
      actualCumulativePnL: Number(actualCum.toFixed(2)),
      flatBaseCumulativePnL: Number(flatBaseCum.toFixed(2)),
      constantSizeCumulativePnL: Number(constantCum.toFixed(2)),
      isWin: trade.netPnL > 0,
      isEscalation,
      isRevengeEscalation,
      realizedR: trade.realizedRMultiple,
    });
  }

  // 5. Tier Breakdown Computations
  const totalNetPnL = Number(actualCum.toFixed(2));
  const totalConstantPnL = Number(constantCum.toFixed(2));
  const sizingAlpha = Number(new Decimal(totalNetPnL).minus(new Decimal(totalConstantPnL)).toFixed(2));

  let totalDrawdownAllTiers = 0;
  const rawTierSummaries: Array<ISizingTierSummary & { maxDd: number }> = [];

  for (const tDef of tierDefinitions) {
    const tierTrades = validTrades.filter(
      (t) => t.quantity >= tDef.min && t.quantity <= tDef.max
    );

    if (tierTrades.length === 0) continue;

    let tierGross = new Decimal(0);
    let tierNet = new Decimal(0);
    let wins = 0;
    let losses = 0;
    let be = 0;
    let winSum = new Decimal(0);
    let lossSum = new Decimal(0);
    let rSum = 0;
    let rCount = 0;

    let tierCum = 0;
    const tierCumSeries: number[] = [];

    for (const t of tierTrades) {
      const pnl = t.netPnL;
      tierCum += pnl;
      tierCumSeries.push(tierCum);

      tierNet = tierNet.plus(new Decimal(pnl));
      if (t.grossPnL !== undefined) {
        tierGross = tierGross.plus(new Decimal(t.grossPnL));
      } else {
        tierGross = tierGross.plus(new Decimal(pnl));
      }

      if (pnl > 0) {
        wins++;
        winSum = winSum.plus(new Decimal(pnl));
      } else if (pnl < 0) {
        losses++;
        lossSum = lossSum.plus(new Decimal(Math.abs(pnl)));
      } else {
        be++;
      }

      if (t.realizedRMultiple !== undefined && Number.isFinite(t.realizedRMultiple)) {
        rSum += t.realizedRMultiple;
        rCount++;
      }
    }

    const tierNetNum = Number(tierNet.toFixed(2));
    const tierGrossNum = Number(tierGross.toFixed(2));
    const winRate = Number(((wins / tierTrades.length) * 100).toFixed(1));

    // Profit Factor calculation
    let profitFactor = 0;
    if (lossSum.isZero()) {
      profitFactor = winSum.greaterThan(0) ? 999.99 : 0;
    } else {
      profitFactor = Number(winSum.dividedBy(lossSum).toFixed(2));
    }

    const avgWin = wins > 0 ? Number(winSum.dividedBy(wins).toFixed(2)) : 0;
    const avgLoss = losses > 0 ? Number(lossSum.dividedBy(losses).toFixed(2)) : 0;
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : (avgWin > 0 ? 999.99 : 0);
    const avgRMultiple = rCount > 0 ? Number((rSum / rCount).toFixed(2)) : 0;
    const expectancyPerTrade = Number((tierNetNum / tierTrades.length).toFixed(2));
    const maxDdInTier = calculateMaxDrawdown(tierCumSeries);
    totalDrawdownAllTiers += maxDdInTier;

    // Verdict classification
    let verdict: SizingTierVerdict = 'HEALTHY';
    if (tierNetNum < 0 || profitFactor < 1.0) {
      verdict = 'VALUE_DESTRUCTIVE';
    } else if (profitFactor >= 1.75 && winRate >= 50) {
      verdict = 'OPTIMAL';
    } else if (profitFactor >= 1.25) {
      verdict = 'HEALTHY';
    } else {
      verdict = 'MARGINAL';
    }

    rawTierSummaries.push({
      tierKey: tDef.key,
      label: tDef.label,
      minQuantity: tDef.min,
      maxQuantity: tDef.max,
      tradeCount: tierTrades.length,
      tradePercent: Number(((tierTrades.length / validTrades.length) * 100).toFixed(1)),
      winningTrades: wins,
      losingTrades: losses,
      breakevenTrades: be,
      winRate,
      grossPnL: tierGrossNum,
      netPnL: tierNetNum,
      profitFactor,
      avgWin,
      avgLoss,
      payoffRatio,
      avgRMultiple,
      expectancyPerTrade,
      maxDrawdownInTier: maxDdInTier,
      pnlSharePercent: totalNetPnL !== 0 ? Number(((tierNetNum / Math.abs(totalNetPnL)) * 100).toFixed(1)) : 0,
      drawdownContributionPercent: 0, // populated next
      verdict,
      maxDd: maxDdInTier,
    });
  }

  // Populate drawdown contribution share
  const tiers: ISizingTierSummary[] = rawTierSummaries.map((t) => {
    const ddShare =
      totalDrawdownAllTiers > 0
        ? Number(((t.maxDd / totalDrawdownAllTiers) * 100).toFixed(1))
        : 0;
    const { maxDd, ...rest } = t;
    return { ...rest, drawdownContributionPercent: ddShare };
  });

  // 6. Escalation Trigger Stats
  const totalEscalations = compoundingEscalations + revengeEscalations;
  const revengeEscalationRate =
    totalEscalations > 0 ? Number(((revengeEscalations / totalEscalations) * 100).toFixed(1)) : 0;

  const compoundingWins = compoundingTrades.filter((t) => t.netPnL > 0).length;
  const compoundingWinRate =
    compoundingTrades.length > 0
      ? Number(((compoundingWins / compoundingTrades.length) * 100).toFixed(1))
      : 0;
  const compoundingAvgPnL =
    compoundingTrades.length > 0
      ? Number(
          (
            compoundingTrades.reduce((acc, t) => acc + t.netPnL, 0) /
            compoundingTrades.length
          ).toFixed(2)
        )
      : 0;

  const revengeWins = revengeTrades.filter((t) => t.netPnL > 0).length;
  const revengeWinRate =
    revengeTrades.length > 0
      ? Number(((revengeWins / revengeTrades.length) * 100).toFixed(1))
      : 0;
  const revengeAvgPnL =
    revengeTrades.length > 0
      ? Number(
          (
            revengeTrades.reduce((acc, t) => acc + t.netPnL, 0) /
            revengeTrades.length
          ).toFixed(2)
        )
      : 0;

  // 6b. Post-Loss Sizing Escalation Report Computations
  const totalLossTrades = validTrades.filter((t) => t.netPnL < 0).length;
  const tradesFollowingLoss = validTrades.filter((_, idx) => idx > 0 && validTrades[idx - 1].netPnL < 0);
  const postLossEscalationRate =
    tradesFollowingLoss.length > 0
      ? Number(((revengeTrades.length / tradesFollowingLoss.length) * 100).toFixed(1))
      : 0;

  const baselineWins = validTrades.filter((t) => t.netPnL > 0).length;
  const baselineWinRate =
    validTrades.length > 0 ? Number(((baselineWins / validTrades.length) * 100).toFixed(1)) : 0;

  const multipliers = postLossTradePairs.map((p) => p.sizingMultiplier);
  const avgMultiplier =
    multipliers.length > 0
      ? Number((multipliers.reduce((acc, m) => acc + m, 0) / multipliers.length).toFixed(2))
      : 1;
  const maxMultiplier = multipliers.length > 0 ? Math.max(...multipliers) : 1;

  const totalEscalationNetPnL = Number(
    revengeTrades.reduce((acc, t) => acc.plus(new Decimal(t.netPnL)), new Decimal(0)).toFixed(2)
  );
  const sizingAlphaDeficit = Number(totalSizingAlphaDeficit.toFixed(2));
  const counterfactualCapitalSaved = Number(totalSizingAlphaDeficit.negated().toFixed(2));

  // Multiplier tiers:
  const multiplierTierDefs: Array<{
    key: PostLossMultiplierTierKey;
    label: string;
    range: string;
    filter: (m: number) => boolean;
  }> = [
    { key: 'MILD_DRIFT', label: 'Mild Sizing Drift', range: '1.05x – 1.49x', filter: (m) => m < 1.5 },
    { key: 'AGGRESSIVE', label: 'Aggressive Escalation', range: '1.50x – 1.99x', filter: (m) => m >= 1.5 && m < 2.0 },
    { key: 'MARTINGALE_2X', label: 'Classic 2x Martingale', range: '2.00x – 2.99x', filter: (m) => m >= 2.0 && m < 3.0 },
    { key: 'EXTREME_BLOWOUT', label: 'Extreme Sizing Blowout', range: '≥ 3.00x', filter: (m) => m >= 3.0 },
  ];

  const postLossMultiplierTiers: IPostLossEscalationTier[] = multiplierTierDefs.map((def) => {
    const matchingPairs = postLossTradePairs.filter((p) => def.filter(p.sizingMultiplier));
    const count = matchingPairs.length;
    const wins = matchingPairs.filter((p) => p.upsizedPnL > 0).length;
    const winRate = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0;
    const netPnL = Number(
      matchingPairs.reduce((acc, p) => acc.plus(new Decimal(p.upsizedPnL)), new Decimal(0)).toFixed(2)
    );
    const avgPnL = count > 0 ? Number((netPnL / count).toFixed(2)) : 0;
    return {
      tierKey: def.key,
      label: def.label,
      multiplierRange: def.range,
      count,
      winRate,
      netPnL,
      avgPnL,
      tradeIds: matchingPairs.map((p) => p.upsizedTradeId),
    };
  });

  // Latency buckets:
  const latencyDefs: Array<{
    key: PostLossLatencyBucketKey;
    label: string;
    filter: (min?: number) => boolean;
  }> = [
    { key: 'FLASH_REVENGE', label: 'Flash Revenge (< 5 min)', filter: (min) => min !== undefined && min < 5 },
    { key: 'SIMMERING_TILT', label: 'Simmering Tilt (5 – 15 min)', filter: (min) => min !== undefined && min >= 5 && min <= 15 },
    { key: 'COOLING_DOWN', label: 'Cooling Down (15 – 60 min)', filter: (min) => min !== undefined && min > 15 && min <= 60 },
    { key: 'RESET_SESSION', label: 'Next Session / Reset (> 60 min)', filter: (min) => min === undefined || min > 60 },
  ];

  const postLossLatencyBuckets: IPostLossLatencyBucket[] = latencyDefs.map((def) => {
    const matchingPairs = postLossTradePairs.filter((p) => def.filter(p.cooldownMinutes));
    const count = matchingPairs.length;
    const wins = matchingPairs.filter((p) => p.upsizedPnL > 0).length;
    const winRate = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0;
    const netPnL = Number(
      matchingPairs.reduce((acc, p) => acc.plus(new Decimal(p.upsizedPnL)), new Decimal(0)).toFixed(2)
    );
    const avgPnL = count > 0 ? Number((netPnL / count).toFixed(2)) : 0;
    return {
      bucketKey: def.key,
      label: def.label,
      count,
      winRate,
      netPnL,
      avgPnL,
      tradeIds: matchingPairs.map((p) => p.upsizedTradeId),
    };
  });

  const worstEscalationTradePair =
    postLossTradePairs.length > 0
      ? [...postLossTradePairs].sort((a, b) => a.upsizedPnL - b.upsizedPnL)[0]
      : undefined;

  const postLossReport: IPostLossSizingReport = {
    totalLossTrades,
    escalationCount: revengeTrades.length,
    escalationRate: postLossEscalationRate,
    totalEscalationNetPnL,
    sizingAlphaDeficit,
    escalationWinRate: revengeWinRate,
    baselineWinRate,
    avgMultiplier,
    maxMultiplier,
    maxCascadeStreak,
    consecutiveCascadesCount,
    assetHoppingCount,
    directionFlippingCount,
    worstEscalationTradePair,
    multiplierTiers: postLossMultiplierTiers,
    latencyBuckets: postLossLatencyBuckets,
    tradePairs: postLossTradePairs,
    counterfactualCurve,
    counterfactualCapitalSaved,
  };

  // 7. Sizing Alpha & Health Scoring
  let sizingAlphaVerdict: SizingAlphaVerdict = 'NEUTRAL';
  if (sizingAlpha > 0) {
    sizingAlphaVerdict = 'POSITIVE_ALPHA';
  } else if (sizingAlpha < 0) {
    sizingAlphaVerdict = 'VALUE_DESTRUCTIVE';
  }

  // Calculate health score (0 - 100)
  let healthScore = 70; // baseline
  if (sizingAlpha > 0) healthScore += 15;
  if (sizingAlpha < 0) healthScore -= 20;

  // Penalty if revenge escalation rate > 25%
  if (revengeEscalationRate > 35) {
    healthScore -= 25;
  } else if (revengeEscalationRate > 20) {
    healthScore -= 15;
  } else if (totalEscalations > 0 && revengeEscalationRate <= 10) {
    healthScore += 10;
  }

  // Penalty if the largest size tier is net negative
  const largestTier = tiers[tiers.length - 1];
  if (largestTier && largestTier.netPnL < 0) {
    healthScore -= 20;
  } else if (largestTier && largestTier.profitFactor >= 1.5) {
    healthScore += 10;
  }

  healthScore = Math.max(10, Math.min(100, healthScore));

  let sizingHealthGrade: SizingHealthGrade = 'C';
  if (healthScore >= 85) sizingHealthGrade = 'A';
  else if (healthScore >= 70) sizingHealthGrade = 'B';
  else if (healthScore >= 50) sizingHealthGrade = 'C';
  else if (healthScore >= 35) sizingHealthGrade = 'D';
  else sizingHealthGrade = 'F';

  // 8. Generate Actionable Insights
  const insights: string[] = [];
  if (sizingAlpha > 0) {
    insights.push(
      `Your sizing progression produced +${sizingAlpha.toLocaleString()} in Positive Sizing Alpha compared to trading constant lot size.`
    );
  } else if (sizingAlpha < 0) {
    insights.push(
      `Sizing escalation cost you ${Math.abs(sizingAlpha).toLocaleString()} compared to if you had traded constant lot size throughout.`
    );
  }

  if (revengeEscalationRate > 25) {
    insights.push(
      `Warning: ${revengeEscalationRate}% of your size increases occurred directly following a loss (Martingale tilt pattern). These trades averaged ${revengeAvgPnL} per trade.`
    );
  }

  if (largestTier && largestTier.verdict === 'VALUE_DESTRUCTIVE') {
    insights.push(
      `Critical: Your largest tier (${largestTier.label}) is currently net negative (${largestTier.netPnL.toLocaleString()}) with a Profit Factor of ${largestTier.profitFactor}. Consider locking your max size to ${tiers[0]?.label || 'starter tier'}.`
    );
  }

  if (postLossReport.escalationCount > 0 && counterfactualCapitalSaved > 0) {
    insights.push(
      `Post-Loss Sizing Damage: Sizing up after losses destroyed ${counterfactualCapitalSaved.toLocaleString()} compared to if you had maintained disciplined flat sizing after every loss.`
    );
  }

  if (maxCascadeStreak >= 2) {
    insights.push(
      `Martingale Cascade Warning: Detected a streak of ${maxCascadeStreak} consecutive losses where position size was aggressively escalated.`
    );
  }

  const sortedByPnL = [...tiers].sort((a, b) => b.netPnL - a.netPnL);
  const mostProfitableTier = sortedByPnL[0]?.label || 'None';
  const leastProfitableTier = sortedByPnL[sortedByPnL.length - 1]?.label || 'None';

  return {
    summary: {
      totalTrades: validTrades.length,
      actualTotalNetPnL: totalNetPnL,
      normalizedConstantPnL: totalConstantPnL,
      baseLotQuantity: minQty,
      averageLotQuantity: avgQty,
      sizingAlpha,
      sizingAlphaVerdict,
      sizingHealthGrade,
      sizingHealthScore: healthScore,
      mostProfitableTier,
      leastProfitableTier,
      maxDrawdownActual: calculateMaxDrawdown(actualCumArray),
      maxDrawdownConstant: calculateMaxDrawdown(constantCumArray),
      insights,
    },
    tiers,
    progression,
    triggerAnalysis: {
      totalEscalations,
      compoundingEscalations,
      revengeEscalations,
      compoundingWinRate,
      revengeWinRate,
      compoundingAvgPnL,
      revengeAvgPnL,
      revengeEscalationRate,
    },
    postLossReport,
  };
}

