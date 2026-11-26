import { describe, it, expect } from 'vitest';
import {
  calculateTargetLadder,
  evaluateSlippageRisk,
  evaluateSpreadSurge,
  evaluateOpeningBellGuard,
  simulateExecutionBacktest,
} from '../src/index.js';

describe('Institutional Auto-Execution & Scaling Engine', () => {
  describe('evaluateSlippageRisk', () => {
    it('accepts minimal adverse slippage within cap', () => {
      const res = evaluateSlippageRisk({
        triggerPrice: 24000,
        currentLtp: 23998, // 2 points slippage (0.008%)
        direction: 'LONG',
        maxSlippagePercent: 0.05,
        maxSlippagePoints: 5,
      });
      expect(res.isAcceptable).toBe(true);
      expect(res.slippagePoints).toBe(2);
      expect(res.slippagePercent).toBeLessThan(0.01);
    });

    it('rejects severe adverse slippage exceeding cap on LONG position', () => {
      const res = evaluateSlippageRisk({
        triggerPrice: 24000,
        currentLtp: 23950, // 50 points slippage (~0.208%)
        direction: 'LONG',
        maxSlippagePercent: 0.05,
        maxSlippagePoints: 5,
      });
      expect(res.isAcceptable).toBe(false);
      expect(res.slippagePoints).toBe(50);
      expect(res.slippagePercent).toBeGreaterThan(0.2);
      expect(res.reason).toContain('exceeds cap');
    });

    it('rejects severe adverse slippage exceeding cap on SHORT position', () => {
      const res = evaluateSlippageRisk({
        triggerPrice: 24000,
        currentLtp: 24050, // 50 points higher adverse slippage on short exit
        direction: 'SHORT',
        maxSlippagePercent: 0.05,
        maxSlippagePoints: 5,
      });
      expect(res.isAcceptable).toBe(false);
      expect(res.slippagePoints).toBe(50);
    });

    it('handles zero slippage or positive price improvement', () => {
      const res = evaluateSlippageRisk({
        triggerPrice: 24000,
        currentLtp: 24010, // positive improvement on selling LONG
        direction: 'LONG',
        maxSlippagePercent: 0.05,
      });
      expect(res.isAcceptable).toBe(true);
      expect(res.slippagePoints).toBe(0);
      expect(res.slippagePercent).toBe(0);
    });
  });

  describe('evaluateSpreadSurge', () => {
    it('approves execution when spread is within baseline multiplier', () => {
      const res = evaluateSpreadSurge({
        currentSpread: 0.15,
        baselineSpread: 0.10,
        surgeMultiplier: 2.0,
      });
      expect(res.isSafe).toBe(true);
      expect(res.multiplierRatio).toBe(1.5);
    });

    it('blocks execution when spread surges during news spikes', () => {
      const res = evaluateSpreadSurge({
        currentSpread: 0.45,
        baselineSpread: 0.10,
        surgeMultiplier: 2.0,
      });
      expect(res.isSafe).toBe(false);
      expect(res.multiplierRatio).toBe(4.5);
      expect(res.reason).toContain('Spread surge detected');
    });
  });

  describe('Institutional Tranche Matrix & True BE with Tick Cushion', () => {
    it('applies DEFENSIVE_50_30_20 distribution curve correctly', () => {
      const ladder = calculateTargetLadder({
        entryPrice: 100,
        currentLtp: 102,
        direction: 'LONG',
        quantity: 100,
        initialStopLoss: 95, // 1R = 5 points
        estimatedCharges: 40,
        tickSize: 0.05,
        customRules: {
          distributionMode: 'DEFENSIVE_50_30_20',
          executionAlgorithm: 'PEGGED_CHASE',
          autoExecuteEnabled: true,
          t1: {
            targetR: 1.0,
            exitRatio: 0.50,
            trailAction: 'TRUE_BE_WITH_FEES',
            cushionTicks: 2,
            autoExecuteEnabled: true,
          },
          t2: {
            enabled: true,
            targetR: 2.0,
            exitRatio: 0.30,
            trailAction: 'TRAIL_T1',
            autoExecuteEnabled: true,
          },
          t3: {
            enabled: true,
            isFreeRunner: true,
            exitRatio: 1.0,
            trailAction: 'NONE',
            autoExecuteEnabled: true,
          },
        },
      });

      expect(ladder).toBeDefined();
      expect(ladder?.distributionMode).toBe('DEFENSIVE_50_30_20');
      expect(ladder?.executionAlgorithm).toBe('PEGGED_CHASE');
      expect(ladder?.steps).toHaveLength(3);

      const step1 = ladder!.steps[0];
      expect(step1.name).toContain('T1');
      expect(step1.plannedExitRatio).toBe(0.50);
      expect(step1.autoExecuteEnabled).toBe(true);
      expect(step1.cushionTicks).toBe(2);
      expect(step1.suggestedStopLabel).toContain('+ 2T');

      const step2 = ladder!.steps[1];
      expect(step2.name).toContain('T2');
      expect(step2.autoExecuteEnabled).toBe(true);

      const runner = ladder!.steps[2];
      expect(runner.isFreeRunner).toBe(true);
      expect(runner.autoExecuteEnabled).toBe(true);
    });

    it('applies CONVEX_20_30_50 distribution curve correctly', () => {
      const ladder = calculateTargetLadder({
        entryPrice: 100,
        currentLtp: 100.5,
        direction: 'LONG',
        quantity: 10,
        initialStopLoss: 98, // 1R = 2 points
        customRules: {
          distributionMode: 'CONVEX_20_30_50',
          executionAlgorithm: 'INSTANT_MARKET',
          t1: {
            targetR: 1.0,
            exitRatio: 0.20,
            trailAction: 'TRUE_BE_WITH_FEES',
          },
          t2: {
            enabled: true,
            targetR: 2.5,
            exitRatio: 0.30,
            trailAction: 'TRAIL_T1',
          },
          t3: {
            enabled: true,
            isFreeRunner: true,
            exitRatio: 1.0,
            trailAction: 'NONE',
          },
        },
      });

      expect(ladder).toBeDefined();
      expect(ladder?.distributionMode).toBe('CONVEX_20_30_50');
      const step1 = ladder!.steps[0];
      expect(step1.plannedExitRatio).toBe(0.20);
    });

    it('calculates scaleInState when scale-in pyramiding is enabled', () => {
      const ladder = calculateTargetLadder({
        entryPrice: 100,
        currentLtp: 108,
        direction: 'LONG',
        quantity: 100,
        initialStopLoss: 95, // 1R = 5 points
        customRules: {
          scaleInEnabled: true,
          scaleInTriggerR: 1.5, // 100 + 7.5 = 107.5
          scaleInSizePercent: 25,
          t1: { targetR: 1.0, exitRatio: 0.5, trailAction: 'TRUE_BE_WITH_FEES' },
        },
      });

      expect(ladder?.scaleInState).toBeDefined();
      expect(ladder?.scaleInState?.enabled).toBe(true);
      expect(ladder?.scaleInState?.triggerR).toBe(1.5);
      expect(ladder?.scaleInState?.triggerPrice).toBe(107.5);
      expect(ladder?.scaleInState?.plannedAddQty).toBe(25);
      expect(ladder?.scaleInState?.isTriggered).toBe(true); // LTP 108 >= 107.5
    });
  });

  describe('evaluateOpeningBellGuard', () => {
    it('holds auto execution within the 5-minute opening bell window', () => {
      // 03:47 UTC = 09:17 IST (2 mins after 09:15 open)
      const dateDuringOpen = new Date('2026-11-26T03:47:00Z');
      const res = evaluateOpeningBellGuard({
        timestamp: dateDuringOpen,
        freezeMinutes: 5,
        market: 'NSE',
      });

      expect(res.isSafe).toBe(false);
      expect(res.minutesFromOpen).toBe(2);
      expect(res.reason).toContain('Opening bell freeze active');
    });

    it('permits execution after opening bell window has elapsed', () => {
      // 03:55 UTC = 09:25 IST (10 mins after 09:15 open)
      const dateAfterOpen = new Date('2026-11-26T03:55:00Z');
      const res = evaluateOpeningBellGuard({
        timestamp: dateAfterOpen,
        freezeMinutes: 5,
        market: 'NSE',
      });

      expect(res.isSafe).toBe(true);
      expect(res.minutesFromOpen).toBe(10);
    });
  });

  describe('simulateExecutionBacktest', () => {
    it('calculates True BE savings and giveback preservation accurately', () => {
      const mockTrades = [
        // Trade 1: Hit T1 (+1.5R peak), reversed to lose -1R in reality.
        { realizedPnl: -1000, realizedR: -1.0, mfeR: 1.2, result: 'LOSS' },
        // Trade 2: Hit T1 (+3.0R peak), gave back to +1.0R.
        { realizedPnl: 1000, realizedR: 1.0, mfeR: 3.0, result: 'WIN' },
        // Trade 3: Pure loss without reaching T1.
        { realizedPnl: -1000, realizedR: -1.0, mfeR: 0.3, result: 'LOSS' },
      ];

      const sim = simulateExecutionBacktest({
        trades: mockTrades,
        t1MultipleR: 1.0,
        t1ExitRatio: 0.5,
        t1TrailingAction: 'TRUE_BE_WITH_FEES',
        givebackAutoExitEnabled: true,
        givebackMinPeakR: 1.5,
        givebackMaxPercent: 35,
        executionAlgorithm: 'PEGGED_CHASE',
      });

      expect(sim.totalTradesAnalyzed).toBe(3);
      expect(sim.tradesWithTargetHit).toBe(2);
      expect(sim.tradesSavedByTrueBE).toBe(1); // Trade 1 was saved by True BE!
      expect(sim.tradesProtectedByGiveback).toBe(1); // Trade 2 giveback protected
      expect(sim.netRSavedOrGained).toBeGreaterThan(0);
      expect(sim.simulatedWinRate).toBeGreaterThan(sim.actualWinRate);
      expect(sim.estimatedSlippageSavedPercent).toBe(0.04);
    });

    it('handles empty trades gracefully', () => {
      const sim = simulateExecutionBacktest({ trades: [] });
      expect(sim.totalTradesAnalyzed).toBe(0);
      expect(sim.netRSavedOrGained).toBe(0);
    });
  });
});

