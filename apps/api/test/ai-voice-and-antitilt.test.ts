import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { User, Trade, TradingAccount, DailyJournal } from '../src/db/models/index.js';
import { AiVoiceJournalService } from '../src/services/ai-voice-journal.service.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { encryptSecret } from '../src/services/crypto.service.js';

describe('AI Voice-to-Journal & Behavioral Anti-Tilt Integration', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testAccountId: mongoose.Types.ObjectId;
  let testTradeId: mongoose.Types.ObjectId;
  const testChatId = '123456789';
  const testBotToken = '123456:ANTI_TILT_BOT_TOKEN';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await TradingAccount.deleteOne({ _id: testAccountId });
      await Trade.deleteMany({ userId: testUserId });
      await DailyJournal.deleteMany({ userId: testUserId });
    }
    await disconnectDatabase();
  });

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testAccountId = new mongoose.Types.ObjectId();
    testTradeId = new mongoose.Types.ObjectId();

    await User.create({
      _id: testUserId,
      email: `antitilt-${Date.now()}@test.local`,
      passwordHash: 'dummy_hash',
      name: 'Tilt Defender Trader',
      baseCurrency: 'USD',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: encryptSecret(testBotToken),
        telegramChatId: testChatId,
        hardDisciplineLockoutEnabled: true,
        hardDisciplineLockoutDurationMins: 45,
      },
    });

    await TradingAccount.create({
      _id: testAccountId,
      userId: testUserId,
      name: 'Personal Live Account',
      broker: 'OTHER',
      accountType: 'FOREX',
      currency: 'USD',
      baseCurrency: 'USD',
    });

    await Trade.create({
      _id: testTradeId,
      userId: testUserId,
      accountId: testAccountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      assetClass: 'COMMODITY',
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      currency: 'USD',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 3600000),
      exitTime: new Date(),
      simpleExecution: {
        entryPrice: 2650.0,
        exitPrice: 2640.0,
        quantity: 0.2,
      },
      calculated: {
        netPnL: -200.0,
        realizedRMultiple: -1.0,
      },
      screenshotIds: [],
      auditLog: [],
    });
  });

  it('AiVoiceJournalService transcribes audio buffer, detects mistakes, and updates trade and daily journal', async () => {
    const fakeAudio = Buffer.from('mock audio buffer data for voice journal reflection');

    const result = await AiVoiceJournalService.processVoiceMessage({
      userId: testUserId,
      audioBuffer: fakeAudio,
      mimeType: 'audio/webm',
      caption: 'Exited early because I was fearful. Violated stop discipline.',
      tradeId: testTradeId,
    });

    expect(result).toBeDefined();
    expect(result.journalDate).toBeTruthy();
    expect(result.disciplineScore).toBeGreaterThanOrEqual(1);

    // Verify trade was updated
    const updatedTrade = await Trade.findById(testTradeId);
    expect(updatedTrade).not.toBeNull();
    expect(updatedTrade?.psychology?.notes).toContain('Voice Reflection');
    expect(updatedTrade?.psychology?.emotionAfter).toBeTruthy();
    expect(updatedTrade?.psychology?.disciplineScore).toBeGreaterThanOrEqual(1);
    const voiceAudit = updatedTrade?.auditLog.find((a: any) => a.action === 'AI_VOICE_REFLECTION_PROCESSED');
    expect(voiceAudit).toBeDefined();

    // Verify DailyJournal for today was updated
    const todayStr = new Date().toISOString().slice(0, 10);
    const journal = await DailyJournal.findOne({ userId: testUserId, date: todayStr });
    expect(journal).not.toBeNull();
    expect(journal?.notes).toContain('Voice Reflection');
  });

  it('TelegramAlertService dispatches executive Anti-Tilt Lockout card', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 9999 } };
      }
    );

    const user = await User.findById(testUserId).lean();
    await TelegramAlertService.notifyAntiTiltLockout(user, 3, 450.0, 45, true);

    expect(sentMessages.length).toBe(1);
    const msg = sentMessages[0];
    expect(msg.text).toContain('BEHAVIORAL ANTI-TILT LOCKOUT ENGAGED');
    expect(msg.text).toContain('3 Consecutive Losses');
    expect(msg.text).toContain('45 minutes');
    expect(msg.text).toContain('AI Coach Directive');
  });

  it('validateTelegramOrderGuardrails enforces Behavioral Anti-Tilt Lockout when 3 consecutive losses occurred', async () => {
    // Create 3 consecutive losing trades today for the account
    const now = Date.now();
    for (let i = 1; i <= 3; i++) {
      await Trade.create({
        userId: testUserId,
        accountId: testAccountId,
        symbol: `LOSS_${i}`,
        direction: 'LONG',
        marketSegment: 'FOREX',
        exchange: 'FOREX',
        assetClass: 'COMMODITY',
        status: 'CLOSED',
        tradeDate: new Date(),
        entryTime: new Date(now - (i + 1) * 600000),
        exitTime: new Date(now - i * 60000), // very recent (minutes ago)
        calculated: {
          netPnL: -100,
        },
      });
    }

    const user = await User.findById(testUserId).lean();
    const account = await TradingAccount.findById(testAccountId).lean();

    const guardrailResult = await TelegramAlertService.evaluateOrderGuardrails(
      user,
      account,
      'XAUUSD',
      'BUY',
      0.1,
      25, // slPoints
      50, // tpPoints
      2650.0, // ltp
      new Date() // quoteTimestamp
    );

    expect(guardrailResult.allowed).toBe(false);
    expect(guardrailResult.reason).toContain('BEHAVIORAL ANTI-TILT LOCKOUT ACTIVE');
    expect(guardrailResult.reason).toContain('consecutive losses');
  });
});
