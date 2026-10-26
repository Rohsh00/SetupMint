import { describe, it, expect } from 'vitest';
import { calculateLongestDrawdownRecovery } from '../src/drawdown.js';

describe('calculateLongestDrawdownRecovery Engine', () => {
  it('1. Handles empty series gracefully', () => {
    const res = calculateLongestDrawdownRecovery([]);
    expect(res.currentDrawdown).toBe(0);
    expect(res.maxDrawdown).toBe(0);
    expect(res.longestRecoveryDays).toBe(0);
    expect(res.episodes).toHaveLength(0);
  });

  it('2. Zero drawdown when equity is monotonically increasing', () => {
    const points = [
      { date: '2026-01-01', cumulativeEquity: 100000 },
      { date: '2026-01-02', cumulativeEquity: 105000 },
      { date: '2026-01-03', cumulativeEquity: 110000 },
    ];
    const res = calculateLongestDrawdownRecovery(points);
    expect(res.currentDrawdown).toBe(0);
    expect(res.maxDrawdown).toBe(0);
    expect(res.longestRecoveryDays).toBe(0);
    expect(res.episodes).toHaveLength(0);
  });

  it('3. Computes complete peak-to-trough-to-recovery episode duration', () => {
    const points = [
      { date: '2026-01-01', cumulativeEquity: 100000 }, // Peak
      { date: '2026-01-05', cumulativeEquity: 90000 },  // Trough: -10,000 (-10%)
      { date: '2026-01-08', cumulativeEquity: 95000 },
      { date: '2026-01-11', cumulativeEquity: 102000 }, // Recovered at Jan 11 (10 days from Jan 1)
      { date: '2026-01-15', cumulativeEquity: 104000 },
    ];
    const res = calculateLongestDrawdownRecovery(points);
    expect(res.maxDrawdown).toBe(10000);
    expect(res.maxDrawdownPercent).toBe(10);
    expect(res.currentDrawdown).toBe(0);
    expect(res.longestRecoveryDays).toBe(10);
    expect(res.longestRecoveryPoints).toBe(3);
    expect(res.episodes).toHaveLength(1);
    expect(res.episodes[0].isRecovered).toBe(true);
    expect(res.episodes[0].peakDate).toBe('2026-01-01');
    expect(res.episodes[0].troughDate).toBe('2026-01-05');
    expect(res.episodes[0].recoveryDate).toBe('2026-01-11');
  });

  it('4. Handles ongoing unrecovered drawdown at the end of series', () => {
    const points = [
      { date: '2026-01-01', cumulativeEquity: 100000 },
      { date: '2026-01-10', cumulativeEquity: 85000 }, // Drawdown -15,000 (-15%)
      { date: '2026-01-20', cumulativeEquity: 92000 }, // Still below 100,000
    ];
    const res = calculateLongestDrawdownRecovery(points);
    expect(res.currentDrawdown).toBe(8000);
    expect(res.maxDrawdown).toBe(15000);
    expect(res.maxDrawdownPercent).toBe(15);
    expect(res.episodes).toHaveLength(1);
    expect(res.episodes[0].isRecovered).toBe(false);
    expect(res.episodes[0].durationDays).toBe(19);
  });
});
