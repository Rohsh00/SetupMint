import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';

describe('TradeVault API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let tradeId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  it('GET /api/health returns ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.dbState).toBe('connected');
  });

  it('POST /api/v1/auth/register creates user and returns session cookie', async () => {
    const testEmail = `test_${Date.now()}@tradevault.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: 'Password@123',
        name: 'Test Trader',
        baseCurrency: 'INR',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testEmail);
    userId = body.data.user.id;

    // Extract cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);
  });

  it('GET /api/v1/auth/me returns current user profile with valid cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(userId);
  });

  it('POST /api/v1/auth/login rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'trader@tradevault.local',
        password: 'WrongPassword999',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/accounts creates a trading account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'Test Intraday Account',
        broker: 'Zerodha',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 100000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.initialBalance).toBe(100000);
    accountId = body.data.id;
  });

  it('GET /api/v1/instruments returns presets and active instruments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/instruments',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((i: any) => i.symbol === 'NIFTY')).toBe(true);
  });

  it('POST /api/v1/trades creates a manual trade with exact financial calculations', async () => {
    // Buy 100 shares at 2500, sell at 2550. Gross = 5000. Fees = 100. Net = 4900.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_EQ',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2026-10-16',
        entryTime: '2026-10-16T09:30:00Z',
        exitTime: '2026-10-16T11:00:00Z',
        executionMode: 'SIMPLE',
        simpleExecution: {
          entryPrice: 2500,
          exitPrice: 2550,
          quantity: 100,
          contractMultiplier: 1,
          brokerage: 40,
          exchangeFees: 20,
          taxes: 40,
        },
        risk: {
          plannedEntryPrice: 2500,
          initialStopLoss: 2475,
          plannedTarget: 2560,
        },
        thesis: {
          confluences: ['BOS'],
        },
        psychology: {
          disciplineScore: 5,
          rulesFollowed: true,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.netPnL).toBe(4900);
    expect(body.data.outcome).toBe('WIN');
    tradeId = body.data.id;
  });

  it('GET /api/v1/dashboard/stats returns computed analytics from real records', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.netPnL).toBe(4900);
    expect(body.data.winningTradesCount).toBe(1);
    expect(body.data.winRate).toBe(100);
    expect(body.data.equityCurve.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/risk/calculate calculates position sizing and lot rounding', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/calculate',
      headers: { cookie: authCookie },
      payload: {
        accountEquity: 200000,
        riskPercent: 1,
        entryPrice: 24000,
        stopLossPrice: 23940,
        targetPrice: 24150,
        direction: 'LONG',
        contractMultiplier: 1,
        lotSize: 25,
        quantityIncrement: 25,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.plannedRiskAmount).toBe(2000);
    expect(body.data.roundedLotQuantity).toBe(25);
    expect(body.data.isDirectionValid).toBe(true);
  });

  it('POST /api/v1/trades/:id/duplicate duplicates trade for fast re-entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeId}/duplicate`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.symbol).toBe('RELIANCE');
  });
});
