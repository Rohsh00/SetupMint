/**
 * SetupMint - AI Scheduled Routines Daemon
 *
 * Runs background scheduling for:
 * 1. Morning Pre-Market Trading Readiness Briefing (default: 08:30 in user timezone)
 * 2. End-of-Day (EOD) AI Coach Performance & Discipline Debrief (default: 18:00 in user timezone)
 *
 * Dispatches rich structured cards directly to Telegram and persists them to Dashboard & Journal.
 */

import { User } from '../db/models/index.js';
import { AiDailyBriefingService } from './ai-daily-briefing.service.js';
import { AiCoachService } from './ai-coach.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import { safeDecryptSecret } from './crypto.service.js';

export class AiSchedulerWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static sentAlertKeys = new Map<string, number>();
  private static readonly KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Starts the background scheduler daemon (checks once every 60s)
   */
  static start(intervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[AiSchedulerWorker] AI Morning Briefing & EOD Debrief scheduler daemon started.');

    // Run first check after a brief delay
    setTimeout(() => {
      this.runCycle().catch((err) => {
        console.error('[AiSchedulerWorker] Error in initial scheduler cycle:', err.message);
      });
    }, 5000);

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err: any) {
        console.error('[AiSchedulerWorker] Error in scheduler cycle:', err.message);
      }
    }, intervalMs);
  }

  /**
   * Stops the background scheduler daemon
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[AiSchedulerWorker] AI scheduler daemon stopped.');
  }

  /**
   * Main evaluation cycle: checks all active users against their scheduled times
   */
  static async runCycle(now: Date = new Date()): Promise<{ checkedUsers: number; briefingsSent: number; debriefsSent: number }> {
    this.pruneOldKeys(now.getTime());

    let briefingsSent = 0;
    let debriefsSent = 0;

    // Fetch users with AI enabled
    const users = await User.find({
      'aiSettings.enabled': { $ne: false },
    }).lean();

    for (const user of users) {
      try {
        const tz =
          user.aiSettings?.userTimezone ||
          (user.baseCurrency === 'INR' ? 'Asia/Kolkata' : 'America/New_York');

        // Resolve local time (HH:MM) and local date (YYYY-MM-DD) in user's timezone
        const { localTime, localDate } = this.getTimeInTimezone(now, tz);

        // 1. Morning Briefing Dispatch
        const morningEnabled = user.aiSettings?.scheduledMorningBriefingEnabled !== false;
        const targetMorningTime = (user.aiSettings?.morningBriefingTime || '08:30').slice(0, 5);
        const morningKey = `${user._id}:${localDate}:morning_briefing`;

        if (morningEnabled && localTime === targetMorningTime && !this.sentAlertKeys.has(morningKey)) {
          this.sentAlertKeys.set(morningKey, now.getTime());
          await this.dispatchMorningBriefing(user, localDate);
          briefingsSent++;
        }

        // 2. End-of-Day (EOD) Debrief Dispatch
        const eodEnabled = user.aiSettings?.scheduledEodDebriefEnabled !== false;
        const targetEodTime = (user.aiSettings?.eodDebriefTime || '18:00').slice(0, 5);
        const eodKey = `${user._id}:${localDate}:eod_debrief`;

        if (eodEnabled && localTime === targetEodTime && !this.sentAlertKeys.has(eodKey)) {
          this.sentAlertKeys.set(eodKey, now.getTime());
          await this.dispatchEodDebrief(user, localDate);
          debriefsSent++;
        }
      } catch (userErr: any) {
        console.warn(`[AiSchedulerWorker] Error evaluating schedule for user ${user._id}:`, userErr.message);
      }
    }

    return { checkedUsers: users.length, briefingsSent, debriefsSent };
  }

  /**
   * Generates and dispatches the scheduled Morning Briefing
   */
  private static async dispatchMorningBriefing(user: any, localDate: string): Promise<void> {
    try {
      const briefing = await AiDailyBriefingService.getOrGenerateBriefing({
        userId: user._id,
        date: localDate,
      });

      const rawToken = user.liveWatcherSettings?.telegramBotToken;
      const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
      const chatId = user.liveWatcherSettings?.telegramChatId;
      const alertsEnabled = user.liveWatcherSettings?.telegramAlertsEnabled !== false;

      if (!botToken || !chatId || !alertsEnabled) return;

      const scoreStars =
        '⭐'.repeat(Math.max(1, Math.min(5, Math.round((briefing.readinessScore || 5) / 2)))) +
        '☆'.repeat(5 - Math.max(1, Math.min(5, Math.round((briefing.readinessScore || 5) / 2))));

      let text =
        `🌅 <b>Morning Market Briefing & Readiness</b>\n` +
        `📅 <b>Date:</b> <code>${briefing.date}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🧠 <b>Readiness Score:</b> ${scoreStars} (${briefing.readinessScore}/10)\n` +
        `📊 <b>Session Bias:</b> <code>${briefing.marketSessionBias}</code>\n\n` +
        `💡 <b>Top Edge Focus:</b>\n${briefing.topEdgeInsight}\n\n`;

      if (briefing.dailyDirectives && briefing.dailyDirectives.length > 0) {
        text += `🎯 <b>Daily Directives:</b>\n` +
          briefing.dailyDirectives.slice(0, 3).map((d) => `• ${d}`).join('\n') + `\n\n`;
      }

      text +=
        `🛡️ <b>Imperative Rule for Today:</b>\n` +
        `<i>"${briefing.focusRuleForToday}"</i>`;

      await TelegramAlertService.sendMessage(botToken, chatId, text, [
        [
          { text: '📌 View Cockpit', callback_data: 'cmd_refresh_cockpit' },
          { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
        ],
      ]);
    } catch (err: any) {
      console.warn(`[AiSchedulerWorker] Failed to dispatch morning briefing for user ${user._id}:`, err.message);
    }
  }

  /**
   * Generates and dispatches the scheduled EOD Coach Debrief
   */
  private static async dispatchEodDebrief(user: any, localDate: string): Promise<void> {
    try {
      const debrief = await AiCoachService.getOrGenerateDebrief({
        userId: user._id,
        date: localDate,
      });

      const rawToken = user.liveWatcherSettings?.telegramBotToken;
      const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
      const chatId = user.liveWatcherSettings?.telegramChatId;
      const alertsEnabled = user.liveWatcherSettings?.telegramAlertsEnabled !== false;

      if (!botToken || !chatId || !alertsEnabled) return;

      const scoreStars = '⭐'.repeat(debrief.disciplineScore) + '☆'.repeat(5 - debrief.disciplineScore);
      const isAi = debrief.isAiGenerated;
      const modelTag = isAi ? `🤖 ${debrief.modelUsed || 'Gemini Flash'}` : `⚡ Deterministic Quant Engine`;

      let text =
        `🧠 <b>End-of-Day AI Coach Debrief</b>\n` +
        `📅 <b>Date:</b> <code>${debrief.date}</code> | <b>Discipline:</b> ${scoreStars} (${debrief.disciplineScore}/5)\n` +
        `Engine: <i>${modelTag}</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 <b>Verdict:</b> <code>${debrief.verdict}</code>\n\n` +
        `📋 <b>Session Summary:</b>\n${debrief.summary}\n\n`;

      if (debrief.strengths?.length) {
        text += `💪 <b>Observed Strengths:</b>\n` +
          debrief.strengths.slice(0, 3).map((s) => `• ${s}`).join('\n') + `\n\n`;
      }

      if (debrief.leaks?.length) {
        text += `⚠️ <b>Identified Leaks:</b>\n` +
          debrief.leaks.slice(0, 3).map((l) => `• ${l}`).join('\n') + `\n\n`;
      }

      text +=
        `🎯 <b>Rule for Tomorrow's Session:</b>\n` +
        `<i>"${debrief.ruleForTomorrow}"</i>`;

      await TelegramAlertService.sendMessage(botToken, chatId, text, [
        [
          { text: '📊 Daily Summary', callback_data: 'cmd_summary' },
          { text: '🧠 AI Coach', callback_data: 'cmd_coach' },
        ],
      ]);
    } catch (err: any) {
      console.warn(`[AiSchedulerWorker] Failed to dispatch EOD debrief for user ${user._id}:`, err.message);
    }
  }

  /**
   * Helper to format HH:MM and YYYY-MM-DD in a given timezone safely
   */
  private static getTimeInTimezone(date: Date, timezone: string): { localTime: string; localDate: string } {
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const localTime = formatter.format(date);

      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const localDate = dateFormatter.format(date);

      return { localTime, localDate };
    } catch {
      // Fallback to UTC if timezone is invalid
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const localDate = date.toISOString().slice(0, 10);
      return { localTime: `${hours}:${minutes}`, localDate };
    }
  }

  private static pruneOldKeys(now: number): void {
    for (const [key, timestamp] of this.sentAlertKeys.entries()) {
      if (now - timestamp > this.KEY_TTL_MS) {
        this.sentAlertKeys.delete(key);
      }
    }
  }
}

