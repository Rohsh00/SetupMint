import { describe, it, expect } from 'vitest';
import {
  calculatePositionSizingDiagnostics,
  SizingAnalyticsTradeInput,
} from '../src/sizing-analytics.js';

describe('calculatePositionSizingDiagnostics', () => {
  it('handles empty trades gracefully', () => {
    const res = calculatePositionSizingDiagnostics([]);
    expect(res.summary.totalTrades).toBe(0);
    expect(res.summary.actualTotalNetPnL).toBe(0);
    expect(res.tiers).toHaveLength(0);
    expect(res.progression).toHaveLength(0);
  });

  it('calculates exact discrete tiers for 0.01, 0.02, and 0.04 lots', () => {
    const trades: SizingAnalyticsTradeInput[] = [
      // 0.01 tier (3 trades: 2 wins, 1 loss)
      { id: '1', tradeDate: '2026-01-01', quantity: 0.01, netPnL: 20 },
      { id: '2', tradeDate: '2026-01-02', quantity: 0.01, netPnL: 30 },
      { id: '3', tradeDate: '2026-01-03', quantity: 0.01, netPnL: -15 },
      // 0.02 tier (2 trades: 1 win, 1 loss)
      { id: '4', tradeDate: '2026-01-04', quantity: 0.02, netPnL: 50 },
      { id: '5', tradeDate: '2026-01-05', quantity: 0.02, netPnL: -30 },
      // 0.04 tier (2 trades: 2 losses - toxic size)
      { id: '6', tradeDate: '2026-01-06', quantity: 0.04, netPnL: -120 },
      { id: '7', tradeDate: '2026-01-07', quantity: 0.04, netPnL: -80 },
    ];

    const res = calculatePositionSizingDiagnostics(trades);

    expect(res.summary.totalTrades).toBe(7);
    expect(res.tiers).toHaveLength(3);

    // 0.01 Tier
    const tier01 = res.tiers.find((t) => t.minQuantity === 0.01);
    expect(tier01).toBeDefined();
    expect(tier01!.tradeCount).toBe(3);
    expect(tier01!.netPnL).toBe(35); // 20 + 30 - 15
    expect(tier01!.winningTrades).toBe(2);
    expect(tier01!.losingTrades).toBe(1);
    expect(tier01!.verdict).toBe('OPTIMAL'); // PF = 50 / 15 = 3.33

    // 0.02 Tier
    const tier02 = res.tiers.find((t) => t.minQuantity === 0.02);
    expect(tier02).toBeDefined();
    expect(tier02!.tradeCount).toBe(2);
    expect(tier02!.netPnL).toBe(20); // 50 - 30

    // 0.04 Tier (Toxic)
    const tier04 = res.tiers.find((t) => t.minQuantity === 0.04);
    expect(tier04).toBeDefined();
    expect(tier04!.tradeCount).toBe(2);
    expect(tier04!.netPnL).toBe(-200); // -120 - 80
    expect(tier04!.winRate).toBe(0);
    expect(tier04!.verdict).toBe('VALUE_DESTRUCTIVE');

    // Overall total: 35 + 20 - 200 = -145
    expect(res.summary.actualTotalNetPnL).toBe(-145);
    // Sizing alpha is negative because 0.04 caused huge losses
    expect(res.summary.sizingAlpha).toBeLessThan(0);
    expect(res.summary.sizingAlphaVerdict).toBe('VALUE_DESTRUCTIVE');
  });

  it('correctly detects revenge escalations following a loss', () => {
    const trades: SizingAnalyticsTradeInput[] = [
      { id: '1', tradeDate: '2026-01-01', quantity: 0.01, netPnL: -50 }, // Loss at 0.01
      { id: '2', tradeDate: '2026-01-02', quantity: 0.02, netPnL: -100 }, // Size jump to 0.02 after loss -> Revenge Escalation!
      { id: '3', tradeDate: '2026-01-03', quantity: 0.02, netPnL: 80 }, // Win at 0.02
      { id: '4', tradeDate: '2026-01-04', quantity: 0.04, netPnL: 160 }, // Size jump to 0.04 after win -> Compounding Escalation!
    ];

    const res = calculatePositionSizingDiagnostics(trades);

    expect(res.triggerAnalysis.totalEscalations).toBe(2);
    expect(res.triggerAnalysis.revengeEscalations).toBe(1);
    expect(res.triggerAnalysis.compoundingEscalations).toBe(1);
    expect(res.triggerAnalysis.revengeEscalationRate).toBe(50);

    // Progression markers
    expect(res.progression[1].isRevengeEscalation).toBe(true);
    expect(res.progression[3].isEscalation).toBe(true);
    expect(res.progression[3].isRevengeEscalation).toBe(false);
  });

  it('recognizes positive sizing alpha when larger trades are profitable', () => {
    const trades: SizingAnalyticsTradeInput[] = [
      { id: '1', tradeDate: '2026-01-01', quantity: 0.01, netPnL: 10 },
      { id: '2', tradeDate: '2026-01-02', quantity: 0.01, netPnL: 10 },
      { id: '3', tradeDate: '2026-01-03', quantity: 0.02, netPnL: 40 },
      { id: '4', tradeDate: '2026-01-04', quantity: 0.04, netPnL: 200 },
    ];

    const res = calculatePositionSizingDiagnostics(trades);

    expect(res.summary.actualTotalNetPnL).toBe(260);
    expect(res.summary.sizingAlpha).toBeGreaterThan(0);
    expect(res.summary.sizingAlphaVerdict).toBe('POSITIVE_ALPHA');
    expect(res.summary.sizingHealthGrade).toBe('A');
  });

  it('computes rich Post-Loss Sizing Escalation Report metrics, multipliers, and counterfactual simulation', () => {
    const trades: SizingAnalyticsTradeInput[] = [
      // Trade 1: Loss at 1.0 lot on EURUSD, exits at 10:00
      {
        id: 'T1',
        tradeDate: '2026-02-01',
        entryTime: '2026-02-01T09:30:00Z',
        exitTime: '2026-02-01T10:00:00Z',
        symbol: 'EURUSD',
        direction: 'LONG',
        quantity: 1.0,
        netPnL: -100,
        realizedRMultiple: -1.0,
      },
      // Trade 2: Upsized to 2.0 lots (2x Martingale) 3 minutes later (Flash Revenge) on same symbol, flips SHORT, losses -$200
      {
        id: 'T2',
        tradeDate: '2026-02-01',
        entryTime: '2026-02-01T10:03:00Z',
        exitTime: '2026-02-01T10:20:00Z',
        symbol: 'EURUSD',
        direction: 'SHORT',
        quantity: 2.0,
        netPnL: -200,
        realizedRMultiple: -1.0,
      },
      // Trade 3: Further upsized to 4.0 lots (2x of previous, Level 2 cascade) 10 minutes later, hops to GBPUSD, wins +$400
      {
        id: 'T3',
        tradeDate: '2026-02-01',
        entryTime: '2026-02-01T10:30:00Z',
        exitTime: '2026-02-01T11:00:00Z',
        symbol: 'GBPUSD',
        direction: 'LONG',
        quantity: 4.0,
        netPnL: 400,
        realizedRMultiple: 1.0,
      },
      // Trade 4: Normal disciplined trade, 1.0 lot, 2 hours later, wins +$150
      {
        id: 'T4',
        tradeDate: '2026-02-01',
        entryTime: '2026-02-01T13:00:00Z',
        symbol: 'EURUSD',
        direction: 'LONG',
        quantity: 1.0,
        netPnL: 150,
        realizedRMultiple: 1.5,
      },
    ];

    const res = calculatePositionSizingDiagnostics(trades);
    const report = res.postLossReport;

    expect(report).toBeDefined();
    expect(report.totalLossTrades).toBe(2); // T1 and T2
    expect(report.escalationCount).toBe(2); // T2 (after T1) and T3 (after T2)
    expect(report.tradePairs).toHaveLength(2);

    // Pair 1 (T1 -> T2)
    const pair1 = report.tradePairs[0];
    expect(pair1.lossTradeId).toBe('T1');
    expect(pair1.upsizedTradeId).toBe('T2');
    expect(pair1.sizingMultiplier).toBe(2.0);
    expect(pair1.cooldownMinutes).toBe(3); // 10:00 to 10:03
    expect(pair1.directionFlip).toBe(true); // LONG to SHORT
    expect(pair1.assetHopped).toBe(false); // both EURUSD
    expect(pair1.cascadeDepth).toBe(1);

    // Pair 2 (T2 -> T3)
    const pair2 = report.tradePairs[1];
    expect(pair2.lossTradeId).toBe('T2');
    expect(pair2.upsizedTradeId).toBe('T3');
    expect(pair2.sizingMultiplier).toBe(2.0); // 4.0 / 2.0 = 2.0
    expect(pair2.cooldownMinutes).toBe(10); // 10:20 to 10:30
    expect(pair2.directionFlip).toBe(true); // SHORT to LONG
    expect(pair2.assetHopped).toBe(true); // EURUSD to GBPUSD
    expect(pair2.cascadeDepth).toBe(2); // Level 2 cascade!
    expect(pair2.isConsecutiveCascade).toBe(true);

    expect(report.maxCascadeStreak).toBe(2);
    expect(report.consecutiveCascadesCount).toBe(1);
    expect(report.assetHoppingCount).toBe(1);
    expect(report.directionFlippingCount).toBe(2);

    // Multiplier tiers
    const martingaleTier = report.multiplierTiers.find((t) => t.tierKey === 'MARTINGALE_2X');
    expect(martingaleTier).toBeDefined();
    expect(martingaleTier!.count).toBe(2); // both T2 and T3 were 2x

    // Latency buckets
    const flashBucket = report.latencyBuckets.find((b) => b.bucketKey === 'FLASH_REVENGE');
    expect(flashBucket).toBeDefined();
    expect(flashBucket!.count).toBe(1); // T2 was 3 minutes

    const simmeringBucket = report.latencyBuckets.find((b) => b.bucketKey === 'SIMMERING_TILT');
    expect(simmeringBucket).toBeDefined();
    expect(simmeringBucket!.count).toBe(1); // T3 was 10 minutes

    // Counterfactual simulation verification:
    // T1: Actual -100, Disciplined -100
    // T2: Actual -200 (at 2.0 lots). If disciplined at T1 size (1.0 lot): -100
    // T3: Actual +400 (at 4.0 lots). If disciplined at T2 size (2.0 lots): +200
    // T4: Actual +150, Disciplined +150
    // Actual Net PnL = -100 - 200 + 400 + 150 = +250
    // Disciplined Net PnL = -100 - 100 + 200 + 150 = +150
    // Sizing alpha deficit = (-200 - (-100)) + (400 - 200) = -100 + 200 = +100
    expect(report.counterfactualCurve).toHaveLength(4);
    expect(report.counterfactualCurve[1].disciplinedPnL).toBe(-100);
    expect(report.counterfactualCurve[2].disciplinedPnL).toBe(200);
  });
});

