import { describe, it, expect } from 'vitest';
import { calculateRiskAndPositionSize, calculateRealizedRMultiple } from '../src/risk.js';

describe('Financial Engine - Risk Management & Sizing', () => {
  it('calculates suggested quantity rounded to lot size for Long equity', () => {
    // Equity: 500,000 INR
    // Risk %: 1% = 5,000 INR
    // Entry: 2500, Stop: 2450 (stop distance = 50)
    // Loss per unit = 50 * 1 = 50
    // Raw suggested qty = 5000 / 50 = 100 shares
    // Target: 2650 (reward distance = 150)
    // R:R = 150 / 50 = 3.0
    const result = calculateRiskAndPositionSize({
      accountEquity: 500000,
      riskPercent: 1,
      entryPrice: 2500,
      stopLossPrice: 2450,
      targetPrice: 2650,
      direction: 'LONG',
      contractMultiplier: 1,
      lotSize: 1,
    });

    expect(result.plannedRiskAmount).toBe(5000);
    expect(result.stopLossDistance).toBe(50);
    expect(result.lossPerUnitAtStop).toBe(50);
    expect(result.rawSuggestedQuantity).toBe(100);
    expect(result.roundedLotQuantity).toBe(100);
    expect(result.estimatedMonetaryLoss).toBe(5000);
    expect(result.rewardRiskRatio).toBe(3);
    expect(result.isDirectionValid).toBe(true);
    expect(result.isStopDistanceZero).toBe(false);
  });

  it('rounds quantity down to contract lot sizes (e.g. NIFTY lot 25)', () => {
    // Equity: 200,000 INR, Risk 2% = 4,000 INR
    // NIFTY Entry: 24,000, Stop: 23,940 (stop distance = 60 points)
    // Loss per unit = 60. Raw suggested = 4000 / 60 = 66.6666 units
    // Lot size = 25 -> floor(66.6666 / 25) * 25 = 2 * 25 = 50 units (2 lots)
    const result = calculateRiskAndPositionSize({
      accountEquity: 200000,
      riskPercent: 2,
      entryPrice: 24000,
      stopLossPrice: 23940,
      direction: 'LONG',
      contractMultiplier: 1,
      lotSize: 25,
      quantityIncrement: 25,
    });

    expect(result.rawSuggestedQuantity).toBeCloseTo(66.6667, 2);
    expect(result.roundedLotQuantity).toBe(50); // rounded down to safe lot size
    expect(result.estimatedMonetaryLoss).toBe(3000); // 50 * 60 = 3000 (well within 4000 risk)
  });

  it('catches zero stop distance and returns warning', () => {
    const result = calculateRiskAndPositionSize({
      accountEquity: 100000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 100, // zero stop
      direction: 'LONG',
    });

    expect(result.isStopDistanceZero).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.roundedLotQuantity).toBe(0);
  });

  it('detects invalid direction (e.g. LONG with stop loss above entry)', () => {
    const result = calculateRiskAndPositionSize({
      accountEquity: 100000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 110, // Invalid for LONG
      direction: 'LONG',
    });

    expect(result.isDirectionValid).toBe(false);
    expect(result.warnings.some((w) => w.includes('LONG trades, initial stop-loss must be lower'))).toBe(true);
  });

  it('calculates rewardRiskRatio correctly even when budget is below 1 lot (0 rounded units)', () => {
    // User scenario: Entry 121,105, Stop 120,845 (stop distance = 260), Target 121,605 (reward distance = 500)
    // Fixed risk budget: 1496. Lot size: 6. Minimum lot risk: 6 * 260 = 1560 > 1496 -> 0 units.
    // Structural R:R must still be 500 / 260 = 1.92
    const result = calculateRiskAndPositionSize({
      accountEquity: 656346.8,
      fixedRiskAmount: 1496,
      entryPrice: 121105,
      stopLossPrice: 120845,
      targetPrice: 121605,
      direction: 'LONG',
      contractMultiplier: 1,
      lotSize: 6,
      quantityIncrement: 6,
    });

    expect(result.stopLossDistance).toBe(260);
    expect(result.roundedLotQuantity).toBe(0);
    expect(result.rawSuggestedQuantity).toBeCloseTo(5.7538, 2);
    expect(result.rewardRiskRatio).toBe(1.92);
    expect(result.isDirectionValid).toBe(true);
    expect(result.isStopDistanceZero).toBe(false);
  });

  it('calculates realized R-multiple accurately', () => {
    // Made 7,500 on a trade where planned risk was 2,500 -> 3.00 R
    expect(calculateRealizedRMultiple(7500, 2500)).toBe(3.0);
    // Lost 2,500 on planned risk of 2,500 -> -1.00 R
    expect(calculateRealizedRMultiple(-2500, 2500)).toBe(-1.0);
    // Handled missing risk or zero risk without dividing by zero
    expect(calculateRealizedRMultiple(1000, 0)).toBeUndefined();
    expect(calculateRealizedRMultiple(1000, null)).toBeUndefined();
  });
});

