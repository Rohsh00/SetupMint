import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import moment from 'moment';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  Trade,
  TradingAccount,
  Attachment,
  User,
  TradeCandleSnapshot,
} from '../src/db/models/index.js';
import { ChartGeneratorService } from '../src/services/chart-generator.service.js';

describe('Auto Chart Snapshot Lifecycle & Cap Enforcement Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  let userBAuthCookie: string;
  let userBId: string;

  const createMockCandles = async (
    tradeId: mongoose.Types.ObjectId,
    uId: mongoose.Types.ObjectId,
    symbol: string,
    resolutions = ['1', '5', '60', '240']
  ) => {
    for (const resolution of resolutions) {
      await TradeCandleSnapshot.create({
        tradeId,
        userId: uId,
        symbol,
        resolution,
        candles: [
          { t: 1761298200000, o: 100, h: 105, l: 99, c: 102, v: 100 },
          { t: 1761298260000, o: 102, h: 106, l: 101, c: 104, v: 120 },
        ],
        candleCount: 2,
        appliedPaddingBefore: 15,
        appliedPaddingAfter: 15,
        generatedAt: new Date(),
      });
    }
  };

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A with custom pattern detection settings
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `auto-chart-tester-a-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Auto Chart Tester A',
      },
    });
    authCookie = resA.headers['set-cookie'] as string;
    const meA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    userId = meA.json().data.user.id;

    // Set custom PatternDetectionSettings with an override on NIFTY
    await User.findByIdAndUpdate(userId, {
      patternDetectionSettings: {
        defaultHtf: '240',
        defaultLtf: '5',
        autoDetectOnImport: true,
        autoDetectMistakes: true,
        instrumentOverrides: [
          {
            symbol: 'NIFTY',
            htf: '60',
            ltf: '1',
            preferredStrategyName: 'Nifty 1m Momentum Scalp',
          },
        ],
      },
    });

    // Register User B for multi-tenant checks
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `auto-chart-tester-b-${Date.now()}@setupmint.internal`,
        password: 'Password@123',
        name: 'Auto Chart Tester B',
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
      name: 'Auto Chart Account',
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

  it('skips snapshot generation for OPEN trades', async () => {
    const openTrade = await Trade.create({
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
      status: 'OPEN',
      entryDate: moment().subtract(2, 'hours').toDate(),
      entryTime: moment().subtract(2, 'hours').toDate(),
      simpleExecution: {
        entryPrice: 2500,
        quantity: 10,
      },
      screenshotIds: [],
    });

    const results = await ChartGeneratorService.ensureTradeSnapshot(
      openTrade._id.toString(),
      userId
    );
    expect(results).toHaveLength(0);

    const attachments = await Attachment.find({ tradeId: openTrade._id });
    expect(attachments).toHaveLength(0);
  });

  it('creates permanent AUTO_CHART snapshots on CLOSED trades using settings and overrides', async () => {
    const closedNiftyTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:NIFTY24OCT24500CE',
      underlying: 'NIFTY',
      assetClass: 'OPTIONS',
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
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
        entryPrice: 120,
        exitPrice: 150,
        quantity: 50,
      },
      screenshotIds: [],
    });

    await createMockCandles(closedNiftyTrade._id, new mongoose.Types.ObjectId(userId), 'NSE:NIFTY24OCT24500CE');

    const results = await ChartGeneratorService.ensureTradeSnapshot(
      closedNiftyTrade._id.toString(),
      userId
    );

    // NIFTY override should resolve to LTF '1' and HTF '60'
    expect(results.length).toBeGreaterThanOrEqual(1);
    const createdResults = results.filter((r) => r.status === 'CREATED');
    expect(createdResults.length).toBeGreaterThanOrEqual(1);

    const attachments = await Attachment.find({
      tradeId: closedNiftyTrade._id,
      category: 'AUTO_CHART',
    });
    expect(attachments.length).toBeGreaterThanOrEqual(1);

    const ltfAttachment = attachments.find(
      (a) => a.timeframe === '1m' || a.timeframe === '1'
    );
    expect(ltfAttachment).toBeDefined();
    expect(ltfAttachment!.chartMeta).toBeDefined();
    expect(ltfAttachment!.chartMeta?.isStale).toBe(false);
    expect(ltfAttachment!.chartMeta?.settingsSource).toContain('NIFTY override');
  });

  it('deduplicates existing snapshots on subsequent calls (SKIPPED_EXISTS)', async () => {
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
      entryDate: moment().subtract(2, 'hours').toDate(),
      entryTime: moment().subtract(2, 'hours').toDate(),
      exitDate: moment().subtract(1, 'hour').toDate(),
      exitTime: moment().subtract(1, 'hour').toDate(),
      simpleExecution: {
        entryPrice: 1800,
        exitPrice: 1850,
        quantity: 10,
      },
      screenshotIds: [],
    });

    await createMockCandles(closedTrade._id, new mongoose.Types.ObjectId(userId), 'NSE:INFY-EQ');

    // First call generates
    const firstResults = await ChartGeneratorService.ensureTradeSnapshot(
      closedTrade._id.toString(),
      userId
    );
    expect(firstResults.some((r) => r.status === 'CREATED')).toBe(true);

    // Second call skips duplicate timeframes
    const secondResults = await ChartGeneratorService.ensureTradeSnapshot(
      closedTrade._id.toString(),
      userId
    );
    expect(secondResults.every((r) => r.status === 'SKIPPED_EXISTS')).toBe(true);
  });

  it('marks snapshots stale when trade parameters are edited (markSnapshotsStale)', async () => {
    const tradeToEdit = await Trade.create({
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
      status: 'CLOSED',
      entryDate: moment().subtract(3, 'hours').toDate(),
      entryTime: moment().subtract(3, 'hours').toDate(),
      exitDate: moment().subtract(1, 'hour').toDate(),
      exitTime: moment().subtract(1, 'hour').toDate(),
      simpleExecution: {
        entryPrice: 4000,
        exitPrice: 4100,
        quantity: 5,
      },
      screenshotIds: [],
    });

    await createMockCandles(tradeToEdit._id, new mongoose.Types.ObjectId(userId), 'NSE:TCS-EQ');

    await ChartGeneratorService.ensureTradeSnapshot(
      tradeToEdit._id.toString(),
      userId
    );

    const beforeAtts = await Attachment.find({
      tradeId: tradeToEdit._id,
      category: 'AUTO_CHART',
    });
    expect(beforeAtts.length).toBeGreaterThanOrEqual(1);
    expect(beforeAtts[0].chartMeta?.isStale).toBe(false);

    // Update trade via PUT /api/v1/trades/:id
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/trades/${tradeToEdit._id}`,
      headers: { cookie: authCookie },
      payload: {
        tradeTitle: 'Updated Trade Title Review',
      },
    });
    expect(putRes.statusCode).toBe(200);

    // Check that existing snapshots are now marked isStale: true
    const afterAtts = await Attachment.find({
      tradeId: tradeToEdit._id,
      category: 'AUTO_CHART',
    });
    expect(afterAtts[0].chartMeta?.isStale).toBe(true);
  });

  it('strictly respects the 12-screenshot cap per trade', async () => {
    const cappedTrade = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:WIPRO-EQ',
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
        entryPrice: 450,
        exitPrice: 460,
        quantity: 100,
      },
      screenshotIds: [],
    });

    await createMockCandles(cappedTrade._id, new mongoose.Types.ObjectId(userId), 'NSE:WIPRO-EQ');

    // Pre-populate with 12 mock user screenshots
    const screenshotIds: mongoose.Types.ObjectId[] = [];
    for (let i = 0; i < 12; i++) {
      const att = await Attachment.create({
        userId: new mongoose.Types.ObjectId(userId),
        tradeId: cappedTrade._id,
        category: 'SETUP',
        originalName: `screenshot-${i}.png`,
        storedFilename: `setup-${cappedTrade._id}-${i}-${Date.now()}.png`,
        mimeType: 'image/png',
        sizeBytes: 1024,
      });
      screenshotIds.push(att._id);
    }
    await Trade.findByIdAndUpdate(cappedTrade._id, { screenshotIds });

    const countBefore = await Attachment.countDocuments({ tradeId: cappedTrade._id });
    expect(countBefore).toBe(12);

    // Calling ensureTradeSnapshot should NOT exceed 12
    await ChartGeneratorService.ensureTradeSnapshot(
      cappedTrade._id.toString(),
      userId
    );

    const countAfter = await Attachment.countDocuments({ tradeId: cappedTrade._id });
    expect(countAfter).toBeLessThanOrEqual(12);
  });

  it('guarantees tenant isolation so User B cannot view or generate snapshots for User A', async () => {
    const tradeA = await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'NSE:HDFCBANK-EQ',
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
        entryPrice: 1700,
        exitPrice: 1720,
        quantity: 20,
      },
      screenshotIds: [],
    });

    // User B tries to generate chart for User A's trade via API
    const crossRes = await app.inject({
      method: 'POST',
      url: `/api/v1/trades/${tradeA._id}/chart/generate`,
      headers: { cookie: userBAuthCookie },
      payload: { force: true },
    });
    expect(crossRes.statusCode).toBe(404);

    // User B cannot trigger ensureTradeSnapshot internally for User A's trade (returns empty array)
    const crossResults = await ChartGeneratorService.ensureTradeSnapshot(
      tradeA._id.toString(),
      userBId
    );
    expect(crossResults).toHaveLength(0);
  });
});
