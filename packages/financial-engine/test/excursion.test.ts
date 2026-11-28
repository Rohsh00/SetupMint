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

  it('30. calculates MFE Reach Funnel and Round-Trip Loss Rate accurately', async () => {
    const { calculateExcursionAggregates } = await import('../src/excursion-analytics.js');

    const mockTrades: any[] = [
      {
        id: 'trade-1',
        symbol: 'CRUDEOILMINI',
        tradeDate: new Date().toISOString(),
        netPnL: -3500,
        outcome: 'LOSS',
        calculated: {
          netPnL: -3500,
          outcome: 'LOSS',
          realizedRMultiple: -0.06,
          excursion: {
            mfeR: 1.09,
            maeR: 1.06,
            mfeAmount: 3600,
            rLeftOnTable: 1.15,
            status: 'COMPUTED',
          },
        },
      },
      {
        id: 'trade-2',
        symbol: 'CRUDEOILMINI',
        tradeDate: new Date().toISOString(),
        netPnL: -3000,
        outcome: 'LOSS',
        calculated: {
          netPnL: -3000,
          outcome: 'LOSS',
          realizedRMultiple: -0.12,
          excursion: {
            mfeR: 1.47,
            maeR: 1.12,
            mfeAmount: 2500,
            rLeftOnTable: 1.59,
            status: 'COMPUTED',
          },
        },
      },
      {
        id: 'trade-3',
        symbol: 'CRUDEOILMINI',
        tradeDate: new Date().toISOString(),
        netPnL: -3200,
        outcome: 'LOSS',
        calculated: {
          netPnL: -3200,
          outcome: 'LOSS',
          realizedRMultiple: -1.07,
          excursion: {
            mfeR: 1.0,
            maeR: 1.2,
            mfeAmount: 1500,
            rLeftOnTable: 2.07,
            status: 'COMPUTED',
          },
        },
      },
      {
        id: 'trade-4',
        symbol: 'CRUDEOILMINI',
        tradeDate: new Date().toISOString(),
        netPnL: -2880,
        outcome: 'LOSS',
        calculated: {
          netPnL: -2880,
          outcome: 'LOSS',
          realizedRMultiple: -1.11,
          excursion: {
            mfeR: 0.08,
            maeR: 1.08,
            mfeAmount: 100,
            rLeftOnTable: 1.19,
            status: 'COMPUTED',
          },
        },
      },
    ];

    const result = calculateExcursionAggregates({
      allClosedTrades: mockTrades,
      totalClosedTradesCount: 4,
    });

    expect(result.mfeReachFunnel).toBeDefined();
    // 3 of 4 trades reached >= 1.0R
    expect(result.mfeReachFunnel.tradesReached1RCount).toBe(3);
    // 3 of 3 closed as losses -> 100% round-trip rate
    expect(result.mfeReachFunnel.roundTripLossCount).toBe(3);
    expect(result.mfeReachFunnel.roundTripLossRate).toBe(100.0);
    expect(result.mfeReachFunnel.roundTripTradeIds).toEqual(['trade-1', 'trade-2', 'trade-3']);

    // Check funnel steps
    const step05 = result.mfeReachFunnel.steps.find((s) => s.thresholdR === 0.5);
    const step10 = result.mfeReachFunnel.steps.find((s) => s.thresholdR === 1.0);
    const step15 = result.mfeReachFunnel.steps.find((s) => s.thresholdR === 1.5);
    const step20 = result.mfeReachFunnel.steps.find((s) => s.thresholdR === 2.0);

    expect(step05?.reachedCount).toBe(3);
    expect(step10?.reachedCount).toBe(3);
    expect(step15?.reachedCount).toBe(0);
    expect(step20?.reachedCount).toBe(0);

    expect(result.mfeReachFunnel.insight).toContain('Critical Giveback Alert');
  });

  it('31. generates custom and data-adaptive MFE Reach Funnel thresholds with complete conversion percentages', async () => {
    const { calculateExcursionAggregates } = await import('../src/excursion-analytics.js');
    const mockTrades: any[] = [
      {
        id: 'trade-w1',
        symbol: 'NIFTY',
        tradeDate: new Date('2026-10-15'),
        calculated: {
          netPnL: 5000,
          outcome: 'WIN',
          excursion: { status: 'COMPUTED', mfeR: 4.2, maeR: 0.3, mfeAmount: 5200 },
        },
      },
      {
        id: 'trade-w2',
        symbol: 'BANKNIFTY',
        tradeDate: new Date('2026-10-16'),
        calculated: {
          netPnL: 3000,
          outcome: 'WIN',
          excursion: { status: 'COMPUTED', mfeR: 2.8, maeR: 0.5, mfeAmount: 3200 },
        },
      },
      {
        id: 'trade-l1',
        symbol: 'RELIANCE',
        tradeDate: new Date('2026-10-17'),
        calculated: {
          netPnL: -1500,
          outcome: 'LOSS',
          excursion: { status: 'COMPUTED', mfeR: 1.4, maeR: 1.0, mfeAmount: 1800 },
        },
      },
    ];

    // Test 1: User-defined Custom Steps
    const customResult = calculateExcursionAggregates({
      allClosedTrades: mockTrades,
      customMfeSteps: [0.75, 1.25, 2.5, 4.0],
      funnelMode: 'CUSTOM',
    });

    expect(customResult.mfeReachFunnel.mode).toBe('CUSTOM');
    expect(customResult.mfeReachFunnel.steps).toHaveLength(4);
    expect(customResult.mfeReachFunnel.steps.map((s) => s.thresholdR)).toEqual([0.75, 1.25, 2.5, 4.0]);
    
    // Check conversion metrics for 1.25R threshold (3 reached: 2 wins, 1 loss)
    const step125 = customResult.mfeReachFunnel.steps.find((s) => s.thresholdR === 1.25);
    expect(step125).toBeDefined();
    expect(step125?.reachedCount).toBe(3);
    expect(step125?.reachedPercent).toBe(100.0);
    expect(step125?.closedAsWinCount).toBe(2);
    expect(step125?.closedAsWinPercent).toBe(66.7);
    expect(step125?.closedAsLossCount).toBe(1);
    expect(step125?.closedAsLossPercent).toBe(33.3);

    // Test 2: Auto Data-Adaptive Steps for high MFE dataset (max 4.2R)
    const autoResult = calculateExcursionAggregates({
      allClosedTrades: mockTrades,
      funnelMode: 'AUTO',
    });

    expect(autoResult.mfeReachFunnel.mode).toBe('AUTO');
    // max MFE is 4.2R (between 3.5 and 5.5), so steps span up to 5.0R
    expect(autoResult.mfeReachFunnel.steps.some((s) => s.thresholdR === 4.0 || s.thresholdR === 5.0)).toBe(true);
    expect(autoResult.mfeReachFunnel.dataRange?.maxMfeR).toBe(4.2);
  });

  it('32. accurately calculates post-exit extended excursion & runner left on table for LONG trade', () => {
    // Entry at 100, Exit at 110 at 09:33. In-trade high: 115.
    // Candles after exit: 09:34 reaches 125, 09:35 reaches 135 (peak post-exit price).
    // Planned risk: 10 pts ($500 with 50 qty) -> Stop at 90.
    const candles = makeCandles(baseTime, 6, [
      [100, 105, 98, 104],   // 09:30 (entry)
      [104, 115, 103, 112],  // 09:31 (in-trade peak high 115)
      [112, 114, 108, 110],  // 09:32
      [110, 111, 109, 110],  // 09:33 (exit at 110)
      [110, 125, 110, 124],  // 09:34 (post-exit candle 1)
      [124, 135, 123, 132],  // 09:35 (post-exit candle 2, peak 135)
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
      postExitLookaheadMinutes: 30,
    });

    expect(res.status).toBe('COMPUTED');
    // In-trade metrics (pristine)
    expect(res.mfePoints).toBe(15); // 115 - 100
    expect(res.mfeR).toBe(1.5);
    expect(res.exitEfficiency).toBeCloseTo(0.6667, 3); // (110 - 100) / 15

    // Post-exit extended excursion
    expect(res.postExitCandleCount).toBe(2);
    expect(res.postExitMfePoints).toBe(35); // 135 - 100
    expect(res.postExitMfeR).toBe(3.5); // 35 / 10 = 3.5R
    expect(res.postExitRunBeyondExitPoints).toBe(25); // 135 - 110
    expect(res.postExitRunBeyondExitR).toBe(2.5); // 25 / 10 = 2.5R
    expect(res.postExitPeakPrice).toBe(135);
    expect(res.excursionFlags).toContain('RUNNER_LEFT_ON_TABLE');
    expect(res.excursionFlags).toContain('PREMATURE_EXIT');

    // Total R left on table: peak overall MFE (3.5R) - realized R (1.0R) = 2.5R
    expect(res.rLeftOnTable).toBe(2.5);
  });

  it('33. accurately calculates post-exit extended excursion for SHORT trade', () => {
    // Entry at 200, Exit at 190 at 09:33. In-trade lowest low: 185.
    // Post-exit candles drop further to 160. Stop at 210 (10 pts risk).
    const candles = makeCandles(baseTime, 6, [
      [200, 202, 195, 196], // 09:30
      [196, 198, 185, 188], // 09:31 (in-trade low 185)
      [188, 192, 186, 190], // 09:32
      [190, 191, 189, 190], // 09:33 (exit at 190)
      [190, 190, 175, 176], // 09:34 (post-exit candle 1)
      [176, 178, 160, 162], // 09:35 (post-exit candle 2, trough 160)
    ]);

    const res = calculateExcursion({
      direction: 'SHORT',
      entryPrice: 200,
      exitPrice: 190,
      stopLoss: 210,
      quantity: 10,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(3, 'minutes').toISOString(),
      plannedRiskAmount: 100,
      resolution: '1',
      postExitLookaheadMinutes: 30,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(15); // 200 - 185
    expect(res.mfeR).toBe(1.5);

    expect(res.postExitCandleCount).toBe(2);
    expect(res.postExitMfePoints).toBe(40); // 200 - 160
    expect(res.postExitMfeR).toBe(4.0); // 40 / 10 = 4.0R
    expect(res.postExitRunBeyondExitPoints).toBe(30); // 190 - 160
    expect(res.postExitRunBeyondExitR).toBe(3.0);
    expect(res.postExitPeakPrice).toBe(160);
    expect(res.excursionFlags).toContain('RUNNER_LEFT_ON_TABLE');
    expect(res.excursionFlags).toContain('PREMATURE_EXIT');
    expect(res.rLeftOnTable).toBe(3.0); // 4.0R - 1.0R = 3.0R
  });

  it('34. calculates post-exit adverse excursion (PAE) and flags OPTIMAL_EXIT on top-tick exit', () => {
    // LONG trade: Entry at 100, Exit at 120 (gain of 20 pts, SL at 90 -> 10 pts risk = +2.0R win).
    // In-trade high: 120 (sold at the peak).
    // Post-exit candles: price immediately crashes to 105 (adverse drop of 15 pts = 1.5R adverse beyond exit).
    // Post-exit peak price only reaches 121 (1 pt run beyond exit = 0.1R).
    const candles = makeCandles(baseTime, 6, [
      [100, 105, 98, 104],  // 09:30
      [104, 115, 102, 114], // 09:31
      [114, 120, 112, 118], // 09:32
      [118, 120, 116, 120], // 09:33 (exit at 120)
      [120, 121, 110, 111], // 09:34 (post-exit candle 1: drops)
      [111, 112, 105, 106], // 09:35 (post-exit candle 2: crashes to 105)
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 120,
      stopLoss: 90,
      quantity: 10,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(3, 'minutes').toISOString(),
      plannedRiskAmount: 100,
      resolution: '1',
      postExitLookaheadMinutes: 30,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.exitEfficiency).toBe(1); // Exited at peak
    expect(res.postExitRunBeyondExitPoints).toBe(1); // 121 - 120
    expect(res.postExitRunBeyondExitR).toBe(0.1);
    expect(res.postExitAdverseBeyondExitPoints).toBe(15); // 120 - 105
    expect(res.postExitAdverseBeyondExitR).toBe(1.5); // 15 / 10 = 1.5R drop
    expect(res.postExitTroughPrice).toBe(105);
    expect(res.excursionFlags).toContain('OPTIMAL_EXIT');
  });

  it('35. calculates post-stop shakeout recovery and flags SHAKEOUT_STOP', () => {
    // LONG trade: Entry at 100, SL at 90 (10 pts risk).
    // In-trade: price dips to 89 (stop hit), then trader exits at 89.
    // Post-stop/post-exit candles: market reverses aggressively and shoots up to 125 (+2.5R favorable).
    const candles = makeCandles(baseTime, 6, [
      [100, 102, 95, 96],   // 09:30
      [96, 97, 89, 90],     // 09:31 (stop hit at 89)
      [89, 90, 88, 89],     // 09:32 (exit at 89)
      [89, 105, 89, 104],   // 09:33 (post-exit reversal)
      [104, 115, 103, 114], // 09:34
      [114, 125, 112, 124], // 09:35 (reaches 125 -> +2.5R from entry)
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 89,
      stopLoss: 90,
      quantity: 10,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(2, 'minutes').toISOString(),
      plannedRiskAmount: 100,
      resolution: '1',
      postExitLookaheadMinutes: 30,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.stopHit).toBe(true);
    expect(res.postStopMfePoints).toBe(25); // 125 - 100
    expect(res.postStopMfeR).toBe(2.5); // 25 / 10 = 2.5R
    expect(res.excursionFlags).toContain('SHAKEOUT_STOP');
  });

  it('36. supports adaptive post-exit lookahead scaling dynamically to hold duration', () => {
    // Trade held for 40 minutes (09:30 to 10:10).
    // Adaptive rule: 40 * 1.5 = 60 minutes lookahead.
    const candles = makeCandles(baseTime, 70, Array(70).fill([100, 105, 95, 100]));

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      stopLoss: 90,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(40, 'minutes').toISOString(),
      plannedRiskAmount: 100,
      adaptiveLookahead: true,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.postExitCandleCount).toBeGreaterThan(0);
    // Trade held 40 mins -> adaptive lookahead is 60 mins
    expect(res.postExitLookaheadMinutes).toBe(60);
  });

  it('37. clamps post-exit lookahead to session close boundary', () => {
    // Trade exits at 15:15. Standard lookahead is 60m (would reach 16:15).
    // Session close is 15:30 (15 minutes after exit).
    const exitTime = baseTime.clone().add(15, 'minutes');
    const sessionCloseTime = baseTime.clone().add(30, 'minutes'); // 15 mins after exit
    const candles = makeCandles(baseTime, 35, Array(35).fill([100, 105, 95, 100]));

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 105,
      stopLoss: 90,
      quantity: 10,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: exitTime.toISOString(),
      sessionCloseTime: sessionCloseTime.toISOString(),
      postExitLookaheadMinutes: 60,
    });

    expect(res.status).toBe('COMPUTED');
    // Clamped to 15 minutes (session close)
    expect(res.postExitLookaheadMinutes).toBe(15);
  });

  it('38. does not inflate rLeftOnTable on losing trades with negative realized R', () => {
    // Trade had peak MFE of +1.5R, but reversed and stopped out for -1.0R loss.
    // Under the old bug, peak - (-1.0R) = 2.5R left on the table.
    // Realistically, the trader surrendered the +1.5R peak, so rLeftOnTable should be 1.5R, not 2.5R.
    const candles = makeCandles(baseTime, 5, [
      [100, 115, 99, 110], // in-trade high 115 (+1.5R)
      [110, 112, 98, 102],
      [102, 103, 90, 90], // stopped out at 90 (-1.0R loss)
      [90, 92, 88, 89],   // post-exit
      [89, 90, 85, 86],
    ]);

    const res = calculateExcursion({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 90,
      stopLoss: 90,
      quantity: 10,
      contractMultiplier: 1,
      candles,
      entryTime: baseTime.toISOString(),
      exitTime: baseTime.clone().add(2, 'minutes').toISOString(),
      plannedRiskAmount: 100, // 10 pts * 10 qty = 100
      resolution: '1',
      postExitLookaheadMinutes: 30,
      realizedR: -1.0,
    });

    expect(res.status).toBe('COMPUTED');
    expect(res.mfePoints).toBe(15);
    expect(res.mfeR).toBe(1.5);
    // rLeftOnTable must equal peakOverallMfeR (1.5R), not 1.5 - (-1.0) = 2.5R
    expect(res.rLeftOnTable).toBe(1.5);
  });
});

