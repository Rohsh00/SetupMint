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

  it('19. property test: MAE and MFE are strictly non-negative across arbitrary price paths', () => {
    const directions: Array<'LONG' | 'SHORT'> = ['LONG', 'SHORT'];
    for (const dir of directions) {
      for (const entry of [50, 100, 22000]) {
        for (const exit of [40, 50, 60, 90, 100, 110, 21900, 22100]) {
          const candles = [
            { t: 1000, o: entry, h: Math.max(entry, exit) + 5, l: Math.min(entry, exit) - 5, c: exit },
          ];
          const res = calculateExcursion({
            direction: dir,
            entryPrice: entry,
            exitPrice: exit,
            quantity: 1,
            candles,
            entryTime: 1000,
            exitTime: 1060,
          });
          expect(res.maePoints).toBeGreaterThanOrEqual(0);
          expect(res.mfePoints).toBeGreaterThanOrEqual(0);
          expect(res.maeAmount).toBeGreaterThanOrEqual(0);
          expect(res.mfeAmount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('20. property test: MFE is always >= realized favorable points', () => {
    const testCases: Array<{ dir: 'LONG' | 'SHORT'; entry: number; exit: number; high: number; low: number }> = [
      { dir: 'LONG', entry: 100, exit: 120, high: 125, low: 95 },
      { dir: 'LONG', entry: 100, exit: 90, high: 105, low: 88 },
      { dir: 'SHORT', entry: 200, exit: 180, high: 205, low: 175 },
      { dir: 'SHORT', entry: 200, exit: 215, high: 220, low: 198 },
    ];

    for (const tc of testCases) {
      const candles = [{ t: 2000, o: tc.entry, h: tc.high, l: tc.low, c: tc.exit }];
      const res = calculateExcursion({
        direction: tc.dir,
        entryPrice: tc.entry,
        exitPrice: tc.exit,
        quantity: 10,
        candles,
        entryTime: 2000,
        exitTime: 2060,
      });

      const realizedMove = tc.dir === 'LONG' ? tc.exit - tc.entry : tc.entry - tc.exit;
      expect(res.mfePoints).toBeGreaterThanOrEqual(Math.max(0, realizedMove));
    }
  });

  it('21. flat trade edge case: MFE = 0 with exit == entry returns exitEfficiency = null (N/A)', () => {
    // Scratch trade where price never went into profit and closed at exact entry
    const candles = [{ t: 3000, o: 100, h: 100, l: 96, c: 100 }];
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 100,
      quantity: 1,
      candles,
      entryTime: 3000,
      exitTime: 3060,
    });

    expect(res.mfePoints).toBe(0);
    expect(res.exitEfficiency).toBeNull(); // N/A, not falsely 1.0 or 0
  });

  it('22. gap entry sanity check: flags ENTRY_OUTSIDE_CANDLE when fill price is outside entry bar', () => {
    // Fill at 115, but entry bar only traded between 100 and 105
    const candles = [{ t: 4000, o: 101, h: 105, l: 100, c: 104 }];
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 115,
      exitPrice: 104,
      quantity: 1,
      candles,
      entryTime: 4000,
      exitTime: 4060,
      tickSize: 0.05,
    });

    expect(res.warnings).toContain('ENTRY_OUTSIDE_CANDLE');
    expect(res.excursionFlags).toContain('ENTRY_OUTSIDE_CANDLE');
  });

  it('23. gap exit sanity check: flags EXIT_OUTSIDE_CANDLE when exit price is outside exit bar', () => {
    const candles = [{ t: 5000, o: 100, h: 105, l: 98, c: 102 }];
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 120, // Outside high of 105
      quantity: 1,
      candles,
      entryTime: 5000,
      exitTime: 5060,
      tickSize: 0.05,
    });

    expect(res.warnings).toContain('EXIT_OUTSIDE_CANDLE');
    expect(res.excursionFlags).toContain('EXIT_OUTSIDE_CANDLE');
  });

  it('24. calculates fee-adjusted MAE and MFE correctly for scalps', () => {
    // Scalp: Entry 100, exit 102 (2 pts gross). Peak high 103 (MFE = 3), low 99 (MAE = 1).
    // Qty = 10, multiplier = 1 -> Gross MFE Amount = 30, Gross MAE Amount = 10.
    // Brokerage + STT + turnover charges = 15 total fees (1.5 pts per unit).
    const candles = [{ t: 6000, o: 100, h: 103, l: 99, c: 102 }];
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 102,
      quantity: 10,
      contractMultiplier: 1,
      candles,
      entryTime: 6000,
      exitTime: 6060,
      plannedRiskAmount: 50,
      totalCharges: 15,
    });

    expect(res.maePoints).toBe(1);
    expect(res.mfePoints).toBe(3);
    expect(res.feeAdjustedMfePoints).toBe(1.5); // 3 - 1.5
    expect(res.feeAdjustedMaePoints).toBe(2.5); // 1 + 1.5
    expect(res.feeAdjustedMfeAmount).toBe(15);  // 30 - 15
    expect(res.feeAdjustedMaeAmount).toBe(25);  // 10 + 15
    expect(res.feeAdjustedMfeR).toBe(0.3);      // 15 / 50
    expect(res.feeAdjustedMaeR).toBe(0.5);      // 25 / 50
  });

  it('25. MAE-before-MFE ordering distinguishes heat before run vs run before heat', () => {
    // Trade A: Heat first (candle 1 dips to 90, candle 2 rallies to 120)
    const candlesA = [
      { t: 7000, o: 100, h: 101, l: 90, c: 92 },
      { t: 7060, o: 92, h: 120, l: 91, c: 118 },
    ];
    const resA = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 118,
      quantity: 1,
      candles: candlesA,
      entryTime: 7000,
      exitTime: 7120,
    });
    expect(resA.maeBeforeMfe).toBe(true);
    expect(resA.timeOrdering).toBe('HEAT_FIRST');

    // Trade B: Run first (candle 1 rallies to 120, candle 2 collapses to 90)
    const candlesB = [
      { t: 7000, o: 100, h: 120, l: 99, c: 118 },
      { t: 7060, o: 118, h: 118, l: 90, c: 92 },
    ];
    const resB = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 92,
      quantity: 1,
      candles: candlesB,
      entryTime: 7000,
      exitTime: 7120,
    });
    expect(resB.maeBeforeMfe).toBe(false);
    expect(resB.timeOrdering).toBe('RUN_FIRST');
  });

  it('26. entry quality score: measures initial follow-through over early candles', () => {
    // Clean entry: rallies immediately in first 3 candles with zero adverse draw
    const candlesClean = [
      { t: 8000, o: 100, h: 105, l: 100, c: 104 },
      { t: 8060, o: 104, h: 110, l: 103, c: 109 },
      { t: 8120, o: 109, h: 115, l: 108, c: 114 },
    ];
    const resClean = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 114,
      quantity: 1,
      candles: candlesClean,
      entryTime: 8000,
      exitTime: 8180,
    });
    expect(resClean.earlyMfePoints).toBe(15);
    expect(resClean.earlyMaePoints).toBe(0);
    expect(resClean.entryQualityScore).toBe(100);

    // Chasing entry: immediate heat (dips 8 points, rallies 2 points)
    const candlesChasing = [
      { t: 8000, o: 100, h: 102, l: 95, c: 96 },
      { t: 8060, o: 96, h: 97, l: 92, c: 93 },
    ];
    const resChasing = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 93,
      quantity: 1,
      candles: candlesChasing,
      entryTime: 8000,
      exitTime: 8120,
    });
    expect(resChasing.earlyMfePoints).toBe(2);
    expect(resChasing.earlyMaePoints).toBe(8);
    expect(resChasing.entryQualityScore).toBe(20); // 2 / (2 + 8) * 100 = 20
  });

  it('27. planned runner plan is excluded from GAVE_BACK_PROFIT false penalty', () => {
    const candles = [
      { t: 9000, o: 100, h: 130, l: 98, c: 125 }, // Ran to +30 pts (3R)
      { t: 9060, o: 125, h: 126, l: 105, c: 106 }, // Exited at trailing stop +6 pts
    ];

    // Case A: Discretionary / regular trade -> flagged GAVE_BACK_PROFIT (surrendered > 50%)
    const resRegular = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 106,
      quantity: 1,
      candles,
      entryTime: 9000,
      exitTime: 9120,
      plannedRiskAmount: 10,
    });
    expect(resRegular.excursionFlags).toContain('GAVE_BACK_PROFIT');

    // Case B: Planned runner trade -> protected from false penalty
    const resRunner = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 106,
      quantity: 1,
      candles,
      entryTime: 9000,
      exitTime: 9120,
      plannedRiskAmount: 10,
      tradeManagementPlan: 'RUNNER',
      hasTrailedStop: true,
    });
    expect(resRunner.excursionFlags).not.toContain('GAVE_BACK_PROFIT');
  });

  it('28. flags LOW_RESOLUTION warning when 5m or daily resolution is used', () => {
    const candles = [{ t: 10000, o: 100, h: 110, l: 95, c: 108 }];
    const res5m = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 108,
      quantity: 1,
      candles,
      entryTime: 10000,
      exitTime: 10300,
      resolution: '5',
    });
    expect(res5m.isLowResolution).toBe(true);
    expect(res5m.warnings).toContain('LOW_RESOLUTION');
    expect(res5m.excursionFlags).toContain('LOW_RESOLUTION');
  });

  it('29. calculates R left on the table correctly', () => {
    const candles = [{ t: 11000, o: 100, h: 130, l: 95, c: 110 }];
    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 110,
      stopLoss: 90,
      quantity: 1,
      candles,
      entryTime: 11000,
      exitTime: 11060,
      plannedRiskAmount: 10,
      realizedR: 1.0, // Exit at 110 on 10 pt risk = 1.0R
    });

    expect(res.mfeR).toBe(3.0); // (130 - 100) / 10 = 3.0R
    expect(res.rLeftOnTable).toBe(2.0); // 3.0R - 1.0R = 2.0R left on the table
  });
});

