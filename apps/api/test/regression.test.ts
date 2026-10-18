import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Attachment, Trade, TradingAccount, Strategy, DailyJournal } from '../src/db/models/index.js';
import { config } from '../src/config.js';

describe('TradeVault Comprehensive QA & Regression Test Suite', () => {
  let app: FastifyInstance;
  let userAAuthCookie: string;
  let userAId: string;
  let userBAuthCookie: string;
  let userBId: string;

  let accountAId: string;
  let accountBId: string;

  // 12-byte valid PNG header for chart screenshot testing
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `qa_user_a_${Date.now()}@tradevault.local`,
        password: 'SecurePassword123!',
        name: 'QA Trader A',
        baseCurrency: 'INR',
      },
    });
    expect(resA.statusCode).toBe(201);
    const bodyA = JSON.parse(resA.body);
    userAId = bodyA.data.user.id;
    userAAuthCookie = resA.headers['set-cookie'] as string;

    // Create Account for User A (Initial balance 200,000)
    const accResA = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userAAuthCookie },
      payload: {
        name: 'Primary Swing Account',
        broker: 'Zerodha',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 200000,
      },
    });
    expect(accResA.statusCode).toBe(201);
    accountAId = JSON.parse(accResA.body).data.id;

    // Register User B (for cross-user isolation testing)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `qa_user_b_${Date.now()}@tradevault.local`,
        password: 'SecurePassword123!',
        name: 'QA Trader B',
        baseCurrency: 'INR',
      },
    });
    expect(resB.statusCode).toBe(201);
    const bodyB = JSON.parse(resB.body);
    userBId = bodyB.data.user.id;
    userBAuthCookie = resB.headers['set-cookie'] as string;

    // Create Account for User B
    const accResB = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: userBAuthCookie },
      payload: {
        name: 'User B Scalping Account',
        broker: 'AngelOne',
        accountType: 'FUTURES_OPTIONS',
        baseCurrency: 'INR',
        initialBalance: 50000,
      },
    });
    expect(accResB.statusCode).toBe(201);
    accountBId = JSON.parse(accResB.body).data.id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await disconnectDatabase();
  });

  // =========================================================================
  // JOURNEY A: Basic Trade Lifecycle
  // =========================================================================
  describe('Journey A: Basic Trade Lifecycle', () => {
    let tradeAId: string;

    it('A1: Creates a simple long equity trade and validates exact calculations', async () => {
      // Buy 50 shares of TCS at 3500, sell at 3600.
      // Gross = (3600 - 3500) * 50 = +5000.
      // Costs: brokerage 40, exchange 15, taxes 45 = 100.
      // Net = 5000 - 100 = 4900.
      // Risk: entry 3500, stop 3450. Planned risk = (3500 - 3450) * 50 = 2500.
      // Realized R = 4900 / 2500 = 1.96 R.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'TCS',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-17',
          entryTime: '2026-10-17T09:15:00.000Z',
          exitTime: '2026-10-17T11:45:00.000Z',
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 3500,
            exitPrice: 3600,
            quantity: 50,
            contractMultiplier: 1,
            brokerage: 40,
            exchangeFees: 15,
            taxes: 45,
          },
          risk: {
            plannedEntryPrice: 3500,
            initialStopLoss: 3450,
            plannedTarget: 3650,
          },
          thesis: {
            preMarketBias: 'BULLISH',
            confluences: ['Daily 200 EMA Support', 'Bullish Engulfing'],
            entryRationale: 'Break of structure after consolidation',
          },
          psychology: {
            disciplineScore: 5,
            rulesFollowed: true,
            emotionBefore: 'CONFIDENT',
          },
          tags: ['MOMENTUM', 'BREAKOUT'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.netPnL).toBe(4900);
      expect(body.data.outcome).toBe('WIN');
      tradeAId = body.data.id;
    });

    it('A2: Reopens saved trade by ID and verifies all persisted fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${tradeAId}`,
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const t = body.data;
      expect(t.symbol).toBe('TCS');
      expect(t.direction).toBe('LONG');
      expect(t.status).toBe('CLOSED');
      expect(t.tradeDate).toBe('2026-10-17');
      expect(t.simpleExecution.entryPrice).toBe(3500);
      expect(t.simpleExecution.exitPrice).toBe(3600);
      expect(t.simpleExecution.quantity).toBe(50);
      expect(t.calculated.grossPnL).toBe(5000);
      expect(t.calculated.totalCosts).toBe(100);
      expect(t.calculated.netPnL).toBe(4900);
      expect(t.calculated.realizedRMultiple).toBe(1.96);
      expect(t.calculated.holdingTimeMinutes).toBe(150); // 9:15 to 11:45 = 150 mins
      expect(t.calculated.outcome).toBe('WIN');
      expect(t.thesis.preMarketBias).toBe('BULLISH');
      expect(t.psychology.disciplineScore).toBe(5);
      expect(t.tags).toContain('MOMENTUM');
      expect(t.auditLog.length).toBeGreaterThan(0);
      expect(t.auditLog[0].action).toBe('CREATED');
    });

    it('A3: Confirms trade appears in trade list with proper pagination and filters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades?symbol=TCS&direction=LONG&status=CLOSED',
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(tradeAId);
      expect(body.pagination.totalCount).toBe(1);
    });
  });

  // =========================================================================
  // JOURNEY B: Trade Editing & In-Place Update
  // =========================================================================
  describe('Journey B: Trade Editing & In-Place Update', () => {
    let tradeBId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'INFY',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-17',
          entryTime: '2026-10-17T10:00:00.000Z',
          exitTime: '2026-10-17T10:30:00.000Z',
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 1900,
            exitPrice: 1920,
            quantity: 100,
            contractMultiplier: 1,
            brokerage: 20,
            exchangeFees: 10,
            taxes: 10,
          },
          risk: {
            plannedEntryPrice: 1900,
            initialStopLoss: 1880,
            plannedTarget: 1950,
          },
          thesis: {
            confluences: ['Support test'],
          },
          psychology: {
            disciplineScore: 4,
            rulesFollowed: true,
          },
        },
      });
      tradeBId = JSON.parse(res.body).data.id;
    });

    it('B1: Updates trade in-place without creating a duplicate record', async () => {
      const countBefore = await Trade.countDocuments({ userId: userAId });

      // Change exit price from 1920 to 1930.
      // New Gross = (1930 - 1900) * 100 = +3000.
      // Costs = 40.
      // New Net = 3000 - 40 = 2960.
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/trades/${tradeBId}`,
        headers: { cookie: userAAuthCookie },
        payload: {
          simpleExecution: {
            entryPrice: 1900,
            exitPrice: 1930,
            quantity: 100,
            contractMultiplier: 1,
            brokerage: 20,
            exchangeFees: 10,
            taxes: 10,
          },
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const updateBody = JSON.parse(updateRes.body);
      expect(updateBody.success).toBe(true);

      const countAfter = await Trade.countDocuments({ userId: userAId });
      expect(countAfter).toBe(countBefore); // No duplicate created!
    });

    it('B2: Verifies dependent financial calculations recalculated accurately after edit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${tradeBId}`,
        headers: { cookie: userAAuthCookie },
      });

      const trade = JSON.parse(res.body).data;
      expect(trade.calculated.grossPnL).toBe(3000);
      expect(trade.calculated.netPnL).toBe(2960);
      expect(trade.calculated.totalCosts).toBe(40);
      // Planned risk was (1900 - 1880) * 100 = 2000.
      // Realized R = 2960 / 2000 = 1.48 R.
      expect(trade.calculated.realizedRMultiple).toBe(1.48);

      // Verify audit log has UPDATED entry
      const updateAudit = trade.auditLog.find((a: any) => a.action === 'UPDATED');
      expect(updateAudit).toBeDefined();
      expect(updateAudit.details.newNetPnL).toBe(2960);
    });

    it('B3: Verifies partial nested update preserves sibling fields (defect fix verification)', async () => {
      // Update only plannedTarget in risk, without providing initialStopLoss
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/trades/${tradeBId}`,
        headers: { cookie: userAAuthCookie },
        payload: {
          risk: {
            plannedTarget: 1980,
          },
        },
      });

      expect(updateRes.statusCode).toBe(200);

      // Verify initialStopLoss and plannedEntryPrice were NOT erased!
      const verifyRes = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${tradeBId}`,
        headers: { cookie: userAAuthCookie },
      });

      const trade = JSON.parse(verifyRes.body).data;
      expect(trade.risk.plannedTarget).toBe(1980);
      expect(trade.risk.initialStopLoss).toBe(1880); // Preserved!
      expect(trade.risk.plannedEntryPrice).toBe(1900); // Preserved!
    });
  });

  // =========================================================================
  // JOURNEY C: Financial Correctness & Advanced Multi-Fill FIFO Executions
  // =========================================================================
  describe('Journey C: Financial Correctness & Multi-Fill FIFO Executions', () => {
    it('C1: Multi-fill FIFO execution matches independent mathematical calculation', async () => {
      // Long BankNifty Futures with scale-in and scale-out:
      // Entry 1: Buy 30 @ 50000, fee = 30
      // Entry 2: Buy 30 @ 50200, fee = 30
      // Total bought = 60. Weighted avg entry = (30*50000 + 30*50200)/60 = 50100.
      // Exit 1: Sell 40 @ 50500, fee = 40 (matches 30 from Entry 1 @ 50000 -> +15000, and 10 from Entry 2 @ 50200 -> +3000. Total gross = +18000)
      // Exit 2: Sell 20 @ 50600, fee = 20 (matches remaining 20 from Entry 2 @ 50200 -> (50600 - 50200)*20 = +8000)
      // Total closed quantity = 60. Open quantity = 0.
      // Total Gross PnL = 18000 + 8000 = 26000.
      // Total Costs = 30 + 30 + 40 + 20 = 120.
      // Total Net PnL = 26000 - 120 = 25880.
      // Weighted avg exit = (40*50500 + 20*50600)/60 = (2020000 + 1012000)/60 = 50533.3333.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'BANKNIFTY',
          assetClass: 'FUTURES',
          exchange: 'NSE',
          marketSegment: 'NSE_FNO',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T09:20:00.000Z',
          exitTime: '2026-10-18T13:40:00.000Z',
          executionMode: 'ADVANCED',
          fills: [
            {
              fillId: 'fill-1',
              type: 'ENTRY',
              price: 50000,
              quantity: 30,
              timestamp: '2026-10-18T09:20:00.000Z',
              fee: 30,
            },
            {
              fillId: 'fill-2',
              type: 'ENTRY',
              price: 50200,
              quantity: 30,
              timestamp: '2026-10-18T09:45:00.000Z',
              fee: 30,
            },
            {
              fillId: 'fill-3',
              type: 'EXIT',
              price: 50500,
              quantity: 40,
              timestamp: '2026-10-18T11:15:00.000Z',
              fee: 40,
            },
            {
              fillId: 'fill-4',
              type: 'EXIT',
              price: 50600,
              quantity: 20,
              timestamp: '2026-10-18T13:40:00.000Z',
              fee: 20,
            },
          ],
          risk: {
            riskBudgetAmount: 5000,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${body.data.id}`,
        headers: { cookie: userAAuthCookie },
      });
      const t = JSON.parse(getRes.body).data;

      expect(t.calculated.grossPnL).toBe(26000);
      expect(t.calculated.totalCosts).toBe(120);
      expect(t.calculated.netPnL).toBe(25880);
      expect(t.calculated.outcome).toBe('WIN');
      expect(t.calculated.closedQuantity).toBe(60);
      expect(t.calculated.openQuantity).toBe(0);
      expect(t.calculated.averageEntryPrice).toBe(50100);
      expect(t.calculated.averageExitPrice).toBe(50533.3333);
      // Realized R = 25880 / 5000 = 5.18 R
      expect(t.calculated.realizedRMultiple).toBe(5.18);
    });

    it('C2: Correctly computes Short position P&L (Entry > Exit = Profit)', async () => {
      // Short 100 shares of SBIN at 850, cover at 830.
      // Gross = (850 - 830) * 100 = +2000.
      // Costs = 50.
      // Net = 2000 - 50 = +1950.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'SBIN',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'SHORT',
          status: 'CLOSED',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          exitTime: '2026-10-18T11:00:00.000Z',
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 850,
            exitPrice: 830,
            quantity: 100,
            contractMultiplier: 1,
            brokerage: 50,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const t = JSON.parse(res.body).data;
      expect(t.netPnL).toBe(1950);
      expect(t.outcome).toBe('WIN');
    });

    it('C3: Correctly computes Losing trade and negative R-multiple', async () => {
      // Buy 100 at 500, stopped out at 480.
      // Gross = (480 - 500) * 100 = -2000.
      // Costs = 40.
      // Net = -2000 - 40 = -2040.
      // Planned risk: (500 - 480) * 100 = 2000.
      // Realized R = -2040 / 2000 = -1.02 R.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'TATAMOTORS',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T09:30:00.000Z',
          exitTime: '2026-10-18T09:45:00.000Z',
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 500,
            exitPrice: 480,
            quantity: 100,
            contractMultiplier: 1,
            brokerage: 40,
          },
          risk: {
            plannedEntryPrice: 500,
            initialStopLoss: 480,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.netPnL).toBe(-2040);
      expect(body.data.outcome).toBe('LOSS');

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${body.data.id}`,
        headers: { cookie: userAAuthCookie },
      });
      const t = JSON.parse(getRes.body).data;
      expect(t.calculated.realizedRMultiple).toBe(-1.02);
    });

    it('C4: Open trade has 0 realized P&L and does not affect account realized balance', async () => {
      const accBefore = await app.inject({
        method: 'GET',
        url: `/api/v1/accounts/${accountAId}`,
        headers: { cookie: userAAuthCookie },
      });
      const balanceBefore = JSON.parse(accBefore.body).data.currentBalance;

      // Create an OPEN trade (no exit price)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'HDFCBANK',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'OPEN',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          executionMode: 'SIMPLE',
          simpleExecution: {
            entryPrice: 1650,
            quantity: 100,
            contractMultiplier: 1,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const t = JSON.parse(res.body).data;
      expect(t.outcome).toBe('OPEN');

      // Verify account balance is unchanged
      const accAfter = await app.inject({
        method: 'GET',
        url: `/api/v1/accounts/${accountAId}`,
        headers: { cookie: userAAuthCookie },
      });
      const balanceAfter = JSON.parse(accAfter.body).data.currentBalance;
      expect(balanceAfter).toBe(balanceBefore);
    });
  });

  // =========================================================================
  // JOURNEY D: Chart Screenshots & Attachments Lifecycle
  // =========================================================================
  describe('Journey D: Chart Screenshots & Attachments Lifecycle', () => {
    let tradeDId: string;
    let attachmentDId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'ITC',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          exitTime: '2026-10-18T11:00:00.000Z',
          simpleExecution: {
            entryPrice: 420,
            exitPrice: 430,
            quantity: 200,
          },
        },
      });
      tradeDId = JSON.parse(res.body).data.id;
    });

    it('D1: Uploads valid PNG chart attachment with category and metadata', async () => {
      const boundary = '----WebKitFormBoundaryD1Test';
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nSETUP\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n15m Bull Flag Breakout\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timeframe"\r\n\r\n15m\r\n`),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chart_15m.png"\r\nContent-Type: image/png\r\n\r\n`
        ),
        validPngBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attachments/trades/${tradeDId}/upload`,
        headers: {
          cookie: userAAuthCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.category).toBe('SETUP');
      expect(body.data.caption).toBe('15m Bull Flag Breakout');
      expect(body.data.timeframe).toBe('15m');
      attachmentDId = body.data.id;
    });

    it('D2: Reopens trade and verifies attachment list and image streaming', async () => {
      // Verify attachment appears on trade
      const tradeRes = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${tradeDId}`,
        headers: { cookie: userAAuthCookie },
      });
      const t = JSON.parse(tradeRes.body).data;
      expect(t.attachments.length).toBe(1);
      expect(t.attachments[0].id).toBe(attachmentDId);

      // Stream attachment
      const streamRes = await app.inject({
        method: 'GET',
        url: `/api/v1/attachments/${attachmentDId}/stream`,
        headers: { cookie: userAAuthCookie },
      });
      expect(streamRes.statusCode).toBe(200);
      expect(streamRes.headers['content-type']).toBe('image/png');
      expect(streamRes.rawPayload.length).toBe(validPngBuffer.length);
    });

    it('D3: Deleting trade cascades and permanently deletes attachment record and private disk file', async () => {
      const attRecord = await Attachment.findById(attachmentDId);
      expect(attRecord).toBeDefined();
      const filePath = path.join(config.uploadDir, attRecord!.storedFilename);
      expect(fs.existsSync(filePath)).toBe(true);

      // Delete the trade
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/trades/${tradeDId}`,
        headers: { cookie: userAAuthCookie },
      });
      expect(delRes.statusCode).toBe(200);

      // Verify Attachment record deleted
      const attAfter = await Attachment.findById(attachmentDId);
      expect(attAfter).toBeNull();

      // Verify disk file deleted
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  // =========================================================================
  // JOURNEY E: Daily Journaling & Calendar Reviews
  // =========================================================================
  describe('Journey E: Daily Journaling & Calendar Reviews', () => {
    it('E1: Upserts daily journal review with emotional state, discipline score, and market bias', async () => {
      const dateStr = '2026-10-18';
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/journal/${dateStr}`,
        headers: { cookie: userAAuthCookie },
        payload: {
          marketBias: 'BULLISH',
          emotionalState: 'CONFIDENT',
          disciplineRating: 5,
          preMarketNotes: 'Watched key swing level at 50000 on BankNifty',
          notes: 'Executed according to plan with strict position sizing',
          lessonsLearned: 'Patience at open paid off',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.disciplineRating).toBe(5);
      expect(body.data.marketBias).toBe('BULLISH');
    });

    it('E2: Retrieves monthly calendar summary aggregating trade metrics and journal reviews', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/calendar?yearMonth=2026-10',
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.yearMonth).toBe('2026-10');

      const day18 = body.data.days.find((d: any) => d.date === '2026-10-18');
      expect(day18).toBeDefined();
      expect(day18.hasJournal).toBe(true);
      expect(day18.disciplineRating).toBe(5);
      expect(day18.marketBias).toBe('BULLISH');
      expect(day18.tradesCount).toBeGreaterThan(0);
    });

    it('E3: Retrieves daily breakdown including trade details and net P&L summary', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/2026-10-18',
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.journal.disciplineRating).toBe(5);
      expect(body.data.summary.tradesCount).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // JOURNEY F: Strategy Playbook & Checklists
  // =========================================================================
  describe('Journey F: Strategy Playbook & Checklists', () => {
    let strategyId: string;

    it('F1: Creates a trading strategy with checklist and rules', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/strategies',
        headers: { cookie: userAAuthCookie },
        payload: {
          name: 'High Tight Flag',
          description: 'Momentum continuation pattern on high relative volume',
          assetClasses: ['EQUITY'],
          timeframes: ['15m', '1h', '1D'],
          entryRules: ['Consolidation pullback <= 20%', 'Volume contraction on pullback'],
          stopLossRules: ['Below lower consolidation pivot'],
          targetRules: ['2x pole length projection'],
          checklist: ['Earnings > 2 weeks away', 'Market regime trending upwards'],
          minRiskReward: 2.0,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('High Tight Flag');
      strategyId = body.data._id;
    });

    it('F2: Rejects duplicate strategy name with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/strategies',
        headers: { cookie: userAAuthCookie },
        payload: {
          name: 'High Tight Flag',
          description: 'Another copy',
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('DUPLICATE_STRATEGY');
    });

    it('F3: Links trade to strategy and computes strategy performance analytics', async () => {
      // Create closed winning trade linked to strategy
      await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          strategyId,
          symbol: 'BEL',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'CLOSED',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          exitTime: '2026-10-18T11:00:00.000Z',
          simpleExecution: {
            entryPrice: 300,
            exitPrice: 320,
            quantity: 100,
          },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/strategies',
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const strat = body.data.find((s: any) => s.id === strategyId);
      expect(strat).toBeDefined();
      expect(strat.totalTrades).toBe(1);
      expect(strat.winRate).toBe(100);
      expect(strat.netPnL).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // JOURNEY G: Filtering, Analytics & Psychology Breakdown
  // =========================================================================
  describe('Journey G: Filtering, Analytics & Psychology Breakdown', () => {
    it('G1: GET /api/v1/analytics/psychology computes discipline and mistake impact', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/psychology',
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.performanceByDiscipline).toBeDefined();
      expect(body.data.performanceByEmotion).toBeDefined();
      expect(body.data.mistakeAnalysis).toBeDefined();
    });

    it('G2: GET /api/v1/dashboard/stats computes win rate, profit factor, and equity curve', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dashboard/stats?accountId=${accountAId}`,
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const stats = body.data;
      expect(stats.closedTradesCount).toBeGreaterThan(0);
      expect(stats.netPnL).toBeGreaterThan(0);
      expect(stats.winRate).toBeGreaterThan(0);
      expect(stats.equityCurve.length).toBeGreaterThan(0);
      expect(stats.equityCurve[0].cumulativeEquity).toBeGreaterThanOrEqual(200000);
    });
  });

  // =========================================================================
  // JOURNEY H: Import / Export & Deduplication
  // =========================================================================
  describe('Journey H: Import / Export & Deduplication', () => {
    it('H1: Exports user trades to CSV with proper headers and content', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/export/csv?accountId=${accountAId}`,
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="tradevault-export-');
      expect(res.body).toContain('TradeDate,Account,Symbol,AssetClass,Direction,Status');
      expect(res.body).toContain('TCS');
    });

    it('H2: Exports user trades to JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/export/json?accountId=${accountAId}`,
        headers: { cookie: userAAuthCookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const trades = JSON.parse(res.body);
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
    });

    it('H3: Previews uploaded CSV and detects column mapping automatically', async () => {
      const csvData = [
        'Date,Symbol,Side,Price,Exit,Qty,Fees',
        '2026-10-15,WIPRO,BUY,450,470,100,25',
        '2026-10-15,HCLTECH,BUY,1800,1850,50,30',
      ].join('\r\n');

      const boundary = '----WebKitFormBoundaryH3Test';
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="trades.csv"\r\nContent-Type: text/csv\r\n\r\n`
        ),
        Buffer.from(csvData),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/export/import/preview',
        headers: {
          cookie: userAAuthCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.totalRows).toBe(2);
      expect(body.data.suggestedMapping.symbol).toBe('Symbol');
      expect(body.data.suggestedMapping.tradeDate).toBe('Date');
      expect(body.data.suggestedMapping.entryPrice).toBe('Price');
      expect(body.data.suggestedMapping.exitPrice).toBe('Exit');
      expect(body.data.suggestedMapping.quantity).toBe('Qty');
    });

    it('H4: Commits CSV trades, reconciles account, and rejects duplicates on re-import', async () => {
      const rows = [
        { Date: '2026-10-15', Symbol: 'WIPRO', Side: 'BUY', Price: '450', Exit: '470', Qty: '100', Fees: '25' },
      ];
      const mapping = {
        tradeDate: 'Date',
        symbol: 'Symbol',
        direction: 'Side',
        entryPrice: 'Price',
        exitPrice: 'Exit',
        quantity: 'Qty',
        totalCosts: 'Fees',
      };

      // First import
      const commitRes1 = await app.inject({
        method: 'POST',
        url: '/api/v1/export/import/commit',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          rows,
          mapping,
        },
      });

      expect(commitRes1.statusCode).toBe(200);
      const body1 = JSON.parse(commitRes1.body);
      expect(body1.data.importedCount).toBe(1);
      expect(body1.data.duplicateCount).toBe(0);

      // Re-import identical row -> Must be identified as duplicate
      const commitRes2 = await app.inject({
        method: 'POST',
        url: '/api/v1/export/import/commit',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          rows,
          mapping,
        },
      });

      expect(commitRes2.statusCode).toBe(200);
      const body2 = JSON.parse(commitRes2.body);
      expect(body2.data.importedCount).toBe(0);
      expect(body2.data.duplicateCount).toBe(1); // Successfully prevented duplicate!
    });
  });

  // =========================================================================
  // SECURITY & AUTHORIZATION TESTS
  // =========================================================================
  describe('Security & Authorization Boundaries', () => {
    let userATradeId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountAId,
          symbol: 'SEC_TEST',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'OPEN',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          simpleExecution: {
            entryPrice: 100,
            quantity: 10,
          },
        },
      });
      userATradeId = JSON.parse(res.body).data.id;
    });

    it('S1: Unauthenticated request to /trades is rejected with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades',
      });
      expect(res.statusCode).toBe(401);
    });

    it('S2: User B cannot view User A trade (returns 404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/${userATradeId}`,
        headers: { cookie: userBAuthCookie },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('TRADE_NOT_FOUND');
    });

    it('S3: User B cannot modify User A trade (returns 404)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/trades/${userATradeId}`,
        headers: { cookie: userBAuthCookie },
        payload: {
          symbol: 'HACKED',
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('S4: User B cannot delete User A trade (returns 404)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/trades/${userATradeId}`,
        headers: { cookie: userBAuthCookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it('S5: User A cannot create trade referencing User B account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trades',
        headers: { cookie: userAAuthCookie },
        payload: {
          accountId: accountBId, // User B account
          symbol: 'INVALID_REF',
          assetClass: 'EQUITY',
          exchange: 'NSE',
          marketSegment: 'NSE_EQ',
          direction: 'LONG',
          status: 'OPEN',
          tradeDate: '2026-10-18',
          entryTime: '2026-10-18T10:00:00.000Z',
          simpleExecution: {
            entryPrice: 100,
            quantity: 10,
          },
        },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('S6: Malformed ObjectId parameter returns 400 INVALID_ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trades/malformed--id',
        headers: { cookie: userAAuthCookie },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('INVALID_ID');
    });

    it('S7: Updates user profile and preferences in settings', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings/profile',
        headers: { cookie: userAAuthCookie },
        payload: {
          theme: 'dark',
          name: 'QA Pro Trader',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.theme).toBe('dark');
      expect(body.data.name).toBe('QA Pro Trader');
    });
  });
});
