import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { calculateExcursion } from '../src/excursion.js';

describe('calculateExcursion', () => {
  const baseTime = moment('2026-10-20T09:30:00.000Z');

  function makeCandles(startMoment: moment.Moment, count: number, ohlcList: Array<[number, number, number, number]>): any[] {
    return ohlcList.map(([o, h, l, c], idx) => ({
      t: startMoment.clone().add(idx, 'minutes').unix(), // epoch seconds
      o,
      h,
      l,
      c,
      v: 1000,
    }));
  }

  it('1. calculates standard LONG excursion metrics correctly', () => {
    // Entry at 100, exit at 110. Max High: 120, Min Low: 95. Planned Risk = 500 (stop at 90 -> 10 pts risk * 50 qty = 500)
    const candles = makeCandles(baseTime, 4, [
      [100, 105, 98, 104],   // 09:30
      [104, 120, 103, 118],  // 09:31 (MFE peak at 120)
      [118, 119, 95, 96],    // 09:32 (MAE trough at 95)
      [96, 112, 96, 110],    // 09:33 (Exit at 110)
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 110,
      stopLoss: 90,
      quantity: 50,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(3, 'minutes').toISOString(),
      plannedRiskAmount: 500,
      resolution: '1',
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(20); // 120 - 100
    expect(res.maePoints).toBe(5);  // 100 - 95
    expect(res.mfeAmount).toBe(1000); // 20 * 50 * 1
    expect(res.maeAmount).toBe(250);  // 5 * 50 * 1
    expect(res.mfeR).toBe(2);       // 1000 / 500
    expect(res.maeR).toBe(0.5);     // 250 / 500
    expect(res.exitEfficiency).toBe(0.5); // (110 - 100) / 20 = 10 / 20 = 0.5
    expect(res.stopHit).toBe(false);
    expect(res.reversedAfterStopHit).toBe(false);
    expect(res.timeToMfeMinutes).toBe(1);
    expect(res.timeToMaeMinutes).toBe(2);
    expect(res.candleCount).toBe(4);
  });

  it('2. calculates standard SHORT excursion metrics correctly', () => {
    // Entry at 200, exit at 180. Lowest Low: 160 (MFE), Highest High: 210 (MAE). Planned risk: 1000
    const candles = makeCandles(baseTime, 4, [
      [200, 205, 195, 198], // 09:30
      [198, 210, 196, 202], // 09:31 (MAE high at 210)
      [202, 204, 160, 165], // 09:32 (MFE low at 160)
      [165, 182, 164, 180], // 09:33 (Exit at 180)
    ]);

    const res = calculateExcursion({
      direction: 'SHORT',
      entryPrice: 200,
      exitPrice: 180,
      stopLoss: 220,
      quantity: 25,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(3, 'minutes').toISOString(),
      plannedRiskAmount: 1000,
      resolution: '1',
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(40); // 200 - 160
    expect(res.maePoints).toBe(10); // 210 - 200
    expect(res.mfeAmount).toBe(1000); // 40 * 25
    expect(res.maeAmount).toBe(250);  // 10 * 25
    expect(res.mfeR).toBe(1);
    expect(res.maeR).toBe(0.25);
    expect(res.exitEfficiency).toBe(0.5); // (200 - 180) / 40 = 20 / 40
    expect(res.stopHit).toBe(false);
  });

  it('3. respects contract multiplier for index futures / options', () => {
    // Nifty option: multiplier = 25 (or BankNifty 15)
    const candles = makeCandles(baseTime, 2, [
      [100, 110, 95, 105],
      [105, 120, 102, 115],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 115,
      quantity: 50,
      contractMultiplier: 25,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
      plannedRiskAmount: 5000,
    });

    expect(res.mfePoints).toBe(20); // 120 - 100
    expect(res.maePoints).toBe(5);  // 100 - 95
    expect(res.mfeAmount).toBe(20 * 50 * 25); // 25000
    expect(res.maeAmount).toBe(5 * 50 * 25);   // 6250
    expect(res.mfeR).toBe(5); // 25000 / 5000
    expect(res.maeR).toBe(1.25); // 6250 / 5000
  });

  it('4. filters out non-overlapping candles strictly to trade lifecycle', () => {
    // 5 candles total: 09:28, 09:29, 09:30 (entry), 09:31 (exit), 09:32
    const earlier = baseTime.clone().subtract(2, 'minutes');
    const candles = makeCandles(earlier, 5, [
      [50, 200, 40, 60],   // 09:28 (Outside window - huge high should NOT be counted)
      [60, 150, 50, 70],   // 09:29 (Outside window)
      [100, 105, 99, 104], // 09:30 (Entry)
      [104, 110, 98, 108], // 09:31 (Exit)
      [108, 300, 20, 100], // 09:32 (Outside window - should NOT be counted)
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 108,
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.candleCount).toBe(2);
    expect(res.mfePoints).toBe(10); // 110 - 100 (NOT 200 or 300 from out-of-bounds candles)
    expect(res.maePoints).toBe(2);  // 100 - 98 (NOT 40 or 20 from out-of-bounds candles)
  });

  it('5. returns UNAVAILABLE when trade is open', () => {
    const candles = makeCandles(baseTime, 2, [[100, 105, 95, 102]]);
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: null,
      exitTime: null,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
    });

    expect(res.status).toBe('UNAVAILABLE');
    expect(res.failureReason).toContain('open');
  });

  it('6. returns FAILED when exit timestamp precedes entry timestamp', () => {
    const candles = makeCandles(baseTime, 2, [[100, 105, 95, 102]]);
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().subtract(10, 'minutes').toISOString(),
    });

    expect(res.status).toBe('FAILED');
    expect(res.failureReason).toContain('precedes');
  });

  it('7. returns UNAVAILABLE when candle array is empty', () => {
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      quantity: 10,
      candles: [],
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(5, 'minutes').toISOString(),
    });

    expect(res.status).toBe('UNAVAILABLE');
    expect(res.failureReason).toContain('No candle data');
  });

  it('8. handles zero-MFE documented edge case (immediate adverse exit)', () => {
    // Entered at 100, market only fell to 90 and exited at 90. MFE = 0.
    const candles = makeCandles(baseTime, 2, [
      [100, 100, 95, 95],
      [95, 95, 90, 90],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 90,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(0);
    expect(res.maePoints).toBe(10);
    expect(res.exitEfficiency).toBe(0); // MFE is zero, exit efficiency clamped to 0
  });

  it('9. handles missing or zero planned risk amount (maeR and mfeR are undefined)', () => {
    const candles = makeCandles(baseTime, 2, [
      [100, 110, 95, 105],
      [105, 115, 100, 112],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 112,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
      plannedRiskAmount: 0, // Zero risk
    });

    expect(res.mfeR).toBeUndefined();
    expect(res.maeR).toBeUndefined();
  });

  it('10. detects stopHit and reversedAfterStopHit on LONG trade', () => {
    // Stop loss set at 95.
    // Candle 1: Breaches stop to 92.
    // Candle 2: Reverses violently and reaches 105 (> entryPrice 100).
    const candles = makeCandles(baseTime, 3, [
      [100, 101, 92, 94],  // Stop breached at 92
      [94, 105, 93, 104],  // Reverses past entry (105 >= 100)
      [104, 106, 102, 105],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      stopLoss: 95,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(2, 'minutes').toISOString(),
    });

    expect(res.stopHit).toBe(true);
    expect(res.reversedAfterStopHit).toBe(true);
    expect(res.excursionFlags).toContain('STOP_TOO_TIGHT_EVIDENCE');
  });

  it('11. detects stopHit WITHOUT reversal when price fails to recover entry', () => {
    const candles = makeCandles(baseTime, 2, [
      [100, 101, 92, 93], // Stop breached
      [93, 94, 88, 89],   // Keeps falling
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 89,
      stopLoss: 95,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.stopHit).toBe(true);
    expect(res.reversedAfterStopHit).toBe(false);
    expect(res.excursionFlags).not.toContain('STOP_TOO_TIGHT_EVIDENCE');
  });

  it('12. handles stopEfficiency when stopLoss distance is 0', () => {
    const candles = makeCandles(baseTime, 2, [
      [100, 110, 95, 105],
      [105, 115, 100, 110],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 110,
      stopLoss: 100, // Zero distance from entry
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.stopEfficiency).toBeUndefined();
  });

  it('13. computes single candle execution (entry and exit in same bar)', () => {
    const candles = makeCandles(baseTime, 1, [[100, 115, 95, 108]]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 108,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(30, 'seconds').toISOString(),
    });

    expect(res.candleCount).toBe(1);
    expect(res.mfePoints).toBe(15);
    expect(res.maePoints).toBe(5);
    expect(res.exitEfficiency).toBeCloseTo(8 / 15, 3);
  });

  it('14. sets advisory flag GAVE_BACK_PROFIT when peak profit was lost', () => {
    // Reached 150 (MFE = 50), but closed at 105 (realized = 5). Exit efficiency = 5 / 50 = 0.10 (< 0.50)
    const candles = makeCandles(baseTime, 3, [
      [100, 120, 100, 118],
      [118, 150, 115, 145], // Peak at 150
      [145, 146, 104, 105], // Collapsed to 105
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(2, 'minutes').toISOString(),
      plannedRiskAmount: 50,
    });

    expect(res.excursionFlags).toContain('GAVE_BACK_PROFIT');
  });

  it('15. sets advisory flag EXITED_EARLY when trade exited quickly and MFE ran way further', () => {
    // Entry 100, exit 104 (realized = 4). MFE went to 130 (MFE = 30).
    // Exit eff = 4 / 30 = 0.133. Realized > 0, MFE > 2 * realized.
    const candles = makeCandles(baseTime, 3, [
      [100, 104, 99, 104],  // Exited here
      [104, 115, 103, 114],
      [114, 130, 113, 128], // Ran to 130
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 104,
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(2, 'minutes').toISOString(),
      plannedRiskAmount: 50,
    });

    expect(res.excursionFlags).toContain('GAVE_BACK_PROFIT'); // Exit eff 0.133 < 0.50
  });

  it('16. sets advisory flag STOP_TOO_LOOSE_EVIDENCE when MAE far exceeds stop distance', () => {
    // Planned stop at 95 (distance = 5). Market went down to 80 (MAE = 20 pts > 1.25 * 5 = 6.25).
    const candles = makeCandles(baseTime, 2, [
      [100, 102, 80, 85],
      [85, 90, 84, 88],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 88,
      stopLoss: 95,
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.excursionFlags).toContain('STOP_TOO_LOOSE_EVIDENCE');
  });

  it('17. SHORT trade stop reversal detection', () => {
    // Short at 200, stop at 210.
    // Candle 1: breaches to 215 (stop hit).
    // Candle 2: crashes down to 190 (<= entry 200).
    const candles = makeCandles(baseTime, 2, [
      [200, 215, 198, 212], // Stop breached
      [212, 214, 190, 192], // Crashes back to 190 <= entry
    ]);

    const res = calculateExcursion({
      direction: 'SHORT',
      entryPrice: 200,
      exitPrice: 192,
      stopLoss: 210,
      quantity: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(1, 'minutes').toISOString(),
    });

    expect(res.stopHit).toBe(true);
    expect(res.reversedAfterStopHit).toBe(true);
    expect(res.excursionFlags).toContain('STOP_TOO_TIGHT_EVIDENCE');
  });

  it('18. handles candle timestamps provided in milliseconds seamlessly', () => {
    const candlesMs = [
      { t: baseTime.valueOf(), o: 100, h: 110, l: 98, c: 105 },
      { t: baseTime.clone().add(1, 'minute').valueOf(), o: 105, h: 120, l: 102, c: 115 },
    ];

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 115,
      quantity: 10,
      candles: candlesMs,
      entryTime: baseTime.valueOf(),
      exitTime: baseTime.clone().add(1, 'minute').valueOf(),
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(20);
    expect(res.maePoints).toBe(2);
  });
});
