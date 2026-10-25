import { describe, it, expect } from 'vitest';
import moment from 'moment';
import Decimal from 'decimal.js';
import {
  runWhatIfSimulation,
  replayTrade,
  classifyEligibility,
  computeLevels,
  precomputeTradePassages,
  evaluateFirstPassageCell,
  computePairedDifferencesAndVerdict,
  splitChronologicalHoldout,
  runCalibrationCheck,
  computeWhatIfExcursionDistributions,
  type IWhatIfTradeInput,
  type IWhatIfSnapshotInput,
  type IWhatIfEligibleTrade,
  type IWhatIfEngineOptions,
} from '../src/analytics/what-if/index.js';
import { ITradeCandle } from '@tradevault/shared';

function makeCandles(
  startEpochSec: number,
  ohlcList: Array<[number, number, number, number]>
): ITradeCandle[] {
  return ohlcList.map(([o, h, l, c], idx) => ({
    t: startEpochSec + idx * 60,
    o,
    h,
    l,
    c,
    v: 1000,
  }));
}

describe('What-If Candle-Replay Engine', () => {
  const baseTimeStr = '2026-10-20T09:30:00.000Z';
  const baseEpochSec = moment(baseTimeStr).unix();

  const defaultOptions: IWhatIfEngineOptions = {
    stopRGrid: [1.0, 1.5, 2.0],
    targetRGrid: [1.5, 2.0, 3.0],
    fillModel: 'PESSIMISTIC',
    slippageTicks: 0,
    resolutionPolicy: 'ONE_MINUTE_ONLY',
    excludeManagedStopTrades: false,
    holdoutFraction: 0.2,
  };

  function createStandardTrade(overrides: Partial<IWhatIfTradeInput> = {}): IWhatIfTradeInput {
    return {
      id: 'trade-1',
      status: 'CLOSED',
      direction: 'LONG',
      executionMode: 'SIMPLE',
      assetClass: 'EQUITY',
      symbol: 'INFY',
      entryTime: baseTimeStr,
      exitTime: moment(baseTimeStr).add(5, 'minutes').toISOString(),
      simpleExecution: {
        entryPrice: 100,
        exitPrice: 104,
        quantity: 50,
        contractMultiplier: 1,
        brokerage: 20,
        exchangeFees: 5,
        regulatoryFees: 2,
        taxes: 3,
        otherFees: 0,
      },
      calculated: {
        averageEntryPrice: 100,
        averageExitPrice: 104,
        closedQuantity: 50,
        netPnL: 170, // (104 - 100)*50 - 30 = 170
        grossPnL: 200,
        totalCosts: 30,
        realizedRMultiple: 0.4,
      },
      risk: {
        initialStopLoss: 90, // 10 pts unit risk
        plannedTarget: 120,
        riskBudgetAmount: 500,
      },
      accountBroker: 'ZERODHA',
      ...overrides,
    };
  }

  // =========================================================================
  // 1. Hand-computed Fixtures F1 - F11
  // =========================================================================
  describe('Fixtures F1 - F11', () => {
    it('F1: Clean hit target (LONG, target reached before stop)', () => {
      // Entry 100, Stop 90 (unitRisk=10). Target 2R -> 120. Stop 1R -> 90.
      const candles = makeCandles(baseEpochSec, [
        [100, 105, 99, 104], // bar 0
        [104, 122, 103, 121], // bar 1: reaches 122 >= 120, low 103 > 90
        [121, 124, 119, 120], // bar 2
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 0, x: 2 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });

      expect(replay.outcome).toBe('TARGET');
      expect(replay.fillPrice.toNumber()).toBe(120);
      expect(replay.candleIndex).toBe(1);
      expect(replay.gapFill).toBe(false);
    });

    it('F2: Clean hit stop (LONG, stop reached before target)', () => {
      const candles = makeCandles(baseEpochSec, [
        [100, 103, 98, 101],
        [101, 102, 88, 89], // bar 1: low 88 <= 90, high 102 < 120
        [89, 92, 87, 90],
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 0, x: 2 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });

      expect(replay.outcome).toBe('STOP');
      expect(replay.fillPrice.toNumber()).toBe(90);
      expect(replay.candleIndex).toBe(1);
    });

    it('F3: Neither hit (natural exit preserved)', () => {
      const candles = makeCandles(baseEpochSec, [
        [100, 105, 95, 103],
        [103, 108, 96, 106],
        [106, 109, 97, 104], // actual exit bar
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 0, x: 2 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });

      expect(replay.outcome).toBe('ACTUAL');
      expect(replay.fillPrice.toNumber()).toBe(104);
    });

    it('F4: Ambiguous single bar touching both stop and target across policies', () => {
      // Bar 1 with Low=85 (<= 90) and High=125 (>= 120)
      const candles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101],
        [100, 125, 85, 110], // ambiguous bar: touches 90 and 120
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      // 1. PESSIMISTIC: must hit STOP
      const replayPess = replayTrade({
        candles,
        indices: { e: 0, x: 1 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });
      expect(replayPess.outcome).toBe('STOP');

      // 2. OPTIMISTIC: must hit TARGET
      const replayOpt = replayTrade({
        candles,
        indices: { e: 0, x: 1 },
        direction: 'LONG',
        levels,
        policy: 'OPTIMISTIC',
        fillModel: 'OPTIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });
      expect(replayOpt.outcome).toBe('TARGET');
    });

    it('F5: Gap through level (bar opens beyond level under GAP_AWARE)', () => {
      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      // Stop Gap: Bar opens at 85 (below stop 90). Fill MUST be at Open (85), not 90!
      const stopGapCandles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101],
        [85, 88, 80, 82],
      ]);
      const replayStopGap = replayTrade({
        candles: stopGapCandles,
        indices: { e: 0, x: 1 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'GAP_AWARE',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });
      expect(replayStopGap.outcome).toBe('STOP');
      expect(replayStopGap.fillPrice.toNumber()).toBe(85);
      expect(replayStopGap.gapFill).toBe(true);

      // Target Gap: Bar opens at 125 (above target 120). Fill MUST be at Open (125), not 120!
      const targetGapCandles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101],
        [125, 130, 124, 128],
      ]);
      const replayTargetGap = replayTrade({
        candles: targetGapCandles,
        indices: { e: 0, x: 1 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'GAP_AWARE',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });
      expect(replayTargetGap.outcome).toBe('TARGET');
      expect(replayTargetGap.fillPrice.toNumber()).toBe(125);
      expect(replayTargetGap.gapFill).toBe(true);
    });

    it('F6: Pre-entry candle is strictly ignored', () => {
      // Candle 0 is before entry. It dips to 80 (would trigger stop), but entry is at candle 1
      const candles = makeCandles(baseEpochSec - 60, [
        [85, 86, 80, 84], // candle 0 (pre-entry, t = baseEpochSec - 60)
        [100, 103, 98, 102], // candle 1 (entry bar, t = baseEpochSec)
        [102, 105, 99, 104], // candle 2 (t = baseEpochSec + 60)
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 1, x: 2 }, // entry at index 1
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(104),
      });

      expect(replay.outcome).toBe('ACTUAL');
      expect(replay.fillPrice.toNumber()).toBe(104);
    });

    it('F7: Post-exit candle is strictly ignored', () => {
      // Candle 2 is after exit. It spikes to 135, but exit happened at candle 1.
      const candles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101], // candle 0
        [101, 104, 98, 103], // candle 1 (exit bar)
        [103, 135, 102, 130], // candle 2 (post-exit)
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 0, x: 1 }, // exit at index 1
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(103),
      });

      expect(replay.outcome).toBe('ACTUAL');
      expect(replay.fillPrice.toNumber()).toBe(103);
    });

    it('F8: SHORT trade polarity (Stop above entry, Target below entry)', () => {
      // Short entry 200, stopLoss 210 -> unitRisk = 10 pts.
      // Target 2R -> 200 - 20 = 180. Stop 1.5R -> 200 + 15 = 215.
      const levels = computeLevels(new Decimal(200), 'SHORT', new Decimal(10), 1.5, 2.0, 0.05);
      expect(levels.stopPrice?.toNumber()).toBe(215);
      expect(levels.targetPrice?.toNumber()).toBe(180);

      // Gap down through target: opens at 175 (below 180). Fills at 175.
      const targetGapCandles = makeCandles(baseEpochSec, [
        [200, 202, 198, 199],
        [175, 178, 170, 172],
      ]);
      const replayTarget = replayTrade({
        candles: targetGapCandles,
        indices: { e: 0, x: 1 },
        direction: 'SHORT',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'GAP_AWARE',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(199),
      });
      expect(replayTarget.outcome).toBe('TARGET');
      expect(replayTarget.fillPrice.toNumber()).toBe(175);

      // Gap up through stop: opens at 220 (above 215). Fills at 220.
      const stopGapCandles = makeCandles(baseEpochSec, [
        [200, 202, 198, 199],
        [220, 222, 218, 221],
      ]);
      const replayStop = replayTrade({
        candles: stopGapCandles,
        indices: { e: 0, x: 1 },
        direction: 'SHORT',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'GAP_AWARE',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(199),
      });
      expect(replayStop.outcome).toBe('STOP');
      expect(replayStop.fillPrice.toNumber()).toBe(220);
    });

    it('F9: Half-spread / slippage ticks', () => {
      // Long trade, stop 90, tickSize 0.05, slippageTicks = 2 -> 0.10 pts adverse slippage
      const candles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101],
        [101, 102, 88, 89], // normal breach at 90
      ]);

      const levels = computeLevels(new Decimal(100), 'LONG', new Decimal(10), 1.0, 2.0, 0.05);

      const replay = replayTrade({
        candles,
        indices: { e: 0, x: 1 },
        direction: 'LONG',
        levels,
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 2,
        tickSize: 0.05,
        actualExitPrice: new Decimal(101),
      });

      expect(replay.outcome).toBe('STOP');
      // Adverse slippage for long exit reduces price: 90 - 0.10 = 89.90
      expect(replay.fillPrice.toNumber()).toBe(89.9);
    });

    it('F10: Censoring / right-censored trade (actual trade exited at original stop, cell tests looser stop)', () => {
      // Real trade entered at 100, stopped out at 90
      const trade = createStandardTrade({
        simpleExecution: {
          entryPrice: 100,
          exitPrice: 90, // exited at original stop!
          quantity: 50,
        },
        calculated: {
          averageEntryPrice: 100,
          averageExitPrice: 90,
          closedQuantity: 50,
          netPnL: -500,
          totalCosts: 0,
          realizedRMultiple: -1.0,
        },
        risk: {
          initialStopLoss: 90,
          plannedTarget: 120,
        },
      });

      const snapshot: IWhatIfSnapshotInput = {
        tradeId: 'trade-1',
        resolution: '1',
        candles: makeCandles(baseEpochSec, [
          [100, 102, 98, 101],
          [101, 101, 90, 90], // hits stop 90
        ]),
      };

      // Test simulation with stopR = 1.5 (looser stop at 85)
      const result = runWhatIfSimulation({
        trades: [trade],
        snapshotsByTradeId: new Map([['trade-1', snapshot]]),
        options: {
          ...defaultOptions,
          stopRGrid: [1.5], // looser stop than actual exit
          targetRGrid: [2.0],
        },
      });

      expect(result.scope.tradesInScope).toBe(1);
      expect(result.scope.nEligible).toBe(1);
      expect(result.drillDescriptors.censored.length).toBe(1);
      expect(result.drillDescriptors.censored[0].count).toBe(1);
      expect(result.cells[0].all.nCensored).toBe(1);
      expect(result.cells[0].all.nEval).toBe(0);
    });

    it('F11: Non-evaluable trades classification and exclusion reasons', () => {
      // 1. Missing Stop Loss
      const noStopTrade = createStandardTrade({
        id: 'no-stop',
        risk: { initialStopLoss: undefined },
      });
      const el1 = classifyEligibility(noStopTrade, undefined, {
        excludeManagedStopTrades: false,
        resolutionPolicy: 'ONE_MINUTE_ONLY',
      });
      expect(el1.eligible).toBe(false);
      if (!el1.eligible) expect(el1.reason).toBe('EXCLUDED_NO_STOP');

      // 2. Missing Candles
      const noCandleTrade = createStandardTrade({ id: 'no-candles' });
      const el2 = classifyEligibility(noCandleTrade, undefined, {
        excludeManagedStopTrades: false,
        resolutionPolicy: 'ONE_MINUTE_ONLY',
      });
      expect(el2.eligible).toBe(false);
      if (!el2.eligible) expect(el2.reason).toBe('EXCLUDED_NO_CANDLES');

      // 3. Multi-fill ADVANCED trade
      const multiFillTrade = createStandardTrade({
        id: 'multi-fill',
        executionMode: 'ADVANCED',
        fills: [
          { type: 'ENTRY', price: 100, quantity: 25 },
          { type: 'ENTRY', price: 102, quantity: 25 },
          { type: 'EXIT', price: 105, quantity: 50 },
        ],
      });
      const el3 = classifyEligibility(
        multiFillTrade,
        {
          tradeId: 'multi-fill',
          resolution: '1',
          candles: makeCandles(baseEpochSec, [[100, 105, 95, 104]]),
        },
        { excludeManagedStopTrades: false, resolutionPolicy: 'ONE_MINUTE_ONLY' }
      );
      expect(el3.eligible).toBe(false);
      if (!el3.eligible) expect(el3.reason).toBe('EXCLUDED_MULTI_FILL');

      // 4. Underlying fallback rejected
      const fallbackTrade = createStandardTrade({ id: 'fallback' });
      const el4 = classifyEligibility(
        fallbackTrade,
        {
          tradeId: 'fallback',
          resolution: '1',
          isUnderlyingFallback: true,
          candles: makeCandles(baseEpochSec, [[100, 105, 95, 104]]),
        },
        { excludeManagedStopTrades: false, resolutionPolicy: 'REJECT_UNDERLYING_FALLBACK' }
      );
      expect(el4.eligible).toBe(false);
      if (!el4.eligible) expect(el4.reason).toBe('EXCLUDED_UNDERLYING_FALLBACK');

      // 5. Managed stop excluded when option active
      const managedTrade = createStandardTrade({
        id: 'managed',
        stopLossMoveEvents: [{ moveType: 'TRAILED', from: 90, to: 95 }],
      });
      const el5 = classifyEligibility(
        managedTrade,
        {
          tradeId: 'managed',
          resolution: '1',
          candles: makeCandles(baseEpochSec, [[100, 105, 95, 104]]),
        },
        { excludeManagedStopTrades: true, resolutionPolicy: 'ONE_MINUTE_ONLY' }
      );
      expect(el5.eligible).toBe(false);
      if (!el5.eligible) expect(el5.reason).toBe('EXCLUDED_MANAGED_STOP');
    });
  });

  // =========================================================================
  // 2. Precomputation & First-Passage Equivalence
  // =========================================================================
  describe('Precomputation & First-Passage Equivalence', () => {
    it('evaluateFirstPassageCell matches naive replayTrade exactly', () => {
      const candles = makeCandles(baseEpochSec, [
        [100, 102, 98, 101],
        [101, 105, 99, 104],
        [104, 115, 102, 114],
        [114, 125, 110, 122],
      ]);

      const stopPrice = new Decimal(90);
      const targetPrice = new Decimal(120);

      // Precompute
      const { stops, targets } = precomputeTradePassages(
        candles,
        0,
        3,
        'LONG',
        [stopPrice],
        [targetPrice],
        0.05
      );

      const fpResult = evaluateFirstPassageCell(
        stops.get(stopPrice.toString())!,
        targets.get(targetPrice.toString())!,
        'LONG',
        'PESSIMISTIC',
        'PESSIMISTIC',
        0,
        0.05,
        new Decimal(122),
        3
      );

      const naiveResult = replayTrade({
        candles,
        indices: { e: 0, x: 3 },
        direction: 'LONG',
        levels: { stopPrice, targetPrice },
        policy: 'PESSIMISTIC',
        fillModel: 'PESSIMISTIC',
        slippageTicks: 0,
        tickSize: 0.05,
        actualExitPrice: new Decimal(122),
      });

      expect(fpResult.outcome).toBe(naiveResult.outcome);
      expect(fpResult.fillPrice.toNumber()).toBe(naiveResult.fillPrice.toNumber());
      expect(fpResult.candleIndex).toBe(naiveResult.candleIndex);
    });

    it('paired bootstrap differences are deterministic with fixed seed', () => {
      const mockSims: any[] = Array.from({ length: 40 }, (_, i) => ({
        tradeId: `t-${i}`,
        status: 'EVALUABLE',
        pess: {
          r: new Decimal(i % 2 === 0 ? 1.5 : -1.0),
          netPnL: new Decimal(i % 2 === 0 ? 1500 : -1000),
          outcome: i % 2 === 0 ? 'TARGET' : 'STOP',
        },
        opt: {
          r: new Decimal(i % 2 === 0 ? 1.5 : -1.0),
          netPnL: new Decimal(i % 2 === 0 ? 1500 : -1000),
          outcome: i % 2 === 0 ? 'TARGET' : 'STOP',
        },
        actualSameSubset: {
          r: new Decimal(0.5),
          netPnL: new Decimal(500),
        },
        ambiguous: false,
      }));

      const res1 = computePairedDifferencesAndVerdict(mockSims, 1.0, 2.0, 'test_seed_1', 1000);
      const res2 = computePairedDifferencesAndVerdict(mockSims, 1.0, 2.0, 'test_seed_1', 1000);
      expect(res1.meanDiffPess).toBe(res2.meanDiffPess);
      expect(res1.intervalPess[0]).toBe(res2.intervalPess[0]);
      expect(res1.intervalPess[1]).toBe(res2.intervalPess[1]);
      expect(res1.verdict).toBe(res2.verdict);
    });
  });

  // =========================================================================
  // 3. Monotonic Sanity & Invariants
  // =========================================================================
  describe('Monotonic Sanity & Simulation Invariants', () => {
    function generateTradesAndSnapshots(count: number) {
      const trades: IWhatIfTradeInput[] = [];
      const snapshots = new Map<string, IWhatIfSnapshotInput>();

      for (let i = 0; i < count; i++) {
        const id = `trade-${i}`;
        const entryTime = moment(baseTimeStr).add(i * 10, 'minutes');
        trades.push(
          createStandardTrade({
            id,
            entryTime: entryTime.toISOString(),
            exitTime: entryTime.clone().add(5, 'minutes').toISOString(),
            simpleExecution: {
              entryPrice: 100,
              exitPrice: 105,
              quantity: 10,
              contractMultiplier: 1,
            },
            calculated: {
              averageEntryPrice: 100,
              averageExitPrice: 105,
              closedQuantity: 10,
              netPnL: 50,
              grossPnL: 50,
              totalCosts: 0,
              realizedRMultiple: 0.5,
            },
            risk: {
              initialStopLoss: 90, // 1R = 10 pts
              plannedTarget: 120,
            },
          })
        );

        // Fluctuation: Highs up to 100 + i, Lows down to 100 - i
        const candle0: [number, number, number, number] = [100, 102, 98, 101];
        const candle1: [number, number, number, number] = [
          101,
          100 + Math.min(25, i),
          100 - Math.min(15, i),
          105,
        ];
        snapshots.set(id, {
          tradeId: id,
          resolution: '1',
          candles: makeCandles(entryTime.unix(), [candle0, candle1]),
        });
      }

      return { trades, snapshots };
    }

    it('monotonic stop and target hit frequency', () => {
      const { trades, snapshots } = generateTradesAndSnapshots(25);

      const sim = runWhatIfSimulation({
        trades,
        snapshotsByTradeId: snapshots,
        options: {
          stopRGrid: [0.5, 1.0, 1.5],
          targetRGrid: [1.0, 1.5, 2.0],
          fillModel: 'PESSIMISTIC',
          slippageTicks: 0,
          resolutionPolicy: 'ONE_MINUTE_ONLY',
          excludeManagedStopTrades: false,
          holdoutFraction: 0.2,
        },
      });

      // Target hit rates along stopR=1.0 row should be non-increasing as targetR increases (1.0 -> 1.5 -> 2.0)
      const targetRates = [1.0, 1.5, 2.0].map((tR) => {
        const cell = sim.cells.find((c) => c.stopR === 1.0 && c.targetR === tR);
        return cell!.all.targetHitRate;
      });
      expect(targetRates[0]).toBeGreaterThanOrEqual(targetRates[1]);
      expect(targetRates[1]).toBeGreaterThanOrEqual(targetRates[2]);

      // Stop hit rates along targetR=2.0 column should be non-increasing as stopR widens (0.5 -> 1.0 -> 1.5)
      const stopRates = [0.5, 1.0, 1.5].map((sR) => {
        const cell = sim.cells.find((c) => c.stopR === sR && c.targetR === 2.0);
        return cell!.all.stopHitRate;
      });
      expect(stopRates[0]).toBeGreaterThanOrEqual(stopRates[1]);
      expect(stopRates[1]).toBeGreaterThanOrEqual(stopRates[2]);
    });

    it('holdout split is strictly chronological (oldest in in-sample, newest in holdout)', () => {
      const { trades, snapshots } = generateTradesAndSnapshots(20);
      const sim = runWhatIfSimulation({
        trades,
        snapshotsByTradeId: snapshots,
        options: {
          ...defaultOptions,
          holdoutFraction: 0.25, // 5 holdout, 15 in-sample
        },
      });

      expect(sim.cells[0].inSample.nEval).toBe(15);
      expect(sim.cells[0].holdout.nEval).toBe(5);
    });

    it('calibration gate reports agreement and warning flag', () => {
      const { trades, snapshots } = generateTradesAndSnapshots(10);
      const sim = runWhatIfSimulation({
        trades,
        snapshotsByTradeId: snapshots,
        options: defaultOptions,
      });

      expect(sim.calibration).toBeDefined();
      expect(typeof sim.calibration.agreement).toBe('number');
      expect(typeof sim.calibration.calibrationWarning).toBe('boolean');
    });

    it('winners MAE and all trades MFE distributions are populated', () => {
      const { trades, snapshots } = generateTradesAndSnapshots(10);
      const sim = runWhatIfSimulation({
        trades,
        snapshotsByTradeId: snapshots,
        options: defaultOptions,
      });

      expect(Array.isArray(sim.winnersMaeDistribution)).toBe(true);
      expect(Array.isArray(sim.allTradesMfeDistribution)).toBe(true);
      expect(sim.winnersMaeDistribution.length).toBeGreaterThan(0);
      expect(sim.allTradesMfeDistribution.length).toBeGreaterThan(0);
    });
  });
});
