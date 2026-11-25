import Decimal from './decimal.js';

export interface SizingAnalyticsTradeInput {
  id?: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  symbol?: string;
  direction?: 'LONG' | 'SHORT';
  quantity: number;
  netPnL: number;
  grossPnL?: number;
  realizedRMultiple?: number;
  disciplineScore?: number;
  status?: string;
}

export type SizingTierVerdict = 'OPTIMAL' | 'HEALTHY' | 'MARGINAL' | 'VALUE_DESTRUCTIVE';
export type SizingAlphaVerdict = 'POSITIVE_ALPHA' | 'NEUTRAL' | 'VALUE_DESTRUCTIVE';
export type SizingHealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

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

  const actualCumArray: number[] = [];
  const constantCumArray: number[] = [];
  const progression: ISizingProgressionPoint[] = [];

  let compoundingEscalations = 0;
  let revengeEscalations = 0;
  const compoundingTrades: SizingAnalyticsTradeInput[] = [];
  const revengeTrades: SizingAnalyticsTradeInput[] = [];

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

    if (prevTrade && trade.quantity > prevTrade.quantity) {
      isEscalation = true;
      if (prevTrade.netPnL < 0) {
        isRevengeEscalation = true;
        revengeEscalations++;
        revengeTrades.push(trade);
      } else {
        compoundingEscalations++;
        compoundingTrades.push(trade);
      }
    }

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
  };
}

