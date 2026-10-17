import { describe, it, expect } from 'vitest';
import { calculateLinearPnL } from '../src/pnl.js';

describe('Financial Engine - P&L Calculations', () => {
  it('calculates long trade gross and net P&L with exact decimals', () => {
    // Buy 100 shares at 2500.50, sell at 2550.75
    // Gross = (2550.75 - 2500.50) * 100 * 1 = 50.25 * 100 = 5025.00
    // Fees = 40 (brokerage) + 15.50 (exchange) + 50.25 (taxes) = 105.75
    // Net = 5025.00 - 105.75 = 4919.25
    const result = calculateLinearPnL({
      direction: 'LONG',
      entryPrice: '2500.50',
      exitPrice: '2550.75',
      quantity: 100,
      contractMultiplier: 1,
      brokerage: '40.00',
      exchangeFees: '15.50',
      taxes: '50.25',
    });

    expect(result.grossPnLNumber).toBe(5025.00);
    expect(result.totalCostsNumber).toBe(105.75);
    expect(result.netPnLNumber).toBe(4919.25);
    expect(result.outcome).toBe('WIN');
    expect(result.isClosed).toBe(true);
  });

  it('calculates short trade gross and net P&L correctly', () => {
    // Short 50 shares at 1000.00, buy back to cover at 950.00
    // Gross = (1000.00 - 950.00) * 50 = 50 * 50 = 2500.00
    // Fees = 50
    // Net = 2450.00
    const result = calculateLinearPnL({
      direction: 'SHORT',
      entryPrice: 1000,
      exitPrice: 950,
      quantity: 50,
      contractMultiplier: 1,
      brokerage: 50,
    });

    expect(result.grossPnLNumber).toBe(2500.00);
    expect(result.netPnLNumber).toBe(2450.00);
    expect(result.outcome).toBe('WIN');
  });

  it('calculates short trade loss correctly', () => {
    // Short at 1000.00, price rises to 1050.00
    // Gross = (1000 - 1050) * 50 = -2500.00
    // Fees = 50
    // Net = -2550.00
    const result = calculateLinearPnL({
      direction: 'SHORT',
      entryPrice: 1000,
      exitPrice: 1050,
      quantity: 50,
      contractMultiplier: 1,
      brokerage: 50,
    });

    expect(result.grossPnLNumber).toBe(-2500.00);
    expect(result.netPnLNumber).toBe(-2550.00);
    expect(result.outcome).toBe('LOSS');
  });

  it('correctly handles MCX commodity contract multipliers (e.g. Crude Oil x100, Natural Gas x1250)', () => {
    // Crude Oil: 2 lots (200 barrels), bought at 6200, sold at 6250
    // Points = 50. Multiplier = 100. Quantity = 2 lots.
    // Gross = 50 * 2 * 100 = 10,000 INR
    const crudeResult = calculateLinearPnL({
      direction: 'LONG',
      entryPrice: 6200,
      exitPrice: 6250,
      quantity: 2,
      contractMultiplier: 100,
      brokerage: 80,
      taxes: 120,
    });

    expect(crudeResult.grossPnLNumber).toBe(10000);
    expect(crudeResult.netPnLNumber).toBe(9800);

    // Natural Gas: 1 lot (1250 mmBtu), sold short at 240.50, covered at 235.00
    // Points = 5.50. Multiplier = 1250. Quantity = 1 lot.
    // Gross = 5.50 * 1 * 1250 = 6875.00
    const ngResult = calculateLinearPnL({
      direction: 'SHORT',
      entryPrice: 240.50,
      exitPrice: 235.00,
      quantity: 1,
      contractMultiplier: 1250,
    });

    expect(ngResult.grossPnLNumber).toBe(6875);
  });

  it('handles breakeven trade where gross gain equals exact fees', () => {
    // Buy at 100, sell at 101, qty 10. Gross = 10. Fees = 10. Net = 0.
    const result = calculateLinearPnL({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 101,
      quantity: 10,
      brokerage: 10,
    });

    expect(result.grossPnLNumber).toBe(10);
    expect(result.netPnLNumber).toBe(0);
    expect(result.outcome).toBe('BREAKEVEN');
  });

  it('handles open trade with no exit price yet', () => {
    const result = calculateLinearPnL({
      direction: 'LONG',
      entryPrice: 500,
      quantity: 10,
      brokerage: 20,
    });

    expect(result.isClosed).toBe(false);
    expect(result.outcome).toBe('OPEN');
    expect(result.grossPnLNumber).toBe(0);
    expect(result.netPnLNumber).toBe(-20); // only costs incurred so far
  });

  it('throws on negative quantity', () => {
    expect(() =>
      calculateLinearPnL({
        direction: 'LONG',
        entryPrice: 100,
        exitPrice: 110,
        quantity: -5,
      })
    ).toThrow('Quantity cannot be negative');
  });
});
