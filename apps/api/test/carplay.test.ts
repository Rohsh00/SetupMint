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

  it('6. GET /api/v1/carplay/action?action=CLOSE_50 books 50% partial on active trade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=CLOSE_50&token=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Booked 50 percent profit on Gold');
    expect(res.body).toContain('Closed 0.1 lots');
  });

  it('7. GET /api/v1/carplay/action?action=PANIC flattens open positions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=PANIC&token=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Emergency killswitch executed');
  });

  it('8. GET /api/v1/carplay/action?action=PANIC when idle reports account safe', async () => {
    // Delete remaining trades to simulate 0 open trades
    await Trade.deleteMany({ userId });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=PANIC&token=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('no open positions to close');
    expect(res.body).toContain('already safe');
  });

  it('9. GET /api/v1/carplay/action for BE & CLOSE_50 when idle reports no active trade found', async () => {
    const beRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=BE&token=${carPlayToken}`,
    });
    expect(beRes.statusCode).toBe(200);
    expect(beRes.body).toContain('No active open position found');

    const halfRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=CLOSE_50&token=${carPlayToken}`,
    });
    expect(halfRes.statusCode).toBe(200);
    expect(halfRes.body).toContain('No active open position found');
  });

  it('10. GET /api/v1/carplay/action with invalid action code returns helpful voice guidance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=FLY_TO_MOON&token=${carPlayToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Unknown action command');
    expect(res.body).toContain('Lock Breakeven');
  });

  it('11. POST /api/v1/carplay/action supports JSON body payload and format=json', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/carplay/action',
      headers: { 'x-carplay-token': carPlayToken },
      payload: {
        action: 'PANIC',
        format: 'json',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.success).toBe(true);
    expect(data.speechText).toContain('no open positions to close');
  });

  it('12. GET /api/v1/carplay/active-symbols returns NONE when idle and choices with format=json', async () => {
    const textRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/active-symbols?token=${carPlayToken}`,
    });
    expect(textRes.statusCode).toBe(200);
    expect(textRes.body).toBe('NONE');

    const jsonRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/active-symbols?token=${carPlayToken}&format=json`,
    });
    expect(jsonRes.statusCode).toBe(200);
    const data = JSON.parse(jsonRes.body);
    expect(data.count).toBe(0);
    expect(data.choices.length).toBe(0);
  });

  it('13. Multi-position interactive selection and symbol=ALL action execution', async () => {
    // Open 2 active trades: Gold (Elefin/MT5) and Crude Oil (FYERS)
    const goldTrade = await Trade.create({
      userId,
      accountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      exchange: 'FOREX',
      assetClass: 'COMMODITY',
      marketSegment: 'FOREX',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      entryPrice: 2740.0,
      quantity: 0.20,
      contractMultiplier: 1,
      tradingSession: 'NEW_YORK',
      simpleExecution: { entryPrice: 2740.0, quantity: 0.20 },
      risk: { initialStopLoss: 2730.0, currentStopLoss: 2730.0 },
      tags: ['ELEFIN', 'MT5'],
    });

    const crudeTrade = await Trade.create({
      userId,
      accountId,
      symbol: 'CRUDEOILMINI',
      direction: 'LONG',
      exchange: 'MCX',
      assetClass: 'COMMODITY',
      marketSegment: 'MCX',
      currency: 'INR',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      entryPrice: 8150.0,
      quantity: 10,
      contractMultiplier: 10,
      tradingSession: 'NEW_YORK',
      simpleExecution: { entryPrice: 8150.0, quantity: 10 },
      risk: { initialStopLoss: 8100.0, currentStopLoss: 8100.0 },
    });

    // 1. Check active symbols returns newline separated list including 'All Positions'
    const symbolsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/active-symbols?token=${carPlayToken}`,
    });
    expect(symbolsRes.statusCode).toBe(200);
    expect(symbolsRes.body).toContain('Gold');
    expect(symbolsRes.body).toContain('Crude Oil Mini');
    expect(symbolsRes.body).toContain('All Positions');

    // 2. Lock Breakeven on ALL positions
    const beAllRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=BE&symbol=ALL&token=${carPlayToken}`,
    });
    expect(beAllRes.statusCode).toBe(200);
    expect(beAllRes.body).toContain('locked at true breakeven for all 2 positions');

    // Verify both trades updated
    const updatedGold = await Trade.findById(goldTrade._id);
    const updatedCrude = await Trade.findById(crudeTrade._id);
    expect(updatedGold?.risk?.currentStopLoss).toBeGreaterThanOrEqual(2740.0);
    expect(updatedCrude?.risk?.currentStopLoss).toBeGreaterThanOrEqual(8150.0);

    // 3. Book 50% Profit on ALL positions
    const halfAllRes = await app.inject({
      method: 'GET',
      url: `/api/v1/carplay/action?action=CLOSE_50&symbol=ALL&token=${carPlayToken}`,
    });
    expect(halfAllRes.statusCode).toBe(200);
    expect(halfAllRes.body).toContain('Booked 50 percent profit across all 2 positions');
  });
});
