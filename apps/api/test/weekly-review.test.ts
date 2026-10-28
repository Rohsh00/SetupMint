import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount, WeeklyReview, DailyJournal } from '../src/db/models/index.js';

describe('Weekly Review API Integration & Invariant Tests', () => {
  let app: FastifyInstance;
  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let userBId: string;
  let accountAId: string;

  const defaultTradeMeta = {
    assetClass: 'OPTIONS' as const,
    exchange: 'NSE',
    marketSegment: 'NSE_FNO' as const,
    currency: 'INR',
  };


  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // 1. Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `weekly-user-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Weekly User A',
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
        email: `weekly-user-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Weekly User B',
      },
    });
    userBCookie = regResB.headers['set-cookie'] as string;
    const meResB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBCookie },
    });
    userBId = meResB.json().data.user.id;

    // 3. Trading Account for User A
    const accA = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userAId),
      broker: 'FYERS',
      accountNumber: 'FY_WEEKLY_01',
      name: 'User A Weekly Account',
      initialBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });
    accountAId = accA._id.toString();

    // 4. Create trades for User A in 2026-W43 (Oct 19 to Oct 25, 2026)
    // Trade A1: Winner on Monday Oct 19

    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      symbol: 'NIFTY26OCT25000CE',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-19T09:30:00.000+05:30'),
      entryTime: new Date('2026-10-19T09:30:00.000+05:30'),
      exitTime: new Date('2026-10-19T10:15:00.000+05:30'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        quantity: 50,
        entryPrice: 100,
        exitPrice: 150,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 5,
        taxes: 20,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      calculated: {
        grossPnL: 2500,
        totalCosts: 75,
        netPnL: 2425,
        realizedRMultiple: 2.0,
        closedQuantity: 50,
        openQuantity: 0,
        averageEntryPrice: 100,
        averageExitPrice: 150,
        outcome: 'WIN',
      },
      psychology: {
        disciplineScore: 5,
        mistakes: [],
      },
    });

    // Trade A2: Loser on Tuesday Oct 20 with REVENGE_TRADING mistake
    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      symbol: 'BANKNIFTY26OCT50000PE',
      direction: 'SHORT',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-20T11:00:00.000+05:30'),
      entryTime: new Date('2026-10-20T11:00:00.000+05:30'),
      exitTime: new Date('2026-10-20T11:45:00.000+05:30'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        quantity: 30,
        entryPrice: 200,
        exitPrice: 240,
        contractMultiplier: 1,
        brokerage: 40,
        exchangeFees: 10,
        regulatoryFees: 5,
        taxes: 20,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      calculated: {
        grossPnL: -1200,
        totalCosts: 75,
        netPnL: -1275,
        realizedRMultiple: -1.0,
        closedQuantity: 30,
        openQuantity: 0,
        averageEntryPrice: 200,
        averageExitPrice: 240,
        outcome: 'LOSS',
      },
      psychology: {
        disciplineScore: 2,
        mistakes: ['REVENGE_TRADING'],
      },
    });

    // 5. IST Boundary Trades:
    // Sunday Oct 25 at 23:59:59.000+05:30 -> Belongs to 2026-W43
    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      symbol: 'BTCUSDT',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-25T23:59:59.000+05:30'),
      entryTime: new Date('2026-10-25T23:59:59.000+05:30'),
      exitTime: new Date('2026-10-26T00:15:00.000+05:30'),
      executionMode: 'SIMPLE',
      calculated: {
        grossPnL: 350,
        totalCosts: 20,
        netPnL: 330,
        realizedRMultiple: 1.0,
        closedQuantity: 1,
        openQuantity: 0,
        averageEntryPrice: 65000,
        averageExitPrice: 65350,
        outcome: 'WIN',
      },
    });

    // Monday Oct 26 at 00:00:01.000+05:30 -> Belongs to 2026-W44
    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      symbol: 'BTCUSDT',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-26T00:00:01.000+05:30'),
      entryTime: new Date('2026-10-26T00:00:01.000+05:30'),
      exitTime: new Date('2026-10-26T01:00:00.000+05:30'),
      executionMode: 'SIMPLE',
      calculated: {
        grossPnL: 500,
        totalCosts: 25,
        netPnL: 475,
        realizedRMultiple: 1.2,
        closedQuantity: 1,
        openQuantity: 0,
        averageEntryPrice: 66000,
        averageExitPrice: 66500,
        outcome: 'WIN',
      },
    });

    // 6. User B trade to test tenant isolation
    const accB = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userBId),
      broker: 'ZERODHA',
      accountNumber: 'ZR_USER_B',
      name: 'User B Account',
      initialBalance: mongoose.Types.Decimal128.fromString('50000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('50000.00'),
      baseCurrency: 'INR',
      status: 'ACTIVE',
    });

    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userBId),
      accountId: accB._id,
      symbol: 'CRUDEOIL',

      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-20T10:00:00.000+05:30'),
      entryTime: new Date('2026-10-20T10:00:00.000+05:30'),
      executionMode: 'SIMPLE',
      calculated: {
        grossPnL: 99999,
        totalCosts: 50,
        netPnL: 99949,
        outcome: 'WIN',
        closedQuantity: 100,
        openQuantity: 0,
        averageEntryPrice: 6000,
      },
    });
  });

  afterAll(async () => {
    if (userAId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
      await WeeklyReview.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
      await DailyJournal.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
    }
    if (userBId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await WeeklyReview.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await DailyJournal.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W43',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed week formats with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W99',
      headers: { cookie: userACookie },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('computes live snapshot reconciling exactly with /dashboard/stats and drilldown', async () => {
    const weeklyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W43',
      headers: { cookie: userACookie },
    });
    expect(weeklyRes.statusCode).toBe(200);
    const weeklyData = weeklyRes.json().data;

    // Compare with /dashboard/stats for the same date range: 2026-10-19 to 2026-10-25
    const statsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/stats?startDate=2026-10-19&endDate=2026-10-25',
      headers: { cookie: userACookie },
    });
    expect(statsRes.statusCode).toBe(200);
    const statsData = statsRes.json().data;

    // Compare with drilldown for all tradeIds in the snapshot
    const drillRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades/drilldown',
      headers: { cookie: userACookie },
      payload: {
        descriptor: {
          kind: 'TRADES',
          tradeIds: weeklyData.snapshot.weekSummary.tradeIds,
        },
      },
    });
    expect(drillRes.statusCode).toBe(200);
    const drillData = drillRes.json().data;

    // Invariants: netPnL, grossPnL, totalCosts, tradeCount, winRate must match
    expect(weeklyData.snapshot.weekSummary.tradeCount).toBe(statsData.closedTradesCount);
    expect(weeklyData.snapshot.weekSummary.netPnL).toBe(statsData.netPnL);
    expect(weeklyData.snapshot.weekSummary.grossPnL).toBe(statsData.grossPnL);
    expect(weeklyData.snapshot.weekSummary.totalCosts).toBe(statsData.totalCosts);
    expect(weeklyData.snapshot.weekSummary.winRate).toBe(statsData.winRate);

    // Drilldown aggregates match exactly
    expect(weeklyData.snapshot.weekSummary.netPnL).toBe(drillData.aggregate.netPnL);
    expect(weeklyData.snapshot.weekSummary.grossPnL).toBe(drillData.aggregate.grossPnL);
    expect(weeklyData.snapshot.weekSummary.totalCosts).toBe(drillData.aggregate.totalCosts);
    expect(weeklyData.snapshot.weekSummary.tradeCount).toBe(drillData.aggregate.closedCount);
  });

  it('guarantees tenant isolation: User B cannot see User A data or leak trades', async () => {
    // User B reviews 2026-W43
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W43',
      headers: { cookie: userBCookie },
    });
    expect(resB.statusCode).toBe(200);
    const dataB = resB.json().data;

    // User B only has 1 trade (netPnL: 99949), does NOT include User A's 3 trades
    expect(dataB.snapshot.weekSummary.tradeCount).toBe(1);
    expect(dataB.snapshot.weekSummary.netPnL).toBe(99949);
  });

  it('respects IST boundary: Sunday 23:59 belongs to W43 and Monday 00:00 to W44', async () => {
    // W43: Oct 19 to Oct 25 -> contains Sunday 23:59:59.000+05:30
    const resW43 = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W43',
      headers: { cookie: userACookie },
    });
    const dataW43 = resW43.json().data;
    // User A has 3 trades in W43 (Trade A1, Trade A2, Sunday 23:59 trade)
    expect(dataW43.snapshot.weekSummary.tradeCount).toBe(3);

    // W44: Oct 26 to Nov 01 -> contains Monday 00:00:01.000+05:30
    const resW44 = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W44',
      headers: { cookie: userACookie },
    });
    const dataW44 = resW44.json().data;
    // User A has 1 trade in W44 (Monday 00:00 trade)
    expect(dataW44.snapshot.weekSummary.tradeCount).toBe(1);
    expect(dataW44.snapshot.weekSummary.netPnL).toBe(475);
  });

  it('supports upsert idempotency when saving drafts', async () => {
    // 1st save
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/review/weekly/2026-W43',
      headers: { cookie: userACookie },
      payload: {
        status: 'DRAFT',
        notes: 'Initial reflection notes for week 43',
      },
    });
    expect(res1.statusCode).toBe(200);
    const id1 = res1.json().data._id;

    // 2nd save with updated notes
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/review/weekly/2026-W43',
      headers: { cookie: userACookie },
      payload: {
        status: 'DRAFT',
        notes: 'Updated reflection notes with extra depth',
      },
    });
    expect(res2.statusCode).toBe(200);
    const id2 = res2.json().data._id;

    // Unique index ensures update rather than duplicate document
    expect(id1).toBe(id2);

    const docCount = await WeeklyReview.countDocuments({
      userId: userAId,
      week: '2026-W43',
    });
    expect(docCount).toBe(1);
  });

  it('freezes snapshot upon finalization and remains immutable even if new trades are added', async () => {
    // Finalize week 2026-W43
    const finRes = await app.inject({
      method: 'POST',
      url: '/api/v1/review/weekly/2026-W43',
      headers: { cookie: userACookie },
      payload: {
        status: 'FINALIZED',
        notes: 'Finalized week 43 review',
        focusRule: {
          code: 'MISTAKE_REVENGE_TRADING',
          text: 'Wait 30 minutes after losing trade',
          metric: { type: 'MISTAKE_COUNT', tag: 'REVENGE_TRADING', target: 0 },
          source: 'SUGGESTED',
        },
      },
    });
    expect(finRes.statusCode).toBe(200);
    const frozenPnL = finRes.json().data.snapshot.weekSummary.netPnL;

    // Now insert a backfilled trade into week 2026-W43
    await Trade.create({
      ...defaultTradeMeta,
      userId: new mongoose.Types.ObjectId(userAId),
      accountId: new mongoose.Types.ObjectId(accountAId),
      symbol: 'LATE_ADDITION',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date('2026-10-21T14:00:00.000+05:30'),
      entryTime: new Date('2026-10-21T14:00:00.000+05:30'),
      executionMode: 'SIMPLE',
      calculated: {
        grossPnL: 50000,
        totalCosts: 0,
        netPnL: 50000,
        outcome: 'WIN',
        closedQuantity: 10,
        openQuantity: 0,
        averageEntryPrice: 100,
      },
    });

    // Query weekly review again
    const reviewAfterRes = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W43',
      headers: { cookie: userACookie },
    });
    expect(reviewAfterRes.statusCode).toBe(200);
    const afterData = reviewAfterRes.json().data;

    // Snapshot remains immutable! Stored frozen numbers are unchanged
    expect(afterData.status).toBe('FINALIZED');
    expect(afterData.snapshot.weekSummary.netPnL).toBe(frozenPnL);
  });

  it('evaluates previous week focus rule in the next week review', async () => {
    // Week 2026-W43 focus rule was: MISTAKE_COUNT for REVENGE_TRADING with target 0.
    // In Week 2026-W44, User A has 1 clean trade with 0 mistakes.
    const resW44 = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly?week=2026-W44',
      headers: { cookie: userACookie },
    });
    expect(resW44.statusCode).toBe(200);
    const dataW44 = resW44.json().data;

    expect(dataW44.previousFocusRule).toBeDefined();
    expect(dataW44.previousFocusRule?.metric?.tag).toBe('REVENGE_TRADING');
    expect(dataW44.previousFocusEvaluation).toBeDefined();
    expect(dataW44.previousFocusEvaluation.followed).toBe(true);
    expect(dataW44.previousFocusEvaluation.actual).toBe(0);
  });

  it('lists recent reviews for trend analysis when GET /weekly is called without week param', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/review/weekly',
      headers: { cookie: userACookie },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json().data;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toHaveProperty('week');
    expect(list[0]).toHaveProperty('status');
    expect(list[0]).toHaveProperty('netPnL');
  });

  it('allows manual override of previousFocusEvaluation via followedLastRule in save', async () => {
    const overrideRes = await app.inject({
      method: 'POST',
      url: '/api/v1/review/weekly/2026-W44',
      headers: { cookie: userACookie },
      payload: {
        status: 'DRAFT',
        followedLastRule: false,
      },
    });
    expect(overrideRes.statusCode).toBe(200);
    const data = overrideRes.json().data;
    expect(data.previousFocusEvaluation.followed).toBe(false);
  });
});

