import { describe, it, expect } from 'vitest';
import { calculateExecutionSlippage, aggregateSlippageMetrics } from '../src/slippage.js';

describe('calculateExecutionSlippage Engine', () => {
  it('returns hasSlippageData = false when no planned levels are provided', () => {
    const res = calculateExecutionSlippage({
      direction: 'LONG',
      quantity: 50,
      actualEntryPrice: 24500,
      actualExitPrice: 24600,
    });
    expect(res.hasSlippageData).toBe(false);
  });

  it('correctly calculates adverse entry slippage for LONG trades (actual > planned)', () => {
    // Planned 24500, filled at 24502.50 (2.50 pts adverse) for 50 qty
    const res = calculateExecutionSlippage({
      direction: 'LONG',
      quantity: 50,
      contractMultiplier: 1,
      plannedEntryPrice: 24500,
      actualEntryPrice: 24502.5,
    });

    expect(res.hasSlippageData).toBe(true);
    expect(res.isEntryAdverse).toBe(true);
    expect(res.entrySlippagePoints).toBe(2.5);
    expect(res.entrySlippageCost).toBe(125); // 2.5 * 50
    expect(res.totalSlippageCost).toBe(125);
    expect(res.summaryText).toContain('Entry adverse (+2.50 pts drag)');
  });

  it('correctly calculates favorable entry price improvement for LONG trades (actual < planned)', () => {
    // Planned 24500, filled at 24498 (2 pts favorable) for 100 qty
    const res = calculateExecutionSlippage({
      direction: 'LONG',
      quantity: 100,
      contractMultiplier: 1,
      plannedEntryPrice: 24500,
      actualEntryPrice: 24498,
    });

    expect(res.hasSlippageData).toBe(true);
    expect(res.isEntryAdverse).toBe(false);
    expect(res.entrySlippagePoints).toBe(-2);
    expect(res.entrySlippageCost).toBe(-200); // 200 saved
    expect(res.totalSlippageCost).toBe(-200);
    expect(res.summaryText).toContain('Entry improved (-2.00 pts saved)');
  });

  it('correctly calculates adverse entry slippage for SHORT trades (actual < planned)', () => {
    // SHORT: planned to sell at 500, sold at 498 (2 pts adverse)
    const res = calculateExecutionSlippage({
      direction: 'SHORT',
      quantity: 100,
      contractMultiplier: 1,
      plannedEntryPrice: 500,
      actualEntryPrice: 498,
    });

    expect(res.hasSlippageData).toBe(true);
    expect(res.isEntryAdverse).toBe(true);
    expect(res.entrySlippagePoints).toBe(2);
    expect(res.entrySlippageCost).toBe(200);
  });

  it('correctly calculates adverse exit slippage on stop loss trigger', () => {
    // LONG trade stopped out: planned stop was 24400, actually exited at 24395 (5 pts adverse)
    const res = calculateExecutionSlippage({
      direction: 'LONG',
      quantity: 25,
      actualEntryPrice: 24500,
      actualExitPrice: 24395,
      initialStopLoss: 24400,
      outcome: 'LOSS',
    });

    expect(res.hasSlippageData).toBe(true);
    expect(res.isExitAdverse).toBe(true);
    expect(res.exitSlippagePoints).toBe(5);
    expect(res.exitSlippageCost).toBe(125); // 5 * 25
  });

  it('combines entry and exit slippage with contract multipliers correctly', () => {
    // MCX Crude Oil: contractMultiplier = 100
    // Entry: planned 6000, filled 6002 (+2 pts adverse)
    // Exit: stop 5950, exited 5948 (+2 pts adverse)
    // Total adverse points = 4, qty = 1 lot, multiplier = 100 => 400 ₹ cost
    const res = calculateExecutionSlippage({
      direction: 'LONG',
      quantity: 1,
      contractMultiplier: 100,
      plannedEntryPrice: 6000,
      actualEntryPrice: 6002,
      initialStopLoss: 5950,
      actualExitPrice: 5948,
      outcome: 'LOSS',
    });

    expect(res.entrySlippageCost).toBe(200);
    expect(res.exitSlippageCost).toBe(200);
    expect(res.totalSlippageCost).toBe(400);
  });

  it('aggregates slippage metrics across multiple trades', () => {
    const trades = [
      {
        calculated: {
          slippage: {
            hasSlippageData: true,
            totalSlippageCost: 150,
            isEntryAdverse: true,
            entrySlippagePoints: 3,
          },
        },
      },
      {
        calculated: {
          slippage: {
            hasSlippageData: true,
            totalSlippageCost: -50,
            isEntryAdverse: false,
            entrySlippagePoints: -1,
          },
        },
      },
      {
        calculated: {
          slippage: {
            hasSlippageData: false,
          },
        },
      },
    ];

    const agg = aggregateSlippageMetrics(trades);
    expect(agg.tradesWithSlippageCount).toBe(2);
    expect(agg.totalSlippageCost).toBe(100);
    expect(agg.avgSlippagePerTrade).toBe(50);
    expect(agg.adverseTradesCount).toBe(1);
    expect(agg.favorableTradesCount).toBe(1);
    expect(agg.adverseEntryCount).toBe(1);
    expect(agg.favorableEntryCount).toBe(1);
  });
});

