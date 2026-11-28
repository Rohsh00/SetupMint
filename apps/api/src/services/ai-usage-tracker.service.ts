/**
 * SetupMint - AI API Quota & Rate Limit Tracker Service
 *
 * Tracks live requests made, remaining daily/minute quotas, and rate-limit events
 * for Google Gemini API across all features (Trade Journaling, Briefing, Pre-Trade, Playbook, Coach).
 *
 * Defaults:
 * - Free Tier Baseline: 1,500 Requests Per Day (RPD), 15 Requests Per Minute (RPM)
 * - Daily reset occurs at 00:00:00 UTC (matching Google's quota reset window)
 */

import mongoose from 'mongoose';
import { IAiQuotaStatus } from '@tradevault/shared';
import { AiUsageDaily, User } from '../db/models/index.js';

export class AiUsageTrackerService {
  // In-memory sliding window for rolling minute RPM tracking: userId -> timestamp[]
  private static minuteTimestamps = new Map<string, number[]>();

  /**
   * Returns current UTC date formatted as YYYY-MM-DD
   */
  private static getTodayUtcString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Records an outgoing AI request and updates persistent daily and rolling minute telemetry.
   */
  static async recordRequest(
    userId: string | mongoose.Types.ObjectId,
    feature: string = 'TRADE_ANALYSIS',
    modelUsed?: string,
    estimatedTokens: number = 1000
  ): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const key = uId.toString();
    const now = Date.now();

    // 1. Update rolling minute sliding window
    const timestamps = this.minuteTimestamps.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < 60000);
    validTimestamps.push(now);
    this.minuteTimestamps.set(key, validTimestamps);

    // 2. Persist to MongoDB AiUsageDaily
    const dateStr = this.getTodayUtcString();
    try {
      await AiUsageDaily.findOneAndUpdate(
        { userId: uId, dateStr },
        {
          $inc: {
            requestCount: 1,
            tokensEstimated: estimatedTokens,
            [`features.${feature}`]: 1,
          },
          $set: {
            lastRequestAt: new Date(now),
            lastModelUsed: modelUsed || 'gemini',
            lastStatus: 'OK',
            lastErrorMessage: undefined,
          },
        },
        { upsert: true, new: true }
      );
    } catch (err: any) {
      console.warn('[AiUsageTracker] Failed to record AI usage to MongoDB:', err.message);
    }
  }

  /**
   * Records a rate limit (HTTP 429 / RESOURCE_EXHAUSTED) event
   */
  static async recordRateLimit(
    userId: string | mongoose.Types.ObjectId,
    feature: string = 'TRADE_ANALYSIS',
    model?: string,
    errorMessage?: string
  ): Promise<void> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const dateStr = this.getTodayUtcString();

    try {
      await AiUsageDaily.findOneAndUpdate(
        { userId: uId, dateStr },
        {
          $inc: {
            rateLimitedCount: 1,
          },
          $set: {
            lastRequestAt: new Date(),
            lastModelUsed: model,
            lastStatus: 'RATE_LIMITED',
            lastErrorMessage: errorMessage || 'Resource exhausted (Rate Limit 429)',
          },
        },
        { upsert: true }
      );
    } catch (err: any) {
      console.warn('[AiUsageTracker] Failed to record rate limit:', err.message);
    }
  }

  /**
   * Returns live quota status, requests made, requests remaining, and countdown to reset.
   */
  static async getQuotaStatus(userId: string | mongoose.Types.ObjectId): Promise<IAiQuotaStatus> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const key = uId.toString();
    const dateStr = this.getTodayUtcString();
    const now = Date.now();

    // 1. Fetch user configuration and daily usage record
    const [user, dailyDoc] = await Promise.all([
      User.findById(uId).lean(),
      AiUsageDaily.findOne({ userId: uId, dateStr }).lean(),
    ]);

    // 2. Resolve configured limits (Defaults: 1,500 RPD, 15 RPM for Gemini Flash Free Tier)
    const tier = (user?.aiSettings as any)?.tier || 'free';
    const defaultDailyLimit = tier === 'payg' ? 100000 : 1500;
    const defaultMinuteLimit = tier === 'payg' ? 1000 : 15;

    const dailyLimit = Number((user?.aiSettings as any)?.dailyRequestLimit) || defaultDailyLimit;
    const minuteLimit = Number((user?.aiSettings as any)?.minuteRequestLimit) || defaultMinuteLimit;

    // 3. Compute rolling minute usage
    const timestamps = this.minuteTimestamps.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < 60000);
    this.minuteTimestamps.set(key, validTimestamps);
    const requestsThisMinute = validTimestamps.length;
    const requestsRemainingThisMinute = Math.max(0, minuteLimit - requestsThisMinute);

    // 4. Compute daily usage
    const requestsToday = dailyDoc?.requestCount || 0;
    const requestsRemainingToday = Math.max(0, dailyLimit - requestsToday);
    const percentDailyUsed = Math.min(100, Math.round((requestsToday / dailyLimit) * 1000) / 10);

    // 5. Compute reset window (00:00:00 UTC tomorrow)
    const tomorrowUtc = new Date();
    tomorrowUtc.setUTCHours(24, 0, 0, 0);
    const msUntilReset = Math.max(0, tomorrowUtc.getTime() - now);
    const resetsInHours = Math.round((msUntilReset / (1000 * 3600)) * 10) / 10;

    const isRateLimited =
      requestsThisMinute >= minuteLimit ||
      requestsToday >= dailyLimit ||
      dailyDoc?.lastStatus === 'RATE_LIMITED';

    return {
      tier,
      dailyLimit,
      requestsToday,
      requestsRemainingToday,
      percentDailyUsed,
      minuteLimit,
      requestsThisMinute,
      requestsRemainingThisMinute,
      isRateLimited,
      rateLimitedEventsToday: dailyDoc?.rateLimitedCount || 0,
      resetAtUtc: tomorrowUtc.toISOString(),
      resetsInHours,
      lastRequestAt: dailyDoc?.lastRequestAt ? new Date(dailyDoc.lastRequestAt).toISOString() : undefined,
      lastModelUsed: dailyDoc?.lastModelUsed,
      lastStatus: dailyDoc?.lastStatus || 'OK',
      lastErrorMessage: dailyDoc?.lastErrorMessage,
      featuresToday: dailyDoc?.features || {},
    };
  }

  /**
   * Updates user custom AI limits or switches tier
   */
  static async updateLimits(
    userId: string | mongoose.Types.ObjectId,
    params: { dailyLimit?: number; minuteLimit?: number; tier?: 'FREE' | 'PAID' | 'CUSTOM' }
  ): Promise<IAiQuotaStatus> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const update: any = {};

    if (params.tier) update['aiSettings.tier'] = params.tier;
    if (params.dailyLimit !== undefined) update['aiSettings.dailyRequestLimit'] = params.dailyLimit;
    if (params.minuteLimit !== undefined) update['aiSettings.minuteRequestLimit'] = params.minuteLimit;

    await User.findByIdAndUpdate(uId, { $set: update });
    return this.getQuotaStatus(uId);
  }
}
