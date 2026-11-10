import { describe, it, expect } from 'vitest';
import { sanitizeTradeFills } from '../src/sanitize-fills.js';
import { calculateFIFOExecution } from '../src/fifo.js';

describe('sanitizeTradeFills', () => {
  it('handles empty or non-array inputs safely', () => {
    expect(sanitizeTradeFills([]).fills).toEqual([]);
    expect(sanitizeTradeFills(null as any).fills).toEqual([]);
    expect(sanitizeTradeFills(undefined as any).fills).toEqual([]);
  });

  it('preserves clean single entry and single exit fills', () => {
    const rawFills = [
      { fillId: 'f1', type: 'ENTRY', price: 4118.18, quantity: 0.01, timestamp: '2026-11-10T12:51:00Z' },
      { fillId: 'f2', type: 'EXIT', price: 4116.12, quantity: 0.01, timestamp: '2026-11-10T13:05:00Z' },
    ];

    const result = sanitizeTradeFills(rawFills);
    expect(result.hasChanges).toBe(false);
    expect(result.duplicateCount).toBe(0);
    expect(result.fills.length).toBe(2);
    expect(result.totalEntries).toBe(0.01);
    expect(result.sanitizedTotalExits).toBe(0.01);
  });

  it('removes duplicate exit fills with identical fillIds (the Elefin MT5 bug)', () => {
    const rawFills = [
      { fillId: 'mt5_14330300_entry', type: 'ENTRY', price: 4118.18, quantity: 0.01, timestamp: '2026-11-10T12:51:00Z' },
      { fillId: 'mt5_14330300_exit', type: 'EXIT', price: 4116.12, quantity: 0.01, timestamp: '2026-11-10T13:05:00Z' },
      { fillId: 'mt5_14330300_exit', type: 'EXIT', price: 4116.12, quantity: 0.01, timestamp: '2026-11-10T13:05:00Z' },
    ];

    const result = sanitizeTradeFills(rawFills);
    expect(result.hasChanges).toBe(true);
    expect(result.duplicateCount).toBe(1);
    expect(result.fills.length).toBe(2);
    expect(result.originalTotalExits).toBe(0.02);
    expect(result.sanitizedTotalExits).toBe(0.01);

    // FIFO calculation should now succeed without throwing
    const fifo = calculateFIFOExecution('LONG', result.fills, 100);
    expect(fifo.isFullyClosed).toBe(true);
    expect(fifo.openQuantity.toNumber()).toBe(0);
  });

  it('removes identical duplicate exit fills even when fillIds differ or are random', () => {
    const rawFills = [
      { fillId: 'e1', type: 'ENTRY', price: 4118.18, quantity: 0.01, timestamp: '2026-11-10T12:51:00Z' },
      { fillId: 'x1', type: 'EXIT', price: 4116.12, quantity: 0.01, timestamp: '2026-11-10T13:05:00Z' },
      { fillId: 'x2', type: 'EXIT', price: 4116.12, quantity: 0.01, timestamp: '2026-11-10T13:05:02Z' },
    ];

    const result = sanitizeTradeFills(rawFills);
    expect(result.hasChanges).toBe(true);
    expect(result.duplicateCount).toBe(1);
    expect(result.fills.length).toBe(2);
    expect(result.sanitizedTotalExits).toBe(0.01);
  });

  it('caps excess exit quantity when total exits exceed entry quantity', () => {
    const rawFills = [
      { fillId: 'e1', type: 'ENTRY', price: 100, quantity: 50, timestamp: '2026-11-10T10:00:00Z' },
      { fillId: 'x1', type: 'EXIT', price: 105, quantity: 30, timestamp: '2026-11-10T11:00:00Z' },
      { fillId: 'x2', type: 'EXIT', price: 110, quantity: 40, timestamp: '2026-11-10T12:00:00Z' }, // 30 + 40 = 70 > 50
    ];

    const result = sanitizeTradeFills(rawFills);
    expect(result.hasChanges).toBe(true);
    expect(result.fills.length).toBe(3);
    expect(result.sanitizedTotalExits).toBe(50);
    expect(result.fills[2].quantity).toBe(20); // Capped from 40 to 20
  });

  it('preserves valid partial profit scales', () => {
    const rawFills = [
      { fillId: 'e1', type: 'ENTRY', price: 4000, quantity: 0.03, timestamp: '2026-11-10T09:00:00Z' },
      { fillId: 'x1', type: 'EXIT', price: 4050, quantity: 0.01, timestamp: '2026-11-10T10:00:00Z' },
      { fillId: 'x2', type: 'EXIT', price: 4100, quantity: 0.01, timestamp: '2026-11-10T11:00:00Z' },
      { fillId: 'x3', type: 'EXIT', price: 4150, quantity: 0.01, timestamp: '2026-11-10T12:00:00Z' },
    ];

    const result = sanitizeTradeFills(rawFills);
    expect(result.hasChanges).toBe(false);
    expect(result.duplicateCount).toBe(0);
    expect(result.fills.length).toBe(4);
    expect(result.sanitizedTotalExits).toBe(0.03);
  });
});

