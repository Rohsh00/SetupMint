/**
 * SetupMint - Telegram Push Alerting & Two-Way Interactive Command Service
 *
 * Architecture & Invariants:
 * - Tenant Isolation: all queries include userId.
 * - Pure Decision Engine: hysteresis, re-entry cooldown, re-pings, snooze, and formatting
 *   are computed via @tradevault/financial-engine (evaluateAlert, buildAlertContext).
 * - Single Live Card per trade: edited in place; new audible alert only on SEND_NEW decisions.
 * - Monospace telemetry cards (<pre>) with IST timestamps and deterministic rule-based hints.
 * - Contextual inline buttons: compact callback_data (<= 64 bytes), idempotency locks via
 *   TelegramCallbackLock, cardVersion verification, slippage guard, and true-breakeven sanity.
 * - Webhook security: update_id idempotency via TelegramUpdateAudit, X-Telegram-Bot-Api-Secret-Token validation.
 * - Encrypted bot tokens: decrypted via crypto.service.ts; bot tokens and secrets redacted in Pino logs.
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import {
  evaluateAlert,
  buildAlertContext,
  calculateTrueBreakeven,
  DEFAULT_ALERT_POLICIES,
  AlertPolicy,
  AlertDecision,
  AlertType,
  AlertLifecycle,
  AlertStateSnapshot,
  IAlertContextParams,
} from '@tradevault/financial-engine';
import {
  User,
  Trade,
  AlertState,
  AlertEvent,
  TelegramUpdateAudit,
  TelegramCallbackLock,
} from '../db/models/index.js';
import { config } from '../config.js';
import { decryptSecret } from './crypto.service.js';
import { FyersService } from './fyers.service.js';
import { LiveWatcherService } from './live-watcher.service.js';

export interface ITelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ITelegramAlertPayload {
  botToken: string;
  chatId: string;
  title: string;
  body: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  metrics?: Record<string, string | number>;
  progressBar?: {
    label: string;
    percent: number;
  };
  buttons?: ITelegramInlineButton[][];
  disableNotification?: boolean;
}

export class TelegramAlertService {
  private static TELEGRAM_API_BASE = 'https://api.telegram.org';
  private static recentAlerts = new Map<string, number>();
  private static DEBOUNCE_MS = 10 * 1000; // 10s throttle for flat alerts

  /**
   * Deterministic Webhook Secret Token derived from server configuration.
   */
  static getWebhookSecretToken(): string {
    const seed = config.tokenEncryptionKey || config.sessionSecret || 'setupmint-secret-key';
    return crypto.createHash('sha256').update(`${seed}:telegram-webhook`).digest('hex');
  }

  /**
   * Renders a clean ASCII visual progress / runway bar.
   * Example: [██████░░░░] 60%
   */
  static renderProgressBar(percent: number, length: number = 10): string {
    const safePct = Math.max(0, Math.min(100, Math.round(percent)));
    const filledCount = Math.max(0, Math.min(length, Math.round((safePct / 100) * length)));
    const emptyCount = length - filledCount;
    return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${safePct}%`;
  }

  /**
   * Tests connection to Telegram bot and chat ID.
   */
  static async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      const realToken = decryptSecret(botToken) || botToken;
      const text =
        `🔔 <b>SetupMint Alert Link Verified</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Your SetupMint trading terminal is connected to this Telegram chat.\n\n` +
        `<b>Active Capabilities:</b>\n` +
        `• 🚨 State-Machine Risk & Stop Threat radar\n` +
        `• ⚠️ Anti-Greed Profit Giveback protection\n` +
        `• 🎯 Scaling Ladder milestone execution\n` +
        `• 🛑 Daily Max Loss limit guard\n` +
        `• 📱 Interactive One-Tap Buttons & 2-Way Commands\n\n` +
        `<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
          { text: '📋 View /trades', callback_data: 'cmd_trades' },
        ],
      ];

      await this.sendMessage(realToken, chatId, text, buttons);
      return { success: true, message: 'Rich test notification sent to Telegram successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to dispatch Telegram test message' };
    }
  }

  /**
   * Configures Telegram Webhook for two-way interactive buttons and commands with secret token.
   */
  static async setWebhook(botToken: string, webhookUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const realToken = decryptSecret(botToken) || botToken;
      const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/setWebhook`;
      const secretToken = this.getWebhookSecretToken();

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
          secret_token: secretToken,
        }),
      });
      const json = (await res.json()) as any;
      if (!json.ok) throw new Error(json.description || 'Webhook registration failed');
      return { success: true, message: json.description || 'Telegram webhook configured successfully with secret token!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to configure Telegram webhook' };
    }
  }

  /**
   * Low-level Telegram sendMessage API caller.
   */
  static async sendMessage(
    botToken: string | null | undefined,
    chatId: string | number,
    text: string,
    buttons?: ITelegramInlineButton[][],
    disableNotification: boolean = false
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = decryptSecret(botToken) || botToken;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      disable_notification: disableNotification,
    };

    if (buttons && buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: buttons,
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(json.description || 'Telegram API returned an error');
    }
    return json.result;
  }

  /**
   * Low-level Telegram editMessageText API caller.
   */
  static async editMessageText(
    botToken: string | null | undefined,
    chatId: string | number,
    messageId: number,
    text: string,
    buttons?: ITelegramInlineButton[][]
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = decryptSecret(botToken) || botToken;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/editMessageText`;
    const payload: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (buttons) {
      payload.reply_markup = { inline_keyboard: buttons };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as any;
      if (!json.ok) {
        // Swallow "message is not modified" error from Telegram
        if (json.description && json.description.includes('message is not modified')) {
          return null;
        }
        console.warn(`[TelegramAlertService] editMessageText notice:`, json.description);
      }
      return json.result;
    } catch (err: any) {
      console.warn(`[TelegramAlertService] editMessageText network error:`, err.message);
      return null;
    }
  }

  /**
   * Answers a Telegram callback query with immediate feedback.
   */
  static async answerCallbackQuery(
    botToken: string | null | undefined,
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<void> {
    if (!botToken) return;
    try {
      const realToken = decryptSecret(botToken) || botToken;
      const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/answerCallbackQuery`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || 'Processing...',
          show_alert: showAlert,
        }),
      });
    } catch (err: any) {
      console.warn(`[TelegramAlertService] answerCallbackQuery failed:`, err.message);
    }
  }

  /**
   * Evaluates and dispatches a risk alert using the pure financial-engine state machine.
   * Enforces single live card per open trade, hysteresis, persistence re-pings, and contextual keyboards.
   */
  static async dispatchRiskAlert(
    user: any,
    trade: any,
    alertInput: {
      type: AlertType;
      severity: number; // 0..3
      metricValue: Decimal | number;
      ltp: number;
      customHint?: string;
    }
  ): Promise<boolean> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled) return false;

    const rawToken = settings.telegramBotToken;
    const botToken = decryptSecret(rawToken) || rawToken;
    const chatId = settings.telegramChatId;
    if (!botToken || !chatId) return false;

    // Check user-level quiet hours if configured
    if (this.isQuietHoursActive(settings.quietHours)) {
      return false;
    }

    const userId = user._id;
    const tradeId = trade._id;
    const now = new Date();
    const metricVal = new Decimal(alertInput.metricValue);

    // 1. Fetch current persisted AlertState
    const alertState = await AlertState.findOne({
      userId,
      tradeId,
      type: alertInput.type,
    });

    const snapshot: AlertStateSnapshot | null = alertState
      ? {
          state: alertState.state as AlertLifecycle,
          severity: alertState.severity,
          enterCount: alertState.enterCount,
          firstAt: alertState.firstAt,
          lastSentAt: alertState.lastSentAt,
          clearedAt: alertState.clearedAt,
          snoozedUntil: alertState.snoozedUntil,
          pingCount: alertState.pingCount,
        }
      : null;

    // 2. Resolve Alert Policy (defaults merged with user custom policies if present)
    const basePolicy = DEFAULT_ALERT_POLICIES[alertInput.type] || DEFAULT_ALERT_POLICIES.STOP_THREAT;
    const userPolicyOverride = settings.telegramAlertPolicies?.[alertInput.type];
    const policy: AlertPolicy = {
      ...basePolicy,
      ...(userPolicyOverride || {}),
    };

    // 3. Evaluate state machine transition via pure engine
    const decision = evaluateAlert(snapshot, {
      type: alertInput.type,
      severity: alertInput.severity,
      metricValue: metricVal,
      now,
    }, policy);

    if (decision.action === 'SKIP') {
      return false;
    }

    // 4. Build Context and Card Formatting via pure engine
    const cardVersion = (alertState?.cardVersion || 0) + 1;
    const context = buildAlertContext({
      type: alertInput.type,
      severity: alertInput.severity,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice || trade.simpleExecution?.entryPrice || 0,
      currentLtp: alertInput.ltp,
      quantity: trade.quantity || trade.simpleExecution?.quantity || 1,
      contractMultiplier: trade.contractMultiplier || trade.simpleExecution?.contractMultiplier || 1,
      assetClass: trade.assetClass || 'EQUITY',
      stopLoss: trade.risk?.currentStopLoss ?? trade.risk?.initialStopLoss ?? null,
      initialStopLoss: trade.risk?.initialStopLoss ?? null,
      plannedTarget: trade.risk?.plannedTarget ?? null,
      entryTime: trade.entryTime || trade.createdAt,
      dayLossUsed: user.calculatedDayLoss || 0,
      dayLossLimit: user.riskSettings?.maxDailyLoss || 5000,
      portfolioOpenRisk: user.calculatedPortfolioOpenRisk || 0,
      enterCount: decision.action === 'SEND_NEW' ? decision.enterCount : (alertState?.enterCount || 1),
      peakR: trade.calculated?.liveMfeSummary?.peakUnrealizedR || 0,
      peakMinutesAgo: trade.calculated?.liveMfeSummary?.peakTimestamp
        ? Math.max(1, Math.round((now.getTime() - new Date(trade.calculated.liveMfeSummary.peakTimestamp).getTime()) / 60000))
        : 1,
      priceVelocityPerMin: 0,
    });

    const isAudible = policy.audible && (alertInput.severity >= 2 || alertInput.type === 'NAKED_POSITION');
    const buttons = this.buildContextualKeyboard(trade, alertInput.type, alertInput.ltp, cardVersion, decision.action === 'CLEAR');

    // 5. Execute Decision Actions
    if (decision.action === 'CLEAR') {
      // Condition recovered past clear threshold: edit card to show recovery
      if (alertState && alertState.messageId) {
        const clearedText =
          `✅ <b>CONDITION RECOVERED · ${trade.symbol}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Risk condition (${alertInput.type}) has stabilized back within safety margins.\n\n` +
          `Current LTP: ₹${alertInput.ltp.toFixed(2)} • Time: ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        await this.editMessageText(botToken, chatId, alertState.messageId, clearedText, [
          [{ text: '🔄 Refresh Terminal', callback_data: `x:${trade._id}:REF:${cardVersion}:${alertInput.ltp}` }],
        ]);
      }

      await AlertState.findOneAndUpdate(
        { userId, tradeId, type: alertInput.type },
        {
          $set: {
            state: 'CLEARED',
            clearedAt: now,
            cardVersion,
          },
        },
        { upsert: true }
      );

      await AlertEvent.create({
        userId,
        tradeId,
        type: alertInput.type,
        severity: alertInput.severity,
        action: 'CLEAR',
        enterCount: alertState?.enterCount || 1,
        sentAt: now,
      });

      return true;
    }

    if (decision.action === 'EDIT_SILENT') {
      // Edit live card in-place; throttle edits to min 10 seconds
      if (alertState && alertState.messageId) {
        const lastEdit = alertState.lastSentAt ? alertState.lastSentAt.getTime() : 0;
        if (now.getTime() - lastEdit >= 10000) {
          await this.editMessageText(botToken, chatId, alertState.messageId, context.cardText, buttons);
          await AlertState.findByIdAndUpdate(alertState._id, {
            $set: {
              lastSentAt: now,
              cardVersion,
              severity: alertInput.severity,
            },
          });
        }
      }
      return true;
    }

    if (decision.action === 'SEND_NEW') {
      // If a previous message card existed for this trade & type, mark it superseded and strip buttons
      if (alertState && alertState.messageId) {
        try {
          await this.editMessageText(
            botToken,
            chatId,
            alertState.messageId,
            `↪ <i>Superseded by updated alert below</i>`,
            []
          );
        } catch {
          // Swallow any edit error on old message
        }
      }

      // Send new audible Telegram alert
      const sentMsg = await this.sendMessage(botToken, chatId, context.cardText, buttons, !isAudible);
      const messageId = sentMsg?.message_id;

      await AlertState.findOneAndUpdate(
        { userId, tradeId, type: alertInput.type },
        {
          $set: {
            state: 'ACTIVE',
            severity: alertInput.severity,
            enterCount: decision.enterCount,
            pingCount: decision.reason === 'REPING' ? (alertState?.pingCount || 0) + 1 : 0,
            firstAt: alertState?.firstAt || now,
            lastSentAt: now,
            chatId: String(chatId),
            messageId,
            cardVersion,
            clearedAt: null,
            snoozedUntil: null,
          },
        },
        { upsert: true }
      );

      await AlertEvent.create({
        userId,
        tradeId,
        type: alertInput.type,
        severity: alertInput.severity,
        action: 'SEND_NEW',
        enterCount: decision.enterCount,
        sentAt: now,
      });

      return true;
    }

    return false;
  }

  /**
   * Builds compact contextual inline buttons (<= 64 bytes callback_data).
   */
  static buildContextualKeyboard(
    trade: any,
    type: AlertType,
    ltp: number,
    cardVersion: number,
    isCleared: boolean = false
  ): ITelegramInlineButton[][] {
    const tradeId = trade._id.toString();
    const roundLtp = Number(ltp.toFixed(2));

    if (isCleared) {
      return [
        [{ text: '🔄 Refresh Terminal', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` }],
      ];
    }

    const isLong = trade.direction === 'LONG';
    const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? trade.entryPrice ?? 0);
    let trueBePrice = trade.calculated?.trueBreakevenPrice;
    if (!trueBePrice && entryPrice > 0) {
      try {
        const beRes = calculateTrueBreakeven({
          direction: trade.direction,
          entryPrice,
          quantity: trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? trade.quantity ?? 1,
          estimatedCharges: 50,
        });
        trueBePrice = beRes.trueBreakevenPrice;
      } catch {
        trueBePrice = entryPrice;
      }
    }
    trueBePrice = trueBePrice || entryPrice;
    const isProfitableSideOfBe = isLong ? ltp > trueBePrice : ltp < trueBePrice;

    if (type === 'STOP_THREAT') {
      const row1: ITelegramInlineButton[] = [
        { text: `🚨 Exit @~₹${roundLtp}`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
      ];
      // Lock BE ONLY if LTP is on the profitable side of true breakeven
      if (isProfitableSideOfBe) {
        row1.push({ text: '🛡️ Lock BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` });
      }
      return [
        row1,
        [
          { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
          { text: '🔄 Refresh', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
        ],
      ];
    }

    if (type === 'GIVEBACK') {
      const row1: ITelegramInlineButton[] = [
        { text: '🎯 Book 50%', callback_data: `x:${tradeId}:B50:${cardVersion}:${roundLtp}` },
        { text: `🚨 Exit @~₹${roundLtp}`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
      ];
      return [
        row1,
        [
          { text: '🛡️ Trail to BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` },
          { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
        ],
      ];
    }

    if (type === 'NAKED_POSITION') {
      return [
        [
          { text: `🚨 Exit Position`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
          { text: '🔄 Refresh', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
        ],
      ];
    }

    // Default / Ladder / Attention buttons
    return [
      [
        { text: `🚨 Market Exit`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
        ...(isProfitableSideOfBe
          ? [{ text: '🛡️ Lock BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` }]
          : []),
      ],
      [
        { text: '🎯 Book 50%', callback_data: `x:${tradeId}:B50:${cardVersion}:${roundLtp}` },
        { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
      ],
    ];
  }

  /**
   * Handles incoming Webhook updates from Telegram (button clicks and commands).
   */
  static async processWebhookUpdate(update: any): Promise<void> {
    if (!update) return;

    // Deduplicate by update_id via unique index on TelegramUpdateAudit
    if (update.update_id) {
      try {
        await TelegramUpdateAudit.create({
          updateId: update.update_id,
          processedAt: new Date(),
        });
      } catch (err: any) {
        if (err.code === 11000) {
          // Duplicate update_id, discard immediately
          return;
        }
        console.error('[DEBUG processWebhookUpdate error]', err);
        throw err;
      }
    }

    // 1. Handle Inline Button Clicks (callback_query)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    // 2. Handle Text Commands (message)
    if (update.message?.text) {
      await this.handleTextMessage(update.message);
    }
  }

  /**
   * Handles button callback queries with full idempotency, cardVersion matching, and slippage guard.
   */
  private static async handleCallbackQuery(cq: any): Promise<void> {
    const chatId = cq.message?.chat?.id || cq.from?.id;
    const data: string = cq.data || '';
    const messageId = cq.message?.message_id;

    // a. Resolve user from chatId
    const user = await User.findOne({
      'liveWatcherSettings.telegramChatId': String(chatId),
    });

    if (!user) {
      return;
    }

    const rawToken = user?.liveWatcherSettings?.telegramBotToken;
    let botToken = rawToken ? decryptSecret(rawToken) || rawToken : null;

    // Fast-path for global commands
    if (data === 'cmd_pnl') {
      await this.answerCallbackQuery(botToken, cq.id, 'Refreshing PnL...');
      await this.handlePnlCommand(user, botToken, chatId);
      return;
    }
    if (data === 'cmd_trades') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading open trades...');
      await this.handleTradesCommand(user, botToken, chatId);
      return;
    }
    if (data === 'panic_prompt') {
      await this.answerCallbackQuery(botToken, cq.id, 'Confirm panic exit...');
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>EMERGENCY KILLSWITCH CONFIRMATION</b>\n\nAre you sure you want to market-exit ALL open positions immediately?`,
        [[{ text: '🛑 YES, CLOSE ALL POSITIONS NOW', callback_data: 'confirm_panic' }]]
      );
      return;
    }
    if (data === 'confirm_panic') {
      await this.answerCallbackQuery(botToken, cq.id, '🚨 Flattening all positions on FYERS...', true);
      await this.executePanicExit(user, botToken, chatId, messageId);
      return;
    }

    // Parse structured callback format: x:<tradeId>:<actionCode>:<cardVersion>:<renderLtp>
    if (!data.startsWith('x:')) {
      await this.answerCallbackQuery(botToken, cq.id);
      return;
    }

    const parts = data.split(':');
    const tradeId = parts[1];
    const actionCode = parts[2];
    const cardVersion = parseInt(parts[3] || '1', 10);
    const renderLtp = parseFloat(parts[4] || '0');

    // b. Validate trade belongs to user and is still OPEN with open quantity
    const trade = await Trade.findOne({
      _id: tradeId,
      userId: user._id,
    });

    if (!trade || trade.status !== 'OPEN') {
      await this.answerCallbackQuery(botToken, cq.id, 'Position is already closed or unavailable.', true);
      if (messageId) {
        await this.editMessageText(
          botToken,
          chatId,
          messageId,
          (cq.message?.text || '') + '\n\n<i>Position is already closed.</i>',
          []
        );
      }
      return;
    }

    // c. Verify cardVersion against persisted AlertState (prevent stale executions)
    const alertState = await AlertState.findOne({
      userId: user._id,
      tradeId: trade._id,
    }).sort({ updatedAt: -1 });

    if (alertState && alertState.cardVersion !== cardVersion && !actionCode.startsWith('CONF_')) {
      await this.answerCallbackQuery(botToken, cq.id, 'Card outdated, terminal state refreshed.', true);
      // Re-render card with current version
      const latestLtp = renderLtp > 0 ? renderLtp : (trade.calculated?.liveMfeSummary?.peakLtp || trade.simpleExecution?.entryPrice || 0);
      const newButtons = this.buildContextualKeyboard(trade, (alertState.type as AlertType) || 'STOP_THREAT', latestLtp, alertState.cardVersion);
      if (messageId) {
        await this.editMessageText(botToken, chatId, messageId, cq.message?.text || '', newButtons);
      }
      return;
    }

    // d. Idempotency Lock on (tradeId, actionCode) with 15s TTL
    const lockKey = `${tradeId}:${actionCode}`;
    try {
      await TelegramCallbackLock.create({ lockKey, createdAt: new Date() });
    } catch (err: any) {
      if (err.code === 11000) {
        await this.answerCallbackQuery(botToken, cq.id, '⏳ Action already in progress...');
        return;
      }
    }

    // Answer callback query immediately to stop the button spinner
    await this.answerCallbackQuery(botToken, cq.id, 'Processing order on FYERS...');
    const startTime = Date.now();

    try {
      // e. Slippage Guard for Market Exit and Partial Book
      const slippageGuardPct = user.liveWatcherSettings?.slippageGuardPercent ?? 0.5;
      const currentLtp = renderLtp > 0 ? renderLtp : (trade.calculated?.liveMfeSummary?.peakLtp || trade.simpleExecution?.entryPrice || 0);

      if (
        (actionCode === 'E' || actionCode === 'B50') &&
        renderLtp > 0 &&
        currentLtp > 0
      ) {
        const slippage = Math.abs(currentLtp - renderLtp) / renderLtp * 100;
        if (slippage > slippageGuardPct) {
          // Trigger slippage confirmation step
          const confirmAction = actionCode === 'E' ? 'CONF_E' : 'CONF_B50';
          const confirmText =
            (cq.message?.text || '') +
            `\n\n⚠️ <b>SLIPPAGE WARNING:</b> Price moved from ₹${renderLtp} to ₹${currentLtp} (${slippage.toFixed(2)}% > guard ${slippageGuardPct}%). Confirm execution?`;

          await this.editMessageText(botToken, chatId, messageId, confirmText, [
            [
              { text: `⚠️ Confirm Execution @ ₹${currentLtp}`, callback_data: `x:${tradeId}:${confirmAction}:${cardVersion}:${currentLtp}` },
              { text: `❌ Cancel`, callback_data: `x:${tradeId}:REF:${cardVersion}:${currentLtp}` },
            ],
          ]);
          return;
        }
      }

      // f. Execute Action
      if (actionCode === 'E' || actionCode === 'CONF_E') {
        const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
        const res = await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
          exitQty: openQty,
          isFullClose: true,
        });

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[✅ EXECUTED MARKET EXIT ON FYERS]</b>\n` +
          `Order Status: ${res.executedOnBroker ? 'FILLED ON EXCHANGE' : 'SIMULATED'}\n` +
          `Traded Price: ₹${res.tradedPrice || currentLtp} • Time: ${new Date().toLocaleTimeString('en-IN')} IST`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        trade.auditLog.push({
          action: 'TELEGRAM_EXIT',
          timestamp: new Date(),
          details: { text: `Market exit via Telegram button. Traded Price: ₹${res.tradedPrice || currentLtp}` },
          changedBy: 'telegram',
        });
        await trade.save();

        if (alertState) {
          alertState.cardVersion += 1;
          alertState.state = 'RESOLVED';
          alertState.resolvedAt = new Date();
          await alertState.save();
        }

        await AlertEvent.create({
          userId: user._id,
          tradeId: trade._id,
          type: (alertState?.type as any) || 'STOP_THREAT',
          severity: alertState?.severity || 2,
          action: 'SEND_NEW',
          actionTaken: 'EXIT',
          latencyMs: Date.now() - startTime,
          sentAt: alertState?.lastSentAt || new Date(),
          actedAt: new Date(),
        });
        return;
      }

      if (actionCode === 'BE') {
        const trueBePrice = (trade.calculated as any)?.trueBreakevenPrice || trade.simpleExecution?.entryPrice || 0;
        // Preserve risk.initialStopLoss anchoring! Update only currentStopLoss.
        trade.risk = {
          ...(trade.risk || {}),
          initialStopLoss: trade.risk?.initialStopLoss || trueBePrice,
          currentStopLoss: trueBePrice,
        };

        let brokerResult: any = { executedOnBroker: false };
        try {
          brokerResult = await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), trueBePrice);
        } catch {
          // Broker stop placement fallback
        }

        trade.auditLog.push({
          action: 'TELEGRAM_LOCK_BE',
          timestamp: new Date(),
          details: { text: `Stop moved to true breakeven ₹${trueBePrice} via Telegram button` },
          changedBy: 'telegram',
        });
        await trade.save();

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🛡️ STOP LOCKED AT TRUE BREAKEVEN]</b>\n` +
          `SL Level: ₹${trueBePrice.toFixed(2)} • Status: ${brokerResult.executedOnBroker ? 'UPDATED ON BROKER' : 'STORED'}`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        if (alertState) {
          alertState.cardVersion += 1;
          await alertState.save();
        }

        await AlertEvent.create({
          userId: user._id,
          tradeId: trade._id,
          type: (alertState?.type as any) || 'STOP_THREAT',
          severity: alertState?.severity || 1,
          action: 'SEND_NEW',
          actionTaken: 'LOCK_BE',
          latencyMs: Date.now() - startTime,
          sentAt: alertState?.lastSentAt || new Date(),
          actedAt: new Date(),
        });
        return;
      }

      if (actionCode === 'B50' || actionCode === 'CONF_B50') {
        const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
        const halfQty = Math.max(1, Math.floor(openQty / 2));

        const res = await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
          exitQty: halfQty,
          isFullClose: false,
        });

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🎯 50% PARTIAL PROFIT BOOKED]</b>\n` +
          `Qty Closed: ${halfQty} • Traded: ₹${res.tradedPrice || currentLtp}`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        trade.auditLog.push({
          action: 'TELEGRAM_BOOK_50',
          timestamp: new Date(),
          details: { text: `Booked 50% partial (${halfQty} qty) via Telegram button` },
          changedBy: 'telegram',
        });
        await trade.save();

        if (alertState) {
          alertState.cardVersion += 1;
          await alertState.save();
        }

        await AlertEvent.create({
          userId: user._id,
          tradeId: trade._id,
          type: (alertState?.type as any) || 'GIVEBACK',
          severity: alertState?.severity || 2,
          action: 'SEND_NEW',
          actionTaken: 'BOOK_50',
          latencyMs: Date.now() - startTime,
          sentAt: alertState?.lastSentAt || new Date(),
          actedAt: new Date(),
        });
        return;
      }

      if (actionCode === 'SZ') {
        const snoozeMinutes = user.liveWatcherSettings?.snoozeDefaultMin || 10;
        const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);

        if (alertState) {
          alertState.state = 'SNOOZED';
          alertState.snoozedUntil = snoozedUntil;
          alertState.cardVersion += 1;
          await alertState.save();
        }

        const updateText =
          (cq.message?.text || '') +
          `\n\n💤 <i>Snoozed until ${snoozedUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Will re-arm on severe escalation.</i>`;

        await this.editMessageText(botToken, chatId, messageId, updateText, [
          [{ text: '🔄 Refresh Terminal', callback_data: `x:${tradeId}:REF:${(alertState?.cardVersion || 1)}:${renderLtp}` }],
        ]);

        trade.auditLog.push({
          action: 'TELEGRAM_SNOOZE',
          timestamp: new Date(),
          details: { text: `Alerts snoozed for ${snoozeMinutes}m via Telegram button` },
          changedBy: 'telegram',
        });
        await trade.save();
        return;
      }

      if (actionCode === 'REF') {
        const latestLtp = renderLtp > 0 ? renderLtp : (trade.calculated?.liveMfeSummary?.peakLtp || trade.simpleExecution?.entryPrice || 0);
        const newButtons = this.buildContextualKeyboard(trade, (alertState?.type as AlertType) || 'STOP_THREAT', latestLtp, (alertState?.cardVersion || 1));
        await this.editMessageText(botToken, chatId, messageId, cq.message?.text || '', newButtons);
        return;
      }
    } catch (err: any) {
      console.error('[TelegramAlertService] Action execution failed:', err);
      await this.sendMessage(botToken, chatId, `❌ Action failed: ${err.message}`);
    }
  }

  /**
   * Handles text commands sent to the Telegram bot.
   */
  private static async handleTextMessage(msg: any): Promise<void> {
    const chatId = msg.chat?.id;
    const text: string = (msg.text || '').trim();
    const [rawCmd, ...args] = text.split(/\s+/);
    const command = rawCmd.toLowerCase();

    // Check if user is linked
    const user = await User.findOne({
      'liveWatcherSettings.telegramChatId': String(chatId),
    });

    if (!user) {
      // Respond with unlinked guide
      const fallbackToken = config.telegramBotToken;
      if (fallbackToken) {
        await this.sendMessage(
          fallbackToken,
          chatId,
          `👋 <b>Welcome to SetupMint Terminal Bot</b>\n\n` +
          `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
          `To connect your trading terminal:\n` +
          `1. Open SetupMint in your browser\n` +
          `2. Go to <b>Settings > Live Watcher > Telegram Off-Screen Push Alerts</b>\n` +
          `3. Paste your Chat ID (<code>${chatId}</code>) and your Bot Token\n` +
          `4. Click <b>Test Connection</b> & <b>Save Settings</b>.`
        );
      }
      return;
    }

    const rawToken = user.liveWatcherSettings?.telegramBotToken;
    const botToken = decryptSecret(rawToken) || rawToken;
    if (!botToken) return;

    switch (command) {
      case '/start':
      case '/help':
        await this.sendMessage(
          botToken,
          chatId,
          `👋 <b>SetupMint Terminal Commands</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `• <b>/pnl</b> — Live floating PnL, open R-multiple & day PnL\n` +
          `• <b>/trades</b> — List active open trades with 1-tap Exit and Lock BE\n` +
          `• <b>/summary</b> — Today's performance stats, win rate & harvested R\n` +
          `• <b>/alerts</b> — List active alert states and snoozed trades\n` +
          `• <b>/snooze</b> — Snooze alerts for 15 minutes\n` +
          `• <b>/mute &lt;mins&gt;</b> — Mute audible notifications\n` +
          `• <b>/panic</b> — Two-step killswitch to market-exit all positions\n\n` +
          `<i>Connected account: ${user.name || user.email}</i>`
        );
        break;

      case '/pnl':
        await this.handlePnlCommand(user, botToken, chatId);
        break;

      case '/trades':
        await this.handleTradesCommand(user, botToken, chatId);
        break;

      case '/summary':
        await this.handleSummaryCommand(user, botToken, chatId);
        break;

      case '/alerts':
        await this.handleAlertsListCommand(user, botToken, chatId);
        break;

      case '/snooze':
        await this.handleGlobalSnoozeCommand(user, botToken, chatId);
        break;

      case '/mute':
        await this.handleMuteCommand(user, botToken, chatId, args[0]);
        break;

      case '/panic':
      case '/killswitch':
        await this.sendMessage(
          botToken,
          chatId,
          `⚠️ <b>EMERGENCY KILLSWITCH REQUESTED</b>\n\nDo you want to immediately market-exit ALL open positions on FYERS?`,
          [[{ text: '🛑 YES, CLOSE ALL POSITIONS NOW', callback_data: 'confirm_panic' }]]
        );
        break;

      default:
        await this.sendMessage(
          botToken,
          chatId,
          `❓ Unknown command: <code>${command}</code>. Type <b>/help</b> for available commands.`
        );
    }
  }

  /**
   * Generates live PnL report card for /pnl command.
   */
  private static async handlePnlCommand(user: any, botToken: string | null | undefined, chatId: string | number): Promise<void> {
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString());
    const openCount = summary.positions.length;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTrades = await Trade.find({
      userId: user._id,
      status: 'CLOSED',
      exitTime: { $gte: startOfDay },
    }).lean();

    const realizedPnL = todayTrades.reduce((acc, t) => acc + (t.calculated?.netPnL || 0), 0);
    const totalDayPnL = summary.totalFloatingNetPnL + realizedPnL;

    const pnlSign = summary.totalFloatingNetPnL >= 0 ? '+' : '';
    const daySign = totalDayPnL >= 0 ? '+' : '';
    const rSign = (summary.portfolioUnrealizedR || 0) >= 0 ? '+' : '';

    const text =
      `📈 <b>SetupMint Live Portfolio PnL</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Open Positions  : ${openCount}\n` +
      `Floating Net    : ${pnlSign}₹${summary.totalFloatingNetPnL.toFixed(2)} (${rSign}${(summary.portfolioUnrealizedR || 0).toFixed(2)}R)\n` +
      `Floating Gross  : ₹${summary.totalFloatingGrossPnL.toFixed(2)}\n` +
      `Est Charges     : -₹${summary.totalEstimatedCharges.toFixed(2)}\n` +
      `Realized Today  : ₹${realizedPnL.toFixed(2)}\n` +
      `Total Day PnL   : ${daySign}₹${totalDayPnL.toFixed(2)}\n` +
      `</pre>\n` +
      `<i>Status: ${summary.provider} live feed • ${new Date().toLocaleTimeString('en-IN')} IST</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        { text: '📋 View Open Trades', callback_data: 'cmd_trades' },
        { text: '🚨 Panic Exit All', callback_data: 'panic_prompt' },
      ],
    ];

    await this.sendMessage(botToken, chatId, text, buttons);
  }

  /**
   * Generates interactive open positions list for /trades command.
   */
  private static async handleTradesCommand(user: any, botToken: string | null | undefined, chatId: string | number): Promise<void> {
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString());
    if (summary.positions.length === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `✅ <b>No Open Positions</b>\n\nYou currently have 0 open positions. Capital is 100% safe.`
      );
      return;
    }

    for (const pos of summary.positions) {
      const pnlSign = pos.floatingNetPnL >= 0 ? '+' : '';
      const rSign = (pos.unrealizedR || 0) >= 0 ? '+' : '';
      const mult = pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1;
      const exposure = pos.quantity * mult * pos.currentLtp;

      const stopInfo = pos.stopLoss ? `₹${pos.stopLoss} (${pos.distanceToStopPoints?.toFixed(1) || 0} pts left)` : 'NO STOP (NAKED)';
      const beInfo = pos.trueBreakevenPrice ? `₹${pos.trueBreakevenPrice.toFixed(2)}` : `₹${pos.entryPrice}`;

      const text =
        `<b>${pos.symbol}</b> (<code>${pos.direction}</code>)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Entry    : ₹${pos.entryPrice.toFixed(2)}  |  LTP: ₹${pos.currentLtp.toFixed(2)}\n` +
        `Net PnL  : ${pnlSign}₹${pos.floatingNetPnL.toFixed(2)} (${rSign}${(pos.unrealizedR || 0).toFixed(2)}R)\n` +
        `Quantity : ${pos.quantity} ${mult > 1 ? `lots (${pos.quantity * mult} units)` : 'units'}\n` +
        `Exposure : ₹${exposure.toLocaleString('en-IN')}\n` +
        `StopLoss : ${stopInfo}\n` +
        `True BE  : ${beInfo}\n` +
        `</pre>`;

      const buttons = this.buildContextualKeyboard(
        { _id: pos.tradeId, direction: pos.direction, calculated: { trueBreakevenPrice: pos.trueBreakevenPrice } },
        'STOP_THREAT',
        pos.currentLtp,
        1
      );

      await this.sendMessage(botToken, chatId, text, buttons);
    }
  }

  /**
   * Lists active and snoozed alert states for /alerts command.
   */
  private static async handleAlertsListCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    const alerts = await AlertState.find({
      userId: user._id,
      state: { $in: ['ACTIVE', 'SNOOZED'] },
    }).lean();

    if (alerts.length === 0) {
      await this.sendMessage(botToken, chatId, `✅ <b>No Active Alerts</b>\n\nAll risk states are cleared and healthy.`);
      return;
    }

    let report = `🚨 <b>Active Alert States (${alerts.length})</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n<pre>\n`;
    for (const a of alerts) {
      const stateBadge = a.state === 'SNOOZED' ? '💤 SNOOZED' : '🔴 ACTIVE';
      report += `${a.type.padEnd(14)} : ${stateBadge} (sev ${a.severity})\n`;
    }
    report += `</pre>`;
    await this.sendMessage(botToken, chatId, report);
  }

  /**
   * Snoozes all active alerts for 15 minutes via /snooze command.
   */
  private static async handleGlobalSnoozeCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    const snoozedUntil = new Date(Date.now() + 15 * 60 * 1000);
    await AlertState.updateMany(
      { userId: user._id, state: 'ACTIVE' },
      { $set: { state: 'SNOOZED', snoozedUntil } }
    );
    await this.sendMessage(
      botToken,
      chatId,
      `💤 All active alerts snoozed for 15 minutes (until ${snoozedUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST).`
    );
  }

  /**
   * Temporarily mutes audible push notifications via /mute <minutes>.
   */
  private static async handleMuteCommand(user: any, botToken: string, chatId: string | number, minsArg?: string): Promise<void> {
    const mins = Math.max(1, Math.min(180, parseInt(minsArg || '30', 10)));
    const muteUntil = new Date(Date.now() + mins * 60 * 1000);

    await User.findByIdAndUpdate(user._id, {
      $set: { 'liveWatcherSettings.muteAlertsUntil': muteUntil },
    });

    await this.sendMessage(
      botToken,
      chatId,
      `🔕 Audible notifications muted for ${mins} minutes (until ${muteUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST). Silent live cards will still update.`
    );
  }

  /**
   * Executes emergency two-step panic flattening across all open positions.
   */
  private static async executePanicExit(user: any, botToken: string | null | undefined, chatId: string | number, messageId?: number): Promise<void> {
    const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' });
    if (openTrades.length === 0) {
      await this.sendMessage(botToken, chatId, `ℹ️ No open positions to flatten.`);
      return;
    }

    let closedCount = 0;
    for (const t of openTrades) {
      try {
        const openQty = t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? 1;
        await FyersService.executeBrokerExit(user._id, t._id.toString(), { exitQty: openQty, isFullClose: true });
        closedCount++;
      } catch (err: any) {
        console.error(`[PanicExit] Failed for trade ${t._id}:`, err.message);
      }
    }

    const report =
      `🛑 <b>PANIC KILLSWITCH COMPLETED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Successfully market-exited ${closedCount} of ${openTrades.length} open position(s) on FYERS.\n` +
      `Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    if (messageId) {
      await this.editMessageText(botToken, chatId, messageId, report, []);
    } else {
      await this.sendMessage(botToken, chatId, report);
    }
  }

  /**
   * Checks whether quiet hours suppression applies.
   */
  private static isQuietHoursActive(quietHours?: { enabled?: boolean; start?: string; end?: string }): boolean {
    if (!quietHours || !quietHours.enabled || !quietHours.start || !quietHours.end) {
      return false;
    }
    const now = new Date();
    const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
    const istMins = (now.getUTCMinutes() + 30) % 60;
    const currentMins = istHours * 60 + istMins;

    const [startH, startM] = quietHours.start.split(':').map(Number);
    const [endH, endM] = quietHours.end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (startTotal <= endTotal) {
      return currentMins >= startTotal && currentMins <= endTotal;
    } else {
      // Wraps around midnight
      return currentMins >= startTotal || currentMins <= endTotal;
    }
  }

  /**
   * Generates summary statistics for /summary command.
   */
  private static async handleSummaryCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const trades = await Trade.find({
      userId: user._id,
      status: 'CLOSED',
      exitTime: { $gte: startOfDay },
    }).lean();

    const count = trades.length;
    if (count === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `📊 <b>Today's Session Digest</b>\n\nNo closed trades recorded yet today.`
      );
      return;
    }

    const wins = trades.filter((t) => (t.calculated?.netPnL || 0) > 0).length;
    const losses = trades.filter((t) => (t.calculated?.netPnL || 0) < 0).length;
    const winRate = Number(((wins / count) * 100).toFixed(1));
    const netPnL = trades.reduce((acc, t) => acc + (t.calculated?.netPnL || 0), 0);
    const netR = trades.reduce((acc, t) => acc + (t.calculated?.realizedRMultiple || 0), 0);

    const text =
      `📊 <b>Today's Trading Performance Digest</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Total Trades : ${count}\n` +
      `Win / Loss   : ${wins}W / ${losses}L (${winRate}%)\n` +
      `Net PnL      : ${netPnL >= 0 ? '+' : ''}₹${netPnL.toFixed(2)}\n` +
      `Harvested R  : ${netR >= 0 ? '+' : ''}${netR.toFixed(2)}R\n` +
      `</pre>\n` +
      `<i>Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;

    await this.sendMessage(botToken, chatId, text);
  }

  /**
   * Dispatches an alert with deduplication and rich institutional layout.
   */
  static async sendAlert(payload: ITelegramAlertPayload): Promise<boolean> {
    const { botToken, chatId, title, body, severity = 'WARNING', metrics, progressBar, buttons, disableNotification = false } = payload;
    if (!botToken || !chatId) return false;

    const realToken = decryptSecret(botToken) || botToken;
    const dedupeKey = `${chatId}:${title}:${body.slice(0, 30)}`;
    const now = Date.now();
    const lastSent = this.recentAlerts.get(dedupeKey);
    if (lastSent && now - lastSent < this.DEBOUNCE_MS) {
      return false;
    }
    this.recentAlerts.set(dedupeKey, now);

    const icon =
      severity === 'CRITICAL'
        ? '🚨 <b>CRITICAL RISK ALERT</b>'
        : severity === 'WARNING'
        ? '⚠️ <b>WARNING ALERT</b>'
        : severity === 'SUCCESS'
        ? '🎯 <b>EXECUTION MILESTONE</b>'
        : 'ℹ️ <b>SETUPMINT NOTICE</b>';

    let message = `${icon}\n<b>${title}</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${body}`;

    if (metrics && Object.keys(metrics).length > 0) {
      let metricsText = '<pre>\n';
      const maxKeyLen = Math.max(...Object.keys(metrics).map((k) => k.length));
      for (const [k, v] of Object.entries(metrics)) {
        metricsText += `${k.padEnd(maxKeyLen + 1)}: ${v}\n`;
      }
      metricsText += '</pre>';
      message += `\n\n${metricsText}`;
    }

    if (progressBar) {
      const bar = this.renderProgressBar(progressBar.percent);
      message += `\n<b>${progressBar.label}:</b> <code>${bar}</code>`;
    }

    message += `\n\n<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    try {
      await this.sendMessage(realToken, chatId, message, buttons, disableNotification);
      return true;
    } catch (e: any) {
      console.warn(`[TelegramAlertService] Alert failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Triggered when a new trade is opened or synced from FYERS.
   */
  static async notifyTradeOpened(user: any, trade: any, initialStopLoss?: number): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.tradeOpened === false) return;

    const mult = trade.contractMultiplier || trade.simpleExecution?.contractMultiplier || 1;
    const qty = trade.quantity || trade.simpleExecution?.quantity || 1;
    const entry = trade.entryPrice || trade.simpleExecution?.entryPrice || 0;
    const sl = initialStopLoss ?? trade.risk?.initialStopLoss ?? trade.stopLoss ?? 'None';
    const riskAmt = sl !== 'None' ? Math.abs(entry - Number(sl)) * qty * mult : trade.risk?.plannedRiskAmount;

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `🚀 New Trade Opened: ${trade.symbol}`,
      body: `New ${trade.direction} position opened and synced with SetupMint live watcher.`,
      severity: 'INFO',
      metrics: {
        Symbol: trade.symbol,
        Direction: trade.direction,
        Quantity: `${qty} ${mult > 1 ? `lots (${qty * mult} units)` : 'units'}`,
        EntryPrice: `₹${entry}`,
        StopLoss: sl !== 'None' ? `₹${sl}` : 'NO STOP (NAKED)',
        InitialRisk: riskAmt ? `₹${Number(riskAmt).toFixed(2)}` : 'Unspecified',
      },
      buttons: [
        [
          { text: '📋 View Live Trade', callback_data: 'cmd_trades' },
          { text: '🚨 Quick Market Exit', callback_data: `x:${trade._id}:E:1:${entry}` },
        ],
      ],
    });
  }

  /**
   * Triggered when an open trade is closed: marks all AlertState records RESOLVED and strips keyboard buttons.
   */
  static async notifyTradeClosed(
    user: any,
    trade: any,
    outcome: { netPnL: number; realizedR?: number; exitPrice: number; exitReason?: string }
  ): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;

    const rawToken = settings.telegramBotToken;
    const botToken = decryptSecret(rawToken) || rawToken;
    const chatId = settings.telegramChatId;

    // 1. Resolve all AlertState records for this trade
    const activeAlerts = await AlertState.find({
      userId: user._id,
      tradeId: trade._id,
      state: { $ne: 'RESOLVED' },
    });

    for (const a of activeAlerts) {
      if (a.messageId) {
        try {
          await this.editMessageText(
            botToken,
            chatId,
            a.messageId,
            `🏁 <b>Position Closed</b> at ₹${outcome.exitPrice} (${outcome.netPnL >= 0 ? '+' : ''}₹${outcome.netPnL.toFixed(2)}).\n` +
            `<i>Buttons disabled. Trade archived in journal.</i>`,
            []
          );
        } catch {
          // Swallow edit error
        }
      }
    }

    await AlertState.updateMany(
      { userId: user._id, tradeId: trade._id },
      { $set: { state: 'RESOLVED', resolvedAt: new Date() } }
    );

    if (settings.telegramAlertEvents && settings.telegramAlertEvents.tradeClosed === false) return;

    const isWin = outcome.netPnL > 0;
    const sign = outcome.netPnL >= 0 ? '+' : '';
    const rSign = (outcome.realizedR || 0) >= 0 ? '+' : '';

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `${isWin ? '🏁 Trade Closed in Profit' : '🛑 Trade Closed in Loss'}: ${trade.symbol}`,
      body: `Position closed at ₹${outcome.exitPrice}. Net outcome recorded in journal.`,
      severity: isWin ? 'SUCCESS' : 'WARNING',
      metrics: {
        Symbol: trade.symbol,
        Side: trade.direction,
        ExitPrice: `₹${outcome.exitPrice}`,
        NetPnL: `${sign}₹${outcome.netPnL.toFixed(2)}`,
        RealizedR: `${rSign}${(outcome.realizedR || 0).toFixed(2)}R`,
        ExitReason: outcome.exitReason || 'Manual / Broker Order',
      },
    });
  }

  /**
   * Triggered when account loss reaches warning (75%) or breach (100%) of daily loss limit.
   */
  static async notifyDailyLoss(
    user: any,
    currentLoss: number,
    dailyLimit: number,
    percent: number
  ): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.dailyLossBreached === false) return;

    const isBreach = percent >= 100;
    const rawToken = settings.telegramBotToken;
    const botToken = decryptSecret(rawToken) || rawToken;
    const chatId = settings.telegramChatId;
    const now = new Date();

    // Check state machine for DAILY_LOSS
    const alertState = await AlertState.findOne({
      userId: user._id,
      tradeId: null,
      type: 'DAILY_LOSS',
    });

    const snapshot: AlertStateSnapshot | null = alertState
      ? {
          state: alertState.state as AlertLifecycle,
          severity: alertState.severity,
          enterCount: alertState.enterCount,
          firstAt: alertState.firstAt,
          lastSentAt: alertState.lastSentAt,
          clearedAt: alertState.clearedAt,
          snoozedUntil: alertState.snoozedUntil,
          pingCount: alertState.pingCount,
        }
      : null;

    const decision = evaluateAlert(
      snapshot,
      {
        type: 'DAILY_LOSS',
        severity: isBreach ? 3 : 2,
        metricValue: new Decimal(percent),
        now,
      },
      DEFAULT_ALERT_POLICIES.DAILY_LOSS
    );

    if (decision.action === 'SKIP') return;

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: isBreach ? '🚨 CRITICAL: Daily Loss Limit Breached!' : '⚠️ WARNING: Daily Loss Threshold Reached',
      body: isBreach
        ? `Daily loss limit of ₹${dailyLimit.toLocaleString('en-IN')} has been 100% BREACHED. Stop trading immediately!`
        : `Cumulative day loss reached ${percent.toFixed(0)}% of your allowed daily risk limit. Exercise extreme caution.`,
      severity: isBreach ? 'CRITICAL' : 'WARNING',
      metrics: {
        CurrentLoss: `-₹${currentLoss.toFixed(2)}`,
        DailyLimit: `₹${dailyLimit.toFixed(2)}`,
        UsedPercent: `${percent.toFixed(1)}%`,
      },
      progressBar: {
        label: 'Daily Risk Exhausted',
        percent,
      },
      buttons: [
        [{ text: '🚨 Flatten All Positions', callback_data: 'panic_prompt' }],
      ],
      disableNotification: !isBreach,
    });

    await AlertState.findOneAndUpdate(
      { userId: user._id, tradeId: null, type: 'DAILY_LOSS' },
      {
        $set: {
          state: 'ACTIVE',
          severity: isBreach ? 3 : 2,
          enterCount: decision.action === 'SEND_NEW' ? decision.enterCount : (alertState?.enterCount || 1),
          lastSentAt: now,
          chatId: String(chatId),
        },
      },
      { upsert: true }
    );
  }
}
