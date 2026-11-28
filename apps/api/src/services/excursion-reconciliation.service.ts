import mongoose from 'mongoose';
import { Trade } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';

/**
 * ExcursionReconciliationWorker
 *
 * Automatically monitors closed trades and finalizes their Post-Trade Excursion (MFE / MAE)
 * once the post-exit lookahead window (15–60 minutes) has fully matured in market candlestick feeds.
 *
 * Solves the critical issue where trades closed at T+0 seconds capture 0 post-exit candles because
 * future candles do not yet exist in broker feeds at the exact second of exit.
 */
export class ExcursionReconciliationWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Starts the background daemon (checks once every 60 seconds)
   */
  static start(intervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[ExcursionReconciliationWorker] Post-trade excursion reconciliation daemon started.');

    // Run first check after a brief 10s warmup
    setTimeout(() => {
      this.runCycle().catch((err) => {
        console.error('[ExcursionReconciliationWorker] Error in initial cycle:', err?.message || err);
      });
    }, 10000);

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err: any) {
        console.error('[ExcursionReconciliationWorker] Error in cycle:', err?.message || err);
      }
    }, intervalMs);
  }

  /**
   * Stops the background daemon
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[ExcursionReconciliationWorker] Post-trade excursion reconciliation daemon stopped.');
  }

  /**
   * Main evaluation cycle: finds mature closed trades with pending or zero post-exit candles
   */
  static async runCycle(batchLimit = 5): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const now = Date.now();
      // Only process trades closed at least 15 minutes ago
      const minAgeThreshold = new Date(now - 15 * 60 * 1000);
      // Bound lookback to the last 45 days
      const maxAgeThreshold = new Date(now - 45 * 24 * 60 * 60 * 1000);

      const candidateTrades = await Trade.find({
        status: 'CLOSED',
        exitTime: { $lte: minAgeThreshold, $gte: maxAgeThreshold },
        $or: [
          { 'calculated.excursion.isPostExitPending': true },
          {
            'calculated.excursion.status': { $in: ['COMPUTED', 'COMPLETED'] },
            $or: [
              { 'calculated.excursion.postExitCandleCount': { $exists: false } },
              { 'calculated.excursion.postExitCandleCount': 0 },
            ],
          },
        ],
      })
        .select('_id userId symbol exitTime calculated.excursion')
        .sort({ exitTime: -1 })
        .limit(batchLimit)
        .lean();

      if (!candidateTrades || candidateTrades.length === 0) {
        return 0;
      }

      let updatedCount = 0;
      for (const t of candidateTrades) {
        try {
          const res = await FyersService.computeExcursionForTrade(t._id, t.userId, true);
          if (res && (res.status === 'COMPLETED' || res.status === 'COMPUTED')) {
            updatedCount++;
            console.log(
              `[ExcursionReconciliationWorker] Finalized post-exit excursion for trade ${t._id} (${t.symbol}) -> ${res.postExitCandleCount ?? 0} post-exit candles, +${res.postExitMfePoints ?? 0} pts MFE`
            );
          }
        } catch (err: any) {
          console.warn(`[ExcursionReconciliationWorker] Skipped trade ${t._id} (${t.symbol}):`, err?.message || err);
        }
      }

      return updatedCount;
    } finally {
      this.isProcessing = false;
    }
  }
}
