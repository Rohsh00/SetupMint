import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount, TradeCandleSnapshot } from '../src/db/models/index.js';

describe('What-If Stop/Target API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `whatif-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'WhatIf User A',
      },
    });
    authCookie = regResA.headers['set-cookie'] as string;
    const meResA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meResA.json().data.user.id;

    // Register User B (for tenant isolation)
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `whatif-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'WhatIf User B',
      },
    });
    userBAuthCookie = regResB.headers['set-cookie'] as string;
    const meResB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meResB.json().data.user.id;

    // Create Account for User A
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      broker: 'ZERODHA',
      name: 'WhatIf Main Account',
      balance: 100000,
      currency: 'INR',
    });
    accountId = acc._id.toString();
  });

  afterAll(async () => {
    if (userId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradeCandleSnapshot.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
    if (userBId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await TradeCandleSnapshot.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('1. requires authentication (returns 401 without cookie)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/what-if',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('2. validates request parameters (rejects grid with > 100 cells)', async () => {
    const largeGrid = Array.from({ length: 15 }, (_, i) => i * 0.25 + 0.5);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/what-if',
      headers: { cookie: authCookie },
      payload: {
        stopRGrid: largeGrid, // 15
        targetRGrid: largeGrid, // 15 -> 15 * 15 = 225 > 100
      },
    });

    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('3. returns valid empty response when no trades match filter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/what-if',
      headers: { cookie: authCookie },
      payload: {
        filters: {
          symbol: 'NONEXISTENT',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.scope.tradesInScope).toBe(0);
    expect(json.data.scope.nEligible).toBe(0);
    expect(json.data.baseline.nEligible).toBe(0);
    expect(Array.isArray(json.data.cells)).toBe(true);
  });

  it('4. executes simulation with real trade and snapshot and enforces tenant isolation', async () => {
    const entryDate = new Date('2026-10-20T09:30:00.000Z');
    const exitDate = new Date('2026-10-20T09:34:00.000Z');
    const entryEpoch = Math.floor(entryDate.getTime() / 1000);

    // Create a closed trade for User A
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'TCS',
      direction: 'LONG',
      status: 'CLOSED',
      executionMode: 'SIMPLE',
      assetClass: 'EQUITY',
      marketSegment: 'NSE_EQ',
      exchange: 'NSE',
      tradeDate: entryDate,
      entryTime: entryDate,
      exitTime: exitDate,
      simpleExecution: {
        entryPrice: 3500,
        exitPrice: 3550,
        quantity: 10,
        contractMultiplier: 1,
        brokerage: 20,
        exchangeFees: 5,
        regulatoryFees: 2,
        taxes: 3,
        otherFees: 0,
      },
      risk: {
        initialStopLoss: 3450, // 50 pts unit risk
        plannedTarget: 3600,
        riskBudgetAmount: 500,
      },
      calculated: {
        averageEntryPrice: 3500,
        averageExitPrice: 3550,
        closedQuantity: 10,
        netPnL: 470,
        grossPnL: 500,
        totalCosts: 30,
        realizedRMultiple: 0.94,
        outcome: 'WIN',
      },
    });

    // Create 1m candle snapshot for trade
    await TradeCandleSnapshot.create({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: trade._id,
      symbol: 'TCS',
      resolution: '1',
      candles: [
        { t: entryEpoch, o: 3500, h: 3520, l: 3495, c: 3515, v: 1000 },
        { t: entryEpoch + 60, o: 3515, h: 3560, l: 3510, c: 3550, v: 1200 },
        { t: entryEpoch + 120, o: 3550, h: 3555, l: 3530, c: 3540, v: 900 },
        { t: entryEpoch + 180, o: 3540, h: 3555, l: 3535, c: 3550, v: 800 },
      ],
      fetchedAt: new Date(),
    });

    // User A executes simulation
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/what-if',
      headers: { cookie: authCookie },
      payload: {
        stopRGrid: [1.0, 1.5],
        targetRGrid: [1.0, 2.0],
      },
    });

    expect(resA.statusCode).toBe(200);
    const jsonA = resA.json();
    expect(jsonA.success).toBe(true);
    expect(jsonA.data.scope.tradesInScope).toBe(1);
    expect(jsonA.data.scope.nEligible).toBe(1);
    expect(jsonA.data.cells.length).toBe(4); // 2 x 2 = 4
    expect(jsonA.data.baseline.nEligible).toBe(1);

    // Tenant Isolation Check: User B executes simulation and sees 0 trades
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/what-if',
      headers: { cookie: userBAuthCookie },
      payload: {
        stopRGrid: [1.0, 1.5],
        targetRGrid: [1.0, 2.0],
      },
    });

    expect(resB.statusCode).toBe(200);
    const jsonB = resB.json();
    expect(jsonB.success).toBe(true);
    expect(jsonB.data.scope.tradesInScope).toBe(0);
    expect(jsonB.data.scope.nEligible).toBe(0);
  });
});
