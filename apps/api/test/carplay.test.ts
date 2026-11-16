import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { User, Trade, TradingAccount } from '../src/db/models/index.js';

describe('In-Car & Apple CarPlay Siri Voice Routes', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let carPlayToken: string;
  let accountId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register ephemeral test user
    const email = `carplay_qa_${Date.now()}@test.local`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'Password123!',
        name: 'CarPlay QA Trader',
        baseCurrency: 'USD',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.body);
    userId = body.data.user.id;
    const cookies = regRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    // Create an active trading account
    const acc = await TradingAccount.create({
      userId,
      name: 'Elefin Prop Account',
      broker: 'ELEFIN',
      accountType: 'PROP_FIRM',
      baseCurrency: 'USD',
      status: 'ACTIVE',
      startingBalance: 100000,
      currentBalance: 100000,
    });
    accountId = acc._id.toString();
  });

  afterAll(async () => {
    // Clean up test data
    if (userId) {
      await User.deleteOne({ _id: userId });
      await TradingAccount.deleteMany({ userId });
      await Trade.deleteMany({ userId });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('1. GET /api/v1/carplay/setup returns carPlayToken and voice endpoints', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/carplay/setup',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.success).toBe(true);
    expect(typeof data.carPlayToken).toBe('string');
    expect(data.carPlayToken.length).toBeGreaterThan(10);
    expect(data.endpoints.goldPriceVoice).toContain(data.carPlayToken);
    expect(Array.isArray(data.instructions)).toBe(true);
    carPlayToken = data.carPlayToken;
  });

  it('2. GET /api/v1/carplay/price rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/carplay/price?symbol=XAUUSD',
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Authentication failed');
  });

  it('3. GET /api/v1/carplay/price returns natural speech text for Gold (XAUUSD)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/price?symbol=XAUUSD&key=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('Gold is currently trading at');
  });

  it('4. GET /api/v1/carplay/trades reports 0 positions when idle', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/trades?key=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('zero open positions');
    expect(res.body).toContain('100 percent safe');
  });

  it('5. GET /api/v1/carplay/trades reports detailed position telemetry when trade is open', async () => {
    // Open a test trade
    const trade = await Trade.create({
      userId,
      accountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      exchange: 'FOREX',
      assetClass: 'COMMODITY',
      marketSegment: 'FOREX',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      entryPrice: 2730.0,
      quantity: 0.20,
      contractMultiplier: 1,
      tradingSession: 'NEW_YORK',
      simpleExecution: {
        entryPrice: 2730.0,
        quantity: 0.20,
      },
      risk: {
        initialStopLoss: 2725.0,
        currentStopLoss: 2725.0,
        plannedRiskAmount: 100,
      },
      tags: ['ELEFIN', 'MT5'],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/trades?key=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('one open position in Gold');
    expect(res.body).toContain('LONG of 0.2');

    // Test in-car breakeven action
    const actionRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=BE&key=${carPlayToken}`,
    });

    expect(actionRes.statusCode).toBe(200);
    expect(actionRes.body).toContain('Stop loss locked at true breakeven');

    // Verify trade SL was updated to true breakeven
    const updatedTrade = await Trade.findById(trade._id);
    expect(updatedTrade?.risk?.currentStopLoss).toBeGreaterThanOrEqual(2730.0);
  });
});
