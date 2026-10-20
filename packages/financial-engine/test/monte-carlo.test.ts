import { describe, it, expect } from 'vitest';
import {
  runMonteCarloSimulation,
  calculateFractionalKelly,
} from '../src/monte-carlo.js';

describe('Monte Carlo Risk Simulation Engine', () => {
  it('1. Strict determinism: identical inputs and seeds yield identical distributions', () => {
    const rMultiples = [1.5, -1.0, 2.0, -0.8, 0.5, -1.0, 3.0, -1.0, -1.0, 1.2];
    const config = {
      iterations: 1000,
      tradesPerPath: 50,
      initialEquity: 100000,
      riskPerTradePercent: 1.0,
      seed: 888,
    };

    const run1 = runMonteCarloSimulation(rMultiples, config);
    const run2 = runMonteCarloSimulation(rMultiples, config);

    expect(run1).toEqual(run2);
  });

  it('2. Peak equity initialization: initial equity is the first peak (E_0)', () => {
    // If every trade is a losing trade (-1.0R at 1% of initial equity),
    // equity drops from 100,000 to 99,000. Peak must remain 100,000, not 99,000.
    const losingR = [-1.0];
    const res = runMonteCarloSimulation(losingR, {
      iterations: 10,
      tradesPerPath: 5,
      initialEquity: 100000,
      riskMode: 'PERCENT_INITIAL',
      riskPerTradePercent: 1.0,
      seed: 1,
    });

    // 5 trades at -1% = 5% drawdown
    expect(res.drawdownPercentiles.max).toBeCloseTo(5.0, 1);
    expect(res.drawdownPercentiles.p50).toBeCloseTo(5.0, 1);
  });

  it('3. Distinguishes drawdown threshold breach from ruin', () => {
    // Moderate losses that easily breach 10% drawdown without bankrupting the account
    const sampleR = [-1.0, -1.0, -1.0, 1.0, -1.0, 1.0];
    const res = runMonteCarloSimulation(sampleR, {
      iterations: 500,
      tradesPerPath: 40,
      initialEquity: 50000,
      riskPerTradePercent: 3.0,
      maxDrawdownThresholdPercent: 10.0,
      seed: 42,
    });

    // High probability of 10% drawdown breach
    expect(res.probDrawdownThresholdBreached).toBeGreaterThan(0.5);
    // But ruin (100% loss) is much lower or 0
    expect(res.probRuin).toBeLessThan(res.probDrawdownThresholdBreached);
  });

  it('4. Zero-risk behavior: zero risk yields 0% drawdown and terminal equity == initial equity', () => {
    const sampleR = [2.0, -1.0, 3.0];
    const res = runMonteCarloSimulation(sampleR, {
      iterations: 100,
      tradesPerPath: 20,
      initialEquity: 100000,
      riskPerTradePercent: 0,
      seed: 123,
    });

    expect(res.drawdownPercentiles.max).toBe(0);
    expect(res.meanTerminalEquity).toBe(100000);
    expect(res.probRuin).toBe(0);
  });

  it('5. Handles empty or invalid historical data gracefully without throwing', () => {
    const res = runMonteCarloSimulation([], { initialEquity: 100000 });
    expect(res.iterations).toBe(0);
    expect(res.probRuin).toBe(0);
    expect(res.drawdownPercentiles.max).toBe(0);
    expect(res.assumptions[0]).toContain('Empty or invalid');
  });

  it('6. Daily loss threshold is properly tracked when configured', () => {
    // Big losses (-2.5R) that exceed daily loss of ₹5,000 on ₹100,000 equity (1% risk = ₹1,000 per R)
    const heavyLosses = [-3.0, -2.5, -2.0];
    const res = runMonteCarloSimulation(heavyLosses, {
      iterations: 200,
      tradesPerPath: 20,
      initialEquity: 100000,
      riskPerTradePercent: 1.0, // ₹1,000 per R -> -3R = -₹3,000
      maxDailyLoss: 5000,
      tradesPerDay: 3,
      seed: 99,
    });

    expect(res.probMaxDailyLossBreached).toBeGreaterThan(0.5);
  });
});

describe('Fractional Kelly Risk Recommendation Engine', () => {
  it('1. Calculates valid unconstrained and quarter-Kelly sizing on positive edge', () => {
    // 60% win rate, avg win = 2000, avg loss = 1000 -> b = 2.0
    // f* = p - q/b = 0.60 - 0.40/2.0 = 0.60 - 0.20 = 0.40 (40% Kelly)
    // Quarter-Kelly = 0.25 * 40% = 10%
    // If capped at 2.0%, recommended = 2.0%
    const res = calculateFractionalKelly({
      winProbability: 0.60,
      averageWinMagnitude: 2000,
      averageLossMagnitude: 1000,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: 'LIKELY_EDGE',
    });

    expect(res.payoffRatio).toBe(2.0);
    expect(res.unconstrainedKellyFraction).toBeCloseTo(0.40, 2);
    expect(res.quarterKellyFraction).toBeCloseTo(0.10, 2);
    expect(res.isCapped).toBe(true);
    expect(res.recommendedRiskPercent).toBe(2.0);
    expect(res.isSuppressed).toBe(false);
  });

  it('2. Does not cap if quarter-Kelly is below the user configured cap', () => {
    // 52% win rate, b = 1.0 -> f* = 0.52 - 0.48/1 = 0.04 (4%)
    // Quarter-Kelly = 1.0%
    // With 2% cap, recommended is 1.0% uncapped!
    const res = calculateFractionalKelly({
      winProbability: 0.52,
      averageWinMagnitude: 1000,
      averageLossMagnitude: 1000,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: 'LIKELY_EDGE',
    });

    expect(res.isCapped).toBe(false);
    expect(res.recommendedRiskPercent).toBe(1.0);
    expect(res.isSuppressed).toBe(false);
  });

  it('3. Suppresses recommendation when edge verdict is UNPROVEN', () => {
    const res = calculateFractionalKelly({
      winProbability: 0.65,
      averageWinMagnitude: 2000,
      averageLossMagnitude: 1000,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: 'UNPROVEN',
    });

    expect(res.isSuppressed).toBe(true);
    expect(res.recommendedRiskPercent).toBe(0);
    expect(res.suppressionReason).toBe('EDGE_UNPROVEN');
  });

  it('4. Suppresses recommendation when edge verdict is NO_EDGE_NEGATIVE', () => {
    const res = calculateFractionalKelly({
      winProbability: 0.30,
      averageWinMagnitude: 1000,
      averageLossMagnitude: 1000,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: 'NO_EDGE_NEGATIVE',
    });

    expect(res.isSuppressed).toBe(true);
    expect(res.recommendedRiskPercent).toBe(0);
    expect(res.suppressionReason).toBe('NEGATIVE_EDGE');
  });

  it('5. Suppresses recommendation when f* <= 0 (negative expectancy payoff)', () => {
    // 40% win rate, b = 1.0 -> f* = 0.40 - 0.60 = -0.20
    const res = calculateFractionalKelly({
      winProbability: 0.40,
      averageWinMagnitude: 1000,
      averageLossMagnitude: 1000,
      maxRiskPerTradePercent: 2.0,
      edgeVerdict: 'LIKELY_EDGE',
    });

    expect(res.isSuppressed).toBe(true);
    expect(res.recommendedRiskPercent).toBe(0);
    expect(res.suppressionReason).toBe('NEGATIVE_EXPECTANCY_PAYOFF');
  });

  it('6. Handles invalid or non-positive payoff inputs safely', () => {
    const resZeroWin = calculateFractionalKelly({
      winProbability: 0.60,
      averageWinMagnitude: 0,
      averageLossMagnitude: 1000,
    });
    expect(resZeroWin.isSuppressed).toBe(true);
    expect(resZeroWin.suppressionReason).toBe('INSUFFICIENT_PAYOFF_DATA');

    const resNaN = calculateFractionalKelly({
      winProbability: 0.60,
      averageWinMagnitude: NaN,
      averageLossMagnitude: 1000,
    });
    expect(resNaN.isSuppressed).toBe(true);
  });
});
