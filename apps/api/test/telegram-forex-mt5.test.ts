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

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Mock fetch for Telegram Bot API
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      const body = init?.body ? JSON.parse(init.body) : {};

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
    expect(keyboard.length).toBe(4);
    expect(keyboard[0][0].text).toContain('BUY Gold (0.10)');
    expect(keyboard[1][0].text).toContain('BUY ETH (1.00)');
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
});
