import { describe, it, expect } from 'vitest';
import {
  evaluateDataHealth,
  calculatePreFlightExecutionPreview,
} from '../src/live-watcher.js';

describe('Live Watcher Data Health & Freshness Guard (evaluateDataHealth)', () => {
  const baseTime = new Date('2026-10-31T10:30:00.000Z');

  it('marks data as LIVE when FYERS quote is fresh within threshold', () => {
    const health = evaluateDataHealth({
      provider: 'FYERS',
      lastTickAt: new Date(baseTime.getTime() - 1500), // 1.5s old
      asOf: baseTime,
      isMarketOpen: true,
      staleThresholdSeconds: 10,
      tokenExpiresAt: new Date(baseTime.getTime() + 4 * 3600 * 1000), // 4h remaining
      hasActiveBrokerConnection: true,
    });

    expect(health.connectionState).toBe('LIVE');
    expect(health.isStale).toBe(false);
    expect(health.isTokenExpired).toBe(false);
    expect(health.tokenRemainingSeconds).toBe(4 * 3600);
    expect(health.brokerExecutionBlockedReason).toBeNull();
  });

  it('marks data as DELAYED when FYERS quote age is between 3s and threshold', () => {
    const health = evaluateDataHealth({
      provider: 'FYERS',
      lastTickAt: new Date(baseTime.getTime() - 4500), // 4.5s old
      asOf: baseTime,
      isMarketOpen: true,
      staleThresholdSeconds: 10,
      tokenExpiresAt: new Date(baseTime.getTime() + 3600 * 1000),
      hasActiveBrokerConnection: true,
    });

    expect(health.connectionState).toBe('DELAYED');
    expect(health.isStale).toBe(false);
    expect(health.brokerExecutionBlockedReason).toBeNull();
  });

  it('marks data as STALE and blocks broker execution when tick age exceeds threshold', () => {
    const health = evaluateDataHealth({
      provider: 'FYERS',
      lastTickAt: new Date(baseTime.getTime() - 15000), // 15s old
      asOf: baseTime,
      isMarketOpen: true,
      staleThresholdSeconds: 10,
      tokenExpiresAt: new Date(baseTime.getTime() + 3600 * 1000),
      hasActiveBrokerConnection: true,
    });

    expect(health.connectionState).toBe('STALE');
    expect(health.isStale).toBe(true);
    expect(health.tickAgeMs).toBe(15000);
    expect(health.brokerExecutionBlockedReason).toContain('Quote feed is stale');
  });

  it('blocks broker execution when token has expired', () => {
    const health = evaluateDataHealth({
      provider: 'FYERS',
      lastTickAt: new Date(baseTime.getTime() - 1000),
      asOf: baseTime,
      isMarketOpen: true,
      tokenExpiresAt: new Date(baseTime.getTime() - 10000), // expired 10s ago
      hasActiveBrokerConnection: true,
    });

    expect(health.connectionState).toBe('DISCONNECTED');
    expect(health.isTokenExpired).toBe(true);
    expect(health.tokenRemainingSeconds).toBe(0);
    expect(health.brokerExecutionBlockedReason).toContain('FYERS broker session token has expired');
  });

  it('handles SIMULATED quotes distinctly and flags broker execution blocked', () => {
    const health = evaluateDataHealth({
      provider: 'SIMULATED',
      lastTickAt: baseTime,
      asOf: baseTime,
      isMarketOpen: true,
    });

    expect(health.connectionState).toBe('LIVE');
    expect(health.isStale).toBe(false);
    expect(health.brokerExecutionBlockedReason).toContain('Simulated demo quotes active');
  });

  it('detects MARKET_CLOSED state gracefully without false stale panic', () => {
    const health = evaluateDataHealth({
      provider: 'FYERS',
      lastTickAt: new Date(baseTime.getTime() - 60000), // 1m old
      asOf: baseTime,
      isMarketOpen: false, // market closed
      tokenExpiresAt: new Date(baseTime.getTime() + 3600 * 1000),
      hasActiveBrokerConnection: true,
    });

    expect(health.connectionState).toBe('MARKET_CLOSED');
    expect(health.isStale).toBe(false);
  });
});

describe('Pre-Flight Execution Preview (calculatePreFlightExecutionPreview)', () => {
  it('computes exact pre-flight preview for 50% partial exit on LONG position', () => {
    const preview = calculatePreFlightExecutionPreview({
      entryPrice: 500,
      currentLtp: 520, // +20 points gain
      totalOpenQuantity: 100,
      exitQuantity: 50, // 50%
      direction: 'LONG',
      lotSize: 25,
      contractMultiplier: 1,
      initialStopLoss: 480, // 20 points initial risk per unit
      marketSegment: 'NSE_EQ',
      assetClass: 'EQUITY',
    });

    expect(preview.exitQuantity).toBe(50);
    expect(preview.exitLots).toBe(2);
    expect(preview.remainingQuantity).toBe(50);
    expect(preview.remainingLots).toBe(2);
    expect(preview.isFullClose).toBe(false);
    expect(preview.priceDeltaPoints).toBe(20);
    expect(preview.grossPnL).toBe(1000); // 20 pts * 50 qty
    expect(preview.estimatedCharges).toBeGreaterThan(0);
    expect(preview.netPnL).toBeLessThan(1000);
    // Realized R should be positive (~0.98 - 1.0R after charges)
    expect(preview.realizedR).toBeCloseTo(0.98, 1);
    expect(preview.isSlippageWarning).toBe(false);
  });

  it('computes exact pre-flight preview for 100% full exit on SHORT position', () => {
    const preview = calculatePreFlightExecutionPreview({
      entryPrice: 800,
      currentLtp: 760, // +40 points gain on short
      totalOpenQuantity: 50,
      exitQuantity: 50,
      direction: 'SHORT',
      lotSize: 25,
      contractMultiplier: 1,
      initialStopLoss: 820, // 20 points risk
      marketSegment: 'NSE_EQ',
      assetClass: 'EQUITY',
    });

    expect(preview.exitQuantity).toBe(50);
    expect(preview.exitLots).toBe(2);
    expect(preview.remainingQuantity).toBe(0);
    expect(preview.remainingLots).toBe(0);
    expect(preview.isFullClose).toBe(true);
    expect(preview.priceDeltaPoints).toBe(40);
    expect(preview.grossPnL).toBe(2000); // 40 pts * 50 qty
    expect(preview.realizedR).toBeCloseTo(1.97, 1);
  });

  it('triggers slippage warning when LTP deviates beyond slippageGuardPercent', () => {
    const preview = calculatePreFlightExecutionPreview({
      entryPrice: 500,
      currentLtp: 520,
      totalOpenQuantity: 100,
      exitQuantity: 100,
      direction: 'LONG',
      referencePrice: 510, // ~1.96% deviation from reference 510
      slippageGuardPercent: 0.5,
    });

    expect(preview.isSlippageWarning).toBe(true);
    expect(preview.slippagePercent).toBeCloseTo(1.96, 1);
    expect(preview.slippageMessage).toContain('exceeding 0.5% slippage guard');
  });

  it('throws when exit quantity is zero or negative', () => {
    expect(() => {
      calculatePreFlightExecutionPreview({
        entryPrice: 100,
        currentLtp: 105,
        totalOpenQuantity: 50,
        exitQuantity: 0,
        direction: 'LONG',
      });
    }).toThrow('Exit quantity must be greater than zero');
  });
});

