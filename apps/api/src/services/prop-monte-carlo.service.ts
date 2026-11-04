export interface IPropRiskTierSimulation {
  riskPct: number;
  riskAmountUsd: number;
  xauusdLots10DollarSl: number;
  passProbabilityPct: number;
  dailyBreachRiskPct: number;
  maxDdBreachRiskPct: number;
  totalBreachRiskPct: number;
  survivalRatePct: number;
  p25TradesToPass: number | null;
  medianTradesToPass: number | null;
  p75TradesToPass: number | null;
  medianDaysToPass: number | null;
  maxLosingStreak95Pct: number;
  streakDrawdownUsd: number;
  isOptimal: boolean;
}

export interface IPropMonteCarloResult {
  simulationsCount: number;
  currentEquity: number;
  targetEquity: number;
  remainingToTargetUsd: number;
  maxLossFloorUsd: number;
  dailyLossLimitPct: number;
  actualEdge: {
    sampleSize: number;
    winCount: number;
    lossCount: number;
    winRatePct: number;
    avgWinUsd: number;
    avgLossUsd: number;
    payoffRatio: number;
    profitFactor: number;
    expectancyR: number;
    expectancyUsd: number;
    hasPositiveEdge: boolean;
  };
  scenarios: {
    actual: {
      label: string;
      winRatePct: number;
      payoffRatio: number;
      expectancyR: number;
      recommendedRiskPct: number;
      tiers: IPropRiskTierSimulation[];
    };
    target1to2: {
      label: string;
      winRatePct: number;
      payoffRatio: number;
      expectancyR: number;
      recommendedRiskPct: number;
      tiers: IPropRiskTierSimulation[];
    };
  };
}

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runScenarioTiers(params: {
  initialBalance: number;
  currentEquity: number;
  targetEquity: number;
  maxLossFloor: number;
  dailyLossLimitPct: number;
  winRate: number; // 0..1
  payoffRatio: number;
  simulationsCount: number;
  seedBase: number;
}): { recommendedRiskPct: number; tiers: IPropRiskTierSimulation[] } {
  const {
    initialBalance,
    currentEquity,
    targetEquity,
    maxLossFloor,
    dailyLossLimitPct,
    winRate,
    payoffRatio,
    simulationsCount,
    seedBase,
  } = params;

  const riskTiers = [0.25, 0.5, 0.75, 1.0];
  const maxTradesPerPath = 150;
  const tradesPerDay = 3;

  const tiers: IPropRiskTierSimulation[] = riskTiers.map((riskPct, tierIdx) => {
    const rng = createMulberry32(seedBase + tierIdx * 7919);
    const riskAmountUsd = Number(((initialBalance * riskPct) / 100).toFixed(2));
    // On XAUUSD, 1.00 lot ($100/pt) with a $10.00 SL = $1,000 risk
    const xauusdLots10DollarSl = Number((riskAmountUsd / 1000).toFixed(2));

    let passedCount = 0;
    let dailyBreachCount = 0;
    let maxDdBreachCount = 0;
    const tradesToPassList: number[] = [];
    const maxStreaks: number[] = [];

    for (let sim = 0; sim < simulationsCount; sim++) {
      let equity = currentEquity;
      let dayStartHighWater = equity;
      let dailyFloor = dayStartHighWater * (1 - dailyLossLimitPct / 100);
      let currentLosingStreak = 0;
      let worstStreakInPath = 0;

      if (equity >= targetEquity) {
        passedCount++;
        tradesToPassList.push(1);
        maxStreaks.push(0);
        continue;
      }

      for (let t = 1; t <= maxTradesPerPath; t++) {
        // Start of a new trading day every `tradesPerDay` trades: EOD High-Water Mark reset
        if (t > 1 && (t - 1) % tradesPerDay === 0) {
          dayStartHighWater = equity;
          dailyFloor = dayStartHighWater * (1 - dailyLossLimitPct / 100);
        }

        const u = rng();
        // Slight realistic execution jitter (0.90 to 1.10)
        const jitter = 0.9 + rng() * 0.2;

        if (u < winRate) {
          equity += riskAmountUsd * payoffRatio * jitter;
          currentLosingStreak = 0;
        } else {
          equity -= riskAmountUsd * jitter;
          currentLosingStreak++;
          if (currentLosingStreak > worstStreakInPath) {
            worstStreakInPath = currentLosingStreak;
          }
        }

        if (equity <= maxLossFloor) {
          maxDdBreachCount++;
          break;
        }
        if (equity <= dailyFloor) {
          dailyBreachCount++;
          break;
        }
        if (equity >= targetEquity) {
          passedCount++;
          tradesToPassList.push(t);
          break;
        }
      }

      maxStreaks.push(worstStreakInPath);
    }

    tradesToPassList.sort((a, b) => a - b);
    maxStreaks.sort((a, b) => a - b);

    const p25Trades =
      tradesToPassList.length > 0
        ? tradesToPassList[Math.floor(tradesToPassList.length * 0.25)]
        : null;
    const medianTrades =
      tradesToPassList.length > 0
        ? tradesToPassList[Math.floor(tradesToPassList.length * 0.5)]
        : null;
    const p75Trades =
      tradesToPassList.length > 0
        ? tradesToPassList[Math.floor(tradesToPassList.length * 0.75)]
        : null;
    const medianDays = medianTrades !== null ? Math.max(1, Math.ceil(medianTrades / tradesPerDay)) : null;

    const streak95 =
      maxStreaks.length > 0 ? maxStreaks[Math.floor(maxStreaks.length * 0.95)] : 4;

    const passProbabilityPct = Number(((passedCount / simulationsCount) * 100).toFixed(1));
    const dailyBreachRiskPct = Number(((dailyBreachCount / simulationsCount) * 100).toFixed(1));
    const maxDdBreachRiskPct = Number(((maxDdBreachCount / simulationsCount) * 100).toFixed(1));
    const totalBreachRiskPct = Number((dailyBreachRiskPct + maxDdBreachRiskPct).toFixed(1));
    const survivalRatePct = Number(Math.max(0, 100 - totalBreachRiskPct).toFixed(1));

    return {
      riskPct,
      riskAmountUsd,
      xauusdLots10DollarSl,
      passProbabilityPct,
      dailyBreachRiskPct,
      maxDdBreachRiskPct,
      totalBreachRiskPct,
      survivalRatePct,
      p25TradesToPass: p25Trades,
      medianTradesToPass: medianTrades,
      p75TradesToPass: p75Trades,
      medianDaysToPass: medianDays,
      maxLosingStreak95Pct: streak95,
      streakDrawdownUsd: Number((streak95 * riskAmountUsd).toFixed(0)),
      isOptimal: false,
    };
  });

  // Choose optimal tier: maximize passProbabilityPct - 1.35 * totalBreachRiskPct
  let bestIdx = 1; // Default 0.50%
  let bestScore = -Infinity;
  tiers.forEach((t, idx) => {
    const score = t.passProbabilityPct - 1.35 * t.totalBreachRiskPct;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  tiers[bestIdx].isOptimal = true;

  return {
    recommendedRiskPct: tiers[bestIdx].riskPct,
    tiers,
  };
}

export class PropMonteCarloService {
  static simulateAccount(params: {
    initialBalance: number;
    currentEquity: number;
    targetProfitPercent: number;
    dailyLossLimitPercent: number;
    maxLossLimitPercent: number;
    trades: any[];
  }): IPropMonteCarloResult {
    const {
      initialBalance,
      currentEquity,
      targetProfitPercent,
      dailyLossLimitPercent,
      maxLossLimitPercent,
      trades,
    } = params;

    const effTargetPct = targetProfitPercent > 0 ? targetProfitPercent : 10;
    const targetEquity = Number((initialBalance * (1 + effTargetPct / 100)).toFixed(2));
    const remainingToTargetUsd = Number(Math.max(0, targetEquity - currentEquity).toFixed(2));
    const maxLossFloorUsd = Number((initialBalance * (1 - maxLossLimitPercent / 100)).toFixed(2));

    const closedTrades = (trades || []).filter((t) => t.status === 'CLOSED');
    const sampleSize = closedTrades.length;

    let winCount = 0;
    let lossCount = 0;
    let grossWinSum = 0;
    let grossLossSum = 0;
    let netPnLSum = 0;

    for (const t of closedTrades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      netPnLSum += pnl;
      if (pnl > 0) {
        winCount++;
        grossWinSum += pnl;
      } else if (pnl < 0) {
        lossCount++;
        grossLossSum += Math.abs(pnl);
      }
    }

    const rawWinRate = sampleSize > 0 ? winCount / sampleSize : 0.45;
    const avgWinUsd = winCount > 0 ? Number((grossWinSum / winCount).toFixed(2)) : 500;
    const avgLossUsd = lossCount > 0 ? Number((grossLossSum / lossCount).toFixed(2)) : 250;
    const rawPayoffRatio = avgLossUsd > 0 ? Number((avgWinUsd / avgLossUsd).toFixed(2)) : 2.0;
    const profitFactor =
      grossLossSum > 0
        ? Number((grossWinSum / grossLossSum).toFixed(2))
        : grossWinSum > 0
          ? 99.99
          : 0;
    const expectancyR = Number((rawWinRate * rawPayoffRatio - (1 - rawWinRate)).toFixed(2));
    const expectancyUsd = sampleSize > 0 ? Number((netPnLSum / sampleSize).toFixed(2)) : 0;

    // Effective parameters for Actual Edge simulation (clamped to realistic bounds)
    const simActualWinRate = sampleSize >= 3 ? Math.min(0.85, Math.max(0.15, rawWinRate)) : 0.42;
    const simActualPayoff =
      winCount >= 1 && lossCount >= 1 ? Math.min(5.0, Math.max(0.6, rawPayoffRatio)) : 2.0;

    const simulationsCount = 1500;

    const actualSim = runScenarioTiers({
      initialBalance,
      currentEquity,
      targetEquity,
      maxLossFloor: maxLossFloorUsd,
      dailyLossLimitPct: dailyLossLimitPercent || 3,
      winRate: simActualWinRate,
      payoffRatio: simActualPayoff,
      simulationsCount,
      seedBase: Math.round(currentEquity) + sampleSize * 101,
    });

    const target1to2Sim = runScenarioTiers({
      initialBalance,
      currentEquity,
      targetEquity,
      maxLossFloor: maxLossFloorUsd,
      dailyLossLimitPct: dailyLossLimitPercent || 3,
      winRate: 0.45,
      payoffRatio: 2.0,
      simulationsCount,
      seedBase: 20261104,
    });

    return {
      simulationsCount,
      currentEquity,
      targetEquity,
      remainingToTargetUsd,
      maxLossFloorUsd,
      dailyLossLimitPct: dailyLossLimitPercent || 3,
      actualEdge: {
        sampleSize,
        winCount,
        lossCount,
        winRatePct: Number((rawWinRate * 100).toFixed(1)),
        avgWinUsd,
        avgLossUsd,
        payoffRatio: rawPayoffRatio,
        profitFactor,
        expectancyR,
        expectancyUsd,
        hasPositiveEdge: expectancyR > 0,
      },
      scenarios: {
        actual: {
          label: `Your Actual Edge (${(simActualWinRate * 100).toFixed(1)}% WR • 1:${simActualPayoff.toFixed(2)} RR)`,
          winRatePct: Number((simActualWinRate * 100).toFixed(1)),
          payoffRatio: Number(simActualPayoff.toFixed(2)),
          expectancyR: Number((simActualWinRate * simActualPayoff - (1 - simActualWinRate)).toFixed(2)),
          recommendedRiskPct: actualSim.recommendedRiskPct,
          tiers: actualSim.tiers,
        },
        target1to2: {
          label: 'Target 1:2 RR Plan (45.0% WR • 1:2.00 RR)',
          winRatePct: 45.0,
          payoffRatio: 2.0,
          expectancyR: 0.35,
          recommendedRiskPct: target1to2Sim.recommendedRiskPct,
          tiers: target1to2Sim.tiers,
        },
      },
    };
  }
}

