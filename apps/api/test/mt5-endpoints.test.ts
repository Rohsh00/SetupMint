import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { TradingAccount, Trade, User } from '../src/db/models/index.js';

describe('MT5 Endpoints: Fetch History, Status, and Import Trades', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register ephemeral test user
    const testEmail = `mt5_endpoint_test_${Date.now()}@test.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: 'Password@123',
        name: 'MT5 Tester',
        baseCurrency: 'USD',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    userId = body.data.user.id;

    const cookies = res.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    // Create active Elefin MT5 trading account
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Elefin Test Live',
      broker: 'Elefin',
      accountType: 'FOREX',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('500.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('500.00'),
      status: 'ACTIVE',
      profile: {
        executionAdapterKey: 'ELEFIN_MT5',
        positionModel: 'HEDGING',
      },
    });
    accountId = acc._id.toString();
  });

  afterAll(async () => {
    if (userId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await User.deleteOne({ _id: new mongoose.Types.ObjectId(userId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('queues a FETCH_HISTORY command and returns status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/mt5-fetch-history`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.queued).toBe(true);
    expect(body.data.commandId).toBeDefined();

    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/mt5-status`,
      headers: { cookie: authCookie },
    });

    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.success).toBe(true);
  });

  it('imports MT5 trade report via 1-click text paste and recalculates balance', async () => {
    const rawReport = `
Time	Position	Symbol	Type	Volume	Price	S / L	T / P	Time	Price	Commission	Swap	Profit
2026.11.11 08:30:15	990011	XAUUSD	buy	0.01	4118.18	4116.40	0.00	2026.11.11 09:03:42	4134.40	0.00	0.00	16.22
2026.11.11 09:27:54	990012	XAUUSD	sell	0.01	4125.50	4128.00	0.00	2026.11.11 09:50:46	4120.22	0.00	0.00	5.28
    `;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/mt5-import-trades`,
      headers: { cookie: authCookie },
      payload: {
        rawText: rawReport,
        defaultRiskReward: 2,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.totalProcessed).toBe(2);
    expect(body.insertedCount).toBe(2);

    // Verify trades in DB
    const savedTrades = await Trade.find({ userId: new mongoose.Types.ObjectId(userId) });
    expect(savedTrades.length).toBe(2);
    expect(savedTrades[0].status).toBe('CLOSED');
    expect(savedTrades[0].calculated?.netPnL).toBe(16.22);
    expect(savedTrades[1].calculated?.netPnL).toBe(5.28);

    // Verify balance updated: 500 + 16.22 + 5.28 = 521.50
    const updatedAccount = await TradingAccount.findById(accountId);
    expect(Number(updatedAccount?.currentBalance?.toString())).toBeCloseTo(521.5, 2);
  });
});

