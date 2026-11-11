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
import path from 'node:path';
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
  TradingAccount,
  Attachment,
  AlertState,
  AlertEvent,
  TelegramUpdateAudit,
  TelegramCallbackLock,
} from '../db/models/index.js';
import { getStorage } from '../storage/index.js';
import { config } from '../config.js';
import { decryptSecret, safeDecryptSecret } from './crypto.service.js';
import { FyersService } from './fyers.service.js';
import { Mt5CommandService } from './mt5-command.service.js';
import { LiveWatcherService } from './live-watcher.service.js';
import { AccountScopeService } from './account-scope.service.js';
import { ChartGeneratorService } from './chart-generator.service.js';
import { MarketDataService } from './market-data/index.js';
import { EconomicCalendarService, IEconomicCalendarEvent } from './economic-calendar.service.js';
import { ITradeCandle } from '@tradevault/shared';
import sharp from 'sharp';

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
  private static spreadWarningTimestamps = new Map<string, number>();

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
   * Deterministic Currency Symbol resolver for trade alerts ($ for USD/FOREX/Metals/Prop, ₹ for INR).
   */
  static getTradeCurrencySymbol(trade: any): string {
    if (!trade) return '$';
    const c = (trade.currency || (trade.accountId as any)?.baseCurrency || '').toUpperCase();
    if (c === 'INR') return '₹';
    if (c === 'EUR') return '€';
    if (c === 'GBP') return '£';
    if (c === 'JPY') return '¥';
    if (c === 'USD') return '$';
    const isForex =
      trade.exchange === 'FOREX' ||
      (trade.symbol &&
        (trade.symbol.includes('XAU') ||
          trade.symbol.includes('EUR') ||
          trade.symbol.includes('USD') ||
          trade.symbol.includes('GBP') ||
          trade.symbol.includes('BTC'))) ||
      (Array.isArray(trade.tags) && (trade.tags.includes('ELEFIN') || trade.tags.includes('MT5')));
    return isForex ? '$' : (c || '$');
  }

  /**
   * Tests connection to Telegram bot and chat ID.
   */
  static async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      let realToken: string;
      try {
        realToken = decryptSecret(botToken) || botToken;
      } catch (e: any) {
        return {
          success: false,
          message: 'Unable to decrypt Telegram Bot Token (encryption key mismatch). Please re-enter your Bot Token in Settings and save.',
        };
      }
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
      let realToken: string;
      try {
        realToken = decryptSecret(botToken) || botToken;
      } catch (e: any) {
        return {
          success: false,
          message: 'Unable to decrypt Telegram Bot Token (encryption key mismatch). Please re-enter your Bot Token in Settings and save.',
        };
      }
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
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
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
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
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
        // If the original message was a photo, edit caption instead!
        if (json.description && json.description.includes('there is no text in the message to edit')) {
          return await this.editMessageCaption(botToken, chatId, messageId, text, buttons);
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
   * Low-level Telegram sendPhoto API caller supporting multipart/form-data with inline keyboard & caption.
   */
  static async sendPhoto(
    botToken: string | null | undefined,
    chatId: string | number,
    photoBuffer: Buffer,
    caption?: string,
    buttons?: ITelegramInlineButton[][],
    disableNotification: boolean = false
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/sendPhoto`;

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('photo', new Blob([new Uint8Array(photoBuffer)], { type: 'image/png' }), 'live_chart.png');
    if (caption) {
      formData.append('caption', caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption);
      formData.append('parse_mode', 'HTML');
    }
    if (disableNotification) {
      formData.append('disable_notification', 'true');
    }
    if (buttons && buttons.length > 0) {
      formData.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(json.description || 'Telegram sendPhoto returned an error');
    }
    return json.result;
  }

  /**
   * Edits the caption of an existing photo/media message in Telegram.
   */
  static async editMessageCaption(
    botToken: string | null | undefined,
    chatId: string | number,
    messageId: number,
    caption: string,
    buttons?: ITelegramInlineButton[][]
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/editMessageCaption`;
    const payload: any = {
      chat_id: chatId,
      message_id: messageId,
      caption: caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption,
      parse_mode: 'HTML',
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
        if (json.description && json.description.includes('message is not modified')) {
          return null;
        }
        console.warn(`[TelegramAlertService] editMessageCaption notice:`, json.description);
      }
      return json.result;
    } catch (err: any) {
      console.warn(`[TelegramAlertService] editMessageCaption network error:`, err.message);
      return null;
    }
  }

  /**
   * Replaces the photo and caption of an existing Telegram photo message in-place.
   */
  static async editMessageMedia(
    botToken: string | null | undefined,
    chatId: string | number,
    messageId: number,
    photoBuffer: Buffer,
    caption?: string,
    buttons?: ITelegramInlineButton[][]
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/editMessageMedia`;

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('message_id', String(messageId));
    formData.append(
      'media',
      JSON.stringify({
        type: 'photo',
        media: 'attach://photo',
        caption: caption ? (caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption) : undefined,
        parse_mode: 'HTML',
      })
    );
    formData.append('photo', new Blob([new Uint8Array(photoBuffer)], { type: 'image/png' }), 'live_chart.png');
    if (buttons && buttons.length > 0) {
      formData.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    const json = (await res.json()) as any;
    if (!json.ok) {
      throw new Error(json.description || 'editMessageMedia failed');
    }
    return json.result;
  }

  /**
   * Generates a high-fidelity candlestick PNG chart for an open trade or position.
   * Defaults to 5m (or user setting), with fallback to synthetic micro-candles if broker candles are unavailable.
   */
  static async generatePositionChart(
    user: any,
    tradeOrPos: any,
    resolution: string = '5'
  ): Promise<Buffer | null> {
    try {
      const tradeId = tradeOrPos._id || tradeOrPos.tradeId;
      let tradeDoc: any = null;
      if (tradeId && mongoose.Types.ObjectId.isValid(tradeId)) {
        tradeDoc = await Trade.findById(tradeId).lean();
      }
      if (!tradeDoc) {
        tradeDoc = { ...tradeOrPos, _id: tradeId || new mongoose.Types.ObjectId() };
      }

      // Merge realtime properties if passed from LiveWatcher position
      if (tradeOrPos.currentLtp !== undefined) {
        tradeDoc.currentLtp = tradeOrPos.currentLtp;
      }
      if (tradeOrPos.floatingNetPnL !== undefined) {
        tradeDoc.floatingNetPnL = tradeOrPos.floatingNetPnL;
        if (!tradeDoc.calculated) tradeDoc.calculated = {};
        tradeDoc.calculated.floatingNetPnL = tradeOrPos.floatingNetPnL;
      }
      if (tradeOrPos.unrealizedR !== undefined) {
        if (!tradeDoc.calculated) tradeDoc.calculated = {};
        tradeDoc.calculated.unrealizedR = tradeOrPos.unrealizedR;
      }
      if (tradeOrPos.stopLoss !== undefined) {
        if (!tradeDoc.risk) tradeDoc.risk = {};
        tradeDoc.risk.currentStopLoss = tradeOrPos.stopLoss;
      }

      const cleanRes = resolution === '60' || resolution === '1h'
        ? '60'
        : resolution === 'D' || resolution === '1D'
        ? 'D'
        : resolution.replace('m', '');

      const to = new Date();
      const nowMs = to.getTime();
      let lookbackMs = 8 * 60 * 60 * 1000; // 8 hours default for 5m

      switch (cleanRes) {
        case '1':
          lookbackMs = 2 * 60 * 60 * 1000;
          break;
        case '3':
          lookbackMs = 4 * 60 * 60 * 1000;
          break;
        case '5':
          lookbackMs = 8 * 60 * 60 * 1000;
          break;
        case '15':
          lookbackMs = 24 * 60 * 60 * 1000;
          break;
        case '30':
          lookbackMs = 3 * 24 * 60 * 60 * 1000;
          break;
        case '60':
          lookbackMs = 7 * 24 * 60 * 60 * 1000;
          break;
        case 'D':
          lookbackMs = 60 * 24 * 60 * 60 * 1000;
          break;
      }

      const entryMs = tradeDoc.entryTime ? new Date(tradeDoc.entryTime).getTime() : nowMs - 3600 * 1000;
      const fromMs = Math.min(nowMs - lookbackMs, entryMs - Math.floor(lookbackMs / 2));
      const from = new Date(fromMs);

      let candles: ITradeCandle[] = [];
      let providerName: any = 'FYERS';
      let isUnderlyingFallback = false;

      try {
        const res = await MarketDataService.getCandlesWithFallback({
          trade: tradeDoc,
          resolution: cleanRes,
          from,
          to,
          userId: user._id,
          forceRefetch: true,
        });
        if (res.ok && res.candles && res.candles.length > 0) {
          candles = [...res.candles];
          providerName = res.provider;
          isUnderlyingFallback = Boolean(res.isUnderlyingFallback);
        }
      } catch (marketErr: any) {
        console.warn('[TelegramAlertService] getCandlesWithFallback error:', marketErr.message);
      }

      const currentLtp = Number(
        tradeDoc.currentLtp ?? tradeOrPos.currentLtp ?? tradeDoc.entryPrice ?? tradeOrPos.entryPrice ?? 100
      );
      const entryPrice = Number(
        tradeDoc.simpleExecution?.entryPrice ?? tradeDoc.entryPrice ?? tradeOrPos.entryPrice ?? currentLtp
      );

      // Check candle scale against trade's actual price level
      const refPrice = currentLtp > 0 ? currentLtp : entryPrice;
      if (candles.length > 0 && refPrice > 0) {
        const sample = candles.slice(-20);
        const avgC = sample.reduce((sum, c) => sum + c.c, 0) / sample.length;
        const ratio = avgC / refPrice;
        if (ratio < 0.4 || ratio > 2.5) {
          console.warn(`[TelegramAlertService] Candle price scale mismatch: avg=${avgC.toFixed(2)}, ref=${refPrice.toFixed(2)}. Rejecting candles and using realistic synthetic micro-candles.`);
          candles = [];
        }
      }

      // If no candles found from broker, synthesize realistic micro-candles from entry to current LTP
      if (candles.length === 0) {
        const candleCount = 28;
        const spanMs = Math.max(30 * 60 * 1000, to.getTime() - from.getTime());
        const stepMs = Math.floor(spanMs / candleCount);
        const priceDiff = currentLtp - entryPrice;
        const baseVol = Math.max(Math.abs(priceDiff) * 0.4, currentLtp * 0.003);
        let runningPrice = entryPrice;

        candles = [];
        for (let i = 0; i < candleCount; i++) {
          const cTime = from.getTime() + i * stepMs;
          const progress = i / (candleCount - 1);
          const noise = (Math.sin(i * 0.9) * 0.5 + Math.sin(i * 2.1) * 0.3) * baseVol;
          const open = runningPrice;
          const close = i === candleCount - 1 ? currentLtp : entryPrice + priceDiff * progress + noise;
          const wick = baseVol * (0.2 + Math.abs(Math.sin(i * 1.7)) * 0.3);
          const high = Math.max(open, close) + wick;
          const low = Math.min(open, close) - wick;
          runningPrice = close;

          candles.push({
            t: Math.floor(cTime / 1000),
            o: Number(open.toFixed(2)),
            h: Number(high.toFixed(2)),
            l: Number(low.toFixed(2)),
            c: Number(close.toFixed(2)),
            v: Math.floor(100 + Math.random() * 400),
          });
        }
      } else if (currentLtp > 0) {
        // Ensure latest candle aligns with current LTP
        const lastCandle = candles[candles.length - 1];
        lastCandle.c = currentLtp;
        if (currentLtp > lastCandle.h) lastCandle.h = currentLtp;
        if (currentLtp < lastCandle.l) lastCandle.l = currentLtp;
      }

      const svg = ChartGeneratorService.generateChartSvg(candles, tradeDoc, {
        resolution: cleanRes,
        timeframe: cleanRes === 'D' ? '1D' : `${cleanRes}m`,
        currentLtp,
        provider: providerName,
        isUnderlyingFallback,
      });

      const pngBuffer = await sharp(Buffer.from(svg))
        .png({ quality: 90 })
        .toBuffer();

      return pngBuffer;
    } catch (err: any) {
      console.error('[TelegramAlertService] generatePositionChart error:', err);
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
      const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
      if (!realToken) return;
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
    const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
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
    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
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
      unrealizedR: trade.calculated?.unrealizedR || 0,
      currency: trade.currency,
      currencySymbol: sym,
      tickSize: trade.tickSize,
    });

    const isAudible = policy.audible && (alertInput.severity >= 2 || alertInput.type === 'NAKED_POSITION');
    const attachChart = user.liveWatcherSettings?.telegramAttachLiveChart !== false;
    const defaultTf = user.liveWatcherSettings?.telegramChartTimeframe || '5';
    const buttons = this.buildContextualKeyboard(
      trade,
      alertInput.type,
      alertInput.ltp,
      cardVersion,
      decision.action === 'CLEAR',
      attachChart
    );

    // 5. Execute Decision Actions
    if (decision.action === 'CLEAR') {
      // Condition recovered past clear threshold: edit card to show recovery
      if (alertState && alertState.messageId) {
        const clearedText =
          `✅ <b>CONDITION RECOVERED · ${trade.symbol}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Risk condition (${alertInput.type}) has stabilized back within safety margins.\n\n` +
          `Current LTP: ${sym}${alertInput.ltp.toFixed(2)} • Time: ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        try {
          await this.editMessageCaption(botToken, chatId, alertState.messageId, clearedText, [
            [{ text: '🔄 Refresh Terminal', callback_data: `x:${trade._id}:REF:${cardVersion}:${alertInput.ltp}` }],
          ]);
        } catch {
          await this.editMessageText(botToken, chatId, alertState.messageId, clearedText, [
            [{ text: '🔄 Refresh Terminal', callback_data: `x:${trade._id}:REF:${cardVersion}:${alertInput.ltp}` }],
          ]);
        }
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
          try {
            await this.editMessageCaption(botToken, chatId, alertState.messageId, context.cardText, buttons);
          } catch {
            await this.editMessageText(botToken, chatId, alertState.messageId, context.cardText, buttons);
          }
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
          await this.editMessageCaption(
            botToken,
            chatId,
            alertState.messageId,
            `↪ <i>Superseded by updated alert below</i>`,
            []
          );
        } catch {
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
      }

      // Send new audible Telegram alert (with live chart photo if enabled)
      let sentMsg: any = null;
      if (attachChart) {
        try {
          const photoBuf = await this.generatePositionChart(user, trade, defaultTf);
          if (photoBuf) {
            sentMsg = await this.sendPhoto(botToken, chatId, photoBuf, context.cardText, buttons, !isAudible);
          }
        } catch (photoErr: any) {
          console.warn('[TelegramAlertService] sendPhoto failed in dispatchRiskAlert, falling back to sendMessage:', photoErr.message);
        }
      }
      if (!sentMsg) {
        sentMsg = await this.sendMessage(botToken, chatId, context.cardText, buttons, !isAudible);
      }
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
    isCleared: boolean = false,
    includeTimeframes: boolean = false
  ): ITelegramInlineButton[][] {
    const tradeId = trade._id.toString();
    const roundLtp = Number(ltp.toFixed(2));

    if (isCleared) {
      return [
        [{ text: '🔄 Refresh Terminal', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` }],
      ];
    }

    const tfRow: ITelegramInlineButton[] = [
      { text: '⏱️ 1m', callback_data: `x:${tradeId}:CHART_1:${cardVersion}:${roundLtp}` },
      { text: '⏱️ 5m', callback_data: `x:${tradeId}:CHART_5:${cardVersion}:${roundLtp}` },
      { text: '⏱️ 15m', callback_data: `x:${tradeId}:CHART_15:${cardVersion}:${roundLtp}` },
      { text: '⏱️ 1h', callback_data: `x:${tradeId}:CHART_60:${cardVersion}:${roundLtp}` },
    ];

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

    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);

    const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
    const pipDiv = isGold ? 0.10 : (trade.exchange === 'FOREX' ? 0.0001 : 1.0);
    const pipsInProfit = entryPrice > 0
      ? (isLong ? (ltp - entryPrice) / pipDiv : (entryPrice - ltp) / pipDiv)
      : 0;

    // Stepped Pip Trailing buttons (🔒 +10p, 🔒 +20p, 🔒 +30p)
    const trailButtons: ITelegramInlineButton[] = [];
    if (pipsInProfit >= 10) {
      trailButtons.push({ text: '🔒 +10p', callback_data: `x:${tradeId}:T10:${cardVersion}:${roundLtp}` });
    }
    if (pipsInProfit >= 20) {
      trailButtons.push({ text: '🔒 +20p', callback_data: `x:${tradeId}:T20:${cardVersion}:${roundLtp}` });
    }
    if (pipsInProfit >= 30) {
      trailButtons.push({ text: '🔒 +30p', callback_data: `x:${tradeId}:T30:${cardVersion}:${roundLtp}` });
    }

    // Fractional scale-outs (🎯 25%, 🎯 50%, 🎯 75%)
    const partialScaleRow: ITelegramInlineButton[] = [
      { text: '🎯 25%', callback_data: `x:${tradeId}:B25:${cardVersion}:${roundLtp}` },
      { text: '🎯 50%', callback_data: `x:${tradeId}:B50:${cardVersion}:${roundLtp}` },
      { text: '🎯 75%', callback_data: `x:${tradeId}:B75:${cardVersion}:${roundLtp}` },
    ];

    if (type === 'STOP_THREAT') {
      const row1: ITelegramInlineButton[] = [
        { text: `🚨 Exit @~${sym}${roundLtp}`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
      ];
      // Lock BE ONLY if LTP is on the profitable side of true breakeven
      if (isProfitableSideOfBe) {
        row1.push({ text: '🛡️ Lock BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` });
      }
      return [
        row1,
        ...(trailButtons.length > 0 ? [trailButtons] : []),
        ...(includeTimeframes ? [tfRow] : []),
        [
          { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
          { text: '🔄 Refresh', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
        ],
      ];
    }

    if (type === 'GIVEBACK') {
      const row2: ITelegramInlineButton[] = [
        { text: '🛡️ Trail to BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` },
        { text: `🚨 Exit @~${sym}${roundLtp}`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
      ];
      return [
        partialScaleRow,
        ...(trailButtons.length > 0 ? [trailButtons] : []),
        row2,
        ...(includeTimeframes ? [tfRow] : []),
        [
          { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
          { text: '🔄 Refresh', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
        ],
      ];
    }

    if (type === 'LADDER') {
      return [
        [
          { text: '🎯 Scale Out T1', callback_data: `x:${tradeId}:L1:${cardVersion}:${roundLtp}` },
          { text: '🛡️ Lock True BE', callback_data: `x:${tradeId}:BE:${cardVersion}:${roundLtp}` },
        ],
        partialScaleRow,
        ...(trailButtons.length > 0 ? [trailButtons] : []),
        ...(includeTimeframes ? [tfRow] : []),
        [
          { text: `🚨 Market Exit`, callback_data: `x:${tradeId}:E:${cardVersion}:${roundLtp}` },
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
        ...(includeTimeframes ? [tfRow] : []),
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
      partialScaleRow,
      ...(trailButtons.length > 0 ? [trailButtons] : []),
      ...(includeTimeframes ? [tfRow] : []),
      [
        { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
        { text: '🔄 Refresh', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
      ],
    ];
  }

  /**
   * Handles incoming Webhook or Long-Polling updates from Telegram (button clicks and commands).
   */
  static async processWebhookUpdate(update: any, knownBotToken?: string): Promise<void> {
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
      await this.handleCallbackQuery(update.callback_query, knownBotToken);
      return;
    }

    // 2. Handle Text Commands (message)
    if (update.message?.text) {
      await this.handleTextMessage(update.message, knownBotToken);
      return;
    }

    // 3. Handle Voice & Audio Reflections (voice note / audio)
    if (update.message?.voice || update.message?.audio) {
      await this.handleVoiceMessage(update.message, knownBotToken);
      return;
    }
  }

  /**
   * Handles button callback queries with full idempotency, cardVersion matching, and slippage guard.
   */
  private static async handleCallbackQuery(cq: any, knownBotToken?: string): Promise<void> {
    const chatId = cq.message?.chat?.id || cq.from?.id;
    const fromId = cq.from?.id;
    const data: string = cq.data || '';
    const messageId = cq.message?.message_id;

    // a. Resolve user from chatId or fromId
    let user = await User.findOne({
      $or: [
        { 'liveWatcherSettings.telegramChatId': String(chatId) },
        ...(fromId ? [{ 'liveWatcherSettings.telegramChatId': String(fromId) }] : []),
      ],
    });

    // If still not resolved but knownBotToken was provided, find user by bot token
    let botToken: string | undefined = knownBotToken;
    if (!user && knownBotToken) {
      const allUsers = await User.find({
        'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
      });
      for (const u of allUsers) {
        const uToken = safeDecryptSecret(u.liveWatcherSettings?.telegramBotToken);
        if (uToken && uToken === knownBotToken) {
          user = u;
          if (u.liveWatcherSettings && !u.liveWatcherSettings.telegramChatId && chatId) {
            u.liveWatcherSettings.telegramChatId = String(chatId);
            u.liveWatcherSettings.telegramAlertsEnabled = true;
            await u.save();
          }
          break;
        }
      }
    }

    if (!botToken && user) {
      const rawToken = user?.liveWatcherSettings?.telegramBotToken;
      botToken = rawToken ? (safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? undefined : rawToken)) : undefined;
    }

    if (!user) {
      if (botToken) {
        await this.answerCallbackQuery(
          botToken,
          cq.id,
          '⚠️ Chat not linked. Click "Save Execution Settings" in SetupMint to activate.',
          true
        );
      }
      return;
    }

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
    if (data === 'cmd_risk') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading Prop Firm Risk Radar...');
      await this.handleRiskCommand(user, botToken, chatId);
      return;
    }
    if (data === 'cmd_summary') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading Performance Summary...');
      if (botToken) await this.handleSummaryCommand(user, botToken, chatId);
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
    if (data === 'chart_xauusd') {
      await this.answerCallbackQuery(botToken, cq.id, '⏱️ Checking XAUUSD chart...');
      await this.handleChartCommand(user, botToken, chatId, ['XAUUSD', '5']);
      return;
    }
    if (data === 'show_trades') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading open trades...');
      await this.handleTradesCommand(user, botToken, chatId);
      return;
    }
    if (data === 'snooze_news_60') {
      await this.answerCallbackQuery(botToken, cq.id, '🔕 News alerts muted for 60m', true);
      if (botToken) await this.handleMuteCommand(user, botToken, chatId, '60');
      return;
    }
    if (data === 'ack_news') {
      await this.answerCallbackQuery(botToken, cq.id, '✅ Acknowledged! Trade safe.', true);
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

    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);

    // Fast-path: Handle dynamic timeframe switching on live chart snapshot cards
    if (actionCode.startsWith('CHART_')) {
      const tf = actionCode.replace('CHART_', '');
      const tfLabel = tf === '60' ? '1h' : tf === 'D' ? '1D' : `${tf}m`;
      await this.answerCallbackQuery(botToken, cq.id, `⏱️ Generating ${tfLabel} live chart...`);

      try {
        const photoBuf = await this.generatePositionChart(user, trade, tf);
        if (photoBuf) {
          const tAny = trade as any;
          const isForex = trade.exchange === 'FOREX' || (trade.symbol && trade.symbol.includes('XAU'));
          const sym = isForex ? '$' : '₹';
          const pnlVal = Number(tAny.calculated?.floatingNetPnL ?? tAny.floatingNetPnL ?? tAny.calculated?.netPnL ?? 0);
          const pnlSign = pnlVal >= 0 ? '+' : '';
          const ltpVal = renderLtp > 0 ? renderLtp : (tAny.currentLtp || tAny.simpleExecution?.entryPrice || 0);
          const entryVal = Number(tAny.simpleExecution?.entryPrice ?? tAny.calculated?.averageEntryPrice ?? tAny.entryPrice ?? 0);

          const caption =
            `📊 <b>${trade.symbol}</b> (<code>${trade.direction}</code>) — <b>${tfLabel} Snapshot</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `<pre>\n` +
            `Entry    : ${sym}${entryVal.toFixed(2)}  |  LTP: ${sym}${ltpVal.toFixed(2)}\n` +
            `Net PnL  : ${pnlSign}${sym}${pnlVal.toFixed(2)}\n` +
            `StopLoss : ${trade.risk?.currentStopLoss || trade.risk?.initialStopLoss ? `${sym}${trade.risk?.currentStopLoss || trade.risk?.initialStopLoss}` : 'NONE'}\n` +
            `Target   : ${trade.risk?.plannedTarget ? `${sym}${trade.risk?.plannedTarget}` : 'OPEN'}\n` +
            `</pre>`;

          const newButtons = this.buildContextualKeyboard(
            trade,
            'STOP_THREAT',
            ltpVal,
            cardVersion,
            false,
            true // includeTimeframes
          );

          let updated = false;
          if (messageId) {
            try {
              await this.editMessageMedia(botToken, chatId, messageId, photoBuf, caption, newButtons);
              updated = true;
            } catch (mediaErr: any) {
              console.warn('[TelegramAlertService] editMessageMedia notice:', mediaErr.message);
            }
          }
          if (!updated) {
            await this.sendPhoto(botToken, chatId, photoBuf, caption, newButtons);
          }
        }
      } catch (err: any) {
        console.error('[TelegramAlertService] Error generating timeframe chart:', err);
        await this.answerCallbackQuery(botToken, cq.id, '❌ Failed to generate chart snapshot.', true);
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
        (actionCode === 'E' || actionCode === 'B25' || actionCode === 'B50' || actionCode === 'B75') &&
        renderLtp > 0 &&
        currentLtp > 0
      ) {
        const slippage = Math.abs(currentLtp - renderLtp) / renderLtp * 100;
        if (slippage > slippageGuardPct) {
          // Trigger slippage confirmation step
          const confirmAction = actionCode === 'E' ? 'CONF_E' : `CONF_${actionCode}`;
          const confirmText =
            (cq.message?.text || '') +
            `\n\n⚠️ <b>SLIPPAGE WARNING:</b> Price moved from ${sym}${renderLtp} to ${sym}${currentLtp} (${slippage.toFixed(2)}% > guard ${slippageGuardPct}%). Confirm execution?`;

          await this.editMessageText(botToken, chatId, messageId, confirmText, [
            [
              { text: `⚠️ Confirm Execution @ ${sym}${currentLtp}`, callback_data: `x:${tradeId}:${confirmAction}:${cardVersion}:${currentLtp}` },
              { text: `❌ Cancel`, callback_data: `x:${tradeId}:REF:${cardVersion}:${currentLtp}` },
            ],
          ]);
          return;
        }
      }

      const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const isMt5 = Mt5CommandService.isMt5Trade(trade, account);
      const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;

      // f. Execute Action
      if (actionCode === 'E' || actionCode === 'CONF_E') {
        const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
        let res: any = { executedOnBroker: false, tradedPrice: currentLtp };

        if (isMt5 && ticket) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId: (account?._id || trade.accountId)!,
            tradeId: trade._id,
            ticket,
            volume: openQty,
          });
          res = { executedOnBroker: true, tradedPrice: currentLtp, message: `Dispatched to MT5 Bridge (Ticket #${ticket})` };
        } else {
          res = await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
            exitQty: openQty,
            isFullClose: true,
          });
        }

        const brokerLabel = isMt5 ? 'MT5 / ELEFIN BRIDGE' : 'FYERS';
        const statusLabel = isMt5 ? `SENT TO MT5 BRIDGE (#${ticket})` : (res.executedOnBroker ? 'FILLED ON EXCHANGE' : 'SIMULATED');
        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[✅ EXECUTED MARKET EXIT ON ${brokerLabel}]</b>\n` +
          `Order Status: ${statusLabel}\n` +
          `Traded Price: ${sym}${res.tradedPrice || currentLtp} • Time: ${new Date().toLocaleTimeString('en-IN')} IST`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        trade.auditLog.push({
          action: 'TELEGRAM_EXIT',
          timestamp: new Date(),
          details: { text: `Market exit via Telegram button. Traded Price: ${sym}${res.tradedPrice || currentLtp}` },
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
        if (isMt5 && ticket) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId: (account?._id || trade.accountId)!,
            tradeId: trade._id,
            ticket,
            stopLoss: trueBePrice,
          });
          brokerResult = { executedOnBroker: true, message: `Dispatched to MT5 Bridge (Ticket #${ticket})` };
        } else {
          try {
            brokerResult = await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), trueBePrice);
          } catch {
            // Broker stop placement fallback
          }
        }

        trade.auditLog.push({
          action: 'TELEGRAM_LOCK_BE',
          timestamp: new Date(),
          details: { text: `Stop moved to true breakeven ${sym}${trueBePrice} via Telegram button` },
          changedBy: 'telegram',
        });
        await trade.save();

        const brokerStatus = isMt5 ? 'DISPATCHED TO MT5 BRIDGE' : (brokerResult.executedOnBroker ? 'UPDATED ON BROKER' : 'STORED');
        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🛡️ STOP LOCKED AT TRUE BREAKEVEN]</b>\n` +
          `SL Level: ${sym}${trueBePrice.toFixed(2)} • Status: ${brokerStatus}`;

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

      // Stepped Pip Trailing for Gold & FX
      if (actionCode === 'T10' || actionCode === 'T20' || actionCode === 'T30') {
        const pips = actionCode === 'T10' ? 10 : actionCode === 'T20' ? 20 : 30;
        const isLong = trade.direction === 'LONG';
        const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? (trade as any).entryPrice ?? 0);
        const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
        const pipValue = isGold ? 0.10 : (trade.exchange === 'FOREX' ? 0.0001 : 1.0);
        const targetSl = Number((isLong ? entryPrice + (pips * pipValue) : entryPrice - (pips * pipValue)).toFixed(2));

        if (isLong && currentLtp > 0 && targetSl >= currentLtp) {
          await this.answerCallbackQuery(botToken, cq.id, `Cannot trail SL (${sym}${targetSl}) above market (${sym}${currentLtp})`, true);
          return;
        }
        if (!isLong && currentLtp > 0 && targetSl <= currentLtp) {
          await this.answerCallbackQuery(botToken, cq.id, `Cannot trail SL (${sym}${targetSl}) below market (${sym}${currentLtp})`, true);
          return;
        }

        trade.risk = {
          ...(trade.risk || {}),
          initialStopLoss: trade.risk?.initialStopLoss || targetSl,
          currentStopLoss: targetSl,
        };

        let brokerStatus = 'STORED';
        if (isMt5 && ticket) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId: (account?._id || trade.accountId)!,
            tradeId: trade._id,
            ticket,
            stopLoss: targetSl,
          });
          brokerStatus = `DISPATCHED TO MT5 (#${ticket})`;
        } else {
          try {
            const fyersRes = await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), targetSl);
            brokerStatus = fyersRes.executedOnBroker ? 'UPDATED ON BROKER' : 'STORED';
          } catch {
            brokerStatus = 'STORED';
          }
        }

        trade.auditLog.push({
          action: `TELEGRAM_TRAIL_${pips}P`,
          timestamp: new Date(),
          details: { text: `Trailed Stop Loss to +${pips} pips (${sym}${targetSl}) via Telegram button` },
          changedBy: 'telegram',
        });
        await trade.save();

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🔒 STOP LOSS TRAILED TO +${pips} PIPS]</b>\n` +
          `New SL: ${sym}${targetSl.toFixed(2)} • Status: ${brokerStatus}`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        if (alertState) {
          alertState.cardVersion += 1;
          await alertState.save();
        }

        await AlertEvent.create({
          userId: user._id,
          tradeId: trade._id,
          type: (alertState?.type as any) || 'LADDER',
          severity: 1,
          action: 'SEND_NEW',
          actionTaken: `TRAIL_${pips}P`,
          latencyMs: Date.now() - startTime,
          sentAt: alertState?.lastSentAt || new Date(),
          actedAt: new Date(),
        });
        return;
      }

      // Fractional scale-outs (25%, 50%, 75%)
      if (
        actionCode === 'B25' || actionCode === 'CONF_B25' ||
        actionCode === 'B50' || actionCode === 'CONF_B50' ||
        actionCode === 'B75' || actionCode === 'CONF_B75'
      ) {
        const pct = parseInt(actionCode.replace('CONF_', '').replace('B', ''), 10) || 50;
        const fraction = pct / 100;
        const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? (trade as any).quantity ?? 1;

        let closeQty: number;
        if (isMt5) {
          closeQty = Math.max(0.01, Number((openQty * fraction).toFixed(2)));
          if (closeQty > openQty) closeQty = openQty;
        } else {
          closeQty = Math.max(1, Math.floor(openQty * fraction));
          if (closeQty > openQty) closeQty = openQty;
        }

        let res: any = { executedOnBroker: false, tradedPrice: currentLtp };
        if (isMt5 && ticket) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId: (account?._id || trade.accountId)!,
            tradeId: trade._id,
            ticket,
            volume: closeQty,
          });
          res = { executedOnBroker: true, tradedPrice: currentLtp };
        } else {
          res = await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
            exitQty: closeQty,
            isFullClose: closeQty >= openQty,
          });
        }

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🎯 ${pct}% PARTIAL PROFIT BOOKED]</b>\n` +
          `Qty Closed: ${closeQty} • Traded: ${sym}${res.tradedPrice || currentLtp}`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        trade.auditLog.push({
          action: `TELEGRAM_BOOK_${pct}`,
          timestamp: new Date(),
          details: { text: `Booked ${pct}% partial (${closeQty} qty) via Telegram button` },
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
          actionTaken: `BOOK_${pct}`,
          latencyMs: Date.now() - startTime,
          sentAt: alertState?.lastSentAt || new Date(),
          actedAt: new Date(),
        });
        return;
      }

      if (actionCode === 'L1' || actionCode === 'L2') {
        const stepNum = actionCode === 'L1' ? 1 : 2;
        const openQty = trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1;
        const rules = (trade.customLadderRules as any) || {};
        const stepRule = stepNum === 1 ? rules.t1 : rules.t2;
        const exitRatio = stepRule?.exitRatio ?? (stepNum === 1 ? 0.5 : 0.25);
        const exitQty = isMt5
          ? Math.max(0.01, Number((openQty * exitRatio).toFixed(2)))
          : Math.max(1, Math.floor(openQty * exitRatio));

        // Determine new trailed stop loss
        let newStopLoss: number | undefined;
        const isLong = trade.direction === 'LONG';
        const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? 0);
        const trueBePrice = (trade.calculated as any)?.trueBreakevenPrice || entryPrice;
        const initialSl = trade.risk?.initialStopLoss ?? trade.risk?.currentStopLoss ?? 0;
        const riskPoints = Math.abs(entryPrice - initialSl);

        if (stepNum === 1) {
          const trailAction = stepRule?.trailAction || 'TRUE_BE_WITH_FEES';
          if (trailAction === 'TRUE_BE_WITH_FEES') newStopLoss = trueBePrice;
          else if (trailAction === 'NOMINAL_BE') newStopLoss = entryPrice;
          else if (trailAction === 'CUSTOM_POINTS') {
            const pts = stepRule?.trailPoints || 10;
            newStopLoss = isLong ? entryPrice + pts : entryPrice - pts;
          }
        } else if (stepNum === 2) {
          const trailAction = stepRule?.trailAction || 'TRAIL_T1';
          if (trailAction === 'TRAIL_T1') {
            const t1R = rules.t1?.targetR ?? 1.0;
            newStopLoss = isLong ? entryPrice + (riskPoints * t1R) : entryPrice - (riskPoints * t1R);
          } else {
            newStopLoss = trueBePrice;
          }
        }

        let res: any = { executedOnBroker: false, tradedPrice: currentLtp };
        if (isMt5 && ticket) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId: (account?._id || trade.accountId)!,
            tradeId: trade._id,
            ticket,
            volume: exitQty,
          });
          res = { executedOnBroker: true, tradedPrice: currentLtp };
        } else {
          res = await FyersService.executeBrokerExit(user._id, trade._id.toString(), {
            exitQty,
            isFullClose: exitQty >= openQty,
          });
        }

        if (newStopLoss && newStopLoss > 0) {
          trade.risk = {
            ...(trade.risk || {}),
            initialStopLoss: trade.risk?.initialStopLoss || entryPrice,
            currentStopLoss: Number(newStopLoss.toFixed(2)),
          };
          if (isMt5 && ticket) {
            await Mt5CommandService.queueModifySl({
              userId: user._id,
              accountId: (account?._id || trade.accountId)!,
              tradeId: trade._id,
              ticket,
              stopLoss: Number(newStopLoss.toFixed(2)),
            });
          } else {
            try {
              await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), Number(newStopLoss.toFixed(2)));
            } catch {
              // Broker SL placement fallback
            }
          }
        }

        const updateText =
          (cq.message?.text || '') +
          `\n\n<b>[🎯 TARGET T${stepNum} SCALED OUT VIA TELEGRAM]</b>\n` +
          `Qty Closed: ${exitQty} • Traded: ${sym}${res.tradedPrice || currentLtp}\n` +
          `Stop Trailed: ${newStopLoss ? `${sym}${newStopLoss.toFixed(2)}` : 'Unchanged'}`;

        await this.editMessageText(botToken, chatId, messageId, updateText, []);

        trade.auditLog.push({
          action: `TELEGRAM_SCALE_OUT_T${stepNum}`,
          timestamp: new Date(),
          details: {
            text: `Executed Target T${stepNum} scale-out (${exitQty} qty) via Telegram button`,
            newStopLoss: newStopLoss ? Number(newStopLoss.toFixed(2)) : undefined,
          },
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
          type: (alertState?.type as AlertType) || 'LADDER',
          severity: alertState?.severity || 1,
          action: 'SEND_NEW',
          actionTaken: `SCALE_OUT_T${stepNum}`,
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
  private static async handleTextMessage(msg: any, knownBotToken?: string): Promise<void> {
    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const text: string = (msg.text || '').trim();
    const [rawCmd, ...args] = text.split(/\s+/);
    const command = rawCmd.toLowerCase();

    // Check if user is linked
    let user = await User.findOne({
      $or: [
        { 'liveWatcherSettings.telegramChatId': String(chatId) },
        ...(fromId ? [{ 'liveWatcherSettings.telegramChatId': String(fromId) }] : []),
      ],
    });

    let botToken: string | undefined = knownBotToken;
    if (!user && knownBotToken) {
      const candidates = await User.find({
        'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
      });
      for (const cand of candidates) {
        const dec = safeDecryptSecret(cand.liveWatcherSettings?.telegramBotToken);
        if (dec && dec === knownBotToken) {
          user = cand;
          if (cand.liveWatcherSettings && !cand.liveWatcherSettings.telegramChatId && chatId) {
            cand.liveWatcherSettings.telegramChatId = String(chatId);
            cand.liveWatcherSettings.telegramAlertsEnabled = true;
            await cand.save();
          }
          break;
        }
      }
    }

    if (!user) {
      // Respond with unlinked guide
      const fallbackToken = knownBotToken || config.telegramBotToken;
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
          `4. Click <b>Test Connection</b> & <b>Save Execution Settings</b>.`
        );
      }
      return;
    }

    if (!botToken) {
      const rawToken = user.liveWatcherSettings?.telegramBotToken;
      botToken = rawToken ? (safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? undefined : rawToken)) : undefined;
    }
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
          `• <b>/trades</b> — List active open trades with live charts & 1-tap Exit\n` +
          `• <b>/risk</b> — Prop firm drawdown gauge, daily loss runway & Elefin guardrails\n` +
          `• <b>/sl &lt;price&gt;</b> — Set or trail Stop Loss directly (e.g. <code>/sl 4005.50</code> or reply with price)\n` +
          `• <b>/chart [timeframe]</b> — Instant live candlestick chart (1m, 5m, 15m, 1h)\n` +
          `• <b>/summary</b> — Today's performance stats, win rate & harvested R\n` +
          `• <b>/news</b> — Upcoming XAUUSD / Gold catalysts & countdown\n` +
          `• <b>/newsremind &lt;mins&gt;</b> — Set custom alert reminder (e.g. <code>/newsremind 15</code> or <code>/newsremind off</code>)\n` +
          `• <b>/alerts</b> — List active alert states and snoozed trades\n` +
          `• <b>/snooze</b> — Snooze alerts for 15 minutes\n` +
          `• <b>/mute &lt;mins&gt;</b> — Mute audible notifications\n` +
          `• <b>/panic</b> — Two-step killswitch to market-exit all positions\n\n` +
          `<i>Connected account: ${user.name || user.email}</i>`
        );
        break;

      case '/risk':
      case '/prop':
      case '/drawdown':
        await this.handleRiskCommand(user, botToken, chatId);
        break;

      case '/sl':
      case 'sl':
        await this.handleCustomStopLossCommand(user, botToken, chatId, args, msg);
        break;

      case '/pnl':
        await this.handlePnlCommand(user, botToken, chatId, args[0]);
        break;

      case '/trades':
        await this.handleTradesCommand(user, botToken, chatId, args[0]);
        break;

      case '/chart':
        await this.handleChartCommand(user, botToken, chatId, args);
        break;

      case '/summary':
        await this.handleSummaryCommand(user, botToken, chatId, args[0]);
        break;

      case '/news':
      case '/goldnews':
        await this.handleGoldNewsCommand(user, botToken, chatId);
        break;

      case '/newsremind':
        await this.handleNewsRemindCommand(user, botToken, chatId, args);
        break;

      case '/alerts':
        await this.handleAlertsListCommand(user, botToken, chatId, args[0]);
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

      default: {
        // Check if user sent a bare numeric price (e.g. "4005.50" or "$4005.5") or replied to an alert
        const numericCandidate = text.replace('$', '').replace('₹', '').trim();
        if (/^\d+(\.\d+)?$/.test(numericCandidate)) {
          const numVal = parseFloat(numericCandidate);
          if (numVal > 0) {
            await this.handleCustomStopLossCommand(user, botToken, chatId, [numericCandidate], msg);
            return;
          }
        }

        await this.sendMessage(
          botToken,
          chatId,
          `❓ Unknown command: <code>${command}</code>. Type <b>/help</b> for available commands.`
        );
      }
    }
  }

  /**
   * Handles incoming voice notes and audio messages sent to the Telegram bot.
   * Downloads the audio from Telegram servers, stores it in Cloudflare R2,
   * creates an Attachment, links it to the appropriate trade, and replies with confirmation.
   */
  private static async handleVoiceMessage(msg: any, knownBotToken?: string): Promise<void> {
    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    const voice = msg.voice || msg.audio;
    if (!voice || !voice.file_id) return;

    // 1. Resolve user from chatId or fromId
    let user = await User.findOne({
      $or: [
        { 'liveWatcherSettings.telegramChatId': String(chatId) },
        ...(fromId ? [{ 'liveWatcherSettings.telegramChatId': String(fromId) }] : []),
      ],
    });

    let botToken: string | undefined = knownBotToken;
    if (!user && knownBotToken) {
      const candidates = await User.find({
        'liveWatcherSettings.telegramBotToken': { $exists: true, $ne: null },
      });
      for (const cand of candidates) {
        const dec = safeDecryptSecret(cand.liveWatcherSettings?.telegramBotToken);
        if (dec && dec === knownBotToken) {
          user = cand;
          if (cand.liveWatcherSettings && !cand.liveWatcherSettings.telegramChatId && chatId) {
            cand.liveWatcherSettings.telegramChatId = String(chatId);
            cand.liveWatcherSettings.telegramAlertsEnabled = true;
            await cand.save();
          }
          break;
        }
      }
    }

    if (!user) {
      const fallbackToken = knownBotToken || config.telegramBotToken;
      if (fallbackToken) {
        await this.sendMessage(
          fallbackToken,
          chatId,
          `👋 <b>SetupMint Terminal Bot</b>\n\n` +
          `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
          `Please configure your Chat ID in SetupMint Settings to record trade voice reflections.`
        );
      }
      return;
    }

    if (!botToken) {
      const rawToken = user.liveWatcherSettings?.telegramBotToken;
      botToken = rawToken ? (safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? undefined : rawToken)) : undefined;
    }
    if (!botToken) return;

    try {
      // 2. Resolve Target Trade
      let targetTrade: any = null;

      // Method A: Check if this voice note is a direct reply to a trade alert
      const replyMsg = msg.reply_to_message;
      if (replyMsg) {
        // Inspect inline button callback_data: x:<tradeId>:<action>
        const inlineKeyboard = replyMsg.reply_markup?.inline_keyboard || [];
        for (const row of inlineKeyboard) {
          for (const btn of row) {
            const cb: string = btn.callback_data || '';
            if (cb.startsWith('x:')) {
              const parts = cb.split(':');
              const tId = parts[1];
              if (tId && mongoose.isValidObjectId(tId)) {
                targetTrade = await Trade.findOne({ _id: tId, userId: user._id });
                if (targetTrade) break;
              }
            }
          }
          if (targetTrade) break;
        }

        // If not in buttons, check reply text for 24-character ObjectId or symbol
        if (!targetTrade && replyMsg.text) {
          const matchId = replyMsg.text.match(/[0-9a-fA-F]{24}/);
          if (matchId && matchId[0]) {
            targetTrade = await Trade.findOne({ _id: matchId[0], userId: user._id });
          }
        }
      }

      // Method B: If not a reply, look for currently active OPEN trade
      if (!targetTrade) {
        targetTrade = await Trade.findOne({ userId: user._id, status: 'OPEN' }).sort({ entryTime: -1 });
      }

      // Method C: If no OPEN trade, look for trade closed within last 4 hours
      if (!targetTrade) {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        targetTrade = await Trade.findOne({
          userId: user._id,
          status: 'CLOSED',
          exitTime: { $gte: fourHoursAgo },
        }).sort({ exitTime: -1 });
      }

      // Method D: Fallback to the latest trade overall
      if (!targetTrade) {
        targetTrade = await Trade.findOne({ userId: user._id }).sort({ exitTime: -1, entryTime: -1 });
      }

      // 3. Download the audio file from Telegram Bot API
      const fileId = voice.file_id;
      const getFileRes = await fetch(
        `${this.TELEGRAM_API_BASE}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
      );
      const getFileJson = (await getFileRes.json()) as any;
      if (!getFileJson.ok || !getFileJson.result?.file_path) {
        throw new Error(getFileJson.description || 'Failed to retrieve voice file path from Telegram');
      }

      const filePath = getFileJson.result.file_path;
      const fileDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const audioRes = await fetch(fileDownloadUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download audio from Telegram: HTTP ${audioRes.status}`);
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      // 4. Validate file size (max configured MB)
      const maxBytes = (config.maxFileSizeMb || 10) * 1024 * 1024;
      if (audioBuffer.length > maxBytes) {
        await this.sendMessage(
          botToken,
          chatId,
          `⚠️ Voice reflection exceeds maximum size of ${config.maxFileSizeMb}MB.`
        );
        return;
      }

      // 5. Store in Cloudflare R2 via storage provider
      const ext = path.extname(filePath) || (msg.voice ? '.oga' : '.mp3');
      const safeFilename = `voice_${targetTrade ? targetTrade._id.toString() : user._id.toString()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const mimeType = voice.mime_type || (ext === '.oga' ? 'audio/ogg' : 'audio/mpeg');

      const storage = getStorage();
      await storage.save(safeFilename, audioBuffer, mimeType);

      // 6. Create Attachment Document in MongoDB
      const duration = voice.duration || 0;
      const durationText = duration > 0 ? `${duration}s` : 'Audio';
      const attachment = await Attachment.create({
        userId: user._id,
        tradeId: targetTrade?._id,
        originalName: `voice-reflection-${Date.now()}${ext}`,
        storedFilename: safeFilename,
        mimeType: mimeType,
        sizeBytes: audioBuffer.length,
        category: 'REVIEW',
        description: `🎙️ Voice Reflection (${durationText}) recorded via Telegram`,
      });

      // 7. Link to Trade
      if (targetTrade) {
        targetTrade.screenshotIds.push(attachment._id);
        const timeIST = new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
        });
        const noteText = `[${timeIST} IST] 🎙️ Voice Note (${durationText}) recorded via Telegram.`;
        if (!targetTrade.psychology) {
          targetTrade.psychology = {} as any;
        }
        const existingNotes = targetTrade.psychology.notes || '';
        targetTrade.psychology.notes = existingNotes ? `${existingNotes}\n${noteText}` : noteText;

        targetTrade.auditLog.push({
          action: 'VOICE_REFLECTION_ATTACHED',
          timestamp: new Date(),
          details: {
            attachmentId: attachment._id.toString(),
            duration,
            sizeBytes: audioBuffer.length,
          },
          changedBy: 'telegram',
        });
        await targetTrade.save();
      }

      // 8. Reply with Rich Telegram Confirmation
      const sizeKb = Math.round(audioBuffer.length / 1024);
      if (targetTrade) {
        const sym = TelegramAlertService.getTradeCurrencySymbol(targetTrade);
        const pnlStr =
          targetTrade.calculated?.netPnL !== undefined
            ? ` • Net PnL: ${targetTrade.calculated.netPnL >= 0 ? '+' : ''}${sym}${targetTrade.calculated.netPnL.toFixed(2)}`
            : '';

        const replyHtml =
          `🎙️ <b>Voice Reflection Attached!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <b>Trade:</b> ${targetTrade.symbol} (${targetTrade.direction}${pnlStr})\n` +
          `⏱️ <b>Duration:</b> ${durationText} • <b>Size:</b> ${sizeKb} KB\n\n` +
          `💾 <i>Saved to Cloudflare R2 & linked to your trade review gallery in SetupMint.</i>`;

        const buttons: ITelegramInlineButton[][] = [
          [
            { text: '🔗 View in SetupMint', url: `${config.webAppUrl}/trades/${targetTrade._id}` },
            { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
          ],
        ];

        await this.sendMessage(botToken, chatId, replyHtml, buttons);
      } else {
        const replyHtml =
          `🎙️ <b>Voice Reflection Saved!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⏱️ <b>Duration:</b> ${durationText} • <b>Size:</b> ${sizeKb} KB\n\n` +
          `💾 <i>Saved to your Cloudflare R2 storage vault.</i>\n\n` +
          `💡 <i>Tip: Reply directly to any trade alert message on Telegram to attach your voice note to that exact trade!</i>`;

        await this.sendMessage(botToken, chatId, replyHtml);
      }
    } catch (err: any) {
      console.error('[TelegramAlertService] handleVoiceMessage error:', err);
      await this.sendMessage(botToken, chatId, `❌ Failed to save voice reflection: ${err.message}`);
    }
  }

  /**
   * Generates live PnL report card for /pnl command.
   */
  private static async handlePnlCommand(user: any, botToken: string | null | undefined, chatId: string | number, scopeArg?: string): Promise<void> {
    const argLower = scopeArg?.toLowerCase() || '';
    const isProp = argLower.includes('prop');
    const isLive = argLower.includes('live') || argLower.includes('personal');
    const scope = isProp
      ? { mode: 'PROP_FIRM' as const }
      : isLive
      ? { mode: 'TYPE' as const, accountType: 'LIVE' as const }
      : { mode: 'ALL' as const };
    const accountIds = await AccountScopeService.resolveAccountScope(user._id, scope);
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString(), accountIds);
    const openCount = summary.positions.length;
    const hasUsd = isProp || summary.positions.some((p: any) => p.currency === 'USD' || p.isMt5 || (p.symbol && p.symbol.includes('XAU')));
    const sym = hasUsd ? '$' : '₹';

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTrades = await Trade.find({
      userId: user._id,
      status: 'CLOSED',
      exitTime: { $gte: startOfDay },
      accountId: { $in: accountIds },
    }).lean();

    const realizedPnL = todayTrades.reduce((acc, t) => acc + (t.calculated?.netPnL || 0), 0);
    const totalDayPnL = summary.totalFloatingNetPnL + realizedPnL;

    const pnlSign = summary.totalFloatingNetPnL >= 0 ? '+' : '';
    const daySign = totalDayPnL >= 0 ? '+' : '';
    const rSign = (summary.portfolioUnrealizedR || 0) >= 0 ? '+' : '';

    const text =
      `📈 <b>SetupMint Live Portfolio PnL${isProp ? ' (PROP MODE)' : isLive ? ' (LIVE PERSONAL)' : ''}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Open Positions  : ${openCount}\n` +
      `Floating Net    : ${pnlSign}${sym}${summary.totalFloatingNetPnL.toFixed(2)} (${rSign}${(summary.portfolioUnrealizedR || 0).toFixed(2)}R)\n` +
      `Floating Gross  : ${sym}${summary.totalFloatingGrossPnL.toFixed(2)}\n` +
      `Est Charges     : -${sym}${summary.totalEstimatedCharges.toFixed(2)}\n` +
      `Realized Today  : ${sym}${realizedPnL.toFixed(2)}\n` +
      `Total Day PnL   : ${daySign}${sym}${totalDayPnL.toFixed(2)}\n` +
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
  private static async handleTradesCommand(user: any, botToken: string | null | undefined, chatId: string | number, scopeArg?: string): Promise<void> {
    const argLower = scopeArg?.toLowerCase() || '';
    const isProp = argLower.includes('prop');
    const isLive = argLower.includes('live') || argLower.includes('personal');
    const scope = isProp
      ? { mode: 'PROP_FIRM' as const }
      : isLive
      ? { mode: 'TYPE' as const, accountType: 'LIVE' as const }
      : { mode: 'ALL' as const };
    const accountIds = await AccountScopeService.resolveAccountScope(user._id, scope);
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString(), accountIds);
    const sym = isProp ? '$' : '₹';
    if (summary.positions.length === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `✅ <b>No Open Positions</b>\n\nYou currently have 0 open positions. Capital is 100% safe.`
      );
      return;
    }

    for (const pos of summary.positions) {
      const posIsUsd =
        isProp ||
        pos.currency === 'USD' ||
        pos.isMt5 ||
        (pos.symbol &&
          (pos.symbol.includes('XAU') ||
            pos.symbol.includes('EUR') ||
            pos.symbol.includes('USD') ||
            pos.symbol.includes('GBP')));
      const posSym = posIsUsd ? '$' : '₹';
      const posLocale = posIsUsd ? 'en-US' : 'en-IN';
      const pnlSign = pos.floatingNetPnL >= 0 ? '+' : '';
      const rSign = (pos.unrealizedR || 0) >= 0 ? '+' : '';
      const mult = pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1;
      const exposure = pos.quantity * mult * pos.currentLtp;

      const stopInfo = pos.stopLoss ? `${posSym}${pos.stopLoss} (${pos.distanceToStopPoints?.toFixed(1) || 0} pts left)` : 'NO STOP (NAKED)';
      const beInfo = pos.trueBreakevenPrice ? `${posSym}${pos.trueBreakevenPrice.toFixed(2)}` : `${posSym}${pos.entryPrice}`;

      const text =
        `<b>${pos.symbol}</b> (<code>${pos.direction}</code>)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Entry    : ${posSym}${pos.entryPrice.toFixed(2)}  |  LTP: ${posSym}${pos.currentLtp.toFixed(2)}\n` +
        `Net PnL  : ${pnlSign}${posSym}${pos.floatingNetPnL.toFixed(2)} (${rSign}${(pos.unrealizedR || 0).toFixed(2)}R)\n` +
        `Quantity : ${pos.quantity} ${mult > 1 ? `lots (${pos.quantity * mult} units)` : 'units'}\n` +
        `Exposure : ${posSym}${exposure.toLocaleString(posLocale)}\n` +
        `StopLoss : ${stopInfo}\n` +
        `True BE  : ${beInfo}\n` +
        `</pre>`;

      const attachChart = user.liveWatcherSettings?.telegramAttachLiveChart !== false;
      const defaultTf = user.liveWatcherSettings?.telegramChartTimeframe || '5';

      const buttons = this.buildContextualKeyboard(
        {
          _id: pos.tradeId,
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          calculated: {
            trueBreakevenPrice: pos.trueBreakevenPrice,
            openQuantity: pos.quantity,
          },
        },
        'STOP_THREAT',
        pos.currentLtp,
        1,
        false,
        true // includeTimeframes
      );

      let sent = false;
      if (attachChart) {
        try {
          const photoBuf = await this.generatePositionChart(user, pos, defaultTf);
          if (photoBuf) {
            await this.sendPhoto(botToken, chatId, photoBuf, text, buttons);
            sent = true;
          }
        } catch (chartErr: any) {
          console.warn('[TelegramAlertService] sendPhoto failed for /trades, falling back to text:', chartErr.message);
        }
      }

      if (!sent) {
        await this.sendMessage(botToken, chatId, text, buttons);
      }
    }
  }

  /**
   * Generates and sends an on-demand live candlestick chart snapshot.
   * Usage: /chart [timeframe] or /chart [symbol] [timeframe]
   */
  private static async handleChartCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[] = []
  ): Promise<void> {
    const validTimeframes = ['1', '3', '5', '15', '30', '60', '1h', 'D', '1m', '3m', '5m', '15m', '30m', '1d', 'd'];
    let reqTf: string | undefined;
    let reqSymbol: string | undefined;

    for (const a of args) {
      const lower = a.toLowerCase();
      if (validTimeframes.includes(lower)) {
        reqTf = lower.replace('m', '').replace('h', '60').replace('d', 'D');
      } else if (!reqSymbol) {
        reqSymbol = a.toUpperCase();
      }
    }

    const tf = reqTf || user.liveWatcherSettings?.telegramChartTimeframe || '5';
    const tfLabel = tf === '60' ? '1h' : tf === 'D' ? '1D' : `${tf}m`;

    const openTradesQuery: any = {
      userId: user._id,
      status: 'OPEN',
    };
    if (reqSymbol) {
      openTradesQuery.symbol = new RegExp(reqSymbol, 'i');
    }

    const openTrades = await Trade.find(openTradesQuery).sort({ entryTime: -1 }).limit(3);

    if (openTrades.length === 0) {
      if (reqSymbol) {
        const recentTrade = await Trade.findOne({
          userId: user._id,
          symbol: new RegExp(reqSymbol, 'i'),
        }).sort({ createdAt: -1 });

        if (recentTrade) {
          const photoBuf = await this.generatePositionChart(user, recentTrade, tf);
          if (photoBuf) {
            const sym = TelegramAlertService.getTradeCurrencySymbol(recentTrade);
            const netPnl = Number(recentTrade.calculated?.netPnL ?? (recentTrade as any).netPnl ?? 0);
            const pnlSign = netPnl >= 0 ? '+' : '';
            const caption =
              `📈 <b>${recentTrade.symbol}</b> (${recentTrade.direction}) — <b>${tfLabel} Review</b>\n` +
              `Status: ${recentTrade.status} • Net PnL: ${pnlSign}${sym}${netPnl.toFixed(2)}`;
            await this.sendPhoto(botToken, chatId, photoBuf, caption);
            return;
          }
        }
      }

      await this.sendMessage(
        botToken,
        chatId,
        `ℹ️ <b>No Matching Open Positions</b>\n\nNo active open positions found${reqSymbol ? ` matching "${reqSymbol}"` : ''}. Capital is safe.`
      );
      return;
    }

    for (const trade of openTrades) {
      const tAny = trade as any;
      const currentLtp = Number(tAny.calculated?.liveMfeSummary?.peakLtp || tAny.simpleExecution?.entryPrice || 0);
      const photoBuf = await this.generatePositionChart(user, trade, tf);

      const isForex = trade.exchange === 'FOREX' || (trade.symbol && trade.symbol.includes('XAU'));
      const sym = isForex ? '$' : '₹';
      const pnlVal = Number(tAny.calculated?.floatingNetPnL ?? tAny.floatingNetPnL ?? 0);
      const pnlSign = pnlVal >= 0 ? '+' : '';
      const rVal = tAny.calculated?.unrealizedR || 0;
      const rSign = rVal >= 0 ? '+' : '';
      const entryVal = Number(tAny.simpleExecution?.entryPrice ?? tAny.calculated?.averageEntryPrice ?? tAny.entryPrice ?? 0);

      const caption =
        `📊 <b>${trade.symbol}</b> (<code>${trade.direction}</code>) — <b>${tfLabel} Live Snapshot</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Entry    : ${sym}${entryVal.toFixed(2)}  |  LTP: ${sym}${currentLtp.toFixed(2)}\n` +
        `Net PnL  : ${pnlSign}${sym}${pnlVal.toFixed(2)} (${rSign}${rVal.toFixed(2)}R)\n` +
        `StopLoss : ${trade.risk?.currentStopLoss || trade.risk?.initialStopLoss ? `${sym}${trade.risk?.currentStopLoss || trade.risk?.initialStopLoss}` : 'NONE'}\n` +
        `Target   : ${trade.risk?.plannedTarget ? `${sym}${trade.risk?.plannedTarget}` : 'OPEN'}\n` +
        `</pre>`;

      const buttons = this.buildContextualKeyboard(
        trade,
        'STOP_THREAT',
        currentLtp,
        1,
        false,
        true // includeTimeframes
      );

      if (photoBuf) {
        await this.sendPhoto(botToken, chatId, photoBuf, caption, buttons);
      } else {
        await this.sendMessage(botToken, chatId, caption, buttons);
      }
    }
  }

  /**
   * Lists active and snoozed alert states for /alerts command.
   */
  private static async handleAlertsListCommand(user: any, botToken: string, chatId: string | number, scopeArg?: string): Promise<void> {
    const argLower = scopeArg?.toLowerCase() || '';
    const isProp = argLower.includes('prop');
    const isLive = argLower.includes('live') || argLower.includes('personal');
    const scope = isProp
      ? { mode: 'PROP_FIRM' as const }
      : isLive
      ? { mode: 'TYPE' as const, accountType: 'LIVE' as const }
      : { mode: 'ALL' as const };
    const accountIds = await AccountScopeService.resolveAccountScope(user._id, scope);
    const tradesInScope = await Trade.find({ userId: user._id, accountId: { $in: accountIds } }).select('_id');
    const tradeIds = tradesInScope.map((t) => t._id);

    const alertFilter: any = {
      userId: user._id,
      state: { $in: ['ACTIVE', 'SNOOZED'] },
      tradeId: { $in: tradeIds },
    };

    const alerts = await AlertState.find(alertFilter).lean();

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
   * Executes emergency two-step panic flattening across all open FYERS (non-prop/live) positions.
   */
  private static async executePanicExit(user: any, botToken: string | null | undefined, chatId: string | number, messageId?: number): Promise<void> {
    const liveAccountIds = await AccountScopeService.resolveAccountScope(user._id, {
      mode: 'TYPE',
      accountType: 'LIVE',
    });
    const openTrades = await Trade.find({
      userId: user._id,
      accountId: { $in: liveAccountIds },
      status: 'OPEN',
    });
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
  private static async handleSummaryCommand(user: any, botToken: string, chatId: string | number, scopeArg?: string): Promise<void> {
    const argLower = scopeArg?.toLowerCase() || '';
    const isProp = argLower.includes('prop');
    const isLive = argLower.includes('live') || argLower.includes('personal');
    const scope = isProp
      ? { mode: 'PROP_FIRM' as const }
      : isLive
      ? { mode: 'TYPE' as const, accountType: 'LIVE' as const }
      : { mode: 'ALL' as const };
    const accountIds = await AccountScopeService.resolveAccountScope(user._id, scope);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const trades = await Trade.find({
      userId: user._id,
      status: 'CLOSED',
      exitTime: { $gte: startOfDay },
      accountId: { $in: accountIds },
    }).lean();

    const hasUsd = isProp || trades.some((t: any) => t.currency === 'USD' || t.exchange === 'FOREX' || (t.symbol && t.symbol.includes('XAU')));
    const sym = hasUsd ? '$' : '₹';
    const locale = hasUsd ? 'en-US' : 'en-IN';

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
      `📊 <b>Today's Trading Performance Digest${isProp ? ' (PROP MODE)' : ''}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Total Trades : ${count}\n` +
      `Win / Loss   : ${wins}W / ${losses}L (${winRate}%)\n` +
      `Net PnL      : ${netPnL >= 0 ? '+' : ''}${sym}${netPnL.toFixed(2)}\n` +
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

    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return false;
    const dedupeKey = `${chatId}:${title}:${body.slice(0, 30)}`;
    const now = Date.now();
    const lastSent = this.recentAlerts.get(dedupeKey);
    // For session expiry / token expiration notices, enforce a 15-minute debounce to prevent alert spam
    const isSessionOrExpiryAlert = title.includes('Expired') || title.includes('Expiring') || title.includes('Session');
    const effectiveDebounceMs = isSessionOrExpiryAlert ? 15 * 60 * 1000 : this.DEBOUNCE_MS;
    if (lastSent && now - lastSent < effectiveDebounceMs) {
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

    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
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
        EntryPrice: `${sym}${entry}`,
        StopLoss: sl !== 'None' ? `${sym}${sl}` : 'NO STOP (NAKED)',
        InitialRisk: riskAmt ? `${sym}${Number(riskAmt).toFixed(2)}` : 'Unspecified',
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
    const botToken = safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken);
    if (!botToken) return;
    const chatId = settings.telegramChatId;

    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);

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
            `🏁 <b>Position Closed</b> at ${sym}${outcome.exitPrice} (${outcome.netPnL >= 0 ? '+' : ''}${sym}${outcome.netPnL.toFixed(2)}).\n` +
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

    const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? trade.entryPrice ?? 0);
    const exitPrice = outcome.exitPrice || Number(trade.simpleExecution?.exitPrice ?? trade.calculated?.averageExitPrice ?? 0);
    const isLong = trade.direction === 'LONG';
    const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
    const pipDiv = isGold ? 0.10 : (trade.exchange === 'FOREX' ? 0.0001 : 1.0);

    const harvestedPoints = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
    const harvestedPips = harvestedPoints / pipDiv;

    const mfePoints = Number(trade.calculated?.excursion?.mfePoints ?? trade.calculated?.liveMfeSummary?.maxFavorablePoints ?? Math.max(0, harvestedPoints));
    const maePoints = Number(trade.calculated?.excursion?.maePoints ?? trade.calculated?.liveMfeSummary?.maxDrawdownPoints ?? 0);
    const mfePips = mfePoints / pipDiv;
    const maePips = maePoints / pipDiv;

    const peakPrice = isLong ? entryPrice + mfePoints : entryPrice - mfePoints;
    const captureEfficiency = mfePoints > 0 ? Math.max(0, Math.min(100, (harvestedPoints / mfePoints) * 100)) : (harvestedPoints > 0 ? 100 : 0);

    let rating = '🔵 BREAKEVEN / NEUTRAL';
    if (outcome.netPnL > 0) {
      if (captureEfficiency >= 75) rating = '🟢 EXCELLENT (Harvested 75%+ of Peak Run)';
      else if (captureEfficiency >= 45) rating = '🟡 SOLID (Captured 45%+ of Peak Run)';
      else rating = '🟠 GAVE BACK GAINS (Left >55% profit on table)';
    } else if (outcome.netPnL < 0) {
      if (Math.abs(harvestedPips) <= 35) rating = '🔵 CONTROLLED RISK (Disciplined Stop Loss)';
      else rating = '🛑 HIGH LOSS (Exceeded Standard Risk Budget)';
    }

    const isWin = outcome.netPnL > 0;
    const sign = outcome.netPnL >= 0 ? '+' : '';
    const rSign = (outcome.realizedR || 0) >= 0 ? '+' : '';

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `${isWin ? '🏁 Trade Closed in Profit' : '🛑 Trade Closed in Loss'}: ${trade.symbol}`,
      body: `<b>Post-Trade Efficiency Scorecard:</b>\n` +
        `Harvested <b>${harvestedPips >= 0 ? '+' : ''}${harvestedPips.toFixed(1)} pips</b> (${captureEfficiency.toFixed(1)}% efficiency).\n` +
        `Execution Rating: <b>${rating}</b>`,
      severity: isWin ? 'SUCCESS' : 'WARNING',
      metrics: {
        Symbol: trade.symbol,
        Direction: trade.direction,
        Result: `${sign}${sym}${outcome.netPnL.toFixed(2)} (${rSign}${(outcome.realizedR || 0).toFixed(2)}R)`,
        EntryExit: `${sym}${entryPrice.toFixed(2)} → ${sym}${exitPrice.toFixed(2)}`,
        Harvested: `${harvestedPips >= 0 ? '+' : ''}${harvestedPips.toFixed(1)} pips`,
        PeakRunMFE: `+${mfePips.toFixed(1)} pips (${sym}${peakPrice.toFixed(2)})`,
        MaxDrawdownMAE: `-${maePips.toFixed(1)} pips`,
        Efficiency: `${captureEfficiency.toFixed(1)}% of potential`,
        ExitReason: outcome.exitReason || 'Market Exit / TP / SL',
      },
      buttons: [
        [
          { text: '📊 Daily Summary (/summary)', callback_data: 'cmd_summary' },
          { text: '🛡️ Prop Risk (/risk)', callback_data: 'cmd_risk' },
        ],
      ],
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
    const botToken = safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken);
    if (!botToken) return;
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

    const sym = user?.baseCurrency === 'USD' || user?.profile?.currency === 'USD' ? '$' : '₹';

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: isBreach ? '🚨 CRITICAL: Daily Loss Limit Breached!' : '⚠️ WARNING: Daily Loss Threshold Reached',
      body: isBreach
        ? `Daily loss limit of ${sym}${dailyLimit.toLocaleString('en-US')} has been 100% BREACHED. Stop trading immediately!`
        : `Cumulative day loss reached ${percent.toFixed(0)}% of your allowed daily risk limit. Exercise extreme caution.`,
      severity: isBreach ? 'CRITICAL' : 'WARNING',
      metrics: {
        CurrentLoss: `-${sym}${currentLoss.toFixed(2)}`,
        DailyLimit: `${sym}${dailyLimit.toFixed(2)}`,
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

  /**
   * Automatically dispatches an End of Day (EOD) Performance Digest to the trader's Telegram at 15:35 IST.
   */
  static async sendEodDigest(user: any): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.eodSummaryDigest === false) return;

    let botToken = settings.telegramBotToken;
    botToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!botToken) return;
    const chatId = settings.telegramChatId;

    // Calculate start of current day in IST (Asia/Kolkata)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const istYear = nowIST.getFullYear();
    const istMonth = nowIST.getMonth();
    const istDate = nowIST.getDate();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const startOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0) - istOffsetMs);

    const nonLiveAccounts = await TradingAccount.find({
      userId: user._id,
      $or: [
        { status: 'ARCHIVED' },
        { accountType: { $in: ['PROP_FIRM', 'DEMO'] } },
        { 'propFirm.firmKey': { $exists: true, $ne: null } },
        { 'propFirmConfig.enabled': true },
      ],
    })
      .select('_id')
      .lean();
    const excludedAccountIds = nonLiveAccounts.map((a) => a._id);

    const trades = await Trade.find({
      userId: user._id,
      ...(excludedAccountIds.length > 0 ? { accountId: { $nin: excludedAccountIds } } : {}),
      status: 'CLOSED',
      exitTime: { $gte: startOfIstDay },
    }).lean();

    const count = trades.length;
    if (count === 0) {
      const text =
        `🌅 <b>Market Close — Daily Session Digest</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `No closed trades recorded today (${nowIST.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}).\n\n` +
        `<i>Patience is discipline. Zero trades means zero capital risked outside your setups.</i>`;
      await this.sendMessage(botToken, chatId, text);
      return;
    }

    const wins = trades.filter((t) => (t.calculated?.netPnL || 0) > 0);
    const losses = trades.filter((t) => (t.calculated?.netPnL || 0) < 0);
    const winRate = Number(((wins.length / count) * 100).toFixed(1));
    const totalCosts = trades.reduce((acc, t) => acc + (t.calculated?.totalCosts || 0), 0);
    const netPnL = trades.reduce((acc, t) => acc + (t.calculated?.netPnL || 0), 0);
    const netR = trades.reduce((acc, t) => acc + (t.calculated?.realizedRMultiple || 0), 0);

    let bestWin: any = null;
    let worstLoss: any = null;
    for (const t of trades) {
      const pnl = t.calculated?.netPnL || 0;
      if (pnl > 0 && (!bestWin || pnl > (bestWin.calculated?.netPnL || 0))) {
        bestWin = t;
      }
      if (pnl < 0 && (!worstLoss || pnl < (worstLoss.calculated?.netPnL || 0))) {
        worstLoss = t;
      }
    }

    const pnlSign = netPnL >= 0 ? '+' : '';
    const rSign = netR >= 0 ? '+' : '';
    const hasUsdTrades = trades.some((t: any) => t.currency === 'USD' || t.exchange === 'FOREX');
    const sym = hasUsdTrades ? '$' : '₹';

    let text =
      `📊 <b>EOD Trading Performance Digest</b>\n` +
      `📅 <i>${nowIST.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' })}</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Net P&L      : ${pnlSign}${sym}${netPnL.toLocaleString(hasUsdTrades ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `Win Rate     : ${winRate}% (${wins.length}W / ${losses.length}L)\n` +
      `Total Trades : ${count}\n` +
      `Harvested R  : ${rSign}${netR.toFixed(2)}R\n` +
      `Broker Costs : -${sym}${totalCosts.toLocaleString(hasUsdTrades ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `</pre>\n`;

    if (bestWin) {
      const winSym = TelegramAlertService.getTradeCurrencySymbol(bestWin);
      text += `🏆 <b>Best Win:</b> ${bestWin.symbol} (+${winSym}${(bestWin.calculated?.netPnL || 0).toLocaleString(hasUsdTrades ? 'en-US' : 'en-IN')})\n`;
    }
    if (worstLoss) {
      const lossSym = TelegramAlertService.getTradeCurrencySymbol(worstLoss);
      text += `🛑 <b>Max Loss:</b> ${worstLoss.symbol} (-${lossSym}${Math.abs(worstLoss.calculated?.netPnL || 0).toLocaleString(hasUsdTrades ? 'en-US' : 'en-IN')})\n`;
    }

    text += `\n💾 <i>All excursion analytics and SVG chart snapshots are archived in SetupMint Pro.</i>`;

    const buttons = [
      [
        { text: '📈 Open Analytics', url: `${config.webAppUrl}/analytics` },
        { text: '📑 View Trades', url: `${config.webAppUrl}/trades` },
      ],
    ];

    await this.sendMessage(botToken, chatId, text, buttons);
  }

  /**
   * Responds to /risk or /prop command with Elefin / Prop firm risk radar, daily loss runway and drawdowns.
   */
  private static async handleRiskCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<void> {
    if (!botToken) return;

    const accounts = await TradingAccount.find({
      userId: user._id,
      status: 'ACTIVE',
    }).lean();

    if (!accounts || accounts.length === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>No Active Accounts Found</b>\n\nPlease connect an account in SetupMint Settings.`
      );
      return;
    }

    const propAccounts = accounts.filter(
      (a: any) =>
        a.accountType === 'PROP_FIRM' ||
        /ELEFIN|MT5/i.test(a.broker || '') ||
        /ELEFIN|MT5/i.test(a.name || '')
    );
    const targetAccounts = propAccounts.length > 0 ? propAccounts : accounts;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (const acc of targetAccounts) {
      const sym = (acc.baseCurrency || 'USD') === 'INR' ? '₹' : '$';
      const initialBalance = Number(acc.initialBalance || 10000);
      const currentBalance = Number(acc.currentBalance || initialBalance);

      const todayClosedTrades = await Trade.find({
        userId: user._id,
        accountId: acc._id,
        status: 'CLOSED',
        exitTime: { $gte: startOfDay },
      }).lean();
      const realizedToday = todayClosedTrades.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);

      const openTrades = await Trade.find({
        userId: user._id,
        accountId: acc._id,
        status: 'OPEN',
      }).lean();
      const floatingToday = openTrades.reduce(
        (sum, t: any) => sum + (t.calculated?.floatingNetPnL ?? t.floatingNetPnL ?? 0),
        0
      );

      const netDayPnL = realizedToday + floatingToday;
      const dayPnLSign = netDayPnL >= 0 ? '+' : '';

      const dailyLossLimitPct =
        acc.riskRules?.maxDailyLoss ??
        acc.propFirmConfig?.dailyLossLimitPercent ??
        acc.propFirm?.ruleSetOverrides?.dailyLoss?.limitPercent ??
        5.0;

      const maxDDPct =
        acc.propFirmConfig?.maxLossLimitPercent ??
        acc.propFirm?.ruleSetOverrides?.maxDrawdown?.limitPercent ??
        10.0;

      const dailyLossCapAmount = initialBalance * (dailyLossLimitPct / 100);
      const lossUsedToday = Math.max(0, -netDayPnL);
      const dailyBufferRemaining = Math.max(0, dailyLossCapAmount - lossUsedToday);
      const dailyRunwayPct = dailyLossCapAmount > 0
        ? Math.max(0, Math.min(100, (dailyBufferRemaining / dailyLossCapAmount) * 100))
        : 100;

      const maxDDCapAmount = initialBalance * (maxDDPct / 100);
      const overallLoss = Math.max(0, initialBalance - (currentBalance + floatingToday));
      const overallBufferRemaining = Math.max(0, maxDDCapAmount - overallLoss);
      const overallRunwayPct = maxDDCapAmount > 0
        ? Math.max(0, Math.min(100, (overallBufferRemaining / maxDDCapAmount) * 100))
        : 100;

      const dailyProgressBar = TelegramAlertService.renderProgressBar(dailyRunwayPct, 10);
      const overallProgressBar = TelegramAlertService.renderProgressBar(overallRunwayPct, 10);

      const isBreached = dailyBufferRemaining <= 0 || overallBufferRemaining <= 0;
      const isWarning = dailyRunwayPct <= 25 || overallRunwayPct <= 25;
      const statusBadge = isBreached
        ? '🛑 ACCOUNT DRAWDOWN LIMIT BREACHED'
        : isWarning
        ? '⚠️ DRAWDOWN THREAT LEVEL: ELEVATED'
        : '🟢 SAFE / WELL WITHIN GUARDRAILS';

      const accNumber = acc.accountNumber ? ` (#${acc.accountNumber})` : '';
      const text =
        `🛡️ <b>PROP FIRM RISK RADAR: ${acc.name}${accNumber}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Balance         : ${sym}${currentBalance.toFixed(2)}\n` +
        `Equity          : ${sym}${(currentBalance + floatingToday).toFixed(2)}\n` +
        `Open Positions  : ${openTrades.length} active\n` +
        `Today's Net PnL : ${dayPnLSign}${sym}${netDayPnL.toFixed(2)}\n` +
        `────────────────────────────\n` +
        `Daily Loss Cap  : ${sym}${dailyLossCapAmount.toFixed(2)} (${dailyLossLimitPct.toFixed(1)}%)\n` +
        `Daily Buffer    : ${sym}${dailyBufferRemaining.toFixed(2)} remaining\n` +
        `Daily Runway    : ${dailyProgressBar}\n` +
        `────────────────────────────\n` +
        `Max DD Cap      : ${sym}${maxDDCapAmount.toFixed(2)} (${maxDDPct.toFixed(1)}%)\n` +
        `Max DD Buffer   : ${sym}${overallBufferRemaining.toFixed(2)} remaining\n` +
        `Overall Runway  : ${overallProgressBar}\n` +
        `────────────────────────────\n` +
        `Status          : ${statusBadge}\n` +
        `</pre>\n` +
        `<i>Monitored live by SetupMint Guardian • ${new Date().toLocaleTimeString('en-IN')} IST</i>`;

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '🔄 Refresh Risk', callback_data: 'cmd_risk' },
          { text: '📊 Open Trades', callback_data: 'cmd_trades' },
        ],
        [
          { text: '🛑 Emergency Killswitch', callback_data: 'panic_prompt' },
        ],
      ];

      await this.sendMessage(botToken, chatId, text, buttons);
    }
  }

  /**
   * Adjusts stop loss directly from Telegram text command (/sl <price>) or bare numeric price reply.
   */
  private static async handleCustomStopLossCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[],
    msg?: any
  ): Promise<void> {
    if (!botToken) return;

    let targetPriceStr: string | undefined;
    let specifiedSymbol: string | undefined;

    for (const arg of args) {
      const clean = arg.replace('$', '').replace('₹', '').trim();
      if (/^\d+(\.\d+)?$/.test(clean)) {
        targetPriceStr = clean;
      } else if (/^[A-Za-z0-9_]+$/.test(clean) && clean.toUpperCase() !== 'SL') {
        specifiedSymbol = clean.toUpperCase();
      }
    }

    if (!targetPriceStr) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Missing Stop Loss Price</b>\n\n` +
        `Usage:\n` +
        `• <code>/sl &lt;price&gt;</code> (e.g. <code>/sl 4005.50</code>)\n` +
        `• <code>/sl &lt;symbol&gt; &lt;price&gt;</code> (e.g. <code>/sl XAUUSD 4005.50</code>)\n` +
        `• Or reply directly to any trade alert with the target price number!`
      );
      return;
    }

    const targetPrice = parseFloat(targetPriceStr);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      await this.sendMessage(botToken, chatId, `⚠️ Invalid price: <code>${targetPriceStr}</code>.`);
      return;
    }

    const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
    let tradeQuery: any = {
      userId: user._id,
      accountId: { $in: allActiveAccountIds },
      status: 'OPEN',
    };

    const repliedText = msg?.reply_to_message?.text || msg?.reply_to_message?.caption || '';
    if (repliedText) {
      const ticketMatch = repliedText.match(/Ticket\s*#?(\d+)/i) || repliedText.match(/MT5_TICKET_(\d+)/i);
      if (ticketMatch && ticketMatch[1]) {
        tradeQuery.tags = `MT5_TICKET_${ticketMatch[1]}`;
      } else {
        const symMatch = repliedText.match(/(XAUUSD|GOLD|[A-Z]{3,6})/);
        if (symMatch && symMatch[1]) {
          tradeQuery.symbol = symMatch[1];
        }
      }
    } else if (specifiedSymbol) {
      tradeQuery.symbol = specifiedSymbol;
    }

    let matchingTrades = await Trade.find(tradeQuery).sort({ entryTime: -1 });

    if (matchingTrades.length === 0 && !tradeQuery.tags && !tradeQuery.symbol) {
      matchingTrades = await Trade.find({
        userId: user._id,
        accountId: { $in: allActiveAccountIds },
        status: 'OPEN',
        symbol: { $regex: /XAU|GOLD/i },
      }).sort({ entryTime: -1 });
    }

    if (matchingTrades.length === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `❌ <b>No Active Open Trade Found</b>\n\n` +
        `There are currently no open positions matching your request to update Stop Loss to ${targetPrice}.`
      );
      return;
    }

    if (matchingTrades.length > 1 && !tradeQuery.tags && !specifiedSymbol) {
      const tradeList = matchingTrades
        .map((t: any) => `• <code>${t.symbol}</code> (${t.direction}) @ $${t.simpleExecution?.entryPrice || t.calculated?.averageEntryPrice || t.entryPrice || 0}`)
        .join('\n');
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Multiple Open Positions Active</b>\n\n` +
        `Please specify the symbol:\n` +
        `<code>/sl &lt;symbol&gt; ${targetPrice}</code>\n\n` +
        `Active positions:\n${tradeList}`
      );
      return;
    }

    const trade = matchingTrades[0];
    const isLong = trade.direction === 'LONG';
    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
    const currentLtp = (trade as any).currentLtp || trade.calculated?.liveMfeSummary?.peakLtp || trade.simpleExecution?.entryPrice || 0;

    if (isLong && currentLtp > 0 && targetPrice >= currentLtp) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Invalid Stop Loss:</b>\n` +
        `For a <b>LONG</b> position on ${trade.symbol}, Stop Loss (${sym}${targetPrice.toFixed(2)}) must be <b>below</b> the current market price (${sym}${currentLtp.toFixed(2)}).`
      );
      return;
    }
    if (!isLong && currentLtp > 0 && targetPrice <= currentLtp) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Invalid Stop Loss:</b>\n` +
        `For a <b>SHORT</b> position on ${trade.symbol}, Stop Loss (${sym}${targetPrice.toFixed(2)}) must be <b>above</b> the current market price (${sym}${currentLtp.toFixed(2)}).`
      );
      return;
    }

    const oldSl = trade.risk?.currentStopLoss || trade.risk?.initialStopLoss;
    trade.risk = {
      ...(trade.risk || {}),
      initialStopLoss: trade.risk?.initialStopLoss || targetPrice,
      currentStopLoss: targetPrice,
    };

    const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
    const isMt5 = Mt5CommandService.isMt5Trade(trade, account);
    const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;

    let brokerStatus = 'Stored in SetupMint Journal';
    if (isMt5 && ticket) {
      await Mt5CommandService.queueModifySl({
        userId: user._id,
        accountId: (account?._id || trade.accountId)!,
        tradeId: trade._id,
        ticket,
        stopLoss: targetPrice,
      });
      brokerStatus = `⚡ Dispatched to MT5 Server Bridge (Ticket #${ticket})`;
    } else {
      try {
        const res = await FyersService.executeBrokerStopLoss(user._id, trade._id.toString(), targetPrice);
        brokerStatus = res.executedOnBroker ? '⚡ Updated directly on Broker Exchange' : 'Stored in SetupMint Journal';
      } catch {
        brokerStatus = 'Stored in SetupMint Journal';
      }
    }

    trade.auditLog.push({
      action: 'TELEGRAM_SET_SL',
      timestamp: new Date(),
      details: {
        text: `Stop Loss updated to ${sym}${targetPrice.toFixed(2)} via Telegram command/reply`,
        previousSl: oldSl,
      },
      changedBy: 'telegram',
    });
    await trade.save();

    const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
    const pipDist = currentLtp > 0
      ? (Math.abs(currentLtp - targetPrice) / (isGold ? 0.10 : 1.0)).toFixed(1)
      : 'N/A';

    const card =
      `🔒 <b>STOP LOSS UPDATED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Symbol   : ${trade.symbol} (${trade.direction})\n` +
      `New SL   : ${sym}${targetPrice.toFixed(2)} (${pipDist} pips from LTP)\n` +
      `Old SL   : ${oldSl ? `${sym}${oldSl.toFixed(2)}` : 'None (Naked)'}\n` +
      `Market   : ${sym}${currentLtp.toFixed(2)}\n` +
      `Status   : ${brokerStatus}\n` +
      `</pre>\n` +
      `<i>Updated at ${new Date().toLocaleTimeString('en-IN')} IST</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        { text: '🛡️ Lock True BE', callback_data: `x:${trade._id}:BE:1:${Number(currentLtp.toFixed(2))}` },
        { text: '🚨 Exit Market', callback_data: `x:${trade._id}:E:1:${Number(currentLtp.toFixed(2))}` },
      ],
      [
        { text: '📊 View Open Trades', callback_data: 'cmd_trades' },
      ],
    ];

    await this.sendMessage(botToken, chatId, card, buttons);
  }

  /**
   * Dispatches a stagnation / time-stop reminder when an open trade is flat for 45+ minutes.
   */
  static async sendStagnationReminder(
    user: any,
    trade: any,
    metric: any,
    ageMins: number,
    pipDist: number
  ): Promise<void> {
    const watcherSettings = user.liveWatcherSettings;
    if (!watcherSettings?.telegramAlertsEnabled || !watcherSettings?.telegramBotToken || !watcherSettings?.telegramChatId) {
      return;
    }
    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
    const roundLtp = Number(metric.currentLtp.toFixed(2));
    const tradeId = trade._id.toString();

    await this.sendAlert({
      botToken: watcherSettings.telegramBotToken,
      chatId: watcherSettings.telegramChatId,
      title: `⏱️ Trade Stagnation Reminder: ${metric.symbol}`,
      body: `Your ${trade.direction} trade has been active for <b>${ageMins} minutes</b> but remains flat within <b>${pipDist.toFixed(1)} pips</b> of entry (${sym}${metric.entryPrice.toFixed(2)} → ${sym}${roundLtp}).\n` +
        `Gold consolidation detected. Consider tightening stop loss to breakeven or exiting if momentum has stalled.`,
      severity: 'WARNING',
      metrics: {
        Symbol: metric.symbol,
        Direction: trade.direction,
        Entry: `${sym}${metric.entryPrice.toFixed(2)}`,
        LTP: `${sym}${roundLtp}`,
        Age: `${ageMins} mins`,
        NetPnL: `${metric.netPnL >= 0 ? '+' : ''}${sym}${metric.netPnL.toFixed(2)}`,
      },
      buttons: [
        [
          { text: '🛡️ Move SL to BE', callback_data: `x:${tradeId}:BE:1:${roundLtp}` },
          { text: '🚨 Exit Market', callback_data: `x:${tradeId}:E:1:${roundLtp}` },
        ],
        [
          { text: '💤 Snooze 30m', callback_data: `x:${tradeId}:SZ:1:${roundLtp}` },
        ],
      ],
    });
  }

  /**
   * Throttled spread spike detection for Gold (XAUUSD).
   */
  static async checkAndDispatchSpreadWarning(
    userId: any,
    symbol: string,
    spreadPips: number,
    ask: number,
    bid: number
  ): Promise<void> {
    const throttleKey = `${userId}:${symbol}:spread`;
    const lastSent = this.spreadWarningTimestamps.get(throttleKey) || 0;
    const now = Date.now();
    // Throttle to at most once per 15 minutes
    if (now - lastSent < 15 * 60 * 1000) return;

    const user = await User.findById(userId).lean();
    if (!user) return;
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;

    this.spreadWarningTimestamps.set(throttleKey, now);

    const spreadUsd = (ask - bid).toFixed(2);
    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `⚠️ Gold Spread Spike Warning: ${symbol}`,
      body: `Spread has expanded to <b>${spreadPips.toFixed(1)} pips</b> ($${spreadUsd}) on ${symbol}.\n` +
        `<i>Normal spread is 1.0–2.0 pips. Wide spread during rollover or thin liquidity risks premature stop-out and high slippage.</i>`,
      severity: 'WARNING',
      metrics: {
        Symbol: symbol,
        Spread: `${spreadPips.toFixed(1)} pips ($${spreadUsd})`,
        Bid: `$${bid.toFixed(2)}`,
        Ask: `$${ask.toFixed(2)}`,
      },
      buttons: [
        [
          { text: '📊 Check Open Trades', callback_data: 'cmd_trades' },
          { text: '🛑 Emergency Killswitch', callback_data: 'panic_prompt' },
        ],
      ],
    });
  }

  /**
   * Sends Gold major market session alerts (London Open, NY Open, London Fix).
   */
  static async sendGoldSessionAlert(
    user: any,
    sessionName: string,
    description: string,
    keyFocus: string
  ): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `🔔 Gold Session Transition: ${sessionName}`,
      body: `<b>${sessionName}</b> is now active.\n\n` +
        `<b>Focus:</b> ${keyFocus}\n\n` +
        `<i>${description}</i>`,
      severity: 'INFO',
      buttons: [
        [
          { text: '📊 Open Trades', callback_data: 'cmd_trades' },
          { text: '🛡️ Check Risk (/risk)', callback_data: 'cmd_risk' },
        ],
      ],
    });
  }

  /**
   * Responds to /news or /goldnews command with upcoming Gold (XAUUSD) catalysts.
   */
  private static async handleGoldNewsCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    try {
      const events = await EconomicCalendarService.getUpcomingGoldNews(new Date(), 48);

      if (!events || events.length === 0) {
        await this.sendMessage(
          botToken,
          chatId,
          `✅ <b>No High-Impact Gold News Imminent</b>\n\n` +
          `Clear technical execution window for XAUUSD over the next 48 hours.`
        );
        return;
      }

      let text = `👑 <b>XAUUSD (GOLD) CATALYST RADAR</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `High-impact USD macro events that directly influence Gold:\n\n`;

      for (const ev of events.slice(0, 5)) {
        const impactBadge = ev.impact === 'HIGH' ? '🔴 HIGH' : '🟠 MED';
        text += `• <b>${ev.title}</b> (${impactBadge})\n` +
          `  ⏰ <b>${ev.countdownStr}</b> • <i>${ev.istTimeStr}</i>\n` +
          `  📊 Forecast: <code>${ev.forecast}</code> | Prev: <code>${ev.previous}</code>\n` +
          `  💡 <i>${ev.goldImpactNote ? ev.goldImpactNote.slice(0, 100) + '...' : 'High XAUUSD volatility'}</i>\n\n`;
      }

      const configuredMinutes = user.liveWatcherSettings?.goldNewsReminderMinutes || 15;
      const isEnabled = user.liveWatcherSettings?.telegramAlertEvents?.goldNewsReminder !== false;

      text += `⚙️ <i>Reminder: ${isEnabled ? `Active (${configuredMinutes}m before)` : 'Disabled'} • Use <b>/newsremind &lt;mins&gt;</b> to adjust.</i>`;

      const buttons = [
        [
          { text: '📈 Live XAUUSD Chart', callback_data: 'chart_xauusd' },
          { text: '📋 Open Trades', callback_data: 'show_trades' },
        ],
      ];

      await this.sendMessage(botToken, chatId, text, buttons);
    } catch (err: any) {
      await this.sendMessage(botToken, chatId, `❌ Failed to fetch gold news: ${err.message}`);
    }
  }

  /**
   * Responds to /newsremind command to dynamically change Gold news reminder lead times.
   */
  private static async handleNewsRemindCommand(
    user: any,
    botToken: string,
    chatId: string | number,
    args: string[] = []
  ): Promise<void> {
    const rawArg = (args[0] || '').trim().toLowerCase();

    if (!rawArg) {
      const currentMins = user.liveWatcherSettings?.goldNewsReminderMinutes || 15;
      const isEnabled = user.liveWatcherSettings?.telegramAlertEvents?.goldNewsReminder !== false;
      const leadTimes = user.liveWatcherSettings?.goldNewsLeadTimesMinutes || [currentMins];

      await this.sendMessage(
        botToken,
        chatId,
        `⚙️ <b>Gold News Reminder Configuration</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Status: <b>${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}</b>\n` +
        `• Current Lead Time: <b>${leadTimes.join(', ')} minutes before news</b>\n\n` +
        `<b>To change:</b>\n` +
        `• <code>/newsremind 15</code> — Remind 15 mins before\n` +
        `• <code>/newsremind 30</code> — Remind 30 mins before\n` +
        `• <code>/newsremind 15,60</code> — Multi-stage reminder (60m & 15m)\n` +
        `• <code>/newsremind off</code> — Turn off news reminders\n` +
        `• <code>/newsremind on</code> — Turn on news reminders`
      );
      return;
    }

    if (rawArg === 'off' || rawArg === 'disable' || rawArg === '0') {
      await User.findByIdAndUpdate(user._id, {
        $set: { 'liveWatcherSettings.telegramAlertEvents.goldNewsReminder': false },
      });
      await this.sendMessage(botToken, chatId, `🔕 <b>Gold news reminders have been DISABLED.</b>\nType <code>/newsremind on</code> or <code>/newsremind 15</code> anytime to re-enable.`);
      return;
    }

    if (rawArg === 'on' || rawArg === 'enable') {
      await User.findByIdAndUpdate(user._id, {
        $set: { 'liveWatcherSettings.telegramAlertEvents.goldNewsReminder': true },
      });
      const mins = user.liveWatcherSettings?.goldNewsReminderMinutes || 15;
      await this.sendMessage(botToken, chatId, `🔔 <b>Gold news reminders are ENABLED!</b>\nYou will receive alerts <b>${mins} minutes</b> before high-impact XAUUSD catalysts.`);
      return;
    }

    const parsedMinutes = rawArg
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 1440);

    if (parsedMinutes.length === 0) {
      await this.sendMessage(botToken, chatId, `⚠️ Please specify a valid reminder time in minutes (e.g. <code>/newsremind 15</code> or <code>/newsremind 30,60</code>).`);
      return;
    }

    const primaryMins = parsedMinutes[0];
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'liveWatcherSettings.telegramAlertEvents.goldNewsReminder': true,
        'liveWatcherSettings.goldNewsReminderMinutes': primaryMins,
        'liveWatcherSettings.goldNewsLeadTimesMinutes': parsedMinutes,
      },
    });

    await this.sendMessage(
      botToken,
      chatId,
      `✅ <b>Gold News Reminder Updated!</b>\n\n` +
      `You will receive Telegram alerts <b>${parsedMinutes.join(' & ')} minutes</b> before major Gold-moving news releases.\n` +
      `Check upcoming catalysts anytime with <b>/news</b>.`
    );
  }

  /**
   * Dispatches a Gold (XAUUSD) catalyst alert reminder to the user's Telegram.
   */
  static async sendGoldNewsReminder(
    user: any,
    event: IEconomicCalendarEvent,
    leadTimeMinutes: number
  ): Promise<boolean> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) {
      return false;
    }
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.goldNewsReminder === false) {
      return false;
    }

    if (settings.goldNewsImpactFilter === 'HIGH_IMPACT_ONLY' && event.impact !== 'HIGH') {
      return false;
    }

    const rawToken = settings.telegramBotToken;
    const botToken = safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken);
    const chatId = settings.telegramChatId;
    if (!botToken || !chatId) return false;

    let disableNotification = false;
    if (settings.quietHours?.enabled) {
      const now = new Date();
      const currentHhMm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const { start, end } = settings.quietHours;
      if (start && end) {
        if (start <= end) {
          disableNotification = currentHhMm >= start && currentHhMm <= end;
        } else {
          disableNotification = currentHhMm >= start || currentHhMm <= end;
        }
      }
    }

    const { text, buttons } = EconomicCalendarService.formatGoldNewsTelegramAlert(event, leadTimeMinutes);

    // Check if user has open Gold positions exposed to this news release
    const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
    const openGoldTrades = await Trade.find({
      userId: user._id,
      accountId: { $in: allActiveAccountIds },
      status: 'OPEN',
      symbol: { $regex: /XAU|GOLD/i },
    }).lean();

    let finalText = text;
    const finalButtons: ITelegramInlineButton[][] = [...buttons];

    if (openGoldTrades && openGoldTrades.length > 0) {
      finalText += `\n\n🚨 <b>ACTIVE GOLD EXPOSURE UNDER NEWS RISK:</b>\n`;
      for (const t of openGoldTrades as any[]) {
        const sym = TelegramAlertService.getTradeCurrencySymbol(t);
        const entry = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? t.entryPrice ?? 0);
        const ltp = t.currentLtp || entry;
        const pnl = Number(t.calculated?.floatingNetPnL ?? t.floatingNetPnL ?? 0);
        const qty = t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? t.quantity ?? 0.01;
        const pnlSign = pnl >= 0 ? '+' : '';
        finalText += `• <code>${t.direction} ${qty} ${t.symbol}</code> @ ${sym}${entry.toFixed(2)} | Net: <b>${pnlSign}${sym}${pnl.toFixed(2)}</b>\n`;

        finalButtons.unshift([
          { text: `🛡️ Lock BE (${t.symbol})`, callback_data: `x:${t._id}:BE:1:${Number(ltp.toFixed(2))}` },
          { text: `🚨 Close Position`, callback_data: `x:${t._id}:E:1:${Number(ltp.toFixed(2))}` },
        ]);
      }
      finalText += `<i>Recommended: Lock Breakeven or reduce exposure prior to high-impact release.</i>`;
    }

    try {
      await this.sendMessage(botToken, chatId, finalText, finalButtons, disableNotification);
      return true;
    } catch (err: any) {
      console.warn(`[TelegramAlertService] sendGoldNewsReminder failed for user ${user._id}:`, err.message);
      return false;
    }
  }
}
