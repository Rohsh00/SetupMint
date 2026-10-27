import { describe, it, expect } from 'vitest';
import moment from 'moment';
import {
  matchSLOrderFromOrderbook,
  INormalizedOrderbookRow,
  ISLMatchTradeInput,
} from '../src/sl-order-match.js';

describe('SL Order Matcher (packages/financial-engine)', () => {
  const baseEntryTime = moment('2026-10-27T09:30:00.000Z');
  const baseExitTime = moment('2026-10-27T10:15:00.000Z');

  const createBaseLongTrade = (overrides?: Partial<ISLMatchTradeInput>): ISLMatchTradeInput => ({
    symbol: 'NSE:SBIN-EQ',
    cleanSymbol: 'SBIN',
    direction: 'LONG',
    entryTime: baseEntryTime.toDate(),
    exitTime: baseExitTime.toDate(),
    entryPrice: 800,
    entryQty: 100,
    ...overrides,
  });

  const createBaseShortTrade = (overrides?: Partial<ISLMatchTradeInput>): ISLMatchTradeInput => ({
    symbol: 'NSE:TCS-EQ',
    cleanSymbol: 'TCS',
    direction: 'SHORT',
    entryTime: baseEntryTime.toDate(),
    exitTime: baseExitTime.toDate(),
    entryPrice: 4000,
    entryQty: 50,
    ...overrides,
  });

  it('recovers stop when SL order was cancelled after profit target hit', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_SL_CANCELLED_01',
        symbol: 'NSE:SBIN-EQ',
        side: -1, // SELL exit
        orderType: 3, // SL-M
        stopPrice: 785,
        quantity: 100,
        status: 1, // Cancelled in FYERS
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(785);
    expect(result.matchedOrderId).toBe('ORD_SL_CANCELLED_01');
    expect(result.finalStatus).toBe('CANCELLED');
    expect(result.source).toBe('BROKER_ORDERBOOK');
  });

  it('recovers stop when SL order was cancelled after discretionary manual exit', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_SL_MANUAL_EXIT',
        symbol: 'NSE:SBIN-EQ',
        side: 'SELL',
        orderType: 4, // SL-L
        stopPrice: 790,
        price: 789.5,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(5, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(790);
    expect(result.finalStatus).toBe('CANCELLED');
  });

  it('recovers stop when SL order was hit and filled', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_SL_FILLED_01',
        symbol: 'SBIN',
        side: -1,
        orderType: 3,
        stopPrice: 780,
        quantity: 100,
        status: 2, // Traded / Filled
        orderDateTime: baseEntryTime.clone().add(1, 'minute').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(780);
    expect(result.matchedOrderId).toBe('ORD_SL_FILLED_01');
    expect(result.finalStatus).toBe('FILLED');
  });

  it('extracts earliest trigger price as initial stop when SL is modified (trailed and widened)', () => {
    const trade = createBaseLongTrade();
    // Same order ID with subsequent modifications
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_MODIFIED_01',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 780, // Initial stop placed at 09:32
        quantity: 100,
        status: 'OPEN',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
      {
        orderId: 'ORD_MODIFIED_01',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 790, // Trailed up to 790 at 09:45
        quantity: 100,
        status: 'OPEN',
        orderDateTime: baseEntryTime.clone().add(15, 'minutes').toDate(),
      },
      {
        orderId: 'ORD_MODIFIED_01',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 775, // Widened down to 775 at 10:00
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(30, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(780); // Earliest price
    expect(result.matchedOrderId).toBe('ORD_MODIFIED_01');
    expect(result.finalStatus).toBe('CANCELLED');
    expect(result.orderModifications?.length).toBe(3);
    expect(result.orderModifications?.[0].stopPrice).toBe(780);
    expect(result.orderModifications?.[1].stopPrice).toBe(790);
    expect(result.orderModifications?.[2].stopPrice).toBe(775);
  });

  it('rejects candidate stop order if placed on the wrong side of entry', () => {
    // For a LONG trade entered at 800, a stop >= 800 is invalid
    const trade = createBaseLongTrade({ entryPrice: 800 });
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_WRONG_SIDE',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 810, // Stop above entry on a LONG trade is invalid
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(1, 'minute').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('NONE');
    expect(result.initialStop).toBeUndefined();
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].isCorrectSide).toBe(false);
  });

  it('ignores wrong symbol, same-side orders, and non-SL order types', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        // Wrong symbol
        orderId: 'ORD_WRONG_SYM',
        symbol: 'NSE:INFY-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
      {
        // Same side (BUY on a LONG trade)
        orderId: 'ORD_SAME_SIDE',
        symbol: 'NSE:SBIN-EQ',
        side: 1, // BUY
        orderType: 3,
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
      {
        // Regular Limit exit (type 1) - not an SL
        orderId: 'ORD_LIMIT_EXIT',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 1, // Limit
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
      {
        // Regular Market exit (type 2) - not an SL
        orderId: 'ORD_MARKET_EXIT',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 2, // Market
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('NONE');
    expect(result.initialStop).toBeUndefined();
    expect(result.candidates.length).toBe(0);
  });

  it('ignores orders placed before entry or after exit (outside tolerance window)', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        // Placed 15 minutes before entry
        orderId: 'ORD_TOO_EARLY',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().subtract(15, 'minutes').toDate(),
      },
      {
        // Placed 30 minutes after exit
        orderId: 'ORD_TOO_LATE',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 785,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseExitTime.clone().add(30, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders, { timeToleranceSeconds: 60 });
    expect(result.confidence).toBe('NONE');
    expect(result.initialStop).toBeUndefined();
  });

  it('returns AMBIGUOUS and does not auto-apply when two plausible conflicting candidates exist', () => {
    const trade = createBaseLongTrade();
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_CANDIDATE_A',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 780,
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
      {
        orderId: 'ORD_CANDIDATE_B',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 790, // Conflicting stop price for same position
        quantity: 100,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(3, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('AMBIGUOUS');
    expect(result.initialStop).toBeUndefined(); // Do not auto-apply
    expect(result.ambiguityReason).toContain('ORD_CANDIDATE_A');
    expect(result.ambiguityReason).toContain('ORD_CANDIDATE_B');
    expect(result.candidates.length).toBe(2);
  });

  it('correctly matches Stop Loss for SHORT trades (stop must be above entry)', () => {
    const trade = createBaseShortTrade({ entryPrice: 4000, entryQty: 50 });
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_SHORT_SL',
        symbol: 'NSE:TCS-EQ',
        side: 1, // BUY exit for a SHORT position
        orderType: 4, // SL-L
        stopPrice: 4050, // Above entry on a SHORT trade
        price: 4055,
        quantity: 50,
        status: 2, // FILLED
        orderDateTime: baseEntryTime.clone().add(4, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(4050);
    expect(result.matchedOrderId).toBe('ORD_SHORT_SL');
    expect(result.finalStatus).toBe('FILLED');
  });

  it('rejects candidate for SHORT trade if stop is below entry price', () => {
    const trade = createBaseShortTrade({ entryPrice: 4000 });
    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_INVALID_SHORT_SL',
        symbol: 'NSE:TCS-EQ',
        side: 1,
        orderType: 3,
        stopPrice: 3950, // Below entry price on a SHORT trade -> invalid stop!
        quantity: 50,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(2, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders);
    expect(result.confidence).toBe('NONE');
    expect(result.initialStop).toBeUndefined();
  });

  it('handles partial exits and scale-ins with quantity tolerance', () => {
    // Scaled into 150 total quantity
    const trade = createBaseLongTrade({
      entryQty: 150,
      entryPrice: 800,
      fills: [
        { type: 'ENTRY', price: 800, quantity: 100, timestamp: baseEntryTime.toDate() },
        { type: 'ENTRY', price: 802, quantity: 50, timestamp: baseEntryTime.clone().add(5, 'minutes').toDate() },
        { type: 'EXIT', price: 820, quantity: 50, timestamp: baseEntryTime.clone().add(20, 'minutes').toDate() },
      ],
    });

    const orders: INormalizedOrderbookRow[] = [
      {
        orderId: 'ORD_SCALEIN_SL',
        symbol: 'NSE:SBIN-EQ',
        side: -1,
        orderType: 3,
        stopPrice: 785,
        quantity: 150,
        status: 'CANCELLED',
        orderDateTime: baseEntryTime.clone().add(6, 'minutes').toDate(),
      },
    ];

    const result = matchSLOrderFromOrderbook(trade, orders, { quantityTolerance: 50 });
    expect(result.confidence).toBe('HIGH');
    expect(result.initialStop).toBe(785);
  });
});
