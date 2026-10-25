import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  Trade,
  TradingAccount,
  TradeCandleSnapshot,
  Strategy,
} from '../src/db/models/index.js';

describe('Interactive TradingView Candles API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;
  let tradeAId: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `interactive-user-a-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Interactive User A',
      },
    });
    authCookie = resA.headers['set-cookie'] as string;
    const meA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meA.json().data.user.id;

    // Register User B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `interactive-user-b-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Interactive User B',
      },
    });
    userBAuthCookie = resB.headers['set-cookie'] as string;
    const meB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meB.json().data.user.id;

    // Create Trading Account
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Interactive Test Account',
      accountNumber: 'ACC-INTERACTIVE',
      broker: 'FYERS',
      currency: 'INR',
      initialBalance: 500000,
      currentBalance: 500000,
    });
    accountId = acc._id.toString();

    // Create a Strategy
    const strat = await Strategy.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'SWEEP TO FILL',
      description: 'Liquidity sweep playbook',
      category: 'PRICE_ACTION',
      instruments: ['NIFTY', 'BANKNIFTY'],
      timeframes: ['5m'],
      isSystemPreset: true,
      variants: [
        {
          key: 'W-SWEEP',
          name: 'W-Shape Swept Variant',
          description: 'Bullish sweep',
        },
      ],
    });

    // Create a Closed Trade
    const entryDate = new Date('2026-10-23T04:00:00.000Z'); // 09:30 IST
    const exitDate = new Date('2026-10-23T04:45:00.000Z'); // 10:15 IST

    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: acc._id,
      symbol: 'NSE:NIFTY50-INDEX',
      instrumentName: 'NIFTY 50 Index',
      assetClass: 'INDEX',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      direction: 'LONG',
      status: 'CLOSED',
      strategyId: strat._id,
      strategyName: strat.name,
      tags: ['interactive', 'tradingview'],
      tradeDate: entryDate,
      timeZone: 'Asia/Kolkata',
      entryTime: entryDate,
      exitTime: exitDate,
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 24500,
        exitPrice: 24650,
        quantity: 50,
        contractMultiplier: 1,
        brokerage: 20,
        exchangeFees: 5,
        regulatoryFees: 2,
        taxes: 10,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      risk: {
        plannedEntryPrice: 24500,
        initialStopLoss: 24450,
        plannedTarget: 24700,
        actualQuantity: 50,
        riskBudgetAmount: 2500,
        realizedRMultiple: 3.0,
        riskRuleViolations: [],
      },
      calculated: {
        grossPnL: 7500,
        totalCosts: 37,
        netPnL: 7463,
        realizedRMultiple: 3.0,
        closedQuantity: 50,
        outcome: 'WIN',
      },
      setup: {
        variantKey: 'W-SWEEP',
        variantStatus: 'CLASSIFIED',
      },
    });
    tradeAId = trade._id.toString();

    // Create 5m candle snapshots around execution
    const baseEpoch = Math.floor(new Date('2026-10-23T03:45:00.000Z').getTime() / 1000);
    const mockCandles = Array.from({ length: 30 }, (_, i) => {
      const t = baseEpoch + i * 300; // 5 min interval
      const open = 24480 + i * 5;
      const high = open + 15;
      const low = open - 10;
      const close = open + 8;
      const volume = 12000 + i * 500;
      return { t, o: open, h: high, l: low, c: close, v: volume };
    });

    await TradeCandleSnapshot.create({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: trade._id,
      symbol: 'NSE:NIFTY50-INDEX',
      resolution: '5',
      candles: mockCandles,
      provider: 'FYERS',
      isUnderlyingFallback: false,
      fetchedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (userId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradeCandleSnapshot.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await Strategy.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('1. Returns 404 for non-existent trade', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${fakeId}/interactive-candles`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TRADE_NOT_FOUND');
  });

  it('2. Enforces tenant isolation: User B cannot access User A trade candles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeAId}/interactive-candles`,
      headers: { cookie: userBAuthCookie },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TRADE_NOT_FOUND');
  });

  it('3. Successfully retrieves interactive candles with TradingView formatting and trade execution metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeAId}/interactive-candles?resolution=5`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const { trade, candles, resolution, provider } = body.data;
    expect(resolution).toBe('5');
    expect(provider).toBe('FYERS');
    expect(candles.length).toBeGreaterThan(0);

    // Verify TradingView candle schema
    const firstCandle = candles[0];
    expect(typeof firstCandle.time).toBe('number');
    expect(firstCandle.time).toBeLessThan(2e9); // UTC epoch in seconds
    expect(typeof firstCandle.open).toBe('number');
    expect(typeof firstCandle.high).toBe('number');
    expect(typeof firstCandle.low).toBe('number');
    expect(typeof firstCandle.close).toBe('number');
    expect(typeof firstCandle.volume).toBe('number');

    // Verify trade metadata
    expect(trade.symbol).toBe('NSE:NIFTY50-INDEX');
    expect(trade.direction).toBe('LONG');
    expect(trade.entryPrice).toBe(24500);
    expect(trade.exitPrice).toBe(24650);
    expect(trade.stopLoss).toBe(24450);
    expect(trade.takeProfit).toBe(24700);
    expect(trade.pnl).toBe(7463);
    expect(trade.realizedRMultiple).toBe(3.0);
    expect(trade.strategyName).toBe('SWEEP TO FILL');
    expect(trade.setup?.variantKey).toBe('W-SWEEP');
  });

  it('4. Aggregates candles dynamically when a higher timeframe (e.g. 15m) is requested', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeAId}/interactive-candles?resolution=15`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.resolution).toBe('15');
    expect(body.data.candles.length).toBeGreaterThan(0);

    // 15m candles should be roughly 1/3 of the 5m count
    const res5m = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeAId}/interactive-candles?resolution=5`,
      headers: { cookie: authCookie },
    });
    expect(body.data.candles.length).toBeLessThan(res5m.json().data.candles.length);
  });
});
