import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount, Strategy } from '../src/db/models/index.js';

describe('Drilldown and Multi-Panel Equity Curves API Integration Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;
  let accountAId: string;
  let strategyAId: string;
  let tradeA1Id: string;
  let tradeA2Id: string;
  let tradeB1Id: string;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // 1. Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `drilldown-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Drilldown User A',
      },
    });
    userACookie = regResA.headers['set-cookie'] as string;
    const meResA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userACookie },
    });
    userAId = meResA.json().data.user.id;

    // 2. Register User B
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `drilldown-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Drilldown User B',
      },
    });
    userBCookie = regResB.headers['set-cookie'] as string;
    const meResB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBCookie },
    });
    userBId = meResB.json().data.user.id;

    // 3. User A Account & Strategy
    const accA = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userAId),
      broker: 'ZERODHA',
      accountNumber: 'ACC_A_001',
      name: 'User A Trading Account',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('104500.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });
    accountAId = accA._id.toString();

    const stratA = await Strategy.create({
      userId: new mongoose.Types.ObjectId(userAId),
      name: 'FVG Sweep',
      description: 'Fair Value Gap liquidity sweep',
      color: '#10B981',
      rules: { entryRules: ['Sweep FVG'] },
    });
    strategyAId = stratA._id.toString();

    // 4. Create Trades for User A
    // Trade A1: Winner on Monday 2026-05-04
    const tA1 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      strategyId: new mongoose.Types.ObjectId(strategyAId),
      symbol: 'NIFTY26MAY25000CE',
      underlying: 'NIFTY',
      assetClass: 'OPTIONS',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-05-04T04:00:00.000Z'), // Monday
      entryTime: new Date('2026-05-04T04:00:00.000Z'),
      exitTime: new Date('2026-05-04T04:30:00.000Z'),
      session: 'NSE_REGULAR',
      currency: 'INR',
      risk: {
        initialStopLoss: 100,
        plannedEntryPrice: 120,
        riskBudgetAmount: 2000,
      },
      calculated: {
        grossPnL: 5200,
        totalCosts: 200,
        netPnL: 5000,
        realizedRMultiple: 2.5,
        outcome: 'WIN',
        closedQuantity: 50,
        openQuantity: 0,
        averageEntryPrice: 120,
        averageExitPrice: 224,
      },
      psychology: {
        emotionalState: 'CALM',
        disciplineRating: 5,
        rulesFollowed: true,
      },
    });
    tradeA1Id = tA1._id.toString();

    // Trade A2: Loser on Tuesday 2026-05-05
    const tA2 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      strategyId: new mongoose.Types.ObjectId(strategyAId),
      symbol: 'BANKNIFTY26MAY50000PE',
      underlying: 'BANKNIFTY',
      assetClass: 'OPTIONS',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-05-05T04:00:00.000Z'), // Tuesday
      entryTime: new Date('2026-05-05T04:00:00.000Z'),
      exitTime: new Date('2026-05-05T04:45:00.000Z'),
      session: 'NSE_REGULAR',
      currency: 'INR',
      risk: {
        initialStopLoss: 200,
        plannedEntryPrice: 230,
        riskBudgetAmount: 2000,
      },
      calculated: {
        grossPnL: -1800,
        totalCosts: 200,
        netPnL: -2000,
        realizedRMultiple: -1.0,
        outcome: 'LOSS',
        closedQuantity: 15,
        openQuantity: 0,
        averageEntryPrice: 230,
        averageExitPrice: 110,
      },
      psychology: {
        emotionBefore: 'FOMO',
        emotionDuring: 'FOMO',
        emotionalState: 'FOMO',
        mistakes: ['CHASING_PRICE'],
        disciplineScore: 2,
        disciplineRating: 2,
        rulesFollowed: false,
      },
    });
    tradeA2Id = tA2._id.toString();

    // 5. Create Account and Trade for User B (Tenant Isolation verification)
    const accB = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userBId),
      broker: 'FYERS',
      accountNumber: 'ACC_B_001',
      name: 'User B Trading Account',
      initialBalance: mongoose.Types.Decimal128.fromString('50000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('57500.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });

    const tB1 = await Trade.create({
      userId: new mongoose.Types.ObjectId(userBId),
      accountId: accB._id,
      symbol: 'CRUDEOIL',
      underlying: 'CRUDEOIL',
      assetClass: 'COMMODITY',
      exchange: 'MCX',
      marketSegment: 'MCX',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-05-05T12:00:00.000Z'),
      entryTime: new Date('2026-05-05T12:00:00.000Z'),
      currency: 'INR',
      calculated: {
        grossPnL: 8000,
        totalCosts: 500,
        netPnL: 7500,
        outcome: 'WIN',
        closedQuantity: 100,
        openQuantity: 0,
        averageEntryPrice: 6000,
      },
    });


    tradeB1Id = tB1._id.toString();
  });

  afterAll(async () => {
    await Trade.deleteMany({ _id: { $in: [tradeA1Id, tradeA2Id, tradeB1Id] } });
    if (app) await app.close();
    await disconnectDatabase();
  });

  // --------------------------------------------------------------------------
  // GET /api/v1/dashboard/equity-curves Tests
  // --------------------------------------------------------------------------
  describe('GET /api/v1/dashboard/equity-curves', () => {
    it('1. Rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves',
      });
      expect(res.statusCode).toBe(401);
    });

    it('2. Enforces tenant isolation: User B does not receive User A trades', async () => {
      const resB = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves',
        headers: { cookie: userBCookie },
      });
      expect(resB.statusCode).toBe(200);
      const json = resB.json();
      expect(json.success).toBe(true);
      // User B only has 1 trade (CRUDEOIL)
      const symbols = json.data.moneyCurve.map((p: any) => p.symbol).filter(Boolean);
      expect(symbols).not.toContain('NIFTY26MAY25000CE');
      expect(symbols).toContain('CRUDEOIL');
    });

    it('3. Returns complete multi-panel payload with money, R, drawdown, overlays, cone, and markers', async () => {
      const resA = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/equity-curves',
        headers: { cookie: userACookie },
      });
      expect(resA.statusCode).toBe(200);
      const data = resA.json().data;

      // Money Curve
      expect(data.moneyCurve).toBeDefined();
      expect(data.moneyCurve.length).toBeGreaterThanOrEqual(2);

      // Cumulative-R Curve
      expect(data.cumulativeRCurve).toBeDefined();
      expect(data.cumulativeRCurve.eligibleTrades).toBe(2);
      expect(data.cumulativeRCurve.coveragePercent).toBe(100);

      // Recovery Stats
      expect(data.recoveryStats).toBeDefined();
      expect(typeof data.recoveryStats.maxDrawdown).toBe('number');

      // Strategy Overlays
      expect(data.strategyOverlays).toBeDefined();
      expect(data.strategyOverlays.length).toBeGreaterThan(0);
      expect(data.strategyOverlays[0].strategyName).toBe('FVG Sweep');

      // Monte Carlo Expectancy Cone
      expect(data.monteCarloCone).toBeDefined();
      expect(data.monteCarloCone.length).toBe(101); // 0..100
      expect(data.coneMeta.sampleSize).toBe(2);
      expect(data.coneMeta.isLowSample).toBe(true);
      expect(data.coneMeta.warning).toBeDefined();

      // Event Markers
      expect(data.eventMarkers).toBeDefined();
      expect(Array.isArray(data.eventMarkers.breachDays)).toBe(true);
      expect(Array.isArray(data.eventMarkers.tiltDays)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/v1/trades/drilldown Tests
  // --------------------------------------------------------------------------
  describe('POST /api/v1/trades/drilldown', () => {
    it('1. Rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        payload: {
          descriptor: { kind: 'TRADE', tradeId: tradeA1Id },
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('2. Kind TRADE: returns single trade and reconciled aggregate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: { kind: 'TRADE', tradeId: tradeA1Id },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.trades).toHaveLength(1);
      expect(json.data.trades[0].id).toBe(tradeA1Id);
      expect(json.data.totalCount).toBe(1);

      // Reconciled aggregate
      expect(json.data.aggregate.netPnL).toBe(5000);
      expect(json.data.aggregate.winRate).toBe(100);
      expect(json.data.aggregate.avgR).toBe(2.5);
    });

    it('3. Tenant isolation: User B querying User A tradeId receives empty results (no leak)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userBCookie },
        payload: {
          descriptor: { kind: 'TRADE', tradeId: tradeA1Id },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.trades).toHaveLength(0);
      expect(json.data.totalCount).toBe(0);
      expect(json.data.aggregate.netPnL).toBe(0);
    });

    it('4. Kind TRADES: resolves fixed list of IDs, dropping other user IDs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: { kind: 'TRADES', tradeIds: [tradeA1Id, tradeA2Id, tradeB1Id] },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      // tradeB1Id belongs to User B, so User A only gets A1 and A2
      expect(json.data.trades).toHaveLength(2);
      expect(json.data.totalCount).toBe(2);
      // Net PnL = 5000 - 2000 = 3000
      expect(json.data.aggregate.netPnL).toBe(3000);
      expect(json.data.aggregate.winRate).toBe(50);
      // avgR = (2.5 - 1.0) / 2 = 0.75
      expect(json.data.aggregate.avgR).toBe(0.75);
    });

    it('5. Kind FILTER: filters by outcome WIN with exact reconciliation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            filter: { outcome: 'WIN' },
            label: 'Winning Trades',
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.trades).toHaveLength(1);
      expect(json.data.trades[0].id).toBe(tradeA1Id);
      expect(json.data.aggregate.netPnL).toBe(5000);
      expect(json.data.aggregate.winRate).toBe(100);
    });

    it('6. Kind FILTER: filters by weekday Monday', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            filter: { weekday: 'Monday' },
            label: 'Monday Trades',
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.trades).toHaveLength(1);
      expect(json.data.trades[0].id).toBe(tradeA1Id);
    });

    it('7. Kind FILTER: filters by emotion and mistake', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades/drilldown',
        headers: { cookie: userACookie },
        payload: {
          descriptor: {
            kind: 'FILTER',
            filter: { emotion: 'FOMO', mistakeTag: 'CHASING_PRICE' },
            label: 'FOMO Mistake Trades',
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.trades).toHaveLength(1);
      expect(json.data.trades[0].id).toBe(tradeA2Id);
      expect(json.data.aggregate.netPnL).toBe(-2000);
    });
  });
});
