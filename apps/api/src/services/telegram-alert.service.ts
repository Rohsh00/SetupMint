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
import { MarketDataService, GlobalCfdCandleProvider } from './market-data/index.js';
import { EconomicCalendarService, IEconomicCalendarEvent } from './economic-calendar.service.js';
import { ITradeCandle, DayRiskRegime, IAdaptiveDayRiskState, IAdaptiveDayRiskTier } from '@tradevault/shared';
import sharp from 'sharp';
import { AudioChimeService } from './audio-chime.service.js';

export interface ITelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface IForexPresets {
  gold: {
    symbol: string;
    defaultLot: number;
    defaultSlPoints: number;
    defaultRr: number;
  };
  eth: {
    symbol: string;
    defaultLot: number;
    defaultSlPrice: number;
    defaultRr: number;
  };
  btc?: {
    symbol: string;
    defaultLot: number;
    defaultSlPoints: number;
    defaultRr: number;
  };
  us30?: {
    symbol: string;
    defaultLot: number;
    defaultSlPoints: number;
    defaultRr: number;
  };
  nas100?: {
    symbol: string;
    defaultLot: number;
    defaultSlPoints: number;
    defaultRr: number;
  };
}

export const DEFAULT_FOREX_PRESETS: IForexPresets = {
  gold: {
    symbol: 'XAUUSD',
    defaultLot: 0.10,
    defaultSlPoints: 35,
    defaultRr: 2.0,
  },
  eth: {
    symbol: 'ETHUSD',
    defaultLot: 1.0,
    defaultSlPrice: 30,
    defaultRr: 2.5,
  },
  btc: {
    symbol: 'BTCUSD',
    defaultLot: 0.05,
    defaultSlPoints: 300,
    defaultRr: 2.5,
  },
  us30: {
    symbol: 'US30',
    defaultLot: 0.10,
    defaultSlPoints: 60,
    defaultRr: 2.5,
  },
  nas100: {
    symbol: 'NAS100',
    defaultLot: 0.10,
    defaultSlPoints: 40,
    defaultRr: 2.5,
  },
};

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
  private static activeCockpitSubmenus = new Map<string, { menu: string; symbol: string; side?: 'BUY' | 'SELL'; expiresAt: number }>();
  private static rateLimitCooldownUntil = 0;
  private static lastPinnedPayloadByMessageId = new Map<number, { text: string; buttonsJson: string; lastSentAt: number }>();

  /**
   * Clears any active cockpit submenu (e.g. order_prep) for a user so that the main live cockpit is shown.
   */
  static clearSubmenu(userId: string | any): void {
    if (!userId) return;
    const uid = typeof userId === 'object' && userId._id ? userId._id.toString() : userId.toString();
    TelegramAlertService.activeCockpitSubmenus.delete(uid);
  }

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
    if (Date.now() < this.rateLimitCooldownUntil) {
      return null;
    }
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
        // Handle Telegram 429 rate limit backoff gracefully
        if (json.parameters && json.parameters.retry_after) {
          const retrySec = Number(json.parameters.retry_after) || 10;
          this.rateLimitCooldownUntil = Date.now() + (retrySec * 1000) + 1000;
          console.warn(`[TelegramAlertService] Telegram rate limit active. Backing off for ${retrySec}s.`);
          return null;
        }
        // Swallow "message is not modified" error from Telegram
        if (json.description && json.description.includes('message is not modified')) {
          return null;
        }
        // If the original message was a photo, edit caption instead!
        if (json.description && json.description.includes('there is no text in the message to edit')) {
          return await this.editMessageCaption(botToken, chatId, messageId, text, buttons);
        }
        if (
          json.description &&
          (json.description.includes('message to edit not found') ||
            json.description.includes('chat not found') ||
            json.description.includes('bot was blocked') ||
            json.description.includes("message can't be edited"))
        ) {
          const err: any = new Error(json.description);
          err.telegramCode = json.error_code;
          throw err;
        }
        console.warn(`[TelegramAlertService] editMessageText notice:`, json.description);
        return null;
      }
      return json.result;
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('message to edit not found') ||
          err.message.includes('chat not found') ||
          err.message.includes('bot was blocked') ||
          err.message.includes("message can't be edited"))
      ) {
        throw err;
      }
      console.warn(`[TelegramAlertService] editMessageText network error:`, err.message);
      return null;
    }
  }

  /**
   * Low-level Telegram pinChatMessage API caller.
   */
  static async pinChatMessage(
    botToken: string | null | undefined,
    chatId: string | number,
    messageId: number,
    disableNotification: boolean = true
  ): Promise<boolean> {
    if (!botToken || !messageId) return false;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return false;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/pinChatMessage`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification,
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as any;
      return Boolean(json && json.ok);
    } catch {
      return false;
    }
  }

  /**
   * Low-level Telegram unpinChatMessage API caller.
   */
  static async unpinChatMessage(
    botToken: string | null | undefined,
    chatId: string | number,
    messageId?: number
  ): Promise<boolean> {
    if (!botToken) return false;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return false;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/unpinChatMessage`;
    const payload: any = {
      chat_id: chatId,
    };
    if (messageId) {
      payload.message_id = messageId;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as any;
      return Boolean(json && json.ok);
    } catch {
      return false;
    }
  }

  /**
   * Low-level Telegram unpinAllChatMessages API caller to clear stacked stale pins.
   */
  static async unpinAllChatMessages(
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<boolean> {
    if (!botToken) return false;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return false;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/unpinAllChatMessages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      });
      const json = (await res.json()) as any;
      return Boolean(json && json.ok);
    } catch {
      return false;
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
   * Dispatches an audible audio chime message with tactile inline buttons to Telegram.
   */
  static async sendAudio(
    botToken: string | null | undefined,
    chatId: string | number,
    audioBuffer: Buffer,
    title: string,
    caption?: string,
    buttons?: ITelegramInlineButton[][],
    disableNotification: boolean = false
  ): Promise<any> {
    if (!botToken) return null;
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) return null;
    const url = `${this.TELEGRAM_API_BASE}/bot${realToken}/sendAudio`;

    try {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      formData.append('title', title);
      formData.append('performer', 'SetupMint Milestone Radar');
      formData.append('audio', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' }), `${title.replace(/\s+/g, '_')}.wav`);
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
        return await this.sendMessage(botToken, chatId, caption || title, buttons, disableNotification);
      }
      return json.result;
    } catch {
      return await this.sendMessage(botToken, chatId, caption || title, buttons, disableNotification);
    }
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
        ...(isProfitableSideOfBe ? [partialScaleRow] : []),
        ...(trailButtons.length > 0 ? [trailButtons] : []),
        ...(includeTimeframes ? [tfRow] : []),
        [
          { text: '💤 Snooze 10m', callback_data: `x:${tradeId}:SZ:${cardVersion}:${roundLtp}` },
          { text: '🔄 Refresh Price & PnL', callback_data: `x:${tradeId}:REF:${cardVersion}:${roundLtp}` },
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

    if (!botToken) return;

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
        `⚠️ <b>EMERGENCY KILLSWITCH CONFIRMATION</b>\n\nAre you sure you want to market-exit ALL open positions across MT5 (Elefin) and FYERS immediately?`,
        [[{ text: '🛑 YES, CLOSE ALL POSITIONS NOW', callback_data: 'confirm_panic' }]]
      );
      return;
    }
    if (data === 'confirm_panic') {
      await this.answerCallbackQuery(botToken, cq.id, '🚨 Flattening all positions on MT5 & FYERS...', true);
      await this.executePanicExit(user, botToken, chatId, messageId);
      return;
    }
    if (data.startsWith('chart_')) {
      const sym = data.replace('chart_', '').toUpperCase();
      await this.answerCallbackQuery(botToken, cq.id, `⏱️ Checking ${sym} chart...`);
      await this.handleChartCommand(user, botToken, chatId, [sym, '5']);
      return;
    }
    if (data.startsWith('price_')) {
      const sym = data.replace('price_', '').toUpperCase();
      await this.answerCallbackQuery(botToken, cq.id, `🔄 Refreshing ${sym} price...`);
      await this.handlePriceCommand(user, botToken, chatId, sym, messageId);
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
    if (data.startsWith('order:')) {
      const parts = data.split(':');
      const [, symbol, side, volumeStr, slPointsStr, tpPointsStr, mode] = parts;
      const volume = parseFloat(volumeStr) || 0.10;
      const slPoints = parseFloat(slPointsStr) || 35;
      const tpPoints = parseFloat(tpPointsStr) || 70;

      if (mode === 'exec') {
        const userIdStr = user._id ? user._id.toString() : '';
        TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
        await this.answerCallbackQuery(botToken, cq.id, `⚡ Sending ${side} ${volume} ${symbol} to MT5...`);
        await this.executeTelegramOrder(user, botToken, chatId, symbol, side as any, volume, slPoints, tpPoints);
        return;
      }

      // If clicked without explicit ':exec' confirmation, report lot options and prompt deeper
      const cleanSym = (symbol || 'XAUUSD').toUpperCase();
      const targetSide: 'BUY' | 'SELL' = (side || 'BUY').toUpperCase() as any;
      const userIdStr = user._id ? user._id.toString() : '';
      TelegramAlertService.activeCockpitSubmenus.set(userIdStr, {
        menu: 'order_prep',
        symbol: cleanSym,
        side: targetSide,
        expiresAt: Date.now() + 120000,
      });
      await this.answerCallbackQuery(botToken, cq.id, `📊 Sizing & Lot Options for ${targetSide} ${cleanSym}...`);
      const updatedPinned = await this.updatePinnedCockpitMessage(user);
      if (!updatedPinned) {
        await this.handleOrderPrepCommand(user, botToken, chatId, cleanSym, targetSide, messageId);
      }
      return;
    }
    if (data.startsWith('prep_order:')) {
      const parts = data.split(':');
      const [, symbol, side] = parts;
      const cleanSym = (symbol || 'XAUUSD').toUpperCase();
      const targetSide: 'BUY' | 'SELL' = (side || 'BUY').toUpperCase() as any;
      const userIdStr = user._id ? user._id.toString() : '';
      TelegramAlertService.activeCockpitSubmenus.set(userIdStr, {
        menu: 'order_prep',
        symbol: cleanSym,
        side: targetSide,
        expiresAt: Date.now() + 120000,
      });
      await this.answerCallbackQuery(botToken, cq.id, `📊 Sizing & Lot Options for ${targetSide} ${cleanSym}...`);
      const updatedPinned = await this.updatePinnedCockpitMessage(user);
      if (!updatedPinned) {
        await this.handleOrderPrepCommand(user, botToken, chatId, cleanSym, targetSide, messageId);
      }
      return;
    }
    if (data === 'cmd_gold_menu') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading Gold Menu...');
      await this.handleForexOrderCommand(user, botToken, chatId, 'XAUUSD', []);
      return;
    }
    if (data === 'cmd_eth_menu') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading ETH Menu...');
      await this.handleForexOrderCommand(user, botToken, chatId, 'ETHUSD', []);
      return;
    }
    if (data === 'cmd_btc_menu') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading Bitcoin Menu...');
      await this.handleForexOrderCommand(user, botToken, chatId, 'BTCUSD', []);
      return;
    }
    if (data === 'cmd_us30_menu') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading US30 Menu...');
      await this.handleForexOrderCommand(user, botToken, chatId, 'US30', []);
      return;
    }
    if (data === 'cmd_nas_menu') {
      await this.answerCallbackQuery(botToken, cq.id, 'Loading NAS100 Menu...');
      await this.handleForexOrderCommand(user, botToken, chatId, 'NAS100', []);
      return;
    }
    if (data.startsWith('pos_voice_hint:')) {
      await this.answerCallbackQuery(botToken, cq.id, '🎙️ Send a voice note now to attach your debrief to this trade!', true);
      return;
    }
    if (data === 'cmd_close_gold') {
      await this.answerCallbackQuery(botToken, cq.id, 'Closing Gold positions on MT5...');
      await this.handleCloseSymbolPositions(user, botToken, chatId, 'XAUUSD');
      return;
    }
    if (data === 'cmd_close_eth') {
      await this.answerCallbackQuery(botToken, cq.id, 'Closing ETH positions on MT5...');
      await this.handleCloseSymbolPositions(user, botToken, chatId, 'ETHUSD');
      return;
    }
    if (data === 'cmd_lock_be_all') {
      await this.answerCallbackQuery(botToken, cq.id, 'Locking Breakeven on all positions...');
      await this.handleLockBeAll(user, botToken, chatId);
      return;
    }
    if (data === 'cmd_pin_cockpit') {
      await this.answerCallbackQuery(botToken, cq.id, 'Pinning Live Cockpit...');
      await this.handlePinCockpitCommand(user, botToken, chatId);
      return;
    }
    if (data === 'cmd_unpin_cockpit') {
      await this.answerCallbackQuery(botToken, cq.id, 'Unpinning Live Cockpit...');
      await this.handleUnpinCockpitCommand(user, botToken, chatId);
      return;
    }
    if (data === 'cmd_cockpit' || data === 'cmd_refresh_cockpit') {
      await this.answerCallbackQuery(botToken, cq.id, 'Refreshing Cockpit...');
      if (messageId) {
        const isPinned = Boolean(user?.liveWatcherSettings?.telegramPinnedCockpitMessageId);
        const { text, buttons } = await this.buildCockpitPayload(user, isPinned);
        const edited = await this.editMessageText(botToken, chatId, messageId, text, buttons);
        if (edited) return;
      }
      await this.handleCockpitCommand(user, botToken, chatId);
      return;
    }

    // Drilldown Submenu Deck Navigation
    if (data.startsWith('deck:')) {
      const parts = data.split(':');
      const menu = parts[1];
      const sym = parts[2];
      const side = (parts[3] as 'BUY' | 'SELL') || 'BUY';
      const userIdStr = user._id ? user._id.toString() : '';
      if (menu === 'back' || menu === 'main') {
        TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
        await this.answerCallbackQuery(botToken, cq.id, '🔙 Back to Cockpit');
        const updatedPinned = await this.updatePinnedCockpitMessage(user);
        if (!updatedPinned && messageId) {
          await this.handleCockpitCommand(user, botToken, chatId);
        }
      } else {
        TelegramAlertService.activeCockpitSubmenus.set(userIdStr, {
          menu,
          symbol: (sym || 'XAUUSD').toUpperCase(),
          side: (side || 'BUY').toUpperCase() as any,
          expiresAt: Date.now() + 120000,
        });
        const label = menu === 'order_prep'
          ? `📊 Sizing & Lot Options for ${side} ${sym}`
          : (menu === 'harvest' ? '🎯 Profit Harvest' : (menu === 'pyramid' ? '➕ Pyramiding' : (menu === 'defense' ? '🛡️ Defense & Trailing' : '📋 Layers')));
        await this.answerCallbackQuery(botToken, cq.id, `Opening ${label}...`);
        const updatedPinned = await this.updatePinnedCockpitMessage(user);
        if (!updatedPinned && messageId) {
          if (menu === 'order_prep') {
            await this.handleOrderPrepCommand(user, botToken, chatId, (sym || 'XAUUSD').toUpperCase(), (side || 'BUY').toUpperCase() as any, messageId);
          }
        }
      }
      return;
    }

    // Drilldown Submenu Execution Actions
    if (data.startsWith('harvest_') || data.startsWith('pyramid_') || data.startsWith('defense_') || data.startsWith('act_close_')) {
      await this.handleCockpitProAction(user, botToken, chatId, data, cq.id);
      return;
    }

    // Dynamic Position Actions (Triggered directly from active position buttons in pinned cockpit)
    if (data.startsWith('pos_close:')) {
      const ticket = parseInt(data.replace('pos_close:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const openQty = Number((trade?.calculated?.openQuantity && trade.calculated.openQuantity > 0)
        ? trade.calculated.openQuantity
        : (trade?.simpleExecution?.quantity || 1));
      if (ticket > 0 && accountId) {
        await Mt5CommandService.queueClosePosition({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          volume: openQty,
        });
        await this.answerCallbackQuery(botToken, cq.id, `🚨 Market Close queued for MT5 #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_half:')) {
      const ticket = parseInt(data.replace('pos_half:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const openQty = Number((trade?.calculated?.openQuantity && trade.calculated.openQuantity > 0)
        ? trade.calculated.openQuantity
        : (trade?.simpleExecution?.quantity || 1));
      const halfQty = Math.max(0.01, Number((openQty / 2).toFixed(2)));
      if (ticket > 0 && accountId) {
        await Mt5CommandService.queueClosePosition({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          volume: halfQty,
        });
        await this.answerCallbackQuery(botToken, cq.id, `🎯 50% partial exit (${halfQty}L) queued for #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_be:')) {
      const ticket = parseInt(data.replace('pos_be:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const entryPrice = Number(trade?.simpleExecution?.entryPrice ?? trade?.calculated?.averageEntryPrice ?? (trade as any)?.entryPrice ?? 0);
      if (ticket > 0 && accountId && entryPrice > 0) {
        await Mt5CommandService.queueModifySl({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          stopLoss: entryPrice,
        });
        if (trade) {
          trade.risk = { ...(trade.risk || {}), currentStopLoss: entryPrice };
          await trade.save().catch(() => {});
        }
        await this.answerCallbackQuery(botToken, cq.id, `🛡️ SL moved to entry ($${entryPrice}) for #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_trail:')) {
      const ticket = parseInt(data.replace('pos_trail:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const entryPrice = Number(trade?.simpleExecution?.entryPrice ?? trade?.calculated?.averageEntryPrice ?? (trade as any)?.entryPrice ?? 0);
      const isLong = trade?.direction === 'LONG';
      const isGold = (trade?.symbol || '').includes('XAU') || trade?.symbol === 'GOLD';
      const stepPts = isGold ? 1.50 : 10.0;
      const trailSl = Number((isLong ? entryPrice + stepPts : entryPrice - stepPts).toFixed(2));
      if (ticket > 0 && accountId && trailSl > 0) {
        await Mt5CommandService.queueModifySl({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          stopLoss: trailSl,
        });
        if (trade) {
          trade.risk = { ...(trade.risk || {}), currentStopLoss: trailSl };
          await trade.save().catch(() => {});
        }
        await this.answerCallbackQuery(botToken, cq.id, `📈 Trailed SL to $${trailSl} for #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_removetp:')) {
      const ticket = parseInt(data.replace('pos_removetp:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const curSl = Number(trade?.risk?.currentStopLoss ?? trade?.risk?.initialStopLoss ?? 0);
      if (ticket > 0 && accountId) {
        await Mt5CommandService.queueModifyTp({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          takeProfit: 0,
          stopLoss: curSl > 0 ? curSl : undefined,
        });
        if (trade) {
          trade.risk = { ...(trade.risk || {}), plannedTarget: undefined };
          if (!trade.tags?.includes('OPEN_RUNNER')) {
            trade.tags = [...(trade.tags || []), 'OPEN_RUNNER'];
          }
          await trade.save().catch(() => {});
        }
        await this.answerCallbackQuery(botToken, cq.id, `🚫 TP Removed! #${ticket} is now running in Open Runner mode.`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_tp:')) {
      const parts = data.split(':');
      const ticket = parseInt(parts[1], 10);
      const newTp = parseFloat(parts[2]);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const curSl = Number(trade?.risk?.currentStopLoss ?? trade?.risk?.initialStopLoss ?? 0);
      if (ticket > 0 && accountId && newTp > 0) {
        await Mt5CommandService.queueModifyTp({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          takeProfit: newTp,
          stopLoss: curSl > 0 ? curSl : undefined,
        });
        if (trade) {
          trade.risk = { ...(trade.risk || {}), plannedTarget: newTp };
          if (trade.tags?.includes('OPEN_RUNNER')) {
            trade.tags = trade.tags.filter((t: string) => t !== 'OPEN_RUNNER');
          }
          await trade.save().catch(() => {});
        }
        await this.answerCallbackQuery(botToken, cq.id, `🎯 Take Profit set to $${newTp.toFixed(2)} for #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_sl:')) {
      const parts = data.split(':');
      const ticket = parseInt(parts[1], 10);
      const newSl = parseFloat(parts[2]);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      const account = trade?.accountId ? await TradingAccount.findById(trade.accountId) : null;
      const accountId = account?._id || trade?.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
      const curTp = Number(trade?.risk?.plannedTarget ?? 0);
      if (ticket > 0 && accountId && newSl > 0) {
        await Mt5CommandService.queueModifySl({
          userId: user._id,
          accountId,
          tradeId: trade?._id,
          ticket,
          stopLoss: newSl,
          takeProfit: curTp > 0 ? curTp : undefined,
        });
        if (trade) {
          trade.risk = { ...(trade.risk || {}), currentStopLoss: newSl };
          await trade.save().catch(() => {});
        }
        await this.answerCallbackQuery(botToken, cq.id, `🛡️ SL moved to $${newSl.toFixed(2)} for #${ticket}`, true);
        await this.updatePinnedCockpitMessage(user);
      }
      return;
    }

    if (data.startsWith('pos_add:')) {
      const ticket = parseInt(data.replace('pos_add:', ''), 10);
      const trade = await Trade.findOne({ userId: user._id, status: 'OPEN', tags: `MT5_TICKET_${ticket}` });
      if (trade) {
        const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
        const presets = user?.liveWatcherSettings?.telegramForexPresets;
        const defaultLot = isGold ? (presets?.goldDefaultLot ?? 0.04) : (presets?.ethDefaultLot ?? 1.0);
        await this.answerCallbackQuery(botToken, cq.id, `➕ Adding ${defaultLot}L scale-in...`, false);
        await this.executeScaleIn(user, botToken, chatId, trade, defaultLot, ticket);
      }
      return;
    }

    if (data === 'cmd_autoexec_on' || data === 'cmd_autoexec_off') {
      const arm = data === 'cmd_autoexec_on';
      if (!user.liveWatcherSettings) (user as any).liveWatcherSettings = {};
      (user.liveWatcherSettings as any).defaultAutoExecute = arm;
      (user.liveWatcherSettings as any).serverSideExecutionEnabled = true;
      await user.save();
      await this.answerCallbackQuery(botToken, cq.id, arm ? '⚡ Auto-Execution Armed for MT5!' : '✋ Auto-Execution Disarmed.');
      await this.handleAutoExecuteToggleCommand(user, botToken, chatId, [arm ? 'on' : 'off']);
      return;
    }

    if (data === 'cmd_close_all') {
      await this.answerCallbackQuery(botToken, cq.id, 'Closing ALL active MT5 positions...');
      const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' });
      let count = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const accountId = t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', '');
        if (ticket && accountId) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? 1,
          });
          count++;
        }
      }
      await this.sendMessage(botToken, chatId, `🚨 <b>Flatten Dispatched:</b> Queued market exit for <b>${count}</b> active position(s) on MT5.`);
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (data === 'cmd_trail_gold' || data === 'cmd_trail_eth') {
      const sym = data === 'cmd_trail_gold' ? 'XAUUSD' : 'ETHUSD';
      await this.answerCallbackQuery(botToken, cq.id, `Trailing SL on ${sym}...`);
      const openTrades = await Trade.find({
        userId: user._id,
        status: 'OPEN',
        symbol: new RegExp(sym, 'i'),
      });
      let count = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entryPrice = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? (t as any).entryPrice ?? 0);
        const isLong = t.direction === 'LONG';
        const isGold = sym === 'XAUUSD';
        const stepPts = isGold ? 1.50 : 10.0;
        const trailSl = Number((isLong ? entryPrice + stepPts : entryPrice - stepPts).toFixed(2));
        if (ticket && entryPrice > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId: t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''),
            tradeId: t._id,
            ticket,
            stopLoss: trailSl,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: trailSl };
          await t.save().catch(() => {});
          count++;
        }
      }
      await this.sendMessage(botToken, chatId, `📈 <b>Trailed SL:</b> Updated <b>${count}</b> ${sym} position(s) on MT5.`);
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (data === 'cmd_be_gold' || data === 'cmd_be_eth') {
      const sym = data === 'cmd_be_gold' ? 'XAUUSD' : 'ETHUSD';
      await this.answerCallbackQuery(botToken, cq.id, `Locking BE on ${sym}...`);
      const openTrades = await Trade.find({
        userId: user._id,
        status: 'OPEN',
        symbol: new RegExp(sym, 'i'),
      });
      let count = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entryPrice = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? (t as any).entryPrice ?? 0);
        if (ticket && entryPrice > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId: t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''),
            tradeId: t._id,
            ticket,
            stopLoss: entryPrice,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: entryPrice };
          await t.save().catch(() => {});
          count++;
        }
      }
      await this.sendMessage(botToken, chatId, `🛡️ <b>Breakeven Locked:</b> Updated <b>${count}</b> ${sym} position(s) on MT5.`);
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (data === 'cmd_half_gold' || data === 'cmd_half_eth') {
      const sym = data === 'cmd_half_gold' ? 'XAUUSD' : 'ETHUSD';
      await this.answerCallbackQuery(botToken, cq.id, `Booking 50% on ${sym}...`);
      const openTrades = await Trade.find({
        userId: user._id,
        status: 'OPEN',
        symbol: new RegExp(sym, 'i'),
      });
      let count = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const openQty = Number(t.simpleExecution?.quantity ?? t.calculated?.openQuantity ?? 1);
        const halfQty = Math.max(0.01, Number((openQty / 2).toFixed(2)));
        if (ticket) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId: t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''),
            tradeId: t._id,
            ticket,
            volume: halfQty,
          });
          count++;
        }
      }
      await this.sendMessage(botToken, chatId, `🎯 <b>Partial Exit:</b> Queued 50% exit for <b>${count}</b> ${sym} position(s) on MT5.`);
      await this.updatePinnedCockpitMessage(user);
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

    // Fast-path: Handle instant live price & PnL refresh
    if (actionCode === 'REF') {
      await this.handleRefreshCallback(user, botToken, chatId, messageId, cq, trade, cardVersion, sym);
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
          (cq.message?.text || cq.message?.caption || '') +
          `\n\n<b>[✅ EXECUTED MARKET EXIT ON ${brokerLabel}]</b>\n` +
          `Order Status: ${statusLabel}\n` +
          `Traded Price: ${sym}${res.tradedPrice || currentLtp} • Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        if (messageId) {
          if (cq.message?.caption !== undefined) {
            await this.editMessageCaption(botToken, chatId, messageId, updateText, []);
          } else {
            await this.editMessageText(botToken, chatId, messageId, updateText, []);
          }
        }

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
        let trueBePrice = (trade.calculated as any)?.trueBreakevenPrice;
        if (!trueBePrice) {
          const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? (trade as any).entryPrice ?? 0);
          try {
            const beRes = calculateTrueBreakeven({
              direction: trade.direction,
              entryPrice,
              quantity: trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? (trade as any).quantity ?? 1,
              estimatedCharges: 50,
            });
            trueBePrice = beRes.trueBreakevenPrice;
          } catch {
            trueBePrice = entryPrice;
          }
        }
        trueBePrice = Number(Number(trueBePrice).toFixed(2));

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

        const brokerStatus = isMt5 ? `DISPATCHED TO MT5 BRIDGE (#${ticket})` : (brokerResult.executedOnBroker ? 'UPDATED ON BROKER' : 'STORED');
        const updateText =
          (cq.message?.text || cq.message?.caption || '') +
          `\n\n<b>[🛡️ STOP LOCKED AT TRUE BREAKEVEN]</b>\n` +
          `SL Level: ${sym}${trueBePrice.toFixed(2)} • Status: ${brokerStatus}\n` +
          `Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        if (messageId) {
          if (cq.message?.caption !== undefined) {
            await this.editMessageCaption(botToken, chatId, messageId, updateText, []);
          } else {
            await this.editMessageText(botToken, chatId, messageId, updateText, []);
          }
        }

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
          (cq.message?.text || cq.message?.caption || '') +
          `\n\n<b>[🔒 STOP LOSS TRAILED TO +${pips} PIPS]</b>\n` +
          `New SL: ${sym}${targetSl.toFixed(2)} • Status: ${brokerStatus}\n` +
          `Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        if (messageId) {
          if (cq.message?.caption !== undefined) {
            await this.editMessageCaption(botToken, chatId, messageId, updateText, []);
          } else {
            await this.editMessageText(botToken, chatId, messageId, updateText, []);
          }
        }

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
          (cq.message?.text || cq.message?.caption || '') +
          `\n\n<b>[🎯 ${pct}% PARTIAL PROFIT BOOKED]</b>\n` +
          `Qty Closed: ${closeQty} • Traded: ${sym}${res.tradedPrice || currentLtp}\n` +
          `Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        if (messageId) {
          if (cq.message?.caption !== undefined) {
            await this.editMessageCaption(botToken, chatId, messageId, updateText, []);
          } else {
            await this.editMessageText(botToken, chatId, messageId, updateText, []);
          }
        }

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
          (cq.message?.text || cq.message?.caption || '') +
          `\n\n<b>[🎯 TARGET T${stepNum} SCALED OUT VIA TELEGRAM]</b>\n` +
          `Qty Closed: ${exitQty} • Traded: ${sym}${res.tradedPrice || currentLtp}\n` +
          `Stop Trailed: ${newStopLoss ? `${sym}${newStopLoss.toFixed(2)}` : 'Unchanged'}\n` +
          `Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

        if (messageId) {
          if (cq.message?.caption !== undefined) {
            await this.editMessageCaption(botToken, chatId, messageId, updateText, []);
          } else {
            await this.editMessageText(botToken, chatId, messageId, updateText, []);
          }
        }

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
        await this.handleRefreshCallback(user, botToken, chatId, messageId, cq, trade, cardVersion, sym);
        return;
      }
    } catch (err: any) {
      console.error('[TelegramAlertService] Action execution failed:', err);
      await this.sendMessage(botToken, chatId, `❌ Action failed: ${err.message}`);
    }
  }

  /**
   * Refreshes an active trade card in-place with latest live LTP, floating PnL, and distance to Stop Loss.
   */
  private static async handleRefreshCallback(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    messageId: number | undefined,
    cq: any,
    trade: any,
    cardVersion: number,
    sym: string
  ): Promise<void> {
    const isMt5 = trade.tags?.includes('MT5') || trade.tags?.includes('ELEFIN') || trade.exchange === 'FOREX';
    const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? trade.entryPrice ?? 0);
    const mult = trade.contractMultiplier || trade.simpleExecution?.contractMultiplier || 1;
    const isLong = trade.direction === 'LONG';

    // 1. Fetch live summary for user's accounts
    let pos: any = null;
    let providerName = isMt5 ? 'MT5 Bridge' : 'Live Feed';
    try {
      const summary = await LiveWatcherService.getLiveWatcherSummary(
        user._id.toString(),
        trade.accountId ? [trade.accountId] : undefined
      );
      if (summary?.provider) providerName = summary.provider;
      if (summary?.positions && summary.positions.length > 0) {
        pos = summary.positions.find(
          (p: any) =>
            p.tradeId === trade._id.toString() ||
            (p.symbol === trade.symbol && p.direction === trade.direction)
        );
      }
    } catch (err: any) {
      console.warn('[handleRefreshCallback] LiveWatcherSummary error:', err.message);
    }

    // 2. Resolve current LTP and PnL
    let curLtp = pos?.currentLtp || 0;
    if (curLtp <= 0) {
      const mt5Quote = Mt5CommandService.getLiveQuote(trade.symbol, trade.accountId?.toString());
      if (mt5Quote && mt5Quote.ltp > 0) {
        curLtp = mt5Quote.ltp;
        providerName = 'MT5 Elefin Live';
      } else if (GlobalCfdCandleProvider.isSupportedGlobalSymbol(trade.symbol)) {
        try {
          const gqMap = await GlobalCfdCandleProvider.getLiveQuotes([trade.symbol]);
          const gq = gqMap.get(trade.symbol);
          if (gq && gq.ltp > 0) {
            curLtp = gq.ltp;
            providerName = 'Global Real-Time Feed';
          }
        } catch {
          // Fallback below
        }
      }
    }

    if (curLtp <= 0) {
      curLtp = trade.calculated?.liveMfeSummary?.peakLtp || entryPrice;
    }

    const qty = pos?.quantity ?? trade.calculated?.openQuantity ?? trade.quantity ?? trade.simpleExecution?.quantity ?? 1;
    const netPnL = pos
      ? pos.floatingNetPnL
      : (isLong ? (curLtp - entryPrice) * qty * mult : (entryPrice - curLtp) * qty * mult);
    const pnlSign = netPnL >= 0 ? '+' : '';
    const plannedRisk = trade.risk?.initialStopLoss
      ? Math.abs(entryPrice - trade.risk.initialStopLoss) * qty * mult
      : (trade.risk?.plannedRiskAmount || 0);
    const unR = pos?.unrealizedR ?? (plannedRisk > 0 ? netPnL / plannedRisk : 0);
    const rSign = unR >= 0 ? '+' : '';

    const stopVal = pos?.stopLoss ?? trade.risk?.currentStopLoss ?? trade.risk?.initialStopLoss ?? trade.stopLoss;
    const distPts = stopVal && curLtp > 0 ? Math.abs(curLtp - Number(stopVal)).toFixed(1) : null;
    const stopInfo = stopVal ? `${sym}${stopVal}${distPts ? ` (${distPts} pts)` : ''}` : 'NO STOP (NAKED)';
    const beVal = pos?.trueBreakevenPrice ?? (trade.calculated as any)?.trueBreakevenPrice ?? entryPrice;
    const beInfo = `${sym}${Number(beVal).toFixed(2)}`;

    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    const refreshText =
      `📊 <b>${trade.symbol}</b> (<code>${trade.direction}</code>) • <b>LIVE UPDATE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Entry    : ${sym}${entryPrice.toFixed(2)}  |  LTP: ${sym}${curLtp.toFixed(2)}\n` +
      `Net PnL  : ${pnlSign}${sym}${netPnL.toFixed(2)} (${rSign}${unR.toFixed(2)}R)\n` +
      `Quantity : ${qty} ${mult > 1 ? `lots (${qty * mult} units)` : 'units'}\n` +
      `StopLoss : ${stopInfo}\n` +
      `True BE  : ${beInfo}\n` +
      (trade.tradingSession ? `Session  : ${trade.tradingSession}\n` : '') +
      `</pre>\n` +
      `<i>Status: ${providerName} • Updated at ${timeStr} IST</i>`;

    const newButtons = this.buildContextualKeyboard(
      {
        _id: trade._id,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice,
        calculated: {
          trueBreakevenPrice: beVal,
          openQuantity: qty,
        },
      },
      'STOP_THREAT',
      curLtp,
      cardVersion + 1,
      false,
      true // includeTimeframes
    );

    if (messageId) {
      if (cq.message?.caption !== undefined) {
        await this.editMessageCaption(botToken, chatId, messageId, refreshText, newButtons);
      } else {
        await this.editMessageText(botToken, chatId, messageId, refreshText, newButtons);
      }
    }

    await this.answerCallbackQuery(
      botToken,
      cq.id,
      `⚡ ${trade.symbol} LTP: ${sym}${curLtp.toFixed(2)} | PnL: ${pnlSign}${sym}${netPnL.toFixed(2)}`,
      false
    );
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
          `• <b>/gold [buy|sell] [vol]</b> — 1-tap Gold trade with preset SL & TP (e.g. <code>/gold buy 0.10</code>)\n` +
          `• <b>/eth [buy|sell] [vol]</b> — 1-tap ETH trade with preset SL & TP (e.g. <code>/eth buy 1.0</code>)\n` +
          `• <b>/trade</b> or <b>/cockpit</b> — Full interactive 1-tap execution grid\n` +
          `• <b>/pin</b> — Pin live price & positions header with cut-to-cut auto-refresh\n` +
          `• <b>/unpin</b> — Unpin live cockpit header and stop auto-refresh ticker\n` +
          `• <b>/close [gold|eth]</b> — Close active positions for symbol (or all)\n` +
          `• <b>/risk &lt;gold|eth&gt; &lt;$amt&gt;</b> — Auto-calculate lot size from dollar risk\n` +
          `• <b>/price [symbol]</b> — Live real-time market quote & spread (e.g. <code>/price XAUUSD</code>)\n` +
          `• <b>/pnl</b> — Live floating PnL, open R-multiple & day PnL\n` +
          `• <b>/trades</b> — List active open trades with live charts & 1-tap Exit\n` +
          `• <b>/sl &lt;price&gt;</b> — Set or trail Stop Loss directly (e.g. <code>/sl 2735.50</code> or reply with price)\n` +
          `• <b>/chart [timeframe]</b> — Instant live candlestick chart (1m, 5m, 15m, 1h)\n` +
          `• <b>/summary</b> — Today's performance stats, win rate & harvested R\n` +
          `• <b>/news</b> — Upcoming XAUUSD / Gold catalysts & countdown\n` +
          `• <b>/newsremind &lt;mins&gt;</b> — Set custom alert reminder (e.g. <code>/newsremind 15</code> or <code>/newsremind off</code>)\n` +
          `• <b>/alerts</b> — List active alert states and snoozed trades\n` +
          `• <b>/snooze</b> — Snooze alerts for 15 minutes\n` +
          `• <b>/mute &lt;mins&gt;</b> — Mute audible notifications\n` +
          `• <b>/panic</b> — Emergency killswitch to market-exit all positions across MT5 & FYERS\n\n` +
          `<i>Connected account: ${user.name || user.email}</i>`
        );
        break;

      case '/gold':
      case '/xau':
      case 'gold':
      case 'xau':
        await this.handleForexOrderCommand(user, botToken, chatId, 'XAUUSD', args);
        break;

      case '/eth':
      case '/ethereum':
      case 'eth':
        await this.handleForexOrderCommand(user, botToken, chatId, 'ETHUSD', args);
        break;

      case '/btc':
      case '/bitcoin':
      case 'btc':
        await this.handleForexOrderCommand(user, botToken, chatId, 'BTCUSD', args);
        break;

      case '/us30':
      case '/dow':
      case 'us30':
        await this.handleForexOrderCommand(user, botToken, chatId, 'US30', args);
        break;

      case '/nas':
      case '/nas100':
      case '/ustec':
      case 'nas100':
      case 'nas':
        await this.handleForexOrderCommand(user, botToken, chatId, 'NAS100', args);
        break;

      case '/autoexecute':
      case '/autotrade':
      case '/ladder':
      case 'autoexecute':
      case 'autotrade':
      case 'ladder':
        await this.handleAutoExecuteToggleCommand(user, botToken, chatId, args);
        break;

      case '/add':
      case '/pyramid':
        await this.handlePyramidingCommand(user, botToken, chatId, args);
        break;

      case '/limit':
      case '/buylimit':
      case '/selllimit':
      case '/stoporder':
      case '/buystop':
      case '/sellstop':
        await this.handlePendingOrderCommand(user, botToken, chatId, command, args);
        break;

      case '/trade':
      case '/cockpit':
      case 'trade':
      case 'cockpit':
        await this.handleCockpitCommand(user, botToken, chatId);
        break;

      case '/pin':
      case 'pin':
        await this.handlePinCockpitCommand(user, botToken, chatId);
        break;

      case '/unpin':
      case '/stoppin':
      case 'unpin':
      case 'stoppin':
        await this.handleUnpinCockpitCommand(user, botToken, chatId);
        break;

      case '/close':
      case 'close': {
        const target = (args[0] || '').toLowerCase();
        if (target.includes('gold') || target.includes('xau')) {
          await this.handleCloseSymbolPositions(user, botToken, chatId, 'XAUUSD');
        } else if (target.includes('eth')) {
          await this.handleCloseSymbolPositions(user, botToken, chatId, 'ETHUSD');
        } else {
          await this.sendMessage(
            botToken,
            chatId,
            `🚨 <b>Close Positions</b>\nSelect an asset to exit:`,
            [
              [
                { text: '🚨 Close All Gold', callback_data: 'cmd_close_gold' },
                { text: '🚨 Close All ETH', callback_data: 'cmd_close_eth' },
              ],
              [
                { text: '🛑 Emergency Panic Exit All', callback_data: 'confirm_panic' },
              ],
            ]
          );
        }
        break;
      }

      case '/price':
      case '/quote':
      case 'price':
      case 'quote':
        await this.handlePriceCommand(user, botToken, chatId, args[0]);
        break;

      case '/risk':
      case '/prop':
      case '/drawdown':
        if (args.length > 0) {
          await this.handleRiskCalculatorCommand(user, botToken, chatId, args);
        } else {
          await this.handleRiskCommand(user, botToken, chatId);
        }
        break;

      case '/sl':
      case 'sl':
        await this.handleCustomStopLossCommand(user, botToken, chatId, args, msg);
        break;

      case '/tp':
      case 'tp':
        await this.handleCustomTakeProfitCommand(user, botToken, chatId, args, msg);
        break;

      case '/removetp':
      case 'removetp':
      case '/canceltp':
      case 'canceltp':
        await this.handleRemoveTakeProfitCommand(user, botToken, chatId, args, msg);
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
          `⚠️ <b>EMERGENCY KILLSWITCH REQUESTED</b>\n\nDo you want to immediately market-exit ALL open positions across MT5 (Elefin) and FYERS?`,
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
      // 1b. Check if voice note or audio comes with a command caption or transcription
      const voiceText = (msg.caption || msg.voice?.transcript || msg.voice?.transcription || '').trim();
      if (voiceText) {
        const lower = voiceText.toLowerCase();
        if (
          lower.startsWith('/') ||
          lower.includes('buy') ||
          lower.includes('sell') ||
          lower.includes('close') ||
          lower.includes('flatten') ||
          lower.includes('lock') ||
          lower.includes('trail') ||
          lower.includes('limit') ||
          lower.includes('pyramid')
        ) {
          await this.handleTextMessage({ ...msg, text: voiceText }, knownBotToken);
        }
      }

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
   * Generates and sends an on-demand live market quote card.
   * Usage: /price [symbol] or /quote [symbol] (e.g. /price XAUUSD)
   */
  private static async handlePriceCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    symbolArg?: string,
    messageIdToEdit?: number
  ): Promise<void> {
    let symbol = (symbolArg || '').trim().toUpperCase();

    // If no symbol passed, try to get symbol of most recent open trade
    if (!symbol) {
      const openTrade = await Trade.findOne({
        userId: user._id,
        status: 'OPEN',
      }).sort({ entryTime: -1 }).select('symbol').lean();
      symbol = openTrade?.symbol || 'XAUUSD';
    }

    const isForexOrGold =
      symbol.includes('XAU') ||
      symbol.includes('EUR') ||
      symbol.includes('USD') ||
      symbol.includes('GBP') ||
      symbol.includes('BTC') ||
      symbol === 'GOLD';

    const curSym = isForexOrGold ? '$' : '₹';

    let ltp: number = 0;
    let bid: number = 0;
    let ask: number = 0;
    let high: number = 0;
    let low: number = 0;
    let prevClose: number = 0;
    let providerName = 'SetupMint Live Feed';

    // 1. Try MT5 Live Quote
    const mt5Quote = Mt5CommandService.getLiveQuote(symbol);
    if (mt5Quote && mt5Quote.ltp > 0) {
      ltp = mt5Quote.ltp;
      bid = mt5Quote.bid || ltp;
      ask = mt5Quote.ask || ltp;
      providerName = 'MT5 Elefin Live Bridge';
    }

    // 2. Try Global CFD provider for Forex/Metals/Crypto
    if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(symbol)) {
      try {
        const quotes = await GlobalCfdCandleProvider.getLiveQuotes([symbol]);
        const gq = quotes.get(symbol);
        if (gq && gq.ltp > 0) {
          ltp = gq.ltp;
          bid = (gq as any).bid || (gq.ltp - 0.20);
          ask = (gq as any).ask || (gq.ltp + 0.20);
          high = gq.high || ltp;
          low = gq.low || ltp;
          prevClose = gq.open || ltp;
          providerName = 'Global Real-Time Feed';
        }
      } catch (err: any) {
        console.warn(`[handlePriceCommand] GlobalCfd quote error for ${symbol}:`, err.message);
      }
    }

    // 3. Try FYERS quote
    if (ltp === 0) {
      try {
        const quotes = await FyersService.getMarketQuotes(user._id, [symbol]);
        const fq = quotes.get(symbol);
        if (fq && fq.ltp > 0) {
          ltp = fq.ltp;
          bid = (fq as any).bid || ltp;
          ask = (fq as any).ask || ltp;
          high = fq.high || ltp;
          low = fq.low || ltp;
          prevClose = fq.prevClose || fq.open || ltp;
          providerName = 'FYERS Real-Time';
        }
      } catch (err: any) {
        console.warn(`[handlePriceCommand] FYERS quote error for ${symbol}:`, err.message);
      }
    }

    // 4. Fallback to most recent trade in DB
    if (ltp === 0) {
      const recentTrade = await Trade.findOne({
        userId: user._id,
        symbol: new RegExp(symbol, 'i'),
      }).sort({ createdAt: -1 });

      if (recentTrade) {
        ltp = recentTrade.calculated?.liveMfeSummary?.peakLtp || recentTrade.simpleExecution?.entryPrice || 0;
        providerName = 'Last Recorded Fill';
      }
    }

    if (ltp === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Market Quote Unavailable</b>\n\nCould not fetch real-time market data for <code>${symbol}</code>. Verify the symbol name or try again shortly.`
      );
      return;
    }

    const spreadPips = ask > 0 && bid > 0
      ? (isForexOrGold ? ((ask - bid) / (symbol.includes('XAU') ? 0.10 : 0.0001)).toFixed(1) : (ask - bid).toFixed(2))
      : '0.0';
    const spreadDiff = ask > 0 && bid > 0 ? (ask - bid).toFixed(2) : '0.00';

    const dayChange = prevClose > 0 ? ltp - prevClose : 0;
    const dayChangePct = prevClose > 0 ? ((dayChange / prevClose) * 100).toFixed(2) : '0.00';
    const changeSign = dayChange >= 0 ? '+' : '';

    const text =
      `🪙 <b>${symbol} • Real-Time Market Quote</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `LTP       : ${curSym}${ltp.toFixed(2)}\n` +
      (bid > 0 && ask > 0 ? `Bid / Ask : ${curSym}${bid.toFixed(2)} / ${curSym}${ask.toFixed(2)}\n` : '') +
      (spreadDiff !== '0.00' ? `Spread    : ${spreadPips} pips (${curSym}${spreadDiff})\n` : '') +
      (high > 0 && low > 0 ? `Day Range : ${curSym}${low.toFixed(2)} - ${curSym}${high.toFixed(2)}\n` : '') +
      (prevClose > 0 ? `Change    : ${changeSign}${curSym}${dayChange.toFixed(2)} (${changeSign}${dayChangePct}%)\n` : '') +
      `</pre>\n` +
      `<i>Feed: ${providerName} • ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        { text: '🔄 Refresh Price', callback_data: `price_${symbol}` },
        { text: '📈 5m Chart', callback_data: `chart_${symbol.toLowerCase()}` },
      ],
      [
        { text: '📋 View Open Trades', callback_data: 'cmd_trades' },
        { text: '📊 Portfolio /pnl', callback_data: 'cmd_pnl' },
      ],
    ];

    if (messageIdToEdit) {
      await this.editMessageText(botToken, chatId, messageIdToEdit, text, buttons);
    } else {
      await this.sendMessage(botToken, chatId, text, buttons);
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
   * Executes emergency two-step panic flattening across all open positions (both MT5/Elefin and FYERS).
   */
  private static async executePanicExit(user: any, botToken: string | null | undefined, chatId: string | number, messageId?: number): Promise<void> {
    const openTrades = await Trade.find({
      userId: user._id,
      status: 'OPEN',
    });
    if (openTrades.length === 0) {
      await this.sendMessage(botToken, chatId, `ℹ️ No open positions to flatten. Capital is 100% safe.`);
      return;
    }

    let mt5Closed = 0;
    let fyersClosed = 0;
    let failedCount = 0;

    for (const t of openTrades) {
      try {
        const openQty = t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? (t as any).quantity ?? 1;
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const isMt5 = Mt5CommandService.isMt5Trade(t, account);
        const ticket = isMt5 ? Mt5CommandService.extractTicket(t) : null;

        if (isMt5 && ticket) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId: (account?._id || t.accountId)!,
            tradeId: t._id,
            ticket,
            volume: openQty,
          });
          mt5Closed++;
        } else {
          await FyersService.executeBrokerExit(user._id, t._id.toString(), { exitQty: openQty, isFullClose: true });
          fyersClosed++;
        }

        t.auditLog.push({
          action: 'TELEGRAM_PANIC_EXIT',
          timestamp: new Date(),
          details: { text: `Emergency panic exit executed via Telegram killswitch (${isMt5 ? `MT5 #${ticket}` : 'FYERS'})` },
          changedBy: 'telegram',
        });
        await t.save();
      } catch (err: any) {
        console.error(`[PanicExit] Failed for trade ${t._id}:`, err.message);
        failedCount++;
      }
    }

    const report =
      `🛑 <b>PANIC KILLSWITCH COMPLETED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Targeted Positions : ${openTrades.length}\n` +
      `• MT5 (Elefin) Queued : ${mt5Closed}\n` +
      `• FYERS Market Exits   : ${fyersClosed}\n` +
      (failedCount > 0 ? `• Failed Exits         : ${failedCount}\n` : '') +
      `\n<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    if (messageId) {
      try {
        await this.editMessageText(botToken, chatId, messageId, report, []);
        return;
      } catch {
        // Fall back to sendMessage
      }
    }
    await this.sendMessage(botToken, chatId, report);
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
    const metricIdentity = metrics?.Ticket || (metrics as any)?.ExecutionId || '';
    const dedupeKey = metricIdentity ? `${chatId}:${title}:${metricIdentity}` : `${chatId}:${title}:${body.slice(0, 30)}`;
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
    // Clear any pre-order submenu state immediately so cockpit flips to active positions
    TelegramAlertService.clearSubmenu(user._id);

    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.tradeOpened === false) return;

    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
    const mult = trade.contractMultiplier || trade.simpleExecution?.contractMultiplier || 1;
    const qty = trade.quantity || trade.simpleExecution?.quantity || 1;
    const entry = trade.entryPrice || trade.simpleExecution?.entryPrice || 0;
    const sl = initialStopLoss ?? trade.risk?.initialStopLoss ?? trade.stopLoss ?? 'None';
    const riskAmt = sl !== 'None' ? Math.abs(entry - Number(sl)) * qty * mult : trade.risk?.plannedRiskAmount;
    const ticket = Mt5CommandService.extractTicket(trade);

    const numSl = sl !== 'None' ? Number(sl) : 0;
    const isLong = (trade.direction as string) === 'LONG' || (trade.direction as string) === 'BUY';
    const isGold = (trade.symbol || '').includes('XAU') || trade.symbol === 'GOLD';
    const defaultPts = isGold ? 4.0 : 15.0;
    const riskDist = (numSl > 0 && entry > 0) ? Math.abs(entry - numSl) : defaultPts;

    const tp15 = Number((isLong ? entry + 1.5 * riskDist : entry - 1.5 * riskDist).toFixed(2));
    const tp20 = Number((isLong ? entry + 2.0 * riskDist : entry - 2.0 * riskDist).toFixed(2));
    const tp30 = Number((isLong ? entry + 3.0 * riskDist : entry - 3.0 * riskDist).toFixed(2));

    const openedButtons: ITelegramInlineButton[][] = [];
    if (ticket) {
      openedButtons.push([
        { text: `🛡️ Lock BE ($${entry.toFixed(2)})`, callback_data: `pos_be:${ticket}` },
        { text: '🚫 Remove TP (Runner)', callback_data: `pos_removetp:${ticket}` },
      ]);
      openedButtons.push([
        { text: `🎯 +1.5R ($${tp15})`, callback_data: `pos_tp:${ticket}:${tp15}` },
        { text: `🎯 +2R ($${tp20})`, callback_data: `pos_tp:${ticket}:${tp20}` },
        { text: `🎯 +3R ($${tp30})`, callback_data: `pos_tp:${ticket}:${tp30}` },
      ]);
      openedButtons.push([
        { text: '🎯 Book 50%', callback_data: `pos_half:${ticket}` },
        { text: '📈 Trail +1R', callback_data: `pos_trail:${ticket}` },
        { text: '🚨 Close (100%)', callback_data: `pos_close:${ticket}` },
      ]);
      openedButtons.push([
        { text: '🔄 Refresh Price & PnL', callback_data: `x:${trade._id}:REF:1:${entry}` },
        { text: '📈 5m Chart', callback_data: `x:${trade._id}:CHART_5:1:${entry}` },
      ]);
    } else {
      openedButtons.push([
        { text: '🔄 Refresh Price & PnL', callback_data: `x:${trade._id}:REF:1:${entry}` },
        { text: '📈 5m Chart', callback_data: `x:${trade._id}:CHART_5:1:${entry}` },
      ]);
      openedButtons.push([
        { text: '🛡️ Lock Breakeven', callback_data: `x:${trade._id}:BE:1:${entry}` },
        { text: '⚡ Book 50%', callback_data: `x:${trade._id}:B50:1:${entry}` },
      ]);
      openedButtons.push([
        { text: '🚨 Quick Market Exit (100%)', callback_data: `x:${trade._id}:E:1:${entry}` },
      ]);
    }

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
        ...(ticket ? { Ticket: `#${ticket}` } : {}),
        StopLoss: sl !== 'None' ? `${sym}${sl}` : 'NO STOP (NAKED)',
        InitialRisk: riskAmt ? `${sym}${Number(riskAmt).toFixed(2)}` : 'Unspecified',
        ...(trade.tradingSession ? { Session: trade.tradingSession } : {}),
      },
      buttons: openedButtons,
    });

    // Automatically pin (or update in-place) the live cockpit with open positions and dynamic action triggers
    await this.autoPinOrUpdateCockpit(user).catch(() => {});
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

    // Deduplication Guard: Check if a TRADE_CLOSED notification was already sent for this trade
    const existingClosedAlert = await AlertState.findOne({
      userId: user._id,
      tradeId: trade._id,
      type: 'TRADE_CLOSED',
    });
    if (existingClosedAlert) return;

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
        `Execution Rating: <b>${rating}</b>\n\n` +
        `🎙️ <b>Voice Debrief:</b> Hold 🎙️ mic in Telegram to attach an audio reflection to this trade's journal.`,
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
          { text: '🎙️ Record Voice Debrief', callback_data: `pos_voice_hint:${trade._id}` },
          { text: '📊 Daily Summary', callback_data: 'cmd_summary' },
        ],
        [
          { text: '🛡️ Prop Risk (/risk)', callback_data: 'cmd_risk' },
          { text: '📌 View Cockpit', callback_data: 'cmd_refresh_cockpit' },
        ],
      ],
    });

    // Persist idempotency marker so repeated sync/backfill passes never re-send this closed alert
    if (trade._id) {
      await AlertState.updateOne(
        { userId: user._id, tradeId: trade._id, type: 'TRADE_CLOSED' },
        {
          $setOnInsert: {
            userId: user._id,
            tradeId: trade._id,
            type: 'TRADE_CLOSED',
            state: 'RESOLVED',
            severity: isWin ? 0 : 2,
            chatId: String(chatId),
            resolvedAt: new Date(),
          },
        },
        { upsert: true }
      ).catch(() => {});
    }

    // Automatically refresh pinned cockpit card to reflect trade closure (removes closed trade or reverts to FLAT)
    await this.updatePinnedCockpitMessage(user).catch(() => {});
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
      const cleanSpecified = specifiedSymbol === 'GOLD' || specifiedSymbol === 'XAU' ? 'XAUUSD' : (specifiedSymbol === 'ETH' || specifiedSymbol === 'ETHEREUM' ? 'ETHUSD' : specifiedSymbol);
      tradeQuery.symbol = new RegExp(cleanSpecified, 'i');
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
    const mtQuote = trade.symbol ? Mt5CommandService.getLiveQuote(trade.symbol) : null;
    const currentLtp = mtQuote?.ltp || (trade as any).currentLtp || trade.calculated?.liveMfeSummary?.peakLtp || trade.simpleExecution?.entryPrice || 0;

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
   * Adjusts Take Profit directly from Telegram text command (/tp <price> or /tp none).
   */
  private static async handleCustomTakeProfitCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[],
    msg?: any
  ): Promise<void> {
    if (!botToken) return;

    // Check for remove keywords
    const isRemove = args.some(a => ['none', '0', 'remove', 'off', 'cancel', 'clear'].includes(a.toLowerCase().trim()));
    if (isRemove) {
      await this.handleRemoveTakeProfitCommand(user, botToken, chatId, args, msg);
      return;
    }

    let targetPriceStr: string | undefined;
    let specifiedSymbol: string | undefined;

    for (const arg of args) {
      const clean = arg.replace('$', '').replace('₹', '').trim();
      if (/^\d+(\.\d+)?$/.test(clean)) {
        targetPriceStr = clean;
      } else if (/^[A-Za-z0-9_]+$/.test(clean) && clean.toUpperCase() !== 'TP') {
        specifiedSymbol = clean.toUpperCase();
      }
    }

    if (!targetPriceStr) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Missing Take Profit Price</b>\n\n` +
        `Usage:\n` +
        `• <code>/tp &lt;price&gt;</code> (e.g. <code>/tp 2680.00</code>)\n` +
        `• <code>/tp &lt;symbol&gt; &lt;price&gt;</code> (e.g. <code>/tp XAUUSD 2680.00</code>)\n` +
        `• <code>/removetp</code> — Clears TP for Runner mode!`
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
      const cleanSpecified = specifiedSymbol === 'GOLD' || specifiedSymbol === 'XAU' ? 'XAUUSD' : (specifiedSymbol === 'ETH' || specifiedSymbol === 'ETHEREUM' ? 'ETHUSD' : specifiedSymbol);
      tradeQuery.symbol = new RegExp(cleanSpecified, 'i');
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
        `❌ <b>No Active Open Trade Found</b>\n\nThere are no open positions matching your request to set Take Profit to $${targetPrice.toFixed(2)}.`
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
        `⚠️ <b>Multiple Open Positions Active</b>\n\nPlease specify symbol:\n<code>/tp &lt;symbol&gt; ${targetPrice}</code>\n\nActive positions:\n${tradeList}`
      );
      return;
    }

    const trade = matchingTrades[0];
    const isLong = (trade.direction as string) === 'LONG' || (trade.direction as string) === 'BUY';
    const sym = TelegramAlertService.getTradeCurrencySymbol(trade);
    const mtQuote = trade.symbol ? Mt5CommandService.getLiveQuote(trade.symbol) : null;
    const currentLtp = mtQuote?.ltp || (trade as any).currentLtp || trade.simpleExecution?.entryPrice || 0;

    if (isLong && currentLtp > 0 && targetPrice <= currentLtp) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Invalid Take Profit:</b>\nFor a <b>LONG</b> position on ${trade.symbol}, Take Profit (${sym}${targetPrice.toFixed(2)}) must be <b>above</b> the current market price (${sym}${currentLtp.toFixed(2)}).`
      );
      return;
    }
    if (!isLong && currentLtp > 0 && targetPrice >= currentLtp) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Invalid Take Profit:</b>\nFor a <b>SHORT</b> position on ${trade.symbol}, Take Profit (${sym}${targetPrice.toFixed(2)}) must be <b>below</b> the current market price (${sym}${currentLtp.toFixed(2)}).`
      );
      return;
    }

    const oldTp = trade.risk?.plannedTarget;
    trade.risk = {
      ...(trade.risk || {}),
      plannedTarget: targetPrice,
    };
    if (trade.tags?.includes('OPEN_RUNNER')) {
      trade.tags = trade.tags.filter((t: string) => t !== 'OPEN_RUNNER');
    }

    const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
    const isMt5 = Mt5CommandService.isMt5Trade(trade, account);
    const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;
    const curSl = Number(trade.risk?.currentStopLoss ?? trade.risk?.initialStopLoss ?? 0);

    let brokerStatus = 'Stored in SetupMint Journal';
    if (isMt5 && ticket) {
      await Mt5CommandService.queueModifyTp({
        userId: user._id,
        accountId: (account?._id || trade.accountId)!,
        tradeId: trade._id,
        ticket,
        takeProfit: targetPrice,
        stopLoss: curSl > 0 ? curSl : undefined,
      });
      brokerStatus = `⚡ Dispatched to MT5 Server Bridge (Ticket #${ticket})`;
    }

    trade.auditLog.push({
      action: 'TELEGRAM_SET_TP',
      timestamp: new Date(),
      details: {
        text: `Take Profit updated to ${sym}${targetPrice.toFixed(2)} via Telegram command`,
        previousTp: oldTp,
      },
      changedBy: 'telegram',
    });
    await trade.save();

    await this.sendMessage(
      botToken,
      chatId,
      `🎯 <b>TAKE PROFIT UPDATED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Symbol   : ${trade.symbol} (${trade.direction})\n` +
      `New TP   : ${sym}${targetPrice.toFixed(2)}\n` +
      `Old TP   : ${oldTp ? `${sym}${Number(oldTp).toFixed(2)}` : 'Open (Runner)'}\n` +
      `Market   : ${sym}${currentLtp.toFixed(2)}\n` +
      `Status   : ${brokerStatus}\n` +
      `</pre>\n` +
      `<i>Updated at ${new Date().toLocaleTimeString('en-IN')} IST</i>`,
      ticket
        ? [
            [
              { text: '🚫 Remove TP (Runner)', callback_data: `pos_removetp:${ticket}` },
              { text: '🛡️ Lock BE', callback_data: `pos_be:${ticket}` },
            ],
            [
              { text: '🚨 Close Position', callback_data: `pos_close:${ticket}` },
              { text: '📌 Refresh Cockpit', callback_data: 'cmd_refresh_cockpit' },
            ],
          ]
        : undefined
    );
    await this.updatePinnedCockpitMessage(user);
  }

  /**
   * Removes Take Profit completely, setting MT5 position into Open Runner mode.
   */
  private static async handleRemoveTakeProfitCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[],
    msg?: any
  ): Promise<void> {
    if (!botToken) return;

    let specifiedSymbol: string | undefined;
    for (const arg of args) {
      const clean = arg.trim().toUpperCase();
      if (/^[A-Za-z0-9_]+$/.test(clean) && !['NONE', '0', 'REMOVE', 'OFF', 'CANCEL', 'CLEAR', 'REMOVETP'].includes(clean)) {
        specifiedSymbol = clean;
      }
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
      const cleanSpecified = specifiedSymbol === 'GOLD' || specifiedSymbol === 'XAU' ? 'XAUUSD' : (specifiedSymbol === 'ETH' || specifiedSymbol === 'ETHEREUM' ? 'ETHUSD' : specifiedSymbol);
      tradeQuery.symbol = new RegExp(cleanSpecified, 'i');
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
        `❌ <b>No Active Open Trade Found</b>\n\nThere are no open positions to remove Take Profit from.`
      );
      return;
    }

    const trade = matchingTrades[0];
    const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
    const isMt5 = Mt5CommandService.isMt5Trade(trade, account);
    const ticket = isMt5 ? Mt5CommandService.extractTicket(trade) : null;
    const curSl = Number(trade.risk?.currentStopLoss ?? trade.risk?.initialStopLoss ?? 0);

    const oldTp = trade.risk?.plannedTarget;
    trade.risk = {
      ...(trade.risk || {}),
      plannedTarget: undefined,
    };
    if (!trade.tags?.includes('OPEN_RUNNER')) {
      trade.tags = [...(trade.tags || []), 'OPEN_RUNNER'];
    }

    let brokerStatus = 'Stored in SetupMint Journal';
    if (isMt5 && ticket) {
      await Mt5CommandService.queueModifyTp({
        userId: user._id,
        accountId: (account?._id || trade.accountId)!,
        tradeId: trade._id,
        ticket,
        takeProfit: 0,
        stopLoss: curSl > 0 ? curSl : undefined,
      });
      brokerStatus = `⚡ Dispatched to MT5 Server Bridge (Ticket #${ticket})`;
    }

    trade.auditLog.push({
      action: 'TELEGRAM_REMOVE_TP',
      timestamp: new Date(),
      details: {
        text: `Take Profit removed (Runner Mode enabled) via Telegram command`,
        previousTp: oldTp,
      },
      changedBy: 'telegram',
    });
    await trade.save();

    await this.sendMessage(
      botToken,
      chatId,
      `🚫 <b>TAKE PROFIT REMOVED (RUNNER MODE)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Symbol   : ${trade.symbol} (${trade.direction})\n` +
      `Target   : OPEN / NONE (Runner Mode)\n` +
      `StopLoss : ${curSl > 0 ? `$${curSl.toFixed(2)}` : 'None'}\n` +
      `Status   : ${brokerStatus}\n` +
      `</pre>\n` +
      `<i>The broker will not close this position on target. Let your winners run!</i>`,
      ticket
        ? [
            [
              { text: '🛡️ Lock BE', callback_data: `pos_be:${ticket}` },
              { text: '📈 Trail +1R', callback_data: `pos_trail:${ticket}` },
            ],
            [
              { text: '🎯 Book 50%', callback_data: `pos_half:${ticket}` },
              { text: '🚨 Close Position', callback_data: `pos_close:${ticket}` },
            ],
          ]
        : undefined
    );
    await this.updatePinnedCockpitMessage(user);
  }

  /**
   * Toggles live server-side ladder auto-execution (defaultAutoExecute) on MT5 and FYERS.
   */
  private static async handleAutoExecuteToggleCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[] = []
  ): Promise<void> {
    if (!botToken) return;
    const target = (args[0] || '').toLowerCase();
    let newState: boolean;

    if (target === 'on' || target === 'arm' || target === 'enable' || target === '1') {
      newState = true;
    } else if (target === 'off' || target === 'disarm' || target === 'disable' || target === '0') {
      newState = false;
    } else {
      newState = !Boolean(user.liveWatcherSettings?.defaultAutoExecute);
    }

    if (!user.liveWatcherSettings) {
      user.liveWatcherSettings = {};
    }
    user.liveWatcherSettings.defaultAutoExecute = newState;
    user.liveWatcherSettings.serverSideExecutionEnabled = true;
    await user.save();

    const statusBadge = newState ? '⚡ <b>AUTO-EXECUTION ARMED GLOBALLY</b>' : '✋ <b>MANUAL CONFIRMATION MODE</b>';
    const explanation = newState
      ? `• Live ladder profit-taking & trailing stop orders will execute automatically on your <b>MT5 terminal</b>.\n` +
        `• When price reaches +1.5R or ladder targets, partial profits are harvested and SL is trailed to BE without manual clicks.\n` +
        `• Type <code>/autoexecute off</code> anytime to disarm.`
      : `• Automatic order execution is paused.\n` +
        `• You will receive 1-tap Telegram interactive buttons to confirm profit harvesting manually.\n` +
        `• Type <code>/autoexecute on</code> anytime to re-arm.`;

    await this.sendMessage(
      botToken,
      chatId,
      `${statusBadge}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${explanation}`,
      [
        [
          newState
            ? { text: '✋ Disarm Auto-Execute', callback_data: 'cmd_autoexec_off' }
            : { text: '⚡ Arm Auto-Execute', callback_data: 'cmd_autoexec_on' },
          { text: '📌 View Cockpit', callback_data: 'cmd_refresh_cockpit' },
        ],
      ]
    );
  }

  /**
   * Adds volume to an existing profitable position (Pyramiding) once risk is protected at BE.
   */
  private static async handlePyramidingCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[] = []
  ): Promise<void> {
    if (!botToken) return;
    const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
    const openTrades = await Trade.find({
      userId: user._id,
      accountId: { $in: allActiveAccountIds },
      status: 'OPEN',
    }).sort({ entryTime: -1 });

    if (openTrades.length === 0) {
      await this.sendMessage(botToken, chatId, `⚠️ <b>No Active Open Positions:</b> Pyramiding requires an active, winning trade to add to.`);
      return;
    }

    let trade = openTrades[0];
    if (args[0] && isNaN(parseFloat(args[0]))) {
      const symMatch = openTrades.find((t: any) => t.symbol?.toUpperCase().includes(args[0].toUpperCase()));
      if (symMatch) trade = symMatch;
    }

    const ticket = Mt5CommandService.extractTicket(trade);
    const sym = trade.symbol;
    const isGold = (sym || '').includes('XAU') || sym === 'GOLD';
    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const defaultLot = isGold ? (presets?.goldDefaultLot ?? 0.04) : (presets?.ethDefaultLot ?? 1.0);

    let addLot = defaultLot;
    for (const a of args) {
      if (/^\d+(\.\d+)?$/.test(a)) {
        addLot = parseFloat(a);
        break;
      }
    }

    await this.executeScaleIn(user, botToken, chatId, trade, addLot, ticket);
  }

  /**
   * Dispatches and executes advanced Pro Suite tactical submenu actions from Telegram Cockpit:
   * 1. Profit Harvest (harvest_pct, harvest_freeride, harvest_moonshot, harvest_dollar)
   * 2. Stack Pyramiding (pyramid_add, pyramid_zerorisk, pyramid_breakout, pyramid_pullback)
   * 3. Defense & Trailing (defense_truebe, defense_trail_r, defense_lock_dollar, defense_candle, defense_runner, defense_sleep)
   * 4. Multi-Layer Execution (act_close_top, act_close_stack)
   */
  static async handleCockpitProAction(
    user: any,
    botToken: string,
    chatId: string | number,
    data: string,
    cqId?: string
  ): Promise<void> {
    const parts = data.split(':');
    const actionKey = parts[0];
    const rawSym = (parts[1] || 'XAUUSD').toUpperCase();
    const isGold = rawSym.includes('XAU') || rawSym === 'GOLD';
    const isEth = rawSym.includes('ETH');
    const isBtc = rawSym.includes('BTC');
    const isUs30 = rawSym.includes('US30') || rawSym.includes('DOW');
    const isNas = rawSym.includes('NAS') || rawSym.includes('USTEC');

    const symbolRegex = isGold
      ? /XAU|GOLD/i
      : isEth
      ? /ETH/i
      : isBtc
      ? /BTC/i
      : isUs30
      ? /US30|DOW/i
      : isNas
      ? /NAS|USTEC/i
      : new RegExp(rawSym, 'i');

    const openTrades = await Trade.find({
      userId: user._id,
      status: 'OPEN',
      symbol: { $regex: symbolRegex },
    }).sort({ createdAt: 1 });

    const userIdStr = user._id ? user._id.toString() : '';

    if (!openTrades || openTrades.length === 0) {
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `⚠️ No open positions found for ${rawSym}`, true);
      }
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    const getEntryPrice = (t: any): number =>
      Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? (t as any).entryPrice ?? 0);
    const isTradeLong = (t: any): boolean =>
      (t.direction as string) === 'LONG' || (t.direction as string) === 'BUY';

    // 1. HARVEST ACTIONS
    if (actionKey === 'harvest_pct') {
      const pct = parseFloat(parts[2]) || 50;
      let totalClosedVol = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const closeVol = Math.max(0.01, Number((qty * (pct / 100)).toFixed(2)));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;
        if (ticket && accountId && closeVol > 0) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: closeVol,
          });
          totalClosedVol = Number((totalClosedVol + closeVol).toFixed(2));
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🎯 Harvested ${pct}% on ${rawSym} (${totalClosedVol}L queued)`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🎯 <b>PROFIT HARVEST EXECUTED (${pct}%)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol      : ${rawSym}\n` +
        `Harvest Pct : ${pct}%\n` +
        `Closed Vol  : ${totalClosedVol} Lots\n` +
        `Layers Hit  : ${openTrades.length} Ticket(s)\n` +
        `Status      : Queued on MT5 Bridge\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'harvest_freeride') {
      let totalClosedVol = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const entry = getEntryPrice(t);
        const closeVol = Math.max(0.01, Number((qty * 0.50).toFixed(2)));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: closeVol,
          });
          totalClosedVol = Number((totalClosedVol + closeVol).toFixed(2));

          if (entry > 0) {
            await Mt5CommandService.queueModifySl({
              userId: user._id,
              accountId,
              tradeId: t._id,
              ticket,
              stopLoss: entry,
            });
            t.risk = { ...(t.risk || {}), currentStopLoss: entry };
            await t.save().catch(() => {});
          }
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🎰 Free-Ride Active! 50% booked & SL locked to BE. Zero Risk!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🎰 <b>FREE-RIDE MODE ENGAGED (HOUSE MONEY)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol      : ${rawSym}\n` +
        `Booked Vol  : ${totalClosedVol} Lots (50%)\n` +
        `Stop Loss   : Locked to Entry Price (BE)\n` +
        `Risk Status : 100% Risk-Free Free-Ride\n` +
        `</pre>\n` +
        `<i>Remaining position is now pure house money!</i>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'harvest_moonshot') {
      let totalClosedVol = 0;
      for (let i = 0; i < openTrades.length; i++) {
        const t = openTrades[i];
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const entry = getEntryPrice(t);
        const isLong = isTradeLong(t);
        const offset = isGold ? 0.50 : 2.0;
        const bePlus = Number((isLong ? entry + offset : entry - offset).toFixed(2));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId) {
          if (i === 0) {
            const closeVol = Math.max(0, Number((qty - 0.01).toFixed(2)));
            if (closeVol > 0) {
              await Mt5CommandService.queueClosePosition({
                userId: user._id,
                accountId,
                tradeId: t._id,
                ticket,
                volume: closeVol,
              });
              totalClosedVol = Number((totalClosedVol + closeVol).toFixed(2));
            }
            await Mt5CommandService.queueModifyTp({
              userId: user._id,
              accountId,
              tradeId: t._id,
              ticket,
              takeProfit: 0,
              stopLoss: bePlus > 0 ? bePlus : entry,
            });
            t.risk = { ...(t.risk || {}), plannedTarget: undefined, currentStopLoss: bePlus > 0 ? bePlus : entry };
            if (!t.tags?.includes('OPEN_RUNNER')) {
              t.tags = [...(t.tags || []), 'OPEN_RUNNER'];
            }
            await t.save().catch(() => {});
          } else {
            await Mt5CommandService.queueClosePosition({
              userId: user._id,
              accountId,
              tradeId: t._id,
              ticket,
              volume: qty,
            });
            totalClosedVol = Number((totalClosedVol + qty).toFixed(2));
          }
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🏃 Moonshot Engaged! 0.01L runner active with no TP.`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🏃 <b>MOONSHOT MODE ACTIVATED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol      : ${rawSym}\n` +
        `Harvested   : ${totalClosedVol} Lots\n` +
        `Active Run  : 0.01 Lots (Runner)\n` +
        `Take Profit : REMOVED (Uncapped Runner)\n` +
        `Stop Loss   : Protected at BE+Spread\n` +
        `</pre>\n` +
        `<i>Position will ride indefinitely until manual exit.</i>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'harvest_dollar') {
      const targetDollar = parseFloat(parts[2]) || 25;
      const mult = isGold ? 100 : 1;
      const quote = Mt5CommandService.getLiveQuote(rawSym);
      const baseTrade = openTrades[0];
      const entry = getEntryPrice(baseTrade);
      const ltp = quote?.ltp || entry;
      const isLong = isTradeLong(baseTrade);
      const pts = isLong ? (ltp - entry) : (entry - ltp);

      if (pts <= 0) {
        if (cqId) {
          await this.answerCallbackQuery(botToken, cqId, `⚠️ Cannot bank $${targetDollar}: ${rawSym} is not in profit!`, true);
        }
        return;
      }

      const dollarPerLot = pts * mult;
      const neededLots = Math.max(0.01, Number((targetDollar / dollarPerLot).toFixed(2)));
      let remainingLotsToClose = neededLots;
      let actualClosedLots = 0;

      for (const t of openTrades) {
        if (remainingLotsToClose <= 0) break;
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const closeVol = Math.max(0.01, Math.min(qty, remainingLotsToClose));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId && closeVol > 0) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: closeVol,
          });
          actualClosedLots = Number((actualClosedLots + closeVol).toFixed(2));
          remainingLotsToClose = Number((remainingLotsToClose - closeVol).toFixed(2));
        }
      }

      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🏦 Banking $${targetDollar} queued on MT5 (${actualClosedLots}L)!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🏦 <b>BANKED PROFIT TARGET ($${targetDollar})</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol      : ${rawSym}\n` +
        `Target Bank : $${targetDollar.toFixed(2)}\n` +
        `Closed Vol  : ${actualClosedLots} Lots\n` +
        `At Price    : $${ltp.toFixed(2)}\n` +
        `Status      : Dispatched to MT5 Server Bridge\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    // 2. PYRAMIDING ACTIONS
    if (actionKey === 'pyramid_add') {
      const addLot = parseFloat(parts[2]) || (isGold ? 0.04 : 1.0);
      const baseTrade = openTrades[0];
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `➕ Adding ${addLot}L scale-in to ${rawSym}...`, false);
      }
      await this.executeScaleIn(user, botToken, chatId, baseTrade, addLot, Mt5CommandService.extractTicket(baseTrade));
      return;
    }

    if (actionKey === 'pyramid_zerorisk') {
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entry = getEntryPrice(t);
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;
        if (ticket && accountId && entry > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            stopLoss: entry,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: entry };
          await t.save().catch(() => {});
        }
      }

      const baseTrade = openTrades[0];
      const presets = user?.liveWatcherSettings?.telegramForexPresets;
      const defLot = isGold ? (presets?.goldDefaultLot ?? 0.04) : (presets?.ethDefaultLot ?? 1.0);
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🛡️ Existing stack locked to BE & new scale-in queued!`, false);
      }
      await this.executeScaleIn(user, botToken, chatId, baseTrade, defLot, Mt5CommandService.extractTicket(baseTrade));
      return;
    }

    if (actionKey === 'pyramid_breakout') {
      const baseTrade = openTrades[0];
      const isLong = isTradeLong(baseTrade);
      const quote = Mt5CommandService.getLiveQuote(rawSym);
      const ltp = quote?.ltp || Number(baseTrade.simpleExecution?.entryPrice ?? 0);
      const offset = isGold ? 1.00 : (isEth ? 15.0 : 5.0);
      const breakoutPrice = Number((isLong ? ltp + offset : ltp - offset).toFixed(2));
      const presets = user?.liveWatcherSettings?.telegramForexPresets;
      const addLot = isGold ? (presets?.goldDefaultLot ?? 0.04) : (presets?.ethDefaultLot ?? 1.0);
      const account = baseTrade.accountId ? await TradingAccount.findById(baseTrade.accountId) : null;
      const accountId = (account?._id || baseTrade.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

      if (accountId) {
        await Mt5CommandService.queueOpenOrder({
          userId: user._id,
          accountId,
          symbol: rawSym,
          side: isLong ? 'BUY' : 'SELL',
          volume: addLot,
          orderType: 'STOP',
          price: breakoutPrice,
          comment: `SetupMint-Breakout-${baseTrade._id}`,
        });
      }

      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `⏳ Breakout Stop order placed at $${breakoutPrice.toFixed(2)}`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `⏳ <b>BREAKOUT SCALE ORDER PLACED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym} (${isLong ? 'BUY STOP' : 'SELL STOP'})\n` +
        `Trigger  : $${breakoutPrice.toFixed(2)} (+10 pts breakout)\n` +
        `Volume   : ${addLot} Lots\n` +
        `Current  : $${ltp.toFixed(2)}\n` +
        `Status   : Pending on MT5 Order Book\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'pyramid_pullback') {
      const baseTrade = openTrades[0];
      const isLong = isTradeLong(baseTrade);
      const quote = Mt5CommandService.getLiveQuote(rawSym);
      const ltp = quote?.ltp || Number(baseTrade.simpleExecution?.entryPrice ?? 0);
      const offset = isGold ? 1.50 : (isEth ? 25.0 : 8.0);
      const pullbackPrice = Number((isLong ? ltp - offset : ltp + offset).toFixed(2));
      const presets = user?.liveWatcherSettings?.telegramForexPresets;
      const addLot = isGold ? (presets?.goldDefaultLot ?? 0.04) : (presets?.ethDefaultLot ?? 1.0);
      const account = baseTrade.accountId ? await TradingAccount.findById(baseTrade.accountId) : null;
      const accountId = (account?._id || baseTrade.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

      if (accountId) {
        await Mt5CommandService.queueOpenOrder({
          userId: user._id,
          accountId,
          symbol: rawSym,
          side: isLong ? 'BUY' : 'SELL',
          volume: addLot,
          orderType: 'LIMIT',
          price: pullbackPrice,
          comment: `SetupMint-Pullback-${baseTrade._id}`,
        });
      }

      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `📥 Pullback Limit order placed at $${pullbackPrice.toFixed(2)}`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `📥 <b>PULLBACK LIMIT ORDER PLACED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym} (${isLong ? 'BUY LIMIT' : 'SELL LIMIT'})\n` +
        `Entry    : $${pullbackPrice.toFixed(2)} (-15 pts dip limit)\n` +
        `Volume   : ${addLot} Lots\n` +
        `Current  : $${ltp.toFixed(2)}\n` +
        `Status   : Pending on MT5 Order Book\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    // 3. DEFENSE & TRAILING ACTIONS
    if (actionKey === 'defense_truebe') {
      const offset = isGold ? 0.50 : (isEth ? 2.50 : 0.50);
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entry = getEntryPrice(t);
        const isLong = isTradeLong(t);
        const bePrice = Number((isLong ? entry + offset : entry - offset).toFixed(2));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;
        if (ticket && accountId && entry > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            stopLoss: bePrice,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: bePrice };
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🛡️ True BE set (+spread cover) for ${rawSym}!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🛡️ <b>TRUE BREAKEVEN LOCKED (+SPREAD COVER)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Buffer   : +$${offset.toFixed(2)} (Covers Spread + Comm)\n` +
        `Layers   : ${openTrades.length} Ticket(s)\n` +
        `Status   : SL updated to True BE on MT5\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'defense_trail_r') {
      const rMult = parseFloat(parts[2]) || 1.0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entry = getEntryPrice(t);
        const curSl = Number(t.risk?.initialStopLoss ?? t.risk?.currentStopLoss ?? 0);
        const riskDist = (curSl > 0 && entry > 0) ? Math.abs(entry - curSl) : (isGold ? 3.5 : 20.0);
        const isLong = isTradeLong(t);
        const trailSl = Number((isLong ? entry + (rMult * riskDist) : entry - (rMult * riskDist)).toFixed(2));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId && trailSl > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            stopLoss: trailSl,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: trailSl };
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `📈 Trailed SL to +${rMult}R for ${rawSym}!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `📈 <b>TRAILED STOP LOSS (+${rMult}R)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Multiple : +${rMult}R Profit Lock\n` +
        `Layers   : ${openTrades.length} Ticket(s)\n` +
        `Status   : Trailing SL Queued on MT5\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'defense_lock_dollar') {
      const amt = parseFloat(parts[2]) || 25;
      const mult = isGold ? 100 : 1;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const entry = getEntryPrice(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const isLong = isTradeLong(t);
        const dollarPerPt = qty * mult;
        const offset = amt / dollarPerPt;
        const targetSl = Number((isLong ? entry + offset : entry - offset).toFixed(2));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId && targetSl > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            stopLoss: targetSl,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: targetSl };
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🔒 Stop Loss locked at +$${amt} profit!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🔒 <b>PROFIT LOCKED AT +$${amt}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Guaranteed: +$${amt.toFixed(2)}\n` +
        `Layers   : ${openTrades.length} Ticket(s)\n` +
        `Status   : SL Updated to Guaranteed Profit\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'defense_candle') {
      const quote = Mt5CommandService.getLiveQuote(rawSym);
      const ltp = quote?.ltp || Number(openTrades[0]?.simpleExecution?.entryPrice ?? 0);
      const offset = isGold ? 1.50 : (isEth ? 10.0 : 4.0);
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const isLong = isTradeLong(t);
        const candleSl = Number((isLong ? ltp - offset : ltp + offset).toFixed(2));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId && candleSl > 0) {
          await Mt5CommandService.queueModifySl({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            stopLoss: candleSl,
          });
          t.risk = { ...(t.risk || {}), currentStopLoss: candleSl };
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🕯️ SL trailed behind candle structure!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🕯️ <b>TRAILED BEHIND CANDLE STRUCTURE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Offset   : $${offset.toFixed(2)} Behind Market\n` +
        `Layers   : ${openTrades.length} Ticket(s)\n` +
        `Status   : Dynamic Candle SL Active\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'defense_runner') {
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const curSl = Number(t.risk?.currentStopLoss ?? t.risk?.initialStopLoss ?? 0);
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId) {
          await Mt5CommandService.queueModifyTp({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            takeProfit: 0,
            stopLoss: curSl > 0 ? curSl : undefined,
          });
          t.risk = { ...(t.risk || {}), plannedTarget: undefined };
          if (!t.tags?.includes('OPEN_RUNNER')) {
            t.tags = [...(t.tags || []), 'OPEN_RUNNER'];
          }
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🚫 TP Removed! ${rawSym} running uncapped.`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🚫 <b>RUNNER MODE ACTIVATED (NO TP)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Take Profit : REMOVED\n` +
        `Layers   : ${openTrades.length} Ticket(s)\n` +
        `Status   : Uncapped Profit Run Active\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'defense_sleep') {
      let totalClosedVol = 0;
      const offset = isGold ? 0.50 : 2.50;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const entry = getEntryPrice(t);
        const isLong = isTradeLong(t);
        const bePrice = Number((isLong ? entry + offset : entry - offset).toFixed(2));
        const closeVol = Math.max(0.01, Number((qty * 0.75).toFixed(2)));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: closeVol,
          });
          totalClosedVol = Number((totalClosedVol + closeVol).toFixed(2));

          await Mt5CommandService.queueModifyTp({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            takeProfit: 0,
            stopLoss: bePrice > 0 ? bePrice : entry,
          });
          t.risk = { ...(t.risk || {}), plannedTarget: undefined, currentStopLoss: bePrice > 0 ? bePrice : entry };
          await t.save().catch(() => {});
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `💤 Sleep Mode Active! 75% booked, remaining locked at True BE.`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `💤 <b>SLEEP MODE ENGAGED (OVERNIGHT SHIELD)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol      : ${rawSym}\n` +
        `Secured Vol : ${totalClosedVol} Lots (75% Profit Booked)\n` +
        `Remaining   : 25% Runner with No TP\n` +
        `Protection  : Stop Loss at True BE (+Spread)\n` +
        `Status      : Sleep Soundly, Position is Protected\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    // 4. MULTI-LAYER ACTIONS
    if (actionKey === 'act_close_top') {
      const topTrade = openTrades[openTrades.length - 1];
      const ticket = Mt5CommandService.extractTicket(topTrade);
      const qty = Number(topTrade.calculated?.openQuantity && topTrade.calculated.openQuantity > 0 ? topTrade.calculated.openQuantity : (topTrade.simpleExecution?.quantity || 1));
      const account = topTrade.accountId ? await TradingAccount.findById(topTrade.accountId) : null;
      const accountId = (account?._id || topTrade.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

      if (ticket && accountId) {
        await Mt5CommandService.queueClosePosition({
          userId: user._id,
          accountId,
          tradeId: topTrade._id,
          ticket,
          volume: qty,
        });
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🚨 Closed top layer #${ticket} (${qty}L) on ${rawSym}`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🚨 <b>TOP LAYER CLOSED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${rawSym}\n` +
        `Ticket   : #${ticket || 'Top'}\n` +
        `Volume   : ${qty} Lots\n` +
        `Status   : Dispatched to MT5 Server Bridge\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }

    if (actionKey === 'act_close_stack') {
      let totalQty = 0;
      for (const t of openTrades) {
        const ticket = Mt5CommandService.extractTicket(t);
        const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
        const account = t.accountId ? await TradingAccount.findById(t.accountId) : null;
        const accountId = (account?._id || t.accountId || user.defaultAccountScope?.replace('ACCOUNT:', ''))!;

        if (ticket && accountId) {
          await Mt5CommandService.queueClosePosition({
            userId: user._id,
            accountId,
            tradeId: t._id,
            ticket,
            volume: qty,
          });
          totalQty = Number((totalQty + qty).toFixed(2));
        }
      }
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
      if (cqId) {
        await this.answerCallbackQuery(botToken, cqId, `🛑 Flattened entire ${rawSym} stack (${totalQty}L)!`, true);
      }
      await this.sendMessage(
        botToken,
        chatId,
        `🛑 <b>POSITION STACK FLATTENED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol     : ${rawSym}\n` +
        `Total Vol  : ${totalQty} Lots\n` +
        `Layers     : ${openTrades.length} Ticket(s)\n` +
        `Status     : All Layers Closed on MT5\n` +
        `</pre>`
      );
      await this.updatePinnedCockpitMessage(user);
      return;
    }
  }

  /**
   * Executes pyramiding scale-in order on MT5 once original position is protected at BE.
   */
  static async executeScaleIn(
    user: any,
    botToken: string,
    chatId: string | number,
    trade: any,
    addLot: number,
    ticket?: number | null
  ): Promise<void> {
    const sym = trade.symbol;
    const isGold = (sym || '').includes('XAU') || sym === 'GOLD';
    const isEth = (sym || '').includes('ETH');
    const quote = Mt5CommandService.getLiveQuote(sym);
    const entry = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? trade.entryPrice ?? 0);
    const ltp = quote?.ltp || entry;
    const isLong = (trade.direction as string) === 'LONG' || (trade.direction as string) === 'BUY';
    const isWinning = isLong ? ltp > entry : ltp < entry;

    if (!isWinning) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Pyramiding Blocked on Non-Winning Trade:</b>\n` +
        `Current market price (${ltp}) has not exceeded entry (${entry}). SetupMint strictly prohibits averaging down on losers. Pyramiding is only allowed on winning trades!`
      );
      return;
    }

    const curSl = Number(trade.risk?.currentStopLoss ?? trade.risk?.initialStopLoss ?? 0);
    const needsBeLock = isLong ? curSl < entry : curSl > entry;
    const account = trade.accountId ? await TradingAccount.findById(trade.accountId) : null;
    const accountId = (account?._id || trade.accountId)!;

    if (needsBeLock && ticket && accountId) {
      await Mt5CommandService.queueModifySl({
        userId: user._id,
        accountId,
        tradeId: trade._id,
        ticket,
        stopLoss: entry,
      });
      trade.risk = { ...(trade.risk || {}), currentStopLoss: entry };
      await trade.save().catch(() => {});
    }

    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const slPts = isGold ? (presets?.goldSlPoints ?? 35) : (isEth ? (presets?.ethSlPrice ?? 30) : 50);
    const rr = isGold ? (presets?.goldRrRatio ?? 2.0) : (presets?.ethRrRatio ?? 2.5);
    const newSl = Number((isLong ? ltp - (slPts * (isGold ? 0.10 : 1.0)) : ltp + (slPts * (isGold ? 0.10 : 1.0))).toFixed(2));
    const newTp = Number((isLong ? ltp + (slPts * rr * (isGold ? 0.10 : 1.0)) : ltp - (slPts * rr * (isGold ? 0.10 : 1.0))).toFixed(2));

    await Mt5CommandService.queueOpenOrder({
      userId: user._id,
      accountId,
      symbol: sym,
      side: isLong ? 'BUY' : 'SELL',
      volume: addLot,
      stopLoss: newSl,
      takeProfit: newTp,
      comment: `SetupMint-Pyramid-${trade._id}`,
    });

    await this.sendMessage(
      botToken,
      chatId,
      `➕ <b>PYRAMIDING SCALE-IN DISPATCHED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Symbol   : ${sym} (${isLong ? 'BUY' : 'SELL'})\n` +
      `Added Vol: ${addLot} Lots\n` +
      `Est Fill : $${ltp.toFixed(2)}\n` +
      `Base Pos : #${ticket || 'Parent'} (Locked at BE $${entry.toFixed(2)})\n` +
      `New SL   : $${newSl.toFixed(2)}\n` +
      `New TP   : $${newTp.toFixed(2)}\n` +
      `Status   : Dispatched to MT5 Server Bridge\n` +
      `</pre>\n` +
      `<i>Original trade is protected at Breakeven. Zero overall risk addition.</i>`
    );
    await this.updatePinnedCockpitMessage(user);
  }

  /**
   * Handles limit and stop pending orders via Telegram (/limit, /buylimit, /selllimit, /buystop, /sellstop).
   */
  private static async handlePendingOrderCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    cmd: string,
    args: string[] = []
  ): Promise<void> {
    if (!botToken) return;
    let sym = 'XAUUSD';
    let side: 'BUY' | 'SELL' = 'BUY';
    const orderType: 'LIMIT' | 'STOP' = cmd.includes('stop') ? 'STOP' : 'LIMIT';
    let price: number | undefined;
    let volume: number | undefined;

    if (cmd === '/limit' || cmd === '/stoporder') {
      const symArg = (args[0] || '').toUpperCase();
      if (symArg.includes('ETH')) sym = 'ETHUSD';
      else if (symArg.includes('BTC')) sym = 'BTCUSD';
      else if (symArg.includes('US30')) sym = 'US30';
      else if (symArg.includes('NAS')) sym = 'NAS100';
      else sym = 'XAUUSD';

      const sideArg = (args[1] || '').toUpperCase();
      side = sideArg === 'SELL' || sideArg === 'SHORT' ? 'SELL' : 'BUY';
      price = args[2] ? parseFloat(args[2]) : undefined;
      volume = args[3] ? parseFloat(args[3]) : undefined;
    } else {
      side = cmd.includes('sell') ? 'SELL' : 'BUY';
      for (const a of args) {
        const up = a.toUpperCase();
        if (up.includes('ETH')) sym = 'ETHUSD';
        else if (up.includes('BTC')) sym = 'BTCUSD';
        else if (up.includes('US30')) sym = 'US30';
        else if (up.includes('NAS')) sym = 'NAS100';
        else if (up.includes('GOLD') || up.includes('XAU')) sym = 'XAUUSD';
        else if (/^\d+(\.\d+)?$/.test(a)) {
          const num = parseFloat(a);
          if (!price) price = num;
          else if (!volume) volume = num;
        }
      }
    }

    if (!price || price <= 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ <b>Missing Pending Price:</b>\n\n` +
        `Usage:\n` +
        `• <code>/gold buylimit &lt;price&gt; [vol]</code> (e.g. <code>/gold buylimit 2640.00 0.04</code>)\n` +
        `• <code>/limit &lt;symbol&gt; &lt;buy|sell&gt; &lt;price&gt; [vol]</code>\n` +
        `• <code>/buylimit 2640.00</code>`
      );
      return;
    }

    const orderSubcmd = `${side.toLowerCase()}${orderType.toLowerCase()}`;
    await this.handleForexOrderCommand(user, botToken, chatId, sym as any, [orderSubcmd, String(price), ...(volume ? [String(volume)] : [])]);
  }

  /**
   * Resolves the primary MT5 / Elefin trading account for a user.
   */
  static async resolveMt5Account(userId: string | mongoose.Types.ObjectId): Promise<any> {
    const acc = await TradingAccount.findOne({
      userId,
      status: 'ACTIVE',
      $or: [
        { broker: /mt5|elefin/i },
        { name: /mt5|elefin/i },
        { 'profile.executionAdapterKey': 'ELEFIN_MT5' },
      ],
    });
    if (acc) return acc;
    const fallback = await TradingAccount.findOne({ userId, status: 'ACTIVE' });
    if (!fallback) {
      throw new Error('No active trading account found. Please configure an account in SetupMint.');
    }
    return fallback;
  }

  /**
   * Comprehensive pre-trade guardrail evaluation for Telegram MT5 orders.
   * Validates discipline rules, risk limits, stale quotes, lot caps, revenge cooldowns, and max open exposures.
   */
  static async evaluateOrderGuardrails(
    user: any,
    account: any,
    symbol: string,
    side: 'BUY' | 'SELL',
    volume: number,
    slPoints: number,
    tpPoints: number,
    ltp: number,
    quoteTimestamp?: Date
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Mandatory Stop Loss Check
    if (!slPoints || slPoints <= 0) {
      return {
        allowed: false,
        reason:
          '🛡️ <b>ORDER BLOCKED: MANDATORY STOP LOSS REQUIRED</b>\n\n' +
          'Naked market entries are prohibited by your risk rules. Every Telegram MT5 order must include a protective Stop Loss.',
      };
    }

    // 2. Stale Quote Guardrail (Settings: staleDataThresholdSeconds, default 10s)
    const staleThreshold = user?.liveWatcherSettings?.staleDataThresholdSeconds ?? 10;
    if (quoteTimestamp) {
      const quoteAgeSec = (Date.now() - new Date(quoteTimestamp).getTime()) / 1000;
      if (quoteAgeSec > staleThreshold) {
        return {
          allowed: false,
          reason:
            `⚠️ <b>ORDER BLOCKED: STALE MARKET DATA</b>\n\n` +
            `Market feed for <b>${symbol}</b> is <b>${quoteAgeSec.toFixed(1)}s old</b> (Threshold: ${staleThreshold}s).\n` +
            `Live broker execution is blocked to protect against slippage. Wait for fresh ticks.`,
        };
      }
    }

    // 3. Max Concurrent Open Positions Guardrail (Settings: maxOpenTrades, default 3)
    const maxOpenTrades = user?.riskSettings?.maxOpenTrades ?? 3;
    const currentOpenCount = await Trade.countDocuments({
      userId: user._id,
      accountId: account._id,
      status: 'OPEN',
    });
    if (currentOpenCount >= maxOpenTrades) {
      return {
        allowed: false,
        reason:
          `🛡️ <b>ORDER BLOCKED: MAX OPEN POSITIONS REACHED</b>\n\n` +
          `You currently have <b>${currentOpenCount} active open trade(s)</b> (Your limit: <b>${maxOpenTrades}</b>).\n` +
          `Close an existing position before taking on new risk exposure.`,
      };
    }

    // 4. Adaptive Day-Risk State (Dynamic Daily Trades, Dynamic Daily Loss, & Defensive Vol Guard)
    const isGoldSym = (symbol || '').includes('XAU') || symbol === 'GOLD';
    const pointScale = isGoldSym ? 0.10 : 1.0;
    const multiplier = isGoldSym ? 100 : 1;
    const adaptive = await this.evaluateAdaptiveDayRiskState(
      user,
      account,
      symbol,
      slPoints,
      pointScale,
      multiplier,
      side
    );

    // 4a. Dynamic Daily Trade Limit Guardrail
    if (adaptive.isTradeLimitReached) {
      const bonusText = adaptive.bonusTradesEarned > 0 ? ` (Includes +${adaptive.bonusTradesEarned} bonus trades)` : '';
      const regimeHint = adaptive.regime === 'DEFENSIVE'
        ? 'Throttled by Defensive Mode to curb tilt & protect capital.'
        : 'Overtrading guardrail active. Step away to preserve capital.';
      return {
        allowed: false,
        reason:
          `🛡️ <b>ORDER BLOCKED: DAILY TRADE LIMIT REACHED</b>\n\n` +
          `You have taken <b>${adaptive.todayTradesCount} trade(s) today</b> (Dynamic limit: <b>${adaptive.effectiveMaxDailyTrades}</b>${bonusText}).\n` +
          `Day State: ${adaptive.regimeBadge} <b>${adaptive.regimeLabel}</b>.\n` +
          `${regimeHint}`,
      };
    }

    // 5. Dynamic Daily Loss Limit Guardrail
    if (adaptive.isDailyLossBreached) {
      return {
        allowed: false,
        reason:
          `🛑 <b>ORDER BLOCKED: DAILY LOSS LIMIT BREACHED</b>\n\n` +
          `Your net PnL today is <b>-$${Math.abs(adaptive.todayTotalPnL).toFixed(2)}</b> (Daily loss limit: <b>-$${adaptive.effectiveDailyLossLimit.toFixed(2)}</b>).\n` +
          `Remaining buffer: <b>$0.00</b>. Locked for today to protect capital.`,
      };
    }

    // 5b. Defensive Mode Volume Cap Guardrail (Prevents outsized tilt betting)
    if (adaptive.regime === 'DEFENSIVE') {
      const maxDefensiveLot = Math.max(0.02, Number((adaptive.tiers.bestOptionLot * 2).toFixed(2)));
      if (volume > maxDefensiveLot) {
        return {
          allowed: false,
          reason:
            `🛡️ <b>ORDER BLOCKED: DEFENSIVE MODE LOT CAP ACTIVE</b>\n\n` +
            `You are in <b>${adaptive.regimeBadge} ${adaptive.regimeLabel}</b> (${adaptive.consecutiveLosses} consecutive losses / net -$${Math.abs(adaptive.todayTotalPnL).toFixed(2)}).\n` +
            `To prevent tilt and drawdown escalation, max allowed lot size is capped at <b>${maxDefensiveLot.toFixed(2)} Lots</b> (Requested: <b>${volume.toFixed(2)} Lots</b>).\n` +
            `Stick to recommended defensive sizing (${adaptive.tiers.bestOptionLot.toFixed(2)}L) or micro (${adaptive.tiers.microLot.toFixed(2)}L).`,
        };
      }
    }

    // 6. Account Lot Cap Guardrail (Settings / Account Profile: lotCap)
    const lotCap = account?.riskRules?.lotCap ?? account?.profile?.riskRules?.lotCap;
    if (lotCap && lotCap > 0 && volume > lotCap) {
      return {
        allowed: false,
        reason:
          `🛡️ <b>ORDER BLOCKED: LOT CAP EXCEEDED</b>\n\n` +
          `Requested volume (<b>${volume} Lots</b>) exceeds this account's maximum allowed lot cap of <b>${lotCap} Lots</b>.`,
      };
    }

    // 7. Per-Trade Maximum Dollar Risk Guardrail (Settings: maxRiskPerTradePercent, default 2.0%)
    const isGold = symbol.includes('XAU') || symbol === 'GOLD';
    const tradeRiskDollars = isGold ? slPoints * 10 * volume : slPoints * volume;
    const balance = Number(account.currentBalance || account.initialBalance || 10000);
    const maxRiskPct = user?.riskSettings?.maxRiskPerTradePercent ?? 2.0;
    const maxAllowedRiskDollars = (balance * maxRiskPct) / 100;

    if (maxAllowedRiskDollars > 0 && tradeRiskDollars > maxAllowedRiskDollars * 1.05) {
      return {
        allowed: false,
        reason:
          `🛡️ <b>ORDER BLOCKED: RISK PER TRADE EXCEEDED</b>\n\n` +
          `This order risks <b>-$${tradeRiskDollars.toFixed(2)}</b>.\n` +
          `Your maximum allowed risk per trade is <b>-$${maxAllowedRiskDollars.toFixed(2)}</b> (${maxRiskPct}% of $${balance.toLocaleString()}).\n` +
          `Reduce volume or use <code>/risk ${isGold ? 'gold' : 'eth'} ${Math.floor(maxAllowedRiskDollars)}</code> for auto-sizing.`,
      };
    }

    // 8. Revenge Trading Cooldown Guardrail (Settings: revengeTradingMinutes, default 30m)
    const revengeMins = user?.riskSettings?.revengeTradingMinutes ?? 0;
    if (revengeMins > 0) {
      const cooldownSince = new Date(Date.now() - revengeMins * 60 * 1000);
      const recentLosingTrade = await Trade.findOne({
        userId: user._id,
        accountId: account._id,
        status: 'CLOSED',
        exitTime: { $gte: cooldownSince },
        $or: [{ 'calculated.netPnL': { $lt: 0 } }, { netPnL: { $lt: 0 } }],
      }).sort({ exitTime: -1 }).lean();

      if (recentLosingTrade) {
        const lossPnl = recentLosingTrade.calculated?.netPnL ?? (recentLosingTrade as any).netPnL ?? 0;
        const exitTimeMs = recentLosingTrade.exitTime ? new Date(recentLosingTrade.exitTime).getTime() : Date.now();
        const closedMinsAgo = Math.max(0, Math.round((Date.now() - exitTimeMs) / 60000));
        return {
          allowed: false,
          reason:
            `🛑 <b>ORDER BLOCKED: REVENGE TRADING COOLDOWN ACTIVE</b>\n\n` +
            `You closed a losing trade (-$${Math.abs(lossPnl).toFixed(2)}) <b>${closedMinsAgo}m ago</b> (Cooldown: <b>${revengeMins}m</b>).\n` +
            `Take a breather and allow emotional variance to settle before re-entering.`,
        };
      }
    }

    // 9. Hard Discipline Lockout (Settings: hardDisciplineLockoutEnabled)
    if (user?.liveWatcherSettings?.hardDisciplineLockoutEnabled) {
      const lastLossDate = user?.liveWatcherSettings?.lastDailyLossAlertDate;
      if (lastLossDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (lastLossDate === todayStr) {
          return {
            allowed: false,
            reason:
              `🔒 <b>ORDER BLOCKED: HARD DISCIPLINE LOCKOUT ACTIVE</b>\n\n` +
              `Daily loss threshold was reached today. Trading lockout is in effect until tomorrow's session.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Executes a direct MT5 order triggered from a Telegram button callback.
   */
  static async executeTelegramOrder(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    symbol: string,
    side: 'BUY' | 'SELL',
    volume: number,
    slPoints: number,
    tpPoints: number
  ): Promise<void> {
    if (!botToken) return;

    try {
      const account = await this.resolveMt5Account(user._id);
      const isGold = symbol.includes('XAU') || symbol === 'GOLD';
      const cleanSym = isGold ? 'XAUUSD' : (symbol.includes('ETH') ? 'ETHUSD' : symbol.toUpperCase());

      // Fetch live price
      let ltp = 0;
      let quoteTimestamp: Date | undefined;
      const mt5Quote = Mt5CommandService.getLiveQuote(cleanSym);
      if (mt5Quote && mt5Quote.ltp > 0) {
        ltp = mt5Quote.ltp;
        quoteTimestamp = mt5Quote.timestamp;
      }
      if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(cleanSym)) {
        try {
          const quotes = await GlobalCfdCandleProvider.getLiveQuotes([cleanSym]);
          const gq = quotes.get(cleanSym);
          if (gq && gq.ltp > 0) {
            ltp = gq.ltp;
            quoteTimestamp = gq.timestamp;
          }
        } catch {}
      }
      if (ltp === 0) {
        const recentTrade = await Trade.findOne({ userId: user._id, symbol: new RegExp(cleanSym, 'i') }).sort({ createdAt: -1 });
        ltp = recentTrade?.simpleExecution?.entryPrice || (isGold ? 2650 : 3100);
      }

      // 1. Evaluate Pre-Trade Guardrails
      const guardrail = await this.evaluateOrderGuardrails(
        user,
        account,
        cleanSym,
        side,
        volume,
        slPoints,
        tpPoints,
        ltp,
        quoteTimestamp
      );

      if (!guardrail.allowed) {
        const buttons: ITelegramInlineButton[][] = [
          [
            { text: '📊 Open Trades', callback_data: 'cmd_trades' },
            { text: '📌 Live Cockpit', callback_data: 'cmd_cockpit' },
          ],
        ];
        await this.sendMessage(botToken, chatId, guardrail.reason || '🛡️ Order blocked by risk guardrails.', buttons);
        return;
      }

      const slDist = isGold ? slPoints * 0.10 : slPoints;
      const tpDist = isGold ? tpPoints * 0.10 : tpPoints;

      const slPrice = side === 'BUY' ? ltp - slDist : ltp + slDist;
      const tpPrice = tpDist > 0 ? (side === 'BUY' ? ltp + tpDist : ltp - tpDist) : 0;

      await Mt5CommandService.queueOpenOrder({
        userId: user._id,
        accountId: account._id,
        symbol: cleanSym,
        side,
        volume,
        stopLoss: Number(slPrice.toFixed(2)),
        takeProfit: tpPrice > 0 ? Number(tpPrice.toFixed(2)) : undefined,
        comment: `TG-${cleanSym}`,
      });

      // Clear any pre-order submenu state so live cockpit displays freshly queued order
      TelegramAlertService.clearSubmenu(user._id);

      const estRisk = isGold ? (slPoints * 10 * volume) : (slDist * volume);
      const estReward = tpDist > 0 ? (isGold ? (tpPoints * 10 * volume) : (tpDist * volume)) : 0;

      const confirmText =
        `⚡ <b>MT5 ORDER QUEUED ON BRIDGE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${cleanSym}\n` +
        `Side     : ${side}\n` +
        `Volume   : ${volume.toFixed(2)} Lots\n` +
        `Est. Fill: $${ltp.toFixed(2)}\n` +
        `Stop Loss: $${slPrice.toFixed(2)} (-$${estRisk.toFixed(2)})\n` +
        (tpPrice > 0 ? `Target   : $${tpPrice.toFixed(2)} (+$${estReward.toFixed(2)})\n` : '') +
        `Account  : ${account.name || 'MT5'}\n` +
        `Status   : QUEUED (Pending 1s EA poll)\n` +
        `</pre>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Order will execute on the connected MT5 terminal.</i>`;

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '🔄 Check Price', callback_data: `price_${cleanSym}` },
          { text: `🚨 Close All ${cleanSym}`, callback_data: isGold ? 'cmd_close_gold' : 'cmd_close_eth' },
        ],
        [
          { text: '📊 View Open Trades', callback_data: 'cmd_trades' },
          { text: '📌 Pin Cockpit', callback_data: 'cmd_pin_cockpit' },
        ],
      ];

      await this.sendMessage(botToken, chatId, confirmText, buttons);

      // Automatically pin (or update in-place) the live cockpit with the newly queued position
      await this.autoPinOrUpdateCockpit(user).catch(() => {});
    } catch (err: any) {
      await this.sendMessage(
        botToken,
        chatId,
        `❌ <b>Order Execution Failed:</b> ${err.message}`
      );
    }
  }

  /**
   * Handles /gold (and /xau) or /eth (and /ethereum) orders and menus.
   */
  static async handleForexOrderCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    defaultSymbol: string,
    args: string[] = []
  ): Promise<void> {
    if (!botToken) return;

    const isGold = defaultSymbol.includes('XAU') || defaultSymbol === 'GOLD';
    const isEth = defaultSymbol.includes('ETH');
    const isBtc = defaultSymbol.includes('BTC');
    const isUs30 = defaultSymbol.includes('US30') || defaultSymbol.includes('DOW');
    const isNas = defaultSymbol.includes('NAS') || defaultSymbol.includes('USTEC');

    let cleanSym = defaultSymbol;
    if (isGold) cleanSym = 'XAUUSD';
    else if (isEth) cleanSym = 'ETHUSD';
    else if (isBtc) cleanSym = 'BTCUSD';
    else if (isUs30) cleanSym = 'US30';
    else if (isNas) cleanSym = 'NAS100';

    // Subcommand: /gold close or /eth close
    if (args.length > 0 && args[0].toLowerCase() === 'close') {
      await this.handleCloseSymbolPositions(user, botToken, chatId, cleanSym);
      return;
    }

    // Subcommand: /gold sl <val> or /eth sl <val>
    if (args.length > 1 && args[0].toLowerCase() === 'sl') {
      await this.handleCustomStopLossCommand(user, botToken, chatId, [cleanSym, args[1]]);
      return;
    }

    // Subcommand: /gold add or /eth add (Pyramiding)
    if (args.length > 0 && (args[0].toLowerCase() === 'add' || args[0].toLowerCase() === 'pyramid')) {
      await this.handlePyramidingCommand(user, botToken, chatId, [cleanSym, ...(args.slice(1))]);
      return;
    }

    // Check if user specified BUY, SELL, or PENDING (BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP)
    const actionArg = (args[0] || '').toLowerCase();
    const isLimit = actionArg.includes('limit');
    const isStop = actionArg.includes('stop') && !actionArg.includes('sl');
    const isPending = isLimit || isStop;
    const orderType: 'MARKET' | 'LIMIT' | 'STOP' = isLimit ? 'LIMIT' : (isStop ? 'STOP' : 'MARKET');

    const isBuy = actionArg === 'buy' || actionArg === 'b' || actionArg === 'long' || actionArg.startsWith('buy');
    const isSell = actionArg === 'sell' || actionArg === 's' || actionArg === 'short' || actionArg.startsWith('sell');

    if (isBuy || isSell) {
      const side: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL';

      const presets = user?.liveWatcherSettings?.telegramForexPresets;
      const presetGoldLot = presets?.goldDefaultLot ?? DEFAULT_FOREX_PRESETS.gold.defaultLot;
      const presetGoldSl = presets?.goldSlPoints ?? DEFAULT_FOREX_PRESETS.gold.defaultSlPoints;
      const presetGoldRr = presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr;
      const presetEthLot = presets?.ethDefaultLot ?? DEFAULT_FOREX_PRESETS.eth.defaultLot;
      const presetEthSl = presets?.ethSlPrice ?? DEFAULT_FOREX_PRESETS.eth.defaultSlPrice;
      const presetEthRr = presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr;

      let volume = isGold ? presetGoldLot : (isEth ? presetEthLot : (isBtc ? 0.05 : 0.10));
      let slPoints = isGold ? presetGoldSl : (isEth ? presetEthSl : (isBtc ? 300 : (isUs30 ? 60 : 40)));
      let rr = isGold ? presetGoldRr : (isEth ? presetEthRr : 2.5);
      let tpPoints = slPoints * rr;

      let explicitSlPrice: number | undefined;
      let explicitTpPrice: number | undefined;
      let pendingPrice: number | undefined;

      for (let i = 1; i < args.length; i++) {
        const a = args[i].toLowerCase();
        if (/^\d+(\.\d+)?$/.test(a)) {
          const num = parseFloat(a);
          if (isPending && !pendingPrice && (num > 50 || isGold || isBtc || isUs30 || isNas)) {
            pendingPrice = num;
          } else if (num > 0) {
            volume = num;
          }
        } else if (a.startsWith('vol=') || a.startsWith('volume=') || a.startsWith('lot=') || a.startsWith('lots=')) {
          const v = parseFloat(a.split('=')[1]);
          if (v > 0) volume = v;
        } else if (a.startsWith('price=')) {
          const p = parseFloat(a.split('=')[1]);
          if (p > 0) pendingPrice = p;
        } else if (a.startsWith('sl=') || a.startsWith('stop=')) {
          const valStr = a.split('=')[1].replace('pts', '').replace('pips', '');
          const val = parseFloat(valStr);
          if (val > 0) {
            if (val > 100) {
              explicitSlPrice = val;
            } else {
              slPoints = val;
            }
          }
        } else if (a.startsWith('tp=') || a.startsWith('target=')) {
          const valStr = a.split('=')[1].replace('pts', '').replace('pips', '');
          const val = parseFloat(valStr);
          if (val > 0) {
            if (val > 100) {
              explicitTpPrice = val;
            } else {
              tpPoints = val;
            }
          }
        }
      }

      // Fetch live price
      let ltp = 0;
      let quoteTimestamp: Date | undefined;
      const mt5Quote = Mt5CommandService.getLiveQuote(cleanSym);
      if (mt5Quote && mt5Quote.ltp > 0) {
        ltp = mt5Quote.ltp;
        quoteTimestamp = mt5Quote.timestamp;
      }
      if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(cleanSym)) {
        try {
          const quotes = await GlobalCfdCandleProvider.getLiveQuotes([cleanSym]);
          const gq = quotes.get(cleanSym);
          if (gq && gq.ltp > 0) {
            ltp = gq.ltp;
            quoteTimestamp = gq.timestamp;
          }
        } catch {}
      }
      if (ltp === 0) {
        const recent = await Trade.findOne({ userId: user._id, symbol: new RegExp(cleanSym, 'i') }).sort({ createdAt: -1 });
        ltp = recent?.simpleExecution?.entryPrice || (isGold ? 2650 : (isBtc ? 85000 : (isUs30 ? 44000 : 3100)));
      }

      const basePrice = isPending && pendingPrice ? pendingPrice : ltp;
      const slDist = isGold ? slPoints * 0.10 : slPoints;
      const tpDist = isGold ? tpPoints * 0.10 : tpPoints;

      const finalSl = explicitSlPrice || (side === 'BUY' ? basePrice - slDist : basePrice + slDist);
      const finalTp = explicitTpPrice || (side === 'BUY' ? basePrice + tpDist : basePrice - tpDist);

      const account = await this.resolveMt5Account(user._id);

      // Evaluate Pre-Trade Guardrails
      const guardrail = await this.evaluateOrderGuardrails(
        user,
        account,
        cleanSym,
        side,
        volume,
        slPoints,
        tpPoints,
        ltp,
        quoteTimestamp
      );

      if (!guardrail.allowed) {
        const buttons: ITelegramInlineButton[][] = [
          [
            { text: '📊 Open Trades', callback_data: 'cmd_trades' },
            { text: '📌 Live Cockpit', callback_data: 'cmd_cockpit' },
          ],
        ];
        await this.sendMessage(botToken, chatId, guardrail.reason || '🛡️ Order blocked by risk guardrails.', buttons);
        return;
      }

      await Mt5CommandService.queueOpenOrder({
        userId: user._id,
        accountId: account._id,
        symbol: cleanSym,
        side,
        volume,
        orderType,
        price: isPending ? pendingPrice : undefined,
        stopLoss: Number(finalSl.toFixed(2)),
        takeProfit: Number(finalTp.toFixed(2)),
        comment: `TG-${cleanSym}`,
      });

      // Clear any pre-order submenu state so live cockpit displays freshly queued order
      TelegramAlertService.clearSubmenu(user._id);

      const estRisk = isGold ? (Math.abs(basePrice - finalSl) * 100 * volume) : (Math.abs(basePrice - finalSl) * volume);
      const estReward = Math.abs(finalTp - basePrice) * (isGold ? 100 : 1) * volume;

      const title = orderType === 'MARKET' ? '⚡ <b>MT5 ORDER QUEUED ON BRIDGE</b>' : `⏳ <b>MT5 PENDING ${orderType} ORDER QUEUED</b>`;
      const priceLine = isPending && pendingPrice ? `Price    : $${pendingPrice.toFixed(2)}\n` : `Est. Fill: $${ltp.toFixed(2)}\n`;

      const text =
        `${title}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<pre>\n` +
        `Symbol   : ${cleanSym}\n` +
        `Side     : ${side}\n` +
        `Type     : ${orderType}\n` +
        `Volume   : ${volume.toFixed(2)} Lots\n` +
        priceLine +
        `Stop Loss: $${finalSl.toFixed(2)} (-$${estRisk.toFixed(2)})\n` +
        `Target   : $${finalTp.toFixed(2)} (+$${estReward.toFixed(2)})\n` +
        `Account  : ${account.name || 'MT5'}\n` +
        `Status   : QUEUED (Pending 1s EA poll)\n` +
        `</pre>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Execution will confirm momentarily on MT5.</i>`;

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '🔄 Refresh Price', callback_data: `price_${cleanSym}` },
          { text: `🚨 Close All ${cleanSym}`, callback_data: isGold ? 'cmd_close_gold' : 'cmd_close_eth' },
        ],
        [
          { text: '📊 Open Trades', callback_data: 'cmd_trades' },
          { text: '📌 Pin Cockpit', callback_data: 'cmd_pin_cockpit' },
        ],
      ];

      await this.sendMessage(botToken, chatId, text, buttons);
      return;
    }

    // No buy/sell specified: show dedicated quick menu
    let ltp = 0;
    let bid = 0;
    let ask = 0;
    const mt5Quote = Mt5CommandService.getLiveQuote(cleanSym);
    if (mt5Quote && mt5Quote.ltp > 0) {
      ltp = mt5Quote.ltp;
      bid = mt5Quote.bid || ltp;
      ask = mt5Quote.ask || ltp;
    }
    if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(cleanSym)) {
      try {
        const quotes = await GlobalCfdCandleProvider.getLiveQuotes([cleanSym]);
        const gq = quotes.get(cleanSym);
        if (gq && gq.ltp > 0) {
          ltp = gq.ltp;
          bid = (gq as any).bid || (ltp - 0.20);
          ask = (gq as any).ask || (ltp + 0.20);
        }
      } catch {}
    }
    if (ltp === 0) ltp = isGold ? 2650 : 3100;

    const spreadStr = bid > 0 && ask > 0 ? `$${(ask - bid).toFixed(2)}` : '$0.35';

    // Find active open trades for this symbol
    const openTrades = await Trade.find({
      userId: user._id,
      status: 'OPEN',
      symbol: new RegExp(cleanSym, 'i'),
    }).lean();

    let openSummary = 'None (Flat)';
    if (openTrades.length > 0) {
      openSummary = openTrades
        .map((t: any) => {
          const entry = t.simpleExecution?.entryPrice || t.calculated?.averageEntryPrice || 0;
          const pnl = t.calculated?.floatingNetPnL ?? t.floatingNetPnL ?? 0;
          const sign = pnl >= 0 ? '+' : '';
          return `• ${t.direction} ${t.simpleExecution?.quantity || 1} lots @ $${entry} (${sign}$${pnl.toFixed(2)})`;
        })
        .join('\n');
    }

    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const defaultLot = isGold
      ? (presets?.goldDefaultLot ?? DEFAULT_FOREX_PRESETS.gold.defaultLot)
      : (presets?.ethDefaultLot ?? DEFAULT_FOREX_PRESETS.eth.defaultLot);
    const defaultSl = isGold
      ? (presets?.goldSlPoints ?? DEFAULT_FOREX_PRESETS.gold.defaultSlPoints)
      : (presets?.ethSlPrice ?? DEFAULT_FOREX_PRESETS.eth.defaultSlPrice);
    const defaultRr = isGold
      ? (presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr)
      : (presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr);
    const defaultTp = Number((defaultSl * defaultRr).toFixed(2));

    const menuText =
      `🪙 <b>${cleanSym} • Quick Trading Cockpit</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `LTP       : $${ltp.toFixed(2)}\n` +
      `Spread    : ${spreadStr}\n` +
      `Preset Lot: ${defaultLot} Lots\n` +
      `Preset SL : ${defaultSl} pts ($${(isGold ? defaultSl * 0.10 : defaultSl).toFixed(2)})\n` +
      `Preset TP : ${defaultTp} pts ($${(isGold ? defaultTp * 0.10 : defaultTp).toFixed(2)})\n` +
      `</pre>\n` +
      `<b>Active Positions:</b>\n${openSummary}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Tap below for 1-click execution:</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        {
          text: `🟢 BUY ${cleanSym} (${defaultLot})`,
          callback_data: `deck:order_prep:${cleanSym}:BUY`,
        },
        {
          text: `🔴 SELL ${cleanSym} (${defaultLot})`,
          callback_data: `deck:order_prep:${cleanSym}:SELL`,
        },
      ],
      [
        { text: '🛡️ Lock Breakeven', callback_data: 'cmd_lock_be_all' },
        { text: `🚨 Close All ${cleanSym}`, callback_data: isGold ? 'cmd_close_gold' : 'cmd_close_eth' },
      ],
      [
        { text: '💵 Risk $50 Calculator', callback_data: `price_${cleanSym}` },
        { text: '📌 Pin Live Cockpit', callback_data: 'cmd_pin_cockpit' },
      ],
    ];

    await this.sendMessage(botToken, chatId, menuText, buttons);
  }

  /**
   * Calculates lot size based on dollar risk and presents 1-tap execution buttons.
   * Usage: /risk gold 50 or /risk eth 100 or /risk 50
   */
  static async handleRiskCalculatorCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    args: string[] = []
  ): Promise<void> {
    if (!botToken) return;

    let symbol = 'XAUUSD';
    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    let dollarRisk = presets?.defaultDollarRisk ?? 50;
    let customSlPoints: number | undefined;

    for (const a of args) {
      const lower = a.toLowerCase();
      if (lower === 'gold' || lower === 'xau' || lower === 'xauusd') {
        symbol = 'XAUUSD';
      } else if (lower === 'eth' || lower === 'ethereum' || lower === 'ethusd') {
        symbol = 'ETHUSD';
      } else if (lower.startsWith('sl=') || lower.startsWith('stop=')) {
        const slVal = parseFloat(lower.split('=')[1].replace('pts', ''));
        if (slVal > 0) customSlPoints = slVal;
      } else if (/^\$?\d+(\.\d+)?$/.test(lower)) {
        const num = parseFloat(lower.replace('$', ''));
        if (num > 0) dollarRisk = num;
      }
    }

    const isGold = symbol === 'XAUUSD';
    const presetGoldSl = presets?.goldSlPoints ?? DEFAULT_FOREX_PRESETS.gold.defaultSlPoints;
    const presetGoldRr = presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr;
    const presetEthSl = presets?.ethSlPrice ?? DEFAULT_FOREX_PRESETS.eth.defaultSlPrice;
    const presetEthRr = presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr;

    const slPoints = customSlPoints || (isGold ? presetGoldSl : presetEthSl);
    const tpPoints = isGold ? Number((slPoints * presetGoldRr).toFixed(2)) : Number((slPoints * presetEthRr).toFixed(2));

    let lots = isGold ? dollarRisk / (slPoints * 10) : dollarRisk / slPoints;
    lots = Math.max(0.01, Number(lots.toFixed(2)));

    // Fetch live quote
    let ltp = 0;
    const mt5Quote = Mt5CommandService.getLiveQuote(symbol);
    if (mt5Quote && mt5Quote.ltp > 0) ltp = mt5Quote.ltp;
    if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(symbol)) {
      try {
        const quotes = await GlobalCfdCandleProvider.getLiveQuotes([symbol]);
        const gq = quotes.get(symbol);
        if (gq && gq.ltp > 0) ltp = gq.ltp;
      } catch {}
    }
    if (ltp === 0) ltp = isGold ? 2650 : 3100;

    const slDist = isGold ? slPoints * 0.10 : slPoints;
    const tpDist = isGold ? tpPoints * 0.10 : tpPoints;

    const text =
      `📐 <b>${symbol} • Dollar-Risk Position Calculator</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Risk Budget  : $${dollarRisk.toFixed(2)}\n` +
      `Stop Buffer  : ${slPoints} points ($${slDist.toFixed(2)})\n` +
      `Calculated   : ${lots.toFixed(2)} Lots\n` +
      `Est. Fill    : $${ltp.toFixed(2)}\n` +
      `Target (1:2) : +${tpPoints} points ($${tpDist.toFixed(2)})\n` +
      `</pre>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Tap below to enter with calculated risk:</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        {
          text: `🟢 BUY ${lots.toFixed(2)} ${symbol}`,
          callback_data: `order:${symbol}:BUY:${lots}:${slPoints}:${tpPoints}:exec`,
        },
        {
          text: `🔴 SELL ${lots.toFixed(2)} ${symbol}`,
          callback_data: `order:${symbol}:SELL:${lots}:${slPoints}:${tpPoints}:exec`,
        },
      ],
      [
        { text: '🔄 Refresh Price', callback_data: `price_${symbol}` },
        { text: '📌 Pin Cockpit', callback_data: 'cmd_pin_cockpit' },
      ],
    ];

    await this.sendMessage(botToken, chatId, text, buttons);
  }

  /**
   * Evaluates the trader's dynamic day-risk regime (HOUSE_MONEY, DEFENSIVE, NEUTRAL),
   * audits account rules & prop firm daily loss limits, calculates dynamic trade limits & bonus trades,
   * and produces adaptive sizing tiers & ladder recommendations.
   */
  static async evaluateAdaptiveDayRiskState(
    user: any,
    account?: any,
    symbol: string = 'XAUUSD',
    slPoints: number = 35,
    pointScale: number = 0.10,
    multiplier: number = 100,
    side: 'BUY' | 'SELL' = 'BUY'
  ): Promise<IAdaptiveDayRiskState> {
    let acc = account;
    if (!acc || !acc._id) {
      try {
        acc = await this.resolveMt5Account(user._id);
      } catch {
        acc = null;
      }
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    let todayClosedTrades: any[] = [];
    let openTrades: any[] = [];
    let todayTradesCount = 0;

    if (acc?._id) {
      todayClosedTrades = await Trade.find({
        userId: user._id,
        accountId: acc._id,
        status: 'CLOSED',
        exitTime: { $gte: startOfDay },
      }).sort({ exitTime: -1 }).lean();

      openTrades = await Trade.find({
        userId: user._id,
        accountId: acc._id,
        status: 'OPEN',
      }).lean();

      todayTradesCount = await Trade.countDocuments({
        userId: user._id,
        accountId: acc._id,
        createdAt: { $gte: startOfDay },
      });
    }

    let todayRealizedPnL = 0;
    let todayWinCount = 0;
    let todayLossCount = 0;
    let consecutiveLosses = 0;
    let streakCounted = false;
    let accumulatedR = 0;

    // Resolve base 1R upfront for fallback R calculation
    const balance = Number(acc?.currentBalance || acc?.initialBalance || 100000);
    const maxRiskPct =
      acc?.riskRules?.maxRiskPerTradePercent ??
      acc?.profile?.riskRules?.maxRiskPerTradePercent ??
      user?.riskSettings?.maxRiskPerTradePercent ??
      1.0;
    const maxAllowedRiskDollars = (balance * maxRiskPct) / 100;
    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const defaultDollarRisk = presets?.defaultDollarRisk;
    const effectiveBase1RDollar = defaultDollarRisk ?? Math.min(50, maxAllowedRiskDollars);
    const base1RDollar = effectiveBase1RDollar;

    for (const t of todayClosedTrades) {
      const pnl = Number(t.calculated?.netPnL ?? (t as any).netPnL ?? 0);
      todayRealizedPnL += pnl;
      if (pnl > 0) {
        todayWinCount++;
        if (!streakCounted) {
          streakCounted = true;
        }
      } else if (pnl < 0) {
        todayLossCount++;
        if (!streakCounted) {
          consecutiveLosses++;
        }
      }

      // Calculate realized R for this trade
      let tradeR = 0;
      if (t.calculated?.realizedRMultiple !== undefined && t.calculated.realizedRMultiple !== null) {
        tradeR = Number(t.calculated.realizedRMultiple);
      } else if (t.risk?.realizedRMultiple !== undefined && t.risk.realizedRMultiple !== null) {
        tradeR = Number(t.risk.realizedRMultiple);
      } else if (t.calculated?.riskAmount && Number(t.calculated.riskAmount) > 0) {
        tradeR = pnl / Number(t.calculated.riskAmount);
      } else if (t.risk?.plannedRiskAmount && Number(t.risk.plannedRiskAmount) > 0) {
        tradeR = pnl / Number(t.risk.plannedRiskAmount);
      } else if (t.risk?.estimatedRiskAmount && Number(t.risk.estimatedRiskAmount) > 0) {
        tradeR = pnl / Number(t.risk.estimatedRiskAmount);
      } else if (t.risk?.initialStopLoss && (t.simpleExecution?.entryPrice || (t as any).entryPrice)) {
        const entry = Number(t.simpleExecution?.entryPrice ?? (t as any).entryPrice);
        const sl = Number(t.risk.initialStopLoss);
        const dist = Math.abs(entry - sl);
        const qty = Number(t.simpleExecution?.quantity ?? (t as any).quantity ?? 1);
        const isGoldTrade = (t.symbol || '').includes('XAU') || t.symbol === 'GOLD';
        const plannedRisk = Math.max(1, dist * qty * (isGoldTrade ? 100 : 1));
        tradeR = pnl / plannedRisk;
      } else {
        tradeR = base1RDollar > 0 ? pnl / base1RDollar : 0;
      }
      accumulatedR += tradeR;
    }

    accumulatedR = Number(accumulatedR.toFixed(2));
    todayRealizedPnL = Number(todayRealizedPnL.toFixed(2));

    let todayFloatingPnL = 0;
    for (const t of openTrades) {
      const floatPnl = Number((t.calculated as any)?.floatingNetPnL ?? (t as any).floatingNetPnL ?? 0);
      todayFloatingPnL += floatPnl;
    }

    todayFloatingPnL = Number(todayFloatingPnL.toFixed(2));
    const todayTotalPnL = Number((todayRealizedPnL + todayFloatingPnL).toFixed(2));
    const todayPeakPnL = Math.max(0, todayRealizedPnL, todayTotalPnL);

    // Dynamic Session Starting Capital (Immunized against intraday profit withdrawals)
    const sessionStartingCapital = Math.max(10, balance - todayRealizedPnL);
    const capitalGrowthPct = sessionStartingCapital > 0
      ? Number(((todayRealizedPnL / sessionStartingCapital) * 100).toFixed(2))
      : 0;

    // Account & Prop Firm Daily Loss Limit
    let effectiveDailyLossLimit = 5000;
    if (acc) {
      if (AccountScopeService.isPropAccount(acc)) {
        effectiveDailyLossLimit = AccountScopeService.getPropAccountDailyLossLimit(acc);
      } else {
        effectiveDailyLossLimit =
          acc.riskRules?.maxDailyLoss ??
          acc.profile?.riskRules?.maxDailyLoss ??
          user?.riskSettings?.maxDailyLoss ??
          5000;
      }
    }
    const remainingDailyLossBuffer = Math.max(0, Number((effectiveDailyLossLimit + todayTotalPnL).toFixed(2)));
    const isDailyLossBreached = todayTotalPnL <= -effectiveDailyLossLimit || remainingDailyLossBuffer <= 0;

    // Base Daily Trades
    const baseMaxDailyTrades =
      acc?.riskRules?.maxDailyTrades ??
      acc?.profile?.riskRules?.maxDailyTrades ??
      user?.riskSettings?.maxDailyTrades ??
      6;

    // Regime classification
    let regime: DayRiskRegime = 'NEUTRAL';
    let regimeLabel = 'Neutral Day';
    let regimeBadge = '⚪';

    const isDefensive = todayTotalPnL <= -25 || consecutiveLosses >= 2;
    const isHouseMoney = !isDefensive && todayRealizedPnL >= 25 && todayTotalPnL > 0;

    if (isDefensive) {
      regime = 'DEFENSIVE';
      regimeLabel = consecutiveLosses >= 2
        ? `Defensive Mode (${consecutiveLosses}L Streak)`
        : 'Defensive Mode (Drawdown)';
      regimeBadge = '🔴';
    } else if (isHouseMoney) {
      regime = 'HOUSE_MONEY';
      regimeLabel = 'House Money Session';
      regimeBadge = '🟢';
    } else {
      regime = 'NEUTRAL';
      regimeLabel = 'Neutral Session';
      regimeBadge = '⚪';
    }

    // Dynamic trade limits & Option B 1:2R Dual-Gate bonus trades
    let bonusTradesEarned = 0;
    let effectiveMaxDailyTrades = baseMaxDailyTrades;

    if (regime === 'HOUSE_MONEY') {
      const isFatigued = todayTradesCount >= baseMaxDailyTrades * 2;
      if (!isFatigued) {
        // Option B Dual Gate: Minimum 1:2R (+2.0R) and 2x 1R profit gate to unlock bonus trades
        if (accumulatedR >= 5.0 && todayRealizedPnL >= 5.0 * effectiveBase1RDollar) {
          bonusTradesEarned = 3;
        } else if (accumulatedR >= 3.5 && todayRealizedPnL >= 3.5 * effectiveBase1RDollar) {
          bonusTradesEarned = 2;
        } else if (accumulatedR >= 2.0 && todayRealizedPnL >= 2.0 * effectiveBase1RDollar) {
          bonusTradesEarned = 1;
        } else {
          bonusTradesEarned = 0;
        }
      } else {
        bonusTradesEarned = 0;
      }
      effectiveMaxDailyTrades = baseMaxDailyTrades + bonusTradesEarned;
    } else if (regime === 'DEFENSIVE') {
      if (consecutiveLosses >= 3) {
        effectiveMaxDailyTrades = Math.max(1, Math.min(baseMaxDailyTrades, todayTradesCount));
      } else {
        effectiveMaxDailyTrades = Math.max(todayTradesCount, baseMaxDailyTrades - 2);
      }
    }

    const remainingTrades = Math.max(0, effectiveMaxDailyTrades - todayTradesCount);
    const isTradeLimitReached = todayTradesCount >= effectiveMaxDailyTrades;

    // Risk Dollar Sizing: dynamically scaled by accumulated R
    let targetDollarRisk = effectiveBase1RDollar;
    let riskRationale = '';

    if (regime === 'HOUSE_MONEY') {
      const rMultiplier = Math.min(1.5, Math.max(0.5, (accumulatedR > 0 ? accumulatedR : 1.5) / 3));
      const rScaledRisk = effectiveBase1RDollar * rMultiplier;
      const houseMoneyBudget = Math.max(25, Number((todayRealizedPnL * 0.33).toFixed(2)));
      targetDollarRisk = Math.min(maxAllowedRiskDollars, Math.min(rScaledRisk, houseMoneyBudget));
      riskRationale = `House Money Advantage: Banked +$${todayRealizedPnL.toFixed(2)} (+${accumulatedR.toFixed(2)}R, +${capitalGrowthPct.toFixed(2)}% capital growth). Next risk budgeted at disciplined $${targetDollarRisk.toFixed(0)} (${((targetDollarRisk / balance) * 100).toFixed(2)}% equity), locking ≥67% banked gains.`;
    } else if (regime === 'DEFENSIVE') {
      const defensiveScale = consecutiveLosses >= 3 ? 0.25 : 0.50;
      const bufferCap = Math.max(10, remainingDailyLossBuffer * 0.20);
      targetDollarRisk = Math.max(10, Math.min(effectiveBase1RDollar * defensiveScale, bufferCap));
      riskRationale = `Defensive Guardrail Active: Scaled to ${Math.round(defensiveScale * 100)}% standard risk ($${targetDollarRisk.toFixed(0)}) to protect remaining $${remainingDailyLossBuffer.toFixed(0)} buffer and curb drawdown.`;
    } else {
      targetDollarRisk = effectiveBase1RDollar;
      riskRationale = `Standard Session: Baseline risk-adjusted sizing ($${targetDollarRisk.toFixed(0)}) within account rules and 1.0% equity cap.`;
    }

    // Adaptive Ladder Notes based on user's liveWatcherSettings
    const t1MultipleR = user?.liveWatcherSettings?.t1MultipleR ?? 1.0;
    const t1ExitRatio = user?.liveWatcherSettings?.t1ExitRatio ?? 0.50;
    const t2MultipleR = user?.liveWatcherSettings?.t2MultipleR ?? 2.0;
    const t2ExitRatio = user?.liveWatcherSettings?.t2ExitRatio ?? 0.25;
    const isFreeRunner = Boolean(user?.liveWatcherSettings?.isFreeRunner);

    let recommendedLadderNotes = '';
    if (regime === 'HOUSE_MONEY') {
      recommendedLadderNotes = `🎯 T1 (+${t1MultipleR}R): Harvest ${Math.round(t1ExitRatio * 100)}% & Lock True BE ➜ 🚀 Runner (+${t2MultipleR}R+): Dynamic Trailing Ratchet`;
    } else if (regime === 'DEFENSIVE') {
      recommendedLadderNotes = `🛡️ Defensive Lock: Take 75% at T1 (+${t1MultipleR}R) & Instantly move SL to True BE. Leave 25% to +${t2MultipleR}R`;
    } else {
      const runnerStr = isFreeRunner ? ' ➜ Free Runner Trailing' : '';
      recommendedLadderNotes = `🎯 Standard Ladder: T1 (+${t1MultipleR}R) take ${Math.round(t1ExitRatio * 100)}% ➜ T2 (+${t2MultipleR}R) take ${Math.round(t2ExitRatio * 100)}%${runnerStr}`;
    }

    // Adaptive Sizing Tiers & Lots
    const isGold = (symbol || '').includes('XAU') || symbol === 'GOLD';
    const isEth = (symbol || '').includes('ETH');
    const isBtc = (symbol || '').includes('BTC');

    const defaultLot = isGold
      ? (presets?.goldDefaultLot ?? DEFAULT_FOREX_PRESETS.gold.defaultLot)
      : (isEth
        ? (presets?.ethDefaultLot ?? DEFAULT_FOREX_PRESETS.eth.defaultLot)
        : (isBtc ? (DEFAULT_FOREX_PRESETS.btc?.defaultLot ?? 0.05) : 0.10));

    const defaultRr = isGold
      ? (presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr)
      : (isEth
        ? (presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr)
        : (isBtc ? (DEFAULT_FOREX_PRESETS.btc?.defaultRr ?? 2.5) : 2.0));

    const slDist = Number((slPoints * pointScale).toFixed(2));
    const riskPer1Lot = Math.max(0.001, slDist * multiplier);

    let bestOptionLot = riskPer1Lot > 0 ? targetDollarRisk / riskPer1Lot : defaultLot;
    bestOptionLot = Math.max(0.01, Number(bestOptionLot.toFixed(2)));

    const lotCap = acc?.riskRules?.lotCap ?? acc?.profile?.riskRules?.lotCap;
    if (lotCap && lotCap > 0 && bestOptionLot > lotCap) {
      bestOptionLot = lotCap;
    }

    const microLot = 0.01;
    let conservativeLot = Math.max(0.01, Number((bestOptionLot * 0.5).toFixed(2)));
    let presetLot = Number(defaultLot.toFixed(2));
    if (lotCap && lotCap > 0 && presetLot > lotCap) {
      presetLot = lotCap;
    }

    const bestRisk = Number((bestOptionLot * riskPer1Lot).toFixed(2));
    const bestReward = Number((bestOptionLot * riskPer1Lot * defaultRr).toFixed(2));
    const microRisk = Number((microLot * riskPer1Lot).toFixed(2));
    const microReward = Number((microLot * riskPer1Lot * defaultRr).toFixed(2));
    const conservativeRisk = Number((conservativeLot * riskPer1Lot).toFixed(2));
    const conservativeReward = Number((conservativeLot * riskPer1Lot * defaultRr).toFixed(2));
    const presetRisk = Number((presetLot * riskPer1Lot).toFixed(2));
    const presetReward = Number((presetLot * riskPer1Lot * defaultRr).toFixed(2));

    let bestOptionLabel = `🌟 ${side} BEST OPTION (${bestOptionLot.toFixed(2)}L • -$${bestRisk.toFixed(0)})`;
    let microLabel = `🛡️ Micro Safe (${microLot.toFixed(2)}L • -$${microRisk.toFixed(2)})`;
    let conservativeLabel = `⚖️ Cons (${conservativeLot.toFixed(2)}L • -$${conservativeRisk.toFixed(2)})`;
    let presetLabel = `⚡ Preset (${presetLot.toFixed(2)}L • -$${presetRisk.toFixed(2)})`;

    let extraRiskLot: number | undefined;
    let extraRiskLabel: string | undefined;
    let extraRisk: number | undefined;
    let dollarBudgets: Array<{ amount: number; lot: number; label: string }> = [];

    if (regime === 'HOUSE_MONEY') {
      bestOptionLabel = `🌟 ${side} BEST OPTION (${bestOptionLot.toFixed(2)}L • House Money -$${bestRisk.toFixed(0)})`;
      let extraLot = Math.max(0.01, Number((defaultLot * 2).toFixed(2)));
      if (lotCap && lotCap > 0 && extraLot > lotCap) extraLot = lotCap;
      extraRiskLot = extraLot;
      extraRisk = Number((extraLot * riskPer1Lot).toFixed(2));
      extraRiskLabel = `🚀 Momentum Boost (${extraLot.toFixed(2)}L • -$${extraRisk.toFixed(0)})`;
      dollarBudgets = [];
    } else if (regime === 'DEFENSIVE') {
      bestOptionLabel = `🌟 ${side} BEST OPTION (${bestOptionLot.toFixed(2)}L • Defensive Half -$${bestRisk.toFixed(0)})`;
      conservativeLabel = `⚖️ Defensive Half (${conservativeLot.toFixed(2)}L • -$${conservativeRisk.toFixed(2)})`;
      extraRiskLot = undefined;
      extraRiskLabel = undefined;
      extraRisk = undefined;
      dollarBudgets = [];
    } else {
      let extraLot = Math.max(0.01, Number((defaultLot * 2).toFixed(2)));
      if (lotCap && lotCap > 0 && extraLot > lotCap) extraLot = lotCap;
      extraRiskLot = extraLot;
      extraRisk = Number((extraLot * riskPer1Lot).toFixed(2));
      extraRiskLabel = `🚀 Extra Risk (${extraLot.toFixed(2)}L • -$${extraRisk.toFixed(0)})`;

      dollarBudgets = [
        { amount: 25, lot: Math.max(0.01, Number((25 / riskPer1Lot).toFixed(2))), label: '💵 $25 Risk' },
        { amount: 50, lot: Math.max(0.01, Number((50 / riskPer1Lot).toFixed(2))), label: '💵 $50 Risk' },
      ];
    }

    const extraRiskReward = extraRiskLot ? Number((extraRiskLot * riskPer1Lot * defaultRr).toFixed(2)) : undefined;

    const tiers: IAdaptiveDayRiskTier = {
      bestOptionLot,
      bestOptionLabel,
      bestRisk,
      bestReward,
      microLot,
      microLabel,
      microRisk,
      microReward,
      conservativeLot,
      conservativeLabel,
      conservativeRisk,
      conservativeReward,
      presetLot,
      presetLabel,
      presetRisk,
      presetReward,
      extraRiskLot,
      extraRiskLabel,
      extraRisk,
      extraRiskReward,
      dollarBudgets,
    };

    return {
      regime,
      regimeLabel,
      regimeBadge,
      todayRealizedPnL,
      todayFloatingPnL,
      todayTotalPnL,
      todayTradesCount,
      todayWinCount,
      todayLossCount,
      consecutiveLosses,
      todayPeakPnL,
      effectiveMaxDailyTrades,
      remainingTrades,
      bonusTradesEarned,
      isTradeLimitReached,
      effectiveDailyLossLimit,
      remainingDailyLossBuffer,
      isDailyLossBreached,
      targetDollarRisk,
      riskRationale,
      recommendedLadderNotes,
      accumulatedR,
      capitalGrowthPct,
      tiers,
    };
  }

  /**
   * Generates the deep sizing & lot options report card for any asset (Gold, ETH, BTC, US30, NAS100).
   * Audits live account equity, prop firm challenge guardrails, and highlights the optimal BEST OPTION.
   */
  static async buildOrderPrepPayload(
    user: any,
    symbol: string,
    side: 'BUY' | 'SELL' = 'BUY'
  ): Promise<{ text: string; buttons: ITelegramInlineButton[][] }> {
    const isGold = (symbol || '').includes('XAU') || symbol === 'GOLD';
    const isEth = (symbol || '').includes('ETH');
    const isBtc = (symbol || '').includes('BTC');
    const isUs30 = (symbol || '').includes('US30') || (symbol || '').includes('DOW');
    const isNas = (symbol || '').includes('NAS') || (symbol || '').includes('USTEC');

    let cleanSym = 'XAUUSD';
    let displaySym = 'Gold (XAUUSD)';
    let symIcon = '🟡';
    let multiplier = 100;
    let pointScale = 0.10; // 1 point = $0.10 for Gold

    if (isGold) {
      cleanSym = 'XAUUSD';
      displaySym = 'Gold (XAUUSD)';
      symIcon = '🟡';
      multiplier = 100;
      pointScale = 0.10;
    } else if (isEth) {
      cleanSym = 'ETHUSD';
      displaySym = 'ETHUSD';
      symIcon = '🔷';
      multiplier = 1;
      pointScale = 1.0;
    } else if (isBtc) {
      cleanSym = 'BTCUSD';
      displaySym = 'BTCUSD';
      symIcon = '₿';
      multiplier = 1;
      pointScale = 1.0;
    } else if (isUs30) {
      cleanSym = 'US30';
      displaySym = 'US30';
      symIcon = '🇺🇸';
      multiplier = 1;
      pointScale = 1.0;
    } else if (isNas) {
      cleanSym = 'NAS100';
      displaySym = 'NAS100';
      symIcon = '💻';
      multiplier = 1;
      pointScale = 1.0;
    } else {
      cleanSym = (symbol || 'XAUUSD').toUpperCase();
      displaySym = cleanSym;
      symIcon = '🪙';
      multiplier = 100;
      pointScale = 0.10;
    }

    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const defaultLot = isGold
      ? (presets?.goldDefaultLot ?? DEFAULT_FOREX_PRESETS.gold.defaultLot)
      : (isEth
        ? (presets?.ethDefaultLot ?? DEFAULT_FOREX_PRESETS.eth.defaultLot)
        : (isBtc ? (DEFAULT_FOREX_PRESETS.btc?.defaultLot ?? 0.05) : 0.10));

    const defaultSl = isGold
      ? (presets?.goldSlPoints ?? DEFAULT_FOREX_PRESETS.gold.defaultSlPoints)
      : (isEth
        ? (presets?.ethSlPrice ?? DEFAULT_FOREX_PRESETS.eth.defaultSlPrice)
        : (isBtc ? (DEFAULT_FOREX_PRESETS.btc?.defaultSlPoints ?? 300) : (isUs30 ? 60 : 40)));

    const defaultRr = isGold
      ? (presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr)
      : (isEth
        ? (presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr)
        : (isBtc ? (DEFAULT_FOREX_PRESETS.btc?.defaultRr ?? 2.5) : 2.0));

    const slPoints = defaultSl;
    const tpPoints = Number((slPoints * defaultRr).toFixed(2));
    const slDist = Number((slPoints * pointScale).toFixed(2));
    const tpDist = Number((tpPoints * pointScale).toFixed(2));
    const riskPer1Lot = Math.max(0.001, slDist * multiplier);

    // Fetch live quote
    let ltp = 0;
    let bid = 0;
    let ask = 0;
    const mt5Quote = Mt5CommandService.getLiveQuote(cleanSym);
    if (mt5Quote && mt5Quote.ltp > 0) {
      ltp = mt5Quote.ltp;
      bid = mt5Quote.bid || ltp;
      ask = mt5Quote.ask || ltp;
    }
    if (ltp === 0 && GlobalCfdCandleProvider.isSupportedGlobalSymbol(cleanSym)) {
      try {
        const quotes = await GlobalCfdCandleProvider.getLiveQuotes([cleanSym]);
        const gq = quotes.get(cleanSym);
        if (gq && gq.ltp > 0) {
          ltp = gq.ltp;
          bid = (gq as any).bid || (ltp - 0.20);
          ask = (gq as any).ask || (ltp + 0.20);
        }
      } catch {}
    }
    if (ltp === 0) {
      ltp = isGold ? 3538.18 : (isEth ? 1671.85 : (isBtc ? 91450.00 : (isUs30 ? 48350.00 : 25029.00)));
      bid = ltp - 0.20;
      ask = ltp + 0.20;
    }
    const spreadVal = (ask > 0 && bid > 0) ? Math.max(0.01, ask - bid) : (isGold ? 0.35 : (isEth ? 0.50 : 5.00));
    const spreadStr = `$${spreadVal.toFixed(2)}`;

    const entryPrice = side === 'BUY' ? (ask > 0 ? ask : ltp) : (bid > 0 ? bid : ltp);
    const slPrice = side === 'BUY' ? entryPrice - slDist : entryPrice + slDist;
    const tpPrice = side === 'BUY' ? entryPrice + tpDist : entryPrice - tpDist;

    // Account & Risk calculations
    let equity = 100000;
    let accountName = 'MT5 Elefin';
    let propNotes = '';
    let account: any = null;
    try {
      account = await this.resolveMt5Account(user._id);
      if (account?.currentBalance) equity = Number(account.currentBalance);
      if (account?.name) accountName = account.name;
      if (account?.accountType === 'PROP_FIRM' || account?.propFirmConfig?.enabled) {
        propNotes = ' • Prop Guard Armed';
      }
    } catch {}

    const adaptive = await this.evaluateAdaptiveDayRiskState(
      user,
      account,
      cleanSym,
      slPoints,
      pointScale,
      multiplier,
      side
    );

    const {
      bestOptionLot,
      bestOptionLabel,
      bestRisk,
      bestReward,
      microLot,
      microLabel,
      microRisk,
      microReward,
      conservativeLot,
      conservativeLabel,
      conservativeRisk,
      conservativeReward,
      presetLot,
      presetLabel,
      presetRisk,
      presetReward,
      extraRiskLot,
      extraRiskLabel,
      extraRisk,
      dollarBudgets,
    } = adaptive.tiers;

    const extraRiskReward = extraRiskLot ? Number((extraRiskLot * riskPer1Lot * defaultRr).toFixed(2)) : 0;
    const bestPctEquity = equity > 0 ? ((bestRisk / equity) * 100).toFixed(2) : '0.05';
    const sideEmoji = side === 'BUY' ? '🟢' : '🔴';
    const sideLabel = side === 'BUY' ? 'BUY (LONG)' : 'SELL (SHORT)';

    const pnlSign = adaptive.todayTotalPnL >= 0 ? '+' : '';
    const bonusText = adaptive.bonusTradesEarned > 0 ? ` (+${adaptive.bonusTradesEarned} bonus)` : '';
    const rSign = (adaptive.accumulatedR ?? 0) >= 0 ? '+' : '';
    const rMultipleText = adaptive.accumulatedR !== undefined ? ` • R: ${rSign}${adaptive.accumulatedR.toFixed(2)}R` : '';
    const growthSign = (adaptive.capitalGrowthPct ?? 0) >= 0 ? '+' : '';
    const growthText = adaptive.capitalGrowthPct !== undefined ? ` • Growth: ${growthSign}${adaptive.capitalGrowthPct.toFixed(2)}%` : '';

    const extraRiskTitle = adaptive.regime === 'HOUSE_MONEY' ? 'Momentum Boost' : 'Extra Risk';
    const extraRiskLine = extraRiskLot && extraRisk !== undefined
      ? `• 🚀 <b>${extraRiskTitle}</b>  : <code>${extraRiskLot.toFixed(2)}L</code> ➜ Risk: <b>-$${extraRisk.toFixed(2)}</b> | Reward: <b>+$${extraRiskReward.toFixed(2)}</b>\n`
      : `• 🚀 <b>Extra Risk</b>  : <i>[Disabled in Defensive Mode to protect buffer]</i>\n`;

    const text =
      `${symIcon} <b>${displaySym} • ${side} LOT OPTIONS REPORT (HARD DISCIPLINE)</b>\n` +
      `⚡ <i>Live LTP: $${ltp.toFixed(2)}  (Spread ${spreadStr})</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>Direction   :</b> ${sideEmoji} <b>${sideLabel}</b>\n` +
      `🛑 <b>Stop Loss   :</b> <code>$${slPrice.toFixed(2)}</code> (-${slPoints} pts / -$${slDist.toFixed(2)})\n` +
      `🎯 <b>Take Profit :</b> <code>$${tpPrice.toFixed(2)}</code> (+${tpPoints} pts / 1:${defaultRr.toFixed(1)} RR)\n` +
      `💼 <b>Account     :</b> ${accountName} ($${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${propNotes})\n` +
      `📈 <b>Day State   :</b> ${adaptive.regimeBadge} <b>${adaptive.regimeLabel}</b> (P&L: ${pnlSign}$${adaptive.todayTotalPnL.toFixed(2)}${rMultipleText}${growthText} | Trades: ${adaptive.todayTradesCount}/${adaptive.effectiveMaxDailyTrades}${bonusText})\n` +
      `🛡️ <b>Day Buffer  :</b> Remaining Buffer: <b>$${adaptive.remainingDailyLossBuffer.toFixed(2)}</b> (Limit: $${adaptive.effectiveDailyLossLimit.toFixed(2)})\n` +
      `🎯 <b>Ladder Plan :</b> <i>${adaptive.recommendedLadderNotes}</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌟 <b>BEST OPTION (RECOMMENDED):</b>\n` +
      `👉 <b>${bestOptionLot.toFixed(2)} Lots</b>  |  Risk: <b>-$${bestRisk.toFixed(2)}</b> (${bestPctEquity}%)  |  Target: <b>+$${bestReward.toFixed(2)}</b>\n` +
      `💡 <i>${adaptive.riskRationale}</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>HARD DISCIPLINE LOT OPTIONS:</b>\n` +
      `• 🌟 <b>Best Option</b> : <code>${bestOptionLot.toFixed(2)}L</code> ➜ Risk: <b>-$${bestRisk.toFixed(2)}</b> | Reward: <b>+$${bestReward.toFixed(2)}</b>\n` +
      `• 🛡️ <b>Micro / Min</b>  : <code>${microLot.toFixed(2)}L</code> ➜ Risk: <b>-$${microRisk.toFixed(2)}</b> | Reward: <b>+$${microReward.toFixed(2)}</b>\n` +
      (adaptive.regime === 'NEUTRAL'
        ? `• ⚖️ <b>Conservative</b>: <code>${conservativeLot.toFixed(2)}L</code> ➜ Risk: <b>-$${conservativeRisk.toFixed(2)}</b> | Reward: <b>+$${conservativeReward.toFixed(2)}</b>\n` +
          `• ⚡ <b>Saved Preset</b>: <code>${presetLot.toFixed(2)}L</code> ➜ Risk: <b>-$${presetRisk.toFixed(2)}</b> | Reward: <b>+$${presetReward.toFixed(2)}</b>\n`
        : '') +
      extraRiskLine +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Tap your preferred disciplined lot size below to execute on MT5:</i>`;

    const buttons: ITelegramInlineButton[][] = [];
    const priceTag = ltp > 0 ? ` @ $${ltp.toFixed(2)}` : '';
    const bestOptText = bestOptionLabel.includes(' •') ? bestOptionLabel.replace(' •', `${priceTag} •`) : `${bestOptionLabel}${priceTag}`;
    const microText = microLabel.includes(' •') ? microLabel.replace(' •', `${priceTag} •`) : `${microLabel}${priceTag}`;
    const consText = conservativeLabel.includes(' •') ? conservativeLabel.replace(' •', `${priceTag} •`) : `${conservativeLabel}${priceTag}`;
    const presetText = presetLabel.includes(' •') ? presetLabel.replace(' •', `${priceTag} •`) : `${presetLabel}${priceTag}`;
    const extraRiskText = extraRiskLabel ? (extraRiskLabel.includes(' •') ? extraRiskLabel.replace(' •', `${priceTag} •`) : `${extraRiskLabel}${priceTag}`) : '';

    if (adaptive.regime === 'HOUSE_MONEY') {
      buttons.push([
        {
          text: bestOptText,
          callback_data: `order:${cleanSym}:${side}:${bestOptionLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ]);
      const row2: ITelegramInlineButton[] = [];
      if (extraRiskLot && extraRiskText) {
        row2.push({
          text: extraRiskText,
          callback_data: `order:${cleanSym}:${side}:${extraRiskLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        });
      }
      row2.push({
        text: microText,
        callback_data: `order:${cleanSym}:${side}:${microLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
      });
      buttons.push(row2);
    } else if (adaptive.regime === 'DEFENSIVE') {
      buttons.push([
        {
          text: bestOptText,
          callback_data: `order:${cleanSym}:${side}:${bestOptionLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ]);
      buttons.push([
        {
          text: microText,
          callback_data: `order:${cleanSym}:${side}:${microLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ]);
    } else {
      buttons.push([
        {
          text: bestOptText,
          callback_data: `order:${cleanSym}:${side}:${bestOptionLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ]);
      buttons.push([
        {
          text: microText,
          callback_data: `order:${cleanSym}:${side}:${microLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
        {
          text: consText,
          callback_data: `order:${cleanSym}:${side}:${conservativeLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ]);
      const row3: ITelegramInlineButton[] = [
        {
          text: presetText,
          callback_data: `order:${cleanSym}:${side}:${presetLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        },
      ];
      if (extraRiskLot && extraRiskText) {
        row3.push({
          text: extraRiskText,
          callback_data: `order:${cleanSym}:${side}:${extraRiskLot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
        });
      }
      buttons.push(row3);

      if (dollarBudgets && dollarBudgets.length > 0) {
        buttons.push(
          dollarBudgets.map((b) => ({
            text: `${b.label} (${b.lot.toFixed(2)}L${priceTag})`,
            callback_data: `order:${cleanSym}:${side}:${b.lot.toFixed(2)}:${slPoints}:${tpPoints}:exec`,
          }))
        );
      }
    }

    buttons.push([
      {
        text: '🔄 Refresh Price',
        callback_data: `deck:order_prep:${cleanSym}:${side}`,
      },
      {
        text: '🔙 ❮ Cancel / Back to Cockpit',
        callback_data: 'deck:back',
      },
    ]);

    return { text, buttons };
  }

  /**
   * Handles opening the pre-order lot sizing and deep options report deck.
   */
  static async handleOrderPrepCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    symbol: string,
    side: 'BUY' | 'SELL' = 'BUY',
    messageId?: number
  ): Promise<void> {
    if (!botToken) return;
    const { text, buttons } = await this.buildOrderPrepPayload(user, symbol, side);
    if (messageId) {
      const edited = await this.editMessageText(botToken, chatId, messageId, text, buttons);
      if (edited) return;
    }
    await this.sendMessage(botToken, chatId, text, buttons);
  }

  /**
   * Generates the multi-asset live cockpit payload for Gold, ETH, BTC, US30, and NAS100 with cut-to-cut live pricing.
   */
  static async buildCockpitPayload(
    user: any,
    isPinned: boolean = false
  ): Promise<{ text: string; buttons: ITelegramInlineButton[][] }> {
    let goldLtp = 0;
    let goldSpread = '$0.35';
    let ethLtp = 0;
    let ethSpread = '$0.50';
    let btcLtp = 0;
    let btcSpread = '$5.00';
    let us30Ltp = 0;
    let nasLtp = 0;

    const gQuote = Mt5CommandService.getLiveQuote('XAUUSD');
    if (gQuote && gQuote.ltp > 0) {
      goldLtp = gQuote.ltp;
      if (gQuote.ask && gQuote.bid) goldSpread = `$${(gQuote.ask - gQuote.bid).toFixed(2)}`;
    }

    const eQuote = Mt5CommandService.getLiveQuote('ETHUSD');
    if (eQuote && eQuote.ltp > 0) {
      ethLtp = eQuote.ltp;
      if (eQuote.ask && eQuote.bid) ethSpread = `$${(eQuote.ask - eQuote.bid).toFixed(2)}`;
    }

    const bQuote = Mt5CommandService.getLiveQuote('BTCUSD');
    if (bQuote && bQuote.ltp > 0) {
      btcLtp = bQuote.ltp;
      if (bQuote.ask && bQuote.bid) btcSpread = `$${(bQuote.ask - bQuote.bid).toFixed(2)}`;
    }

    const uQuote = Mt5CommandService.getLiveQuote('US30');
    if (uQuote && uQuote.ltp > 0) {
      us30Ltp = uQuote.ltp;
    }

    const nQuote = Mt5CommandService.getLiveQuote('NAS100');
    if (nQuote && nQuote.ltp > 0) {
      nasLtp = nQuote.ltp;
    }

    // Query Global CFD / TradingView / Binance if not in MT5 quote memory
    const missingSymbols: string[] = [];
    if (goldLtp === 0) missingSymbols.push('XAUUSD');
    if (ethLtp === 0) missingSymbols.push('ETHUSD');
    if (btcLtp === 0) missingSymbols.push('BTCUSD');
    if (us30Ltp === 0) missingSymbols.push('US30');
    if (nasLtp === 0) missingSymbols.push('NAS100');

    if (missingSymbols.length > 0) {
      try {
        const qMap = await GlobalCfdCandleProvider.getLiveQuotes(missingSymbols);
        if (goldLtp === 0) {
          const gq = qMap.get('XAUUSD');
          if (gq && gq.ltp > 0) {
            goldLtp = gq.ltp;
            if ((gq as any).ask && (gq as any).bid) goldSpread = `$${((gq as any).ask - (gq as any).bid).toFixed(2)}`;
          }
        }
        if (ethLtp === 0) {
          const eq = qMap.get('ETHUSD');
          if (eq && eq.ltp > 0) {
            ethLtp = eq.ltp;
            if ((eq as any).ask && (eq as any).bid) ethSpread = `$${((eq as any).ask - (eq as any).bid).toFixed(2)}`;
          }
        }
        if (btcLtp === 0) {
          const bq = qMap.get('BTCUSD');
          if (bq && bq.ltp > 0) {
            btcLtp = bq.ltp;
            if ((bq as any).ask && (bq as any).bid) btcSpread = `$${((bq as any).ask - (bq as any).bid).toFixed(2)}`;
          }
        }
        if (us30Ltp === 0) {
          const uq = qMap.get('US30');
          if (uq && uq.ltp > 0) us30Ltp = uq.ltp;
        }
        if (nasLtp === 0) {
          const nq = qMap.get('NAS100');
          if (nq && nq.ltp > 0) nasLtp = nq.ltp;
        }
      } catch {}
    }

    if (goldLtp === 0) goldLtp = 3538.18;
    if (ethLtp === 0) ethLtp = 1671.85;
    if (btcLtp === 0) btcLtp = 91450.00;
    if (us30Ltp === 0) us30Ltp = 48350.00;
    if (nasLtp === 0) nasLtp = 25029.00;

    const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' }).lean();
    let totalFloat = 0;
    const posDetailLines: string[] = [];

    // Group open trades by clean symbol into stacks
    const stackMap = new Map<string, {
      cleanSymbol: string;
      displaySymbol: string;
      direction: 'LONG' | 'SHORT';
      totalQty: number;
      blendedEntry: number;
      currentLtp: number;
      totalFloat: number;
      layers: any[];
    }>();

    for (const t of openTrades) {
      const isGold = (t.symbol || '').includes('XAU') || t.symbol === 'GOLD';
      const isEth = (t.symbol || '').includes('ETH');
      const isBtc = (t.symbol || '').includes('BTC');
      const isUs30 = (t.symbol || '').includes('US30') || (t.symbol || '').includes('DOW');
      const isNas = (t.symbol || '').includes('NAS') || (t.symbol || '').includes('USTEC');

      let cleanSymbol = 'XAUUSD';
      let displaySymbol = 'Gold (XAUUSD)';
      let ltp = goldLtp;
      let mult = 100;
      if (isGold) { cleanSymbol = 'XAUUSD'; displaySymbol = 'Gold (XAUUSD)'; ltp = goldLtp; mult = 100; }
      else if (isEth) { cleanSymbol = 'ETHUSD'; displaySymbol = 'ETHUSD'; ltp = ethLtp; mult = 1; }
      else if (isBtc) { cleanSymbol = 'BTCUSD'; displaySymbol = 'BTCUSD'; ltp = btcLtp; mult = 1; }
      else if (isUs30) { cleanSymbol = 'US30'; displaySymbol = 'US30'; ltp = us30Ltp; mult = 1; }
      else if (isNas) { cleanSymbol = 'NAS100'; displaySymbol = 'NAS100'; ltp = nasLtp; mult = 1; }
      else {
        cleanSymbol = (t.symbol || 'XAUUSD').toUpperCase();
        displaySymbol = cleanSymbol;
        mult = (t as any).contractMultiplier || t.simpleExecution?.contractMultiplier || 1;
        const symQuote = Mt5CommandService.getLiveQuote(cleanSymbol);
        ltp = symQuote?.ltp || 0;
      }

      const entry = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? (t as any).entryPrice ?? 0);
      const qty = Number(t.simpleExecution?.quantity ?? t.calculated?.openQuantity ?? 1);
      const ticket = Mt5CommandService.extractTicket(t);

      const posQuote = ticket ? Mt5CommandService.getPositionQuote(ticket) : null;
      if (posQuote && posQuote.curPrice > 0) {
        ltp = posQuote.curPrice;
      }

      let pnl = 0;
      if (posQuote && typeof posQuote.profit === 'number' && posQuote.profit !== 0) {
        pnl = Number(posQuote.profit.toFixed(2));
      } else if (entry > 0 && ltp > 0) {
        pnl = t.direction === 'LONG' ? (ltp - entry) * qty * mult : (entry - ltp) * qty * mult;
      } else {
        pnl = (t.calculated as any)?.floatingNetPnL ?? (t as any).floatingNetPnL ?? t.calculated?.netPnL ?? 0;
      }
      pnl = Number(pnl.toFixed(2));
      totalFloat += pnl;

      const stackKey = cleanSymbol;
      if (!stackMap.has(stackKey)) {
        stackMap.set(stackKey, {
          cleanSymbol,
          displaySymbol,
          direction: t.direction as any,
          totalQty: 0,
          blendedEntry: 0,
          currentLtp: ltp,
          totalFloat: 0,
          layers: [],
        });
      }

      const s = stackMap.get(stackKey)!;
      s.totalQty = Number((s.totalQty + qty).toFixed(2));
      s.totalFloat = Number((s.totalFloat + pnl).toFixed(2));
      s.layers.push({
        trade: t,
        ticket,
        entry,
        qty,
        pnl,
        currentSl: t.risk?.currentStopLoss ?? t.risk?.initialStopLoss,
        tp: t.risk?.plannedTarget,
      });
    }

    // Compute blended average entry for each stack
    for (const s of stackMap.values()) {
      let weightedSum = 0;
      for (const l of s.layers) {
        weightedSum += l.entry * l.qty;
      }
      s.blendedEntry = s.totalQty > 0 ? Number((weightedSum / s.totalQty).toFixed(2)) : 0;

      const pnlSign = s.totalFloat >= 0 ? '+' : '';
      const pnlEmoji = s.totalFloat >= 0 ? '🟢' : '🔴';
      const layerCountStr = s.layers.length > 1 ? ` (${s.layers.length} Layers)` : '';

      const layerDetails = s.layers.map((l, idx) => {
        const tktStr = l.ticket ? ` #${l.ticket}` : ` L${idx + 1}`;
        const lPnlSign = l.pnl >= 0 ? '+' : '';
        const slStr = l.currentSl ? `$${Number(l.currentSl).toFixed(2)}` : 'None';
        const tpStr = l.tp && Number(l.tp) > 0 ? `$${Number(l.tp).toFixed(2)}` : 'Open (Runner)';
        return `  ├ Layer ${idx + 1}${tktStr}: <b>${l.qty.toFixed(2)}L @ $${l.entry.toFixed(2)}</b> (${lPnlSign}$${l.pnl.toFixed(2)})\n  │   └ SL: <code>${slStr}</code>  |  TP: <code>${tpStr}</code>`;
      }).join('\n');

      posDetailLines.push(
        `${pnlEmoji} <b>${s.displaySymbol} ${s.direction} · ${s.totalQty.toFixed(2)}L Total${layerCountStr}</b>\n` +
        `  ├ Blended Entry: <b>$${s.blendedEntry.toFixed(2)}</b>  |  LTP: <b>$${s.currentLtp.toFixed(2)}</b>\n` +
        `  ├ Net Floating: <b>${pnlSign}$${s.totalFloat.toFixed(2)}</b>\n` +
        layerDetails
      );
    }

    const hasOpenTrades = openTrades.length > 0;
    const floatSign = totalFloat >= 0 ? '+' : '-';
    const floatAbs = Math.abs(totalFloat).toFixed(2);
    const pnlBadge = totalFloat >= 0 ? `🟢 <b>+$${floatAbs}</b>` : `🔴 <b>-$${floatAbs}</b>`;

    let adaptive: IAdaptiveDayRiskState | null = null;
    let dayRegimeBadge = '';
    try {
      const account = await this.resolveMt5Account(user._id);
      if (account) {
        adaptive = await this.evaluateAdaptiveDayRiskState(user, account, 'XAUUSD', 35, 0.10, 100);
        dayRegimeBadge = `${adaptive.regimeBadge} ${adaptive.regimeLabel}`;
      }
    } catch {}

    const regimeTag = dayRegimeBadge ? `${dayRegimeBadge} ｜ ` : '';
    // Prices placed FIRST so Telegram pinned bar preview shows live Gold & ETH cut-to-cut without being cut off by session labels
    const line1 = hasOpenTrades
      ? `🟡 <b>Au: $${goldLtp.toFixed(2)}</b> ｜ 🔷 <b>ETH: $${ethLtp.toFixed(2)}</b> ｜ ${pnlBadge} ｜ ${regimeTag}<b>LIVE</b>`
      : `🟡 <b>Au: $${goldLtp.toFixed(2)}</b> ｜ 🔷 <b>ETH: $${ethLtp.toFixed(2)}</b> ｜ ${regimeTag}<b>COCKPIT</b>`;

    const nowUtc = new Date().toISOString().replace('T', ' ').substring(11, 19);

    const posSection = hasOpenTrades
      ? `<b>Active Positions (${openTrades.length}):</b>\n` + posDetailLines.join('\n\n') + '\n'
      : `<i>No open positions. Capital is 100% safe.</i>\n`;

    let dayPerformanceSection = '';
    if (adaptive) {
      const pnlSign = adaptive.todayTotalPnL >= 0 ? '+' : '';
      const bonusStr = adaptive.bonusTradesEarned > 0 ? ` (+${adaptive.bonusTradesEarned} bonus)` : '';
      const rStr = adaptive.accumulatedR !== undefined ? ` • ${adaptive.accumulatedR >= 0 ? '+' : ''}${adaptive.accumulatedR.toFixed(2)}R` : '';
      const capGrowthStr = adaptive.capitalGrowthPct !== undefined ? ` • Growth: ${adaptive.capitalGrowthPct >= 0 ? '+' : ''}${adaptive.capitalGrowthPct.toFixed(2)}%` : '';
      dayPerformanceSection =
        `📈 <b>DAY PERFORMANCE & REGIME:</b>\n` +
        `• <b>State   :</b> ${adaptive.regimeBadge} <b>${adaptive.regimeLabel}</b>${bonusStr}\n` +
        `• <b>Net P&L :</b> <b>${pnlSign}$${adaptive.todayTotalPnL.toFixed(2)}</b> (Realized: $${adaptive.todayRealizedPnL.toFixed(2)}${rStr})\n` +
        `• <b>Trades  :</b> <b>${adaptive.todayTradesCount}/${adaptive.effectiveMaxDailyTrades}</b> Taken${capGrowthStr} ｜ <b>Buffer:</b> <b>$${adaptive.remainingDailyLossBuffer.toFixed(2)}</b>\n`;
    }

    const actionHint = hasOpenTrades
      ? `<i>⚡ Dynamic Position Controls:</i>`
      : `<i>1-Tap Preset Execution & Lot Sizing:</i>`;

    const livePricingBlock =
      `📊 <b>LIVE MARKET TELEMETRY:</b>\n` +
      `<pre>\n` +
      `🟡 XAUUSD : $${goldLtp.toFixed(2)}  (Spread ${goldSpread})\n` +
      `🔷 ETHUSD : $${ethLtp.toFixed(2)}  (Spread ${ethSpread})\n` +
      `₿ BTCUSD : $${btcLtp.toFixed(2)}\n` +
      (hasOpenTrades ? `Floating  : ${floatSign}$${floatAbs}\n` : '') +
      `</pre>\n`;

    const text =
      `${line1}\n` +
      `⚡ <i>Live Cut-to-Cut</i> · <code>${nowUtc} UTC</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      livePricingBlock +
      posSection +
      (dayPerformanceSection ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${dayPerformanceSection}` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      actionHint;

    const presets = user?.liveWatcherSettings?.telegramForexPresets;
    const goldLot = presets?.goldDefaultLot ?? DEFAULT_FOREX_PRESETS.gold.defaultLot;
    const goldSl = presets?.goldSlPoints ?? DEFAULT_FOREX_PRESETS.gold.defaultSlPoints;
    const goldRr = presets?.goldRrRatio ?? DEFAULT_FOREX_PRESETS.gold.defaultRr;
    const goldTp = Number((goldSl * goldRr).toFixed(2));

    const ethLot = presets?.ethDefaultLot ?? DEFAULT_FOREX_PRESETS.eth.defaultLot;
    const ethSl = presets?.ethSlPrice ?? DEFAULT_FOREX_PRESETS.eth.defaultSlPrice;
    const ethRr = presets?.ethRrRatio ?? DEFAULT_FOREX_PRESETS.eth.defaultRr;
    const ethTp = Number((ethSl * ethRr).toFixed(2));

    const btcLot = presets?.btcDefaultLot ?? DEFAULT_FOREX_PRESETS.btc?.defaultLot ?? 0.05;
    const btcSl = presets?.btcSlPoints ?? DEFAULT_FOREX_PRESETS.btc?.defaultSlPoints ?? 300;
    const btcRr = presets?.btcRrRatio ?? DEFAULT_FOREX_PRESETS.btc?.defaultRr ?? 2.5;
    const btcTp = Number((btcSl * btcRr).toFixed(2));

    const us30Lot = presets?.us30DefaultLot ?? DEFAULT_FOREX_PRESETS.us30?.defaultLot ?? 0.10;
    const nasLot = presets?.nas100DefaultLot ?? DEFAULT_FOREX_PRESETS.nas100?.defaultLot ?? 0.10;

    const goldLotStr = Number(goldLot).toFixed(2);
    const ethLotStr = Number(ethLot).toFixed(2);
    const btcLotStr = Number(btcLot).toFixed(2);
    const us30LotStr = Number(us30Lot).toFixed(2);
    const nasLotStr = Number(nasLot).toFixed(2);

    const autoExecArmed = Boolean(user?.liveWatcherSettings?.defaultAutoExecute);
    const autoExecBtn = {
      text: autoExecArmed ? '⚡ MT5 Auto-Exec: ON' : '✋ MT5 Auto-Exec: OFF',
      callback_data: autoExecArmed ? 'cmd_autoexec_off' : 'cmd_autoexec_on',
    };

    const buttons: ITelegramInlineButton[][] = [];

    const userIdStr = user?._id ? user._id.toString() : '';
    const activeSub = TelegramAlertService.activeCockpitSubmenus.get(userIdStr);
    const isSubActive = Boolean(activeSub && activeSub.expiresAt > Date.now());
    if (activeSub && activeSub.expiresAt <= Date.now()) {
      TelegramAlertService.activeCockpitSubmenus.delete(userIdStr);
    }

    // Pre-order lot options & sizing deck (renders for flat state; if positions are open, positions take precedence!)
    if (isSubActive && activeSub && activeSub.menu === 'order_prep' && !hasOpenTrades) {
      const subSym = activeSub.symbol || 'XAUUSD';
      const subSide: 'BUY' | 'SELL' = (activeSub.side as any) || 'BUY';
      return await this.buildOrderPrepPayload(user, subSym, subSide);
    }

    // Other Global Assets submenu deck (BTC, US30, NAS100)
    if (isSubActive && activeSub && activeSub.menu === 'other_assets') {
      const otherButtons: ITelegramInlineButton[][] = [
        [
          { text: `🟢 BUY BTC (${btcLotStr}) • $${btcLtp.toFixed(0)}`, callback_data: 'deck:order_prep:BTCUSD:BUY' },
          { text: `🔴 SELL BTC (${btcLotStr}) • $${btcLtp.toFixed(0)}`, callback_data: 'deck:order_prep:BTCUSD:SELL' },
        ],
        [
          { text: `🟢 BUY US30 (${us30LotStr}) • $${us30Ltp.toFixed(0)}`, callback_data: 'deck:order_prep:US30:BUY' },
          { text: `🔴 SELL US30 (${us30LotStr}) • $${us30Ltp.toFixed(0)}`, callback_data: 'deck:order_prep:US30:SELL' },
        ],
        [
          { text: `🟢 BUY NAS100 (${nasLotStr}) • $${nasLtp.toFixed(0)}`, callback_data: 'deck:order_prep:NAS100:BUY' },
          { text: `🔴 SELL NAS100 (${nasLotStr}) • $${nasLtp.toFixed(0)}`, callback_data: 'deck:order_prep:NAS100:SELL' },
        ],
        [
          { text: '🔙 ❮ Back to Cockpit', callback_data: 'deck:back' },
        ],
      ];
      const otherText =
        `${line1}\n` +
        `⚡ <i>Live Cut-to-Cut · <code>${nowUtc} UTC</code></i>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 <b>GLOBAL ASSETS & DEEP OPTIONS:</b>\n` +
        `<pre>\n` +
        `₿ BTCUSD : $${btcLtp.toFixed(2)}  (Spread ${btcSpread})\n` +
        `🇺🇸 US30   : $${us30Ltp.toFixed(2)}\n` +
        `💻 NAS100 : $${nasLtp.toFixed(2)}\n` +
        `</pre>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Tap any asset above to open disciplined lot sizing & execution:</i>`;
      return { text: otherText, buttons: otherButtons };
    }

    if (hasOpenTrades) {
      if (isSubActive && activeSub) {
        // RENDER ACTIVE SUBMENU DECK
        const subSym = activeSub.symbol || 'XAUUSD';
        const targetStack = stackMap.get(subSym) || stackMap.values().next().value;
        const tot = targetStack ? targetStack.totalQty : 0.04;
        const symShort = subSym.includes('XAU') ? 'Gold' : (subSym.includes('ETH') ? 'ETH' : subSym);

        if (activeSub.menu === 'harvest') {
          const q25 = Math.max(0.01, Number((tot * 0.25).toFixed(2)));
          const q33 = Math.max(0.01, Number((tot * 0.33).toFixed(2)));
          const q50 = Math.max(0.01, Number((tot * 0.50).toFixed(2)));
          const q75 = Math.max(0.01, Number((tot * 0.75).toFixed(2)));

          buttons.push([
            { text: `🎯 25% (${q25}L)`, callback_data: `harvest_pct:${subSym}:25` },
            { text: `🎯 33% (${q33}L)`, callback_data: `harvest_pct:${subSym}:33` },
          ]);
          buttons.push([
            { text: `🎯 50% (${q50}L)`, callback_data: `harvest_pct:${subSym}:50` },
            { text: `🎯 75% (${q75}L)`, callback_data: `harvest_pct:${subSym}:75` },
          ]);
          buttons.push([
            { text: '🎰 Free-Ride Mode', callback_data: `harvest_freeride:${subSym}` },
            { text: '🏃 Moonshot (0.01L)', callback_data: `harvest_moonshot:${subSym}` },
          ]);
          buttons.push([
            { text: '🏦 Bank $25', callback_data: `harvest_dollar:${subSym}:25` },
            { text: '🏦 Bank $50', callback_data: `harvest_dollar:${subSym}:50` },
            { text: '🏦 Bank $100', callback_data: `harvest_dollar:${subSym}:100` },
          ]);
          buttons.push([
            { text: '🔙 ❮ Back to Cockpit', callback_data: 'deck:back' },
          ]);
        } else if (activeSub.menu === 'pyramid') {
          const halfLot = Math.max(0.01, Number((tot / 2).toFixed(2)));
          const defLot = subSym.includes('XAU') ? Number(goldLot) : 0.05;

          buttons.push([
            { text: `➕ Add Half-Size (${halfLot}L)`, callback_data: `pyramid_add:${subSym}:${halfLot}` },
            { text: `➕ Add Preset (${defLot}L)`, callback_data: `pyramid_add:${subSym}:${defLot}` },
          ]);
          buttons.push([
            { text: '🛡️ Zero-Risk Stack Lock & Add', callback_data: `pyramid_zerorisk:${subSym}` },
          ]);
          buttons.push([
            { text: '⏳ Breakout Scale (+10 pts)', callback_data: `pyramid_breakout:${subSym}` },
            { text: '📥 Pullback Limit (-15 pts)', callback_data: `pyramid_pullback:${subSym}` },
          ]);
          buttons.push([
            { text: '🔙 ❮ Back to Cockpit', callback_data: 'deck:back' },
          ]);
        } else if (activeSub.menu === 'defense') {
          buttons.push([
            { text: '🛡️ True BE (+Spread Cover)', callback_data: `defense_truebe:${subSym}` },
            { text: '📈 Trail +1.0R', callback_data: `defense_trail_r:${subSym}:1.0` },
          ]);
          buttons.push([
            { text: '🔒 Lock +$25 Profit', callback_data: `defense_lock_dollar:${subSym}:25` },
            { text: '🔒 Lock +$50 Profit', callback_data: `defense_lock_dollar:${subSym}:50` },
          ]);
          buttons.push([
            { text: '🕯️ Trail Prev Candle Low', callback_data: `defense_candle:${subSym}` },
            { text: '🚫 Runner Mode (No TP)', callback_data: `defense_runner:${subSym}` },
          ]);
          buttons.push([
            { text: '💤 Sleep Mode (Overnight Protection)', callback_data: `defense_sleep:${subSym}` },
          ]);
          buttons.push([
            { text: '🔙 ❮ Back to Cockpit', callback_data: 'deck:back' },
          ]);
        } else if (activeSub.menu === 'layers') {
          if (targetStack) {
            for (const l of targetStack.layers) {
              const tkt = l.ticket;
              const halfL = Math.max(0.01, Number((l.qty / 2).toFixed(2)));
              if (tkt) {
                buttons.push([
                  { text: `🎯 Book 50% #${tkt} (${halfL}L)`, callback_data: `pos_half:${tkt}` },
                  { text: `🛡️ BE #${tkt}`, callback_data: `pos_be:${tkt}` },
                  { text: `🚨 Close #${tkt}`, callback_data: `pos_close:${tkt}` },
                ]);
              }
            }
            if (targetStack.layers.length > 1) {
              buttons.push([
                { text: `🚨 Close Top Layer Only`, callback_data: `act_close_top:${subSym}` },
              ]);
            }
          }
          buttons.push([
            { text: '🔙 ❮ Back to Cockpit', callback_data: 'deck:back' },
          ]);
        }
      } else {
        // MAIN COCKPIT VIEW
        for (const t of openTrades) {
          const isGold = (t.symbol || '').includes('XAU') || t.symbol === 'GOLD';
          const isEth = (t.symbol || '').includes('ETH');
          const symLabel = isGold ? 'Gold' : (isEth ? 'ETH' : (t.symbol || 'Pos'));
          const qty = Number(t.simpleExecution?.quantity ?? t.calculated?.openQuantity ?? 1);
          const qtyStr = qty.toFixed(2);
          const ticket = Mt5CommandService.extractTicket(t);

          const closeCb = ticket ? `pos_close:${ticket}` : (isGold ? 'cmd_close_gold' : 'cmd_close_eth');
          const beCb = ticket ? `pos_be:${ticket}` : (isGold ? 'cmd_be_gold' : 'cmd_be_eth');
          const halfCb = ticket ? `pos_half:${ticket}` : (isGold ? 'cmd_half_gold' : 'cmd_half_eth');
          const trailCb = ticket ? `pos_trail:${ticket}` : (isGold ? 'cmd_trail_gold' : 'cmd_trail_eth');

          buttons.push([
            { text: `🚨 Close ${symLabel} (${qtyStr}L)`, callback_data: closeCb },
            { text: `🛡️ Lock BE (${symLabel})`, callback_data: beCb },
          ]);

          const halfQty = Math.max(0.01, Number((qty / 2).toFixed(2)));
          buttons.push([
            { text: `🎯 Book 50% (${halfQty}L)`, callback_data: halfCb },
            { text: `📈 Trail +1R (${symLabel})`, callback_data: trailCb },
          ]);
        }

        // Submenu Entry Deck for Each Stack
        for (const [symKey, s] of stackMap.entries()) {
          const symLabel = s.cleanSymbol.includes('XAU') ? 'Gold' : (s.cleanSymbol.includes('ETH') ? 'ETH' : s.cleanSymbol);
          buttons.push([
            { text: `🎯 Harvest ${symLabel}...`, callback_data: `deck:harvest:${s.cleanSymbol}` },
            { text: `➕ Pyramid ${symLabel}...`, callback_data: `deck:pyramid:${s.cleanSymbol}` },
          ]);
          buttons.push([
            { text: `🛡️ Defense & Trail...`, callback_data: `deck:defense:${s.cleanSymbol}` },
            { text: `📋 Layers (${s.layers.length})...`, callback_data: `deck:layers:${s.cleanSymbol}` },
          ]);
          buttons.push([
            { text: `🚨 Close Top Layer`, callback_data: `act_close_top:${s.cleanSymbol}` },
            { text: `🛑 Flatten ${symLabel} (${s.totalQty.toFixed(2)}L)`, callback_data: `act_close_stack:${s.cleanSymbol}` },
          ]);
        }

        buttons.push([
          { text: '🔄 Refresh PnL', callback_data: 'cmd_refresh_cockpit' },
          autoExecBtn,
          isPinned
            ? { text: '🛑 Unpin', callback_data: 'cmd_unpin_cockpit' }
            : { text: '📌 Pin', callback_data: 'cmd_pin_cockpit' },
        ]);
      }
    } else {
      let goldBtnLot = goldLotStr;
      let ethBtnLot = ethLotStr;

      if (adaptive?.regime === 'DEFENSIVE') {
        goldBtnLot = (adaptive.tiers.bestOptionLot || (goldLot * 0.5)).toFixed(2);
        ethBtnLot = (adaptive.tiers.bestOptionLot || (ethLot * 0.5)).toFixed(2);
      }

      // 1. Gold Execution (Crisp, self-explanatory, never truncated with ...)
      buttons.push([
        { text: `🟢 BUY Gold (${goldBtnLot}) • $${goldLtp.toFixed(2)}`, callback_data: 'deck:order_prep:XAUUSD:BUY' },
        { text: `🔴 SELL Gold (${goldBtnLot}) • $${goldLtp.toFixed(2)}`, callback_data: 'deck:order_prep:XAUUSD:SELL' },
      ]);

      // 2. ETH Execution (Crisp, self-explanatory, never truncated with ...)
      buttons.push([
        { text: `🟢 BUY ETH (${ethBtnLot}) • $${ethLtp.toFixed(2)}`, callback_data: 'deck:order_prep:ETHUSD:BUY' },
        { text: `🔴 SELL ETH (${ethBtnLot}) • $${ethLtp.toFixed(2)}`, callback_data: 'deck:order_prep:ETHUSD:SELL' },
      ]);

      // 3. Asset Drilldown & Deep Options
      buttons.push([
        { text: '🌟 Gold Lot Options', callback_data: 'deck:order_prep:XAUUSD:BUY' },
        { text: '🌟 ETH Lot Options', callback_data: 'deck:order_prep:ETHUSD:BUY' },
      ]);

      // 4. Other Assets & Primary Controls
      buttons.push([
        { text: '🌐 Other Assets...', callback_data: 'deck:other_assets' },
        { text: '🔄 Refresh PnL', callback_data: 'cmd_refresh_cockpit' },
        isPinned
          ? { text: '🛑 Unpin', callback_data: 'cmd_unpin_cockpit' }
          : { text: '📌 Pin', callback_data: 'cmd_pin_cockpit' },
      ]);

      // 5. Execution Mode
      buttons.push([
        autoExecBtn,
      ]);
    }

    return { text, buttons };
  }

  /**
   * Generates the multi-asset live cockpit card for Gold & ETH.
   */
  static async handleCockpitCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<any> {
    if (!botToken) return null;
    const isPinned = Boolean(user?.liveWatcherSettings?.telegramPinnedCockpitMessageId);
    const { text, buttons } = await this.buildCockpitPayload(user, isPinned);
    return await this.sendMessage(botToken, chatId, text, buttons);
  }

  /**
   * Pins the live cockpit card to the top of the Telegram chat and begins continuous cut-to-cut auto-refresh.
   */
  static async handlePinCockpitCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<void> {
    if (!botToken) return;

    // Clear all previous pinned cockpit messages first to prevent pin stacking
    await this.unpinAllChatMessages(botToken, chatId);

    const { text, buttons } = await this.buildCockpitPayload(user, true);
    const sentMsg = await this.sendMessage(botToken, chatId, text, buttons, true);
    if (sentMsg && sentMsg.message_id) {
      const pinned = await this.pinChatMessage(botToken, chatId, sentMsg.message_id, true);
      if (pinned) {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'liveWatcherSettings.telegramPinnedCockpitMessageId': sentMsg.message_id,
            'liveWatcherSettings.telegramPinnedCockpitChatId': chatId,
          },
        });
        if (user?.liveWatcherSettings) {
          user.liveWatcherSettings.telegramPinnedCockpitMessageId = sentMsg.message_id;
          user.liveWatcherSettings.telegramPinnedCockpitChatId = chatId;
        }
        await this.sendMessage(
          botToken,
          chatId,
          `📌 <b>Live Cockpit Pinned!</b>\n\nLive Gold & ETH telemetry is anchored to the top of this chat and auto-refreshing cut-to-cut.\nType <b>/unpin</b> or tap 🛑 Unpin anytime to stop.`
        );
      }
    }
  }

  /**
   * Unpins the live cockpit from the top of the Telegram chat and stops continuous auto-refresh.
   */
  static async handleUnpinCockpitCommand(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<void> {
    if (!botToken) return;
    const pinnedMessageId = user?.liveWatcherSettings?.telegramPinnedCockpitMessageId;
    if (pinnedMessageId) {
      this.lastPinnedPayloadByMessageId.delete(pinnedMessageId);
      await this.unpinChatMessage(botToken, chatId, pinnedMessageId);
    } else {
      await this.unpinChatMessage(botToken, chatId);
    }
    await this.unpinAllChatMessages(botToken, chatId);

    await User.findByIdAndUpdate(user._id, {
      $set: {
        'liveWatcherSettings.telegramPinnedCockpitMessageId': null,
        'liveWatcherSettings.telegramPinnedCockpitChatId': null,
      },
    });

    if (user?.liveWatcherSettings) {
      user.liveWatcherSettings.telegramPinnedCockpitMessageId = null;
      user.liveWatcherSettings.telegramPinnedCockpitChatId = null;
    }

    await this.sendMessage(
      botToken,
      chatId,
      `🛑 <b>Live Cockpit Unpinned</b>\n\nAuto-refresh ticker stopped. Type <b>/pin</b> anytime to re-anchor.`
    );
  }

  /**
   * Updates an existing pinned cockpit message in-place with latest cut-to-cut market prices.
   */
  static async updatePinnedCockpitMessage(user: any, force: boolean = false): Promise<boolean> {
    const rawToken = user?.liveWatcherSettings?.telegramBotToken;
    const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
    const chatId = user?.liveWatcherSettings?.telegramPinnedCockpitChatId || user?.liveWatcherSettings?.telegramChatId;
    const messageId = user?.liveWatcherSettings?.telegramPinnedCockpitMessageId;

    if (!botToken || !chatId || !messageId) {
      return false;
    }

    if (!force && Date.now() < this.rateLimitCooldownUntil) {
      return false;
    }

    try {
      const { text, buttons } = await this.buildCockpitPayload(user, true);

      // Throttling for automated background ticker
      const userIdStr = user?._id ? user._id.toString() : '';
      const activeSub = TelegramAlertService.activeCockpitSubmenus.get(userIdStr);
      const isSubmenuActive = Boolean(activeSub && activeSub.expiresAt > Date.now());

      const buttonsJson = JSON.stringify(buttons || []);
      const cached = this.lastPinnedPayloadByMessageId.get(messageId);
      const now = Date.now();
      if (!force && !isSubmenuActive) {
        if (cached && (now - cached.lastSentAt < 15000)) {
          const stripTs = (t: string) => t.replace(/⚡ <i>Live Cut-to-Cut<\/i> · <code>.*?<\/code>\n/, '');
          if (stripTs(cached.text) === stripTs(text) && cached.buttonsJson === buttonsJson) {
            return true;
          }
        }

        // Minimum 3.5s spacing between automated ticker edits
        if (cached && (now - cached.lastSentAt < 3500)) {
          return true;
        }
      }

      const res = await this.editMessageText(botToken, chatId, messageId, text, buttons);
      if (res !== null) {
        this.lastPinnedPayloadByMessageId.set(messageId, { text, buttonsJson, lastSentAt: now });
      }
      await this.evaluateRMilestones(user);
      return res !== null;
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('message to edit not found') ||
        msg.includes('message can\'t be edited') ||
        msg.includes('chat not found') ||
        msg.includes('bot was blocked')
      ) {
        await User.findByIdAndUpdate(user._id, {
          $unset: {
            'liveWatcherSettings.telegramPinnedCockpitMessageId': '',
            'liveWatcherSettings.telegramPinnedCockpitChatId': '',
          },
        });
      }
      return false;
    }
  }

  /**
   * Evaluates all open positions and stacks against R-Multiple profit milestones (+1.0R, +1.5R, +2.0R, +3.0R, +5.0R).
   * When crossed, dispatches audio chimes and tactical buttons to lock BE, trail R, harvest, or pyramid.
   */
  static async evaluateRMilestones(user: any): Promise<void> {
    const rawToken = user?.liveWatcherSettings?.telegramBotToken;
    const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
    const chatId = user?.liveWatcherSettings?.telegramPinnedCockpitChatId || user?.liveWatcherSettings?.telegramChatId;
    if (!botToken || !chatId) return;

    const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' });
    if (!openTrades || openTrades.length === 0) return;

    const R_TIERS = [1.0, 1.5, 2.0, 3.0, 5.0];

    for (const t of openTrades) {
      const isGold = (t.symbol || '').includes('XAU') || t.symbol === 'GOLD';
      const isEth = (t.symbol || '').includes('ETH');
      const isBtc = (t.symbol || '').includes('BTC');
      const isUs30 = (t.symbol || '').includes('US30') || (t.symbol || '').includes('DOW');
      const isNas = (t.symbol || '').includes('NAS') || (t.symbol || '').includes('USTEC');

      let cleanSymbol = 'XAUUSD';
      let mult = 100;
      if (isGold) { cleanSymbol = 'XAUUSD'; mult = 100; }
      else if (isEth) { cleanSymbol = 'ETHUSD'; mult = 1; }
      else if (isBtc) { cleanSymbol = 'BTCUSD'; mult = 1; }
      else if (isUs30) { cleanSymbol = 'US30'; mult = 1; }
      else if (isNas) { cleanSymbol = 'NAS100'; mult = 1; }

      const quote = Mt5CommandService.getLiveQuote(cleanSymbol);
      const entry = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? (t as any).entryPrice ?? 0);
      const ltp = quote?.ltp || entry;
      if (entry <= 0 || ltp <= 0) continue;

      const initialSl = Number(t.risk?.initialStopLoss ?? t.risk?.currentStopLoss ?? 0);
      const defaultRiskPoints = isGold ? 4.0 : (isEth ? 25.0 : 10.0);
      const riskDist = (initialSl > 0 && entry > 0) ? Math.abs(entry - initialSl) : defaultRiskPoints;
      if (riskDist <= 0) continue;

      const isLong = (t.direction as string) === 'LONG' || (t.direction as string) === 'BUY';
      const pts = isLong ? (ltp - entry) : (entry - ltp);
      const currentR = Number((pts / riskDist).toFixed(2));
      if (currentR < 1.0) continue;

      const qty = Number(t.calculated?.openQuantity && t.calculated.openQuantity > 0 ? t.calculated.openQuantity : (t.simpleExecution?.quantity || 1));
      const dollarPnl = Number((pts * qty * mult).toFixed(2));
      const dollarSign = dollarPnl >= 0 ? '+' : '';

      for (const tier of R_TIERS) {
        if (currentR < tier) break;
        const tag = `R_MILESTONE_${tier.toFixed(1)}`;
        if (t.tags?.includes(tag)) continue;

        // Mark tier as claimed for strict hysteresis
        t.tags = [...(t.tags || []), tag];
        await t.save().catch(() => {});

        // Build tactical buttons for this milestone
        const halfQty = Math.max(0.01, Number((qty / 2).toFixed(2)));
        const buttons: ITelegramInlineButton[][] = [];

        if (tier === 1.0) {
          buttons.push([
            { text: '🛡️ Lock True BE (+Spread)', callback_data: `defense_truebe:${cleanSymbol}` },
            { text: `➕ Add Half-Size (${halfQty}L)`, callback_data: `pyramid_add:${cleanSymbol}:${halfQty}` },
          ]);
          buttons.push([
            { text: `🎯 Book 50% (${halfQty}L)`, callback_data: `harvest_pct:${cleanSymbol}:50` },
            { text: '🏃 Let It Ride (No TP)', callback_data: `defense_runner:${cleanSymbol}` },
          ]);
        } else if (tier === 1.5) {
          buttons.push([
            { text: '🔒 Lock +0.5R Profit', callback_data: `defense_trail_r:${cleanSymbol}:0.5` },
            { text: `➕ Add Preset Pyramid`, callback_data: `pyramid_zerorisk:${cleanSymbol}` },
          ]);
          buttons.push([
            { text: `🎯 Book 33%`, callback_data: `harvest_pct:${cleanSymbol}:33` },
            { text: '🔙 Cockpit', callback_data: 'cmd_cockpit' },
          ]);
        } else if (tier === 2.0) {
          buttons.push([
            { text: `🎯 Book 50% Profit`, callback_data: `harvest_pct:${cleanSymbol}:50` },
            { text: '📈 Trail SL to +1.0R', callback_data: `defense_trail_r:${cleanSymbol}:1.0` },
          ]);
          buttons.push([
            { text: '🎰 Free-Ride Mode', callback_data: `harvest_freeride:${cleanSymbol}` },
            { text: '🔙 Cockpit', callback_data: 'cmd_cockpit' },
          ]);
        } else if (tier === 3.0) {
          buttons.push([
            { text: `🎯 Book 75% Profit`, callback_data: `harvest_pct:${cleanSymbol}:75` },
            { text: '📈 Trail SL to +2.0R', callback_data: `defense_trail_r:${cleanSymbol}:2.0` },
          ]);
          buttons.push([
            { text: '🏃 Moonshot (0.01L)', callback_data: `harvest_moonshot:${cleanSymbol}` },
            { text: '🔙 Cockpit', callback_data: 'cmd_cockpit' },
          ]);
        } else {
          // 5.0R+
          buttons.push([
            { text: '🏃 Moonshot (0.01L Runner)', callback_data: `harvest_moonshot:${cleanSymbol}` },
            { text: `🛑 Flatten All (${qty}L)`, callback_data: `act_close_stack:${cleanSymbol}` },
          ]);
        }

        const audioBuffer = AudioChimeService.getMilestoneChime(tier);
        const title = `Milestone +${tier.toFixed(1)}R Hit (${cleanSymbol})`;
        const caption =
          `🎯 <b>R-MULTIPLE MILESTONE HIT: +${tier.toFixed(1)}R (${dollarSign}$${dollarPnl.toFixed(2)})</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `<pre>\n` +
          `Symbol      : ${cleanSymbol} (${t.direction})\n` +
          `Volume      : ${qty.toFixed(2)} Lots\n` +
          `Entry       : $${entry.toFixed(2)}\n` +
          `LTP         : $${ltp.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(2)} pts)\n` +
          `Initial Risk: $${riskDist.toFixed(2)} (${dollarSign}$${(riskDist * qty * mult).toFixed(2)})\n` +
          `Milestone   : +${tier.toFixed(1)}R Multiplier Achieved\n` +
          `Status      : Milestone Audio Dispatched\n` +
          `</pre>\n` +
          `<i>Tap a tactical button below to secure profit or scale into momentum.</i>`;

        await this.sendAudio(botToken, chatId, audioBuffer, title, caption, buttons);
      }
    }
  }

  /**
   * Automatically pins (or updates in-place) the live cockpit whenever a position is opened.
   */
  static async autoPinOrUpdateCockpit(user: any): Promise<boolean> {
    TelegramAlertService.clearSubmenu(user._id);
    const rawToken = user?.liveWatcherSettings?.telegramBotToken;
    const botToken = safeDecryptSecret(rawToken) || (rawToken?.startsWith('enc:') ? null : rawToken);
    const chatId = user?.liveWatcherSettings?.telegramPinnedCockpitChatId || user?.liveWatcherSettings?.telegramChatId;
    const existingMsgId = user?.liveWatcherSettings?.telegramPinnedCockpitMessageId;

    if (!botToken || !chatId) return false;

    if (existingMsgId) {
      // Refresh the existing pinned cockpit message in-place
      const updated = await this.updatePinnedCockpitMessage(user);
      if (updated) return true;
    }

    // If not pinned yet or edit failed, send a new cockpit card and pin it
    try {
      await this.unpinAllChatMessages(botToken, chatId);
      const { text, buttons } = await this.buildCockpitPayload(user, true);
      const sent = await this.sendMessage(botToken, chatId, text, buttons, true);
      if (sent && sent.message_id) {
        await this.pinChatMessage(botToken, chatId, sent.message_id, true);
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'liveWatcherSettings.telegramPinnedCockpitMessageId': sent.message_id,
            'liveWatcherSettings.telegramPinnedCockpitChatId': chatId,
          },
        });
        if (user.liveWatcherSettings) {
          user.liveWatcherSettings.telegramPinnedCockpitMessageId = sent.message_id;
          user.liveWatcherSettings.telegramPinnedCockpitChatId = chatId;
        }
        return true;
      }
    } catch (err: any) {
      console.warn('[TelegramAlertService] autoPinOrUpdateCockpit error:', err.message);
    }
    return false;
  }

  /**
   * Closes all active open positions for a specific symbol on MT5.
   */
  static async handleCloseSymbolPositions(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number,
    symbol: string
  ): Promise<void> {
    if (!botToken) return;
    const openTrades = await Trade.find({
      userId: user._id,
      status: 'OPEN',
      symbol: new RegExp(symbol, 'i'),
    });

    if (openTrades.length === 0) {
      await this.sendMessage(botToken, chatId, `ℹ️ No active open positions found for <b>${symbol}</b>.`);
      return;
    }

    let closedCount = 0;
    for (const trade of openTrades) {
      const ticket = Mt5CommandService.extractTicket(trade);
      if (ticket) {
        await Mt5CommandService.queueClosePosition({
          userId: user._id,
          accountId: trade.accountId,
          tradeId: trade._id,
          ticket,
          volume: trade.calculated?.openQuantity ?? trade.simpleExecution?.quantity ?? 1,
        });
        closedCount++;
      }
    }

    await this.sendMessage(
      botToken,
      chatId,
      `🚨 <b>Close Command Dispatched for ${symbol}</b>\n\nQueued exit for <b>${closedCount}</b> active MT5 position(s).`
    );
  }

  /**
   * Moves Stop Loss to exact entry price for all open positions.
   */
  static async handleLockBeAll(
    user: any,
    botToken: string | null | undefined,
    chatId: string | number
  ): Promise<void> {
    if (!botToken) return;
    const openTrades = await Trade.find({
      userId: user._id,
      status: 'OPEN',
    });

    if (openTrades.length === 0) {
      await this.sendMessage(botToken, chatId, `ℹ️ No active open positions to lock breakeven.`);
      return;
    }

    let lockedCount = 0;
    for (const trade of openTrades) {
      const ticket = Mt5CommandService.extractTicket(trade);
      const entryPrice = Number(trade.simpleExecution?.entryPrice ?? trade.calculated?.averageEntryPrice ?? (trade as any).entryPrice ?? 0);
      if (ticket && entryPrice > 0) {
        await Mt5CommandService.queueModifySl({
          userId: user._id,
          accountId: trade.accountId,
          tradeId: trade._id,
          ticket,
          stopLoss: entryPrice,
        });
        trade.risk = {
          ...(trade.risk || {}),
          initialStopLoss: trade.risk?.initialStopLoss || entryPrice,
          currentStopLoss: entryPrice,
        };
        await trade.save();
        lockedCount++;
      }
    }

    await this.sendMessage(
      botToken,
      chatId,
      `🛡️ <b>Breakeven Locked</b>\n\nDispatched Stop Loss to entry price for <b>${lockedCount}</b> active MT5 position(s).`
    );
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
          `  ⏰ <b>${ev.countdownStr}</b> • <i>${ev.istTimeStr}</i>\n`;
        if (ev.actual) {
          const biasTag = ev.actualBiasOutcome === 'BULLISH' ? '🟢 Bullish Gold' : ev.actualBiasOutcome === 'BEARISH' ? '🔴 Bearish Gold' : '⚪ Neutral';
          text += `  🎯 <b>Actual: <code>${ev.actual}</code></b> (${biasTag}) | Fcst: <code>${ev.forecast}</code>\n`;
        } else {
          text += `  📊 Forecast: <code>${ev.forecast}</code> | Prev: <code>${ev.previous}</code>\n`;
        }
        text += `  💡 <i>${ev.actualSummaryNote || (ev.goldImpactNote ? ev.goldImpactNote.slice(0, 100) + '...' : 'High XAUUSD volatility')}</i>\n\n`;
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

  /**
   * Dispatches high-urgency 2-minute pre-release shield alert with 1-tap flatten buttons.
   */
  static async sendGoldNewsUrgentShield(
    user: any,
    event: IEconomicCalendarEvent
  ): Promise<boolean> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) {
      return false;
    }

    const rawToken = settings.telegramBotToken;
    const botToken = safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken);
    const chatId = settings.telegramChatId;
    if (!botToken || !chatId) return false;

    const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
    const openGoldTrades = await Trade.find({
      userId: user._id,
      accountId: { $in: allActiveAccountIds },
      status: 'OPEN',
      symbol: { $regex: /XAU|GOLD/i },
    }).lean();

    if (!openGoldTrades || openGoldTrades.length === 0) return false;

    let totLots = 0;
    for (const t of openGoldTrades) {
      totLots += Number(t.simpleExecution?.quantity ?? t.calculated?.openQuantity ?? 1);
    }

    const text =
      `🚨 <b>URGENT NEWS SHIELD: 2 MINUTES UNTIL RELEASE!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<pre>\n` +
      `Event    : ${event.title} (${event.country})\n` +
      `Impact   : 🔴 HIGH VOLATILITY CATALYST\n` +
      `Release  : ${event.istTimeStr || event.countdownStr || '2 Minutes'}\n` +
      `Exposure : ${openGoldTrades.length} position(s) · ${totLots.toFixed(2)} Lots\n` +
      `</pre>\n` +
      `<i>Extreme spread widening and whipsaws imminent. Recommended: Flatten exposure or lock breakeven immediately!</i>`;

    const buttons: ITelegramInlineButton[][] = [
      [
        { text: `🚨 FLATTEN ALL GOLD NOW (${totLots.toFixed(2)}L)`, callback_data: 'cmd_close_gold' },
        { text: '🛡️ Lock All to BE', callback_data: 'cmd_lock_be_all' },
      ],
      [
        { text: '📌 View Live Cockpit', callback_data: 'cmd_refresh_cockpit' },
      ],
    ];

    try {
      await this.sendMessage(botToken, chatId, text, buttons, false);
      return true;
    } catch {
      return false;
    }
  }

  static async sendGoldNewsResultAlert(
    user: any,
    event: IEconomicCalendarEvent,
    liveGoldPrice?: number
  ): Promise<boolean> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) {
      return false;
    }
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.goldNewsResultAlert === false) {
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

    // Check if user has open Gold positions exposed to this news release
    const allActiveAccountIds = await AccountScopeService.resolveAccountScope(user._id, { mode: 'ALL' });
    const openGoldTrades = await Trade.find({
      userId: user._id,
      accountId: { $in: allActiveAccountIds },
      status: 'OPEN',
      symbol: { $regex: /XAU|GOLD/i },
    }).lean();

    let ltp = liveGoldPrice;
    if (!ltp && openGoldTrades && openGoldTrades.length > 0) {
      ltp = (openGoldTrades[0] as any).currentLtp || openGoldTrades[0].simpleExecution?.entryPrice;
    }

    const { text, buttons } = EconomicCalendarService.formatGoldNewsResultTelegramAlert(
      event,
      ltp,
      openGoldTrades
    );

    const finalButtons: ITelegramInlineButton[][] = [...buttons];
    if (openGoldTrades && openGoldTrades.length > 0) {
      for (const t of openGoldTrades as any[]) {
        const entry = Number(t.simpleExecution?.entryPrice ?? t.calculated?.averageEntryPrice ?? t.entryPrice ?? 0);
        const tradeLtp = t.currentLtp || entry;
        finalButtons.unshift([
          { text: `🛡️ Lock BE (${t.symbol})`, callback_data: `x:${t._id}:BE:1:${Number(tradeLtp.toFixed(2))}` },
          { text: `🚨 Close Position`, callback_data: `x:${t._id}:E:1:${Number(tradeLtp.toFixed(2))}` },
        ]);
      }
    }

    try {
      await this.sendMessage(botToken, chatId, text, finalButtons, disableNotification);
      return true;
    } catch (err: any) {
      console.warn(`[TelegramAlertService] sendGoldNewsResultAlert failed for user ${user._id}:`, err.message);
      return false;
    }
  }
}
