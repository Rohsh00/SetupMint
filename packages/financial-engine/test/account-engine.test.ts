import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  Money,
  addByCurrency,
  byCurrencyToNumbers,
  formatMoney,
  FeeModelRegistry,
  SessionCalendarRegistry,
  InstrumentSpecRegistry,
  BrokerAdapterRegistry,
  evaluatePropPreTradeGuard,
  calculateHedgingExecution,
  getAccountDayBoundaries,
  getAccountISOWeekBoundaries,
  formatInAccountTimezone,
} from '../src/index.js';

describe('Account-Driven Financial Engine Suite', () => {
  describe('Money & Currency Safety', () => {
    it('creates Money instances and performs exact arithmetic with same currency', () => {
      const m1 = new Money('100.50', 'USD');
      const m2 = new Money('50.25', 'USD');
      const sum = m1.plus(m2);

      expect(sum.currency).toBe('USD');
      expect(sum.toNumber()).toBe(150.75);

      const diff = m1.minus(m2);
      expect(diff.toNumber()).toBe(50.25);

      const scaled = m1.times(2);
      expect(scaled.toNumber()).toBe(201);
    });

    it('STRICTLY rejects addition or subtraction across different currencies without an FX rate', () => {
      const usd = new Money(100, 'USD');
      const inr = new Money(8300, 'INR');

      expect(() => usd.plus(inr)).toThrowError(/Currency mismatch/);
      expect(() => usd.minus(inr)).toThrowError(/Currency mismatch/);
      expect(() => usd.greaterThan(inr)).toThrowError(/Currency mismatch/);
    });

    it('accumulates mixed-currency amounts into separate byCurrency buckets', () => {
      const breakdown: Record<string, Decimal> = {};
      addByCurrency(breakdown, 1000, 'INR');
      addByCurrency(breakdown, 2500, 'INR');
      addByCurrency(breakdown, 50, 'USD');
      addByCurrency(breakdown, 75.5, 'USD');
      addByCurrency(breakdown, 100, 'EUR');

      const numeric = byCurrencyToNumbers(breakdown);
      expect(numeric).toEqual({
        INR: 3500,
        USD: 125.5,
        EUR: 100,
      });
    });

    it('formats money using Intl without hardcoding ₹ or $', () => {
      const usdStr = formatMoney(1234.56, 'USD', { locale: 'en-US' });
      expect(usdStr).toContain('$');
      expect(usdStr).toContain('1,234.56');

      const inrStr = formatMoney(1234.56, 'INR', { locale: 'en-IN' });
      expect(inrStr).toContain('₹');
      expect(inrStr).toContain('1,234.56');

      const eurStr = formatMoney(1234.56, 'EUR', { locale: 'de-DE' });
      expect(eurStr).toContain('€');
    });
  });

  describe('Fee Model Registry', () => {
    it('calculates Indian statutory charges with flat fee, STT, and GST', () => {
      const charges = FeeModelRegistry.calculate('INDIA_STATUTORY', {
        assetClass: 'EQUITY',
        marketSegment: 'NSE_EQ',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 100,
        brokerFlatFeePerLeg: 20,
      });

      expect(charges.brokerage).toBe(40); // 2 legs * 20
      expect(charges.totalCosts).toBeGreaterThan(40);
      expect(charges.gst).toBeGreaterThan(0);
    });

    it('calculates Forex / CFD commission model ($7/lot round turn)', () => {
      const charges = FeeModelRegistry.calculate('FOREX_COMMISSION', {
        assetClass: 'FOREX',
        marketSegment: 'FOREX',
        entryPrice: 1.1000,
        exitPrice: 1.1050,
        quantity: 2, // 2 standard lots
        commissionPerLot: 7, // $7 round turn
        currency: 'USD',
      });

      expect(charges.brokerage).toBe(14); // 2 lots * $7
      expect(charges.totalCosts).toBe(14);
      expect(charges.sebiTurnover).toBe(0);
      expect(charges.sttCtt).toBe(0);
      expect(charges.gst).toBe(0);
    });

    it('supports ZERO fee model for prop challenges or sim accounts', () => {
      const charges = FeeModelRegistry.calculate('NONE', {
        assetClass: 'COMMODITY',
        entryPrice: 2000,
        exitPrice: 2050,
        quantity: 1,
      });
      expect(charges.totalCosts).toBe(0);
    });
  });

  describe('Session Calendar Registry', () => {
    it('derives NSE sessions correctly for Indian equities', () => {
      // 10:30 AM IST is 05:00 UTC
      const date = new Date('2026-10-21T05:00:00Z'); // Wednesday
      const session = SessionCalendarRegistry.deriveSession('NSE', date);
      expect(session).toBe('NSE_REGULAR');
    });

    it('derives MCX evening session correctly', () => {
      // 08:00 PM IST is 14:30 UTC
      const date = new Date('2026-10-21T14:30:00Z');
      const session = SessionCalendarRegistry.deriveSession('MCX', date);
      expect(session).toBe('MCX_EVENING');
    });

    it('derives London and New York sessions for 24/5 Forex', () => {
      const londonDate = new Date('2026-10-21T09:30:00Z'); // Wednesday 09:30 UTC
      expect(SessionCalendarRegistry.deriveSession('FOREX_24_5', londonDate)).toBe('LONDON');

      const nyDate = new Date('2026-10-21T15:00:00Z'); // Wednesday 15:00 UTC
      expect(SessionCalendarRegistry.deriveSession('FOREX_24_5', nyDate)).toBe('NEW_YORK');

      const weekendDate = new Date('2026-10-24T12:00:00Z'); // Saturday
      expect(SessionCalendarRegistry.deriveSession('FOREX_24_5', weekendDate)).toBe('OFF_HOURS');
    });
  });

  describe('Instrument Spec Registry', () => {
    it('resolves XAUUSD with USD currency, contract size 100, and 0.01 lot step', () => {
      const spec = InstrumentSpecRegistry.resolve('XAUUSD', {
        marketRegion: 'GLOBAL',
        baseCurrency: 'USD',
      });
      expect(spec.quoteCurrency).toBe('USD');
      expect(spec.contractMultiplier).toBe(100);
      expect(spec.tickSize).toBe(0.01);
      expect(spec.minLot).toBe(0.01);
    });

    it('resolves NIFTY with INR currency, lot size 25, and 0.05 tick size', () => {
      const spec = InstrumentSpecRegistry.resolve('NIFTY', {
        marketRegion: 'IN',
        baseCurrency: 'INR',
      });
      expect(spec.quoteCurrency).toBe('INR');
      expect(spec.lotSize).toBe(25);
      expect(spec.tickSize).toBe(0.05);
    });
  });

  describe('Broker Adapter Capabilities & Action Gating', () => {
    it('grants full live execution capabilities to FYERS adapter', () => {
      const caps = BrokerAdapterRegistry.getCapabilities('FYERS');
      expect(caps.canPlaceOrders).toBe(true);
      expect(caps.canModifyStopLoss).toBe(true);
      expect(caps.canAutoExecute).toBe(true);
      expect(caps.canSyncFunds).toBe(true);

      const check = BrokerAdapterRegistry.checkCapability('MODIFY_STOP_LOSS', caps);
      expect(check.allowed).toBe(true);
    });

    it('gates manual and prop-sim accounts from live broker orders with human-readable reason', () => {
      const manualCaps = BrokerAdapterRegistry.getCapabilities('MANUAL');
      const check = BrokerAdapterRegistry.checkCapability('PLACE_ORDER', manualCaps, 'Manual Journal');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Manual Journal does not support live order entry');
    });
  });

  describe('Prop Firm Pre-Trade Guard', () => {
    it('blocks trade if stop loss is missing on prop account', () => {
      const res = evaluatePropPreTradeGuard({
        accountBalance: 100000,
        accountDailyLossRemaining: 5000,
        accountMaxLossRemaining: 10000,
        quantity: 1,
        hasStopLoss: false,
        isAutomated: true,
      });

      expect(res.passed).toBe(false);
      expect(res.hasBlockingViolations).toBe(true);
      expect(res.canAutoExecute).toBe(false);
      expect(res.violations.some((v) => v.code === 'MISSING_STOP_LOSS')).toBe(true);
    });

    it('blocks trade if planned risk exceeds remaining daily loss buffer', () => {
      const res = evaluatePropPreTradeGuard({
        accountBalance: 100000,
        accountDailyLossRemaining: 1200,
        accountMaxLossRemaining: 5000,
        plannedRiskAmount: 1500, // 1500 > 1200 daily buffer!
        quantity: 2,
        hasStopLoss: true,
      });

      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.code === 'DAILY_LOSS_EXCEEDED')).toBe(true);
      expect(res.maxAllowedRisk).toBe(1200);
    });

    it('enforces lot cap and provides recommended capped quantity', () => {
      const res = evaluatePropPreTradeGuard({
        accountBalance: 100000,
        accountDailyLossRemaining: 5000,
        accountMaxLossRemaining: 10000,
        plannedRiskAmount: 500,
        quantity: 10,
        hasStopLoss: true,
        rules: {
          lotCap: 5,
        },
      });

      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.code === 'LOT_CAP_EXCEEDED')).toBe(true);
      expect(res.recommendedCappedQuantity).toBe(5);
    });

    it('blocks automated trades during high-impact news window when prohibited', () => {
      const res = evaluatePropPreTradeGuard({
        accountBalance: 100000,
        accountDailyLossRemaining: 5000,
        accountMaxLossRemaining: 10000,
        plannedRiskAmount: 500,
        quantity: 1,
        hasStopLoss: true,
        isNewsWindowActive: true,
        rules: {
          prohibitNewsTrading: true,
        },
      });

      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.code === 'NEWS_WINDOW_ACTIVE')).toBe(true);
    });
  });

  describe('Hedging Position Model', () => {
    it('tracks independent position tickets without forced FIFO cross-matching', () => {
      const fills = [
        {
          fillId: 'ticket-1',
          timestamp: '2026-10-21T10:00:00Z',
          type: 'ENTRY' as const,
          price: 2000,
          quantity: 1,
        },
        {
          fillId: 'ticket-2',
          timestamp: '2026-10-21T11:00:00Z',
          type: 'ENTRY' as const,
          price: 2020,
          quantity: 1,
        },
        {
          fillId: 'exit-ticket-2',
          matchedEntryFillId: 'ticket-2',
          timestamp: '2026-10-21T12:00:00Z',
          type: 'EXIT' as const,
          price: 2030,
          quantity: 1,
        },
      ];

      const summary = calculateHedgingExecution('LONG', fills, 100);
      expect(summary.isFullyClosed).toBe(false);
      expect(summary.openQuantity.toNumber()).toBe(1);
      expect(summary.closedQuantity.toNumber()).toBe(1);
      // ticket-2 entered at 2020 and exited at 2030 (+10 pts * 1 qty * 100 multiplier = +1000)
      expect(summary.realizedGrossPnL.toNumber()).toBe(1000);
    });
  });

  describe('Timezone & Date Boundaries', () => {
    it('computes exact IST day boundaries across midnight', () => {
      const b = getAccountDayBoundaries('2026-10-21T12:00:00Z', 'Asia/Kolkata');
      expect(b.dateStr).toBe('2026-10-21');
      // Midnight IST on 2026-10-21 is 2026-10-20T18:30:00.000Z
      expect(b.start.toISOString()).toBe('2026-10-20T18:30:00.000Z');
      expect(b.end.toISOString()).toBe('2026-10-21T18:29:59.999Z');
    });

    it('computes ISO week boundaries in account timezone', () => {
      const wb = getAccountISOWeekBoundaries('2026-10-21T12:00:00Z', 'Asia/Kolkata');
      expect(wb.weekStr).toMatch(/2026-W4[23]/);
      // Monday start in IST is Sunday 18:30 UTC
      expect(wb.start.getUTCDay()).toBe(0); // Sunday evening UTC is Monday 00:00 IST
    });

    it('formats dates in account timezone correctly', () => {
      const formatted = formatInAccountTimezone('2026-10-21T18:30:00Z', 'Asia/Kolkata');
      // 18:30 UTC is 00:00 AM on Oct 22 in IST
      expect(formatted).toContain('Oct 22, 2026');
    });
  });
});

