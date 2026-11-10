import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import {
  User,
  BrokerIntegration,
} from '../src/db/models/index.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { LiveExecutionWorker } from '../src/services/live-execution-worker.service.js';

describe('FYERS Session & Token Expiry Deduplication Guard Tests', () => {
  let testUser: any;
  let testBroker: any;
  const sentAlerts: any[] = [];

  beforeAll(async () => {
    await connectDatabase();

    // Clean up any test fixtures
    await User.deleteMany({ email: { $regex: /@token-expiry-test\.local$/ } });
    await BrokerIntegration.deleteMany({ clientId: 'TEST_FYERS_EXPIRY' });

    // Mock fetch for Telegram Bot API calls
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.telegram.org')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        sentAlerts.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 8888, text: body.text },
            description: 'Success',
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    testUser = await User.create({
      email: `expiry_trader_${Date.now()}@token-expiry-test.local`,
      passwordHash: 'dummy_hash',
      name: 'Expiry Tester',
      baseCurrency: 'INR',
      liveWatcherSettings: {
        serverSideExecutionEnabled: true,
        telegramAlertsEnabled: true,
        telegramBotToken: '123456789:ABCdefGhIJKlmnoPQRstuVWXyz123456',
        telegramChatId: '998877665',
        telegramAlertEvents: {
          tokenExpiryWarning: true,
        },
      },
    });

    testBroker = await BrokerIntegration.create({
      userId: testUser._id,
      broker: 'FYERS',
      status: 'CONNECTED',
      clientId: 'TEST_FYERS_EXPIRY',
      tokenExpiresAt: new Date('2026-11-08T01:00:00.000Z'), // Expired prior to Nov 9
    });
  }, 30000);

  afterAll(async () => {
    await BrokerIntegration.deleteMany({ _id: testBroker?._id });
    await User.deleteMany({ _id: testUser?._id });
    await disconnectDatabase();
    vi.restoreAllMocks();
  }, 30000);

  it('1. Atomically claims lastMorningTokenAlertDate in database and prevents repetitive alerts', async () => {
    sentAlerts.length = 0;

    // Simulate pre-market hours (Mon 08:47 AM IST) by faking ONLY Date so MongoDB driver timers are not frozen
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T03:17:00.000Z')); // 08:47 AM IST (UTC 03:17)

    try {
      // Run first cycle
      await LiveExecutionWorker.runCycle();

      // Check user in database: lastMorningTokenAlertDate should be claimed
      const updatedUser = await User.findById(testUser._id).lean();
      expect(updatedUser?.liveWatcherSettings?.lastMorningTokenAlertDate).toBeDefined();

      const claimedDate = updatedUser?.liveWatcherSettings?.lastMorningTokenAlertDate;
      expect(typeof claimedDate).toBe('string');
      expect(sentAlerts.length).toBe(1);

      // Run cycle again (simulating multiple intervals / restarts / duplicate worker processes)
      const alertCountBeforeSecondCycle = sentAlerts.length;
      await LiveExecutionWorker.runCycle();

      // The second cycle must be completely suppressed by the persistent atomic database lock
      expect(sentAlerts.length).toBe(alertCountBeforeSecondCycle);
    } finally {
      vi.useRealTimers();
    }
  }, 20000);

  it('2. Suppresses pre-market expiry alerts when tokenExpiryWarning is toggled off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-09T03:17:00.000Z')); // 08:47 AM IST

    try {
      // Disable tokenExpiryWarning for the user
      await User.updateOne(
        { _id: testUser._id },
        {
          $set: {
            'liveWatcherSettings.telegramAlertEvents.tokenExpiryWarning': false,
            'liveWatcherSettings.lastMorningTokenAlertDate': '2020-01-01', // Reset date
          },
        }
      );

      sentAlerts.length = 0;
      await LiveExecutionWorker.runCycle();

      // Should NOT send alert because tokenExpiryWarning is false
      expect(sentAlerts.length).toBe(0);

      // Re-enable
      await User.updateOne(
        { _id: testUser._id },
        { $set: { 'liveWatcherSettings.telegramAlertEvents.tokenExpiryWarning': true } }
      );
    } finally {
      vi.useRealTimers();
    }
  }, 20000);

  it('3. Enforces 15-minute debounce on TelegramAlertService for session expiry warnings', async () => {
    const alertParams = {
      botToken: '123456789:ABCdefGhIJKlmnoPQRstuVWXyz123456',
      chatId: '998877665',
      title: '⏰ Pre-Market FYERS Session Expired',
      body: 'Your FYERS 24h broker access token has expired. Re-authenticate on SetupMint before market opens at 09:15 AM to enable live tracking and automated trailing.',
      severity: 'WARNING' as const,
    };

    sentAlerts.length = 0;
    const firstCallResult = await TelegramAlertService.sendAlert(alertParams);
    expect(firstCallResult).toBe(true);

    // Immediate second call should be blocked by 15-minute debounce
    const secondCallResult = await TelegramAlertService.sendAlert(alertParams);
    expect(secondCallResult).toBe(false);

    expect(sentAlerts.length).toBe(1);
  });
});
