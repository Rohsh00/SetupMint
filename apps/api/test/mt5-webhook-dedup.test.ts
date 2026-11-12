import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { TradingAccount, Trade, User } from '../src/db/models/index.js';

describe('MetaTrader 5 / Elefin Webhook Duplicate Fill Prevention & Self-Healing', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  let accountId: string;
  const testTicket = '14330300';

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register test user
    const testEmail = `elefin_trader_${Date.now()}@tradevault.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: 'Password@123',
        name: 'Elefin Trader',
        baseCurrency: 'USD',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    userId = body.data.user.id;

    const cookies = res.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    // Create active Elefin Trading Account
    const acc = await TradingAccount.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Elefin Live',
      broker: 'Elefin',
      accountType: 'FOREX',
      baseCurrency: 'USD',
      initialBalance: mongoose.Types.Decimal128.fromString('10000.00'),
      currentBalance: mongoose.Types.Decimal128.fromString('10000.00'),
      status: 'ACTIVE',
    });
    accountId = acc._id.toString();
  });

  afterAll(async () => {
    if (userId) {
      await Trade.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await TradingAccount.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await User.deleteOne({ _id: new mongoose.Types.ObjectId(userId) });
    }
    await app.close();
    await disconnectDatabase();
  });

  it('creates an untracked closed trade with exactly 1 entry and 1 exit fill', async () => {
    const payload = {
      action: 'CLOSE',
      ticket: testTicket,
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.01,
      price: 4118.18,
      close_price: 4116.12,
      profit: -2.06,
      commission: 0,
      swap: 0,
      open_time: '2026-11-10 12:51:00',
      close_time: '2026-11-10 13:05:00',
    };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);

    const savedTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${testTicket}`,
    });

    expect(savedTrade).toBeDefined();
    expect(savedTrade?.status).toBe('CLOSED');
    expect(savedTrade?.fills?.length).toBe(2);

    const entries = savedTrade?.fills?.filter((f: any) => f.type === 'ENTRY') || [];
    const exits = savedTrade?.fills?.filter((f: any) => f.type === 'EXIT') || [];
    expect(entries.length).toBe(1);
    expect(exits.length).toBe(1);
    expect(entries[0].quantity).toBe(0.01);
    expect(exits[0].quantity).toBe(0.01);
  });

  it('rejects duplicate webhook delivery without adding a second exit fill', async () => {
    // Send the exact same closed deal payload again (simulating repeated MT5 webhook call)
    const payload = {
      action: 'CLOSE',
      ticket: testTicket,
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.01,
      close_price: 4116.12,
      profit: -2.06,
      commission: 0,
      swap: 0,
      close_time: '2026-11-10 13:05:00',
    };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.results[0].status).toBe('ALREADY_CLOSED');

    const tradeAfter = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${testTicket}`,
    });

    // Fills must STILL be exactly 2 (1 entry, 1 exit) — NOT 3!
    expect(tradeAfter?.fills?.length).toBe(2);
    const exits = tradeAfter?.fills?.filter((f: any) => f.type === 'EXIT') || [];
    expect(exits.length).toBe(1);
    expect(exits[0].quantity).toBe(0.01);
  });

  it('self-heals existing corrupted trades when loaded via GET /api/v1/trades/:id', async () => {
    // Manually inject a duplicate exit fill (reproducing the exact state from user screenshot)
    const trade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${testTicket}`,
    });
    expect(trade).toBeDefined();

    trade!.fills.push({
      fillId: `mt5_${testTicket}_exit`,
      timestamp: new Date('2026-11-10T13:05:00Z'),
      type: 'EXIT',
      price: 4116.12,
      quantity: 0.01,
      fee: 0,
    } as any);
    await trade!.save();

    // Verify it is corrupted in DB (3 fills: 1 entry, 2 exits = 0.02)
    const corruptedInDb = await Trade.findById(trade!._id);
    expect(corruptedInDb?.fills?.length).toBe(3);

    // Call GET /api/v1/trades/:id
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${trade!._id}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    // Returned fills must be healed to 2
    expect(body.data.fills.length).toBe(2);
    const exitFills = body.data.fills.filter((f: any) => f.type === 'EXIT');
    expect(exitFills.length).toBe(1);
    expect(exitFills[0].quantity).toBe(0.01);

    // Database document must also be healed
    const healedInDb = await Trade.findById(trade!._id);
    expect(healedInDb?.fills?.length).toBe(2);
  });

  it('handles tracked OPEN position -> CLOSE -> duplicate CLOSE correctly', async () => {
    const openTicket = '14330999';

    // 1. Position opened in MT5
    const openPayload = {
      positions: [
        {
          ticket: openTicket,
          symbol: 'XAUUSD',
          type: 'BUY',
          volume: 0.02,
          price: 4120.00,
          open_time: '2026-11-10 14:00:00',
        },
      ],
    };

    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: openPayload,
    });
    expect(openRes.statusCode).toBe(200);

    const openTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${openTicket}`,
    });
    expect(openTrade?.status).toBe('OPEN');
    expect(openTrade?.fills?.length).toBe(1);
    expect(openTrade?.fills[0].quantity).toBe(0.02);

    // 2. Position closed in MT5 (Full close)
    const closePayload = {
      action: 'CLOSE',
      ticket: openTicket,
      deal_id: '99901',
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.02,
      close_price: 4125.00,
      profit: 10.00,
      close_time: '2026-11-10 14:15:00',
    };

    const closeRes1 = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: closePayload,
    });
    expect(closeRes1.statusCode).toBe(200);

    const closedTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${openTicket}`,
    });
    expect(closedTrade?.status).toBe('CLOSED');
    expect(closedTrade?.fills?.length).toBe(2);
    expect(closedTrade?.calculated?.openQuantity).toBe(0);
    expect(closedTrade?.calculated?.closedQuantity).toBe(0.02);

    // 3. Second webhook delivery (simulating MT5 EA duplicate event)
    const closeRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: closePayload,
    });
    expect(closeRes2.statusCode).toBe(200);
    const body2 = JSON.parse(closeRes2.body);
    expect(body2.results[0].status).toBe('ALREADY_CLOSED');

    const closedTradeAfter = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${openTicket}`,
    });
    // Must remain 2 fills, NEVER 3!
    expect(closedTradeAfter?.fills?.length).toBe(2);
    expect(closedTradeAfter?.calculated?.openQuantity).toBe(0);
    expect(closedTradeAfter?.calculated?.closedQuantity).toBe(0.02);
  });

  it('does NOT close an open position when receiving an empty positions payload (mobile SL modification glitch)', async () => {
    const slTicket = '14688656';

    // 1. Open trade with no stop loss (naked trade, exactly reproducing user scenario)
    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        positions: [
          {
            ticket: slTicket,
            symbol: 'XAUUSD',
            type: 'BUY',
            volume: 0.02,
            price: 3982.23,
            cur_price: 3982.23,
            sl: 0,
            open_time: '2026-11-12 09:27:09',
          },
        ],
      },
    });
    expect(openRes.statusCode).toBe(200);

    const openTrade = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${slTicket}`,
    });
    expect(openTrade).toBeDefined();
    expect(openTrade?.status).toBe('OPEN');
    expect(openTrade?.fills?.length).toBe(1);

    // 2. User modifies SL on mobile MT5 -> transient order deletion causes empty positions: []
    const emptyPayloadRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        positions: [],
      },
    });
    expect(emptyPayloadRes.statusCode).toBe(200);

    // Trade MUST STILL BE OPEN! Not auto-closed!
    const tradeAfterEmpty = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${slTicket}`,
    });
    expect(tradeAfterEmpty?.status).toBe('OPEN');
    expect(tradeAfterEmpty?.fills?.length).toBe(1);

    // 3. Milliseconds later: MT5 reports the position with the new Stop Loss set on mobile
    const slSetRes = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        positions: [
          {
            ticket: slTicket,
            symbol: 'XAUUSD',
            type: 'BUY',
            volume: 0.02,
            price: 3982.23,
            cur_price: 3982.20,
            sl: 3975.00,
            open_time: '2026-11-12 09:27:09',
          },
        ],
      },
    });
    expect(slSetRes.statusCode).toBe(200);

    const tradeWithSl = await Trade.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      tags: `MT5_TICKET_${slTicket}`,
    });
    expect(tradeWithSl?.status).toBe('OPEN');
    expect(tradeWithSl?.risk?.initialStopLoss).toBe(3975.00);
    expect(tradeWithSl?.risk?.currentStopLoss).toBe(3975.00);
    expect(tradeWithSl?.fills?.length).toBe(1);
  });

  it('serializes concurrent MT5 OPEN webhooks so duplicate Trade docs are never created for the same ticket', async () => {
    const raceTicket = '14746901';
    const openPayload = {
      positions: [
        {
          ticket: raceTicket,
          symbol: 'XAUUSD',
          type: 'BUY',
          volume: 0.04,
          price: 3938.55,
          cur_price: 3939.00,
          open_time: '2026-11-12 09:39:28',
        },
      ],
    };

    // Simulate OnTradeTransaction + OnTimer arriving concurrently milliseconds apart
    const [res1, res2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
        payload: openPayload,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
        payload: openPayload,
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const docs = await Trade.find({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      tags: `MT5_TICKET_${raceTicket}`,
    });
    expect(docs.length).toBe(1);
    expect(docs[0].status).toBe('OPEN');

    // Clean up via CLOSE so subsequent empty-snapshot tests remain isolated
    await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        action: 'CLOSE',
        ticket: raceTicket,
        deal_id: '21213901',
        symbol: 'XAUUSD',
        type: 'BUY',
        volume: 0.04,
        open_price: 3938.55,
        close_price: 3940.55,
        profit: 8.0,
        close_time: '2026-11-12 09:42:00',
      },
    });
  });

  it('closes orphaned OPEN trade after persistent empty positions:[] (>= 5 cycles & >= 15s) and removes duplicate OPEN shells when closed sibling exists', async () => {
    const orphanTicket = '14746902';
    const dupTicket = '14746422';

    // Open orphanTicket via webhook
    await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        positions: [
          {
            ticket: orphanTicket,
            symbol: 'XAUUSD',
            type: 'BUY',
            volume: 0.02,
            price: 3940.0,
            cur_price: 3941.0,
            open_time: '2026-11-12 09:40:00',
          },
        ],
      },
    });

    // Also simulate a legacy pre-existing duplicate pair for dupTicket:
    // one CLOSED trade and one orphaned OPEN duplicate with the same MT5_TICKET tag
    await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
      payload: {
        action: 'CLOSE',
        ticket: dupTicket,
        deal_id: '21213198',
        symbol: 'XAUUSD',
        type: 'BUY',
        volume: 0.04,
        open_price: 3938.55,
        close_price: 3942.34,
        profit: 15.16,
        close_time: '2026-11-12 09:44:15',
      },
    });

    await Trade.create({
      userId: new mongoose.Types.ObjectId(userId),
      accountId: new mongoose.Types.ObjectId(accountId),
      symbol: 'XAUUSD',
      assetClass: 'FOREX',
      exchange: 'FOREX',
      marketSegment: 'FOREX',
      currency: 'USD',
      direction: 'LONG',
      status: 'OPEN',
      tags: ['ELEFIN', 'MT5', `MT5_TICKET_${dupTicket}`],
      tradeDate: new Date('2026-11-12T09:39:28Z'),
      entryTime: new Date('2026-11-12T09:39:28Z'),
      executionMode: 'SIMPLE',
      simpleExecution: {
        entryPrice: 3938.55,
        quantity: 0.04,
        contractMultiplier: 100,
        brokerage: 0,
        exchangeFees: 0,
        regulatoryFees: 0,
        taxes: 0,
        otherFees: 0,
        explicitAdjustments: 0,
      },
      fills: [
        {
          fillId: `mt5_${dupTicket}_entry`,
          timestamp: new Date('2026-11-12T09:39:28Z'),
          type: 'ENTRY',
          price: 3938.55,
          quantity: 0.04,
          fee: 0,
        },
      ],
      calculated: {
        averageEntryPrice: 3938.55,
        openQuantity: 0.04,
        closedQuantity: 0,
        totalCosts: 0,
        grossPnL: 0,
        netPnL: 0,
        outcome: 'OPEN',
      },
    });

    let fakeNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    try {
      // Send 4 empty snapshots within < 15s -> must NOT close yet (debounce holds!)
      for (let i = 0; i < 4; i++) {
        fakeNow += 2000;
        const r = await app.inject({
          method: 'POST',
          url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
          payload: { positions: [] },
        });
        expect(r.statusCode).toBe(200);
      }

      const midOrphan = await Trade.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        tags: `MT5_TICKET_${orphanTicket}`,
      });
      expect(midOrphan?.status).toBe('OPEN');

      // 5th+ snapshot past 15s elapsed -> confirmed missing -> reconciles!
      fakeNow += 10000;
      const finalRes = await app.inject({
        method: 'POST',
        url: `/api/v1/integrations/mt5/webhook?token=${accountId}`,
        payload: { positions: [] },
      });
      expect(finalRes.statusCode).toBe(200);

      const resolvedOrphan = await Trade.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        tags: `MT5_TICKET_${orphanTicket}`,
      });
      expect(resolvedOrphan?.status).toBe('CLOSED');

      // Duplicate ticket must have ONLY the canonical CLOSED record left, NEVER 2 closed records!
      const dupDocs = await Trade.find({
        userId: new mongoose.Types.ObjectId(userId),
        tags: `MT5_TICKET_${dupTicket}`,
      });
      expect(dupDocs.length).toBe(1);
      expect(dupDocs[0].status).toBe('CLOSED');
      expect(dupDocs[0].calculated?.netPnL).toBe(15.16);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
