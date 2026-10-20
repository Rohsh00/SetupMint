import { Mulberry32PRNG } from './prng.js';
import { EdgeVerdict } from './edge.js';

// ============================================================================
// DATA CONTRACTS & INTERFACES
// ============================================================================

export type MonteCarloRiskMode = 'PERCENT_CURRENT' | 'PERCENT_INITIAL' | 'FIXED_CURRENCY';

export interface MonteCarloConfig {
  /**
   * Number of simulated equity paths. Default: 10,000.
   */
  iterations?: number;
  /**
   * Number of trades simulated per path. Default: 100.
   */
  tradesPerPath?: number;
  /**
   * Starting account balance / equity. Default: 100,000.
   */
  initialEquity?: number;
  /**
   * Risk per trade percentage (e.g. 1.0 for 1%). Used if riskMode is PERCENT_CURRENT or PERCENT_INITIAL. Default: 1.0.
   */
  riskPerTradePercent?: number;
  /**
   * Fixed currency risk per trade (e.g. 1,000). Used if riskMode is FIXED_CURRENCY.
   */
  fixedRiskAmount?: number;
  /**
   * Risk sizing mode. Default: 'PERCENT_CURRENT' (fractional reinvestment).
   */
  riskMode?: MonteCarloRiskMode;
  /**
   * Configurable maximum daily loss limit (in currency).
   */
  maxDailyLoss?: number;
  /**
   * Average trades executed per trading day (used for daily loss aggregation). Default: 4.
   */
  tradesPerDay?: number;
  /**
   * Configurable maximum drawdown threshold percentage (e.g. 20.0 for 20%). Default: 20.0.
   */
  maxDrawdownThresholdPercent?: number;
  /**
   * Seed for deterministic Mulberry32 PRNG.
   */
  seed?: number | string;
}

export interface MonteCarloDrawdownPercentiles {
  p50: number; // Median
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export interface MonteCarloResult {
  iterations: number;
  tradesPerPath: number;
  initialEquity: number;
  riskMode: MonteCarloRiskMode;
  drawdownPercentiles: MonteCarloDrawdownPercentiles;
  probDrawdownThresholdBreached: number; // [0, 1.0]
  probMaxDailyLossBreached: number; // [0, 1.0]
  probRuin: number; // [0, 1.0] - equity dropping to <= 0
  meanTerminalEquity: number;
  medianTerminalEquity: number;
  assumptions: string[];
  limitations: string[];
  seed: number;
}

export interface KellyRecommendationInput {
  winProbability: number; // p in [0, 1.0] (e.g. from posterior mean win rate)
  averageWinMagnitude: number; // W > 0
  averageLossMagnitude: number; // L > 0
  maxRiskPerTradePercent?: number; // User configured risk cap (default: 2.0%)
  edgeVerdict?: EdgeVerdict; // Verdict from Edge Validation Engine
}

export interface KellyRecommendationResult {
  recommendedRiskPercent: number;
  unconstrainedKellyFraction: number;
  quarterKellyFraction: number;
  payoffRatio: number;
  isCapped: boolean;
  capApplied: number;
  isSuppressed: boolean;
  suppressionReason?: string;
  explanation: string;
}

// ============================================================================
// MONTE CARLO SIMULATION ENGINE
// ============================================================================

/**
 * Runs a deterministic Monte Carlo simulation of future equity curves
 * by bootstrapping trades from an empirical R-multiple distribution.
 *
 * Conventions:
 * - Peak Equity starts at initialEquity: Peak_0 = initialEquity.
 * - Drawdown is measured strictly peak-to-trough.
 * - Account depletion (Equity <= 0) is classified as Ruin.
 * - Max daily loss is aggregated across tradesPerDay blocks.
 */
export function runMonteCarloSimulation(
  rMultiples: number[],
  config: MonteCarloConfig = {}
): MonteCarloResult {
  const iterations = config.iterations ?? 10000;
  const tradesPerPath = config.tradesPerPath ?? 100;
  const initialEquity = config.initialEquity ?? 100000;
  const riskPerTradePercent = config.riskPerTradePercent ?? 1.0;
  const fixedRiskAmount = config.fixedRiskAmount ?? (initialEquity * (riskPerTradePercent / 100));
  const riskMode = config.riskMode ?? 'PERCENT_CURRENT';
  const maxDrawdownThresholdPercent = config.maxDrawdownThresholdPercent ?? 20.0;
  const maxDailyLoss = config.maxDailyLoss;
  const tradesPerDay = Math.max(1, config.tradesPerDay ?? 4);

  const seedNum = typeof config.seed === 'string'
    ? Mulberry32PRNG.stringToSeed(config.seed)
    : (config.seed ?? 42);

  const prng = new Mulberry32PRNG(seedNum);

  // Validate eligible sample
  const validR = rMultiples.filter((r) => Number.isFinite(r));
  if (validR.length === 0 || initialEquity <= 0) {
    return {
      iterations: 0,
      tradesPerPath,
      initialEquity,
      riskMode,
      drawdownPercentiles: { p50: 0, p90: 0, p95: 0, p99: 0, max: 0 },
      probDrawdownThresholdBreached: 0,
      probMaxDailyLossBreached: 0,
      probRuin: 0,
      meanTerminalEquity: initialEquity,
      medianTerminalEquity: initialEquity,
      assumptions: ['Empty or invalid R-multiple sample provided.'],
      limitations: ['Cannot simulate without historical trade R-multiples.'],
      seed: seedNum,
    };
  }

  const sampleSize = validR.length;
  const pathMaxDrawdowns: number[] = new Array(iterations);
  const terminalEquities: number[] = new Array(iterations);

  let thresholdBreachedCount = 0;
  let dailyLossBreachedCount = 0;
  let ruinCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let currentEquity = initialEquity;
    let peakEquity = initialEquity;
    let maxPathDDPercent = 0;

    let pathDailyLossBreached = false;
    let currentDayLoss = 0;
    let tradesToday = 0;

    for (let t = 0; t < tradesPerPath; t++) {
      if (currentEquity <= 0) {
        // Account ruined
        currentEquity = 0;
        maxPathDDPercent = 100;
        ruinCount++;
        break;
      }

      // Determine risk budget for this trade
      let riskAmount = 0;
      if (riskMode === 'PERCENT_CURRENT') {
        riskAmount = currentEquity * (riskPerTradePercent / 100);
      } else if (riskMode === 'PERCENT_INITIAL') {
        riskAmount = initialEquity * (riskPerTradePercent / 100);
      } else {
        // FIXED_CURRENCY
        riskAmount = fixedRiskAmount;
      }

      // Zero-risk guard
      if (riskAmount <= 0) {
        riskAmount = 0;
      }

      // Bootstrap sample an R-multiple
      const sampleIdx = prng.nextInt(0, sampleSize - 1);
      const r = validR[sampleIdx];
      const tradePnL = r * riskAmount;

      currentEquity += tradePnL;

      // Update peak and drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }

      const drawdownAmt = peakEquity - currentEquity;
      const ddPercent = peakEquity > 0 ? (drawdownAmt / peakEquity) * 100 : 100;

      if (ddPercent > maxPathDDPercent) {
        maxPathDDPercent = ddPercent;
      }

      // Track daily loss
      if (maxDailyLoss !== undefined && maxDailyLoss > 0) {
        if (tradePnL < 0) {
          currentDayLoss += Math.abs(tradePnL);
        }
        tradesToday++;

        if (currentDayLoss >= maxDailyLoss) {
          pathDailyLossBreached = true;
        }

        if (tradesToday >= tradesPerDay) {
          // Reset day
          currentDayLoss = 0;
          tradesToday = 0;
        }
      }
    }

    if (maxPathDDPercent >= maxDrawdownThresholdPercent) {
      thresholdBreachedCount++;
    }
    if (pathDailyLossBreached) {
      dailyLossBreachedCount++;
    }

    pathMaxDrawdowns[iter] = maxPathDDPercent;
    terminalEquities[iter] = Math.max(0, currentEquity);
  }

  // Calculate drawdown percentiles
  pathMaxDrawdowns.sort((a, b) => a - b);
  terminalEquities.sort((a, b) => a - b);

  const getPercentile = (arr: number[], pct: number) => {
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(pct * arr.length)));
    return Number((arr[idx] ?? 0).toFixed(2));
  };

  const drawdownPercentiles: MonteCarloDrawdownPercentiles = {
    p50: getPercentile(pathMaxDrawdowns, 0.50),
    p90: getPercentile(pathMaxDrawdowns, 0.90),
    p95: getPercentile(pathMaxDrawdowns, 0.95),
    p99: getPercentile(pathMaxDrawdowns, 0.99),
    max: Number((pathMaxDrawdowns[pathMaxDrawdowns.length - 1] ?? 0).toFixed(2)),
  };

  const sumTerminal = terminalEquities.reduce((acc, val) => acc + val, 0);
  const meanTerminalEquity = Number((sumTerminal / iterations).toFixed(2));
  const medianTerminalEquity = getPercentile(terminalEquities, 0.50);

  const probDrawdownThresholdBreached = Number((thresholdBreachedCount / iterations).toFixed(4));
  const probMaxDailyLossBreached = maxDailyLoss !== undefined
    ? Number((dailyLossBreachedCount / iterations).toFixed(4))
    : 0;
  const probRuin = Number((ruinCount / iterations).toFixed(4));

  const assumptions = [
    `Initial equity (₹${initialEquity.toLocaleString()}) forms the baseline first peak of the equity curve.`,
    `Trades are drawn with replacement from the historical empirical sample of ${sampleSize} R-multiples.`,
    `Risk sizing follows '${riskMode}' convention consistently across all simulated paths.`,
    `Daily loss evaluation groups trades into blocks of ${tradesPerDay} executions.`,
  ];

  const limitations = [
    'Monte Carlo assumes trade outcomes are independent and identically distributed (IID), which may not account for serial market regime shifts.',
    'Execution slippage, liquidity gaps, and broker margin calls during flash crashes are not modeled.',
  ];

  return {
    iterations,
    tradesPerPath,
    initialEquity,
    riskMode,
    drawdownPercentiles,
    probDrawdownThresholdBreached,
    probMaxDailyLossBreached,
    probRuin,
    meanTerminalEquity,
    medianTerminalEquity,
    assumptions,
    limitations,
    seed: seedNum,
  };
}

// ============================================================================
// CAPPED FRACTIONAL KELLY RECOMMENDATION
// ============================================================================

/**
 * Calculates a conservative Quarter-Kelly position size recommendation:
 * f* = p - (1 - p) / b
 * recommended = min(0.25 * f* * 100, maxRiskPerTradePercent)
 *
 * Rules:
 * - Only recommended if payoffRatio b > 0 and Edge Verdict is 'LIKELY_EDGE'.
 * - Suppressed if verdict is 'UNPROVEN' or 'NO_EDGE_NEGATIVE', or if f* <= 0.
 * - Always capped at the trader's configured maxRiskPerTradePercent.
 */
export function calculateFractionalKelly(
  input: KellyRecommendationInput
): KellyRecommendationResult {
  const p = Math.max(0, Math.min(1, input.winProbability));
  const q = 1 - p;
  const w = input.averageWinMagnitude;
  const l = input.averageLossMagnitude;
  const maxCap = input.maxRiskPerTradePercent ?? 2.0;
  const verdict = input.edgeVerdict ?? 'UNPROVEN';

  // 1. Payoff ratio check
  if (w <= 0 || l <= 0 || !Number.isFinite(w) || !Number.isFinite(l)) {
    return {
      recommendedRiskPercent: 0,
      unconstrainedKellyFraction: 0,
      quarterKellyFraction: 0,
      payoffRatio: 0,
      isCapped: false,
      capApplied: maxCap,
      isSuppressed: true,
      suppressionReason: 'INSUFFICIENT_PAYOFF_DATA',
      explanation: 'Average win or average loss magnitude is non-positive or undefined.',
    };
  }

  const b = w / l;
  const payoffRatio = Number(b.toFixed(2));

  // 2. Unconstrained Kelly: f* = p - q / b
  const fStar = p - q / b;
  const unconstrainedKellyFraction = Number(fStar.toFixed(4));
  const quarterKellyFraction = Number(Math.max(0, 0.25 * fStar).toFixed(4));

  // 3. Verdict gating: Kelly sizing is unsafe on unproven or negative edges
  if (verdict === 'NO_EDGE_NEGATIVE') {
    return {
      recommendedRiskPercent: 0,
      unconstrainedKellyFraction,
      quarterKellyFraction: 0,
      payoffRatio,
      isCapped: false,
      capApplied: maxCap,
      isSuppressed: true,
      suppressionReason: 'NEGATIVE_EDGE',
      explanation: 'Kelly risk sizing is suppressed because historical performance exhibits negative expectancy.',
    };
  }

  if (verdict === 'UNPROVEN') {
    return {
      recommendedRiskPercent: 0,
      unconstrainedKellyFraction,
      quarterKellyFraction,
      payoffRatio,
      isCapped: false,
      capApplied: maxCap,
      isSuppressed: true,
      suppressionReason: 'EDGE_UNPROVEN',
      explanation: 'Kelly sizing is withheld until the strategy achieves a statistically validated LIKELY_EDGE (minimum 30 trades and strictly positive 90% expectancy interval).',
    };
  }

  // 4. Negative or zero Kelly fraction
  if (fStar <= 0) {
    return {
      recommendedRiskPercent: 0,
      unconstrainedKellyFraction,
      quarterKellyFraction: 0,
      payoffRatio,
      isCapped: false,
      capApplied: maxCap,
      isSuppressed: true,
      suppressionReason: 'NEGATIVE_EXPECTANCY_PAYOFF',
      explanation: `Calculated Kelly fraction is non-positive (${(fStar * 100).toFixed(2)}%). Theoretical sizing recommends zero risk.`,
    };
  }

  // 5. Capped Quarter-Kelly
  const rawQuarterPercent = quarterKellyFraction * 100;
  const isCapped = rawQuarterPercent > maxCap;
  const recommendedRiskPercent = Number(Math.min(rawQuarterPercent, maxCap).toFixed(2));

  const explanation = isCapped
    ? `Quarter-Kelly sizing (${rawQuarterPercent.toFixed(2)}%) capped at configured max risk limit of ${maxCap.toFixed(2)}%.`
    : `Quarter-Kelly recommended risk: ${recommendedRiskPercent.toFixed(2)}% based on ${payoffRatio}:1 payoff ratio and ${(p * 100).toFixed(1)}% win rate.`;

  return {
    recommendedRiskPercent,
    unconstrainedKellyFraction,
    quarterKellyFraction,
    payoffRatio,
    isCapped,
    capApplied: maxCap,
    isSuppressed: false,
    explanation,
  };
}
