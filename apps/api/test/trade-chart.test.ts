import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import moment from 'moment';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  Trade,
  TradingAccount,
  TradeCandleSnapshot,
  Attachment,
} from '../src/db/models/index.js';

describe('Automated Trade Chart API Integration Tests', () => {
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
        email: `chart-tester-a-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Chart Tester A',
      },
    });
    authCookie = resA.headers['set-cookie'] as string;
    const meA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meA.json().data.user.id;

    // Register User B (for cross-tenant checks)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `chart-tester-b-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Chart Tester B',
      },
    });
    userBAuthCookie = resB.headers['set-cookie'] as string;
    const meB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: userBAuthCookie },
    });
    userBId = meB.json().data.user.id;

    // Create Account for User A
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Chart Trading Account',
      accountType: 'EQUITY',
      broker: 'FYERS',
      currency: 'INR',
      initialBalance: mongoose.Types.Decimal128.fromString('100000'),
      currentBalance: mongoose.Types.Decimal128.fromString('100000'),
    });
    accountId = acc._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await app.close();
  });

  it('rejects unauthenticated chart generation requests with 401', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${fakeId}/chart/generate`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('enforces multi-tenant isolation and returns 404 for another users trade', async () => {
    const tradeA = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:RELIANCE-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: new Date('2026-10-24'),
      executionMode: 'SIMPLE',
      direction: 'LONG',
      status: 'CLOSED',
      entryDate: moment().subtract(2, 'hours').toDate(),
      entryTime: moment().subtract(2, 'hours').toDate(),
      exitDate: moment().subtract(1, 'hour').toDate(),
      exitTime: moment().subtract(1, 'hour').toDate(),
      simpleExecution: {
        entryPrice: 2500,
        exitPrice: 2550,
        quantity: 50,
      },
      screenshotIds: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeA._id}/chart/generate`,
      headers: { cookie: userBAuthCookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when attempting to generate execution chart for an OPEN trade', async () => {
    const openTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:TCS-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: new Date('2026-10-24'),
      executionMode: 'SIMPLE',
      direction: 'LONG',
      status: 'OPEN',
      entryDate: new Date(),
      entryTime: new Date(),
      simpleExecution: {
        entryPrice: 3500,
        quantity: 20,
      },
      screenshotIds: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${openTrade._id}/chart/generate`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('TRADE_NOT_CLOSED');
  });

  it('generates SVG chart from cached snapshot, uploads to storage, and links AUTO_CHART attachment', async () => {
    const entryMoment = moment('2026-10-24T09:30:00.000Z');
    const exitMoment = moment('2026-10-24T10:15:00.000Z');

    const closedTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:INFY-EQ',
      assetClass: 'EQUITY',
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      currency: 'INR',
      tradeDate: new Date('2026-10-24'),
      executionMode: 'SIMPLE',
      direction: 'LONG',
      status: 'CLOSED',
      entryDate: entryMoment.toDate(),
      entryTime: entryMoment.toDate(),
      exitDate: exitMoment.toDate(),
      exitTime: exitMoment.toDate(),
      simpleExecution: {
        entryPrice: 1800,
        exitPrice: 1840,
        quantity: 100,
      },
      risk: {
        initialStopLoss: 1780,
        plannedTarget: 1880,
      },
      calculated: {
        netPnl: 4000,
        realizedR: 2.0,
      },
      screenshotIds: [],
    });

    // Seed cached candles in TradeCandleSnapshot
    await TradeCandleSnapshot.create({
      userId: new mongoose.Types.ObjectId(userId),
      tradeId: closedTrade._id,
      symbol: 'NSE:INFY-EQ',
      resolution: '5',
      candles: [
        { t: entryMoment.valueOf(), o: 1800, h: 1815, l: 1795, c: 1810, v: 5000 },
        { t: entryMoment.clone().add(5, 'minutes').valueOf(), o: 1810, h: 1825, l: 1805, c: 1820, v: 4000 },
        { t: entryMoment.clone().add(10, 'minutes').valueOf(), o: 1820, h: 1835, l: 1815, c: 1830, v: 6000 },
        { t: exitMoment.valueOf(), o: 1830, h: 1845, l: 1825, c: 1840, v: 7000 },
      ],
      fetchedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${closedTrade._id}/chart/generate`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.category).toBe('AUTO_CHART');
    expect(body.data.mimeType).toBe('image/svg+xml');
    expect(body.data.downloadUrl).toContain('/api/v1/attachments/');

    // Verify attachment document exists
    const attachmentDoc = await Attachment.findById(body.data.id);
    expect(attachmentDoc).toBeDefined();
    expect(attachmentDoc?.category).toBe('AUTO_CHART');
    expect(attachmentDoc?.tradeId?.toString()).toBe(closedTrade._id.toString());

    // Verify trade.screenshotIds is updated
    const updatedTrade = await Trade.findById(closedTrade._id);
    expect(updatedTrade?.screenshotIds.map((id) => id.toString())).toContain(body.data.id);
  });

  it('reuses existing AUTO_CHART attachment unless force is true', async () => {
    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userId), symbol: 'NSE:INFY-EQ' });
    expect(trade).toBeDefined();

    // Call without force
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade!._id}/chart/generate`,
      headers: { cookie: authCookie },
      payload: { force: false },
    });

    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);

    // Call with force: true
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${trade!._id}/chart/generate`,
      headers: { cookie: authCookie },
      payload: { force: true },
    });

    expect(res2.statusCode).toBe(201);
    const body2 = JSON.parse(res2.body);

    // Regenerated attachment should have a new ID
    expect(body2.data.id).not.toBe(body1.data.id);
    expect(body2.data.category).toBe('AUTO_CHART');

    // Only 1 AUTO_CHART should be in DB for this trade
    const autoCharts = await Attachment.find({ tradeId: trade!._id, category: 'AUTO_CHART' });
    expect(autoCharts.length).toBe(1);
  });

  it('GET /api/v1/trades/:id formats and returns the AUTO_CHART attachment', async () => {
    const trade = await Trade.findOne({ userId: new mongoose.Types.ObjectId(userId), symbol: 'NSE:INFY-EQ' });
    expect(trade).toBeDefined();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${trade!._id}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.attachments).toBeDefined();
    const autoChart = body.data.attachments.find((a: any) => a.category === 'AUTO_CHART');
    expect(autoChart).toBeDefined();
    expect(autoChart.mimeType).toBe('image/svg+xml');
  });

  it('GET /api/v1/attachments/:id/download streams the generated SVG image', async () => {
    const autoChart = await Attachment.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      category: 'AUTO_CHART',
    });
    expect(autoChart).toBeDefined();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${autoChart!._id}/download`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('<svg');
    expect(res.body).toContain('NSE:INFY-EQ');
    expect(res.body).toContain('⚡ FYERS AUTO CHART');
  });
});
