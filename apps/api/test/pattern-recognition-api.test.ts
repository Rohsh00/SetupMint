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

describe('Auto-Classification API Integration Tests (4H Trend + 5M Setup)', () => {
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
        email: `pattern-user-a-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Pattern User A',
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
        email: `pattern-user-b-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Pattern User B',
      },
    });
    userBAuthCookie = resB.headers['set-cookie'] as string;
    const meB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meB.json().data.user.id;

    // Create Trading Account for User A
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Fyers',
      broker: 'FYERS',
      accountNumber: 'APITest123',
      initialBalance: mongoose.Types.Decimal128.fromString('500000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('500000.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });
    accountId = String(acc._id);

    // Create 4 main strategies for User A
    await Strategy.create([
      {
        userId: new mongoose.Types.ObjectId(userId),
        name: 'Bullish HTF Retracement — LTF Liquidity Sweep & Confirmation',
        isActive: true,
        tags: ['Retracement', 'Bullish'],
        variants: [
          { key: 'BULL-SSL-EQL', name: 'Equal Lows Liquidity Sweep', expected: { direction: 'LONG', patternType: 'EQUAL_LOWS' } },
          { key: 'BULL-SSL-W-SWEEP', name: 'W Pattern — Second-Leg Sweep', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'SWEPT' } },
          { key: 'BULL-W-UNSWEPT', name: 'W Pattern — Unswept Higher Low', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'UNSWEPT' } },
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(userId),
        name: 'Bullish HTF Reversal — LTF Liquidity Sweep & Confirmation',
        isActive: true,
        tags: ['Reversal', 'Bullish'],
        variants: [
          { key: 'BULL-REV-SSL-EQL', name: 'Bullish Reversal — Equal Lows', expected: { direction: 'LONG', patternType: 'EQUAL_LOWS' } },
          { key: 'BULL-REV-SSL-W-SWEEP', name: 'Bullish Reversal — W Sweep', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'SWEPT' } },
          { key: 'BULL-REV-W-UNSWEPT', name: 'Bullish Reversal — W Unswept', expected: { direction: 'LONG', patternType: 'W', secondLegStatus: 'UNSWEPT' } },
        ],
      },
    ]);

    // Create test trade for User A
    const entryTime = new Date('2026-10-20T10:00:00.000Z');
    const exitTime = new Date('2026-10-20T10:30:00.000Z');

    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'CRUDEOILM26OCTFUT',
      underlying: 'CRUDEOIL',
      assetClass: 'COMMODITY',
      exchange: 'MCX',
      marketSegment: 'MCX',
      direction: 'LONG',
      status: 'CLOSED',
      currency: 'INR',
      tradeDate: new Date('2026-10-20T00:00:00.000Z'),
      entryTime,
      exitTime,
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 6000,
        exitPrice: 6050,
        quantity: 1,
        contractMultiplier: 10,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 5,
        taxes: 15,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      calculated: {
        grossPnL: 500,
        totalCosts: 70,
        netPnL: 430,
        outcome: 'WIN',
        closedQuantity: 1,
        openQuantity: 0,
        averageEntryPrice: 6000,
        averageExitPrice: 6050,
      },
    });
    tradeAId = String(trade._id);

    // Seed cached 5m candles (forming W-SWEEP)
    const baseMs = entryTime.getTime() - 2 * 3600 * 1000;
    const candles5m = [
      { t: Math.floor(baseMs / 1000), o: 6020, h: 6030, l: 5990, c: 6005, v: 100 },
      { t: Math.floor((baseMs + 300000) / 1000), o: 6005, h: 6040, l: 6000, c: 6035, v: 100 },
      { t: Math.floor((baseMs + 600000) / 1000), o: 6035, h: 6038, l: 5975, c: 5995, v: 100 }, // Sweeps 5990 down to 5975
      { t: Math.floor((baseMs + 900000) / 1000), o: 5995, h: 6025, l: 5990, c: 6020, v: 100 },
      { t: Math.floor((baseMs + 1200000) / 1000), o: 6020, h: 6060, l: 6010, c: 6050, v: 100 },
    ];

    await TradeCandleSnapshot.create({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: trade._id,
      resolution: '5',
      symbol: 'CRUDEOILM26OCTFUT',
      candles: candles5m,
      coverageFrom: new Date(baseMs),
      coverageTo: exitTime,
    });

    // Seed cached 4h candles (forming BULLISH trend)
    const base4hMs = entryTime.getTime() - 20 * 86400 * 1000;
    const candles4h: any[] = [];
    let p = 5800;
    for (let i = 0; i < 15; i++) {
      candles4h.push({
        t: Math.floor((base4hMs + i * 14400 * 1000) / 1000),
        o: p,
        h: p + 25,
        l: p - 10,
        c: p + 20,
        v: 500,
      });
      p += 15;
    }

    await TradeCandleSnapshot.create({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: trade._id,
      resolution: '240',
      symbol: 'CRUDEOILM26OCTFUT',
      candles: candles4h,
      coverageFrom: new Date(base4hMs),
      coverageTo: entryTime,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('1. Auto-classifies a single trade with 4H Trend and 5M Setup (POST /trades/:id/auto-classify)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeAId}/auto-classify`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.htfTrend).toBe('BULLISH');
    expect(body.data.pattern).toBe('W-SWEEP');
    expect(body.data.variantKey).toBe('BULL-SSL-W-SWEEP');
    expect(body.data.strategyName).toContain('Bullish HTF Retracement');

    // Verify DB update
    const updatedTrade = await Trade.findById(tradeAId);
    expect(updatedTrade?.setup?.variantKey).toBe('BULL-SSL-W-SWEEP');
    expect(updatedTrade?.setup?.variantStatus).toBe('CLASSIFIED');
    expect(updatedTrade?.setup?.htfBias).toBe('BULLISH');
    expect(updatedTrade?.auditLog.some((a) => a.action === 'AUTO_CLASSIFIED')).toBe(true);
  });

  it('2. Enforces cross-tenant isolation on auto-classification (User B cannot classify User A trade)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeAId}/auto-classify`,
      headers: { cookie: userBAuthCookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it('3. Auto-classifies a batch of trades (POST /trades/auto-classify-batch)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/auto-classify-batch',
      headers: { cookie: authCookie },
      payload: {
        tradeIds: [tradeAId],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.classified).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(body.data.results[0].variantKey).toBe('BULL-SSL-W-SWEEP');
  });
});
