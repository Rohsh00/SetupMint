import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  BrokerIntegration,
  Trade,
  TradingAccount,
  TradeCandleSnapshot,
} from '../src/db/models/index.js';
import { encryptSecret } from '../src/services/crypto.service.js';

describe('Excursion Analytics API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;

  beforeAll(async () => {
    // Mock global fetch for FYERS endpoints
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/data/history')) {
          // Return sample 1m candles
          const baseEpoch = 1729497000; // 09:30 UTC
          return new Response(
            JSON.stringify({
              s: 'ok',
              code: 200,
              candles: [
                [baseEpoch, 100, 105, 98, 104, 1000],
                [baseEpoch + 60, 104, 120, 103, 118, 1200],
                [baseEpoch + 120, 118, 119, 95, 96, 900],
                [baseEpoch + 180, 96, 112, 96, 110, 1500],
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
        email: `excursion-test-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Excursion Tester',
      },
    });
    authCookie = regRes.headers['set-cookie'] as string;
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meRes.json().data.user.id;

    // Create Account for User A
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'FYERS Main',
      broker: 'FYERS',
      accountType: 'EQUITY',
      initialBalance: mongoose.Types.Decimal128.fromString('100000'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000'),
    });
    accountId = acc._id.toString();

    // Register User B for tenant isolation testing
    const regBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `excursion-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Excursion User B',
      },
    });
    userBAuthCookie = regBRes.headers['set-cookie'] as string;
    const meBRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meBRes.json().data.user.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
    await disconnectDatabase();
  });

  it('1. returns 409 BROKER_NOT_CONNECTED when FYERS broker is not connected', async () => {
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:SBIN-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-21'),
      entryTime: new Date(1729497000 * 1000),
      exitTime: new Date((1729497000 + 180) * 1000),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 100,
        exitPrice: 110,
        quantity: 50,
      },
      calculated: {
        netPnL: 500,
        outcome: 'WIN',
        excursion: { status: 'PENDING' },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/excursion/compute`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BROKER_NOT_CONNECTED');
  });

  it('2. returns 400 TRADE_NOT_CLOSED if trade is open', async () => {
    // Setup connected broker
    await BrokerIntegration.create({
      userId: new mongoose.Types.ObjectId(userId),
      broker: 'FYERS',
      appId: 'TEST_APP_ID-100',
      secretKey: encryptSecret('secret-test'),
      accessToken: encryptSecret('test-token'),
      tokenExpiresAt: new Date(Date.now() + 86400000),
      status: 'CONNECTED',
    });

    const openTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:SBIN-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date('2026-10-21'),
      entryTime: new Date(1729497000 * 1000),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 100,
        quantity: 50,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${openTrade._id}/excursion/compute`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TRADE_NOT_CLOSED');
  });

  it('3. successfully computes excursion and updates trade record', async () => {
    const closedTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:SBIN-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-21'),
      entryTime: new Date(1729497000 * 1000),
      exitTime: new Date((1729497000 + 180) * 1000),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 100,
        exitPrice: 110,
        quantity: 50,
      },
      risk: {
        initialStopLoss: 90,
        estimatedRiskAmount: 500,
      },
      calculated: {
        netPnL: 500,
        outcome: 'WIN',
        excursion: { status: 'PENDING' },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${closedTrade._id}/excursion/compute`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('COMPUTED');
    expect(body.data.mfePoints).toBe(20);
    expect(body.data.maePoints).toBe(5);
    expect(body.data.mfeAmount).toBe(1000);
    expect(body.data.maeAmount).toBe(250);
    expect(body.data.mfeR).toBe(2);
    expect(body.data.maeR).toBe(0.5);
    expect(body.data.exitEfficiency).toBe(0.5);

    // Verify snapshot was created
    const snapshot = await TradeCandleSnapshot.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: closedTrade._id,
    });
    expect(snapshot).toBeDefined();
    expect(snapshot?.candles.length).toBeGreaterThan(0);
  });

  it('4. enforces tenant isolation on compute endpoint (user B cannot access user A trade)', async () => {
    const tradeA = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeA!._id}/excursion/compute`,
      headers: { cookie: userBAuthCookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TRADE_NOT_FOUND');
  });

  it('5. processes excursion backfill in batches via POST /fyers/excursion-backfill', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/fyers/excursion-backfill',
      headers: { cookie: authCookie },
      payload: { limit: 10 },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.processed).toBeDefined();
    expect(data.computed).toBeDefined();
    expect(data.remaining).toBeDefined();
  });

  it('6. returns excursion aggregates and scatter points via GET /analytics/excursion', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/excursion',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.summary).toBeDefined();
    expect(data.summary.totalEvaluated).toBeGreaterThan(0);
    expect(data.summary.avgMaeR).toBeDefined();
    expect(data.summary.avgMfeR).toBeDefined();
    expect(data.summary.avgExitEfficiency).toBeDefined();
    expect(Array.isArray(data.scatterPoints)).toBe(true);
    expect(data.scatterPoints.length).toBeGreaterThan(0);
    const pointWithR = data.scatterPoints.find((p: any) => p.maeR !== undefined);
    expect(pointWithR).toBeDefined();
    expect(pointWithR.maeR).toBe(0.5);
    expect(pointWithR.mfeR).toBe(2);
  });
});
