import { describe, it, expect } from 'vitest';
import {
  validateStrategyEdge,
  calculateEmpiricalBayesShrinkage,
  logGamma,
  regularizedIncompleteBeta,
  betaQuantile,
  EligibleTradeInput,
} from '../src/edge.js';
import { Mulberry32PRNG } from '../src/prng.js';

describe('Edge Validation Engine — Numerical Foundations', () => {
  it('1. logGamma matches known values for integer and half-integer arguments', () => {
    // Gamma(1) = 1 => ln(Gamma(1)) = 0
    expect(logGamma(1)).toBeCloseTo(0, 10);
    // Gamma(2) = 1! = 1 => ln(1) = 0
    expect(logGamma(2)).toBeCloseTo(0, 10);
    // Gamma(3) = 2! = 2 => ln(2) = 0.6931471805599453
    expect(logGamma(3)).toBeCloseTo(Math.log(2), 10);
    // Gamma(5) = 4! = 24 => ln(24) = 3.1780538303479458
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    // Gamma(0.5) = sqrt(pi) => ln(sqrt(pi)) = 0.5 * ln(pi)
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10);
  });

  it('2. regularizedIncompleteBeta satisfies boundary conditions and known values', () => {
    // I_0(a, b) = 0, I_1(a, b) = 1
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);

    // Uniform distribution Beta(1, 1): I_x(1, 1) = x
    expect(regularizedIncompleteBeta(0.35, 1, 1)).toBeCloseTo(0.35, 10);
    expect(regularizedIncompleteBeta(0.8, 1, 1)).toBeCloseTo(0.8, 10);

    // Symmetric Beta(2, 2) at x = 0.5 must equal exactly 0.5
    expect(regularizedIncompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0.5, 10, 10)).toBeCloseTo(0.5, 10);
  });

  it('3. betaQuantile correctly inverts regularizedIncompleteBeta', () => {
    // For Beta(1, 1), quantile is identical to p
    expect(betaQuantile(0.05, 1, 1)).toBeCloseTo(0.05, 8);
    expect(betaQuantile(0.95, 1, 1)).toBeCloseTo(0.95, 8);

    // For Beta(10, 10), median is 0.5
    expect(betaQuantile(0.5, 10, 10)).toBeCloseTo(0.5, 6);

    // Round-trip property: I_{Q(p)}(a, b) == p
    const testCases: [number, number, number][] = [
      [0.05, 15, 5],
      [0.5, 15, 5],
      [0.95, 15, 5],
      [0.1, 4, 12],
      [0.9, 4, 12],
    ];

    for (const [p, a, b] of testCases) {
      const q = betaQuantile(p, a, b);
      const recoveredP = regularizedIncompleteBeta(q, a, b);
      expect(recoveredP).toBeCloseTo(p, 6);
    }
  });
});

describe('Edge Validation Engine — Comprehensive Statistical Suite', () => {
  it('1. Empty sample returns UNPROVEN with NO_VALID_TRADES reason and 0 sampleSize', () => {
    const res = validateStrategyEdge([]);
    expect(res.verdict).toBe('UNPROVEN');
    expect(res.reasonCode).toBe('NO_VALID_TRADES');
    expect(res.sampleSize).toBe(0);
    expect(res.bootstrapExpectancy.observedExpectancyR).toBe(0);
    expect(res.bootstrapExpectancy.probPositiveExpectancy).toBe(0);
    expect(res.bayesianWinRate.winsCount).toBe(0);
    expect(res.bayesianWinRate.lossesCount).toBe(0);
    expect(res.bayesianWinRate.breakevenCount).toBe(0);
  });

  it('2. One eligible trade returns UNPROVEN with INSUFFICIENT_SAMPLE', () => {
    const trade: EligibleTradeInput = {
      id: 't-1',
      status: 'CLOSED',
      realizedRMultiple: 2.5,
      netPnL: 5000,
    };
    const res = validateStrategyEdge([trade]);
    expect(res.verdict).toBe('UNPROVEN');
    expect(res.reasonCode).toBe('INSUFFICIENT_SAMPLE');
    expect(res.sampleSize).toBe(1);
    expect(res.bayesianWinRate.winsCount).toBe(1);
    expect(res.bayesianWinRate.lossesCount).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('3. Boundary sample sizes 29 vs 30 enforce the 30-trade minimum guard', () => {
    // 29 trades with 100% wins and +2.0R expectancy
    const trades29: EligibleTradeInput[] = Array.from({ length: 29 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 2.0,
      netPnL: 2000,
      plannedRiskAmount: 1000,
    }));

    const res29 = validateStrategyEdge(trades29, { seed: 101 });
    expect(res29.sampleSize).toBe(29);
    // Must remain UNPROVEN because N < 30
    expect(res29.verdict).toBe('UNPROVEN');
    expect(res29.reasonCode).toBe('INSUFFICIENT_SAMPLE');

    // 30 trades with strong positive expectancy (+2.0R)
    const trades30: EligibleTradeInput[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 2.0,
      netPnL: 2000,
      plannedRiskAmount: 1000,
    }));

    const res30 = validateStrategyEdge(trades30, { seed: 101 });
    expect(res30.sampleSize).toBe(30);
    // N >= 30, strictly positive expectancy -> LIKELY_EDGE
    expect(res30.verdict).toBe('LIKELY_EDGE');
    expect(res30.reasonCode).toBe('POSITIVE_EXPECTANCY_EVIDENCE');
  });

  it('4. All winning trades (100% wins) yields strong positive edge and Beta posterior near 1.0', () => {
    const wins: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 1.5,
      netPnL: 3000,
      plannedRiskAmount: 2000,
    }));

    const res = validateStrategyEdge(wins, { seed: 777 });
    expect(res.verdict).toBe('LIKELY_EDGE');
    expect(res.bayesianWinRate.winsCount).toBe(35);
    expect(res.bayesianWinRate.lossesCount).toBe(0);
    expect(res.bayesianWinRate.observedWinRate).toBe(100);
    // Posterior mean: (1 + 35) / (2 + 35 + 0) = 36 / 37 ≈ 97.30%
    expect(res.bayesianWinRate.posteriorMeanWinRate).toBeCloseTo(97.3, 1);
    expect(res.bayesianWinRate.credibleInterval90[0]).toBeGreaterThan(85);
  });

  it('5. All losing trades (0% wins) yields NO_EDGE_NEGATIVE and Beta posterior near 0', () => {
    const losses: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: -1.0,
      netPnL: -2000,
      plannedRiskAmount: 2000,
    }));

    const res = validateStrategyEdge(losses, { seed: 777 });
    expect(res.verdict).toBe('NO_EDGE_NEGATIVE');
    expect(res.reasonCode).toBe('NEGATIVE_EXPECTANCY_EVIDENCE');
    expect(res.bayesianWinRate.winsCount).toBe(0);
    expect(res.bayesianWinRate.lossesCount).toBe(35);
    expect(res.bootstrapExpectancy.probPositiveExpectancy).toBe(0);
    // Posterior mean: 1 / 37 ≈ 2.70%
    expect(res.bayesianWinRate.posteriorMeanWinRate).toBeCloseTo(2.7, 1);
  });

  it('6. Mixed wins and losses with statistically positive expectancy identifies LIKELY_EDGE', () => {
    // 24 wins at +2.0R and 16 losses at -1.0R (total 40 trades, mean R = (48 - 16)/40 = +0.8R)
    const trades: EligibleTradeInput[] = [
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `win-${i}`,
        status: 'CLOSED',
        realizedRMultiple: 2.0,
        netPnL: 2000,
        plannedRiskAmount: 1000,
      })),
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `loss-${i}`,
        status: 'CLOSED',
        realizedRMultiple: -1.0,
        netPnL: -1000,
        plannedRiskAmount: 1000,
      })),
    ];

    const res = validateStrategyEdge(trades, { seed: 42 });
    expect(res.sampleSize).toBe(40);
    expect(res.bayesianWinRate.winsCount).toBe(24);
    expect(res.bayesianWinRate.lossesCount).toBe(16);
    expect(res.bayesianWinRate.observedWinRate).toBe(60); // 24/40
    expect(res.bootstrapExpectancy.observedExpectancyR).toBeCloseTo(0.8, 2);
    expect(res.bootstrapExpectancy.bootstrapInterval90[0]).toBeGreaterThan(0);
    expect(res.bootstrapExpectancy.probPositiveExpectancy).toBeGreaterThan(0.95);
    expect(res.verdict).toBe('LIKELY_EDGE');
  });

  it('7. Breakeven trades do not artificially inflate or deflate decisive win rate', () => {
    // 15 wins (+1R), 15 losses (-1R), and 10 breakevens (0R)
    const trades: EligibleTradeInput[] = [
      ...Array.from({ length: 15 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.0, netPnL: 1000 })),
      ...Array.from({ length: 15 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `be-${i}`, status: 'CLOSED', realizedRMultiple: 0.0, netPnL: 0 })),
    ];

    const res = validateStrategyEdge(trades);
    expect(res.sampleSize).toBe(40);
    expect(res.bayesianWinRate.winsCount).toBe(15);
    expect(res.bayesianWinRate.lossesCount).toBe(15);
    expect(res.bayesianWinRate.breakevenCount).toBe(10);
    expect(res.bayesianWinRate.decisiveTrades).toBe(30);
    // Decisive win rate: 15 / 30 = 50%
    expect(res.bayesianWinRate.observedWinRate).toBe(50.0);
    // Total win rate: 15 / 40 = 37.5%
    expect(res.bayesianWinRate.observedWinRateTotal).toBe(37.5);
    // Interval touches/crosses zero => UNPROVEN
    expect(res.verdict).toBe('UNPROVEN');
    expect(res.reasonCode).toBe('EXPECTANCY_INTERVAL_CROSSES_ZERO');
  });

  it('8. Zero average win or loss is safely flagged with warning without NaN propagation', () => {
    const onlyWins: EligibleTradeInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: `w-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 1.5,
      netPnL: 1500,
    }));

    const res = validateStrategyEdge(onlyWins);
    expect(res.bayesianWinRate.averageLossPnL).toBe(0);
    expect(res.bayesianWinRate.breakevenWinRate).toBeUndefined();
    expect(res.warnings.some((w) => w.includes('Breakeven win rate could not be calculated'))).toBe(true);
    expect(Number.isNaN(res.bayesianWinRate.posteriorMeanWinRate)).toBe(false);
  });

  it('9. Missing and open trades are excluded and logged in exclusion reasons', () => {
    const trades: EligibleTradeInput[] = [
      { id: 't-open', status: 'OPEN', realizedRMultiple: 1.5, netPnL: 1500 },
      { id: 't-no-r', status: 'CLOSED', netPnL: 1000 }, // no realizedRMultiple and no plannedRiskAmount
      { id: 't-valid', status: 'CLOSED', realizedRMultiple: 1.2, netPnL: 1200 },
    ];

    const res = validateStrategyEdge(trades);
    expect(res.sampleSize).toBe(1);
    expect(res.excludedCount).toBe(2);
    expect(res.exclusionReasons.length).toBe(2);
    expect(res.exclusionReasons.some((r) => r.includes('not CLOSED'))).toBe(true);
    expect(res.exclusionReasons.some((r) => r.includes('missing valid realized R-multiple'))).toBe(true);
  });

  it('10. NaN and non-finite R-multiples are excluded gracefully', () => {
    const trades: EligibleTradeInput[] = [
      { id: 't-nan', status: 'CLOSED', realizedRMultiple: NaN },
      { id: 't-inf', status: 'CLOSED', realizedRMultiple: Infinity },
      { id: 't-valid', status: 'CLOSED', realizedRMultiple: 1.0, netPnL: 1000 },
    ];

    const res = validateStrategyEdge(trades);
    expect(res.sampleSize).toBe(1);
    expect(res.excludedCount).toBe(2);
  });

  it('11. Bayesian credible interval bounds are strictly valid: 0 <= lower <= upper <= 100', () => {
    const trades: EligibleTradeInput[] = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.5, netPnL: 1500 })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 })),
    ];

    const res = validateStrategyEdge(trades);
    const [lower, upper] = res.bayesianWinRate.credibleInterval90;
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeLessThanOrEqual(100);
    expect(lower).toBeLessThan(upper);
  });

  it('12. Beta posterior interval tightens monotonically as sample size increases', () => {
    // 60% win rate with 10 trades vs 100 trades
    const smallSample: EligibleTradeInput[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.0, netPnL: 1000 })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 })),
    ];
    const largeSample: EligibleTradeInput[] = [
      ...Array.from({ length: 60 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.0, netPnL: 1000 })),
      ...Array.from({ length: 40 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 })),
    ];

    const resSmall = validateStrategyEdge(smallSample);
    const resLarge = validateStrategyEdge(largeSample);

    const widthSmall = resSmall.bayesianWinRate.credibleInterval90[1] - resSmall.bayesianWinRate.credibleInterval90[0];
    const widthLarge = resLarge.bayesianWinRate.credibleInterval90[1] - resLarge.bayesianWinRate.credibleInterval90[0];

    // Larger sample must produce a strictly narrower credible interval
    expect(widthLarge).toBeLessThan(widthSmall);
  });

  it('13. Correctly calculates breakeven win rate: L / (W + L)', () => {
    // Win: +2,000, Loss: -1,000 -> W = 2000, L = 1000 -> breakeven = 1000 / (2000 + 1000) = 33.33%
    const trades: EligibleTradeInput[] = [
      { id: 'w1', status: 'CLOSED', realizedRMultiple: 2.0, netPnL: 2000 },
      { id: 'l1', status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 },
    ];
    const res = validateStrategyEdge(trades);
    expect(res.bayesianWinRate.breakevenWinRate).toBeCloseTo(33.33, 1);
  });

  it('14. Non-parametric bootstrap interval covers observed mean and is bounded', () => {
    const trades: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: i % 2 === 0 ? 1.5 : -0.5,
      netPnL: i % 2 === 0 ? 1500 : -500,
    }));

    const res = validateStrategyEdge(trades, { bootstrapIterations: 2000, seed: 1234 });
    const [lower, upper] = res.bootstrapExpectancy.bootstrapInterval90;
    expect(lower).toBeLessThan(upper);
    expect(res.bootstrapExpectancy.observedExpectancyR).toBeGreaterThanOrEqual(lower);
    expect(res.bootstrapExpectancy.observedExpectancyR).toBeLessThanOrEqual(upper);
  });

  it('15. Strict determinism: identical inputs and seed produce 100% identical outputs', () => {
    const trades: EligibleTradeInput[] = Array.from({ length: 32 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: ((i * 17) % 7) - 2.5,
      netPnL: 1000,
    }));

    const run1 = validateStrategyEdge(trades, { bootstrapIterations: 2000, seed: 999 });
    const run2 = validateStrategyEdge(trades, { bootstrapIterations: 2000, seed: 999 });

    expect(run1).toEqual(run2);
  });

  it('16. Different seeds yield slightly different bootstrap distributions without diverging statistical conclusion', () => {
    const trades: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: ((i * 13) % 9) - 3,
      netPnL: 1000,
    }));

    const runA = validateStrategyEdge(trades, { bootstrapIterations: 1000, seed: 10 });
    const runB = validateStrategyEdge(trades, { bootstrapIterations: 1000, seed: 20 });

    expect(runA.bootstrapExpectancy.seed).not.toBe(runB.bootstrapExpectancy.seed);
    // Both must agree on the verdict
    expect(runA.verdict).toBe(runB.verdict);
  });

  it('17. Constant R-multiple samples report exact zero interval width faithfully without manufactured noise', () => {
    // All 30 trades have exactly +1.5R
    const constantTrades: EligibleTradeInput[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 1.5,
      netPnL: 1500,
    }));

    const res = validateStrategyEdge(constantTrades, { bootstrapIterations: 1000 });
    expect(res.bootstrapExpectancy.observedExpectancyR).toBe(1.5);
    expect(res.bootstrapExpectancy.bootstrapInterval90[0]).toBe(1.5);
    expect(res.bootstrapExpectancy.bootstrapInterval90[1]).toBe(1.5);
    expect(res.bootstrapExpectancy.probPositiveExpectancy).toBe(1.0);
    expect(res.verdict).toBe('LIKELY_EDGE');
  });

  it('18. Every verdict boundary behaves according to exact specification', () => {
    // A: Positive edge (N=35, high wins) -> LIKELY_EDGE
    const posTrades: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `w-${i}`,
      status: 'CLOSED',
      realizedRMultiple: 1.2,
      netPnL: 1200,
    }));
    expect(validateStrategyEdge(posTrades).verdict).toBe('LIKELY_EDGE');

    // B: Negative edge (N=35, all losses) -> NO_EDGE_NEGATIVE
    const negTrades: EligibleTradeInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `l-${i}`,
      status: 'CLOSED',
      realizedRMultiple: -1.0,
      netPnL: -1000,
    }));
    expect(validateStrategyEdge(negTrades).verdict).toBe('NO_EDGE_NEGATIVE');

    // C: Coin flip 50/50 (N=40, +1R and -1R) -> UNPROVEN (crosses zero)
    const coinFlip: EligibleTradeInput[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.0, netPnL: 1000 })),
      ...Array.from({ length: 20 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.0, netPnL: -1000 })),
    ];
    expect(validateStrategyEdge(coinFlip).verdict).toBe('UNPROVEN');
    expect(validateStrategyEdge(coinFlip).reasonCode).toBe('EXPECTANCY_INTERVAL_CROSSES_ZERO');
  });

  it('19. Inclusive-zero policy: an interval that touches zero classifies as UNPROVEN', () => {
    // Construct trades where 5th percentile is <= 0 and 95th percentile >= 0
    const trades: EligibleTradeInput[] = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `w-${i}`, status: 'CLOSED', realizedRMultiple: 1.5, netPnL: 1500 })),
      ...Array.from({ length: 17 }, (_, i) => ({ id: `l-${i}`, status: 'CLOSED', realizedRMultiple: -1.2, netPnL: -1200 })),
    ];

    const res = validateStrategyEdge(trades, { seed: 555 });
    const [lower, upper] = res.bootstrapExpectancy.bootstrapInterval90;
    if (lower <= 0 && upper >= 0) {
      expect(res.verdict).toBe('UNPROVEN');
      expect(res.reasonCode).toBe('EXPECTANCY_INTERVAL_CROSSES_ZERO');
    }
  });

  it('20. Insufficient sample-size guards: positive observed expectancy with N < 30 cannot claim LIKELY_EDGE', () => {
    const luckyTrades: EligibleTradeInput[] = [
      { id: '1', status: 'CLOSED', realizedRMultiple: 5.0, netPnL: 5000 },
      { id: '2', status: 'CLOSED', realizedRMultiple: 3.0, netPnL: 3000 },
      { id: '3', status: 'CLOSED', realizedRMultiple: 4.0, netPnL: 4000 },
    ];

    const res = validateStrategyEdge(luckyTrades);
    expect(res.bootstrapExpectancy.observedExpectancyR).toBe(4.0);
    // Despite high observed expectancy, verdict must remain UNPROVEN
    expect(res.verdict).toBe('UNPROVEN');
    expect(res.reasonCode).toBe('INSUFFICIENT_SAMPLE');
  });

  it('21. Empirical-Bayes shrinkage pulls small samples toward population mean while preserving large samples', () => {
    const globalMean = 0.2; // population mean expectancy = +0.2R
    const k = 10;

    // A: 1 trade with lucky +3.0R expectancy -> should shrink strongly toward 0.2
    // formula: (1 * 3.0 + 10 * 0.2) / 11 = 5.0 / 11 ≈ 0.4545
    const shrunkSmall = calculateEmpiricalBayesShrinkage(3.0, 1, globalMean, k);
    expect(shrunkSmall).toBeCloseTo(0.4545, 3);

    // B: 100 trades with +3.0R expectancy -> should remain very close to 3.0
    // formula: (100 * 3.0 + 10 * 0.2) / 110 = 302 / 110 ≈ 2.7455
    const shrunkLarge = calculateEmpiricalBayesShrinkage(3.0, 100, globalMean, k);
    expect(shrunkLarge).toBeCloseTo(2.7455, 3);

    // C: 0 trades -> returns globalMean
    const shrunkZero = calculateEmpiricalBayesShrinkage(0, 0, globalMean, k);
    expect(shrunkZero).toBe(globalMean);
  });

  it('22. Invalid shrinkage parameters handle edge cases cleanly without NaN', () => {
    expect(calculateEmpiricalBayesShrinkage(NaN, 10, 0.2)).toBe(0);
    expect(calculateEmpiricalBayesShrinkage(0.5, 10, NaN)).toBe(0);
    expect(calculateEmpiricalBayesShrinkage(0.5, -5, 0.2)).toBe(0.2); // n clamped to 0
  });

  it('23. Ranking comparison: 1 lucky trade is ranked BELOW consistent 50-trade strategy under shrunk expectancy', () => {
    const globalPrior = 0.1;
    const k = 10;

    // Strategy 1: 1 lucky trade at +4.0R
    const strat1Shrunk = calculateEmpiricalBayesShrinkage(4.0, 1, globalPrior, k);
    // (1 * 4 + 10 * 0.1) / 11 = 5 / 11 ≈ 0.4545

    // Strategy 2: 50 trades with solid +1.0R
    const strat2Shrunk = calculateEmpiricalBayesShrinkage(1.0, 50, globalPrior, k);
    // (50 * 1 + 10 * 0.1) / 60 = 51 / 60 = 0.85

    // Strategy 2 with proven 50 trades must rank HIGHER than the 1-trade wonder!
    expect(strat2Shrunk).toBeGreaterThan(strat1Shrunk);
  });
});
