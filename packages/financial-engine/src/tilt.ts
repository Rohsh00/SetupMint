// ============================================================================
// CONTINUOUS TILT SCORE ENGINE
// ============================================================================

export type TiltLevel = 'CALM' | 'ELEVATED' | 'HIGH_TILT' | 'SEVERE_TILT';

export interface TiltTradeHistoryItem {
  id?: string;
  tradeDate?: string | Date;
  exitTime?: string | Date;
  netPnL: number;
  quantity?: number;
  plannedRiskAmount?: number;
}

export interface TiltWeights {
  lossStreakWeight?: number; // default: 0.30
  sizeEscalationWeight?: number; // default: 0.25
  timeCompressionWeight?: number; // default: 0.25
  dailyLossProximityWeight?: number; // default: 0.20
}

export interface TiltCalculationInput {
  recentTrades: TiltTradeHistoryItem[];
  proposedQuantity?: number;
  proposedRiskAmount?: number;
  proposedEntryTime?: string | Date;
  dailyLossLimit?: number;
  currentDayRealizedLoss?: number;
  weights?: TiltWeights;
}

export interface TiltComponentScores {
  lossStreakScore: number; // [0, 100]
  consecutiveLosses: number;
  sizeEscalationScore: number; // [0, 100]
  sizeEscalationRatio: number;
  timeCompressionScore: number; // [0, 100]
  minutesSinceLastTrade?: number;
  dailyLossProximityScore: number; // [0, 100]
  dailyLossPercent: number;
}

export interface TiltScoreResult {
  score: number; // [0, 100]
  level: TiltLevel;
  components: TiltComponentScores;
  normalizedWeights: {
    w1: number;
    w2: number;
    w3: number;
    w4: number;
  };
  warnings: string[];
  advisoryNote: string;
}

/**
 * Calculates a continuous, deterministic, explainable Tilt Score (0 to 100)
 * reflecting emotional friction and impulsive trading risk.
 *
 * Formula:
 * Tilt = w1 * LossStreak + w2 * SizeEscalation + w3 * TimeCompression + w4 * DailyLossProximity
 *
 * All components normalized to [0, 100].
 * Non-blocking, advisory only.
 */
export function calculateContinuousTiltScore(
  input: TiltCalculationInput
): TiltScoreResult {
  const recentTrades = [...input.recentTrades].sort((a, b) => {
    const timeA = a.exitTime ? new Date(a.exitTime).getTime() : (a.tradeDate ? new Date(a.tradeDate).getTime() : 0);
    const timeB = b.exitTime ? new Date(b.exitTime).getTime() : (b.tradeDate ? new Date(b.tradeDate).getTime() : 0);
    return timeA - timeB;
  });

  // 1. Normalize weights
  const rawW1 = Math.max(0, input.weights?.lossStreakWeight ?? 0.30);
  const rawW2 = Math.max(0, input.weights?.sizeEscalationWeight ?? 0.25);
  const rawW3 = Math.max(0, input.weights?.timeCompressionWeight ?? 0.25);
  const rawW4 = Math.max(0, input.weights?.dailyLossProximityWeight ?? 0.20);

  const sumW = rawW1 + rawW2 + rawW3 + rawW4 || 1.0;
  const w1 = rawW1 / sumW;
  const w2 = rawW2 / sumW;
  const w3 = rawW3 / sumW;
  const w4 = rawW4 / sumW;

  const warnings: string[] = [];

  // 2. Component 1: Consecutive Loss Streak
  let consecutiveLosses = 0;
  for (let i = recentTrades.length - 1; i >= 0; i--) {
    if (recentTrades[i].netPnL < 0) {
      consecutiveLosses++;
    } else if (recentTrades[i].netPnL > 0) {
      break;
    }
    // Breakeven trades do not increment loss streak but don't break streak if between losses
  }

  // Loss streak score: 0 -> 0; 1 -> 35; 2 -> 65; 3 -> 85; 4+ -> 100
  let lossStreakScore = 0;
  if (consecutiveLosses > 0) {
    lossStreakScore = Math.min(100, Math.round(100 * (1 - Math.exp(-0.55 * consecutiveLosses))));
  }

  // 3. Component 2: Size Escalation
  let sizeEscalationScore = 0;
  let sizeEscalationRatio = 1.0;

  if (input.proposedQuantity !== undefined && input.proposedQuantity > 0 && recentTrades.length > 0) {
    const historicalQuantities = recentTrades
      .map((t) => t.quantity)
      .filter((q): q is number => q !== undefined && q > 0);

    if (historicalQuantities.length > 0) {
      // Baseline average quantity from up to last 20 trades
      const baselineSample = historicalQuantities.slice(-20);
      const avgQty = baselineSample.reduce((a, b) => a + b, 0) / baselineSample.length;

      if (avgQty > 0) {
        sizeEscalationRatio = Number((input.proposedQuantity / avgQty).toFixed(2));
        if (sizeEscalationRatio > 1.0) {
          // 1.5x -> 25; 2x -> 50; 3x+ -> 100
          sizeEscalationScore = Math.min(100, Math.round((sizeEscalationRatio - 1.0) * 50));
        }
      }
    }
  }

  // 4. Component 3: Time Compression (Minutes since last trade)
  let timeCompressionScore = 0;
  let minutesSinceLastTrade: number | undefined = undefined;

  if (recentTrades.length > 0) {
    const lastTrade = recentTrades[recentTrades.length - 1];
    const lastExit = lastTrade.exitTime || lastTrade.tradeDate;
    const nowTime = input.proposedEntryTime ? new Date(input.proposedEntryTime).getTime() : Date.now();

    if (lastExit) {
      const exitMillis = new Date(lastExit).getTime();
      if (!isNaN(exitMillis) && nowTime >= exitMillis) {
        minutesSinceLastTrade = Number(((nowTime - exitMillis) / (60 * 1000)).toFixed(1));

        // Rapid re-entry after loss is classic tilt behavior
        // Under 2 mins: 100; Under 5 mins: 80; Under 15 mins: 50; Under 30 mins: 25; > 45 mins: 0
        if (minutesSinceLastTrade < 45) {
          timeCompressionScore = Math.min(100, Math.round(100 * Math.max(0, 1 - (minutesSinceLastTrade / 45))));
        }
      }
    }
  }

  // 5. Component 4: Daily Loss Proximity
  let dailyLossProximityScore = 0;
  let dailyLossPercent = 0;

  if (input.dailyLossLimit !== undefined && input.dailyLossLimit > 0) {
    const currentLoss = Math.max(0, input.currentDayRealizedLoss ?? 0);
    dailyLossPercent = Number(((currentLoss / input.dailyLossLimit) * 100).toFixed(1));
    dailyLossProximityScore = Math.min(100, Math.round(dailyLossPercent));
  }

  // 6. Composite Score
  const rawScore =
    w1 * lossStreakScore +
    w2 * sizeEscalationScore +
    w3 * timeCompressionScore +
    w4 * dailyLossProximityScore;

  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  // 7. Level & Advisory
  let level: TiltLevel = 'CALM';
  let advisoryNote = 'Trading mindset is calm and structured. Risk guardrails intact.';

  if (score >= 81) {
    level = 'SEVERE_TILT';
    advisoryNote = 'CRITICAL TILT ALERT: Multiple emotional stress markers active (loss streak, size escalation, rapid re-entry). High risk of emotional capital destruction. Step away from the screen.';
  } else if (score >= 61) {
    level = 'HIGH_TILT';
    advisoryNote = 'HIGH TILT WARNING: Elevated risk of impulsive execution. Take a 15-minute breather and verify strategy checklist before taking this trade.';
  } else if (score >= 31) {
    level = 'ELEVATED';
    advisoryNote = 'Mild emotional friction detected. Maintain strict position sizing discipline.';
  }

  if (consecutiveLosses >= 3) {
    warnings.push(`Consecutive loss streak of ${consecutiveLosses} trades active.`);
  }
  if (sizeEscalationRatio >= 2.0) {
    warnings.push(`Proposed position size is ${sizeEscalationRatio}x larger than your recent 20-trade baseline.`);
  }
  if (minutesSinceLastTrade !== undefined && minutesSinceLastTrade < 5 && consecutiveLosses > 0) {
    warnings.push(`Rapid re-entry: only ${minutesSinceLastTrade} minutes since previous losing trade.`);
  }
  if (dailyLossPercent >= 75) {
    warnings.push(`Approaching max daily loss limit: currently at ${dailyLossPercent}% of threshold.`);
  }

  return {
    score,
    level,
    components: {
      lossStreakScore,
      consecutiveLosses,
      sizeEscalationScore,
      sizeEscalationRatio,
      timeCompressionScore,
      minutesSinceLastTrade,
      dailyLossProximityScore,
      dailyLossPercent,
    },
    normalizedWeights: { w1, w2, w3, w4 },
    warnings,
    advisoryNote,
  };
}
