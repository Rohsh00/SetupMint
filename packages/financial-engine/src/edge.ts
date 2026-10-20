import { Mulberry32PRNG } from './prng.js';

// ============================================================================
// NUMERICAL & STATISTICAL ROUTINES (Lanczos Gamma, Incomplete Beta, Beta Quantile)
// ============================================================================

const LANCZOS_COEFFS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/**
 * Computes natural logarithm of Gamma function ln(Γ(z)) for z > 0 using the 9-term Lanczos approximation.
 * Precision: accurate to > 14 decimal digits.
 */
export function logGamma(z: number): number {
  if (z <= 0) {
    if (z === 0) return Infinity;
    // Reflection formula: Γ(z)Γ(1-z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  if (z < 0.5) {
    // Reflection formula for better precision near 0
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = LANCZOS_COEFFS[0];
  for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
    x += LANCZOS_COEFFS[i] / (z + i);
  }

  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Natural logarithm of the Beta function ln(B(a, b)) = ln(Γ(a)) + ln(Γ(b)) - ln(Γ(a + b)).
 */
export function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Regularized Incomplete Beta function I_x(a, b).
 * Evaluates the cumulative distribution function (CDF) of Beta(a, b) at point x in [0, 1].
 * Uses Gautschi/Lentz continued fraction expansion with symmetry transformation.
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) {
    throw new RangeError(`x must be between 0 and 1, received: ${x}`);
  }
  if (a <= 0 || b <= 0) {
    throw new RangeError(`Beta parameters a and b must be strictly positive, received: a=${a}, b=${b}`);
  }

  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use symmetry transformation if x > (a + 1) / (a + b + 2) for rapid convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  const lnFactor = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b);
  const factor = Math.exp(lnFactor) / a;

  // Modified Lentz's continued fraction method
  // f = 1 + d1/(1 + d2/(1 + d3/...))
  const TINY = 1e-30;
  let f = 1.0;
  let c = 1.0;
  let d = 0.0;

  for (let j = 1; j <= 200; j++) {
    let aJ: number;
    if (j % 2 === 1) {
      // Odd step: j = 2m + 1, so m = (j - 1) / 2
      const m = (j - 1) / 2;
      aJ = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    } else {
      // Even step: j = 2m, so m = j / 2
      const m = j / 2;
      aJ = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    }

    d = 1.0 + aJ * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1.0 + aJ / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1.0 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1.0) < 1e-15) {
      break;
    }
  }

  const result = factor * (1.0 / f);
  // Guarantee clamp to [0, 1]
  return Math.min(1, Math.max(0, result));
}

/**
 * Standard Normal quantile approximation (Acklam's algorithm).
 */
function approxStandardNormalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  // Coefficients in rational approximations
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const q = p - 0.5;
  if (Math.abs(q) <= 0.42) {
    const r = q * q;
    return (
      (q *
        (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  const r = p < 0.5 ? p : 1 - p;
  const s = Math.log(-Math.log(r));
  let x =
    c[0] +
    s * (c[1] + s * (c[2] + s * (c[3] + s * (c[4] + s * c[5]))));
  x /= 1 + s * (d[0] + s * (d[1] + s * (d[2] + s * d[3])));
  return p < 0.5 ? -x : x;
}

/**
 * Computes the inverse of the Regularized Incomplete Beta function (Beta Quantile).
 * Finds x in [0, 1] such that I_x(a, b) = p.
 * Uses bounded Newton-Raphson with bisection safeguarding.
 */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p < 0 || p > 1 || !Number.isFinite(p)) {
    throw new RangeError(`Probability p must be between 0 and 1, received: ${p}`);
  }
  if (a <= 0 || b <= 0) {
    throw new RangeError(`Beta parameters a and b must be strictly positive, received: a=${a}, b=${b}`);
  }

  if (p === 0) return 0;
  if (p === 1) return 1;

  if (a === 1 && b === 1) {
    // Uniform distribution
    return p;
  }

  // Bracket
  let xMin = 0;
  let xMax = 1;

  // Initial estimate using normal approximation to beta
  const mean = a / (a + b);
  const variance = (a * b) / ((a + b) * (a + b) * (a + b + 1));
  const sd = Math.sqrt(variance);
  const z = approxStandardNormalQuantile(p);
  let x = mean + z * sd;
  if (x <= 0.001 || x >= 0.999 || isNaN(x)) {
    x = mean;
  }

  const logB = logBeta(a, b);

  for (let iter = 0; iter < 60; iter++) {
    const curP = regularizedIncompleteBeta(x, a, b);
    const diff = curP - p;

    if (Math.abs(diff) < 1e-12 || (xMax - xMin) < 1e-12) {
      return x;
    }

    if (diff < 0) {
      xMin = x;
    } else {
      xMax = x;
    }

    // Derivative: d/dx I_x(a, b) = x^(a-1) * (1-x)^(b-1) / B(a, b)
    const logDeriv = (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB;
    const deriv = Math.exp(logDeriv);

    let nextX: number;
    if (deriv > 1e-15) {
      const step = diff / deriv;
      nextX = x - step;
    } else {
      nextX = -1; // force bisection
    }

    // If Newton step is out of bounds or step is too tiny/huge, use bisection
    if (nextX <= xMin || nextX >= xMax || !Number.isFinite(nextX)) {
      nextX = 0.5 * (xMin + xMax);
    }

    x = nextX;
  }

  return x;
}

// ============================================================================
// DATA CONTRACTS & INTERFACES
// ============================================================================

export interface EligibleTradeInput {
  id?: string;
  tradeDate?: string | Date;
  status: string;
  netPnL?: number;
  realizedRMultiple?: number | null;
  plannedRiskAmount?: number | null;
}

export interface EdgeValidationConfig {
  /**
   * Number of bootstrap iterations. Default: 10,000.
   */
  bootstrapIterations?: number;
  /**
   * Seed for deterministic pseudo-random number generator (Mulberry32).
   */
  seed?: number | string;
  /**
   * Minimum trade count threshold required for edge validation verdict. Default: 30.
   */
  minSampleSize?: number;
  /**
   * Confidence level for intervals (e.g. 0.90 for 90% credible / bootstrap interval). Default: 0.90.
   */
  confidenceLevel?: number;
}

export interface BayesianWinRateResult {
  winsCount: number;
  lossesCount: number;
  breakevenCount: number;
  decisiveTrades: number;
  totalTrades: number;
  observedWinRate: number; // percentage (0 - 100) based on decisive trades
  observedWinRateTotal: number; // percentage (0 - 100) based on total trades
  posteriorMeanWinRate: number; // percentage (0 - 100)
  credibleInterval90: [number, number]; // [lower, upper] percentages
  breakevenWinRate?: number; // percentage (0 - 100)
  probExceedsBreakeven?: number; // probability (0 - 1.0)
  averageWinPnL?: number;
  averageLossPnL?: number;
}

export interface BootstrapExpectancyResult {
  observedExpectancyR: number; // observed mean R
  bootstrapInterval90: [number, number]; // [p5, p95]
  probPositiveExpectancy: number; // P(expectancy > 0) in [0, 1.0]
  bootstrapIterations: number;
  seed: number;
}

export type EdgeVerdict = 'UNPROVEN' | 'LIKELY_EDGE' | 'NO_EDGE_NEGATIVE';

export type EdgeReasonCode =
  | 'INSUFFICIENT_SAMPLE'
  | 'EXPECTANCY_INTERVAL_CROSSES_ZERO'
  | 'POSITIVE_EXPECTANCY_EVIDENCE'
  | 'NEGATIVE_EXPECTANCY_EVIDENCE'
  | 'INCONCLUSIVE_EXPECTANCY'
  | 'NO_VALID_TRADES';

export interface EdgeValidationResult {
  verdict: EdgeVerdict;
  reasonCode: EdgeReasonCode;
  explanation: string;
  sampleSize: number;
  excludedCount: number;
  exclusionReasons: string[];
  warnings: string[];
  bayesianWinRate: BayesianWinRateResult;
  bootstrapExpectancy: BootstrapExpectancyResult;
  assumptions: string[];
}

// ============================================================================
// EDGE VALIDATION ENGINE
// ============================================================================

/**
 * Validates whether a strategy demonstrates a statistically credible trading edge
 * or whether its performance can reasonably be explained by randomness.
 *
 * Rules:
 * - Only eligible, CLOSED trades are sampled. Open trades are excluded.
 * - Missing or invalid R-multiples are excluded (with recorded reasons) rather than silently zeroed.
 * - Breakeven trades (R == 0 or netPnL == 0) are tracked explicitly and do not enter the decisive binary trial denominator.
 * - Uses Beta-Binomial posterior Beta(1+wins, 1+losses) with exact 90% credible interval.
 * - Non-parametric bootstrap of 10,000 iterations via seeded Mulberry32 PRNG.
 * - Verdict logic:
 *   - N < 30 -> UNPROVEN (INSUFFICIENT_SAMPLE)
 *   - Expectancy interval includes zero (lower <= 0 <= upper) -> UNPROVEN (EXPECTANCY_INTERVAL_CROSSES_ZERO)
 *   - N >= 30, interval > 0, P(expectancy > 0) >= 0.90 -> LIKELY_EDGE (POSITIVE_EXPECTANCY_EVIDENCE)
 *   - N >= 30, interval < 0, P(expectancy > 0) <= 0.10 -> NO_EDGE_NEGATIVE (NEGATIVE_EXPECTANCY_EVIDENCE)
 *   - Otherwise -> UNPROVEN (INCONCLUSIVE_EXPECTANCY)
 */
export function validateStrategyEdge(
  trades: EligibleTradeInput[],
  config: EdgeValidationConfig = {}
): EdgeValidationResult {
  const bootstrapIterations = config.bootstrapIterations ?? 10000;
  const minSampleSize = config.minSampleSize ?? 30;
  const confidenceLevel = config.confidenceLevel ?? 0.90;

  // Determine numeric seed
  const seedNum = typeof config.seed === 'string'
    ? Mulberry32PRNG.stringToSeed(config.seed)
    : (config.seed ?? 42);

  const exclusionReasons: string[] = [];
  const warnings: string[] = [];
  let excludedCount = 0;

  // 1. Filter and normalize eligible trades
  const eligibleRMultiples: number[] = [];
  const eligiblePnLs: number[] = [];

  // Canonical sorting by tradeDate then id to guarantee deterministic PRNG sampling
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = a.tradeDate ? new Date(a.tradeDate).getTime() : 0;
    const dateB = b.tradeDate ? new Date(b.tradeDate).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  for (const trade of sortedTrades) {
    if (trade.status !== 'CLOSED') {
      excludedCount++;
      exclusionReasons.push(`Trade ${trade.id || 'unidentified'}: status is not CLOSED (${trade.status})`);
      continue;
    }

    // Check for R-multiple: use trade.realizedRMultiple if available, or compute from netPnL & plannedRiskAmount
    let r: number | undefined = undefined;

    if (trade.realizedRMultiple !== undefined && trade.realizedRMultiple !== null) {
      if (Number.isFinite(trade.realizedRMultiple)) {
        r = Number(trade.realizedRMultiple);
      } else {
        excludedCount++;
        exclusionReasons.push(`Trade ${trade.id || 'unidentified'}: non-finite realizedRMultiple (${trade.realizedRMultiple})`);
        continue;
      }
    } else if (
      trade.netPnL !== undefined &&
      trade.plannedRiskAmount !== undefined &&
      trade.plannedRiskAmount !== null &&
      Number.isFinite(trade.netPnL) &&
      Number.isFinite(trade.plannedRiskAmount) &&
      trade.plannedRiskAmount > 0
    ) {
      r = Number((trade.netPnL / trade.plannedRiskAmount).toFixed(4));
    }

    if (r === undefined) {
      excludedCount++;
      exclusionReasons.push(`Trade ${trade.id || 'unidentified'}: missing valid realized R-multiple or planned risk amount`);
      continue;
    }

    eligibleRMultiples.push(r);
    eligiblePnLs.push(trade.netPnL ?? r);
  }

  const sampleSize = eligibleRMultiples.length;

  if (sampleSize < minSampleSize) {
    warnings.push(
      `Sample size of ${sampleSize} is below the statistical threshold of ${minSampleSize} trades. Historical edge cannot be proven without sufficient sample size.`
    );
  }

  // 2. Count wins, losses, breakevens
  let winsCount = 0;
  let lossesCount = 0;
  let breakevenCount = 0;
  let sumWinPnL = 0;
  let sumLossPnL = 0;

  for (let i = 0; i < sampleSize; i++) {
    const r = eligibleRMultiples[i];
    const pnl = eligiblePnLs[i];

    // Breakeven convention: R is exactly 0 or within tiny epsilon |R| < 1e-6
    if (Math.abs(r) < 1e-6) {
      breakevenCount++;
    } else if (r > 0) {
      winsCount++;
      sumWinPnL += Math.max(0, pnl);
    } else {
      lossesCount++;
      sumLossPnL += Math.abs(pnl);
    }
  }

  const decisiveTrades = winsCount + lossesCount;
  const observedWinRate = decisiveTrades > 0 ? (winsCount / decisiveTrades) * 100 : 0;
  const observedWinRateTotal = sampleSize > 0 ? (winsCount / sampleSize) * 100 : 0;

  // 3. Bayesian Win-Rate Estimation (Beta-Binomial)
  // Prior: Beta(1, 1). Posterior: Beta(1 + wins, 1 + losses)
  const alpha = 1 + winsCount;
  const beta = 1 + lossesCount;
  const posteriorMeanWinRate = (alpha / (alpha + beta)) * 100;

  // 90% Bayesian Credible Interval: [5th percentile, 95th percentile]
  const pLower = (1 - confidenceLevel) / 2; // 0.05
  const pUpper = 1 - pLower; // 0.95
  const credibleInterval90: [number, number] = [
    Number((betaQuantile(pLower, alpha, beta) * 100).toFixed(2)),
    Number((betaQuantile(pUpper, alpha, beta) * 100).toFixed(2)),
  ];

  // Breakeven win rate: L / (W + L)
  const averageWinPnL = winsCount > 0 ? sumWinPnL / winsCount : 0;
  const averageLossPnL = lossesCount > 0 ? sumLossPnL / lossesCount : 0;

  let breakevenWinRate: number | undefined = undefined;
  let probExceedsBreakeven: number | undefined = undefined;

  if (averageWinPnL > 0 && averageLossPnL > 0) {
    const beFraction = averageLossPnL / (averageWinPnL + averageLossPnL);
    breakevenWinRate = Number((beFraction * 100).toFixed(2));
    // Probability that true win rate theta > breakevenWinRate
    probExceedsBreakeven = Number((1 - regularizedIncompleteBeta(beFraction, alpha, beta)).toFixed(4));
  } else {
    warnings.push(
      'Breakeven win rate could not be calculated because average win or average loss magnitude is zero or unobserved.'
    );
  }

  const bayesianWinRate: BayesianWinRateResult = {
    winsCount,
    lossesCount,
    breakevenCount,
    decisiveTrades,
    totalTrades: sampleSize,
    observedWinRate: Number(observedWinRate.toFixed(2)),
    observedWinRateTotal: Number(observedWinRateTotal.toFixed(2)),
    posteriorMeanWinRate: Number(posteriorMeanWinRate.toFixed(2)),
    credibleInterval90,
    breakevenWinRate,
    probExceedsBreakeven,
    averageWinPnL: Number(averageWinPnL.toFixed(2)),
    averageLossPnL: Number(averageLossPnL.toFixed(2)),
  };

  // 4. Non-parametric Bootstrap Expectancy in R
  let observedExpectancyR = 0;
  if (sampleSize > 0) {
    const sumR = eligibleRMultiples.reduce((acc, val) => acc + val, 0);
    observedExpectancyR = Number((sumR / sampleSize).toFixed(4));
  }

  const bootstrapMeans: number[] = new Array(bootstrapIterations);
  const prng = new Mulberry32PRNG(seedNum);

  let positiveCount = 0;

  for (let b = 0; b < bootstrapIterations; b++) {
    if (sampleSize === 0) {
      bootstrapMeans[b] = 0;
      continue;
    }

    let sampleSum = 0;
    for (let i = 0; i < sampleSize; i++) {
      const randomIdx = prng.nextInt(0, sampleSize - 1);
      sampleSum += eligibleRMultiples[randomIdx];
    }
    const meanR = sampleSum / sampleSize;
    bootstrapMeans[b] = meanR;

    if (meanR > 0) {
      positiveCount++;
    }
  }

  // Sort bootstrap distribution to find percentiles
  bootstrapMeans.sort((a, b) => a - b);

  const idxLower = Math.max(0, Math.floor(pLower * bootstrapIterations));
  const idxUpper = Math.min(bootstrapIterations - 1, Math.floor(pUpper * bootstrapIterations));

  const bootstrapInterval90: [number, number] = [
    Number((bootstrapMeans[idxLower] ?? 0).toFixed(4)),
    Number((bootstrapMeans[idxUpper] ?? 0).toFixed(4)),
  ];

  const probPositiveExpectancy = sampleSize > 0
    ? Number((positiveCount / bootstrapIterations).toFixed(4))
    : 0;

  const bootstrapExpectancy: BootstrapExpectancyResult = {
    observedExpectancyR,
    bootstrapInterval90,
    probPositiveExpectancy,
    bootstrapIterations,
    seed: seedNum,
  };

  // 5. Verdict Classification
  let verdict: EdgeVerdict = 'UNPROVEN';
  let reasonCode: EdgeReasonCode = 'INSUFFICIENT_SAMPLE';
  let explanation = '';

  const [lowerExp, upperExp] = bootstrapInterval90;
  const intervalIncludesZero = lowerExp <= 0 && upperExp >= 0;

  if (sampleSize === 0) {
    verdict = 'UNPROVEN';
    reasonCode = 'NO_VALID_TRADES';
    explanation = 'No eligible closed trades with valid realized R-multiples were found.';
  } else if (sampleSize < minSampleSize) {
    verdict = 'UNPROVEN';
    reasonCode = 'INSUFFICIENT_SAMPLE';
    explanation = `Sample size of ${sampleSize} trades is insufficient (minimum ${minSampleSize} required) to distinguish statistical edge from random variance.`;
  } else if (intervalIncludesZero) {
    verdict = 'UNPROVEN';
    reasonCode = 'EXPECTANCY_INTERVAL_CROSSES_ZERO';
    explanation = `The 90% bootstrap expectancy interval [${lowerExp}R, ${upperExp}R] touches or crosses zero. Performance could reasonably be explained by sampling noise.`;
  } else if (lowerExp > 0 && probPositiveExpectancy >= 0.90) {
    verdict = 'LIKELY_EDGE';
    reasonCode = 'POSITIVE_EXPECTANCY_EVIDENCE';
    explanation = `Statistically credible edge detected: 90% bootstrap expectancy interval [${lowerExp}R, ${upperExp}R] is strictly positive with P(expectancy > 0) = ${(probPositiveExpectancy * 100).toFixed(1)}%.`;
  } else if (upperExp < 0 && probPositiveExpectancy <= 0.10) {
    verdict = 'NO_EDGE_NEGATIVE';
    reasonCode = 'NEGATIVE_EXPECTANCY_EVIDENCE';
    explanation = `Statistically negative expectancy: 90% bootstrap expectancy interval [${lowerExp}R, ${upperExp}R] is strictly negative with P(expectancy > 0) = ${(probPositiveExpectancy * 100).toFixed(1)}%.`;
  } else {
    verdict = 'UNPROVEN';
    reasonCode = 'INCONCLUSIVE_EXPECTANCY';
    explanation = `Expectancy distribution does not meet the 90% directional confidence threshold. Edge remains unproven.`;
  }

  const assumptions = [
    'Uniform prior Beta(1, 1) represents uninformative prior belief before trade observations.',
    'Breakeven trades are recorded explicitly and excluded from decisive binary win/loss trial parameter updates.',
    'Bootstrap samples are drawn with replacement assuming identically distributed trade executions.',
    'Statistical sampling uncertainty reflects historical sample properties and is not a guarantee of future market conditions.',
  ];

  return {
    verdict,
    reasonCode,
    explanation,
    sampleSize,
    excludedCount,
    exclusionReasons,
    warnings,
    bayesianWinRate,
    bootstrapExpectancy,
    assumptions,
  };
}

// ============================================================================
// EMPIRICAL-BAYES SHRINKAGE FOR RANKING
// ============================================================================

/**
 * Calculates empirical-Bayes shrunk expectancy:
 * shrunk = (n * sampleMean + k * globalMean) / (n + k)
 *
 * Pulls low-sample strategies or templates toward the global comparison mean,
 * preventing noisy 1-2 trade lucky streaks from dominating rankings.
 *
 * @param sampleMean Observed sample mean expectancy (in R or Net P&L)
 * @param sampleSize Number of eligible trades for this item (n >= 0)
 * @param globalMean Global comparison population mean expectancy
 * @param shrinkageStrength Shrinkage parameter k (default: 10)
 */
export function calculateEmpiricalBayesShrinkage(
  sampleMean: number,
  sampleSize: number,
  globalMean: number = 0,
  shrinkageStrength: number = 10
): number {
  if (!Number.isFinite(sampleMean) || !Number.isFinite(globalMean)) {
    return 0;
  }
  const n = Math.max(0, sampleSize);
  const k = Math.max(0.1, shrinkageStrength);

  if (n === 0) {
    return Number(globalMean.toFixed(4));
  }

  const shrunk = (n * sampleMean + k * globalMean) / (n + k);
  return Number(shrunk.toFixed(4));
}
