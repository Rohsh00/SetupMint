import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User, TradingAccount, Trade } from '../src/db/models/index.js';
import { AiSchedulerWorker } from '../src/services/ai-scheduler.service.js';

describe('AiSchedulerWorker - Automated Morning Briefing & EOD Debrief', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testAccountId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testAccountId = new mongoose.Types.ObjectId();

    await User.create({
      _id: testUserId,
      email: `scheduler-${Date.now()}@test.local`,
      passwordHash: 'dummyhash123',
      name: 'Schedule Trader',
      baseCurrency: 'USD',
      aiSettings: {
        enabled: true,
        scheduledMorningBriefingEnabled: true,
        morningBriefingTime: '08:30',
        scheduledEodDebriefEnabled: true,
        eodDebriefTime: '18:00',
        userTimezone: 'UTC',
      },
    });

    await TradingAccount.create({
      _id: testAccountId,
      userId: testUserId,
      name: 'Test Schedule Account',
      broker: 'OTHER',
      accountType: 'DEMO',
      currency: 'USD',
    });
  });

  afterEach(async () => {
    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await TradingAccount.deleteOne({ _id: testAccountId });
    }
  });

  it('triggers morning briefing when current time matches morningBriefingTime', async () => {
    // Construct a Date at exactly 08:30 UTC
    const morningDate = new Date('2026-11-28T08:30:00.000Z');

    const result = await AiSchedulerWorker.runCycle(morningDate);
    expect(result.checkedUsers).toBeGreaterThanOrEqual(1);
    expect(result.briefingsSent).toBeGreaterThanOrEqual(1);

    // Second run on the same minute must be deduplicated
    const secondResult = await AiSchedulerWorker.runCycle(morningDate);
    expect(secondResult.briefingsSent).toBe(0);
  });

  it('triggers EOD debrief when current time matches eodDebriefTime', async () => {
    // Create closed trade for today
    await Trade.create({
      userId: testUserId,
      accountId: testAccountId,
      symbol: 'EURUSD',
      direction: 'LONG',
      assetClass: 'FOREX',
      marketSegment: 'FOREX',
      exchange: 'GLOBAL',
      currency: 'USD',
      status: 'CLOSED',
      tradeDate: new Date('2026-11-28T10:00:00.000Z'),
      entryTime: new Date('2026-11-28T10:00:00.000Z'),
      exitTime: new Date('2026-11-28T11:00:00.000Z'),
      simpleExecution: { entryPrice: 1.05, exitPrice: 1.055, quantity: 1.0 },
      calculated: { netPnL: 500, realizedRMultiple: 2.0 },
    });

    // Construct a Date at exactly 18:00 UTC
    const eodDate = new Date('2026-11-28T18:00:00.000Z');

    const result = await AiSchedulerWorker.runCycle(eodDate);
    expect(result.checkedUsers).toBeGreaterThanOrEqual(1);
    expect(result.debriefsSent).toBeGreaterThanOrEqual(1);

    // Clean up test trade
    await Trade.deleteMany({ userId: testUserId });
  });
});
