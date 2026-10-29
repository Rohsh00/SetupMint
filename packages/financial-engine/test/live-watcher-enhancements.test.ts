import { describe, it, expect } from 'vitest';
import {
  calculateBlackScholesGreeks,
  calculatePositionGreeks,
  solveImpliedVolatility,
  evaluateTradeStagnation,
  calculatePortfolioRisk,
  calculateLiveWatcherSummary,
  calculateLiveOpenTradeMetric,
} from '../src/index.js';

describe('Live Trading Watcher Enhancements Suite', () => {
  describe('1. Options Greeks Engine', () => {
    it('calculates accurate Call delta, gamma, theta, and moneyness for NIFTY ATM call', () => {
      const res = calculateBlackScholesGreeks({
        underlyingPrice: 24000,
        strikePrice: 24000,
        timeToExpiryYears: 2 / 365, // 2 days to expiry
        riskFreeRate: 0.07,
        volatility: 0.15,
        optionType: 'CALL',
      });

      expect(res.delta).toBeGreaterThan(0.48);
      expect(res.delta).toBeLessThan(0.55);
      expect(res.gamma).toBeGreaterThan(0);
      expect(res.thetaDaily).toBeLessThan(0); // Time decay is negative for long options
      expect(res.thetaHourly).toBeLessThan(0);
      expect(res.moneyness).toBe('ATM');
      expect(res.price).toBeGreaterThan(50);
    });

    it('calculates negative delta for Puts and accurately classifies ITM/OTM', () => {
      const putRes = calculateBlackScholesGreeks({
        underlyingPrice: 24000,
        strikePrice: 24500, // 24500 PE when spot is 24000 is ITM
        timeToExpiryYears: 5 / 365,
        riskFreeRate: 0.07,
        volatility: 0.14,
        optionType: 'PUT',
      });

      expect(putRes.delta).toBeLessThan(0);
      expect(putRes.delta).toBeGreaterThan(-1);
      expect(putRes.moneyness).toBe('ITM');
      expect(putRes.price).toBeGreaterThan(450); // Has substantial intrinsic value
    });

    it('calculates position greeks with cash delta sensitivity and theta hourly decay', () => {
      const pos = calculatePositionGreeks({
        underlyingPrice: 24200,
        strikePrice: 24200,
        optionType: 'CALL',
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        optionLtp: 110,
        quantity: 50, // 1 lot of NIFTY
        contractMultiplier: 1,
      });

      expect(pos.positionDelta).toBeGreaterThan(20);
      expect(pos.positionDelta).toBeLessThan(35);
      expect(pos.cashDeltaSensitivity).toBe(pos.positionDelta);
      expect(pos.positionThetaHourly).toBeLessThan(0);
      expect(pos.timeToExpiryHours).toBeGreaterThan(0);
    });

    it('solves implied volatility within tolerance using Newton-Raphson', () => {
      const iv = solveImpliedVolatility(120, 24000, 24000, 7 / 365, 'CALL', 0.07);
      expect(iv).toBeGreaterThan(0.05);
      expect(iv).toBeLessThan(0.50);
    });
  });

  describe('2. Trade Stagnation & Time-Stop Radar', () => {
    it('detects active progressing trades without stagnation flag', () => {
      const res = evaluateTradeStagnation({
        entryTime: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
        currentUnrealizedR: 1.5,
        peakMfeR: 1.6,
        peakMfeTime: new Date(Date.now() - 2 * 60 * 1000), // Peak 2 mins ago
        floatingNetPnL: 3500,
      });

      expect(res.isStagnant).toBe(false);
      expect(res.stagnationThreat).toBe('ACTIVE');
      expect(res.holdingEfficiencyScore).toBeGreaterThan(80);
      expect(res.pnlVelocityPerMinute).toBeGreaterThan(100);
    });

    it('flags theta bleeding for option positions stalled without new MFE', () => {
      const res = evaluateTradeStagnation({
        entryTime: new Date(Date.now() - 50 * 60 * 1000), // 50 mins ago
        currentUnrealizedR: 0.1,
        peakMfeR: 0.4,
        peakMfeTime: new Date(Date.now() - 35 * 60 * 1000), // Peak 35 mins ago
        floatingNetPnL: 120,
        isDerivative: true,
      });

      expect(res.isStagnant).toBe(true);
      expect(res.stagnationThreat).toBe('THETA_BLEEDING');
      expect(res.timeStopSuggested).toBe(true);
      expect(res.message).toContain('Option premium bleeding');
    });

    it('flags momentum exhaustion when R retraces significantly from peak', () => {
      const res = evaluateTradeStagnation({
        entryTime: new Date(Date.now() - 40 * 60 * 1000),
        currentUnrealizedR: 0.3,
        peakMfeR: 2.2, // Was at +2.2R, now down to +0.3R
        peakMfeTime: new Date(Date.now() - 25 * 60 * 1000),
        floatingNetPnL: 450,
      });

      expect(res.isStagnant).toBe(true);
      expect(res.stagnationThreat).toBe('STAGNANT_MOMENTUM_EXHAUSTED');
      expect(res.timeStopSuggested).toBe(true);
      expect(res.message).toContain('surrendered from +2.2R');
    });
  });

  describe('3. Portfolio-Level Correlated Exposure', () => {
    it('aggregates net directional delta and detects conflicting index bets', () => {
      const portfolio = calculatePortfolioRisk([
        {
          tradeId: 't1',
          symbol: 'NIFTY 24200 CE',
          underlying: 'NIFTY',
          direction: 'LONG',
          quantity: 50,
          contractMultiplier: 1,
          floatingNetPnL: 1200,
          unrealizedR: 1.2,
          cashDeltaSensitivity: 26,
          isOption: true,
          optionType: 'CALL',
        },
        {
          tradeId: 't2',
          symbol: 'BANKNIFTY 51500 PE',
          underlying: 'BANKNIFTY',
          direction: 'LONG',
          quantity: 30,
          contractMultiplier: 1,
          floatingNetPnL: -400,
          unrealizedR: -0.4,
          cashDeltaSensitivity: -14,
          isOption: true,
          optionType: 'PUT',
        },
      ]);

      expect(portfolio.totalOpenPositions).toBe(2);
      expect(portfolio.conflictingPositionsWarning).toBe(true);
      expect(portfolio.conflictingDetails[0]).toContain('Conflicting correlated index exposure');
      expect(portfolio.underlyingExposure['NIFTY'].directionalBias).toBe('LONG');
      expect(portfolio.underlyingExposure['BANKNIFTY'].directionalBias).toBe('SHORT');
    });

    it('accurately integrates portfolio risk into calculateLiveWatcherSummary', () => {
      const metric = calculateLiveOpenTradeMetric({
        tradeId: 'trade-123',
        symbol: 'NIFTY',
        direction: 'LONG',
        quantity: 50,
        entryPrice: 24000,
        currentLtp: 24100,
        initialStopLoss: 23950,
        plannedTarget: 24200,
      });

      const summary = calculateLiveWatcherSummary([metric]);
      expect(summary.portfolioRisk).toBeDefined();
      expect(summary.portfolioRisk?.totalOpenPositions).toBe(1);
      expect(summary.portfolioRisk?.netDirectionalBias).toBe('BULLISH');
      expect(summary.portfolioRisk?.conflictingPositionsWarning).toBe(false);
    });
  });
});
