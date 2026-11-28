import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User, AiUsageDaily } from '../src/db/models/index.js';
import { AiUsageTrackerService } from '../src/services/ai-usage-tracker.service.js';

describe('AiUsageTrackerService - Request Tracking & Rate Limit Monitor', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    await User.create({
      _id: testUserId,
      email: `test-trader-${Date.now()}@test.local`,
      passwordHash: 'dummyhash123',
      name: 'Test Trader',
      baseCurrency: 'USD',
      aiSettings: {
        enabled: true,
        model: 'gemini-3.5-flash-lite',
        dailyRequestLimit: 1500,
        minuteRequestLimit: 15,
        tier: 'free',
      },
    });
  });

  afterEach(async () => {
    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await AiUsageDaily.deleteMany({ userId: testUserId });
    }
  });

  it('initializes quota with full remaining free tier capacity (1,500 RPD / 15 RPM)', async () => {
    const quota = await AiUsageTrackerService.getQuotaStatus(testUserId);
    expect(quota).toBeDefined();
    expect(quota.tier).toBe('free');
    expect(quota.dailyLimit).toBe(1500);
    expect(quota.requestsToday).toBe(0);
    expect(quota.requestsRemainingToday).toBe(1500);
    expect(quota.percentDailyUsed).toBe(0);
    expect(quota.minuteLimit).toBe(15);
    expect(quota.requestsThisMinute).toBe(0);
    expect(quota.requestsRemainingThisMinute).toBe(15);
    expect(quota.isRateLimited).toBe(false);
    expect(quota.rateLimitedEventsToday).toBe(0);
    expect(quota.resetsInHours).toBeGreaterThanOrEqual(0);
  });

  it('records requests and properly increments daily count and feature breakdown', async () => {
    await AiUsageTrackerService.recordRequest(testUserId, 'TRADE_ANALYSIS', 'gemini-3.5-flash-lite', 450);
    await AiUsageTrackerService.recordRequest(testUserId, 'TRADE_ANALYSIS', 'gemini-3.5-flash-lite', 500);
    await AiUsageTrackerService.recordRequest(testUserId, 'DAILY_BRIEFING', 'gemini-2.5-flash', 800);

    const quota = await AiUsageTrackerService.getQuotaStatus(testUserId);
    expect(quota.requestsToday).toBe(3);
    expect(quota.requestsRemainingToday).toBe(1497);
    expect(quota.requestsThisMinute).toBe(3);
    expect(quota.requestsRemainingThisMinute).toBe(12);
    expect(quota.lastModelUsed).toBe('gemini-2.5-flash');
    expect(quota.lastStatus).toBe('OK');
    expect(quota.featuresToday['TRADE_ANALYSIS']).toBe(2);
    expect(quota.featuresToday['DAILY_BRIEFING']).toBe(1);

    // Verify database record
    const dailyRecord = await AiUsageDaily.findOne({ userId: testUserId });
    expect(dailyRecord).not.toBeNull();
    expect(dailyRecord?.requestCount).toBe(3);
    expect(dailyRecord?.tokensEstimated).toBe(1750);
  });

  it('records 429 rate limit events and activates rate limited status', async () => {
    await AiUsageTrackerService.recordRateLimit(
      testUserId,
      'TRADE_ANALYSIS',
      'gemini-3.5-flash-lite',
      'Resource exhausted: 15 RPM reached'
    );

    const quota = await AiUsageTrackerService.getQuotaStatus(testUserId);
    expect(quota.isRateLimited).toBe(true);
    expect(quota.lastStatus).toBe('RATE_LIMITED');
    expect(quota.rateLimitedEventsToday).toBe(1);
    expect(quota.lastErrorMessage).toContain('Resource exhausted');
  });

  it('allows updating custom quota limits and tier', async () => {
    const updated = await AiUsageTrackerService.updateLimits(testUserId, {
      tier: 'payg',
      dailyLimit: 10000,
      minuteLimit: 60,
    });

    expect(updated.tier).toBe('payg');
    expect(updated.dailyLimit).toBe(10000);
    expect(updated.minuteLimit).toBe(60);

    const user = await User.findById(testUserId);
    expect(user?.aiSettings?.tier).toBe('payg');
    expect(user?.aiSettings?.dailyRequestLimit).toBe(10000);
    expect(user?.aiSettings?.minuteRequestLimit).toBe(60);
  });
});
