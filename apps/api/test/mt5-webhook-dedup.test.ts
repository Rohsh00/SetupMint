import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
});
