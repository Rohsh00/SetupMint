/**
 * SetupMint — Live Trade Stagnation, Time-Stop & Velocity Radar
 * Identifies momentum exhaustion, time decay bleed, and stalled discretionary holds
 */

export type StagnationThreat = 'ACTIVE' | 'EXTENDED' | 'STAGNANT_MOMENTUM_EXHAUSTED' | 'THETA_BLEEDING';

export interface ITradeStagnationParams {
  entryTime: Date | string | number;
  asOfTime?: Date | string | number;
  currentUnrealizedR: number | null;
  peakMfeR: number | null;
  peakMfeTime?: Date | string | number;
  floatingNetPnL: number;
  isDerivative?: boolean;
  assetClass?: string;
  stagnationThresholdMinutes?: number; // default 35 mins
}

export interface ITradeStagnationMetric {
  minutesOpen: number;
  minutesSincePeakMfe: number;
  pnlVelocityPerMinute: number; // ₹ net PnL / minute
  rVelocityPerMinute: number;   // R-multiple / minute
  isStagnant: boolean;
  stagnationThreat: StagnationThreat;
  holdingEfficiencyScore: number; // 0 to 100
  timeStopSuggested: boolean;
  message: string;
}

export function evaluateTradeStagnation(params: ITradeStagnationParams): ITradeStagnationMetric {
  const {
    entryTime,
    asOfTime = new Date(),
    currentUnrealizedR = 0,
    peakMfeR = 0,
    peakMfeTime,
    floatingNetPnL,
    isDerivative = false,
    stagnationThresholdMinutes = 35,
  } = params;

  const entryMs = new Date(entryTime).getTime();
  const asOfMs = new Date(asOfTime).getTime();
  const elapsedMinutes = Math.max(1, Math.round((asOfMs - entryMs) / (1000 * 60)));

  const mfeTimeMs = peakMfeTime ? new Date(peakMfeTime).getTime() : entryMs;
  const minutesSincePeakMfe = Math.max(0, Math.round((asOfMs - mfeTimeMs) / (1000 * 60)));

  const currR = currentUnrealizedR ?? 0;
  const peakR = peakMfeR ?? 0;

  const pnlVelocityPerMinute = Number((floatingNetPnL / elapsedMinutes).toFixed(2));
  const rVelocityPerMinute = Number((currR / elapsedMinutes).toFixed(4));

  // Thresholds for stagnation evaluation
  const isExtended = elapsedMinutes >= 60;
  const mfeRetracedSignificantly = peakR >= 1.0 && currR < peakR * 0.45;
  const flatlineExhaustion = elapsedMinutes >= stagnationThresholdMinutes && minutesSincePeakMfe >= 25 && Math.abs(currR) < 0.35;

  let stagnationThreat: StagnationThreat = 'ACTIVE';
  let isStagnant = false;
  let timeStopSuggested = false;
  let message = 'Momentum active and progressing within normal velocity';

  if (isDerivative && elapsedMinutes >= 45 && minutesSincePeakMfe >= 30 && currR <= 0.2) {
    stagnationThreat = 'THETA_BLEEDING';
    isStagnant = true;
    timeStopSuggested = true;
    message = `Option premium bleeding: trade open ${elapsedMinutes}m with 0 new highs for ${minutesSincePeakMfe}m`;
  } else if (mfeRetracedSignificantly && minutesSincePeakMfe >= 20) {
    stagnationThreat = 'STAGNANT_MOMENTUM_EXHAUSTED';
    isStagnant = true;
    timeStopSuggested = true;
    message = `Momentum exhausted: surrendered from +${peakR.toFixed(1)}R peak; stalled for ${minutesSincePeakMfe}m`;
  } else if (flatlineExhaustion) {
    stagnationThreat = 'STAGNANT_MOMENTUM_EXHAUSTED';
    isStagnant = true;
    timeStopSuggested = elapsedMinutes >= 50;
    message = `Price flatlining: range-bound for ${elapsedMinutes}m with velocity of ₹${pnlVelocityPerMinute}/m`;
  } else if (isExtended) {
    stagnationThreat = 'EXTENDED';
    message = `Extended intraday hold: ${elapsedMinutes}m open duration`;
  }

  // Calculate holding efficiency (100 = fast high R expansion, 0 = long idle bleed)
  let holdingEfficiencyScore = 75;
  if (currR >= 1.5 && elapsedMinutes <= 30) {
    holdingEfficiencyScore = 95;
  } else if (isStagnant) {
    holdingEfficiencyScore = Math.max(10, Math.round(50 - (minutesSincePeakMfe / 2)));
  } else if (currR < 0) {
    holdingEfficiencyScore = Math.max(20, Math.round(50 + (currR * 15)));
  }

  return {
    minutesOpen: elapsedMinutes,
    minutesSincePeakMfe,
    pnlVelocityPerMinute,
    rVelocityPerMinute,
    isStagnant,
    stagnationThreat,
    holdingEfficiencyScore,
    timeStopSuggested,
    message,
  };
}
