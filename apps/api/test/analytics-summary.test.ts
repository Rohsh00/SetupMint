import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount, User } from '../src/db/models/index.js';

describe('Analytics Summary & Actionable Playbook API Integration Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;
  let accountAId: string;
  let createdTradeIds: string[] = [];
  let createdAccountIds: string[] = [];
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // 1. Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `summary-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Summary User A',
      },
    });
    userACookie = regResA.headers['set-cookie'] as string;
    const meResA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userACookie },
    });
    userAId = meResA.json().data.user.id;
    createdUserIds.push(userAId);

    // 2. Register User B (for tenant isolation verification)
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `summary-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Summary User B',
      },
    });
    userBCookie = regResB.headers['set-cookie'] as string;
    const meResB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBCookie },
    });
    userBId = meResB.json().data.user.id;
    createdUserIds.push(userBId);

    // 3. User A Trading Account
    const accA = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userAId),
      broker: 'ZERODHA',
      accountNumber: `ACC_SUMMARY_${Date.now()}`,
      name: 'User A Summary Account',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('105000.00'),
      baseCurrency: 'USD',
      status: 'ACTIVE',
      isDefault: true,
    });
    accountAId = accA._id.toString();
    createdAccountIds.push(accountAId);

    // 4. Seed Closed Trades for User A
    const t1 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      tradeNumber: 1,
      symbol: 'EURUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-10T10:00:00Z'),
      entryTime: new Date('2026-11-10T10:00:00Z'),
      exitTime: new Date('2026-11-10T11:00:00Z'),
      currency: 'USD',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      simpleExecution: { quantity: 1, entryPrice: 1.0500, exitPrice: 1.0550 },
      calculated: { netPnL: 500, grossPnL: 500, totalCosts: 0, realizedRMultiple: 2.0, outcome: 'WIN' },
      psychology: { rulesFollowed: true, disciplineScore: 5 },
    });
    createdTradeIds.push(t1._id.toString());

    const t2 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      tradeNumber: 2,
      symbol: 'EURUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-11T10:00:00Z'),
      entryTime: new Date('2026-11-11T10:00:00Z'),
      exitTime: new Date('2026-11-11T11:00:00Z'),
      currency: 'USD',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      simpleExecution: { quantity: 1, entryPrice: 1.0550, exitPrice: 1.0500 },
      calculated: { netPnL: -500, grossPnL: -500, totalCosts: 0, realizedRMultiple: -2.0, outcome: 'LOSS' },
      psychology: {
        rulesFollowed: false,
        disciplineScore: 1,
        stopLossMoved: true,
        mistakes: ['STOP_MOVED'],
      },
    });
    createdTradeIds.push(t2._id.toString());

    const t3 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      tradeNumber: 3,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-12T14:00:00Z'),
      entryTime: new Date('2026-11-12T14:00:00Z'),
      exitTime: new Date('2026-11-12T15:00:00Z'),
      currency: 'USD',
      assetClass: 'COMMODITY',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      simpleExecution: { quantity: 1, entryPrice: 2600, exitPrice: 2620 },
      calculated: { netPnL: 800, grossPnL: 800, totalCosts: 0, realizedRMultiple: 3.2, outcome: 'WIN' },
      psychology: { rulesFollowed: true, disciplineScore: 5 },
    });
    createdTradeIds.push(t3._id.toString());
  });

  afterAll(async () => {
    // Strictly isolate and clean up ONLY our ephemeral test records
    if (createdTradeIds.length > 0) {
      await Trade.deleteMany({ _id: { $in: createdTradeIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    if (createdAccountIds.length > 0) {
      await TradingAccount.deleteMany({ _id: { $in: createdAccountIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('1. Rejects unauthenticated request with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/summary',
    });
    expect(res.statusCode).toBe(401);
  });

  it('2. Returns empty safe defaults for User B with 0 trades', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: { cookie: userBCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.scorecard.totalClosedTrades).toBe(0);
    expect(body.data.scorecard.netPnL).toBe(0);
    expect(body.data.scorecard.hasSufficientData).toBe(false);
    expect(body.data.circuitBreakers).toBeDefined();
    expect(body.data.deskCheatSheet).toBeDefined();
  });

  it('3. Computes scorecard, preventable loss, and playbook for User A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/summary',
      headers: { cookie: userACookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const { scorecard, circuitBreakers, deskCheatSheet, availableSymbols } = body.data;
    expect(scorecard.totalClosedTrades).toBe(3);
    // Net PnL = 500 - 500 + 800 = 800
    expect(scorecard.netPnL).toBe(800);
    // Preventable loss is from trade 2 (STOP_MOVED loss = 500)
    expect(scorecard.totalPreventableLoss).toBe(500);
    expect(scorecard.currency).toBe('USD');

    expect(circuitBreakers.maxDailyLossR).toBeGreaterThan(0);
    expect(deskCheatSheet.preTradeChecklist.length).toBeGreaterThan(0);
    expect(availableSymbols).toContain('EURUSD');
    expect(availableSymbols).toContain('XAUUSD');
  });

  it('4. Filters summary correctly when symbol parameter is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/summary?symbol=XAUUSD',
      headers: { cookie: userACookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.selectedSymbol).toBe('XAUUSD');
    expect(body.data.scorecard.totalClosedTrades).toBe(1);
    expect(body.data.scorecard.netPnL).toBe(800);
  });
});
