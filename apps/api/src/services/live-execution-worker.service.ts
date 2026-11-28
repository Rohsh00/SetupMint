import mongoose from 'mongoose';
import { User, Trade, BrokerIntegration, TradingAccount } from '../db/models/index.js';
import { FyersService } from './fyers.service.js';
import { LiveWatcherService } from './live-watcher.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import { BrokerAutoSyncWorker } from './broker-auto-sync.service.js';
import { AccountScopeService } from './account-scope.service.js';
import { Mt5CommandService } from './mt5-command.service.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { EconomicCalendarService } from './economic-calendar.service.js';
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
   * Resets the in-memory cache of executed milestones (simulates server restart).
   */
  static resetMilestones(): void {
    this.executedMilestones.clear();
  }

  /**
   * Executes a single evaluation cycle across all active users with open trades (or a specific target user).
   */
  static async runCycle(targetUserId?: string): Promise<void> {
    const userIdsSet = new Set<string>();
    let connectedBrokers: any[] = [];

    if (targetUserId) {
      userIdsSet.add(targetUserId);
    } else {
      // 1. Find all users across connected brokers (FYERS), active MT5 accounts, or active OPEN trades
      connectedBrokers = await BrokerIntegration.find({
        broker: 'FYERS',
        status: 'CONNECTED',
      }).lean();

      const mt5Accounts = await TradingAccount.find({
        broker: 'ELEFIN_MT5',
        status: 'ACTIVE',
      }).select('userId').lean();

      const openTradeUserIds = await Trade.distinct('userId', { status: 'OPEN' });

      for (const b of connectedBrokers) if (b.userId) userIdsSet.add(b.userId.toString());
      for (const a of mt5Accounts) if (a.userId) userIdsSet.add(a.userId.toString());
      for (const u of openTradeUserIds) if (u) userIdsSet.add(u.toString());
    }

    if (userIdsSet.size === 0) return;

    for (const userId of userIdsSet) {
      const user = await User.findById(userId).lean();
      if (!user) continue;

      // STRICT TEST ISOLATION: Production daemon must NEVER evaluate ephemeral test users
      if (process.env.NODE_ENV !== 'test' && user.email && (user.email.endsWith('@test.local') || user.email.endsWith('@setupmint.internal'))) {
        continue;
      }
      // STRICT TEST ISOLATION: Test suite must NEVER evaluate real production users
      if (process.env.NODE_ENV === 'test' && user.email && !user.email.endsWith('@test.local') && !user.email.endsWith('@setupmint.internal')) {
        continue;
      }

      const broker =
        connectedBrokers.find((b) => b.userId?.toString() === userId) ||
        (await BrokerIntegration.findOne({ userId: user._id, broker: 'FYERS', status: 'CONNECTED' }).lean());

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
        broker &&
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

        // Behavioral Anti-Tilt & Consecutive Loss Sentinel
        const sortedTodayClosed = [...todayClosed].sort(
          (a, b) => new Date(b.exitTime || b.createdAt).getTime() - new Date(a.exitTime || a.createdAt).getTime()
        );
        let consecutiveLosses = 0;
        let streakLossSum = 0;
        for (const t of sortedTodayClosed) {
          const p = Number(t.calculated?.netPnL ?? (t as any).netPnL ?? 0);
          if (p < 0) {
            consecutiveLosses++;
            streakLossSum += Math.abs(p);
          } else {
            break;
          }
        }

        if (consecutiveLosses >= 3) {
          const tiltKey = `tilt_streak:${user._id}:${istDateKey}:${consecutiveLosses}`;
          if (!this.executedMilestones.has(tiltKey)) {
            this.executedMilestones.add(tiltKey);

            const isLockoutOptIn = Boolean(watcherSettings?.hardDisciplineLockoutEnabled);
            const durationMins = watcherSettings?.hardDisciplineLockoutDurationMins || 60;
            const lastLossTime = sortedTodayClosed[0]?.exitTime || new Date();
            const elapsedMins = (Date.now() - new Date(lastLossTime).getTime()) / (1000 * 60);
            const remainingMins = Math.max(1, Math.ceil(durationMins - elapsedMins));

            TelegramAlertService.notifyAntiTiltLockout(
              user,
              consecutiveLosses,
              streakLossSum,
              isLockoutOptIn ? remainingMins : 0,
              isLockoutOptIn
            ).catch(() => {});
          }
        }
      }

      // Prop Firm Challenge Rule Guard: 80% daily loss threshold monitoring across active prop firm accounts
      const propAccounts = await TradingAccount.find({
        userId: user._id,
        status: 'ACTIVE',
        $or: [
          { accountType: 'PROP_FIRM' },
          { 'propFirmConfig.enabled': true },
          { 'propFirm.firmKey': { $exists: true, $ne: '' } },
        ],
      }).lean();

      for (const pAcc of propAccounts) {
        let propDailyLossLimit = 0;
        if (pAcc.propFirmConfig?.dailyLossLimitPercent && pAcc.propFirmConfig?.initialBalance) {
          propDailyLossLimit = (pAcc.propFirmConfig.initialBalance * pAcc.propFirmConfig.dailyLossLimitPercent) / 100;
        } else if (pAcc.riskRules?.maxDailyLoss) {
          propDailyLossLimit = pAcc.riskRules.maxDailyLoss;
        } else if (pAcc.propFirm?.ruleSetOverrides?.dailyLoss?.limitAmount) {
          propDailyLossLimit = pAcc.propFirm.ruleSetOverrides.dailyLoss.limitAmount;
        }

        if (propDailyLossLimit > 0) {
          const istOffsetMs = 5.5 * 60 * 60 * 1000;
          const startOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0) - istOffsetMs);

          const propTodayClosed = await Trade.find({
            userId: user._id,
            accountId: pAcc._id,
            status: 'CLOSED',
            exitTime: { $gte: startOfIstDay },
          }).lean();

          const realizedPropLoss = propTodayClosed.reduce((sum, t) => sum + (t.calculated?.netPnL || (t as any).netPnL || 0), 0);

          let floatingPropLoss = 0;
          try {
            const liveSummary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString(), [pAcc._id.toString()]);
            floatingPropLoss = liveSummary.totalFloatingNetPnL;
          } catch {}

          const netPropLoss = -(realizedPropLoss + floatingPropLoss);
          if (netPropLoss > 0) {
            const propLossPercent = (netPropLoss / propDailyLossLimit) * 100;
            const sym = pAcc.baseCurrency === 'INR' ? '₹' : '$';

            if (propLossPercent >= 80) {
              const propWarnKey = `prop_shield_warn80:${pAcc._id}:${istDateKey}`;
              if (!this.executedMilestones.has(propWarnKey)) {
                this.executedMilestones.add(propWarnKey);

                if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
                  TelegramAlertService.sendAlert({
                    botToken: watcherSettings.telegramBotToken,
                    chatId: watcherSettings.telegramChatId,
                    title: `🚨 PROP FIRM CHALLENGE SHIELD: 80% DAILY LOSS REACHED`,
                    body: `Account <b>${pAcc.name || 'Prop Account'}</b> has reached <b>${propLossPercent.toFixed(1)}%</b> of its max daily loss limit!\n\n` +
                          `• Cumulative Day Loss: <code>${sym}${netPropLoss.toFixed(2)}</code> / <code>${sym}${propDailyLossLimit.toFixed(2)}</code>\n` +
                          `• Remaining Safety Buffer: <code>${sym}${Math.max(0, propDailyLossLimit - netPropLoss).toFixed(2)}</code>\n\n` +
                          `⚠️ Continuing to trade risks failing your evaluation / funded account rule! Flatten open positions immediately or step away for the session.`,
                    severity: 'CRITICAL',
                    buttons: [
                      [
                        { text: '🛑 Panic Flatten All Positions', callback_data: 'confirm_panic' },
                        { text: '📊 Cockpit', callback_data: 'cmd_cockpit' },
                      ],
                    ],
                  }).catch(() => {});
                }
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
        broker &&
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
      if (effectiveAutoExecute && rules.givebackAutoExit?.enabled) {
        const gbEval = evaluateGivebackAutoExit({
          giveback: metric.giveback,
          rule: rules.givebackAutoExit,
        });

        if (gbEval.shouldExit) {
          const givebackKey = `giveback_auto:${tradeId}`;
          const existingSteps = new Set<string>(
            metric.executedLadderSteps || LiveWatcherService.deriveExecutedSteps(trade)
          );
          if (!this.executedMilestones.has(givebackKey) && !existingSteps.has(givebackKey)) {
            const claimedGb = await Trade.findOneAndUpdate(
              {
                _id: trade._id,
                status: 'OPEN',
                executedLadderSteps: { $ne: givebackKey },
              },
              {
                $addToSet: { executedLadderSteps: givebackKey },
              },
              { new: true }
            );

            if (claimedGb) {
              this.executedMilestones.add(givebackKey);
              console.log(`[LiveExecutionWorker] Auto-exiting runner for ${metric.symbol}: ${gbEval.reason}`);

              await ExecutionPipelineService.execute({
                userId: user._id.toString(),
                accountId: trade.accountId,
                tradeId: tradeId,
                action: 'EXIT_POSITION',
                executeBroker: true,
                isAutomated: true,
                payload: {
                  quantity: metric.quantity,
                  exitReason: `Auto Giveback Exit: ${gbEval.reason}`,
                },
              });

              if (watcherSettings?.telegramAlertsEnabled && watcherSettings?.telegramBotToken && watcherSettings?.telegramChatId) {
                const currSym = TelegramAlertService.getTradeCurrencySymbol(trade);
                TelegramAlertService.sendAlert({
                  botToken: watcherSettings.telegramBotToken,
                  chatId: watcherSettings.telegramChatId,
                  title: `🛡️ Giveback Auto-Exit: ${metric.symbol}`,
                  body: `SetupMint auto-closed runner at ${currSym}${metric.currentLtp} to protect banked profits. (${gbEval.reason})`,
                  severity: 'WARNING',
                }).catch(() => {});
              }
            } else {
              this.executedMilestones.add(givebackKey);
            }
          }
        }
      }
    }

    // 4. Target Ladder Steps & Real-Time RR Milestones (1:1, 1:2, 1:3, etc.)
    const executedStepsList = metric.executedLadderSteps || LiveWatcherService.deriveExecutedSteps(trade);
    const tradeExecutedSteps = new Set<string>(executedStepsList);

    const currentR = metric.unrealizedR !== null && metric.unrealizedR !== undefined ? metric.unrealizedR : 0;
    const peakR = metric.giveback?.peakUnrealizedR ?? currentR;
    const effectiveR = Math.max(currentR, peakR);

    // 4A. Calculate and evaluate configured Target Ladder steps (T1, T2, T3)
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
      executedLadderSteps: executedStepsList,
    });

    if (ladder && ladder.steps) {
      for (const step of ladder.steps) {
        if (step.isFreeRunner) continue; // Free runner has no fixed target price trigger - handled in 4B
        if (step.status === 'EXECUTED' || (!step.isActionable && step.status !== 'MET')) continue;

        const stepKey = `step${step.targetIndex}`;
        const canonicalName = step.name.split(' ')[0]; // 'T1', 'T2'
        const triggerKey = `ladder:${tradeId}:${stepKey}`;
        const stepTargetR = step.targetIndex === 1
          ? (rules.t1?.targetR ?? 1.0)
          : step.targetIndex === 2
          ? (rules.t2?.targetR ?? 2.0)
          : (rules.t3?.targetR ?? 3.0);
        const rrKey = `rr:${Math.round(stepTargetR)}`;

        // In-memory check
        if (this.executedMilestones.has(triggerKey)) continue;

        // Persistent database-derived check
        if (
          tradeExecutedSteps.has(stepKey) ||
          tradeExecutedSteps.has(canonicalName) ||
          tradeExecutedSteps.has(step.name) ||
          tradeExecutedSteps.has(triggerKey) ||
          (stepTargetR % 1 === 0 && tradeExecutedSteps.has(rrKey))
        ) {
          this.executedMilestones.add(triggerKey);
          continue;
        }

        const isStepAutoEnabled = step.autoExecuteEnabled !== undefined ? step.autoExecuteEnabled : effectiveAutoExecute;

        if (!isStepAutoEnabled) {
          // Auto-execute is OFF: Atomically claim in database so alert is persistent across restarts
          const claimKeys = [stepKey, canonicalName, step.name, triggerKey];
          if (stepTargetR % 1 === 0) {
            claimKeys.push(rrKey, `1:${Math.round(stepTargetR)}`, `${Math.round(stepTargetR)}R`);
          }
          const claimedTrade = await Trade.findOneAndUpdate(
            {
              _id: trade._id,
              status: 'OPEN',
              executedLadderSteps: { $nin: claimKeys },
            },
            {
              $addToSet: { executedLadderSteps: { $each: claimKeys } },
            },
            { new: true }
          );

          if (!claimedTrade) {
            this.executedMilestones.add(triggerKey);
            continue;
          }

          this.executedMilestones.add(triggerKey);
          for (const k of claimKeys) tradeExecutedSteps.add(k);

          // Dispatch RR Milestone notification to Telegram
          if (
            watcherSettings?.telegramAlertsEnabled &&
            watcherSettings?.telegramBotToken &&
            watcherSettings?.telegramChatId &&
            watcherSettings?.telegramAlertEvents?.ladderMilestoneReached !== false
          ) {
            TelegramAlertService.notifyRRMilestone(user, trade, {
              multipleR: stepTargetR,
              rrLabel: `1:${stepTargetR}`,
              currentLtp: metric.currentLtp,
              floatingNetPnL: metric.floatingNetPnL,
              currentR: metric.unrealizedR ?? stepTargetR,
              entryPrice: metric.entryPrice,
              stopLoss: metric.stopLoss ?? undefined,
              initialStopLoss: metric.initialStopLoss ?? undefined,
              autoExecuteArmed: false,
              stepName: step.name,
            }).catch((err: any) => console.warn(`[LiveExecutionWorker] Target notification failed for ${metric.symbol}:`, err.message));
          }
          continue;
        }

        // Execute on exchange server-side
        // ATOMIC MONGODB CLAIM: guarantees exactly one execution across all cluster nodes/restarts
        const claimKeys = [stepKey, canonicalName, step.name, triggerKey];
        if (stepTargetR % 1 === 0) {
          claimKeys.push(rrKey, `1:${Math.round(stepTargetR)}`, `${Math.round(stepTargetR)}R`);
        }
        const claimedTrade = await Trade.findOneAndUpdate(
          {
            _id: trade._id,
            status: 'OPEN',
            executedLadderSteps: { $nin: claimKeys },
          },
          {
            $addToSet: { executedLadderSteps: { $each: claimKeys } },
          },
          { new: true }
        );

        if (!claimedTrade) {
          // Step was already executed or claimed by another worker cycle/tab!
          this.executedMilestones.add(triggerKey);
          continue;
        }

        this.executedMilestones.add(triggerKey);
        for (const k of claimKeys) tradeExecutedSteps.add(k);
        console.log(`[LiveExecutionWorker] Executing ${step.name} server-side for trade ${tradeId} (${metric.symbol})...`);

        const isMt5 = Mt5CommandService.isMt5Trade(trade, trade.accountId);
        const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;

        // 1. Partial or Full Exit via universal execution pipeline with institutional microstructure protections
        if (step.plannedExitQty > 0) {
          await ExecutionPipelineService.execute({
            userId: user._id.toString(),
            accountId: trade.accountId,
            tradeId: tradeId,
            action: 'EXIT_POSITION',
            executeBroker: true,
            isAutomated: true,
            institutionalRules: {
              executionAlgorithm: rules.executionAlgorithm,
              maxSlippagePercent: rules.maxSlippagePercent,
              maxSlippagePoints: rules.maxSlippagePoints,
              spreadSurgeProtectionEnabled: rules.spreadSurgeProtectionEnabled,
              spreadSurgeMultiplier: rules.spreadSurgeMultiplier,
              antiLoopProtectionEnabled: rules.antiLoopProtectionEnabled,
              openingBellFreezeEnabled: rules.openingBellFreezeEnabled,
              openingBellFreezeMinutes: rules.openingBellFreezeMinutes,
              currentLtp: metric.currentLtp,
              targetPrice: step.targetPrice,
            },
            payload: {
              quantity: step.plannedExitQty,
              direction: metric.direction,
              exitReason: `Auto-Executed ${step.name}`,
            },
          });
        }

        // 2. Trailing SL modification via universal execution pipeline
        // Enforce strict favorable-only trailing invariant: only trail if new SL tightens risk!
        const currentSl = trade.risk?.currentStopLoss;
        const suggestedSl = step.suggestedStopLoss;
        const isLong = metric.direction === 'LONG';
        const isSlFavorable =
          suggestedSl &&
          suggestedSl > 0 &&
          (!currentSl || (isLong ? suggestedSl > currentSl : suggestedSl < currentSl));

        if (isSlFavorable) {
          await ExecutionPipelineService.execute({
            userId: user._id.toString(),
            accountId: trade.accountId,
            tradeId: tradeId,
            action: 'MODIFY_STOP_LOSS',
            executeBroker: true,
            isAutomated: true,
            payload: {
              stopPrice: suggestedSl,
            },
          }).catch((slErr: any) => console.warn(`[LiveExecutionWorker] SL trailing failed for ${metric.symbol}:`, slErr.message));
        }

        // 3. For MT5, if runner mode is active, clear Take Profit to 0 so runner runs uncapped
        const isBecomingRunner =
          rules.targetMode === 'T1_FREE_RUNNER' ||
          (Boolean(rules.t3?.isFreeRunner) && (step.targetIndex >= 2 || !rules.t2?.enabled));

        if (isMt5 && ticket && isBecomingRunner) {
          await Mt5CommandService.queueModifyTp({
            userId: user._id.toString(),
            accountId: trade.accountId?.toString(),
            tradeId: tradeId,
            ticket,
            takeProfit: 0,
          }).catch((err: any) => console.warn(`[LiveExecutionWorker] Failed to clear MT5 TP:`, err.message));
        }

        // 4. Telegram alert for auto-execution with RR Realized
        if (
          watcherSettings?.telegramAlertsEnabled &&
          watcherSettings?.telegramBotToken &&
          watcherSettings?.telegramChatId &&
          watcherSettings?.telegramAlertEvents?.ladderMilestoneReached !== false
        ) {
          TelegramAlertService.notifyRRMilestone(user, trade, {
            multipleR: stepTargetR,
            rrLabel: `1:${stepTargetR}`,
            currentLtp: metric.currentLtp,
            floatingNetPnL: metric.floatingNetPnL,
            currentR: metric.unrealizedR ?? stepTargetR,
            entryPrice: metric.entryPrice,
            stopLoss: metric.stopLoss ?? undefined,
            initialStopLoss: metric.initialStopLoss ?? undefined,
            autoExecuteArmed: true,
            actionTaken: `Auto-Exited ${step.plannedExitQty} units & Trailed SL`,
            stepName: step.name,
            executedQty: step.plannedExitQty,
            newStopLoss: isSlFavorable ? suggestedSl : undefined,
          }).catch((err: any) => console.warn(`[LiveExecutionWorker] Auto alert failed for ${metric.symbol}:`, err.message));
        }
      }
    }

    // 4B. Real-time RR Milestone Alerts for every RR (1:1, 1:2, 1:3, 1:4...) whether auto-execution is armed or not
    if (effectiveR >= 1.0) {
      const maxRR = Math.min(20, Math.floor(effectiveR));
      for (let r = 1; r <= maxRR; r++) {
        const rrKey = `rr:${r}`;
        const rrTriggerKey = `ladder:${tradeId}:${rrKey}`;

        if (this.executedMilestones.has(rrTriggerKey)) continue;

        if (
          tradeExecutedSteps.has(rrKey) ||
          tradeExecutedSteps.has(`1:${r}`) ||
          tradeExecutedSteps.has(`${r}R`) ||
          tradeExecutedSteps.has(rrTriggerKey)
        ) {
          this.executedMilestones.add(rrTriggerKey);
          continue;
        }

        // Atomically claim in database to prevent duplicates across reloads/workers
        const claimKeys = [rrKey, `1:${r}`, `${r}R`, rrTriggerKey];
        const claimedTrade = await Trade.findOneAndUpdate(
          {
            _id: trade._id,
            status: 'OPEN',
            executedLadderSteps: { $nin: claimKeys },
          },
          {
            $addToSet: { executedLadderSteps: { $each: claimKeys } },
          },
          { new: true }
        );

        if (!claimedTrade) {
          this.executedMilestones.add(rrTriggerKey);
          continue;
        }

        this.executedMilestones.add(rrTriggerKey);
        for (const k of claimKeys) tradeExecutedSteps.add(k);

        // Dispatch RR Milestone notification to Telegram
        if (
          watcherSettings?.telegramAlertsEnabled &&
          watcherSettings?.telegramBotToken &&
          watcherSettings?.telegramChatId &&
          watcherSettings?.telegramAlertEvents?.ladderMilestoneReached !== false
        ) {
          TelegramAlertService.notifyRRMilestone(user, trade, {
            multipleR: r,
            rrLabel: `1:${r}`,
            currentLtp: metric.currentLtp,
            floatingNetPnL: metric.floatingNetPnL,
            currentR: metric.unrealizedR ?? r,
            entryPrice: metric.entryPrice,
            stopLoss: metric.stopLoss ?? undefined,
            initialStopLoss: metric.initialStopLoss ?? undefined,
            autoExecuteArmed: effectiveAutoExecute,
          }).catch((err: any) => console.warn(`[LiveExecutionWorker] Failed to dispatch ${r}R milestone alert:`, err.message));
        }
      }
    }

    // 5. Macro News Event Shield: 3-minute pre-news protection
    const cleanSym = (metric.symbol || trade.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isGoldOrForex =
      cleanSym.includes('XAU') ||
      cleanSym.includes('GOLD') ||
      cleanSym.includes('USD') ||
      cleanSym.includes('EUR') ||
      cleanSym.includes('GBP') ||
      cleanSym.includes('JPY') ||
      cleanSym.includes('US30') ||
      cleanSym.includes('NAS');

    if (isGoldOrForex) {
      try {
        const upcomingNews = await EconomicCalendarService.getUpcomingGoldNews(new Date(), 1);
        const imminentEvent = upcomingNews.find(
          (e) => e.minutesUntil <= 3 && e.minutesUntil >= 0 && (e.impact === 'HIGH' || e.isGoldMover)
        );

        if (imminentEvent) {
          const currentR = metric.unrealizedR ?? 0;
          const entryPrice = Number(
            trade.simpleExecution?.entryPrice ??
            trade.calculated?.averageEntryPrice ??
            trade.entryPrice ??
            0
          );

          if (currentR >= 0.8 && entryPrice > 0) {
            const tick = trade.tickSize || 0.1;
            const bePrice = metric.direction === 'LONG' ? entryPrice + tick * 2 : entryPrice - tick * 2;
            const currentSl = trade.risk?.currentStopLoss;
            const isAlreadyBe =
              currentSl &&
              (metric.direction === 'LONG' ? currentSl >= bePrice : currentSl <= bePrice);

            const shieldKey = `news_shield_be:${tradeId}:${imminentEvent.id}`;
            if (!this.executedMilestones.has(shieldKey)) {
              this.executedMilestones.add(shieldKey);

              if (!isAlreadyBe) {
                await ExecutionPipelineService.execute({
                  userId: user._id.toString(),
                  accountId: trade.accountId,
                  tradeId: tradeId,
                  action: 'MODIFY_STOP_LOSS',
                  executeBroker: true,
                  isAutomated: true,
                  payload: {
                    stopPrice: bePrice,
                  },
                }).catch((err: any) =>
                  console.warn(`[LiveExecutionWorker] News shield SL trail failed for ${metric.symbol}:`, err.message)
                );
              }

              if (
                watcherSettings?.telegramAlertsEnabled &&
                watcherSettings?.telegramBotToken &&
                watcherSettings?.telegramChatId
              ) {
                TelegramAlertService.sendAlert({
                  botToken: watcherSettings.telegramBotToken,
                  chatId: watcherSettings.telegramChatId,
                  title: `🛡️ Macro News Shield: ${imminentEvent.title}`,
                  body: `High-impact catalyst releasing in ${imminentEvent.minutesUntil}m! Position is at +${currentR.toFixed(2)}R. Auto-locked Stop Loss to breakeven (${bePrice}) to defend open profit against news volatility.`,
                  severity: 'INFO',
                  buttons: [
                    [
                      { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
                      { text: '🚨 Flatten Now', callback_data: 'confirm_panic' },
                    ],
                  ],
                }).catch(() => {});
              }
            }
          } else {
            const warnKey = `news_shield_warn:${tradeId}:${imminentEvent.id}`;
            if (!this.executedMilestones.has(warnKey)) {
              this.executedMilestones.add(warnKey);

              if (
                watcherSettings?.telegramAlertsEnabled &&
                watcherSettings?.telegramBotToken &&
                watcherSettings?.telegramChatId
              ) {
                TelegramAlertService.sendAlert({
                  botToken: watcherSettings.telegramBotToken,
                  chatId: watcherSettings.telegramChatId,
                  title: `🚨 Macro News Blackout: ${imminentEvent.title}`,
                  body: `High-impact catalyst releasing in ${imminentEvent.minutesUntil}m! Active position is at ${currentR >= 0 ? `+${currentR.toFixed(2)}R` : `${currentR.toFixed(2)}R`} (< 0.8R buffer). High volatility and spread expansion expected. Consider closing or locking breakeven.`,
                  severity: 'WARNING',
                  buttons: [
                    [
                      { text: '🛡️ Lock Breakeven Now', callback_data: 'cmd_lock_be_all' },
                      { text: '🚨 Panic Flatten All', callback_data: 'confirm_panic' },
                    ],
                    [
                      { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
                    ],
                  ],
                }).catch(() => {});
              }
            }
          }
        }
      } catch (newsErr: any) {
        console.warn(`[LiveExecutionWorker] News shield check error for ${metric.symbol}:`, newsErr.message);
      }
    }

    // 6. Gold Trade Stagnation / Time-Stop Reminder
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

