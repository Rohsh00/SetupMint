import { User } from '../db/models/User.js';
import { TelegramAlertService } from './telegram-alert.service.js';

/**
 * Background worker that continuously updates the pinned Telegram Live Cockpit header
 * with real-time cut-to-cut market prices (Gold & ETH) and floating PnL every 3 seconds.
 */
export class TelegramCockpitTickerWorker {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static isTickRunning = false;

  /**
   * Starts the background ticker loop.
   */
  static start(intervalMs: number = 3000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[TelegramCockpitTickerWorker] Started pinned live cut-to-cut ticker (${intervalMs}ms interval).`);

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.warn(`[TelegramCockpitTickerWorker] Tick error:`, err?.message || err);
      });
    }, intervalMs);
  }

  /**
   * Stops the background ticker loop.
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log(`[TelegramCockpitTickerWorker] Stopped.`);
  }

  /**
   * Executes a single tick across all users with active pinned cockpit headers.
   */
  static async tick(): Promise<void> {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const users = await User.find({
        'liveWatcherSettings.telegramPinnedCockpitMessageId': { $exists: true, $ne: null },
        'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
        email: { $not: /@(tradevault\.local|test\.local|setupmint\.internal)$/ },
      }).lean();

      if (users.length === 0) {
        return;
      }

      await Promise.allSettled(
        users.map(async (user) => {
          try {
            await TelegramAlertService.updatePinnedCockpitMessage(user);
          } catch (err: any) {
            console.warn(`[TelegramCockpitTickerWorker] User ${user.email} update failed:`, err?.message || err);
          }
        })
      );
    } finally {
      this.isTickRunning = false;
    }
  }
}

