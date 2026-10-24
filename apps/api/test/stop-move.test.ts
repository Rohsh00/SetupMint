import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import moment from 'moment';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Trade, TradingAccount } from '../src/db/models/index.js';

describe('Stop-Move Detection API Integration Tests', () => {
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
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stopmove-tester-a-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'StopMove Tester A',
      },
    });
    authCookie = resA.headers['set-cookie'] as string;
    const meA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meA.json().data.user.id;

    // Register User B (for tenant isolation check)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stopmove-tester-b-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'StopMove Tester B',
      },
    });
    userBAuthCookie = resB.headers['set-cookie'] as string;
    const meB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meB.json().data.user.id;

    // Create trading account for User A
    const account = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Primary Stop Test Account',
      broker: 'FYERS',
      accountNumber: 'FY0099',
      balance: 500000,
      currency: 'INR',
      isActive: true,
    });
    accountId = account._id.toString();
  });

  afterAll(async () => {
    if (userId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
    if (userBId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const detectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${fakeId}/stop-moves/detect`,
    });
    expect(detectRes.statusCode).toBe(401);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${fakeId}/stop-moves`,
    });
    expect(getRes.statusCode).toBe(401);
  });

  it('enforces multi-tenant isolation with 404 for other users trades', async () => {
    // User A creates a trade
    const tradeA = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'TCS',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: moment().toDate(),
      entryTime: moment().subtract(2, 'hours').toDate(),
      exitTime: moment().subtract(1, 'hours').toDate(),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3500,
        exitPrice: 3600,
        quantity: 50,
      },
      risk: {
        initialStopLoss: 3450,
      },
    });

    // User B attempts to detect stop moves on User A's trade
    const detectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeA._id}/stop-moves/detect`,
      headers: { cookie: userBAuthCookie },
      payload: {},
    });
    expect(detectRes.statusCode).toBe(404);

    // User B attempts to get stop moves on User A's trade
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeA._id}/stop-moves`,
      headers: { cookie: userBAuthCookie },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('rejects invalid payload with 400 validation error', async () => {
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'INFY',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: moment().toDate(),
      entryTime: moment().subtract(2, 'hours').toDate(),
      exitTime: moment().subtract(1, 'hours').toDate(),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 1500,
        exitPrice: 1550,
        quantity: 100,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/stop-moves/detect`,
      headers: { cookie: authCookie },
      payload: {
        manualModifications: [
          { stopPrice: -50, modifiedAt: 'not-a-valid-date' }, // invalid price and modifiedAt
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('detects favorable trailing stop modifications for a LONG trade', async () => {
    const entryTime = moment().subtract(2, 'hours');
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'RELIANCE',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: entryTime.toDate(),
      entryTime: entryTime.toDate(),
      exitTime: entryTime.clone().add(90, 'minutes').toDate(),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 2800,
        exitPrice: 2950,
        quantity: 100,
      },
      risk: {
        initialStopLoss: 2750,
      },
    });

    const mod1Time = entryTime.clone().add(20, 'minutes').toISOString();
    const mod2Time = entryTime.clone().add(50, 'minutes').toISOString();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/stop-moves/detect`,
      headers: { cookie: authCookie },
      payload: {
        manualModifications: [
          {
            stopPrice: 2800,
            modifiedAt: mod1Time,
            orderId: 'ORD_101',
            reason: 'Moved to break-even',
          },
          {
            stopPrice: 2880,
            modifiedAt: mod2Time,
            orderId: 'ORD_102',
            reason: 'Trailed under higher low',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const summary = body.data.stopMoveSummary;
    expect(summary.totalMoves).toBe(2);
    expect(summary.trailedCount).toBe(2);
    expect(summary.widenedCount).toBe(0);
    expect(summary.initialStop).toBe(2750);
    expect(summary.finalStop).toBe(2880);
    expect(summary.hasWidenedRisk).toBe(false);

    // Verify stored on DB document
    const updated = await Trade.findById(trade._id);
    expect(updated?.stopLossMoveEvents?.length).toBe(2);
    expect(updated?.stopLossMoveEvents?.[0].moveType).toBe('TRAILED_FAVORABLY');
    expect(updated?.stopLossMoveEvents?.[1].moveType).toBe('TRAILED_FAVORABLY');
    expect(updated?.calculated?.stopMoveSummary?.hasWidenedRisk).toBe(false);
  });

  it('detects risk-widening stop moves and automatically flags STOP_MOVED mistake tag', async () => {
    const entryTime = moment().subtract(3, 'hours');
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'SBIN',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: entryTime.toDate(),
      entryTime: entryTime.toDate(),
      exitTime: entryTime.clone().add(60, 'minutes').toDate(),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 800,
        exitPrice: 770,
        quantity: 200,
      },
      risk: {
        initialStopLoss: 785,
      },
    });

    const widenTime = entryTime.clone().add(25, 'minutes').toISOString();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/stop-moves/detect`,
      headers: { cookie: authCookie },
      payload: {
        manualModifications: [
          {
            stopPrice: 770, // Widened from 785 down to 770 on a LONG trade
            modifiedAt: widenTime,
            orderId: 'ORD_SBIN_WIDEN',
            reason: 'Given extra room hoping for rebound',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    const summary = body.data.stopMoveSummary;
    expect(summary.totalMoves).toBe(1);
    expect(summary.widenedCount).toBe(1);
    expect(summary.trailedCount).toBe(0);
    expect(summary.hasWidenedRisk).toBe(true);
    expect(summary.netRiskChangePoints).toBe(15); // 15 points additional risk

    // Verify mistake suggestions
    expect(body.data.mistakeSuggestions).toBeDefined();
    expect(body.data.mistakeSuggestions).toContain('STOP_MOVED');
    expect(body.data.flags).toContain('STOP_WIDENED');

    // Verify DB persistence of discipline mistake
    const updated = await Trade.findById(trade._id);
    expect(updated?.psychology?.stopLossMoved).toBe(true);
    expect(updated?.psychology?.mistakes).toContain('STOP_MOVED');

    // Verify audit log entry
    const auditEntry = updated?.auditLog?.find((l: any) => l.action === 'STOP_MOVED_DETECTED');
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.details?.widenedCount).toBe(1);
  });

  it('correctly classifies moves for SHORT trades (downward is trailing, upward is widening)', async () => {
    const entryTime = moment().subtract(4, 'hours');
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'TATAMOTORS',
      direction: 'SHORT',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: entryTime.toDate(),
      entryTime: entryTime.toDate(),
      exitTime: entryTime.clone().add(90, 'minutes').toDate(),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 900,
        exitPrice: 920,
        quantity: 150,
      },
      risk: {
        initialStopLoss: 915,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade._id}/stop-moves/detect`,
      headers: { cookie: authCookie },
      payload: {
        manualModifications: [
          {
            stopPrice: 905, // Downward from 915 -> favorable trail for SHORT
            modifiedAt: entryTime.clone().add(15, 'minutes').toISOString(),
          },
          {
            stopPrice: 925, // Upward from 905 -> widening risk for SHORT
            modifiedAt: entryTime.clone().add(45, 'minutes').toISOString(),
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const summary = res.json().data.stopMoveSummary;
    expect(summary.totalMoves).toBe(2);
    expect(summary.trailedCount).toBe(1);
    expect(summary.widenedCount).toBe(1);
    expect(summary.hasWidenedRisk).toBe(true);

    const updated = await Trade.findById(trade._id);
    expect(updated?.psychology?.mistakes).toContain('STOP_MOVED');
  });

  it('retrieves stop moves via GET /api/v1/trades/:id/stop-moves', async () => {
    const entryTime = moment().subtract(1, 'day');
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'HDFCBANK',
      direction: 'LONG',
      status: 'CLOSED',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: entryTime.toDate(),
      entryTime: entryTime.toDate(),
      exitTime: entryTime.clone().add(45, 'minutes').toDate(),
      stopLossMoveEvents: [
        {
          previousStop: 1600,
          newStop: 1620,
          changePoints: 20,
          changePercent: 1.25,
          moveType: 'TRAILED_FAVORABLY',
          movedAt: entryTime.clone().add(20, 'minutes').toDate(),
          orderId: 'ORD_HDFC_01',
          reason: 'Trailed stop',
        },
      ],
      calculated: {
        stopMoveSummary: {
          totalMoves: 1,
          widenedCount: 0,
          trailedCount: 1,
          initialStop: 1600,
          finalStop: 1620,
          netRiskChangePoints: -20,
          hasWidenedRisk: false,
          detectedAt: new Date(),
        },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${trade._id}/stop-moves`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.stopLossMoveEvents.length).toBe(1);
    expect(body.data.stopLossMoveEvents[0].moveType).toBe('TRAILED_FAVORABLY');
    expect(body.data.stopMoveSummary.finalStop).toBe(1620);
  });
});
