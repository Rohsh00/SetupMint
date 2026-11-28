import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { User, Trade, TradingAccount, DailyJournal } from '../src/db/models/index.js';
import { AiVoiceJournalService } from '../src/services/ai-voice-journal.service.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { LiveExecutionWorker } from '../src/services/live-execution-worker.service.js';
import { EconomicCalendarService } from '../src/services/economic-calendar.service.js';
import { LiveWatcherService } from '../src/services/live-watcher.service.js';
import { ExecutionPipelineService } from '../src/services/execution-pipeline.service.js';
import { AiCopilotService } from '../src/services/ai-copilot.service.js';
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

  it('handles Telegram /check pre-flight command and formats verification card', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 9991 } };
      }
    );

    const msg = {
      chat: { id: testChatId },
      from: { id: testChatId },
      text: '/check XAUUSD BUY 2650 2640 2680',
    };

    // Invoke text message handler
    await (TelegramAlertService as any).handleTextMessage(msg, testBotToken);

    // Expect response with verdict and checklist
    const verdictMsg = sentMessages.find(m => m.text.includes('Pre-Flight Verdict'));
    expect(verdictMsg).toBeDefined();
    expect(verdictMsg.text).toContain('Asset:</b> XAUUSD (LONG)');
    expect(verdictMsg.text).toContain('Entry:</b> 2650');
    expect(verdictMsg.text).toContain('SL:</b> 2640');
    expect(verdictMsg.text).toContain('TP:</b> 2680');
    expect(verdictMsg.text).toContain('R:R Ratio:');
  });

  it('handles Telegram /edge unsupervised mining command', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 9992 } };
      }
    );

    const msg = {
      chat: { id: testChatId },
      from: { id: testChatId },
      text: '/edge',
    };

    await (TelegramAlertService as any).handleTextMessage(msg, testBotToken);

    const edgeMsg = sentMessages.find(m => m.text.includes('Edge Report') || m.text.includes('Statistical Edge Mining'));
    expect(edgeMsg).toBeDefined();
  });

  it('routes conversational plain text question to Copilot fallback', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 9993 } };
      }
    );

    vi.spyOn(AiCopilotService, 'askCopilot').mockResolvedValue({
      conversationId: 'mock-conv-id',
      message: {
        role: 'ASSISTANT',
        content: 'Your win rate on XAUUSD is 65% with an expectancy of +1.2R.',
        timestamp: new Date().toISOString(),
        modelUsed: 'Quant Deterministic Engine',
      },
    } as any);

    const msg = {
      chat: { id: testChatId },
      from: { id: testChatId },
      text: 'what is my win rate on XAUUSD?',
    };

    await (TelegramAlertService as any).handleTextMessage(msg, testBotToken);

    const copilotMsg = sentMessages.find(m => m.text.includes('SetupMint Copilot'));
    expect(copilotMsg).toBeDefined();
    expect(copilotMsg.text).toContain('65%');
  });

  it('executes Macro News Event Shield trailing stop loss to breakeven 3 minutes before red-folder news when trade >= +0.8R', async () => {
    // 1. Mock upcoming red-folder news releasing in 2 minutes
    vi.spyOn(EconomicCalendarService, 'getUpcomingGoldNews').mockResolvedValue([
      {
        id: 'mock_nfp_event',
        title: 'Non-Farm Employment Change',
        country: 'USD',
        impact: 'HIGH',
        isGoldMover: true,
        timestamp: new Date(Date.now() + 2 * 60000).toISOString(),
        istTimeStr: '19:00 IST',
        countdownStr: 'in 2 mins',
        minutesUntil: 2,
        forecast: '180K',
        previous: '160K',
        status: 'IMMINENT',
      } as any,
    ]);

    // 2. Create an open trade with profit >= +0.8R
    const openTrade = await Trade.create({
      userId: testUserId,
      accountId: testAccountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      assetClass: 'COMMODITY',
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 1800000),
      simpleExecution: {
        entryPrice: 2650.0,
        quantity: 0.1,
      },
      risk: {
        initialStopLoss: 2640.0,
        currentStopLoss: 2640.0,
      },
      tickSize: 0.1,
    });

    // 3. Mock live metric showing +1.5R unrealized profit
    vi.spyOn(LiveWatcherService, 'getSingleTradeLiveMetric').mockResolvedValue({
      tradeId: openTrade._id.toString(),
      symbol: 'XAUUSD',
      direction: 'LONG',
      currentLtp: 2665.0,
      entryPrice: 2650.0,
      stopLoss: 2640.0,
      initialStopLoss: 2640.0,
      unrealizedR: 1.5,
      floatingNetPnL: 150.0,
      lotSize: 0.1,
      quantity: 0.1,
      provider: 'MT5',
    } as any);

    let executedPipelineAction: any = null;
    vi.spyOn(ExecutionPipelineService, 'execute').mockImplementation(async (req: any) => {
      executedPipelineAction = req;
      return { success: true } as any;
    });

    const user = await User.findById(testUserId).lean();
    LiveExecutionWorker.resetMilestones();

    // 4. Evaluate trade via LiveExecutionWorker
    await (LiveExecutionWorker as any).evaluateTrade(user, openTrade.toObject(), false);

    expect(executedPipelineAction).not.toBeNull();
    expect(executedPipelineAction.action).toBe('MODIFY_STOP_LOSS');
    expect(executedPipelineAction.payload.stopPrice).toBeGreaterThanOrEqual(2650.0); // Breakeven + tick
  });

  it('dispatches Prop Firm Challenge Shield alert when 80% daily loss threshold reached', async () => {
    // Create a PROP_FIRM account for the test user
    const propAccountId = new mongoose.Types.ObjectId();
    await TradingAccount.create({
      _id: propAccountId,
      userId: testUserId,
      name: 'The5ers 100K Challenge',
      broker: 'OTHER',
      accountType: 'PROP_FIRM',
      currency: 'USD',
      baseCurrency: 'USD',
      propFirmConfig: {
        enabled: true,
        firm: 'THE5ERS',
        initialBalance: 100000,
        dailyLossLimitPercent: 5, // 5% = $5,000 max daily loss
      },
    });

    // Create closed losing trades today totaling -$4,200 (> 80% of $5,000)
    await Trade.create({
      userId: testUserId,
      accountId: propAccountId,
      symbol: 'XAUUSD',
      direction: 'LONG',
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'COMMODITY',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 3600000),
      exitTime: new Date(),
      calculated: {
        netPnL: -4200, // 84% of $5,000
      },
    });

    const sentAlerts: any[] = [];
    vi.spyOn(TelegramAlertService, 'sendAlert').mockImplementation(async (payload: any) => {
      sentAlerts.push(payload);
      return true;
    });

    LiveExecutionWorker.resetMilestones();
    await LiveExecutionWorker.runCycle(testUserId.toString());

    const propAlert = sentAlerts.find(a => a.title.includes('PROP FIRM CHALLENGE SHIELD'));
    expect(propAlert).toBeDefined();
    expect(propAlert.body).toContain('84.0%');
    expect(propAlert.body).toContain('$4200.00');
    expect(propAlert.severity).toBe('CRITICAL');

    // Clean up prop account
    await TradingAccount.deleteOne({ _id: propAccountId });
  });
});
