import mongoose from 'mongoose';
import { User, Trade, BrokerIntegration } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { LiveWatcherService } from './live-watcher.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import {
  calculateTargetLadder,
  evaluateGivebackAutoExit,
} from '@tradevault/financial-engine';
import { createLadderRulesFromSettings } from '@tradevault/shared';

/**
 * Server-Side Live Execution Runner & Automation Daemon.
 * Operates independently of any open browser tabs or sleeping laptops.
 * Continuously evaluates scaling ladders, dynamic SL trails, giveback radar,
 * and naked position safety checks, executing directly against broker APIs.
 */
export class LiveExecutionWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static executedMilestones = new Set<string>();

  /**
   * Starts the background execution loop. Runs every intervalMs.
   */
  static start(intervalMs = 3000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[LiveExecutionWorker] Background server-side execution runner started.');

    this.timer = setInterval(async () => {
      try {
        await this.runCycle();
      } catch (err: any) {
        console.error('[LiveExecutionWorker] Error in execution cycle:', err.message);
      }
    }, intervalMs);
  }

  /**
   * Stops the background execution loop.
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[LiveExecutionWorker] Server execution runner stopped.');
  }

  /**
   * Executes a single evaluation cycle across all active users with open trades.
   */
  static async runCycle(): Promise<void> {
    // 1. Find all users who have an active FYERS connection and server-side automation enabled
    const connectedBrokers = await BrokerIntegration.find({
      broker: 'FYERS',
      status: 'CONNECTED',
    }).lean();

    if (!connectedBrokers || connectedBrokers.length === 0) return;

    for (const broker of connectedBrokers) {
      const user = await User.findById(broker.userId).lean();
      if (!user) continue;

      const watcherSettings = user.liveWatcherSettings;
      const isServerWorkerEnabled = watcherSettings?.serverSideExecutionEnabled !== false;
      const isAutoExecuteArmed = Boolean(watcherSettings?.defaultAutoExecute);

      // Check token expiration warning
      if (broker.tokenExpiresAt) {
        const expiresAtMs = new Date(broker.tokenExpiresAt).getTime();
        const diffMins = Math.round((expiresAtMs - Date.now()) / (60 * 1000));
        if (diffMins > 0 && diffMins <= 30 && watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
          TelegramAlertService.sendAlert({
            botToken: watcherSettings.telegramBotToken,
            chatId: watcherSettings.telegramChatId,
            title: 'FYERS Broker Session Expiring Soon',
            body: `Your daily FYERS API session token expires in ${diffMins} minutes. Please re-authenticate on SetupMint to prevent automation interruption.`,
            severity: 'WARNING',
          }).catch(() => {});
        }
      }

      // Check Daily Loss threshold (Calculated strictly against Indian Standard Time calendar day)
      const maxDailyLoss = user.riskSettings?.maxDailyLoss;
      const isDailyLossAlertActive = watcherSettings?.telegramAlertEvents?.dailyLossBreached !== false;

      if (
        maxDailyLoss &&
        maxDailyLoss > 0 &&
        isDailyLossAlertActive &&
        watcherSettings?.telegramAlertsEnabled &&
        watcherSettings?.telegramBotToken &&
        watcherSettings?.telegramChatId
      ) {
        // Calculate start of current day in IST (Asia/Kolkata)
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const istYear = nowIST.getFullYear();
        const istMonth = nowIST.getMonth();
        const istDate = nowIST.getDate();
        const istDateKey = `${istYear}-${String(istMonth + 1).padStart(2, '0')}-${String(istDate).padStart(2, '0')}`;
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const startOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0) - istOffsetMs);

        const todayClosed = await Trade.find({
          userId: user._id,
          status: 'CLOSED',
          exitTime: { $gte: startOfIstDay },
        }).lean();
        const realizedDayLoss = todayClosed.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);

        let floatingDayLoss = 0;
        try {
          const liveSummary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString());
          floatingDayLoss = liveSummary.totalFloatingNetPnL;
        } catch {}

        const netLoss = -(realizedDayLoss + floatingDayLoss);
        if (netLoss > 0) {
          const lossPercent = (netLoss / maxDailyLoss) * 100;
          if (lossPercent >= 100) {
            const breachKey = `daily_breach:${user._id}:${istDateKey}`;
            if (!this.executedMilestones.has(breachKey)) {
              this.executedMilestones.add(breachKey);

              // Persistent database guard: atomically claim notification slot for this IST date
              const updateResult = await User.updateOne(
                { _id: user._id, 'liveWatcherSettings.lastDailyLossAlertDate': { $ne: istDateKey } },
                { $set: { 'liveWatcherSettings.lastDailyLossAlertDate': istDateKey } }
              );

              if (updateResult.modifiedCount > 0) {
                TelegramAlertService.notifyDailyLoss(user, netLoss, maxDailyLoss, lossPercent).catch(() => {});
              }
            }
          } else if (lossPercent >= 75) {
            const warnKey = `daily_warn75:${user._id}:${istDateKey}`;
            if (!this.executedMilestones.has(warnKey)) {
              this.executedMilestones.add(warnKey);

              const updateResult = await User.updateOne(
                { _id: user._id, 'liveWatcherSettings.lastDailyLossWarnDate': { $ne: istDateKey } },
                { $set: { 'liveWatcherSettings.lastDailyLossWarnDate': istDateKey } }
              );

              if (updateResult.modifiedCount > 0) {
                TelegramAlertService.notifyDailyLoss(user, netLoss, maxDailyLoss, lossPercent).catch(() => {});
              }
            }
          }
        }
      }

      // Pre-market 08:45 AM FYERS Session Check (Mon-Fri)
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hours = nowIST.getHours();
      const minutes = nowIST.getMinutes();
      const dayOfWeek = nowIST.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 8 && minutes >= 45 && minutes <= 50) {
        const morningKey = `morning_token_check:${user._id}:${nowIST.toDateString()}`;
        if (!this.executedMilestones.has(morningKey) && watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
          this.executedMilestones.add(morningKey);
          const isExpired = !broker.tokenExpiresAt || new Date(broker.tokenExpiresAt).getTime() <= Date.now();
          if (isExpired) {
            TelegramAlertService.sendAlert({
              botToken: watcherSettings.telegramBotToken,
              chatId: watcherSettings.telegramChatId,
              title: '⏰ Pre-Market FYERS Session Expired',
              body: 'Your FYERS 24h broker access token has expired. Re-authenticate on SetupMint before market opens at 09:15 AM to enable live tracking and automated trailing.',
              severity: 'WARNING',
            }).catch(() => {});
          }
        }
      }

      // Find open trades for this user
      const openTrades = await Trade.find({
        userId: user._id,
        status: 'OPEN',
      }).lean();

      if (!openTrades || openTrades.length === 0) continue;

      for (const trade of openTrades) {
        try {
          await this.evaluateTrade(user, trade, isAutoExecuteArmed && isServerWorkerEnabled);
        } catch (tradeErr: any) {
          console.warn(`[LiveExecutionWorker] Error evaluating trade ${trade._id}:`, tradeErr.message);
        }
      }
    }
  }

  /**
   * Evaluates a single open trade against its rules.
   */
  private static async evaluateTrade(
    user: any,
    trade: any,
    autoExecuteArmed: boolean
  ): Promise<void> {
    const tradeId = trade._id.toString();
    const metric = await LiveWatcherService.getSingleTradeLiveMetric(user._id.toString(), tradeId);
    if (!metric) return;

    // Safety Guard: Under no circumstances should simulated demo ticks trigger broker exits, broker SL updates, or Telegram risk alerts!
    if (metric.provider === 'SIMULATED') return;

    const watcherSettings = user.liveWatcherSettings;
    const rules = createLadderRulesFromSettings(watcherSettings, tradeId, metric.lotSize);

    // 1. Naked Position Check: Check if a resting SL order exists on FYERS orderbook
    if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
      if (metric.isNakedPosition) {
        const nakedKey = `naked:${tradeId}`;
        if (!this.executedMilestones.has(nakedKey)) {
          this.executedMilestones.add(nakedKey);
          TelegramAlertService.sendAlert({
            botToken: watcherSettings.telegramBotToken,
            chatId: watcherSettings.telegramChatId,
            title: `⚠️ Naked Position Warning: ${metric.symbol}`,
            body: `Open ${metric.direction} position has NO resting Stop Loss order on the exchange orderbook. Place an SL immediately to avoid uncontrolled market risk.`,
            severity: 'CRITICAL',
            metrics: {
              Symbol: metric.symbol,
              Side: metric.direction,
              Quantity: metric.quantity,
              Entry: `₹${metric.entryPrice}`,
              LTP: `₹${metric.currentLtp}`,
            },
            buttons: [
              [
                { text: '🚨 Market Exit Position', callback_data: `exit:${tradeId}` },
                { text: '🛡️ Lock True BE', callback_data: `lock_be:${tradeId}` },
              ],
            ],
          }).catch(() => {});
        }
      }
    }

    // 2. Stop Loss Critical Threat Telegram Alert
    if (metric.stopThreatLevel === 'CRITICAL' || metric.stopThreatLevel === 'BREACHED') {
      const threatKey = `threat:${tradeId}:${metric.stopThreatLevel}`;
      if (!this.executedMilestones.has(threatKey) && watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
        this.executedMilestones.add(threatKey);
        const runwayPct = typeof metric.distanceToStopPercent === 'number'
          ? metric.distanceToStopPercent
          : 25;

        TelegramAlertService.sendAlert({
          botToken: watcherSettings.telegramBotToken,
          chatId: watcherSettings.telegramChatId,
          title: `🚨 Stop Threat ${metric.stopThreatLevel}: ${metric.symbol}`,
          body: `LTP ₹${metric.currentLtp} is within ${metric.distanceToStopPoints?.toFixed(2) || 0} pts of your Stop Loss (₹${metric.stopLoss}).`,
          severity: 'CRITICAL',
          metrics: {
            Symbol: metric.symbol,
            FloatingPnL: `₹${metric.floatingNetPnL.toFixed(2)}`,
            CurrentStop: `₹${metric.stopLoss}`,
            DistancePts: `${metric.distanceToStopPoints?.toFixed(2) || 0} pts`,
          },
          progressBar: {
            label: 'SL Runway Remaining',
            percent: runwayPct,
          },
          buttons: [
            [
              { text: '🚨 Emergency Market Exit', callback_data: `exit:${tradeId}` },
              { text: '🛡️ Lock True BE', callback_data: `lock_be:${tradeId}` },
            ],
          ],
        }).catch(() => {});
      }
    }

    // 3. Giveback Anti-Greed Radar Evaluation
    if (metric.giveback && (metric.giveback.threatLevel === 'LEAKING' || metric.giveback.threatLevel === 'CRITICAL_REVERSAL')) {
      const givebackKey = `giveback:${tradeId}`;
      if (!this.executedMilestones.has(givebackKey)) {
        this.executedMilestones.add(givebackKey);

        if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
          TelegramAlertService.sendAlert({
            botToken: watcherSettings.telegramBotToken,
            chatId: watcherSettings.telegramChatId,
            title: `⚠️ Profit Giveback Alert: ${metric.symbol}`,
            body: `Unrealized profit retreated ${metric.giveback.givebackPercent.toFixed(1)}% from peak MFE of ₹${metric.giveback.peakFloatingNetPnL.toFixed(2)}.`,
            severity: 'WARNING',
            metrics: {
              PeakMFE: `+${metric.giveback.peakUnrealizedR.toFixed(2)}R`,
              CurrentR: `${metric.unrealizedR?.toFixed(2) || 0}R`,
              Retreated: `₹${metric.giveback.givebackAmount.toFixed(2)}`,
            },
            progressBar: {
              label: 'Profit Giveback Surrendered',
              percent: metric.giveback.givebackPercent,
            },
            buttons: [
              [
                { text: '🏃 Close Runner Now', callback_data: `exit:${tradeId}` },
                { text: '🛡️ Trail Stop to BE', callback_data: `lock_be:${tradeId}` },
              ],
            ],
          }).catch(() => {});
        }

        // If auto-exit is enabled on giveback leak
        if (autoExecuteArmed && rules.givebackAutoExit?.enabled && metric.giveback.givebackPercent >= rules.givebackAutoExit.maxGivebackPercent) {
          console.log(`[LiveExecutionWorker] Auto-exiting runner for ${metric.symbol} due to ${metric.giveback.givebackPercent}% profit giveback`);
          await FyersService.executeBrokerExit(user._id, tradeId, {
            exitQty: metric.quantity,
            isFullClose: true,
          });
        }
      }
    }

    // 4. Target Ladder Step Auto-Execution
    const ladder = calculateTargetLadder({
      entryPrice: metric.entryPrice,
      currentLtp: metric.currentLtp,
      direction: metric.direction,
      quantity: metric.quantity,
      contractMultiplier: metric.contractMultiplier,
      stopLoss: metric.stopLoss,
      plannedTarget: metric.target,
      tickSize: metric.tickSize,
      lotSize: metric.lotSize,
      customRules: rules,
      estimatedCharges: metric.estimatedCharges,
    });

    if (!ladder || !ladder.steps) return;

    for (const step of ladder.steps) {
      if (!step.isActionable && step.status !== 'MET') continue;

      const triggerKey = `ladder:${tradeId}:step${step.targetIndex}`;
      if (this.executedMilestones.has(triggerKey)) continue;

      if (!autoExecuteArmed) {
        // Just dispatch Telegram alert if enabled
        this.executedMilestones.add(triggerKey);
        if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
          TelegramAlertService.sendAlert({
            botToken: watcherSettings.telegramBotToken,
            chatId: watcherSettings.telegramChatId,
            title: `🎯 Target ${step.targetIndex} Reached: ${metric.symbol}`,
            body: `${step.name} reached at ₹${metric.currentLtp}. Auto-execute is OFF. Action required: ${step.suggestedStopLabel}.`,
            severity: 'SUCCESS',
            metrics: {
              LTP: `₹${metric.currentLtp}`,
              Target: `₹${step.targetPrice}`,
              PlannedExit: `${(step.plannedExitRatio * 100).toFixed(0)}% (${step.plannedExitQty} units)`,
            },
            buttons: [
              [
                { text: `🎯 Book ${step.name} & Lock BE`, callback_data: `book_50:${tradeId}` },
                { text: '🚨 Exit 100%', callback_data: `exit:${tradeId}` },
              ],
            ],
          }).catch(() => {});
        }
        continue;
      }

      // Execute on exchange server-side
      this.executedMilestones.add(triggerKey);
      console.log(`[LiveExecutionWorker] Executing ${step.name} server-side for trade ${tradeId} (${metric.symbol})...`);

      // 1. Partial Exit
      if (step.plannedExitQty > 0) {
        await FyersService.executeBrokerExit(user._id, tradeId, {
          exitQty: step.plannedExitQty,
          isFullClose: step.plannedExitQty >= metric.quantity,
        });
      }

      // 2. Trailing SL modification
      if (step.suggestedStopLoss && step.suggestedStopLoss > 0) {
        await FyersService.executeBrokerStopLoss(user._id, tradeId, step.suggestedStopLoss);
      }

      // 3. Telegram success alert
      if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
        TelegramAlertService.sendAlert({
          botToken: watcherSettings.telegramBotToken,
          chatId: watcherSettings.telegramChatId,
          title: `⚡ Auto-Executed ${step.name}: ${metric.symbol}`,
          body: `SetupMint auto-executed ${step.plannedExitQty} units exit and trailed SL to ₹${step.suggestedStopLoss} on FYERS exchange.`,
          severity: 'SUCCESS',
        }).catch(() => {});
      }
    }
  }
}

