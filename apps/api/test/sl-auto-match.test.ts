import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import moment from 'moment';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  BrokerIntegration,
  Trade,
  TradingAccount,
} from '../src/db/models/index.js';
import { encryptSecret } from '../src/services/crypto.service.js';

describe('FYERS Orderbook Initial SL Auto-Match Integration Tests', () => {
  let app: FastifyInstance;
  let authCookieA: string;
  let userIdA: string;
  let accountIdA: string;

  let authCookieB: string;
  let userIdB: string;
  let accountIdB: string;

  let mockTradebook: any[] = [];
  let mockOrderbook: any[] = [];
  let orderbookFail = false;

  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);

        if (url.includes('/orders')) {
          if (orderbookFail) {
            return new Response(JSON.stringify({ s: 'error', code: 500, message: 'FYERS order service unavailable' }), {
              status: 500,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ s: 'ok', code: 200, orderBook: mockOrderbook }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/tradebook')) {
          return new Response(JSON.stringify({ s: 'ok', tradeBook: mockTradebook }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/funds')) {
          return new Response(
            JSON.stringify({
              s: 'ok',
              code: 200,
              fund_limit: [
                { id: 1, title: 'Total Balance', equityAmount: 200000, commodityAmount: 0 },
                { id: 2, title: 'Clear Balance', equityAmount: 200000, commodityAmount: 0 },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        throw new Error(`Unexpected fetch call in test: ${url}`);
      })
    );

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `sl_user_a_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'SL Trader A',
        baseCurrency: 'INR',
      },
    });
    expect(regResA.statusCode).toBe(201);
    const regBodyA = JSON.parse(regResA.body);
    userIdA = regBodyA.data.user.id;
    const cookiesA = regResA.headers['set-cookie'];
    authCookieA = Array.isArray(cookiesA) ? cookiesA[0] : (cookiesA as string);

    // Create Account for User A
    const accResA = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookieA },
      payload: {
        name: 'FYERS Main A',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 200000,
      },
    });
    expect(accResA.statusCode).toBe(201);
    accountIdA = JSON.parse(accResA.body).data.id;

    // Set up BrokerIntegration for User A
    await BrokerIntegration.create({
      userId: new mongoose.Types.ObjectId(userIdA),
      broker: 'FYERS',
      appId: 'TEST_APP_A',
      clientId: 'FYTESTA',
      secretKey: encryptSecret('test-secret-key-12345678901234567890'),
      accessToken: encryptSecret('test-access-token-a'),
      linkedAccountId: new mongoose.Types.ObjectId(accountIdA),
      tokenExpiresAt: moment().add(1, 'day').toDate(),
      authCodeExpiresAt: moment().add(1, 'day').toDate(),
      status: 'CONNECTED',
    });

    // Register User B (for tenant isolation check)
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `sl_user_b_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'SL Trader B',
        baseCurrency: 'INR',
      },
    });
    expect(regResB.statusCode).toBe(201);
    const regBodyB = JSON.parse(regResB.body);
    userIdB = regBodyB.data.user.id;
    const cookiesB = regResB.headers['set-cookie'];
    authCookieB = Array.isArray(cookiesB) ? cookiesB[0] : (cookiesB as string);

    const accResB = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookieB },
      payload: {
        name: 'FYERS Main B',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 150000,
      },
    });
    expect(accResB.statusCode).toBe(201);
    accountIdB = JSON.parse(accResB.body).data.id;

    await BrokerIntegration.create({
      userId: new mongoose.Types.ObjectId(userIdB),
      broker: 'FYERS',
      appId: 'TEST_APP_B',
      clientId: 'FYTESTB',
      secretKey: encryptSecret('test-secret-key-b-12345678901234567890'),
      accessToken: encryptSecret('test-access-token-b'),
      linkedAccountId: new mongoose.Types.ObjectId(accountIdB),
      tokenExpiresAt: moment().add(1, 'day').toDate(),
      authCodeExpiresAt: moment().add(1, 'day').toDate(),
      status: 'CONNECTED',
    });
  });

  afterAll(async () => {
    if (userIdA) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userIdA) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userIdA) });
      await BrokerIntegration.deleteMany({ userId: new mongoose.Types.ObjectId(userIdA) });
    }
    if (userIdB) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userIdB) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userIdB) });
      await BrokerIntegration.deleteMany({ userId: new mongoose.Types.ObjectId(userIdB) });
    }
    if (app) await app.close();
    await disconnectDatabase();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mockTradebook = [];
    mockOrderbook = [];
    orderbookFail = false;
  });

  it('auto-fills initial stop loss from FYERS orderbook during sync and recalculates realized R', async () => {
    // Current date executions in FYERS tradebook format: "DD-MMM-YYYY HH:mm:ss"
    const now = moment();
    const entryDateStr = now.clone().subtract(30, 'minutes').format('DD-MMM-YYYY HH:mm:ss');
    const slDateStr = now.clone().subtract(28, 'minutes').format('DD-MMM-YYYY HH:mm:ss');
    const exitDateStr = now.clone().subtract(10, 'minutes').format('DD-MMM-YYYY HH:mm:ss');

    mockTradebook = [
      {
        orderNumber: 'ORD_SBIN_BUY_01',
        tradeNumber: 'TRD_SBIN_01',
        tradePrice: 800,
        tradedQty: 100,
        side: 1, // BUY
        symbol: 'NSE:SBIN-EQ',
        orderDateTime: entryDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 80000,
      },
      {
        orderNumber: 'ORD_SBIN_SELL_01',
        tradeNumber: 'TRD_SBIN_02',
        tradePrice: 830,
        tradedQty: 100,
        side: -1, // SELL (exit)
        symbol: 'NSE:SBIN-EQ',
        orderDateTime: exitDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 83000,
      },
    ];

    mockOrderbook = [
      {
        id: 'ORD_SBIN_SL_CANCELLED',
        symbol: 'NSE:SBIN-EQ',
        side: -1, // SELL stop for a LONG trade
        type: 3, // SL-M
        stopPrice: 785,
        qty: 100,
        status: 1, // Cancelled after target hit
        orderDateTime: slDateStr,
        productType: 'INTRADAY',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookieA },
    });
    expect(syncRes.statusCode).toBe(200);

    // Verify trade was saved with auto-filled stop loss
    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userIdA), symbol: 'SBIN' });
    expect(trade).toBeDefined();
    expect(trade?.risk?.initialStopLoss).toBe(785);
    expect(trade?.risk?.initialStopSource).toBe('BROKER_ORDERBOOK');

    // Realized R-multiple verification:
    // Net PnL is (830 - 800) * 100 - costs = ~3000 - charges
    // Planned Risk is (800 - 785) * 100 = 1500
    // Realized R should be positive (~1.9+)
    expect(trade?.risk?.realizedRMultiple).toBeDefined();
    expect(trade?.risk?.realizedRMultiple).toBeGreaterThan(1.5);
    expect(trade?.calculated?.realizedRMultiple).toBe(trade?.risk?.realizedRMultiple);

    // Verify audit log entry
    const slAudit = trade?.auditLog?.find((l) => l.action === 'SL_AUTO_FILLED');
    expect(slAudit).toBeDefined();
    expect(slAudit?.details?.orderId).toBe('ORD_SBIN_SL_CANCELLED');
    expect(slAudit?.details?.finalStatus).toBe('CANCELLED');
    expect(slAudit?.details?.source).toBe('BROKER_ORDERBOOK');
    expect(slAudit?.details?.initialStopLoss).toBe(785);
  });

  it('never overwrites a manual stop loss entered by the user', async () => {
    // Create an existing trade with a manually entered stop loss
    const now = moment();
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userIdA),
      accountId: new mongoose.Types.ObjectId(accountIdA),
      symbol: 'INFY',
      underlying: 'INFY',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: now.toDate(),
      entryTime: now.clone().subtract(40, 'minutes').toDate(),
      exitTime: now.clone().subtract(15, 'minutes').toDate(),
      simpleExecution: {
        entryPrice: 1800,
        exitPrice: 1850,
        quantity: 50,
        contractMultiplier: 1,
      },
      fills: [
        {
          fillId: 'FILL_INFY_01',
          type: 'ENTRY',
          price: 1800,
          quantity: 50,
          timestamp: now.clone().subtract(40, 'minutes').toDate(),
        },
        {
          fillId: 'FILL_INFY_02',
          type: 'EXIT',
          price: 1850,
          quantity: 50,
          timestamp: now.clone().subtract(15, 'minutes').toDate(),
        },
      ],
      risk: {
        initialStopLoss: 1780, // User manually entered 1780
        initialStopSource: 'MANUAL',
      },
      calculated: {
        averageEntryPrice: 1800,
        averageExitPrice: 1850,
        closedQuantity: 50,
        openQuantity: 0,
        totalCosts: 40,
        grossPnL: 2500,
        netPnL: 2460,
        outcome: 'WIN',
      },
    });

    // FYERS orderbook has a different stop order at 1770
    mockOrderbook = [
      {
        id: 'ORD_INFY_SL_BROKER',
        symbol: 'NSE:INFY-EQ',
        side: -1,
        type: 3,
        stopPrice: 1770, // Different broker stop
        qty: 50,
        status: 1,
        orderDateTime: now.clone().subtract(38, 'minutes').format('DD-MMM-YYYY HH:mm:ss'),
        productType: 'INTRADAY',
      },
    ];

    // Trigger same-day backfill live
    const backfillRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sl-backfill',
      headers: { cookie: authCookieA },
      payload: { dryRun: false },
    });
    expect(backfillRes.statusCode).toBe(200);

    // Verify trade stop loss was NOT overwritten
    const checkTrade = await Trade.findById(trade._id);
    expect(checkTrade?.risk?.initialStopLoss).toBe(1780);
    expect(checkTrade?.risk?.initialStopSource).toBe('MANUAL');
  });

  it('ensures trade sync still succeeds when orderbook call fails', async () => {
    const now = moment();
    const entryDateStr = now.clone().subtract(20, 'minutes').format('DD-MMM-YYYY HH:mm:ss');
    const exitDateStr = now.clone().subtract(5, 'minutes').format('DD-MMM-YYYY HH:mm:ss');

    mockTradebook = [
      {
        orderNumber: 'ORD_TATA_BUY',
        tradeNumber: 'TRD_TATA_01',
        tradePrice: 900,
        tradedQty: 50,
        side: 1,
        symbol: 'NSE:TATAMOTORS-EQ',
        orderDateTime: entryDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 45000,
      },
      {
        orderNumber: 'ORD_TATA_SELL',
        tradeNumber: 'TRD_TATA_02',
        tradePrice: 920,
        tradedQty: 50,
        side: -1,
        symbol: 'NSE:TATAMOTORS-EQ',
        orderDateTime: exitDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 46000,
      },
    ];

    // Simulate orderbook endpoint failure
    orderbookFail = true;

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookieA },
    });

    // Trade sync MUST succeed even if orderbook fails!
    expect(syncRes.statusCode).toBe(200);

    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userIdA), symbol: 'TATAMOTORS' });
    expect(trade).toBeDefined();
    // Stop was not applied due to failure, but trade sync succeeded
    expect(trade?.risk?.initialStopLoss).toBeUndefined();
  });

  it('enforces tenant isolation: User B cannot access or affect User A trades/orders', async () => {
    // Run backfill as User B
    const backfillRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sl-backfill',
      headers: { cookie: authCookieB },
      payload: { dryRun: false },
    });
    expect(backfillRes.statusCode).toBe(200);
    const body = backfillRes.json();
    // User B has 0 trades, so totalEligibleTrades is 0
    expect(body.data.totalEligibleTrades).toBe(0);

    // Verify User A's trade was not touched by User B
    const tradeA = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userIdA), symbol: 'SBIN' });
    expect(tradeA).toBeDefined();
    expect(tradeA?.userId.toString()).toBe(userIdA);
  });

  it('flags ambiguous SL orders in review queue without auto-applying a stop', async () => {
    const now = moment();
    const entryDateStr = now.clone().subtract(25, 'minutes').format('DD-MMM-YYYY HH:mm:ss');
    const exitDateStr = now.clone().subtract(5, 'minutes').format('DD-MMM-YYYY HH:mm:ss');

    mockTradebook = [
      {
        orderNumber: 'ORD_WIPRO_BUY',
        tradeNumber: 'TRD_WIPRO_01',
        tradePrice: 500,
        tradedQty: 100,
        side: 1,
        symbol: 'NSE:WIPRO-EQ',
        orderDateTime: entryDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 50000,
      },
      {
        orderNumber: 'ORD_WIPRO_SELL',
        tradeNumber: 'TRD_WIPRO_02',
        tradePrice: 520,
        tradedQty: 100,
        side: -1,
        symbol: 'NSE:WIPRO-EQ',
        orderDateTime: exitDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 52000,
      },
    ];

    // Two conflicting candidate stop orders placed at different prices
    mockOrderbook = [
      {
        id: 'ORD_WIPRO_SL_1',
        symbol: 'NSE:WIPRO-EQ',
        side: -1,
        type: 3,
        stopPrice: 490,
        qty: 100,
        status: 1,
        orderDateTime: now.clone().subtract(23, 'minutes').format('DD-MMM-YYYY HH:mm:ss'),
        productType: 'INTRADAY',
      },
      {
        id: 'ORD_WIPRO_SL_2',
        symbol: 'NSE:WIPRO-EQ',
        side: -1,
        type: 3,
        stopPrice: 485,
        qty: 100,
        status: 1,
        orderDateTime: now.clone().subtract(22, 'minutes').format('DD-MMM-YYYY HH:mm:ss'),
        productType: 'INTRADAY',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookieA },
    });
    expect(syncRes.statusCode).toBe(200);

    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userIdA), symbol: 'WIPRO' });
    expect(trade).toBeDefined();
    // Ambiguous -> DO NOT auto-apply stop
    expect(trade?.risk?.initialStopLoss).toBeUndefined();
    expect(trade?.risk?.slReviewReason).toBe('SL ambiguous - confirm');

    // Audit log should record SL_MATCH_AMBIGUOUS
    const auditAmbiguous = trade?.auditLog?.find((l) => l.action === 'SL_MATCH_AMBIGUOUS');
    expect(auditAmbiguous).toBeDefined();

    // Check review queue
    const reviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/review/queue',
      headers: { cookie: authCookieA },
    });
    expect(reviewRes.statusCode).toBe(200);
    const reviewBody = reviewRes.json();
    const queuedTrade = reviewBody.data.queue.find((q: any) => q.id === trade?._id.toString());
    expect(queuedTrade).toBeDefined();
    expect(queuedTrade?.missing).toContain('SL_AMBIGUOUS');
  });

  it('records stop-loss trailing modifications from orderbook when order is modified', async () => {
    const now = moment();
    const entryDateStr = now.clone().subtract(35, 'minutes').format('DD-MMM-YYYY HH:mm:ss');
    const exitDateStr = now.clone().subtract(5, 'minutes').format('DD-MMM-YYYY HH:mm:ss');

    mockTradebook = [
      {
        orderNumber: 'ORD_RELIANCE_BUY',
        tradeNumber: 'TRD_RELIANCE_01',
        tradePrice: 2800,
        tradedQty: 50,
        side: 1,
        symbol: 'NSE:RELIANCE-EQ',
        orderDateTime: entryDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 140000,
      },
      {
        orderNumber: 'ORD_RELIANCE_SELL',
        tradeNumber: 'TRD_RELIANCE_02',
        tradePrice: 2880,
        tradedQty: 50,
        side: -1,
        symbol: 'NSE:RELIANCE-EQ',
        orderDateTime: exitDateStr,
        productType: 'INTRADAY',
        orderType: 2,
        tradeValue: 144000,
      },
    ];

    // Same order id placed with initial stop 2760, then trailed to 2820
    mockOrderbook = [
      {
        id: 'ORD_RELIANCE_SL',
        symbol: 'NSE:RELIANCE-EQ',
        side: -1,
        type: 3,
        stopPrice: 2760,
        qty: 50,
        status: 6, // OPEN
        orderDateTime: now.clone().subtract(33, 'minutes').format('DD-MMM-YYYY HH:mm:ss'),
        productType: 'INTRADAY',
      },
      {
        id: 'ORD_RELIANCE_SL',
        symbol: 'NSE:RELIANCE-EQ',
        side: -1,
        type: 3,
        stopPrice: 2820, // Trailed favorably above entry
        qty: 50,
        status: 1, // Cancelled upon exit
        orderDateTime: now.clone().subtract(15, 'minutes').format('DD-MMM-YYYY HH:mm:ss'),
        productType: 'INTRADAY',
      },
    ];

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: authCookieA },
    });
    expect(syncRes.statusCode).toBe(200);

    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userIdA), symbol: 'RELIANCE' });
    expect(trade).toBeDefined();
    expect(trade?.risk?.initialStopLoss).toBe(2760);
    expect(trade?.stopLossMoveEvents?.length).toBe(1);
    expect(trade?.stopLossMoveEvents?.[0].moveType).toBe('TRAILED_FAVORABLY');
    expect(trade?.calculated?.stopMoveSummary?.trailedCount).toBe(1);
    expect(trade?.calculated?.stopMoveSummary?.finalStop).toBe(2820);
  });
});
