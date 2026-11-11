import { User } from '../db/models/index.js';
import { EconomicCalendarService, IEconomicCalendarEvent } from './economic-calendar.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';

/**
 * GoldNewsAlertWorker
 *
 * Background automation daemon that continuously monitors upcoming US and global macroeconomic
 * news releases that move Gold (XAUUSD), and dispatches customized Telegram alerts at user-defined
 * lead times (e.g. 15m, 30m, 60m before release).
 */
export class GoldNewsAlertWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static sentAlertKeys = new Map<string, number>();
  private static readonly KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Starts the background monitoring loop. Runs every intervalMs.
   */
  static start(intervalMs = 30000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[GoldNewsAlertWorker] Background Gold (XAUUSD) news reminder daemon started.');

    // Run first cycle shortly after boot
    setTimeout(() => {
      this.runCycle().catch((err) => {
        console.error('[GoldNewsAlertWorker] Error in initial cycle:', err.message);
      });
    }, 3000);

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err: any) {
        console.error('[GoldNewsAlertWorker] Error in news reminder cycle:', err.message);
      }
    }, intervalMs);
  }

  /**
   * Stops the background monitoring loop.
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[GoldNewsAlertWorker] News reminder daemon stopped.');
  }

  /**
   * Evaluates all upcoming Gold news events and dispatches alerts for matching users.
   */
  static async runCycle(now: Date = new Date()): Promise<{ checkedUsers: number; alertsDispatched: number }> {
    this.pruneOldKeys(now.getTime());

    // 1. Fetch upcoming Gold catalysts for next 24 hours
    const goldEvents = await EconomicCalendarService.getUpcomingGoldNews(now, 24);
    if (!goldEvents || goldEvents.length === 0) {
      return { checkedUsers: 0, alertsDispatched: 0 };
    }

    // 2. Find all active users with Telegram alerts enabled
    const activeUsers = await User.find({
      'liveWatcherSettings.telegramAlertsEnabled': true,
      'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
      'liveWatcherSettings.telegramChatId': { $exists: true, $ne: null },
    }).lean();

    if (!activeUsers || activeUsers.length === 0) {
      return { checkedUsers: 0, alertsDispatched: 0 };
    }

    let alertsDispatched = 0;
    const nowMs = now.getTime();

    for (const user of activeUsers) {
      const watcherSettings = user.liveWatcherSettings;
      // Skip if user explicitly disabled gold news reminders
      if (watcherSettings?.telegramAlertEvents?.goldNewsReminder === false) {
        continue;
      }

      // Determine configured reminder lead times (in minutes)
      const leadTimes: number[] =
        Array.isArray(watcherSettings?.goldNewsLeadTimesMinutes) &&
        watcherSettings.goldNewsLeadTimesMinutes.length > 0
          ? watcherSettings.goldNewsLeadTimesMinutes
          : [watcherSettings?.goldNewsReminderMinutes || 15];

      for (const event of goldEvents) {
        const evDate = new Date(event.timestamp);
        const minutesUntil = Math.round((evDate.getTime() - nowMs) / 60000);

        // Check each user-configured reminder offset
        for (const targetLead of leadTimes) {
          // Trigger when event is within [targetLead - 2, targetLead] minutes away
          if (minutesUntil <= targetLead && minutesUntil >= Math.max(targetLead - 2, 0)) {
            const alertKey = `gold_lead:${user._id}:${event.id}:${targetLead}`;
            if (!this.sentAlertKeys.has(alertKey)) {
              this.sentAlertKeys.set(alertKey, nowMs);
              const sent = await TelegramAlertService.sendGoldNewsReminder(user, event, targetLead);
              if (sent) alertsDispatched++;
            }
          }
        }

        // Dedicated Blackout Warning (at 5 minutes before release)
        if (minutesUntil <= 5 && minutesUntil >= 0) {
          const blackoutKey = `gold_blackout:${user._id}:${event.id}`;
          if (!this.sentAlertKeys.has(blackoutKey)) {
            this.sentAlertKeys.set(blackoutKey, nowMs);
            const sent = await TelegramAlertService.sendGoldNewsReminder(
              user,
              event,
              Math.max(minutesUntil, 1)
            );
            if (sent) alertsDispatched++;
          }
        }
      }
    }

    // Evaluate major Gold session transitions (London Open, NY Open, London Fix)
    await this.checkGoldSessionTransitions(activeUsers, now);

    return { checkedUsers: activeUsers.length, alertsDispatched };
  }

  /**
   * Checks for major Gold session transitions and dispatches timely notifications.
   */
  static async checkGoldSessionTransitions(activeUsers: any[], now: Date): Promise<void> {
    const dayOfWeek = now.getUTCDay();
    // Monday = 1, Friday = 5. Skip weekends.
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const totalUtcMins = utcHours * 60 + utcMinutes;
    const dateStr = now.toISOString().slice(0, 10);

    const SESSIONS = [
      {
        id: 'LONDON_OPEN',
        name: '🇬🇧 London Open (08:00 UTC / 13:30 IST)',
        targetMinute: 8 * 60, // 08:00 UTC
        description: 'Major European liquidity injection. Watch for breakout expansions, institutional retests, and initial direction setting.',
        keyFocus: 'High volume surge; false breakout traps common at session open.',
      },
      {
        id: 'NY_OPEN',
        name: '🇺🇸 New York Open (13:30 UTC / 19:00 IST)',
        targetMinute: 13 * 60 + 30, // 13:30 UTC
        description: 'US equity and commodity cash open. Peak volatility window for XAUUSD with highest daily volume and trend acceleration.',
        keyFocus: 'Aggressive trending moves and rapid stop sweeps.',
      },
      {
        id: 'LONDON_FIX',
        name: '🇬🇧 London PM Gold Fix (15:00 UTC / 20:30 IST)',
        targetMinute: 15 * 60, // 15:00 UTC
        description: 'Global benchmark pricing window by bullion banks. Large institutional order balancing occurs now.',
        keyFocus: 'Sharp mean-reversion spikes and sudden liquidity withdrawals.',
      },
    ];

    for (const session of SESSIONS) {
      if (Math.abs(totalUtcMins - session.targetMinute) <= 1) {
        for (const user of activeUsers) {
          const key = `session:${user._id}:${session.id}:${dateStr}`;
          if (!this.sentAlertKeys.has(key)) {
            this.sentAlertKeys.set(key, now.getTime());
            TelegramAlertService.sendGoldSessionAlert(user, session.name, session.description, session.keyFocus).catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Resets internal sent state (useful for test suites).
   */
  static resetState(): void {
    this.sentAlertKeys.clear();
  }

  /**
   * Automatically clears cached deduplication keys older than KEY_TTL_MS.
   */
  private static pruneOldKeys(nowMs: number): void {
    if (this.sentAlertKeys.size > 2000) {
      for (const [key, sentAt] of this.sentAlertKeys.entries()) {
        if (nowMs - sentAt > this.KEY_TTL_MS) {
          this.sentAlertKeys.delete(key);
        }
      }
    }
  }
}

