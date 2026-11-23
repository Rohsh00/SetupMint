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
});

