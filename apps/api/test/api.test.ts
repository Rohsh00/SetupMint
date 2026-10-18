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

  it('PUT /api/v1/trades/:id performs Quick Close for OPEN trade with partial execution payload', async () => {
    // 1. Duplicate creates an OPEN trade with entryPrice=2500, quantity=100
    const dupRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeId}/duplicate`,
      headers: { cookie: authCookie },
    });
    const dupTrade = JSON.parse(dupRes.body).data;

    // 2. Perform Quick Close: send only exitPrice, exitTime, and status: 'CLOSED'
    const closeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${dupTrade.id}`,
      headers: { cookie: authCookie },
      payload: {
        status: 'CLOSED',
        exitTime: '2026-10-18T10:30:00Z',
        simpleExecution: {
          exitPrice: 2560, // Gross: (2560 - 2500) * 100 = 6000. Costs: 100 (40+20+40 from source). Net: 5900
        },
      },
    });

    expect(closeRes.statusCode).toBe(200);
    const closeBody = JSON.parse(closeRes.body);
    expect(closeBody.success).toBe(true);
    expect(closeBody.data.status).toBe('CLOSED');
    expect(closeBody.data.calculated.grossPnL).toBe(6000);
    expect(closeBody.data.calculated.netPnL).toBe(5900);
    expect(closeBody.data.calculated.outcome).toBe('WIN');

    // 3. Verify audit log recorded CLOSED action and exitPrice details
    const lastAudit = closeBody.data.auditLog[closeBody.data.auditLog.length - 1];
    expect(lastAudit.action).toBe('CLOSED');
    expect(lastAudit.details.exitPrice).toBe(2560);

    // 4. Clean up duplicate closed trade to maintain state isolation for sequential account tests
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trades/${dupTrade.id}`,
      headers: { cookie: authCookie },
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('GET /api/v1/trades/invalid-id rejects invalid ObjectId format with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/not-a-valid-id',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_ID');
  });

  it('POST /api/v1/accounts/:id/transactions adds deposit and authoritatively recalculates balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/transactions`,
      headers: { cookie: authCookie },
      payload: {
        type: 'DEPOSIT',
        amount: 50000,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: 'Monthly capital addition',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.balanceSummary.totalDeposits).toBe(50000);
    // Initial 100,000 + 4,900 realized trade P&L + 50,000 deposit = 154,900
    expect(body.balanceSummary.currentBalance).toBe(154900);
  });

  it('POST /api/v1/accounts/:id/reconcile returns authoritative account balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/reconcile`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.currentBalance).toBe(154900);
    expect(body.data.closedTradesCount).toBe(1);
  });

  it('POST /api/v1/trades/bulk-delete deletes trades and reconciles account balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/bulk-delete',
      headers: { cookie: authCookie },
      payload: {
        tradeIds: [tradeId],
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify account balance reconciled after trade deletion (4,900 net P&L removed)
    const accRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accBody = JSON.parse(accRes.body);
    // 100,000 initial + 0 P&L + 50,000 deposit = 150,000
    expect(accBody.data.currentBalance).toBe(150000);
    expect(accBody.data.realizedPnL).toBe(0);
  });
});
