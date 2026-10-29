import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  BrokerIntegration,
  Trade,
  TradingAccount,
  Instrument,
} from '../src/db/models/index.js';
import { encryptSecret } from '../src/services/crypto.service.js';

describe('Live Open Trade Watcher API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;

  beforeAll(async () => {
    // Mock global fetch for FYERS quotes endpoint
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/data/quotes')) {
          return new Response(
            JSON.stringify({
              s: 'ok',
              d: [
                {
                  n: 'NSE:RELIANCE-EQ',
                  s: 'ok',
                  v: {
                    lp: 2550.0,
                    ch: 50.0,
                    chp: 2.0,
                    high_price: 2560.0,
                    low_price: 2490.0,
                    open_price: 2500.0,
                    prev_close_price: 2500.0,
                    tt: Math.floor(Date.now() / 1000),
                    symbol: 'NSE:RELIANCE-EQ',
                  },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ s: 'ok' }), { status: 200 });
      })
    );

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `live-watcher-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Live Watcher Tester A',
      },
    });
    authCookie = regRes.cookies.find((c) => c.name === 'tv_session')?.value || '';
    userId = JSON.parse(regRes.body).data.user.id;

    // Create Account for User A
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: `tv_session=${authCookie}` },
      payload: {
        name: 'Active F&O Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        initialBalance: 100000,
        currency: 'INR',
      },
    });
    accountId = JSON.parse(accRes.body).data.id;

    // Register User B for tenant isolation tests
    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `live-watcher-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Live Watcher Tester B',
      },
    });
    userBAuthCookie = regB.cookies.find((c) => c.name === 'tv_session')?.value || '';
    userBId = JSON.parse(regB.body).data.user.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('returns empty summary when user has 0 open trades', async () => {
    await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/watcher',
      headers: { cookie: `tv_session=${authCookie}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.openTradesCount).toBe(0);
    expect(body.data.positions).toHaveLength(0);
    expect(body.data.totalFloatingGrossPnL).toBe(0);
    expect(body.data.totalFloatingNetPnL).toBe(0);
  });

  it('computes live open trade metrics with simulated price when FYERS is not connected', async () => {
    await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    // Create an OPEN trade for User A
    const openTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'TCS',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'OPEN',
      openQuantity: 20,
      quantity: 20,
      contractMultiplier: 1,
      simpleExecution: {
        entryPrice: 3500,
        quantity: 20,
        contractMultiplier: 1,
      },
      tradeDate: new Date(),
      entryTime: new Date(),
      stopLoss: 3450, // 50 pts risk -> Initial Risk = 1,000
      target: 3600,   // 100 pts target
      calculated: {
        grossPnL: 0,
        netPnL: 0,
        totalCosts: 0,
        outcome: 'OPEN',
      },
      risk: {
        plannedEntryPrice: 3500,
        initialStopLoss: 3450,
        plannedTarget: 3600,
        riskBudgetAmount: 1000,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/watcher',
      headers: { cookie: `tv_session=${authCookie}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.openTradesCount).toBe(1);

    const pos = body.data.positions[0];
    expect(pos.tradeId).toBe(openTrade._id.toString());
    expect(pos.symbol).toBe('TCS');
    expect(pos.direction).toBe('LONG');
    expect(pos.entryPrice).toBe(3500);
    expect(pos.currentLtp).toBeGreaterThan(3400);
    expect(pos.currentLtp).toBeLessThan(3600);
    expect(pos.stopLoss).toBe(3450);
    expect(pos.target).toBe(3600);
    expect(pos.distanceToStopPoints).not.toBeNull();
    expect(pos.distanceToStopTicks).not.toBeNull();
    expect(pos.stopThreatLevel).toBeDefined();
    expect(pos.provider).toBe('SIMULATED');

    // Clean up
    await Trade.findByIdAndDelete(openTrade._id);
  });

  it('uses live broker quotes when FYERS integration is active', async () => {
    await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    // Add active FYERS BrokerIntegration for User A
    await BrokerIntegration.create({
      userId: new mongoose.Types.ObjectId(userId),
      broker: 'FYERS',
      appId: 'TEST_APP_ID',
      appSecret: encryptSecret('TEST_SECRET'),
      accessToken: encryptSecret('TEST_ACCESS_TOKEN'),
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24h
      status: 'CONNECTED',
    });

    const openTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'RELIANCE',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'OPEN',
      openQuantity: 10,
      quantity: 10,
      contractMultiplier: 1,
      simpleExecution: {
        entryPrice: 2500,
        quantity: 10,
        contractMultiplier: 1,
      },
      tradeDate: new Date(),
      entryTime: new Date(),
      stopLoss: 2470, // 30 pts risk -> Initial Risk = 300
      target: 2600,   // 100 pts target
      calculated: {
        grossPnL: 0,
        netPnL: 0,
        totalCosts: 0,
        outcome: 'OPEN',
      },
      risk: {
        plannedEntryPrice: 2500,
        initialStopLoss: 2470,
        plannedTarget: 2600,
        riskBudgetAmount: 300,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/watcher',
      headers: { cookie: `tv_session=${authCookie}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.openTradesCount).toBe(1);

    const pos = body.data.positions[0];
    expect(pos.symbol).toBe('RELIANCE');
    expect(pos.currentLtp).toBe(2550); // From mocked FYERS quote
    expect(pos.provider).toBe('FYERS');
    expect(pos.priceDeltaPoints).toBe(50);
    expect(pos.floatingGrossPnL).toBe(500); // (2550 - 2500) * 10
    expect(pos.distanceToStopPoints).toBe(80); // 2550 - 2470
    expect(pos.distanceToStopTicks).toBe(1600); // 80 / 0.05
    expect(pos.distanceToTargetPoints).toBe(50); // 2600 - 2550
    expect(pos.distanceToTargetTicks).toBe(1000); // 50 / 0.05
    expect(pos.targetProgressPercent).toBe(50); // 50 / 100 * 100
    expect(pos.stopThreatLevel).toBe('SAFE');

    // Test GET /:id/live endpoint
    const singleRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${openTrade._id}/live`,
      headers: { cookie: `tv_session=${authCookie}` },
    });
    expect(singleRes.statusCode).toBe(200);
    const singleBody = JSON.parse(singleRes.body);
    expect(singleBody.success).toBe(true);
    expect(singleBody.data.symbol).toBe('RELIANCE');
    expect(singleBody.data.currentLtp).toBe(2550);

    // Tenant isolation: User B cannot access User A's trade live metric
    const userBRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${openTrade._id}/live`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
    });
    expect(userBRes.statusCode).toBe(404);

    // Clean up
    await Trade.findByIdAndDelete(openTrade._id);
    await BrokerIntegration.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
  });

  it('records emotional pulse check-in to trade auditLog via POST /:id/live-pulse', async () => {
    const pulseTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NIFTY24OCT24100CE',
      assetClass: 'OPTIONS',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      currency: 'INR',
      direction: 'LONG',
      status: 'OPEN',
      openQuantity: 50,
      quantity: 50,
      entryTime: new Date(Date.now() - 15 * 60 * 1000),
      tradeDate: '2026-10-24',
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 150,
        quantity: 50,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 5,
        taxes: 25,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      auditLog: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${pulseTrade._id}/live-pulse`,
      headers: { cookie: `tv_session=${authCookie}` },
      payload: {
        emotion: 'CALM',
        notes: 'Holding as plan dictates, strong support held',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.emotion).toBe('CALM');

    // Verify trade auditLog was updated
    const updated = await Trade.findById(pulseTrade._id);
    expect(updated?.auditLog).toHaveLength(1);
    expect(updated?.auditLog[0].action).toBe('LIVE_PULSE_CHECK');
    expect((updated?.auditLog[0].details as any)?.emotion).toBe('CALM');

    // Tenant isolation: User B cannot record pulse for User A trade
    const userBRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${pulseTrade._id}/live-pulse`,
      headers: { cookie: `tv_session=${userBAuthCookie}` },
      payload: { emotion: 'FOMO' },
    });
    expect(userBRes.statusCode).toBe(404);

    await Trade.findByIdAndDelete(pulseTrade._id);
  });

  it('streams live SSE updates via GET /api/v1/trades/live/stream with event-stream headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/stream?once=true',
      headers: { cookie: `tv_session=${authCookie}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.body).toContain('data:');
  });
});
