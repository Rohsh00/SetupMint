import mongoose from 'mongoose';
import { BrokerIntegration, Trade } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';

/**
 * Checks whether Indian financial markets (NSE, BSE, MCX) are currently within trading hours.
 * Market Hours (IST - Asia/Kolkata):
 * - Monday to Friday: 09:00 AM to 23:55 PM IST (covering Equity, F&O 09:15-15:30, and MCX Commodity up to 23:55)
 */
export function isIndianMarketOpenNow(): boolean {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = nowIST.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const hours = nowIST.getHours();
  const minutes = nowIST.getMinutes();
  const timeNum = hours * 100 + minutes;

  return timeNum >= 900 && timeNum <= 2355;
}

/**
 * Automated Background Broker Synchronizer.
 * Automatically pulls trade executions and orderbook updates from FYERS in the background,
 * eliminating the need for traders to manually click "Sync Now" when:
 * 1. A new trade is entered on FYERS (mobile app, web, or algorithmic API).
 * 2. An open trade's Stop Loss (SL) or Target (TP) is hit and executed on the broker.
 */
export class BrokerAutoSyncWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static syncingUserIds = new Set<string>();
  private static lastTriggeredTimes = new Map<string, number>();

  /**
   * Starts the periodic background sync daemon.
   * Default interval: 15,000 ms (15 seconds).
   */
  static start(intervalMs = 15000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[BrokerAutoSyncWorker] Background auto-sync started (interval: ${intervalMs / 1000}s).`);

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err: any) {
        console.error('[BrokerAutoSyncWorker] Error in auto-sync cycle:', err?.message || err);
      }
    }, intervalMs);
  }

  /**
   * Stops the background sync daemon.
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.syncingUserIds.clear();
    console.log('[BrokerAutoSyncWorker] Background auto-sync stopped.');
  }

  /**
   * Evaluates all connected FYERS brokers and synchronizes new trades / SL fills.
   */
  static async runCycle(): Promise<void> {
    const isMarketOpen = isIndianMarketOpenNow();

    // Find all users with connected FYERS broker integration where auto-sync is enabled
    const integrations = await BrokerIntegration.find({
      broker: 'FYERS',
      status: { $in: ['CONNECTED', 'SYNCING'] },
      autoSyncEnabled: { $ne: false },
    }).lean();

    if (!integrations || integrations.length === 0) return;

    for (const integration of integrations) {
      const userId = integration.userId.toString();

      // Check session validity: skip expired sessions
      if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt).getTime() <= Date.now()) {
        continue;
      }

      // If market is closed, only sync if the user has open trades in MongoDB waiting for reconciliation
      if (!isMarketOpen) {
        const hasOpenTrades = await Trade.exists({ userId: integration.userId, status: 'OPEN' });
        if (!hasOpenTrades) {
          continue;
        }
      }

      // Concurrency guard: avoid overlapping syncs for the same user
      if (this.syncingUserIds.has(userId)) {
        continue;
      }

      // Execute sync asynchronously for this user
      this.syncUser(userId, 'PERIODIC').catch(() => {});
    }
  }

  /**
   * Immediately triggers an instant sync for a specific user.
   * Called by LiveExecutionWorker when an open trade breaches or threatens its Stop Loss.
   */
  static async triggerImmediateSync(userId: string): Promise<void> {
    if (!userId) return;

    // Throttle immediate triggers to max once per 4 seconds per user
    const now = Date.now();
    const lastTrigger = this.lastTriggeredTimes.get(userId) || 0;
    if (now - lastTrigger < 4000) return;
    this.lastTriggeredTimes.set(userId, now);

    if (this.syncingUserIds.has(userId)) return;

    await this.syncUser(userId, 'EVENT_TRIGGERED');
  }

  /**
   * Internal worker function to execute sync for a single user with safety locks.
   */
  private static async syncUser(userId: string, trigger: 'PERIODIC' | 'EVENT_TRIGGERED'): Promise<void> {
    this.syncingUserIds.add(userId);

    try {
      const result = await FyersService.syncTradesForUser(userId);
      if (result.syncedTradesCount > 0) {
        console.log(
          `[BrokerAutoSyncWorker] [${trigger}] Synced ${result.syncedTradesCount} trades (${result.totalExecutions} fills) for user ${userId}.`
        );
      }
    } catch (err: any) {
      // Benign errors (e.g. rate limit wait, network blip, session expired) are logged without throwing
      console.warn(`[BrokerAutoSyncWorker] Sync skipped for user ${userId}: ${err?.message || err}`);
    } finally {
      this.syncingUserIds.delete(userId);
    }
  }
}

