import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { User } from '../src/db/models/User.js';
import { TradingAccount } from '../src/db/models/TradingAccount.js';
import { Trade } from '../src/db/models/Trade.js';

describe('Account Capability Guards & Endpoint Defense Tests', () => {
  let app: FastifyInstance;
  let testUserCookie: string;
  let testUserId: string;
  let zerodhaAccount: any;
  let manualTrade: any;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register ephemeral test user
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `cap_guard_${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Capability Test User',
        baseCurrency: 'INR',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    testUserId = body.data.user.id;
    const cookies = res.headers['set-cookie'];
    testUserCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    // Create a manual Zerodha account (no FYERS, no live order execution)
    zerodhaAccount = await TradingAccount.create({
      userId: testUserId,
      name: 'Zerodha Kite Manual',
      broker: 'ZERODHA',
      accountType: 'EQUITY',
      baseCurrency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      profile: {
        marketRegion: 'IN',
        baseCurrency: 'INR',
        timezone: 'Asia/Kolkata',
        feeModelKey: 'INDIA_STATUTORY',
        executionAdapterKey: 'MANUAL',
        positionModel: 'NETTING_FIFO',
        sessionCalendarKey: 'NSE',
        capabilities: {
          canPlaceOrders: false,
          canModifyStopLoss: false,
          canExitPositions: false,
          canScaleLadder: false,
          canAutoExecute: false,
          canSyncFunds: false,
          canFetchHistory: false,
          canStreamQuotes: false,
        },
      },
    });

    // Create a trade belonging to this manual account
    manualTrade = await Trade.create({
      userId: testUserId,
      accountId: zerodhaAccount._id,
      symbol: 'INFY',
      direction: 'LONG',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      currency: 'INR',
      simpleExecution: {
        entryPrice: 1500,
        quantity: 10,
        contractMultiplier: 1,
      },
      risk: {
        initialStopLoss: 1480,
        currentStopLoss: 1480,
        plannedRiskAmount: 200,
      },
    });
  });

  afterAll(async () => {
    // Strict cleanup: only touch ephemeral test user records
    if (testUserId) {
      await Trade.deleteMany({ userId: testUserId });
      await TradingAccount.deleteMany({ userId: testUserId });
      await User.deleteMany({ _id: testUserId });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('1. GET /api/v1/accounts/capabilities returns resolved UI capabilities', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/capabilities?scope=ACCOUNT&accountId=${zerodhaAccount._id}`,
      headers: { cookie: testUserCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.currency.code).toBe('INR');
    expect(body.data.currency.symbol).toBe('₹');
    expect(body.data.broker.adapter).toBe('MANUAL');
    expect(body.data.broker.isFyers).toBe(false);
    expect(body.data.broker.canExecuteLive).toBe(false);
    expect(body.data.broker.canSyncFunds).toBe(false);
    expect(body.data.csvImport.brokerPresets).toContain('ZERODHA');
  });

  it('2. POST /api/v1/accounts/:id/broker-link rejects non-FYERS account with 409 CAPABILITY_NOT_SUPPORTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${zerodhaAccount._id}/broker-link`,
      headers: { cookie: testUserCookie },
      payload: { clientId: 'FY12345' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });

  it('3. POST /api/v1/accounts/:id/sync-funds rejects non-FYERS account with 409 CAPABILITY_NOT_SUPPORTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${zerodhaAccount._id}/sync-funds`,
      headers: { cookie: testUserCookie },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });

  it('4. POST /api/v1/trades/:id/broker-sl rejects manual trade with 409 CAPABILITY_NOT_SUPPORTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${manualTrade._id}/broker-sl`,
      headers: { cookie: testUserCookie },
      payload: {
        stopPrice: 1490,
        executeBroker: true,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });

  it('5. POST /api/v1/trades/:id/broker-exit rejects manual trade with 409 CAPABILITY_NOT_SUPPORTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${manualTrade._id}/broker-exit`,
      headers: { cookie: testUserCookie },
      payload: {
        exitPrice: 1520,
        quantity: 10,
        executeBroker: true,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });

  it('6. POST /api/v1/trades/:id/broker-ladder-step rejects manual trade with 409 CAPABILITY_NOT_SUPPORTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${manualTrade._id}/broker-ladder-step`,
      headers: { cookie: testUserCookie },
      payload: {
        targetIndex: 1,
        targetPrice: 1530,
        targetExitQty: 5,
        executeBroker: true,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });

  it('7. POST /api/v1/integrations/fyers/connect and /sync reject when user has no FYERS account', async () => {
    const connectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/connect',
      headers: { cookie: testUserCookie },
    });
    expect(connectRes.statusCode).toBe(409);
    const connectBody = JSON.parse(connectRes.body);
    expect(connectBody.error.code).toBe('CAPABILITY_NOT_SUPPORTED');

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/sync',
      headers: { cookie: testUserCookie },
    });
    expect(syncRes.statusCode).toBe(409);
    const syncBody = JSON.parse(syncRes.body);
    expect(syncBody.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
  });
});
