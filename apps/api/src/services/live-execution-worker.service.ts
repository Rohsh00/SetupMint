import mongoose from 'mongoose';
import { User, Trade, BrokerIntegration } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { LiveWatcherService } from './live-watcher.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import { BrokerAutoSyncWorker } from './broker-auto-sync.service.js';
import { AccountScopeService } from './account-scope.service.js';
import { Mt5CommandService } from './mt5-command.service.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
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

      // Derive Indian Standard Time (Asia/Kolkata) calendar markers
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const istYear = nowIST.getFullYear();
      const istMonth = nowIST.getMonth();
      const istDate = nowIST.getDate();
      const istDateKey = `${istYear}-${String(istMonth + 1).padStart(2, '0')}-${String(istDate).padStart(2, '0')}`;
      const hours = nowIST.getHours();
      const minutes = nowIST.getMinutes();
      const dayOfWeek = nowIST.getDay();

      // Check token expiration warning (30-minute window before expiry)
      const isTokenExpiryAlertActive = watcherSettings?.telegramAlertEvents?.tokenExpiryWarning !== false;
      if (
        broker.tokenExpiresAt &&
        isTokenExpiryAlertActive &&
        watcherSettings?.telegramAlertsEnabled &&
        watcherSettings?.telegramBotToken &&
        watcherSettings?.telegramChatId
      ) {
        const expiresAtMs = new Date(broker.tokenExpiresAt).getTime();
        const diffMins = Math.round((expiresAtMs - Date.now()) / (60 * 1000));
        if (diffMins > 0 && diffMins <= 30) {
          const cooldownMs = 25 * 60 * 1000; // 25-minute cooldown ensures max 1 alert per 30m expiration window
          const tokenWarnKey = `token_expiry_warn30:${user._id}:${Math.floor(expiresAtMs / (30 * 60 * 1000))}`;
          if (!this.executedMilestones.has(tokenWarnKey)) {
            this.executedMilestones.add(tokenWarnKey);

            const updateResult = await User.updateOne(
              {
                _id: user._id,
                $or: [
                  { 'liveWatcherSettings.lastTokenExpiryAlertAt': { $exists: false } },
                  { 'liveWatcherSettings.lastTokenExpiryAlertAt': { $lt: Date.now() - cooldownMs } },
                ],
              },
              { $set: { 'liveWatcherSettings.lastTokenExpiryAlertAt': Date.now() } }
            );

            if (updateResult.modifiedCount > 0) {
              TelegramAlertService.sendAlert({
                botToken: watcherSettings.telegramBotToken,
                chatId: watcherSettings.telegramChatId,
                title: 'FYERS Broker Session Expiring Soon',
                body: `Your daily FYERS API session token expires in ${diffMins} minutes. Please re-authenticate on SetupMint to prevent automation interruption.`,
                severity: 'WARNING',
              }).catch(() => {});
            }
          }
        }
      }

      const liveAccountIds = await AccountScopeService.resolveAccountScope(user._id, {
        mode: 'TYPE',
        accountType: 'LIVE',
      });

      // Check Daily Loss threshold (Calculated strictly against Indian Standard Time calendar day for personal LIVE accounts)
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
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const startOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0) - istOffsetMs);

        const todayClosed = await Trade.find({
          userId: user._id,
          accountId: { $in: liveAccountIds },
          status: 'CLOSED',
          exitTime: { $gte: startOfIstDay },
        }).lean();
        const realizedDayLoss = todayClosed.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);

        let floatingDayLoss = 0;
        try {
          const liveSummary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString(), liveAccountIds);
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
      const isMorningCheckActive = watcherSettings?.telegramAlertEvents?.tokenExpiryWarning !== false;
      if (
        dayOfWeek >= 1 &&
        dayOfWeek <= 5 &&
        hours === 8 &&
        minutes >= 45 &&
        minutes <= 50 &&
        isMorningCheckActive &&
        watcherSettings?.telegramAlertsEnabled &&
        watcherSettings?.telegramBotToken &&
        watcherSettings?.telegramChatId
      ) {
        const morningKey = `morning_token_check:${user._id}:${istDateKey}`;
        if (!this.executedMilestones.has(morningKey)) {
          this.executedMilestones.add(morningKey);

          const isExpired = !broker.tokenExpiresAt || new Date(broker.tokenExpiresAt).getTime() <= Date.now();
          if (isExpired) {
            // Persistent database guard: atomically claim notification slot for this IST date across all cluster nodes
            const updateResult = await User.updateOne(
              { _id: user._id, 'liveWatcherSettings.lastMorningTokenAlertDate': { $ne: istDateKey } },
              { $set: { 'liveWatcherSettings.lastMorningTokenAlertDate': istDateKey } }
            );

            if (updateResult.modifiedCount > 0) {
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
      }

      // Post-market 15:35 PM EOD Performance Digest (Mon-Fri)
      if (
        dayOfWeek >= 1 &&
        dayOfWeek <= 5 &&
        hours === 15 &&
        minutes >= 35 &&
        minutes <= 40 &&
        watcherSettings?.telegramAlertsEnabled &&
        watcherSettings?.telegramBotToken &&
        watcherSettings?.telegramChatId &&
        watcherSettings?.telegramAlertEvents?.eodSummaryDigest !== false
      ) {
        const eodKey = `eod_digest:${user._id}:${istDateKey}`;
        if (!this.executedMilestones.has(eodKey)) {
          this.executedMilestones.add(eodKey);

          // Persistent database guard: atomically claim notification slot for this IST date
          const updateResult = await User.updateOne(
            { _id: user._id, 'liveWatcherSettings.lastEodDigestDate': { $ne: istDateKey } },
            { $set: { 'liveWatcherSettings.lastEodDigestDate': istDateKey } }
          );

          if (updateResult.modifiedCount > 0) {
            TelegramAlertService.sendEodDigest(user).catch(() => {});
          }
        }
      }

      // Find open trades on all active accounts (personal LIVE + prop firms like Elefin) for evaluation
      const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
      const openTrades = await Trade.find({
        userId: user._id,
        accountId: { $in: allActiveAccountIds },
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

    const isMt5 = Mt5CommandService.isMt5Trade(trade, trade.accountId);
    // Safety Guard: Under no circumstances should simulated demo ticks trigger broker exits, broker SL updates, or Telegram risk alerts!
    if (metric.provider === 'SIMULATED' && !isMt5) return;

    const watcherSettings = user.liveWatcherSettings;
    const rules = (trade.customLadderRules as any) || createLadderRulesFromSettings(watcherSettings, tradeId, metric.lotSize);
    const effectiveAutoExecute = autoExecuteArmed || Boolean(rules.autoExecuteEnabled);

    // 1. Naked Position Check: Check if a resting SL order exists on FYERS orderbook
    if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
      if (metric.isNakedPosition) {
        TelegramAlertService.dispatchRiskAlert(user, trade, {
          type: 'NAKED_POSITION',
          severity: 2,
          metricValue: 0,
          ltp: metric.currentLtp,
        }).catch(() => {});
      }
    }

    // 2. Stop Loss Threat Telegram Alert via Pure State Machine
    if (metric.stopThreatLevel) {
      // Use bufferRatio (fraction of initial stop loss buffer remaining, 0.0 to 1.0+)
      // 1.0 = at entry (100% buffer remaining)
      // 0.25 = CRITICAL (75% of stop loss eaten, only 25% buffer remaining)
      // 0.00 = BREACHED
      const bufferRatio = typeof metric.bufferRatio === 'number'
        ? metric.bufferRatio
        : (metric.stopThreatLevel === 'BREACHED'
          ? 0
          : metric.stopThreatLevel === 'CRITICAL'
          ? 0.20
          : metric.stopThreatLevel === 'ATTENTION'
          ? 0.45
          : 1.0);

      const severity = metric.stopThreatLevel === 'BREACHED'
        ? 3
        : metric.stopThreatLevel === 'CRITICAL'
        ? 2
        : metric.stopThreatLevel === 'ATTENTION'
        ? 1
        : 0;

      TelegramAlertService.dispatchRiskAlert(user, trade, {
        type: 'STOP_THREAT',
        severity,
        metricValue: bufferRatio,
        ltp: metric.currentLtp,
      }).catch(() => {});

      // If stop loss is critically threatened or breached, trigger an immediate broker sync to catch broker order fills instantly
      if (metric.stopThreatLevel === 'BREACHED' || metric.stopThreatLevel === 'CRITICAL') {
        BrokerAutoSyncWorker.triggerImmediateSync(user._id.toString()).catch(() => {});
      }
    }

    // 3. Giveback Anti-Greed Radar Evaluation via Pure State Machine
    if (metric.giveback) {
      const gbSeverity = metric.giveback.threatLevel === 'CRITICAL_REVERSAL'
        ? 2
        : metric.giveback.threatLevel === 'LEAKING'
        ? 1
        : 0;

      TelegramAlertService.dispatchRiskAlert(user, trade, {
        type: 'GIVEBACK',
        severity: gbSeverity,
        metricValue: metric.giveback.givebackPercent,
        ltp: metric.currentLtp,
      }).catch(() => {});

      // If auto-exit is enabled on giveback leak
      if (effectiveAutoExecute && rules.givebackAutoExit?.enabled && metric.giveback.givebackPercent >= rules.givebackAutoExit.maxGivebackPercent) {
        const givebackKey = `giveback_auto:${tradeId}`;
        if (!this.executedMilestones.has(givebackKey)) {
          this.executedMilestones.add(givebackKey);
          console.log(`[LiveExecutionWorker] Auto-exiting runner for ${metric.symbol} due to ${metric.giveback.givebackPercent}% profit giveback`);
          const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;
          if (isMt5 && ticket) {
            await Mt5CommandService.queueClosePosition({
              userId: user._id.toString(),
              accountId: trade.accountId?.toString(),
              tradeId: tradeId,
              ticket,
              volume: metric.quantity,
            });
          } else {
            await FyersService.executeBrokerExit(user._id, tradeId, {
              exitQty: metric.quantity,
              isFullClose: true,
            });
          }
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
      initialStopLoss: metric.initialStopLoss,
      initialRiskAmount: metric.initialRiskAmount,
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

      if (!effectiveAutoExecute) {
        // Just dispatch Telegram alert if enabled
        this.executedMilestones.add(triggerKey);
        if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
          const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
          TelegramAlertService.sendAlert({
            botToken: watcherSettings.telegramBotToken,
            chatId: watcherSettings.telegramChatId,
            title: `🎯 Target ${step.targetIndex} (${step.name}) Reached: ${metric.symbol}`,
            body: `${step.name} reached at ${sym}${metric.currentLtp}. Auto-execute is OFF. Action required: ${step.suggestedStopLabel}.`,
            severity: 'SUCCESS',
            metrics: {
              LTP: `${sym}${metric.currentLtp}`,
              Target: `${sym}${step.targetPrice}`,
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

      const isMt5 = Mt5CommandService.isMt5Trade(trade, trade.accountId);
      const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;

      // 1. Partial or Full Exit via universal execution pipeline
      if (step.plannedExitQty > 0) {
        await ExecutionPipelineService.execute({
          userId: user._id.toString(),
          accountId: trade.accountId,
          tradeId: tradeId,
          action: 'EXIT_POSITION',
          executeBroker: true,
          isAutomated: true,
          payload: {
            quantity: step.plannedExitQty,
            exitReason: `Auto-Executed ${step.name}`,
          },
        });
      }

      // 2. Trailing SL modification via universal execution pipeline
      if (step.suggestedStopLoss && step.suggestedStopLoss > 0) {
        await ExecutionPipelineService.execute({
          userId: user._id.toString(),
          accountId: trade.accountId,
          tradeId: tradeId,
          action: 'MODIFY_STOP_LOSS',
          executeBroker: true,
          isAutomated: true,
          payload: {
            stopPrice: step.suggestedStopLoss,
          },
        });
      }

      // 3. Telegram success alert
      if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
        const currSym = TelegramAlertService.getTradeCurrencySymbol(trade);
        const brokerLabel = isMt5 ? 'MT5 (Elefin)' : 'Broker';
        TelegramAlertService.sendAlert({
          botToken: watcherSettings.telegramBotToken,
          chatId: watcherSettings.telegramChatId,
          title: `⚡ Auto-Executed ${step.name}: ${metric.symbol}`,
          body: `SetupMint auto-executed ${step.plannedExitQty} units exit and trailed SL to ${currSym}${step.suggestedStopLoss} on ${brokerLabel}.`,
          severity: 'SUCCESS',
        }).catch(() => {});
      }
    }

    // 5. Gold Trade Stagnation / Time-Stop Reminder
    const isGold = (metric.symbol || '').includes('XAU') || metric.symbol === 'GOLD';
    const entryTimeMs = trade.entryTime ? new Date(trade.entryTime).getTime() : 0;
    if (entryTimeMs > 0 && isGold && trade.status === 'OPEN') {
      const ageMins = Math.round((Date.now() - entryTimeMs) / 60000);
      const pipDist = Math.abs(metric.currentLtp - metric.entryPrice) / 0.10;
      if (ageMins >= 45 && pipDist <= 8.0) {
        const stagKey = `stagnation:${tradeId}`;
        if (!this.executedMilestones.has(stagKey)) {
          this.executedMilestones.add(stagKey);
          TelegramAlertService.sendStagnationReminder(user, trade, metric, ageMins, pipDist).catch(() => {});
        }
      }
    }
  }
}

