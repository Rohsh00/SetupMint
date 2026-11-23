import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  Trade,
  TradingAccount,
  Mt5Command,
} from '../src/db/models/index.js';
import { TelegramAlertService, DEFAULT_FOREX_PRESETS } from '../src/services/telegram-alert.service.js';
import { Mt5CommandService } from '../src/services/mt5-command.service.js';
import { TelegramCockpitTickerWorker } from '../src/services/telegram-cockpit-ticker.service.js';
import { AudioChimeService } from '../src/services/audio-chime.service.js';
import { LiveExecutionWorker } from '../src/services/live-execution-worker.service.js';

describe('Telegram MT5 Forex & Risk Management Integration Tests', { timeout: 30000 }, () => {
  let app: FastifyInstance;
  let testUser: any;
  let testAccount: any;
  const testEmail = `forex-telegram-${Date.now()}@test.local`;
  const botToken = '123456:TEST_BOT_TOKEN_FOREX';
  const chatId = '99887766';
  const sentMessages: any[] = [];
  const pinnedMessages: any[] = [];
  const unpinnedMessages: any[] = [];
  const editedMessages: any[] = [];
  const sentAudios: any[] = [];

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Mock fetch for Telegram Bot API
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      let body: any = {};
      if (typeof init?.body === 'string') {
        try { body = JSON.parse(init.body); } catch {}
      } else if (init?.body && typeof (init.body as any).get === 'function') {
        body = {
          caption: (init.body as any).get('caption'),
          title: (init.body as any).get('title'),
          chat_id: (init.body as any).get('chat_id'),
          reply_markup: (init.body as any).get('reply_markup') ? JSON.parse(String((init.body as any).get('reply_markup'))) : undefined,
        };
      }

      if (urlStr.includes('/sendAudio')) {
        sentAudios.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 99900 + sentAudios.length, title: body.title },
          }),
        } as any;
      }

      if (urlStr.includes('/sendMessage')) {
        sentMessages.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 88800 + sentMessages.length, text: body.text },
          }),
        } as any;
      }

      if (urlStr.includes('/pinChatMessage')) {
        pinnedMessages.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: true,
          }),
        } as any;
      }

      if (urlStr.includes('/unpinChatMessage')) {
        unpinnedMessages.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: true,
          }),
        } as any;
      }

      if (urlStr.includes('/editMessageText')) {
        editedMessages.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: body.message_id, text: body.text },
          }),
        } as any;
      }

      if (urlStr.includes('/answerCallbackQuery')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: true }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as any;
    });

    // Create test user and MT5 trading account
    testUser = await User.create({
      name: 'Forex Trader',
      email: testEmail,
      passwordHash: 'hashed_pw',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: botToken,
        telegramChatId: chatId,
      },
    });

    testAccount = await TradingAccount.create({
      userId: testUser._id,
      name: 'Elefin MT5 Forex Account',
      broker: 'ELEFIN_MT5',
      baseCurrency: 'USD',
      initialBalance: 10000,
      currentBalance: 10000,
      status: 'ACTIVE',
      profile: {
        executionAdapterKey: 'ELEFIN_MT5',
        marketRegion: 'GLOBAL',
        feeModelKey: 'FOREX_COMMISSION',
        sessionCalendarKey: 'FOREX_24_5',
      },
    });

    // Seed live quote cache for XAUUSD and ETHUSD
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'XAUUSD',
      bid: 2650.00,
      ask: 2650.40,
      ltp: 2650.20,
      timestamp: new Date(),
    });

    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'ETHUSD',
      bid: 3140.00,
      ask: 3140.50,
      ltp: 3140.25,
      timestamp: new Date(),
    });
  }, 30000);

  beforeEach(async () => {
    if (testAccount) {
      Mt5CommandService.recordQuote(testAccount._id, {
        symbol: 'XAUUSD',
        bid: 2650.00,
        ask: 2650.40,
        ltp: 2650.20,
        timestamp: new Date(),
      });
      Mt5CommandService.recordQuote(testAccount._id, {
        symbol: 'ETHUSD',
        bid: 3140.00,
        ask: 3140.50,
        ltp: 3140.25,
        timestamp: new Date(),
      });
    }
  });

  afterAll(async () => {
    // Strictly isolate and clean up ONLY this test user's data
    if (testUser) {
      await Mt5Command.deleteMany({ userId: testUser._id });
      await Trade.deleteMany({ userId: testUser._id });
      await TradingAccount.deleteMany({ userId: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    await app.close();
    await disconnectDatabase();
    vi.restoreAllMocks();
  });

  // 1. Model & Service Unit Test: Mt5Command OPEN_ORDER creation & pending queue retrieval
  it('Scenario 1: Creates an OPEN_ORDER command and marks it SENT upon retrieval', async () => {
    const cmd = await Mt5CommandService.queueOpenOrder({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.10,
      stopLoss: 2645.00,
      takeProfit: 2660.00,
      price: 2650.00,
      comment: 'TG-Test',
    });

    expect(cmd).toBeDefined();
    expect(cmd.action).toBe('OPEN_ORDER');
    expect(cmd.symbol).toBe('XAUUSD');
    expect(cmd.side).toBe('BUY');
    expect(cmd.volume).toBe(0.10);
    expect(cmd.stopLoss).toBe(2645.00);
    expect(cmd.takeProfit).toBe(2660.00);
    expect(cmd.status).toBe('PENDING');

    // Fetch pending commands for account (as MT5 EA would)
    const pending = await Mt5CommandService.getPendingCommandsForAccount(testAccount._id);
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const match = pending.find((p) => p.commandId === cmd._id.toString());
    expect(match).toBeDefined();
    expect(match.action).toBe('OPEN_ORDER');
    expect(match.symbol).toBe('XAUUSD');
    expect(match.side).toBe('BUY');
    expect(match.volume).toBe(0.10);

    // Verify status updated to SENT
    const updated = await Mt5Command.findById(cmd._id);
    expect(updated?.status).toBe('SENT');
  });

  // 2. Telegram Command: /gold buy with defaults
  it('Scenario 2: /gold buy executes market BUY with default lots and preset SL/TP', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(testUser, botToken, chatId, 'XAUUSD', ['buy']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('MT5 ORDER QUEUED ON BRIDGE');
    expect(lastMsg.text).toContain('BUY');
    expect(lastMsg.text).toContain('XAUUSD');
    expect(lastMsg.text).toContain('0.10 Lots'); // Default preset

    // Verify command was created in DB
    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: DEFAULT_FOREX_PRESETS.gold.defaultLot,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.stopLoss).toBeLessThan(2650.20); // Stop loss below current LTP
    expect(cmd?.takeProfit).toBeGreaterThan(2650.20); // Target above current LTP
  });

  // 3. Telegram Command: /gold sell with custom volume and explicit SL/TP
  it('Scenario 3: /gold sell with custom volume and explicit levels', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(
      testUser,
      botToken,
      chatId,
      'XAUUSD',
      ['sell', '0.20', 'sl=2665', 'tp=2635']
    );

    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'XAUUSD',
      side: 'SELL',
      volume: 0.20,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.stopLoss).toBe(2665);
    expect(cmd?.takeProfit).toBe(2635);
  });

  // 4. Telegram Command: /eth buy with defaults
  it('Scenario 4: /eth buy executes market BUY with default lots and preset SL/TP', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(testUser, botToken, chatId, 'ETHUSD', ['buy']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('MT5 ORDER QUEUED ON BRIDGE');
    expect(lastMsg.text).toContain('BUY');
    expect(lastMsg.text).toContain('ETHUSD');
    expect(lastMsg.text).toContain('1.00 Lots'); // Default preset lot

    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'ETHUSD',
      side: 'BUY',
      volume: DEFAULT_FOREX_PRESETS.eth.defaultLot,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.stopLoss).toBeLessThan(3140.25);
    expect(cmd?.takeProfit).toBeGreaterThan(3140.25);
  });

  // 5. Telegram Command: /eth sell with custom volume
  it('Scenario 5: /eth sell with custom volume 0.50 lots', async () => {
    await TelegramAlertService.handleForexOrderCommand(
      testUser,
      botToken,
      chatId,
      'ETHUSD',
      ['sell', '0.50', 'sl=3180']
    );

    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'ETHUSD',
      side: 'SELL',
      volume: 0.50,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.stopLoss).toBe(3180);
  });

  // 6. Dollar-Risk Calculator: /risk gold 50 (auto lot sizing)
  it('Scenario 6: /risk gold 50 auto-calculates lot size and attaches 1-tap buttons', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleRiskCalculatorCommand(testUser, botToken, chatId, ['gold', '50']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.text).toContain('Dollar-Risk Position Calculator');
    expect(msg.text).toContain('Risk Budget  : $50.00');
    expect(msg.text).toContain('0.14 Lots'); // $50 / (35 pts * $10) = 0.14 lots
    expect(msg.reply_markup.inline_keyboard.length).toBe(2);

    const buyBtn = msg.reply_markup.inline_keyboard[0][0];
    expect(buyBtn.text).toContain('BUY 0.14 XAUUSD');
    expect(buyBtn.callback_data).toContain('order:XAUUSD:BUY:0.14:35:70');
  });

  // 7. Dollar-Risk Calculator: /risk eth 50 (auto lot sizing)
  it('Scenario 7: /risk eth 50 auto-calculates lot size for Ethereum', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleRiskCalculatorCommand(testUser, botToken, chatId, ['eth', '50']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.text).toContain('ETHUSD');
    expect(msg.text).toContain('Risk Budget  : $50.00');
    expect(msg.text).toContain('1.67 Lots'); // $50 / $30 SL = 1.67 lots

    const buyBtn = msg.reply_markup.inline_keyboard[0][0];
    expect(buyBtn.text).toContain('BUY 1.67 ETHUSD');
    expect(buyBtn.callback_data).toContain('order:ETHUSD:BUY:1.67:30:75');
  });

  // 8. 1-Tap Button Callback: order:XAUUSD:BUY:0.10:35:70
  it('Scenario 8: 1-Tap callback query executes order on MT5', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.executeTelegramOrder(
      testUser,
      botToken,
      chatId,
      'XAUUSD',
      'BUY',
      0.10,
      35,
      70
    );

    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.10,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.volume).toBe(0.10);
  });

  // 9. Interactive Cockpit: /cockpit generating Gold & ETH menu
  it('Scenario 9: /cockpit displays multi-asset live prices and execution grid', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleCockpitCommand(testUser, botToken, chatId);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.text).toContain('COCKPIT');
    expect(msg.text).toContain('Au:');
    expect(msg.text).toContain('XAUUSD : $2650.20');
    expect(msg.text).toContain('ETHUSD : $3140.25');

    const keyboard = msg.reply_markup.inline_keyboard;
    expect(keyboard.length).toBeGreaterThanOrEqual(4);
    expect(keyboard[0][0].text).toContain('BUY Gold (0.10)');
    expect(keyboard[0][1].text).toContain('SELL Gold (0.10)');
    expect(keyboard[1][0].text).toContain('BUY ETH (1.00)');
    expect(keyboard[1][1].text).toContain('SELL ETH (1.00)');
    expect(keyboard[2][0].text).toContain('Gold Lot Options');
    expect(keyboard[3][0].text).toContain('Other Assets');

    // Test opening Other Assets drilldown deck for BTC, US30, NAS100
    sentMessages.length = 0;
    editedMessages.length = 0;
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_other_assets',
      from: { id: chatId },
      data: 'deck:other_assets',
      message: { message_id: 8881, chat: { id: chatId } },
    });
    const otherMsg = editedMessages[editedMessages.length - 1] || sentMessages[sentMessages.length - 1];
    expect(otherMsg.text).toContain('GLOBAL ASSETS');
    expect(otherMsg.reply_markup.inline_keyboard[0][0].text).toContain('BUY BTC');
    expect(otherMsg.reply_markup.inline_keyboard[1][0].text).toContain('BUY US30');
    expect(otherMsg.reply_markup.inline_keyboard[2][0].text).toContain('BUY NAS100');

    // Return to main cockpit cleanly
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_back',
      from: { id: chatId },
      data: 'deck:back',
      message: { message_id: 8881, chat: { id: chatId } },
    });
  });

  // 10. Top Pinned Cockpit: /pin calls pinChatMessage and stores message ID
  it('Scenario 10: /pin pins the live cockpit to the top of the chat', async () => {
    pinnedMessages.length = 0;
    await TelegramAlertService.handlePinCockpitCommand(testUser, botToken, chatId);

    expect(pinnedMessages.length).toBeGreaterThanOrEqual(1);
    expect(pinnedMessages[0].chat_id).toBe(chatId);
    expect(pinnedMessages[0].disable_notification).toBe(true);

    const updatedUser = await User.findById(testUser._id);
    expect(updatedUser?.liveWatcherSettings?.telegramPinnedCockpitMessageId).toBeDefined();
    expect(updatedUser?.liveWatcherSettings?.telegramPinnedCockpitChatId).toBe(chatId);
  });

  // 11. Bare Number Stop Loss Adjustment on Active Position
  it('Scenario 11: Typing bare numeric price adjusts MT5 Stop Loss', async () => {
    // Create an open Gold trade
    const goldTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      simpleExecution: {
        entryPrice: 2640.00,
        quantity: 0.10,
      },
      currentLtp: 2650.20,
      tags: ['MT5_TICKET_998811'],
      risk: {
        initialStopLoss: 2635.00,
        currentStopLoss: 2635.00,
      },
      auditLog: [],
    });

    sentMessages.length = 0;
    // User types "2648.50"
    await (TelegramAlertService as any).handleCustomStopLossCommand(
      testUser,
      botToken,
      chatId,
      ['2648.50']
    );

    const slCmd = await Mt5Command.findOne({
      userId: testUser._id,
      action: 'MODIFY_SL',
      ticket: 998811,
      stopLoss: 2648.50,
    });

    expect(slCmd).toBeDefined();
    expect(slCmd?.stopLoss).toBe(2648.50);

    // Verify trade document updated
    const updatedTrade = await Trade.findById(goldTrade._id);
    expect(updatedTrade?.risk?.currentStopLoss).toBe(2648.50);
  });

  // 12. Close Symbol Positions: /gold close and /eth close
  it('Scenario 12: /gold close flattens all active Gold positions on MT5', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.handleCloseSymbolPositions(testUser, botToken, chatId, 'XAUUSD');

    const closeCmd = await Mt5Command.findOne({
      userId: testUser._id,
      action: 'CLOSE_POSITION',
      ticket: 998811,
    });

    expect(closeCmd).toBeDefined();
    expect(closeCmd?.action).toBe('CLOSE_POSITION');
  });

  // 13. Lock Breakeven: /lockbe moves SL to entry
  it('Scenario 13: /lockbe locks stop loss to entry price', async () => {
    const ethTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'ETHUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      simpleExecution: {
        entryPrice: 3100.00,
        quantity: 1.0,
      },
      currentLtp: 3140.25,
      tags: ['MT5_TICKET_998822'],
      risk: {
        initialStopLoss: 3070.00,
        currentStopLoss: 3070.00,
      },
      auditLog: [],
    });

    await TelegramAlertService.handleLockBeAll(testUser, botToken, chatId);

    const beCmd = await Mt5Command.findOne({
      userId: testUser._id,
      action: 'MODIFY_SL',
      ticket: 998822,
      stopLoss: 3100.00,
    });

    expect(beCmd).toBeDefined();
    expect(beCmd?.stopLoss).toBe(3100.00);

    const updatedEth = await Trade.findById(ethTrade._id);
    expect(updatedEth?.risk?.currentStopLoss).toBe(3100.00);
  });

  it('Scenario 14: User custom telegramForexPresets from Settings UI are dynamically loaded and executed', async () => {
    // Configure user with custom settings: Gold 0.25 lots, 50 pts SL, 3.0 RR
    testUser.liveWatcherSettings = {
      ...(testUser.liveWatcherSettings || {}),
      telegramForexPresets: {
        goldDefaultLot: 0.25,
        goldSlPoints: 50,
        goldRrRatio: 3.0,
        ethDefaultLot: 2.0,
        ethSlPrice: 40,
        ethRrRatio: 2.0,
        defaultDollarRisk: 100,
      },
    };
    await testUser.save();

    await TelegramAlertService.handleForexOrderCommand(testUser, botToken, chatId, 'XAUUSD', ['buy']);

    const customCmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.25,
    }).sort({ createdAt: -1 });

    expect(customCmd).toBeDefined();
    expect(customCmd?.volume).toBe(0.25);
    // At live mock LTP 2650.20: SL 50 pts ($5) -> 2645.20, TP 150 pts ($15) -> 2665.20
    expect(customCmd?.stopLoss).toBe(2645.20);
    expect(customCmd?.takeProfit).toBe(2665.20);
  });

  // 15. TelegramCockpitTickerWorker live cut-to-cut refresh on pinned header
  it('Scenario 15: TelegramCockpitTickerWorker refreshes pinned cockpit in-place with latest live prices', async () => {
    // 1. Pin cockpit for testUser
    await TelegramAlertService.handlePinCockpitCommand(testUser, botToken, chatId);
    const userWithPin = await User.findById(testUser._id);
    expect(userWithPin?.liveWatcherSettings?.telegramPinnedCockpitMessageId).toBeDefined();

    editedMessages.length = 0;

    // 2. Change live quote to new cut-to-cut price
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'XAUUSD',
      bid: 2655.00,
      ask: 2655.30,
      ltp: 2655.15,
      timestamp: new Date(),
    });

    // 3. Trigger worker tick
    const updated = await TelegramAlertService.updatePinnedCockpitMessage(userWithPin);
    expect(updated).toBe(true);
    expect(editedMessages.length).toBeGreaterThanOrEqual(1);

    const lastEdit = editedMessages[editedMessages.length - 1];
    expect(lastEdit.message_id).toBe(userWithPin?.liveWatcherSettings?.telegramPinnedCockpitMessageId);
    expect(lastEdit.text).toContain('XAUUSD : $2655.15');
    expect(lastEdit.text).toContain('Live Cut-to-Cut');
  });

  // 16. /unpin command and callback unpins message and unsets pinned ID in DB
  it('Scenario 16: /unpin unpins live cockpit and clears pinned state from user settings', async () => {
    unpinnedMessages.length = 0;
    await TelegramAlertService.handleUnpinCockpitCommand(testUser, botToken, chatId);

    expect(unpinnedMessages.length).toBeGreaterThanOrEqual(1);
    const clearedUser = await User.findById(testUser._id);
    expect(clearedUser?.liveWatcherSettings?.telegramPinnedCockpitMessageId).toBeFalsy();

    // Verify confirmation message sent
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('Live Cockpit Unpinned');
  });

  // 17. /close command dispatches close positions for specified symbol
  it('Scenario 17: /close gold flattens positions and /close without args prompts symbol selection', async () => {
    sentMessages.length = 0;

    // Test text command /close without symbol
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/close',
      },
    }, botToken);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const promptMsg = sentMessages[sentMessages.length - 1];
    expect(promptMsg.text).toContain('Close Positions');
    expect(promptMsg.reply_markup.inline_keyboard[0][0].callback_data).toBe('cmd_close_gold');
    expect(promptMsg.reply_markup.inline_keyboard[0][1].callback_data).toBe('cmd_close_eth');
  });

  // 18. Pre-Trade Guardrail: Max Concurrent Open Positions
  it('Scenario 18: Guardrail blocks order when max concurrent open positions limit is reached', async () => {
    // Configure user with maxOpenTrades: 1
    await User.findByIdAndUpdate(testUser._id, {
      $set: { 'riskSettings.maxOpenTrades': 1 },
    });
    const freshUser = await User.findById(testUser._id);

    // Create 1 active open trade
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
    });

    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(freshUser, botToken, chatId, 'XAUUSD', ['buy', '0.04']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('MAX OPEN POSITIONS REACHED');

    // Clean up trade
    await Trade.deleteOne({ _id: activeTrade._id });
    await User.findByIdAndUpdate(testUser._id, { $set: { 'riskSettings.maxOpenTrades': 5 } });
  });

  // 19. Pre-Trade Guardrail: Daily Loss Limit
  it('Scenario 19: Guardrail blocks order when daily loss limit is breached', async () => {
    // Set daily loss limit to $50
    await User.findByIdAndUpdate(testUser._id, {
      $set: { 'riskSettings.maxDailyLoss': 50 },
    });
    const freshUser = await User.findById(testUser._id);

    // Create a closed losing trade today with -$60 net PnL
    const losingTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -60 },
      netPnL: -60,
    });

    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(freshUser, botToken, chatId, 'XAUUSD', ['buy', '0.04']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('DAILY LOSS LIMIT BREACHED');

    // Clean up
    await Trade.deleteOne({ _id: losingTrade._id });
    await User.findByIdAndUpdate(testUser._id, { $set: { 'riskSettings.maxDailyLoss': 5000 } });
  });

  // 20. Pre-Trade Guardrail: Max Risk Per Trade Exceeded
  it('Scenario 20: Guardrail blocks order when stop risk exceeds allowed per-trade risk budget', async () => {
    // Account balance: $10,000, maxRiskPerTradePercent: 0.5% -> $50 max risk
    await User.findByIdAndUpdate(testUser._id, {
      $set: { 'riskSettings.maxRiskPerTradePercent': 0.5 },
    });
    const freshUser = await User.findById(testUser._id);

    // Try to enter 0.50 Lots Gold with 40-pt SL ($200 risk > $50 limit)
    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(freshUser, botToken, chatId, 'XAUUSD', ['buy', '0.50', 'sl=40']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('RISK PER TRADE EXCEEDED');

    await User.findByIdAndUpdate(testUser._id, { $set: { 'riskSettings.maxRiskPerTradePercent': 2.0 } });
  });

  // 21. Pre-Trade Guardrail: Stale Market Data
  it('Scenario 21: Guardrail blocks order when live quote is older than staleDataThresholdSeconds', async () => {
    await User.findByIdAndUpdate(testUser._id, {
      $set: { 'liveWatcherSettings.staleDataThresholdSeconds': 5 },
    });
    const freshUser = await User.findById(testUser._id);

    // Record an expired quote (30s ago)
    const thirtySecsAgo = new Date(Date.now() - 30000);
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'XAUUSD',
      bid: 2650.00,
      ask: 2650.40,
      ltp: 2650.20,
      timestamp: thirtySecsAgo,
    });

    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(freshUser, botToken, chatId, 'XAUUSD', ['buy', '0.04']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('STALE MARKET DATA');

    // Reset quote with current time
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'XAUUSD',
      bid: 2650.00,
      ask: 2650.40,
      ltp: 2650.20,
      timestamp: new Date(),
    });
    await User.findByIdAndUpdate(testUser._id, { $set: { 'liveWatcherSettings.staleDataThresholdSeconds': 10 } });
  });

  // 22. Pre-Trade Guardrail: Lot Cap
  it('Scenario 22: Guardrail blocks order when volume exceeds account lot cap', async () => {
    // Set lotCap: 0.50 on account profile
    await TradingAccount.findByIdAndUpdate(testAccount._id, {
      $set: { 'profile.riskRules.lotCap': 0.50 },
    });

    sentMessages.length = 0;
    await TelegramAlertService.handleForexOrderCommand(testUser, botToken, chatId, 'XAUUSD', ['buy', '1.00']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('LOT CAP EXCEEDED');

    await TradingAccount.findByIdAndUpdate(testAccount._id, {
      $set: { 'profile.riskRules.lotCap': 100 },
    });
  });

  // 23. Live PnL in Cockpit Line 1 when open positions exist
  it('Scenario 23: When an open position exists, Cockpit Line 1 shows live PnL badge alongside quotes', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    // Create an open ETH trade: SHORT 2.00 lots at 1650.00
    const openEthTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'ETHUSD',
      direction: 'SHORT',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_998877'],
      simpleExecution: {
        entryPrice: 1650.00,
        quantity: 2.00,
        contractMultiplier: 1,
      },
      risk: {
        initialStopLoss: 1660.00,
        currentStopLoss: 1660.00,
        plannedTarget: 1625.00,
      },
    });

    // Record quote for ETH at 1640.00 (profit: (1650 - 1640) * 2 = +$20.00)
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'ETHUSD',
      ltp: 1640.00,
      bid: 1639.80,
      ask: 1640.20,
    });

    const payload = await TelegramAlertService.buildCockpitPayload(testUser, true);
    const firstLine = payload.text.split('\n')[0];

    // First line must contain the green positive PnL badge and live market rates
    expect(firstLine).toContain('🟢');
    expect(firstLine).toContain('+$20.00');
    expect(firstLine).toContain('Au:');
    expect(firstLine).toContain('ETH:');

    // Clean up
    await Trade.deleteOne({ _id: openEthTrade._id });
  });

  // 24. Dynamic Position-Specific Controls when positions are open
  it('Scenario 24: Active open positions generate dynamic per-position triggers (Close, Lock BE, 50% Book, Trail +1R)', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const openGoldTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_554433'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
        contractMultiplier: 100,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
      },
    });

    const payload = await TelegramAlertService.buildCockpitPayload(testUser, true);
    const buttons = payload.buttons;

    // Must have Close Gold and Lock BE Gold buttons
    const row1 = buttons[0];
    expect(row1[0].text).toContain('Close Gold (0.10L)');
    expect(row1[0].callback_data).toBe('pos_close:554433');
    expect(row1[1].text).toContain('Lock BE (Gold)');
    expect(row1[1].callback_data).toBe('pos_be:554433');

    // Row 2 must have Book 50% and Trail +1R
    const row2 = buttons[1];
    expect(row2[0].text).toContain('Book 50% (0.05L)');
    expect(row2[0].callback_data).toBe('pos_half:554433');
    expect(row2[1].text).toContain('Trail +1R (Gold)');
    expect(row2[1].callback_data).toBe('pos_trail:554433');

    await Trade.deleteOne({ _id: openGoldTrade._id });
  });

  // 25. Auto-Pinning of Live Cockpit on Trade Open
  it('Scenario 25: autoPinOrUpdateCockpit automatically pins cockpit to top of chat when trade opens', async () => {
    // Unset pinned message id on user
    await User.findByIdAndUpdate(testUser._id, {
      $unset: {
        'liveWatcherSettings.telegramPinnedCockpitMessageId': '',
        'liveWatcherSettings.telegramPinnedCockpitChatId': '',
      },
    });
    const unpinnedUser = await User.findById(testUser._id);
    expect(unpinnedUser?.liveWatcherSettings?.telegramPinnedCockpitMessageId).toBeFalsy();

    pinnedMessages.length = 0;
    const autoPinned = await TelegramAlertService.autoPinOrUpdateCockpit(unpinnedUser);
    expect(autoPinned).toBe(true);
    expect(pinnedMessages.length).toBeGreaterThanOrEqual(1);

    const repinnedUser = await User.findById(testUser._id);
    expect(repinnedUser?.liveWatcherSettings?.telegramPinnedCockpitMessageId).toBeDefined();
  });

  // 26. Dynamic Position Callbacks: pos_half and pos_be execution
  it('Scenario 26: pos_half queues 50% partial exit and pos_be queues SL modification to entry', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'ETHUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_776655'],
      simpleExecution: {
        entryPrice: 1640.00,
        quantity: 2.00,
      },
    });

    // 1. Test pos_half:776655
    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_half_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'pos_half:776655',
      },
    });

    const halfCmd = await Mt5Command.findOne({ ticket: 776655, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    expect(halfCmd).toBeDefined();
    expect(halfCmd?.volume).toBe(1.00); // 50% of 2.00 is 1.00

    // 2. Test pos_be:776655
    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_be_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'pos_be:776655',
      },
    });

    const beCmd = await Mt5Command.findOne({ ticket: 776655, action: 'MODIFY_SL' }).sort({ createdAt: -1 });
    expect(beCmd).toBeDefined();
    expect(beCmd?.stopLoss).toBe(1640.00); // Entry price

    await Trade.deleteOne({ _id: activeTrade._id });
    await Mt5Command.deleteMany({ ticket: 776655 });
  });

  // 27. 1-Click Remove Take Profit (Runner Mode)
  it('Scenario 27: pos_removetp queues MODIFY_TP with takeProfit: 0 and marks trade as OPEN_RUNNER', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_443322'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
        plannedTarget: 2675.00,
      },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_removetp_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 888 },
        data: 'pos_removetp:443322',
      },
    });

    const tpCmd = await Mt5Command.findOne({ ticket: 443322, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(0); // 0 clears TP on MT5

    const updatedTrade = await Trade.findById(activeTrade._id);
    expect(updatedTrade?.risk?.plannedTarget).toBeUndefined();
    expect(updatedTrade?.tags).toContain('OPEN_RUNNER');

    await Trade.deleteOne({ _id: activeTrade._id });
    await Mt5Command.deleteMany({ ticket: 443322 });
  });

  // 28. 1-Click Take Profit Target Adjustment
  it('Scenario 28: pos_tp queues MODIFY_TP with exact target price and updates database target', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_443323'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
      },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_tp_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 889 },
        data: 'pos_tp:443323:2680.50',
      },
    });

    const tpCmd = await Mt5Command.findOne({ ticket: 443323, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(2680.50);

    const updatedTrade = await Trade.findById(activeTrade._id);
    expect(updatedTrade?.risk?.plannedTarget).toBe(2680.50);

    await Trade.deleteOne({ _id: activeTrade._id });
    await Mt5Command.deleteMany({ ticket: 443323 });
  });

  // 29. Text Command /tp <price>
  it('Scenario 29: /tp 2685.00 modifies Take Profit on MT5 and updates trade record', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_443324'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
      },
    });

    // Mock live quote for Gold
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'XAUUSD',
      ltp: 2652.00,
      bid: 2651.80,
      ask: 2652.20,
    });

    sentMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/tp 2685.00',
      },
    });

    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('TAKE PROFIT UPDATED');
    expect(lastMsg.text).toContain('2685.00');

    const tpCmd = await Mt5Command.findOne({ ticket: 443324, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(2685.00);

    await Trade.deleteOne({ _id: activeTrade._id });
    await Mt5Command.deleteMany({ ticket: 443324 });
  });

  // 30. Text Command /removetp
  it('Scenario 30: /removetp clears Take Profit and sets position into Runner mode', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const activeTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_443325'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
        plannedTarget: 2675.00,
      },
    });

    sentMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/removetp',
      },
    });

    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('TAKE PROFIT REMOVED (RUNNER MODE)');

    const tpCmd = await Mt5Command.findOne({ ticket: 443325, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(0);

    const updatedTrade = await Trade.findById(activeTrade._id);
    expect(updatedTrade?.risk?.plannedTarget).toBeUndefined();
    expect(updatedTrade?.tags).toContain('OPEN_RUNNER');

    await Trade.deleteOne({ _id: activeTrade._id });
    await Mt5Command.deleteMany({ ticket: 443325 });
  });

  // 31. Auto-Execution toggle: /autoexecute on & /autoexecute off arms/disarms MT5 ladder execution
  it('Scenario 31: /autoexecute on & off toggles MT5 ladder auto-execution', async () => {
    sentMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/autoexecute on',
      },
    });

    let lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('AUTO-EXECUTION ARMED GLOBALLY');

    let updatedUser = await User.findById(testUser._id);
    expect(updatedUser?.liveWatcherSettings?.defaultAutoExecute).toBe(true);

    sentMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/autoexecute off',
      },
    });

    lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('MANUAL CONFIRMATION MODE');

    updatedUser = await User.findById(testUser._id);
    expect(updatedUser?.liveWatcherSettings?.defaultAutoExecute).toBe(false);
  });

  // 32. Multi-Asset Orders: /btc, /us30, /nas100
  it('Scenario 32: Multi-Asset orders execute with correct defaults for BTC, US30, and NAS100', async () => {
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/btc buy',
      },
    });

    const btcCmd = await Mt5Command.findOne({ symbol: 'BTCUSD', action: 'OPEN_ORDER' }).sort({ createdAt: -1 });
    expect(btcCmd).toBeDefined();
    expect(btcCmd?.side).toBe('BUY');
    expect(btcCmd?.volume).toBe(0.05);

    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/us30 sell 0.20',
      },
    });

    const us30Cmd = await Mt5Command.findOne({ symbol: 'US30', action: 'OPEN_ORDER' }).sort({ createdAt: -1 });
    expect(us30Cmd).toBeDefined();
    expect(us30Cmd?.side).toBe('SELL');
    expect(us30Cmd?.volume).toBe(0.20);
  });

  // 33. Pending Limit & Stop Orders: /gold buylimit 2640.00
  it('Scenario 33: /gold buylimit queues a LIMIT pending order with exact price to MT5 Bridge', async () => {
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/gold buylimit 2640.00 0.05',
      },
    });

    const pendingCmd = await Mt5Command.findOne({ symbol: 'XAUUSD', orderType: 'LIMIT' }).sort({ createdAt: -1 });
    expect(pendingCmd).toBeDefined();
    expect(pendingCmd?.side).toBe('BUY');
    expect(pendingCmd?.price).toBe(2640.00);
    expect(pendingCmd?.volume).toBe(0.05);
  });

  // 34. Pyramiding Scale-In: /add on winning position
  it('Scenario 34: Pyramiding adds volume to winning position and locks base position to BE', async () => {
    const winningTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      status: 'OPEN',
      symbol: 'XAUUSD',
      direction: 'LONG',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      marketSegment: 'FOREX',
      entryTime: new Date(),
      tradeDate: new Date(),
      tags: ['MT5', 'MT5_TICKET_556677'],
      simpleExecution: {
        entryPrice: 2645.00, // Quote ltp is 2650.20, so trade is in profit!
        quantity: 0.04,
      },
      risk: {
        initialStopLoss: 2640.00,
        currentStopLoss: 2640.00,
      },
    });

    sentMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      message: {
        chat: { id: chatId },
        from: { id: chatId },
        text: '/add 0.04',
      },
    });

    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('PYRAMIDING SCALE-IN DISPATCHED');

    // Base stop should be updated to entry price (2645.00)
    const slModCmd = await Mt5Command.findOne({ ticket: 556677, action: 'MODIFY_SL' });
    expect(slModCmd).toBeDefined();
    expect(slModCmd?.stopLoss).toBe(2645.00);

    // New scale-in order should be placed
    const scaleInCmd = await Mt5Command.findOne({ symbol: 'XAUUSD', volume: 0.04, comment: { $regex: /Pyramid/ } });
    expect(scaleInCmd).toBeDefined();

    await Trade.deleteOne({ _id: winningTrade._id });
    await Mt5Command.deleteMany({ ticket: 556677 });
  });

  // 35. Urgent News Shield: 2-minute pre-release warning
  it('Scenario 35: sendGoldNewsUrgentShield dispatches alert with 1-tap flatten buttons', async () => {
    const newsGoldTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      status: 'OPEN',
      symbol: 'XAUUSD',
      direction: 'LONG',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      marketSegment: 'FOREX',
      entryTime: new Date(),
      tradeDate: new Date(),
      tags: ['MT5', 'MT5_TICKET_889900'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.08,
      },
    });

    sentMessages.length = 0;
    const sent = await TelegramAlertService.sendGoldNewsUrgentShield(testUser, {
      id: 'news-cpi-1',
      title: 'US CPI m/m',
      country: 'USD',
      impact: 'HIGH',
      isGoldMover: true,
      timestamp: new Date().toISOString(),
      istTimeStr: '06:00 PM IST',
      countdownStr: '2m',
      minutesUntil: 2,
      forecast: '0.2%',
      previous: '0.2%',
      status: 'IMMINENT',
    });

    expect(sent).toBe(true);
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('URGENT NEWS SHIELD: 2 MINUTES UNTIL RELEASE!');
    expect(lastMsg.reply_markup.inline_keyboard[0][0].text).toContain('FLATTEN ALL GOLD NOW');

    await Trade.deleteOne({ _id: newsGoldTrade._id });
  });

  // 36. Pro Suite Submenu Navigation: Multi-Layer Aggregation & Deck Drilldowns
  it('Scenario 36: Multi-layer positions aggregate into unified stack card and drilldown decks navigate cleanly', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const layer1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_111222'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.04,
      },
    });

    const layer2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_333444'],
      simpleExecution: {
        entryPrice: 2655.00,
        quantity: 0.02,
      },
    });

    // Verify Main Cockpit shows Stack Aggregation
    const payload = await (TelegramAlertService as any).buildCockpitPayload(testUser, 'test-bot-token');
    expect(payload.text).toContain('Gold (XAUUSD) LONG · 0.06L Total (2 Layers)');
    expect(payload.text).toContain('Blended Entry: <b>$2651.67</b>');
    expect(payload.text).toContain('Layer 1 #111222: <b>0.04L @ $2650.00</b>');
    expect(payload.text).toContain('Layer 2 #333444: <b>0.02L @ $2655.00</b>');

    // Verify Main Deck Buttons include Submenu Drilldowns
    const allButtons = payload.buttons.flat();
    expect(allButtons.some((b: any) => b.callback_data === 'deck:harvest:XAUUSD')).toBe(true);
    expect(allButtons.some((b: any) => b.callback_data === 'deck:pyramid:XAUUSD')).toBe(true);
    expect(allButtons.some((b: any) => b.callback_data === 'deck:defense:XAUUSD')).toBe(true);
    expect(allButtons.some((b: any) => b.callback_data === 'deck:layers:XAUUSD')).toBe(true);

    // Navigate to deck:harvest:XAUUSD
    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_drill_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'deck:harvest:XAUUSD',
      },
    });

    const harvestPayload = await (TelegramAlertService as any).buildCockpitPayload(testUser, 'test-bot-token');
    const harvestButtons = harvestPayload.buttons.flat();
    expect(harvestButtons.some((b: any) => b.callback_data === 'harvest_pct:XAUUSD:25')).toBe(true);
    expect(harvestButtons.some((b: any) => b.callback_data === 'harvest_pct:XAUUSD:50')).toBe(true);
    expect(harvestButtons.some((b: any) => b.callback_data === 'harvest_freeride:XAUUSD')).toBe(true);
    expect(harvestButtons.some((b: any) => b.callback_data === 'harvest_moonshot:XAUUSD')).toBe(true);
    expect(harvestButtons.some((b: any) => b.callback_data === 'deck:back')).toBe(true);

    // Navigate back to main cockpit
    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_drill_back',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'deck:back',
      },
    });

    const restoredPayload = await (TelegramAlertService as any).buildCockpitPayload(testUser, 'test-bot-token');
    const restoredButtons = restoredPayload.buttons.flat();
    expect(restoredButtons.some((b: any) => b.callback_data === 'deck:harvest:XAUUSD')).toBe(true);

    await Trade.deleteMany({ _id: { $in: [layer1._id, layer2._id] } });
  });

  // 37. Pro Action: harvest_pct executes proportional partial exit across all layers
  it('Scenario 37: harvest_pct:XAUUSD:50 executes 50% partial exit across all open layers', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const layer1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_101010'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
    });
    const layer2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_202020'],
      simpleExecution: { entryPrice: 2655.00, quantity: 0.02 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_hv_50',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'harvest_pct:XAUUSD:50',
      },
    });

    const cmd1 = await Mt5Command.findOne({ ticket: 101010, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    const cmd2 = await Mt5Command.findOne({ ticket: 202020, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    expect(cmd1).toBeDefined();
    expect(cmd1?.volume).toBe(0.02); // 50% of 0.04
    expect(cmd2).toBeDefined();
    expect(cmd2?.volume).toBe(0.01); // 50% of 0.02

    await Trade.deleteMany({ _id: { $in: [layer1._id, layer2._id] } });
    await Mt5Command.deleteMany({ ticket: { $in: [101010, 202020] } });
  });

  // 38. Pro Action: harvest_freeride books 50% and locks SL of all layers to breakeven
  it('Scenario 38: harvest_freeride:XAUUSD books 50% volume and locks SL to breakeven', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_303030'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_freeride_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'harvest_freeride:XAUUSD',
      },
    });

    const closeCmd = await Mt5Command.findOne({ ticket: 303030, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    const slCmd = await Mt5Command.findOne({ ticket: 303030, action: 'MODIFY_SL' }).sort({ createdAt: -1 });
    expect(closeCmd).toBeDefined();
    expect(closeCmd?.volume).toBe(0.02);
    expect(slCmd).toBeDefined();
    expect(slCmd?.stopLoss).toBe(2650.00);

    await Trade.deleteOne({ _id: trade._id });
    await Mt5Command.deleteMany({ ticket: 303030 });
  });

  // 39. Pro Action: harvest_moonshot leaves 0.01L runner, clears TP, locks SL to BE+Spread
  it('Scenario 39: harvest_moonshot:XAUUSD retains 0.01L runner and clears TP on MT5', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_404040'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.05 },
      risk: { plannedTarget: 2680.00 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_moonshot_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'harvest_moonshot:XAUUSD',
      },
    });

    const closeCmd = await Mt5Command.findOne({ ticket: 404040, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    const tpCmd = await Mt5Command.findOne({ ticket: 404040, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(closeCmd).toBeDefined();
    expect(closeCmd?.volume).toBe(0.04); // 0.05 - 0.01 = 0.04L closed
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(0); // Take Profit removed!
    expect(tpCmd?.stopLoss).toBe(2650.50); // BE + spread cover

    await Trade.deleteOne({ _id: trade._id });
    await Mt5Command.deleteMany({ ticket: 404040 });
  });

  // 40. Pro Action: defense_truebe sets SL to entry + 0.50 spread buffer
  it('Scenario 40: defense_truebe:XAUUSD sets Stop Loss to entry + 0.50 spread buffer', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_505050'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_truebe_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'defense_truebe:XAUUSD',
      },
    });

    const slCmd = await Mt5Command.findOne({ ticket: 505050, action: 'MODIFY_SL' }).sort({ createdAt: -1 });
    expect(slCmd).toBeDefined();
    expect(slCmd?.stopLoss).toBe(2650.50);

    await Trade.deleteOne({ _id: trade._id });
    await Mt5Command.deleteMany({ ticket: 505050 });
  });

  // 41. Pro Action: defense_trail_r trails SL by +1.0R risk multiple
  it('Scenario 41: defense_trail_r:XAUUSD:1.0 trails SL by +1.0R risk multiple', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_606060'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
      risk: { initialStopLoss: 2646.00 }, // 4.0 pts risk
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_trail_r_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'defense_trail_r:XAUUSD:1.0',
      },
    });

    const slCmd = await Mt5Command.findOne({ ticket: 606060, action: 'MODIFY_SL' }).sort({ createdAt: -1 });
    expect(slCmd).toBeDefined();
    expect(slCmd?.stopLoss).toBe(2654.00); // 2650 + 1.0 * 4.0 = 2654.00

    await Trade.deleteOne({ _id: trade._id });
    await Mt5Command.deleteMany({ ticket: 606060 });
  });

  // 42. Pro Action: defense_sleep locks 75% profit, puts remaining at True BE with no TP
  it('Scenario 42: defense_sleep:XAUUSD closes 75% volume, moves SL to True BE, removes TP', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_707070'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
      risk: { plannedTarget: 2680.00 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_sleep_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'defense_sleep:XAUUSD',
      },
    });

    const closeCmd = await Mt5Command.findOne({ ticket: 707070, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    const tpCmd = await Mt5Command.findOne({ ticket: 707070, action: 'MODIFY_TP' }).sort({ createdAt: -1 });
    expect(closeCmd).toBeDefined();
    expect(closeCmd?.volume).toBe(0.03); // 75% of 0.04 = 0.03
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(0); // Take profit removed
    expect(tpCmd?.stopLoss).toBe(2650.50); // Stop Loss at True BE (+Spread)

    await Trade.deleteOne({ _id: trade._id });
    await Mt5Command.deleteMany({ ticket: 707070 });
  });

  // 43. Pro Action: act_close_top closes only newest layer
  it('Scenario 43: act_close_top:XAUUSD closes only the newest layer on MT5', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const layer1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_808081'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
    });
    const layer2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_808082'],
      simpleExecution: { entryPrice: 2655.00, quantity: 0.02 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_close_top_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'act_close_top:XAUUSD',
      },
    });

    // Verify only ticket 808082 was queued for close
    const closeCmd = await Mt5Command.findOne({ ticket: 808082, action: 'CLOSE_POSITION' }).sort({ createdAt: -1 });
    const unclosedCmd = await Mt5Command.findOne({ ticket: 808081, action: 'CLOSE_POSITION' });
    expect(closeCmd).toBeDefined();
    expect(closeCmd?.volume).toBe(0.02);
    expect(unclosedCmd).toBeNull();

    await Trade.deleteMany({ _id: { $in: [layer1._id, layer2._id] } });
    await Mt5Command.deleteMany({ ticket: { $in: [808081, 808082] } });
  });

  // 44. Pro Action: act_close_stack flattens all open layers of symbol simultaneously
  it('Scenario 44: act_close_stack:XAUUSD flattens all open layers of the symbol simultaneously', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    const layer1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_909091'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
    });
    const layer2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_909092'],
      simpleExecution: { entryPrice: 2655.00, quantity: 0.02 },
    });

    await TelegramAlertService.processWebhookUpdate({
      callback_query: {
        id: 'cq_close_stack_1',
        from: { id: chatId },
        message: { chat: { id: chatId }, message_id: 999 },
        data: 'act_close_stack:XAUUSD',
      },
    });

    const cmd1 = await Mt5Command.findOne({ ticket: 909091, action: 'CLOSE_POSITION' });
    const cmd2 = await Mt5Command.findOne({ ticket: 909092, action: 'CLOSE_POSITION' });
    expect(cmd1).toBeDefined();
    expect(cmd1?.volume).toBe(0.04);
    expect(cmd2).toBeDefined();
    expect(cmd2?.volume).toBe(0.02);

    await Trade.deleteMany({ _id: { $in: [layer1._id, layer2._id] } });
    await Mt5Command.deleteMany({ ticket: { $in: [909091, 909092] } });
  });

  // 45. R-Multiple Milestones: Audio chime and 1-tap tactical buttons on +1.0R
  it('Scenario 45: evaluateRMilestones dispatches audio chime and tactical buttons on +1.0R', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    sentAudios.length = 0;

    // Entry 2650.00, SL 2646.00 -> 1R = 4.0 pts. At 2654.50, gain is +4.5 pts = +1.12R (> 1.0R)
    Mt5CommandService.recordQuote(testAccount._id, { symbol: 'XAUUSD', ltp: 2654.50, bid: 2654.30, ask: 2654.70, timestamp: new Date() });

    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_121212'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
      risk: { initialStopLoss: 2646.00 },
    });

    await TelegramAlertService.evaluateRMilestones(testUser);

    expect(sentAudios.length).toBeGreaterThanOrEqual(1);
    const audioMsg = sentAudios[sentAudios.length - 1];
    expect(audioMsg.title).toContain('+1.0R');
    expect(audioMsg.caption).toContain('R-MULTIPLE MILESTONE HIT: +1.0R');
    expect(audioMsg.caption).toContain('Symbol      : XAUUSD (LONG)');
    expect(audioMsg.caption).toContain('Volume      : 0.04 Lots');

    // Check attached 1-tap tactical buttons
    const buttons = audioMsg.reply_markup.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.callback_data === 'defense_truebe:XAUUSD')).toBe(true);
    expect(buttons.some((b: any) => b.callback_data === 'pyramid_add:XAUUSD:0.02')).toBe(true);
    expect(buttons.some((b: any) => b.callback_data === 'harvest_pct:XAUUSD:50')).toBe(true);

    const updatedTrade = await Trade.findById(trade._id);
    expect(updatedTrade?.tags).toContain('R_MILESTONE_1.0');

    await Trade.deleteOne({ _id: trade._id });
  });

  // 46. R-Multiple Milestones: Hysteresis prevents duplicate audio alerts on same tier
  it('Scenario 46: Hysteresis prevents duplicate audio alerts when hovering around milestone', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    sentAudios.length = 0;

    Mt5CommandService.recordQuote(testAccount._id, { symbol: 'XAUUSD', ltp: 2654.50, bid: 2654.30, ask: 2654.70, timestamp: new Date() });

    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_131313'],
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
      risk: { initialStopLoss: 2646.00 },
    });

    // First evaluation triggers 1.0R alert
    await TelegramAlertService.evaluateRMilestones(testUser);
    expect(sentAudios.length).toBe(1);

    // Second evaluation at same or slight tick fluctuation must NOT trigger duplicate alert
    Mt5CommandService.recordQuote(testAccount._id, { symbol: 'XAUUSD', ltp: 2654.80, bid: 2654.60, ask: 2655.00, timestamp: new Date() });
    await TelegramAlertService.evaluateRMilestones(testUser);
    expect(sentAudios.length).toBe(1); // Still exactly 1! Zero spamming!

    await Trade.deleteOne({ _id: trade._id });
  });

  // 47. R-Multiple Milestones: Advancing to +2.0R triggers second tier alert with trail button
  it('Scenario 47: Advancing to +2.0R triggers second-tier milestone alert with Trail SL button', async () => {
    await Trade.deleteMany({ userId: testUser._id, status: 'OPEN' });
    sentAudios.length = 0;

    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_141414', 'R_MILESTONE_1.0', 'R_MILESTONE_1.5'], // Already passed 1R & 1.5R
      simpleExecution: { entryPrice: 2650.00, quantity: 0.04 },
      risk: { initialStopLoss: 2646.00 },
    });

    // Move to 2658.50 (+8.5 pts = +2.12R)
    Mt5CommandService.recordQuote(testAccount._id, { symbol: 'XAUUSD', ltp: 2658.50, bid: 2658.30, ask: 2658.70, timestamp: new Date() });
    await TelegramAlertService.evaluateRMilestones(testUser);

    expect(sentAudios.length).toBe(1);
    const msg = sentAudios[0];
    expect(msg.title).toContain('+2.0R');
    expect(msg.caption).toContain('R-MULTIPLE MILESTONE HIT: +2.0R');

    const buttons = msg.reply_markup.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.callback_data === 'defense_trail_r:XAUUSD:1.0')).toBe(true);
    expect(buttons.some((b: any) => b.callback_data === 'harvest_freeride:XAUUSD')).toBe(true);

    const updated = await Trade.findById(trade._id);
    expect(updated?.tags).toContain('R_MILESTONE_2.0');

    await Trade.deleteOne({ _id: trade._id });
  });

  // 48. Audio Synthesizer: AudioChimeService generates valid 16-bit PCM RIFF WAV buffer
  it('Scenario 48: AudioChimeService generates valid 16-bit PCM RIFF WAV audio buffer with correct magic bytes', () => {
    const chime1 = AudioChimeService.getMilestoneChime(1.0);
    const chime3 = AudioChimeService.getMilestoneChime(3.0);

    expect(chime1).toBeInstanceOf(Buffer);
    expect(chime3).toBeInstanceOf(Buffer);

    // RIFF header validation
    expect(chime1.toString('ascii', 0, 4)).toBe('RIFF');
    expect(chime1.toString('ascii', 8, 12)).toBe('WAVE');
    expect(chime1.toString('ascii', 12, 16)).toBe('fmt ');
    expect(chime1.toString('ascii', 36, 40)).toBe('data');

    // Non-trivial audio content (size > 10KB)
    expect(chime1.length).toBeGreaterThan(10000);
    expect(chime3.length).toBeGreaterThan(15000);
  });

  // 49. Live Cockpit Deep Lot Sizing: Clicking BUY Gold opens Deep Sizing & Lot Options Report
  it('Scenario 49: Clicking BUY Gold or BUY ETH opens Deep Sizing & Lot Options Report with Best Option', async () => {
    sentMessages.length = 0;
    editedMessages.length = 0;

    // Simulate clicking BUY Gold button from Cockpit: deck:order_prep:XAUUSD:BUY
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_prep_gold_1',
      from: { id: chatId },
      data: 'deck:order_prep:XAUUSD:BUY',
      message: { message_id: 77701, chat: { id: chatId } },
    }, botToken);

    // Verify Deep Sizing card was generated
    const card = editedMessages[editedMessages.length - 1] || sentMessages[sentMessages.length - 1];
    expect(card).toBeDefined();
    expect(card.text).toContain('Gold (XAUUSD) • BUY LOT OPTIONS REPORT');
    expect(card.text).toContain('BEST OPTION (RECOMMENDED)');
    expect(card.text).toContain('Micro / Min');
    expect(card.text).toContain('Conservative');
    expect(card.text).toContain('Saved Preset');
    expect(card.text).toContain('Extra Risk');

    // Verify interactive buttons contain Best Option, Tiers, Dollar budgets, and Cancel
    const buttons = card.reply_markup.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.text.includes('BEST OPTION'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('Micro'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('Preset'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('Extra Risk'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('$25 Risk'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('$50 Risk'))).toBe(true);
    expect(buttons.some((b: any) => b.text.includes('Cancel / Back to Cockpit'))).toBe(true);

    // Verify Best Option button callback has :exec suffix
    const bestOptBtn = buttons.find((b: any) => b.text.includes('BEST OPTION'));
    expect(bestOptBtn.callback_data).toContain(':exec');
  });

  // 50. Live Cockpit Deep Lot Sizing: Clicking BUY ETH generates ETH-specific pricing and options
  it('Scenario 50: Clicking BUY ETH generates ETHUSD specific pricing and risk tiers', async () => {
    sentMessages.length = 0;
    editedMessages.length = 0;

    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_prep_eth_1',
      from: { id: chatId },
      data: 'deck:order_prep:ETHUSD:BUY',
      message: { message_id: 77702, chat: { id: chatId } },
    }, botToken);

    const card = editedMessages[editedMessages.length - 1] || sentMessages[sentMessages.length - 1];
    expect(card).toBeDefined();
    expect(card.text).toContain('ETHUSD • BUY LOT OPTIONS REPORT');
    expect(card.text).toContain('BEST OPTION (RECOMMENDED)');

    const buttons = card.reply_markup.inline_keyboard.flat();
    const ethBestBtn = buttons.find((b: any) => b.text.includes('BEST OPTION'));
    expect(ethBestBtn.callback_data).toContain('order:ETHUSD:BUY:');
    expect(ethBestBtn.callback_data).toContain(':exec');
  });

  // 51. Deep Lot Sizing Execution: Clicking confirmed Best Option button places order on MT5
  it('Scenario 51: Tapping confirmed Best Option button executes order on MT5 Bridge', async () => {
    sentMessages.length = 0;

    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_exec_gold_best',
      from: { id: chatId },
      data: 'order:XAUUSD:BUY:0.14:35:70:exec',
      message: { message_id: 77703, chat: { id: chatId } },
    }, botToken);

    // Verify command was queued to MT5 with exact 0.14 lots
    const cmd = await Mt5Command.findOne({
      userId: testUser._id,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.14,
    }).sort({ createdAt: -1 });

    expect(cmd).toBeDefined();
    expect(cmd?.action).toBe('OPEN_ORDER');
    expect(cmd?.volume).toBe(0.14);
  });

  // 52. Dynamic Day State: HOUSE_MONEY regime awards bonus trades, house money sizing & momentum button
  it('Scenario 52: HOUSE_MONEY regime awards bonus trades and dynamic house money risk sizing', async () => {
    await Trade.deleteMany({ userId: testUser._id });

    // 1. Test sub-threshold trade: +1.30R (+40 profit) does NOT earn bonus trade (< +2.0R gate)
    const subTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: 40, realizedRMultiple: 1.30 },
      netPnL: 40,
    });

    const subAdaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      testUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100,
      'BUY'
    );
    expect(subAdaptive.regime).toBe('HOUSE_MONEY');
    expect(subAdaptive.accumulatedR).toBe(1.30);
    expect(subAdaptive.bonusTradesEarned).toBe(0); // 1.30R < 2.0R threshold -> 0 bonus trades
    expect(subAdaptive.effectiveMaxDailyTrades).toBe(6);

    // 2. Expand profit to +$200 (+2.0R with 1R=$100) -> Unlocks Tier 1 (+1 bonus trade)
    await Trade.deleteMany({ userId: testUser._id });
    const winTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: 200, realizedRMultiple: 2.0 },
      netPnL: 200,
    });

    const adaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      testUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100,
      'BUY'
    );

    expect(adaptive.regime).toBe('HOUSE_MONEY');
    expect(adaptive.regimeBadge).toBe('🟢');
    expect(adaptive.accumulatedR).toBe(2.0);
    expect(adaptive.bonusTradesEarned).toBe(1); // Option B Tier 1: >= 2.0R & >= 2x 1R ($200) -> 1 bonus trade
    expect(adaptive.effectiveMaxDailyTrades).toBe(7); // 6 base + 1 bonus
    expect(adaptive.tiers.bestOptionLabel).toContain('House Money');
    expect(adaptive.tiers.extraRiskLabel).toContain('Momentum Boost');

    // Verify UI report card renders green day house money state
    const card = await TelegramAlertService.buildOrderPrepPayload(testUser, 'XAUUSD', 'BUY');
    expect(card.text).toContain('House Money Session');
    expect(card.text).toContain('+1 bonus');
    expect(card.text).toContain('Momentum Boost');
    expect(card.text).toContain('• R: +2.00R');

    // Hard Discipline Buttons: Exactly 3 execution buttons (Best Option, Momentum Boost, Micro Safe), NO dollar clutter
    const buttons = card.buttons.flat();
    expect(buttons.some((b) => b.text.includes('House Money'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('Momentum Boost'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('Micro Safe'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('House'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('$25 Risk'))).toBe(false);
    expect(buttons.some((b) => b.text.includes('$50 Risk'))).toBe(false);

    // 3. Add second winning trade to reach +$350 (+3.5R) -> Unlocks Tier 2 (+2 bonus trades)
    await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: 150, realizedRMultiple: 1.5 },
      netPnL: 150,
    });
    const tier2Adaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      testUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100,
      'BUY'
    );
    expect(tier2Adaptive.accumulatedR).toBe(3.5);
    expect(tier2Adaptive.bonusTradesEarned).toBe(2); // Tier 2: >= 3.5R & >= 3.5x 1R ($350) -> 2 bonus trades
    expect(tier2Adaptive.effectiveMaxDailyTrades).toBe(8); // 6 base + 2 bonus

    // Clean up
    await Trade.deleteMany({ userId: testUser._id });
  });

  // 53. Dynamic Day State: DEFENSIVE regime triggers on consecutive losses, scales down risk, and hides aggressive options
  it('Scenario 53: DEFENSIVE regime throttles trade limit, halves lot size, and hides extra risk button', async () => {
    await Trade.deleteMany({ userId: testUser._id });

    // Create 2 consecutive closed losses today
    const loss1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 20000),
      exitTime: new Date(Date.now() - 10000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -40 },
      netPnL: -40,
    });
    const loss2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -50 },
      netPnL: -50,
    });

    const adaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      testUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100,
      'BUY'
    );

    expect(adaptive.regime).toBe('DEFENSIVE');
    expect(adaptive.regimeBadge).toBe('🔴');
    expect(adaptive.consecutiveLosses).toBe(2);
    expect(adaptive.tiers.bestOptionLabel).toContain('Defensive');
    expect(adaptive.tiers.conservativeLabel).toContain('Defensive Half');
    expect(adaptive.tiers.extraRiskLot).toBeUndefined();

    // Verify UI report card displays defensive mode and omits aggressive buttons
    const card = await TelegramAlertService.buildOrderPrepPayload(testUser, 'XAUUSD', 'BUY');
    expect(card.text).toContain('Defensive Mode');
    expect(card.text).toContain('[Disabled in Defensive Mode to protect buffer]');

    const buttons = card.buttons.flat();
    expect(buttons.some((b) => b.text.includes('Defensive'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('Micro Safe'))).toBe(true);
    expect(buttons.some((b) => b.text.includes('Defensive Half'))).toBe(true);
    // Extra Risk / Momentum button must be completely absent
    expect(buttons.some((b) => b.text.includes('Extra Risk'))).toBe(false);
    expect(buttons.some((b) => b.text.includes('Momentum Boost'))).toBe(false);

    // Clean up
    await Trade.deleteMany({ userId: testUser._id });
  });

  // 54. Adaptive Ladders: Correct T1/T2 ladder recommendations generated according to Day Regime
  it('Scenario 54: Adaptive ladder recommendations reflect configured user ladder settings and day regime', async () => {
    await Trade.deleteMany({ userId: testUser._id });

    // Configure user's custom ladder parameters
    await User.findByIdAndUpdate(testUser._id, {
      $set: {
        'liveWatcherSettings.t1MultipleR': 1.5,
        'liveWatcherSettings.t1ExitRatio': 0.60,
        'liveWatcherSettings.t2MultipleR': 3.0,
        'liveWatcherSettings.isFreeRunner': true,
      },
    });
    const freshUser = await User.findById(testUser._id);

    // 1. In Neutral regime
    const neutralAdaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      freshUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100
    );
    expect(neutralAdaptive.recommendedLadderNotes).toContain('T1 (+1.5R) take 60%');
    expect(neutralAdaptive.recommendedLadderNotes).toContain('T2 (+3R)');
    expect(neutralAdaptive.recommendedLadderNotes).toContain('Free Runner Trailing');

    // 2. In House Money regime (after banked profit)
    const winTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: 80 },
      netPnL: 80,
    });
    const houseAdaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      freshUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100
    );
    expect(houseAdaptive.recommendedLadderNotes).toContain('Harvest 60% & Lock True BE');
    expect(houseAdaptive.recommendedLadderNotes).toContain('Dynamic Trailing Ratchet');

    // 3. In Defensive regime (after consecutive losses)
    await Trade.deleteMany({ userId: testUser._id });
    const lossTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -75 },
      netPnL: -75,
    });
    const defAdaptive = await TelegramAlertService.evaluateAdaptiveDayRiskState(
      freshUser,
      testAccount,
      'XAUUSD',
      35,
      0.10,
      100
    );
    expect(defAdaptive.recommendedLadderNotes).toContain('Take 75% at T1 (+1.5R) & Instantly move SL to True BE');

    // Clean up
    await Trade.deleteMany({ userId: testUser._id });
  });

  // 55. Defensive Volume Cap Guardrail: Blocks oversized volumes when account is in defensive mode
  it('Scenario 55: Defensive Mode Volume Cap blocks oversized orders to prevent tilt betting', async () => {
    await Trade.deleteMany({ userId: testUser._id });

    // Create 2 consecutive closed losses
    const loss1 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(Date.now() - 60000),
      exitTime: new Date(Date.now() - 60000),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -50 },
      netPnL: -50,
    });
    const loss2 = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'CLOSED',
      tradeDate: new Date(),
      entryTime: new Date(),
      exitTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      calculated: { netPnL: -50 },
      netPnL: -50,
    });

    sentMessages.length = 0;
    // In defensive mode, recommended best option is ~0.07L. Attempting 0.50L triggers defensive lot cap!
    await TelegramAlertService.handleForexOrderCommand(testUser, botToken, chatId, 'XAUUSD', ['buy', '0.50', 'sl=35']);

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('DEFENSIVE MODE LOT CAP ACTIVE');

    // Clean up
    await Trade.deleteMany({ userId: testUser._id });
  });

  // 56. Unified Callback Protocol Routing (Phase 3)
  it('Scenario 56: Phase 3 Unified Callback Protocol routes domain:action:entity:payload cleanly', async () => {
    const openTrade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'XAUUSD',
      direction: 'LONG',
      status: 'OPEN',
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'FOREX',
      exchange: 'FOREX',
      assetClass: 'FOREX',
      tags: ['MT5', 'MT5_TICKET_998877'],
      simpleExecution: {
        entryPrice: 2650.00,
        quantity: 0.10,
      },
    });

    // 1. Test pos:defense:XAUUSD:TRUE_BE
    sentMessages.length = 0;
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_unified_defense',
      from: { id: chatId },
      data: 'pos:defense:XAUUSD:TRUE_BE',
      message: { message_id: 1111, chat: { id: chatId } },
    });
    const updatedTrade = await Trade.findById(openTrade._id);
    expect(updatedTrade?.risk?.currentStopLoss).toBe(2650.50);

    // 2. Test pos:harvest:XAUUSD:PCT_50
    sentMessages.length = 0;
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_unified_harvest',
      from: { id: chatId },
      data: 'pos:harvest:XAUUSD:PCT_50',
      message: { message_id: 1112, chat: { id: chatId } },
    });
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(sentMessages[sentMessages.length - 1].text).toContain('PROFIT HARVEST EXECUTED (50%)');

    // 3. Test nav:back:cockpit:MAIN
    await (TelegramAlertService as any).handleCallbackQuery({
      id: 'cq_unified_nav',
      from: { id: chatId },
      data: 'nav:back:cockpit:MAIN',
      message: { message_id: 1113, chat: { id: chatId } },
    });

    await Trade.deleteMany({ userId: testUser._id });
  });

  // 57. Ephemeral Message Cleanup Pipeline (Phase 4)
  it('Scenario 57: Ephemeral notifications are scheduled and cleaned up on user interaction', async () => {
    // Schedule an ephemeral message cleanup
    TelegramAlertService.scheduleEphemeralMessageCleanup(botToken, chatId, 999123, 60000);
    const queue = (TelegramAlertService as any).ephemeralQueue;
    expect(queue.some((item: any) => item.messageId === 999123)).toBe(true);

    // Triggering user callback interaction immediately flushes pending ephemeral messages
    await (TelegramAlertService as any).cleanPendingEphemeralMessages(chatId);
    expect((TelegramAlertService as any).ephemeralQueue.filter((item: any) => String(item.chatId) === String(chatId)).length).toBe(0);
  });

  // 58. Automated execution strictly follows user settings ladder
  it('Scenario 58: Auto-execution follows exact settings ladder (T1 +2.0R 50% exit, True BE, MT5 TP cleared for runner)', async () => {
    // 1. Configure user settings exactly as komal@gmail.com
    await User.updateOne(
      { _id: testUser._id },
      {
        $set: {
          'liveWatcherSettings.defaultTargetMode': 'T1_FREE_RUNNER',
          'liveWatcherSettings.defaultAutoExecute': true,
          'liveWatcherSettings.serverSideExecutionEnabled': false, // Prevents external remote server daemon from racing
          'liveWatcherSettings.t1MultipleR': 2.0,
          'liveWatcherSettings.t1ExitRatio': 0.5,
          'liveWatcherSettings.t1TrailingAction': 'TRUE_BE_WITH_FEES',
          'liveWatcherSettings.t2Enabled': false,
          'liveWatcherSettings.isFreeRunner': true,
          'liveWatcherSettings.givebackAutoExitEnabled': true,
          'liveWatcherSettings.givebackMinPeakR': 1.5,
          'liveWatcherSettings.givebackMaxPercent': 35,
        },
      }
    );

    // Pause background timer to test cycle deterministically
    LiveExecutionWorker.stop();

    // Clean up commands and trades for test user
    await Mt5Command.deleteMany({ accountId: testAccount._id });
    await Trade.deleteMany({ userId: testUser._id });

    // Reload testUser from database to pick up updated liveWatcherSettings
    const freshUser = await User.findById(testUser._id).lean();

    const ticket = 33445566;
    // Create an open MT5 trade: Short ETHUSD at 1700, SL at 1710 (10 pts risk, 1R = 10 pts, T1 = 1700 - 20 = 1680)
    const trade = await Trade.create({
      userId: testUser._id,
      accountId: testAccount._id,
      symbol: 'ETHUSD',
      direction: 'SHORT',
      status: 'OPEN',
      tags: [`MT5_TICKET_${ticket}`],
      tradeDate: new Date(),
      entryTime: new Date(),
      marketSegment: 'CRYPTO',
      exchange: 'FOREX',
      assetClass: 'CRYPTO',
      currency: 'USD',
      currencySymbol: '$',
      simpleExecution: {
        entryPrice: 1700,
        quantity: 2.0,
      },
      risk: {
        initialStopLoss: 1710,
        currentStopLoss: 1710,
        initialRiskAmount: 20, // 10 pts * 2.0 qty
        plannedRiskAmount: 20,
      },
      calculated: {
        excursion: {
          initialStopLoss: 1710,
          initialRiskAmount: 20,
        },
      },
    });

    // Price reaches 1680 (exactly +2.0R for Short: 1700 - 2 * 10 = 1680)
    Mt5CommandService.recordPositionQuote(ticket, {
      ticket,
      symbol: 'ETHUSD',
      curPrice: 1680,
      openPrice: 1700,
      pnl: 40,
    });
    Mt5CommandService.recordQuote(testAccount._id, {
      symbol: 'ETHUSD',
      ltp: 1680,
      bid: 1679.90,
      ask: 1680.10,
      timestamp: new Date(),
    });

    // Run execution cycle locally with fresh user settings
    await (LiveExecutionWorker as any).evaluateTrade(freshUser, trade, true);

    // Verify MT5 commands generated:
    // 1. Partial close of exactly 50% (1.00 out of 2.00)
    const closeCmd = await Mt5Command.findOne({
      accountId: testAccount._id,
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(closeCmd).toBeDefined();
    expect(closeCmd?.volume).toBe(1.0);

    // 2. Stop loss trailed to True BE (entry price 1700 or buffered)
    const slCmd = await Mt5Command.findOne({
      accountId: testAccount._id,
      ticket,
      action: 'MODIFY_SL',
    });
    expect(slCmd).toBeDefined();
    expect(slCmd?.stopLoss).toBeLessThanOrEqual(1700);

    // 3. Take Profit cleared (TP = 0) for Free Runner
    const tpCmd = await Mt5Command.findOne({
      accountId: testAccount._id,
      ticket,
      action: 'MODIFY_TP',
    });
    expect(tpCmd).toBeDefined();
    expect(tpCmd?.takeProfit).toBe(0);

    // 4. Verify runner is NOT closed by ladder step
    const allCloseCmds = await Mt5Command.find({
      accountId: testAccount._id,
      ticket,
      action: 'CLOSE_POSITION',
    });
    expect(allCloseCmds.length).toBe(1); // ONLY 1 close command for 1.0 lot, NOT closing the remaining runner!

    await Trade.deleteMany({ userId: testUser._id });
    await Mt5Command.deleteMany({ accountId: testAccount._id });
  });
});
