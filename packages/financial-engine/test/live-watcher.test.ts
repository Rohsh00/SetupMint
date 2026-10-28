import { describe, it, expect } from 'vitest';
import {
  calculateLiveOpenTradeMetric,
  calculateLiveWatcherSummary,
  ILiveOpenTradeCalculationParams,
} from '../src/live-watcher.js';

describe('Financial Engine — Live Open Trade Watcher', () => {
  describe('calculateLiveOpenTradeMetric', () => {
    it('calculates long trade in profit with correct floating P&L, unrealized R, and target progress', () => {
      // Entry: 2500, LTP: 2550 (+50 pts)
      // SL: 2475 (Risk = 25 pts), Target: 2600 (Target run = 100 pts)
      // Quantity: 100, Multiplier: 1, Tick: 0.05
      // Gross Floating PnL = 50 * 100 = 5000
      // Initial Risk = 25 * 100 = 2500
      // Buffer to SL = 2550 - 2475 = 75 pts (1500 ticks)
      // Remaining to Target = 2600 - 2550 = 50 pts (1000 ticks)
      // Target progress = 50 / 100 * 100 = 50%
      const params: ILiveOpenTradeCalculationParams = {
        tradeId: 'trade-long-1',
        symbol: 'RELIANCE',
        direction: 'LONG',
        entryPrice: 2500,
        currentLtp: 2550,
        quantity: 100,
        contractMultiplier: 1,
        stopLoss: 2475,
        target: 2600,
        tickSize: 0.05,
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
        provider: 'FYERS',
      };

      const result = calculateLiveOpenTradeMetric(params);

      expect(result.tradeId).toBe('trade-long-1');
      expect(result.direction).toBe('LONG');
      expect(result.entryPrice).toBe(2500);
      expect(result.currentLtp).toBe(2550);
      expect(result.priceDeltaPoints).toBe(50);
      expect(result.priceDeltaPercent).toBe(2);
      expect(result.floatingGrossPnL).toBe(5000);
      expect(result.estimatedCharges).toBeGreaterThan(0);
      expect(result.floatingNetPnL).toBeLessThan(5000);
      expect(result.floatingNetPnL).toBeGreaterThan(4800);
      expect(result.initialRiskAmount).toBe(2500);
      expect(result.unrealizedR).toBeGreaterThan(1.9); // ~1.97R
      expect(result.stopLoss).toBe(2475);
      expect(result.distanceToStopPoints).toBe(75);
      expect(result.distanceToStopTicks).toBe(1500);
      expect(result.stopThreatLevel).toBe('SAFE');
      expect(result.target).toBe(2600);
      expect(result.distanceToTargetPoints).toBe(50);
      expect(result.distanceToTargetTicks).toBe(1000);
      expect(result.targetProgressPercent).toBe(50);
      expect(result.provider).toBe('FYERS');
    });

    it('identifies ATTENTION and CRITICAL stop threat levels as price drops toward stop', () => {
      // Entry: 1000, Initial SL: 960 (Distance = 40 pts)
      // When LTP = 980 (Buffer = 20 pts -> 20/40 = 50% buffer remaining) -> ATTENTION
      const attentionResult = calculateLiveOpenTradeMetric({
        tradeId: 't-attn',
        symbol: 'TATAMOTORS',
        direction: 'LONG',
        entryPrice: 1000,
        currentLtp: 980,
        quantity: 50,
        stopLoss: 960,
        tickSize: 0.05,
      });

      expect(attentionResult.distanceToStopPoints).toBe(20);
      expect(attentionResult.stopThreatLevel).toBe('ATTENTION');

      // When LTP = 968 (Buffer = 8 pts -> 8/40 = 20% buffer remaining <= 25%) -> CRITICAL
      const criticalResult = calculateLiveOpenTradeMetric({
        tradeId: 't-crit',
        symbol: 'TATAMOTORS',
        direction: 'LONG',
        entryPrice: 1000,
        currentLtp: 968,
        quantity: 50,
        stopLoss: 960,
        tickSize: 0.05,
      });

      expect(criticalResult.distanceToStopPoints).toBe(8);
      expect(criticalResult.stopThreatLevel).toBe('CRITICAL');

      // When LTP = 959 (Crossed below SL) -> BREACHED
      const breachedResult = calculateLiveOpenTradeMetric({
        tradeId: 't-breach',
        symbol: 'TATAMOTORS',
        direction: 'LONG',
        entryPrice: 1000,
        currentLtp: 959,
        quantity: 50,
        stopLoss: 960,
        tickSize: 0.05,
      });

      expect(breachedResult.distanceToStopPoints).toBe(-1);
      expect(breachedResult.stopThreatLevel).toBe('BREACHED');
    });

    it('calculates short trade correctly when market drops (in profit)', () => {
      // Short BankNifty at 50,000, current LTP 49,600 (-400 pts favorable)
      // SL: 50,200 (Initial risk = 200 pts), Target: 49,200 (Planned run = 800 pts)
      // Qty: 30, Multiplier: 1, Tick: 0.05
      // Gross Floating PnL = (50000 - 49600) * 30 = 400 * 30 = 12,000
      // Buffer to SL = 50,200 - 49,600 = 600 pts (12,000 ticks)
      // Remaining to Target = 49,600 - 49,200 = 400 pts (8,000 ticks)
      // Target progress = 400 / 800 * 100 = 50%
      const shortResult = calculateLiveOpenTradeMetric({
        tradeId: 'short-1',
        symbol: 'BANKNIFTY',
        direction: 'SHORT',
        entryPrice: 50000,
        currentLtp: 49600,
        quantity: 30,
        stopLoss: 50200,
        target: 49200,
        tickSize: 0.05,
        assetClass: 'FUTURES',
        marketSegment: 'NSE_FNO',
        provider: 'ANGEL_ONE',
      });

      expect(shortResult.direction).toBe('SHORT');
      expect(shortResult.priceDeltaPoints).toBe(400); // Positive delta because favorable
      expect(shortResult.floatingGrossPnL).toBe(12000);
      expect(shortResult.initialRiskAmount).toBe(6000); // 200 * 30
      expect(shortResult.unrealizedR).toBeGreaterThan(1.9); // ~1.98R
      expect(shortResult.distanceToStopPoints).toBe(600);
      expect(shortResult.distanceToStopTicks).toBe(12000);
      expect(shortResult.stopThreatLevel).toBe('SAFE');
      expect(shortResult.distanceToTargetPoints).toBe(400);
      expect(shortResult.distanceToTargetTicks).toBe(8000);
      expect(shortResult.targetProgressPercent).toBe(50);
      expect(shortResult.provider).toBe('ANGEL_ONE');
    });

    it('handles trade with no stop loss and no target gracefully', () => {
      const noSLResult = calculateLiveOpenTradeMetric({
        tradeId: 'no-sl',
        symbol: 'INFY',
        direction: 'LONG',
        entryPrice: 1500,
        currentLtp: 1530,
        quantity: 20,
      });

      expect(noSLResult.stopLoss).toBeNull();
      expect(noSLResult.target).toBeNull();
      expect(noSLResult.distanceToStopPoints).toBeNull();
      expect(noSLResult.distanceToStopTicks).toBeNull();
      expect(noSLResult.stopThreatLevel).toBe('NO_STOP');
      expect(noSLResult.distanceToTargetPoints).toBeNull();
      expect(noSLResult.targetProgressPercent).toBeNull();
      expect(noSLResult.unrealizedR).toBeNull();
      expect(noSLResult.floatingGrossPnL).toBe(600);
    });
  });

  describe('calculateLiveWatcherSummary', () => {
    it('aggregates multiple positions into portfolio totals with unrealized R', () => {
      const pos1 = calculateLiveOpenTradeMetric({
        tradeId: 't1',
        symbol: 'NIFTY',
        direction: 'LONG',
        entryPrice: 24000,
        currentLtp: 24100,
        quantity: 50,
        stopLoss: 23950,
        provider: 'FYERS',
      });

      const pos2 = calculateLiveOpenTradeMetric({
        tradeId: 't2',
        symbol: 'BANKNIFTY',
        direction: 'SHORT',
        entryPrice: 51000,
        currentLtp: 51100, // Losing 100 pts
        quantity: 30,
        stopLoss: 51200,
        provider: 'FYERS',
      });

      const summary = calculateLiveWatcherSummary([pos1, pos2]);

      expect(summary.openTradesCount).toBe(2);
      expect(summary.profitableCount).toBe(1);
      expect(summary.losingCount).toBe(1);
      expect(summary.breakevenCount).toBe(0);
      expect(summary.provider).toBe('FYERS');
      expect(summary.totalRiskCapital).toBe(pos1.initialRiskAmount! + pos2.initialRiskAmount!);
      expect(summary.totalFloatingGrossPnL).toBe(pos1.floatingGrossPnL + pos2.floatingGrossPnL);
      expect(summary.portfolioUnrealizedR).not.toBeNull();
    });

    it('handles empty positions array', () => {
      const summary = calculateLiveWatcherSummary([]);
      expect(summary.openTradesCount).toBe(0);
      expect(summary.totalFloatingGrossPnL).toBe(0);
      expect(summary.totalFloatingNetPnL).toBe(0);
      expect(summary.portfolioUnrealizedR).toBeNull();
      expect(summary.provider).toBe('SIMULATED');
    });
  });
});
