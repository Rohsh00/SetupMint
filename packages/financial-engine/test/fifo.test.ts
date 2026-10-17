import { describe, it, expect } from 'vitest';
import { calculateFIFOExecution } from '../src/fifo.js';
import { ITradeFill } from '@tradevault/shared';

describe('Financial Engine - FIFO Matching', () => {
  it('matches single entry and single exit', () => {
    const fills: ITradeFill[] = [
      { fillId: 'f1', type: 'ENTRY', price: 100, quantity: 50, timestamp: '2026-10-10T10:00:00Z', fee: 10 },
      { fillId: 'f2', type: 'EXIT', price: 110, quantity: 50, timestamp: '2026-10-10T11:00:00Z', fee: 10 },
    ];

    const result = calculateFIFOExecution('LONG', fills, 1);

    expect(result.isFullyClosed).toBe(true);
    expect(result.isOpen).toBe(false);
    expect(result.closedQuantity.toNumber()).toBe(50);
    expect(result.openQuantity.toNumber()).toBe(0);
    expect(result.weightedAvgEntryPrice.toNumber()).toBe(100);
    expect(result.weightedAvgExitPrice?.toNumber()).toBe(110);
    // Gross: (110 - 100) * 50 = 500
    expect(result.realizedGrossPnL.toNumber()).toBe(500);
    // Costs: 10 + 10 = 20
    expect(result.totalCosts.toNumber()).toBe(20);
    // Net: 500 - 20 = 480
    expect(result.realizedNetPnL.toNumber()).toBe(480);
    expect(result.outcome).toBe('WIN');
  });

  it('matches multiple entries and partial exits in strict FIFO order', () => {
    // Fill 1: Buy 100 @ 100
    // Fill 2: Buy 50 @ 110
    // Weighted avg entry = (100*100 + 50*110) / 150 = (10000 + 5500) / 150 = 15500 / 150 = 103.3333
    // Fill 3: Exit 80 @ 120 (Matches 80 from Fill 1 @ 100 -> gain = (120-100)*80 = 1600)
    // Fill 4: Exit 40 @ 125 (Matches remaining 20 from Fill 1 @ 100 -> gain = 20*25 = 500; plus 20 from Fill 2 @ 110 -> gain = 20*15 = 300)
    // Total closed qty = 120. Remaining open = 30 (from Fill 2 @ 110).
    const fills: ITradeFill[] = [
      { fillId: 'f1', type: 'ENTRY', price: 100, quantity: 100, timestamp: '2026-10-10T09:15:00Z' },
      { fillId: 'f2', type: 'ENTRY', price: 110, quantity: 50, timestamp: '2026-10-10T09:30:00Z' },
      { fillId: 'f3', type: 'EXIT', price: 120, quantity: 80, timestamp: '2026-10-10T10:00:00Z' },
      { fillId: 'f4', type: 'EXIT', price: 125, quantity: 40, timestamp: '2026-10-10T11:00:00Z' },
    ];

    const result = calculateFIFOExecution('LONG', fills, 1);

    expect(result.totalEntryQuantity.toNumber()).toBe(150);
    expect(result.totalExitQuantity.toNumber()).toBe(120);
    expect(result.closedQuantity.toNumber()).toBe(120);
    expect(result.openQuantity.toNumber()).toBe(30);
    expect(result.isFullyClosed).toBe(false);
    expect(result.isOpen).toBe(true);

    // Matches:
    // f1 (80) with f3 -> 1600
    // f1 (20) with f4 -> 500
    // f2 (20) with f4 -> 300
    // Total realized gross P&L = 1600 + 500 + 300 = 2400
    expect(result.realizedGrossPnL.toNumber()).toBe(2400);
    expect(result.matches.length).toBe(3);
  });
});
