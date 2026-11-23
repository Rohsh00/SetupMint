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
   * Evaluates all upcoming Gold news events and market session transitions,
   * dispatching alerts for matching users.
   */
  static async runCycle(now: Date = new Date()): Promise<{ checkedUsers: number; alertsDispatched: number }> {
    this.pruneOldKeys(now.getTime());

    // 1. Find all active users with Telegram alerts enabled
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

    // 2. ALWAYS evaluate major market session transitions independently of economic news calendar!
    try {
      const sessionAlerts = await this.checkGoldSessionTransitions(activeUsers, now);
      alertsDispatched += sessionAlerts;
    } catch (err: any) {
      console.error('[GoldNewsAlertWorker] Error evaluating market session transitions:', err?.message || err);
    }

    // 3. Fetch upcoming Gold catalysts for next 24 hours (safely wrapped)
    let goldEvents: IEconomicCalendarEvent[] = [];
    try {
      goldEvents = await EconomicCalendarService.getUpcomingGoldNews(now, 24);
    } catch (err: any) {
      console.error('[GoldNewsAlertWorker] Error fetching upcoming gold news:', err?.message || err);
    }

    if (!goldEvents || goldEvents.length === 0) {
      return { checkedUsers: activeUsers.length, alertsDispatched };
    }

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

        // Dedicated 2-Minute Emergency Shield Warning (High Impact Releases)
        if (minutesUntil <= 2 && minutesUntil >= 0 && event.impact === 'HIGH') {
          const urgentKey = `gold_urgent_2m:${user._id}:${event.id}`;
          if (!this.sentAlertKeys.has(urgentKey)) {
            this.sentAlertKeys.set(urgentKey, nowMs);
            const sent = await TelegramAlertService.sendGoldNewsUrgentShield(user, event);
            if (sent) alertsDispatched++;
          }
        }

        // Post-Release Actual News Flash (when actual data is published)
        if (
          minutesUntil <= 0 &&
          minutesUntil >= -60 &&
          event.actual &&
          event.actual !== '—' &&
          watcherSettings?.telegramAlertEvents?.goldNewsResultAlert !== false
        ) {
          const resultKey = `gold_result:${user._id}:${event.id}`;
          if (!this.sentAlertKeys.has(resultKey)) {
            this.sentAlertKeys.set(resultKey, nowMs);
            const sent = await TelegramAlertService.sendGoldNewsResultAlert(user, event);
            if (sent) alertsDispatched++;
          }
        }
      }
    }

    return { checkedUsers: activeUsers.length, alertsDispatched };
  }

  /**
   * Checks for major global market session transitions and dispatches timely notifications.
   */
  static async checkGoldSessionTransitions(activeUsers: any[], now: Date): Promise<number> {
    const dayOfWeek = now.getUTCDay();
    // Monday = 1, Friday = 5. Skip weekends (Sunday = 0, Saturday = 6).
    if (dayOfWeek === 0 || dayOfWeek === 6) return 0;

    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const totalUtcMins = utcHours * 60 + utcMinutes;
    const dateStr = now.toISOString().slice(0, 10);
    let alertsSent = 0;

    const SESSIONS = [
      {
        id: 'ASIAN_OPEN',
        name: '🇯🇵 Tokyo / Asian Session Open (00:00 UTC / 05:30 IST)',
        targetMinute: 0, // 00:00 UTC
        description: 'Asian trading session commences. Lower volatility, baseline range establishment, liquidity building ahead of European open.',
        keyFocus: 'Initial daily range formation; respect Asian session high/low boundaries.',
      },
      {
        id: 'NSE_OPEN',
        name: '🇮🇳 Indian Market Open (03:45 UTC / 09:15 IST)',
        targetMinute: 3 * 60 + 45, // 03:45 UTC = 09:15 IST
        description: 'NSE equity and commodities cash market open. High opening tick volume across Indian indices and MCX.',
        keyFocus: 'Opening gap fill dynamics, opening range breakout (ORB), and high volatility at 09:15 - 09:30 IST.',
      },
      {
        id: 'LONDON_OPEN',
        name: '🇬🇧 London Open (08:00 UTC / 13:30 IST)',
        targetMinute: 8 * 60, // 08:00 UTC = 13:30 IST
        description: 'Major European liquidity injection. Watch for breakout expansions, institutional retests, and initial direction setting.',
        keyFocus: 'High volume surge; false breakout traps common at session open.',
      },
      {
        id: 'NY_OPEN',
        name: '🇺🇸 New York Open (13:30 UTC / 19:00 IST)',
        targetMinute: 13 * 60 + 30, // 13:30 UTC = 19:00 IST
        description: 'US equity and commodity cash open. Peak volatility window for XAUUSD with highest daily volume and trend acceleration.',
        keyFocus: 'Aggressive trending moves and rapid stop sweeps.',
      },
      {
        id: 'LONDON_FIX',
        name: '🇬🇧 London PM Gold Fix (15:00 UTC / 20:30 IST)',
        targetMinute: 15 * 60, // 15:00 UTC = 20:30 IST
        description: 'Global benchmark pricing window by bullion banks. Large institutional order balancing occurs now.',
        keyFocus: 'Sharp mean-reversion spikes and sudden liquidity withdrawals.',
      },
    ];

    for (const session of SESSIONS) {
      if (Math.abs(totalUtcMins - session.targetMinute) <= 2) {
        for (const user of activeUsers) {
          const watcherSettings = user.liveWatcherSettings;
          if (watcherSettings?.telegramAlertEvents?.sessionTransition === false) {
            continue;
          }
          const key = `session:${user._id}:${session.id}:${dateStr}`;
          if (!this.sentAlertKeys.has(key)) {
            this.sentAlertKeys.set(key, now.getTime());
            try {
              await TelegramAlertService.sendGoldSessionAlert(user, session.name, session.description, session.keyFocus);
              alertsSent++;
            } catch (err: any) {
              console.error(`[GoldNewsAlertWorker] Failed to dispatch session alert (${session.id}) to user ${user._id}:`, err?.message || err);
            }
          }
        }
      }
    }

    return alertsSent;
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

