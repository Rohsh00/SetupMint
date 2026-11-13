import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { User, Session, TelegramUpdateAudit, TelegramCallbackLock } from '../src/db/models/index.js';
import { EconomicCalendarService, IEconomicCalendarEvent } from '../src/services/economic-calendar.service.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { GoldNewsAlertWorker } from '../src/services/gold-news-alert.service.js';
import { encryptSecret } from '../src/services/crypto.service.js';
import { hashSessionToken } from '../src/middleware/auth.js';

describe('Gold (XAUUSD) Economic News & Telegram Custom Reminders Integration Tests', () => {
  let app: FastifyInstance;
  let testUser: any;
  let testRawToken: string;
  let authHeaders: { authorization: string };
  let fetchMock: any;
  const sentTelegramMessages: any[] = [];

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Clean up test data strictly scoped to ephemeral test users
    await User.deleteMany({ email: { $regex: /@goldnews\.test\.local$/ } });
    await TelegramUpdateAudit.deleteMany({ updateId: { $in: [77001, 77002, 77003, 77004, 77005] } });
    await TelegramCallbackLock.deleteMany({});
    GoldNewsAlertWorker.resetState();

    // Mock fetch for Telegram API calls
    fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.telegram.org')) {
        let bodyObj: any = {};
        if (init?.body) {
          try {
            bodyObj = JSON.parse(init.body);
          } catch {}
        }
        sentTelegramMessages.push({ url: urlStr, body: bodyObj });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 88888, text: 'Delivered' },
            description: 'Success',
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    // Create test user with Telegram alerts enabled and custom 15m/60m reminders
    const plainToken = '112233445:AAFF_gold_news_test_token_xyz987';
    testUser = await User.create({
      email: `trader_gold_${Date.now()}@goldnews.test.local`,
      passwordHash: 'dummy_hash',
      name: 'Gold Trader Pro',
      baseCurrency: 'USD',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: encryptSecret(plainToken),
        telegramChatId: '88776655',
        telegramAlertEvents: {
          goldNewsReminder: true,
          goldNewsResultAlert: true,
        },
        goldNewsReminderMinutes: 15,
        goldNewsLeadTimesMinutes: [15, 60],
        goldNewsImpactFilter: 'ALL_GOLD_MOVERS',
      },
    });

    testRawToken = `raw_token_gold_${Date.now()}`;
    await Session.create({
      userId: testUser._id,
      tokenHash: hashSessionToken(testRawToken),
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Test Runner',
      lastActiveAt: new Date(),
    });
    authHeaders = { authorization: `Bearer ${testRawToken}` };
  }, 30000);

  afterAll(async () => {
    if (testUser?._id) {
      await Session.deleteMany({ userId: testUser._id });
    }
    await User.deleteMany({ email: { $regex: /@goldnews\.test\.local$/ } });
    vi.restoreAllMocks();
    await app.close();
  });

  it('1. EconomicCalendarService identifies gold-moving catalysts with impact notes and actions', async () => {
    const calendar = await EconomicCalendarService.getCalendarOverview(new Date());
    expect(calendar).toBeDefined();
    expect(calendar.upcomingEvents.length).toBeGreaterThan(0);

    const firstEvent = calendar.upcomingEvents[0];
    expect(firstEvent.isGoldMover).toBe(true);
    expect(firstEvent.goldImpactNote).toBeDefined();
    expect(typeof firstEvent.goldImpactNote).toBe('string');
    expect(firstEvent.recommendedAction).toBeDefined();

    // Verify formatGoldNewsTelegramAlert produces valid HTML & inline buttons
    const formatted = EconomicCalendarService.formatGoldNewsTelegramAlert(firstEvent, 15);
    expect(formatted.text).toContain('GOLD (XAUUSD) CATALYST ALERT');
    expect(formatted.text).toContain('Releases in 15 mins');
    expect(formatted.buttons.length).toBe(2);
    expect(formatted.buttons[0][0].callback_data).toBe('chart_xauusd');
  });

  it('2. TelegramAlertService.sendGoldNewsReminder delivers formatted alert to user', async () => {
    sentTelegramMessages.length = 0;

    const sampleEvent: IEconomicCalendarEvent = {
      id: 'TEST_CPI_EVENT_101',
      title: 'US Core CPI m/m (Consumer Price Index)',
      country: 'USD',
      impact: 'HIGH',
      isGoldMover: true,
      timestamp: new Date(Date.now() + 15 * 60000).toISOString(),
      istTimeStr: 'Today 18:30 IST',
      countdownStr: 'in 15m',
      minutesUntil: 15,
      forecast: '0.3%',
      previous: '0.3%',
      status: 'IMMINENT',
      goldImpactNote: 'Strong inflation boosts USD and yields, pressuring Gold downward.',
      goldBias: 'BULLISH_IF_LOW',
      recommendedAction: 'Lock Breakeven (BE) on open XAUUSD trades.',
    };

    const sent = await TelegramAlertService.sendGoldNewsReminder(testUser, sampleEvent, 15);
    expect(sent).toBe(true);
    expect(sentTelegramMessages.length).toBe(1);
    expect(sentTelegramMessages[0].body.chat_id).toBe('88776655');
    expect(sentTelegramMessages[0].body.text).toContain('US Core CPI m/m');
    expect(sentTelegramMessages[0].body.text).toContain('Releases in 15 mins');
  });

  it('3. /news or /goldnews Telegram command displays upcoming Gold catalysts and countdowns', async () => {
    sentTelegramMessages.length = 0;

    const updatePayload = {
      update_id: 77001,
      message: {
        chat: { id: 88776655 },
        text: '/news',
      },
    };

    await TelegramAlertService.processWebhookUpdate(updatePayload);
    expect(sentTelegramMessages.length).toBe(1);
    const sentText = sentTelegramMessages[0].body.text;
    expect(sentText).toContain('XAUUSD (GOLD) CATALYST RADAR');
    expect(sentText).toContain('Reminder: Active');
  });

  it('4. /newsremind command dynamically adjusts custom reminder time in user profile', async () => {
    sentTelegramMessages.length = 0;

    // Command: /newsremind 30
    await TelegramAlertService.processWebhookUpdate({
      update_id: 77002,
      message: {
        chat: { id: 88776655 },
        text: '/newsremind 30',
      },
    });

    const updatedUser = await User.findById(testUser._id).lean();
    expect(updatedUser?.liveWatcherSettings?.goldNewsReminderMinutes).toBe(30);
    expect(updatedUser?.liveWatcherSettings?.goldNewsLeadTimesMinutes).toContain(30);

    expect(sentTelegramMessages.length).toBe(1);
    expect(sentTelegramMessages[0].body.text).toContain('Gold News Reminder Updated!');
    expect(sentTelegramMessages[0].body.text).toContain('30 minutes');

    // Command: /newsremind 15,45
    sentTelegramMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      update_id: 77003,
      message: {
        chat: { id: 88776655 },
        text: '/newsremind 15,45',
      },
    });

    const multiUser = await User.findById(testUser._id).lean();
    expect(multiUser?.liveWatcherSettings?.goldNewsLeadTimesMinutes).toEqual([15, 45]);
    expect(sentTelegramMessages[0].body.text).toContain('15 & 45 minutes');

    // Command: /newsremind off
    sentTelegramMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      update_id: 77004,
      message: {
        chat: { id: 88776655 },
        text: '/newsremind off',
      },
    });

    const disabledUser = await User.findById(testUser._id).lean();
    expect(disabledUser?.liveWatcherSettings?.telegramAlertEvents?.goldNewsReminder).toBe(false);
    expect(sentTelegramMessages[0].body.text).toContain('DISABLED');

    // Command: /newsremind on
    sentTelegramMessages.length = 0;
    await TelegramAlertService.processWebhookUpdate({
      update_id: 77005,
      message: {
        chat: { id: 88776655 },
        text: '/newsremind on',
      },
    });

    const reEnabledUser = await User.findById(testUser._id).lean();
    expect(reEnabledUser?.liveWatcherSettings?.telegramAlertEvents?.goldNewsReminder).toBe(true);
    expect(sentTelegramMessages[0].body.text).toContain('ENABLED');
  });

  it('5. GoldNewsAlertWorker evaluates lead-times and deduplicates alerts without spam', async () => {
    GoldNewsAlertWorker.resetState();
    sentTelegramMessages.length = 0;

    // Reset user to 15m reminder
    await User.findByIdAndUpdate(testUser._id, {
      $set: {
        'liveWatcherSettings.telegramAlertEvents.goldNewsReminder': true,
        'liveWatcherSettings.goldNewsReminderMinutes': 15,
        'liveWatcherSettings.goldNewsLeadTimesMinutes': [15],
      },
    });

    // Mock upcoming gold event precisely 15 minutes away
    const testNow = new Date('2026-11-10T12:00:00Z');
    const mockUpcomingEvents: IEconomicCalendarEvent[] = [
      {
        id: 'GOLD_TEST_NFP_EVENT',
        title: 'Non-Farm Employment Change (NFP)',
        country: 'USD',
        impact: 'HIGH',
        isGoldMover: true,
        timestamp: new Date('2026-11-10T12:15:00Z').toISOString(),
        istTimeStr: 'Today 17:45 IST',
        countdownStr: 'in 15m',
        minutesUntil: 15,
        forecast: '180K',
        previous: '160K',
        status: 'IMMINENT',
        goldImpactNote: 'Key labor catalyst for Gold.',
        goldBias: 'BULLISH_IF_LOW',
        recommendedAction: 'Avoid market orders ±5m.',
      },
    ];

    vi.spyOn(EconomicCalendarService, 'getUpcomingGoldNews').mockResolvedValue(mockUpcomingEvents);

    // Cycle 1: Should fire alert for active users
    const cycle1 = await GoldNewsAlertWorker.runCycle(testNow);
    expect(cycle1.alertsDispatched).toBeGreaterThanOrEqual(1);
    const userMessages1 = sentTelegramMessages.filter((m) => m.body.chat_id === '88776655');
    expect(userMessages1.length).toBe(1);
    expect(userMessages1[0].body.text).toContain('Non-Farm Employment Change');

    // Cycle 2 (10 seconds later, still 15m away): Must NOT fire duplicate alert
    const cycle2 = await GoldNewsAlertWorker.runCycle(new Date('2026-11-10T12:00:10Z'));
    expect(cycle2.alertsDispatched).toBe(0);
    const userMessages2 = sentTelegramMessages.filter((m) => m.body.chat_id === '88776655');
    expect(userMessages2.length).toBe(1); // unchanged (no duplicate)
  });

  it('6. POST /settings/test-gold-news-alert dispatches live test reminder to Telegram', async () => {
    sentTelegramMessages.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/test-gold-news-alert',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(sentTelegramMessages.length).toBeGreaterThan(0);
    expect(sentTelegramMessages[0].body.text).toContain('GOLD (XAUUSD) CATALYST ALERT');
  });

  it('7. GET /accounts/gold-news returns upcoming catalysts and active reminder settings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/accounts/gold-news',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body).data;
    expect(data).toBeDefined();
    expect(data.goldNewsReminderSettings).toBeDefined();
  });

  it('8. EconomicCalendarService.evaluateActualGoldImpact calculates accurate deviation & Gold/USD bias', () => {
    // Case A: CPI Softer than Forecast -> Bullish Gold, Bearish USD
    const cpiImpact = EconomicCalendarService.evaluateActualGoldImpact(
      'CPI m/m (Consumer Price Index)',
      2.8,
      3.1,
      3.2
    );
    expect(cpiImpact.deviationDirection).toBe('MISS');
    expect(cpiImpact.deviation).toBe('-0.3');
    expect(cpiImpact.goldBias).toBe('BULLISH');
    expect(cpiImpact.summaryNote).toContain('Gold (XAUUSD)');

    // Case B: Unemployment Claims Higher than Forecast -> Cooling Labor -> Bullish Gold
    const claimsImpact = EconomicCalendarService.evaluateActualGoldImpact(
      'Initial Jobless Claims',
      235,
      215,
      210
    );
    expect(claimsImpact.deviationDirection).toBe('BEAT');
    expect(claimsImpact.goldBias).toBe('BULLISH');
    expect(claimsImpact.summaryNote).toContain('labor cooling');

    // Case C: NFP Stronger than Forecast -> Strong Labor -> Bearish Gold, Bullish USD
    const nfpImpact = EconomicCalendarService.evaluateActualGoldImpact(
      'Non-Farm Employment Change',
      240,
      180,
      160
    );
    expect(nfpImpact.deviationDirection).toBe('BEAT');
    expect(nfpImpact.goldBias).toBe('BEARISH');
    expect(nfpImpact.summaryNote).toContain('Gold');
  });

  it('9. EconomicCalendarService.formatGoldNewsResultTelegramAlert produces formatted post-release flash', () => {
    const releasedEvent: IEconomicCalendarEvent = {
      id: 'TEST_RELEASED_CPI_99',
      title: 'US CPI m/m',
      country: 'USD',
      impact: 'HIGH',
      isGoldMover: true,
      timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
      istTimeStr: 'Today 18:30 IST',
      countdownStr: '5m ago',
      minutesUntil: -5,
      actual: '0.1%',
      forecast: '0.3%',
      previous: '0.3%',
      deviation: '-0.20%',
      deviationDirection: 'MISS',
      actualBiasOutcome: 'BULLISH',
      actualSummaryNote: 'Inflation came in softer than expected (-0.20%). BULLISH for Gold (XAUUSD), BEARISH for USD.',
      goldImpactNote: 'Strong inflation boosts USD and yields, pressuring Gold downward.',
      goldBias: 'BULLISH_IF_LOW',
      recommendedAction: 'Watch for upward Gold momentum sweep.',
    };

    const formatted = EconomicCalendarService.formatGoldNewsResultTelegramAlert(releasedEvent, '2784.50');
    expect(formatted.text).toContain('US ECONOMIC DATA FLASH');
    expect(formatted.text).toContain('US CPI m/m');
    expect(formatted.text).toContain('0.1%');
    expect(formatted.text).toContain('0.3%');
    expect(formatted.text).toContain('BULLISH FOR GOLD');
    expect(formatted.text).toContain('$2784.50');
    expect(formatted.buttons.length).toBe(2);
    expect(formatted.buttons[0][0].callback_data).toBe('chart_xauusd');
    expect(formatted.buttons[1][0].callback_data).toBe('lock_be_all');
  });

  it('10. GoldNewsAlertWorker triggers post-news actual flash and deduplicates', async () => {
    GoldNewsAlertWorker.resetState();
    sentTelegramMessages.length = 0;

    const testNow = new Date('2026-11-10T12:05:00Z');
    const mockReleasedEvents: IEconomicCalendarEvent[] = [
      {
        id: 'GOLD_TEST_RELEASED_NFP',
        title: 'Non-Farm Employment Change',
        country: 'USD',
        impact: 'HIGH',
        isGoldMover: true,
        timestamp: new Date('2026-11-10T12:00:00Z').toISOString(),
        istTimeStr: 'Today 17:30 IST',
        countdownStr: '5m ago',
        minutesUntil: -5,
        actual: '135K',
        forecast: '180K',
        previous: '160K',
        deviation: '-45.00K',
        deviationDirection: 'MISS',
        actualBiasOutcome: 'BULLISH',
        actualSummaryNote: 'Labor figures weaker than expected (-45.00K). BULLISH for Gold (XAUUSD), BEARISH for USD.',
        goldImpactNote: 'Key labor catalyst for Gold.',
        goldBias: 'BULLISH_IF_LOW',
        recommendedAction: 'Watch for volatility sweep.',
      },
    ];

    vi.spyOn(EconomicCalendarService, 'getUpcomingGoldNews').mockResolvedValue(mockReleasedEvents);

    // Run cycle 1: Should deliver Post-News Actual Result Flash
    const cycle1 = await GoldNewsAlertWorker.runCycle(testNow);
    expect(cycle1.alertsDispatched).toBeGreaterThanOrEqual(1);
    const userMessages1 = sentTelegramMessages.filter((m) => m.body.chat_id === '88776655');
    expect(userMessages1.length).toBe(1);
    expect(userMessages1[0].body.text).toContain('US ECONOMIC DATA FLASH');
    expect(userMessages1[0].body.text).toContain('135K');

    // Run cycle 2 (30s later): Should NOT dispatch duplicate flash
    const cycle2 = await GoldNewsAlertWorker.runCycle(new Date('2026-11-10T12:05:30Z'));
    expect(cycle2.alertsDispatched).toBe(0);
    const userMessages2 = sentTelegramMessages.filter((m) => m.body.chat_id === '88776655');
    expect(userMessages2.length).toBe(1); // no duplicate
  });

  it('11. POST /settings/test-gold-news-result-alert dispatches sample post-news actual flash', async () => {
    sentTelegramMessages.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/test-gold-news-result-alert',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(sentTelegramMessages.length).toBeGreaterThan(0);
    expect(sentTelegramMessages[0].body.text).toContain('US ECONOMIC DATA FLASH');
    expect(sentTelegramMessages[0].body.text).toContain('BULLISH FOR GOLD');
  });
});
