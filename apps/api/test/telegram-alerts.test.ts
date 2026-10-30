import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  Trade,
  AlertState,
  AlertEvent,
  TelegramUpdateAudit,
  TelegramCallbackLock,
} from '../src/db/models/index.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { FyersService } from '../src/services/fyers.service.js';
import { encryptSecret, isEncryptedSecret } from '../src/services/crypto.service.js';

describe('SetupMint Telegram Alerting Engine Integration Tests', () => {
  let app: FastifyInstance;
  let userA: any;
  let userB: any;
  let tradeA: any;

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Clean up test data safely scoped to test fixtures
    await TelegramUpdateAudit.deleteMany({ updateId: { $in: [101, 102, 887766, 9001, 9002, 9003, 9004, 9005, 9101, 9102] } });
    await TelegramCallbackLock.deleteMany({});
    await AlertState.deleteMany({});
    await AlertEvent.deleteMany({});
    await Trade.deleteMany({ symbol: 'NIFTY 24500 CE' });
    await User.deleteMany({ email: { $regex: /@tradevault\.local$/ } });

    // Mock fetch for Telegram Bot API calls to prevent outgoing network requests
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.telegram.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 12345, text: 'Sent' },
            description: 'Success',
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    // Create User A with Telegram configured
    const plainTokenA = '123456789:ABCdefGhIJKlmnoPQRstuVWXyz123456';
    userA = await User.create({
      email: `telegram_user_a_${Date.now()}@tradevault.local`,
      passwordHash: 'dummy_hash',
      name: 'Trader Alpha',
      baseCurrency: 'INR',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: encryptSecret(plainTokenA),
        telegramChatId: '10000001',
        slippageGuardPercent: 0.5,
      },
    });

    // Create User B with distinct chatId
    userB = await User.create({
      email: `telegram_user_b_${Date.now()}@tradevault.local`,
      passwordHash: 'dummy_hash',
      name: 'Trader Beta',
      baseCurrency: 'INR',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: encryptSecret('987654321:XYZabcDefGhiJklMnoPqrStuVwx987654'),
        telegramChatId: '20000002',
      },
    });

    // Create Open Trade for User A
    tradeA = await Trade.create({
      userId: userA._id,
      accountId: new mongoose.Types.ObjectId(),
      exchange: 'NSE',
      marketSegment: 'NSE_FNO',
      symbol: 'NIFTY 24500 CE',
      assetClass: 'OPTIONS',
      direction: 'LONG',
      status: 'OPEN',
      quantity: 50,
      simpleExecution: {
        entryPrice: 100.0,
        quantity: 50,
      },
      tradeDate: '2026-10-30',
      entryTime: new Date(),
      risk: {
        initialStopLoss: 90.0,
        currentStopLoss: 90.0,
      },
      calculated: {
        openQuantity: 50,
        averageEntryPrice: 100.0,
        liveMfeSummary: { peakLtp: 105.0, peakUnrealizedR: 0.5 },
      },
      auditLog: [],
    });
  }, 30000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('1. Webhook Secret Token Verification rejects unauthenticated webhook requests', async () => {
    // Missing or invalid secret token header -> 401
    const resUnauthorized = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/telegram/webhook',
      payload: { update_id: 101, message: { text: '/pnl' } },
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-token' },
    });
    expect(resUnauthorized.statusCode).toBe(401);

    // Valid secret token -> 200 OK
    const expectedSecret = TelegramAlertService.getWebhookSecretToken();
    const resAuthorized = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/telegram/webhook',
      payload: { update_id: 102, message: { text: '/help' } },
      headers: { 'x-telegram-bot-api-secret-token': expectedSecret },
    });
    expect(resAuthorized.statusCode).toBe(200);
    expect(JSON.parse(resAuthorized.body).ok).toBe(true);
  });

  it('2. Webhook update_id idempotency prevents duplicate update processing', async () => {
    const updateId = 887766;
    const updatePayload = {
      update_id: updateId,
      message: {
        chat: { id: 10000001 },
        text: '/summary',
      },
    };

    // First processing creates an audit record
    await TelegramAlertService.processWebhookUpdate(updatePayload);
    const auditCount1 = await TelegramUpdateAudit.countDocuments({ updateId });
    expect(auditCount1).toBe(1);

    // Duplicate delivery is safely dropped without error
    await TelegramAlertService.processWebhookUpdate(updatePayload);
    const auditCount2 = await TelegramUpdateAudit.countDocuments({ updateId });
    expect(auditCount2).toBe(1);
  });

  it('3. Double-tap callback idempotency guarantees exactly one broker order', async () => {
    const executeSpy = vi.spyOn(FyersService, 'executeBrokerExit').mockResolvedValue({
      executedOnBroker: true,
      tradedPrice: 102.5,
      orderId: 'FYERS-ORD-111',
    } as any);

    const callbackQuery = {
      id: 'cq_double_tap_1',
      from: { id: 10000001 },
      message: {
        chat: { id: 10000001 },
        message_id: 5544,
        text: 'Live alert card',
      },
      data: `x:${tradeA._id}:E:1:105.0`,
    };

    // Simulate two concurrent button taps on the mobile phone
    await Promise.all([
      TelegramAlertService.processWebhookUpdate({ update_id: 9101, callback_query: callbackQuery }),
      TelegramAlertService.processWebhookUpdate({ update_id: 9102, callback_query: callbackQuery }),
    ]);

    // Exactly 1 broker order should be dispatched
    expect(executeSpy).toHaveBeenCalledTimes(1);
    executeSpy.mockRestore();
  });

  it('4. Stale cardVersion prevents outdated button executions', async () => {
    const executeSpy = vi.spyOn(FyersService, 'executeBrokerExit').mockResolvedValue({
      executedOnBroker: true,
      tradedPrice: 101.0,
    } as any);

    // Set cardVersion in DB to 3
    await AlertState.create({
      userId: userA._id,
      tradeId: tradeA._id,
      type: 'STOP_THREAT',
      state: 'ACTIVE',
      severity: 2,
      enterCount: 1,
      cardVersion: 3,
      chatId: '10000001',
      messageId: 5544,
      firstAt: new Date(),
      lastSentAt: new Date(),
    });

    // Callback arrives with outdated cardVersion 1
    const callbackQuery = {
      id: 'cq_stale_1',
      from: { id: 10000001 },
      message: {
        chat: { id: 10000001 },
        message_id: 5544,
        text: 'Stale card',
      },
      data: `x:${tradeA._id}:E:1:100.0`,
    };

    await TelegramAlertService.processWebhookUpdate({ update_id: 9003, callback_query: callbackQuery });

    // Order must NOT have been executed
    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it('5. Tenant isolation blocks User B from triggering User A trade actions', async () => {
    const executeSpy = vi.spyOn(FyersService, 'executeBrokerExit');

    // User B (chatId 20000002) attempts to trigger action on tradeA (owned by User A)
    const hostileCallback = {
      id: 'cq_hostile_1',
      from: { id: 20000002 },
      message: {
        chat: { id: 20000002 },
        message_id: 7788,
        text: 'Hostile attack',
      },
      data: `x:${tradeA._id}:E:3:100.0`,
    };

    await TelegramAlertService.processWebhookUpdate({ update_id: 9004, callback_query: hostileCallback });

    // Broker exit must never be called for unauthorized user
    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it('6. True Breakeven sanity check omits Lock BE button when unprofitable', () => {
    // True BE for tradeA is 100.5. Current LTP = 98.0 (Loss side).
    const buttonsUnprofitable = TelegramAlertService.buildContextualKeyboard(
      tradeA,
      'STOP_THREAT',
      98.0,
      1
    );
    const hasLockBeUnprofitable = buttonsUnprofitable.some((row) =>
      row.some((b) => b.text.includes('Lock BE'))
    );
    expect(hasLockBeUnprofitable).toBe(false);

    // Current LTP = 104.0 (Profitable side > 100.5).
    const buttonsProfitable = TelegramAlertService.buildContextualKeyboard(
      tradeA,
      'STOP_THREAT',
      104.0,
      1
    );
    const hasLockBeProfitable = buttonsProfitable.some((row) =>
      row.some((b) => b.text.includes('Lock BE'))
    );
    expect(hasLockBeProfitable).toBe(true);
  });

  it('7. Slippage guard pauses execution when market price drifts beyond threshold', async () => {
    const executeSpy = vi.spyOn(FyersService, 'executeBrokerExit');

    // User clicked at 100.0, but market price drifted to 104.0 (+4% > 0.5% guard)
    const callbackWithSlippage = {
      id: 'cq_slippage_1',
      from: { id: 10000001 },
      message: {
        chat: { id: 10000001 },
        message_id: 9911,
        text: 'Live Card',
      },
      data: `x:${tradeA._id}:E:3:100.0`,
    };

    // Update trade calculated LTP to 104.0
    tradeA.calculated.liveMfeSummary.peakLtp = 104.0;
    await tradeA.save();

    await TelegramAlertService.processWebhookUpdate({ update_id: 9005, callback_query: callbackWithSlippage });

    // Immediate execution must be halted pending user confirmation
    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it('8. Trade closed marks all active AlertStates as RESOLVED', async () => {
    // Verify AlertState was ACTIVE
    const existingActive = await AlertState.findOne({ userId: userA._id, tradeId: tradeA._id });
    expect(existingActive?.state).toBe('ACTIVE');

    // Notify trade closed
    await TelegramAlertService.notifyTradeClosed(userA, tradeA, {
      netPnL: 250.0,
      realizedR: 1.25,
      exitPrice: 105.0,
    });

    const resolvedAlert = await AlertState.findOne({ userId: userA._id, tradeId: tradeA._id });
    expect(resolvedAlert?.state).toBe('RESOLVED');
    expect(resolvedAlert?.resolvedAt).toBeDefined();
  });

  it('9. Token encryption at rest and leak prevention via toJSON', async () => {
    // Verify bot token is stored encrypted with enc:v1: prefix in database
    const rawUserDoc = await User.findById(userA._id).lean();
    const dbToken = rawUserDoc?.liveWatcherSettings?.telegramBotToken;
    expect(isEncryptedSecret(dbToken)).toBe(true);
    expect(dbToken?.startsWith('enc:v1:')).toBe(true);

    // Verify User.toJSON() completely strips telegramBotToken
    const userInstance = await User.findById(userA._id);
    const jsonRep = userInstance?.toJSON();
    expect(jsonRep?.liveWatcherSettings?.telegramBotToken).toBeUndefined();
  });
});
