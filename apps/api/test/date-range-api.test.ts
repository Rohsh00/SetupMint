import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount } from '../src/db/models/index.js';

describe('Date-Range API Consistency & Drilldown Reconciliation Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let otherAuthCookie: string;
  let accountId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User 1
    const email1 = `daterange_user1_${Date.now()}@tradevault.local`;
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: email1,
        password: 'Password@123',
        name: 'Date Range Trader 1',
        baseCurrency: 'INR',
      },
    });
    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);
    userId = body1.data.user.id;
    const cookieHeader1 = res1.headers['set-cookie'];
    authCookie = Array.isArray(cookieHeader1) ? cookieHeader1[0] : (cookieHeader1 as string);

    // Register User 2 (for tenant isolation)
    const email2 = `daterange_user2_${Date.now()}@tradevault.local`;
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: email2,
        password: 'Password@123',
        name: 'Date Range Trader 2',
        baseCurrency: 'INR',
      },
    });
    expect(res2.statusCode).toBe(201);
    const cookieHeader2 = res2.headers['set-cookie'];
    otherAuthCookie = Array.isArray(cookieHeader2) ? cookieHeader2[0] : (cookieHeader2 as string);

    // Create Account for User 1
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'Trading Account 1',
        broker: 'ZERODHA',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 100000,
      },
    });
    expect(accRes.statusCode).toBe(201);
    accountId = JSON.parse(accRes.body).data.id;

    // Seed test trades with specific IST boundary dates:
    // Target test filter range: 2026-10-10 to 2026-10-20
    // Trade 1: 2026-10-09 23:59:00 IST (UTC 2026-10-09 18:29:00Z) -> BEFORE startDate -> EXCLUDED
    // Trade 2: 2026-10-10 00:05:00 IST (UTC 2026-10-09 18:35:00Z) -> START boundary -> INCLUDED (WIN, +5000)
    // Trade 3: 2026-10-15 12:00:00 IST (UTC 2026-10-15 06:30:00Z) -> MID-RANGE -> INCLUDED (WIN, +3000)
    // Trade 4: 2026-10-20 23:59:00 IST (UTC 2026-10-20 18:29:00Z) -> END boundary -> INCLUDED (LOSS, -2000)
    // Trade 5: 2026-10-21 00:05:00 IST (UTC 2026-10-20 18:35:00Z) -> AFTER endDate -> EXCLUDED
    const testTrades = [
      {
        userId,
        accountId,
        symbol: 'NIFTY26OCT24000CE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-09T23:59:00+05:30'),
        entryTime: new Date('2026-10-09T23:59:00+05:30'),
        executionMode: 'SIMPLE',
        calculated: { netPnL: 1000, grossPnL: 1050, totalCosts: 50, outcome: 'WIN' },
      },
      {
        userId,
        accountId,
        symbol: 'NIFTY26OCT24100CE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-10T00:05:00+05:30'),
        entryTime: new Date('2026-10-10T00:05:00+05:30'),
        executionMode: 'SIMPLE',
        calculated: { netPnL: 5000, grossPnL: 5100, totalCosts: 100, outcome: 'WIN' },
      },
      {
        userId,
        accountId,
        symbol: 'NIFTY26OCT24200CE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-15T12:00:00+05:30'),
        entryTime: new Date('2026-10-15T12:00:00+05:30'),
        executionMode: 'SIMPLE',
        calculated: { netPnL: 3000, grossPnL: 3050, totalCosts: 50, outcome: 'WIN' },
      },
      {
        userId,
        accountId,
        symbol: 'NIFTY26OCT24300PE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'SHORT',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-20T23:59:00+05:30'),
        entryTime: new Date('2026-10-20T23:59:00+05:30'),
        executionMode: 'SIMPLE',
        calculated: { netPnL: -2000, grossPnL: -1950, totalCosts: 50, outcome: 'LOSS' },
      },
      {
        userId,
        accountId,
        symbol: 'NIFTY26OCT24400PE',
        assetClass: 'EQUITY',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        currency: 'INR',
        direction: 'SHORT',
        status: 'CLOSED',
        tradeDate: new Date('2026-10-21T00:05:00+05:30'),
        entryTime: new Date('2026-10-21T00:05:00+05:30'),
        executionMode: 'SIMPLE',
        calculated: { netPnL: 4000, grossPnL: 4050, totalCosts: 50, outcome: 'WIN' },
      },
    ];

    await Trade.insertMany(testTrades);
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  describe('Validation: startDate > endDate or invalid format returns 400 VALIDATION_ERROR', () => {
    it('GET /api/v1/trades rejects invalid range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?startDate=2026-10-25&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/dashboard/stats rejects invalid range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?startDate=2026-10-25&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/analytics/psychology rejects invalid range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/psychology?startDate=2026-10-25&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/analytics/excursion rejects invalid range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/excursion?startDate=2026-10-25&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/export/csv rejects invalid range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/csv?startDate=2026-10-25&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/trades/drilldown rejects invalid range', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: authCookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            label: 'Invalid Range Drill',
            filter: { startDate: '2026-10-25', endDate: '2026-10-20' },
          },
        },
      });
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Inclusive IST Boundaries: Exact Session Range Filtering', () => {
    it('GET /api/v1/trades filters strictly by inclusive IST boundaries', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?startDate=2026-10-10&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);

      // Exactly Trades 2, 3, 4 must be returned (3 trades total)
      expect(json.pagination.totalCount).toBe(3);
      const symbols = json.data.map((t: any) => t.symbol);
      expect(symbols).toContain('NIFTY26OCT24100CE'); // 2026-10-10 00:05 IST
      expect(symbols).toContain('NIFTY26OCT24200CE'); // 2026-10-15 12:00 IST
      expect(symbols).toContain('NIFTY26OCT24300PE'); // 2026-10-20 23:59 IST
      expect(symbols).not.toContain('NIFTY26OCT24000CE'); // 2026-10-09 23:59 IST (Excluded)
      expect(symbols).not.toContain('NIFTY26OCT24400PE'); // 2026-10-21 00:05 IST (Excluded)
    });

    it('GET /api/v1/dashboard/stats computes metrics strictly on trades inside the range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?startDate=2026-10-10&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);

      // In range: +5000 (WIN), +3000 (WIN), -2000 (LOSS)
      // Net PnL = 5000 + 3000 - 2000 = 6000
      // Total count = 3
      // Win count = 2, Loss count = 1 -> Win rate = 66.67%
      expect(json.data.closedTradesCount).toBe(3);
      expect(json.data.netPnL).toBe(6000);
      expect(json.data.winningTradesCount).toBe(2);
      expect(json.data.losingTradesCount).toBe(1);
      expect(json.data.winRate).toBe(66.67);
    });

    it('POST /api/v1/trades/drilldown FILTER descriptor reconciles perfectly with dashboard stats', async () => {
      const statsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats?startDate=2026-10-10&endDate=2026-10-20',
        headers: { cookie: authCookie },
      });
      const stats = JSON.parse(statsRes.body).data;

      const drillRes = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: authCookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            label: 'Reconciliation Check',
            filter: { startDate: '2026-10-10', endDate: '2026-10-20' },
          },
        },
      });
      expect(drillRes.statusCode).toBe(200);
      const drill = JSON.parse(drillRes.body).data;

      // Assert parity between drilldown aggregates and dashboard stats
      expect(drill.totalCount).toBe(stats.closedTradesCount);
      expect(drill.aggregate.netPnL).toBe(stats.netPnL);
      expect(drill.aggregate.winRate).toBe(stats.winRate);
    });

    it('preserves strict tenant isolation', async () => {
      const otherRes = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?startDate=2026-10-10&endDate=2026-10-20',
        headers: { cookie: otherAuthCookie },
      });
      expect(otherRes.statusCode).toBe(200);
      const json = JSON.parse(otherRes.body);
      expect(json.pagination.totalCount).toBe(0);
      expect(json.data).toHaveLength(0);
    });
  });
});
