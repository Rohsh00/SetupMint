import { User } from '../db/models/index.js';
import { decryptSecret } from './crypto.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';

interface ActivePoller {
  abortController: AbortController;
  botToken: string;
}

export class TelegramPollingService {
  private static activePollers: Map<string, ActivePoller> = new Map();
  private static isRunning = false;

  /**
   * Starts polling for all users who have Telegram Bot Token configured and enabled.
   */
  static async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const users = await User.find({
        'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
      }).lean();

      for (const u of users) {
        const rawToken = u.liveWatcherSettings?.telegramBotToken;
        if (!rawToken) continue;
        const botToken = decryptSecret(rawToken) || rawToken;
        if (botToken && !botToken.startsWith('••') && !botToken.startsWith('**')) {
          this.startPollingForBot(botToken);
        }
      }
    } catch (err: any) {
      console.warn('[TelegramPolling] Failed to initialize pollers from database:', err.message);
    }
  }

  /**
   * Stops all active polling loops.
   */
  static stop(): void {
    this.isRunning = false;
    for (const [token, poller] of this.activePollers.entries()) {
      try {
        poller.abortController.abort();
      } catch {
        // Ignore abort error
      }
    }
    this.activePollers.clear();
  }

  /**
   * Registers a bot token and runs an active long polling loop to process button clicks and commands.
   */
  static startPollingForBot(botToken: string): void {
    if (!botToken || botToken.startsWith('••') || botToken.startsWith('**')) return;
    if (this.activePollers.has(botToken)) return;

    const abortController = new AbortController();
    this.activePollers.set(botToken, { abortController, botToken });

    // Run polling loop asynchronously in background
    (async () => {
      // 1. Delete any webhook previously registered so Telegram allows getUpdates long polling
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`, {
          method: 'POST',
          signal: abortController.signal,
        });
      } catch {
        // Ignore error
      }

      let offset = 0;
      let consecutiveErrors = 0;

      while (!abortController.signal.aborted) {
        try {
          const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=20&allowed_updates=${encodeURIComponent(
            JSON.stringify(['message', 'callback_query'])
          )}`;

          const res = await fetch(url, { signal: abortController.signal });

          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as any;
            if (res.status === 401 || res.status === 404) {
              console.warn('[TelegramPolling] Invalid bot token; terminating polling for bot.');
              break;
            }
            if (res.status === 409) {
              // 409 Conflict: Webhook is still active or another getUpdates instance is running
              await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`, {
                method: 'POST',
              }).catch(() => {});
              await new Promise((r) => setTimeout(r, 4000));
              continue;
            }
            consecutiveErrors++;
            const backoff = Math.min(30000, 2000 * Math.pow(1.5, consecutiveErrors));
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }

          consecutiveErrors = 0;
          const json = (await res.json()) as any;

          if (json.ok && Array.isArray(json.result)) {
            for (const update of json.result) {
              offset = update.update_id + 1;
              try {
                await TelegramAlertService.processWebhookUpdate(update, botToken);
              } catch (updateErr: any) {
                console.error('[TelegramPolling] Error processing Telegram update:', updateErr.message);
              }
            }
          }
        } catch (err: any) {
          if (abortController.signal.aborted) break;
          consecutiveErrors++;
          const backoff = Math.min(30000, 2000 * Math.pow(1.5, consecutiveErrors));
          await new Promise((r) => setTimeout(r, backoff));
        }
      }

      this.activePollers.delete(botToken);
    })().catch(() => {});
  }

  /**
   * Stops polling for a specific bot token.
   */
  static stopPollingForBot(botToken: string): void {
    const poller = this.activePollers.get(botToken);
    if (poller) {
      try {
        poller.abortController.abort();
      } catch {}
      this.activePollers.delete(botToken);
    }
  }

  /**
   * Returns whether polling is currently active for a bot token.
   */
  static isPolling(botToken: string): boolean {
    return this.activePollers.has(botToken);
  }
}

