import { describe, it, expect } from 'vitest';
import {
  calculateContinuousTiltScore,
  TiltCalculationInput,
} from '../src/tilt.js';

describe('Continuous Tilt Score Engine', () => {
  it('1. Calm baseline: winning streak with normal size and spacing returns CALM (< 30)', () => {
    const input: TiltCalculationInput = {
      recentTrades: [
        { id: '1', netPnL: 2000, quantity: 50, exitTime: new Date(Date.now() - 3600 * 1000) },
        { id: '2', netPnL: 1500, quantity: 50, exitTime: new Date(Date.now() - 1800 * 1000) },
      ],
      proposedQuantity: 50,
      proposedEntryTime: new Date(),
      dailyLossLimit: 10000,
      currentDayRealizedLoss: 0,
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.level).toBe('CALM');
    expect(res.score).toBeLessThanOrEqual(30);
    expect(res.components.consecutiveLosses).toBe(0);
    expect(res.components.sizeEscalationRatio).toBe(1.0);
    expect(res.components.dailyLossPercent).toBe(0);
  });

  it('2. Loss streak triggers loss streak sub-score and warning', () => {
    const input: TiltCalculationInput = {
      recentTrades: [
        { id: '1', netPnL: -1000, quantity: 25 },
        { id: '2', netPnL: -1500, quantity: 25 },
        { id: '3', netPnL: -2000, quantity: 25 },
        { id: '4', netPnL: -1200, quantity: 25 },
      ],
      proposedQuantity: 25,
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.components.consecutiveLosses).toBe(4);
    expect(res.components.lossStreakScore).toBeGreaterThanOrEqual(80);
    expect(res.warnings.some((w) => w.includes('Consecutive loss streak of 4'))).toBe(true);
  });

  it('3. Size escalation: proposing 3x baseline quantity triggers size escalation score', () => {
    const input: TiltCalculationInput = {
      recentTrades: Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        netPnL: 500,
        quantity: 50,
      })),
      proposedQuantity: 150, // 3x baseline of 50
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.components.sizeEscalationRatio).toBe(3.0);
    expect(res.components.sizeEscalationScore).toBe(100);
    expect(res.warnings.some((w) => w.includes('3x larger'))).toBe(true);
  });

  it('4. Time compression: rapid re-entry (< 2 mins) triggers high time compression score', () => {
    const now = Date.now();
    const input: TiltCalculationInput = {
      recentTrades: [
        { id: '1', netPnL: -1000, quantity: 50, exitTime: new Date(now - 90 * 1000) }, // 1.5 mins ago
      ],
      proposedEntryTime: new Date(now),
      proposedQuantity: 50,
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.components.minutesSinceLastTrade).toBeLessThan(2);
    expect(res.components.timeCompressionScore).toBeGreaterThanOrEqual(90);
    expect(res.warnings.some((w) => w.includes('Rapid re-entry'))).toBe(true);
  });

  it('5. Approaching daily loss limit triggers daily loss proximity score', () => {
    const input: TiltCalculationInput = {
      recentTrades: [],
      dailyLossLimit: 20000,
      currentDayRealizedLoss: 18000, // 90% of limit
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.components.dailyLossPercent).toBe(90.0);
    expect(res.components.dailyLossProximityScore).toBe(90);
    expect(res.warnings.some((w) => w.includes('Approaching max daily loss limit'))).toBe(true);
  });

  it('6. Severe multi-marker tilt triggers SEVERE_TILT level (>= 81)', () => {
    const now = Date.now();
    const input: TiltCalculationInput = {
      recentTrades: [
        { id: '1', netPnL: -2000, quantity: 25, exitTime: new Date(now - 120 * 1000) },
        { id: '2', netPnL: -3000, quantity: 25, exitTime: new Date(now - 60 * 1000) },
        { id: '3', netPnL: -4000, quantity: 25, exitTime: new Date(now - 30 * 1000) },
        { id: '4', netPnL: -5000, quantity: 25, exitTime: new Date(now - 10 * 1000) },
      ],
      proposedQuantity: 75, // 3x baseline
      proposedEntryTime: new Date(now),
      dailyLossLimit: 20000,
      currentDayRealizedLoss: 18000,
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.level).toBe('SEVERE_TILT');
    expect(res.score).toBeGreaterThanOrEqual(81);
    expect(res.advisoryNote).toContain('CRITICAL TILT ALERT');
  });

  it('7. Handles missing timestamps and limits gracefully without NaN', () => {
    const input: TiltCalculationInput = {
      recentTrades: [
        { id: '1', netPnL: -1000 },
        { id: '2', netPnL: 500 },
      ],
    };

    const res = calculateContinuousTiltScore(input);
    expect(Number.isNaN(res.score)).toBe(false);
    expect(res.components.timeCompressionScore).toBe(0);
    expect(res.components.dailyLossProximityScore).toBe(0);
  });

  it('8. Weight normalization works when custom weights are passed', () => {
    const input: TiltCalculationInput = {
      recentTrades: [{ id: '1', netPnL: -1000, quantity: 25 }],
      weights: {
        lossStreakWeight: 10,
        sizeEscalationWeight: 0,
        timeCompressionWeight: 0,
        dailyLossProximityWeight: 0,
      },
    };

    const res = calculateContinuousTiltScore(input);
    expect(res.normalizedWeights.w1).toBe(1.0);
    expect(res.normalizedWeights.w2).toBe(0.0);
  });
});
