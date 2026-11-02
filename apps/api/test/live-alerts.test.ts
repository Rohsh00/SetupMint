import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  Trade,
  TradingAccount,
  AlertState,
  AlertEvent,
} from '../src/db/models/index.js';

describe('Live Alerts API Integration Tests (Phase 3 Multi-Channel Sync)', () => {
  let app: FastifyInstance;
  let userAId: string;
  let userBId: string;
  let authCookieA: string;
  let authCookieB: string;
  let tradeA: any;
  let alertA: any;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `live-alerts-a-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Alert Tester Alpha',
      },
    });
    authCookieA = regResA.cookies.find((c) => c.name === 'tv_session')?.value || '';
    userAId = JSON.parse(regResA.body).data.user.id;

    // Register User B
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `live-alerts-b-${Date.now()}@test.local`,
        password: 'Password@123',
        name: 'Alert Tester Beta',
      },
    });
    authCookieB = regResB.cookies.find((c) => c.name === 'tv_session')?.value || '';
    userBId = JSON.parse(regResB.body).data.user.id;

    // Create Account & Trade for User A
    const account = await TradingAccount.create({
      userId: userAId,
      name: 'Alpha Trading Account',
      broker: 'FYERS',
      accountNumber: 'FY001',
      isActive: true,
    });

    tradeA = await Trade.create({
      userId: userAId,
      accountId: account._id,
      symbol: 'NIFTY24OCT25000CE',
      assetClass: 'OPTIONS',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      currency: 'INR',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      openQuantity: 50,
      simpleExecution: {
        entryPrice: 150,
        quantity: 50,
      },
    });

    // Create AlertState for User A
    alertA = await AlertState.create({
      userId: userAId,
      tradeId: tradeA._id,
      type: 'STOP_THREAT',
      state: 'ACTIVE',
      severity: 3,
      enterCount: 1,
      chatId: '10000001',
      lastMetricValue: 'LTP 135 vs SL 130',
    });
  });

  afterAll(async () => {
    if (userAId && userBId) {
      await AlertState.deleteMany({ userId: { $in: [userAId, userBId] } });
      await AlertEvent.deleteMany({ userId: { $in: [userAId, userBId] } });
      await Trade.deleteMany({ userId: { $in: [userAId, userBId] } });
      await TradingAccount.deleteMany({ userId: { $in: [userAId, userBId] } });
      await User.deleteMany({ _id: { $in: [userAId, userBId] } });
    }
    await disconnectDatabase();
  });

  it('GET /api/v1/trades/live/alerts requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/alerts',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/trades/live/alerts returns user alerts with trade details and enforces tenant isolation', async () => {
    // User A fetches alerts
    const resA = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/alerts',
      headers: { cookie: `tv_session=${authCookieA}` },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body);
    expect(bodyA.success).toBe(true);
    expect(Array.isArray(bodyA.data)).toBe(true);
    expect(bodyA.data.length).toBe(1);
    expect(bodyA.data[0].id).toBe(alertA._id.toString());
    expect(bodyA.data[0].symbol).toBe('NIFTY24OCT25000CE');
    expect(bodyA.data[0].type).toBe('STOP_THREAT');
    expect(bodyA.data[0].severity).toBe(3);

    // User B fetches alerts (should see 0 alerts)
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/live/alerts',
      headers: { cookie: `tv_session=${authCookieB}` },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.body);
    expect(bodyB.success).toBe(true);
    expect(bodyB.data.length).toBe(0);
  });

  it('POST /api/v1/trades/live/alerts/:id/snooze enforces tenant isolation', async () => {
    // User B attempts to snooze User A's alert
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/live/alerts/${alertA._id.toString()}/snooze`,
      headers: { cookie: `tv_session=${authCookieB}` },
      payload: { durationMinutes: 15 },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('ALERT_NOT_FOUND');
  });

  it('POST /api/v1/trades/live/alerts/:id/snooze updates alertState and records AlertEvent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/live/alerts/${alertA._id.toString()}/snooze`,
      headers: { cookie: `tv_session=${authCookieA}` },
      payload: { durationMinutes: 20 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('SNOOZED');
    expect(body.data.snoozedUntil).toBeDefined();

    // Verify database state directly
    const updated = await AlertState.findById(alertA._id);
    expect(updated?.state).toBe('SNOOZED');
    expect(updated?.snoozedUntil).toBeDefined();
    expect(new Date(updated!.snoozedUntil!).getTime()).toBeGreaterThan(Date.now() + 19 * 60 * 1000);

    // Verify AlertEvent logged for multi-channel sync
    const event = await AlertEvent.findOne({ userId: userAId, action: 'SNOOZE' });
    expect(event).toBeDefined();
    expect(event?.actionTaken).toBe('WEB_SNOOZE_20M');
  });

  it('POST /api/v1/trades/live/alerts/:id/clear clears alertState and records AlertEvent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/live/alerts/${alertA._id.toString()}/clear`,
      headers: { cookie: `tv_session=${authCookieA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('CLEARED');
    expect(body.data.clearedAt).toBeDefined();

    const updated = await AlertState.findById(alertA._id);
    expect(updated?.state).toBe('CLEARED');
    expect(updated?.clearedAt).toBeDefined();

    const event = await AlertEvent.findOne({ userId: userAId, action: 'CLEAR' });
    expect(event).toBeDefined();
    expect(event?.actionTaken).toBe('WEB_CLEAR');
  });
});
