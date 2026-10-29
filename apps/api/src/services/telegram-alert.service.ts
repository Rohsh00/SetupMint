/**
 * Off-Screen Push Alert & Two-Way Command Service via Telegram Bot API.
 * Dispatches real-time risk alerts and handles interactive mobile commands:
 * - High-density terminal card formatting with monospace ASCII progress bars
 * - Interactive Inline Keyboards (One-tap Market Exit, Lock BE, Book 50%)
 * - Two-way commands: /pnl, /trades, /summary, /panic (flatten all)
 * - Trade entry/exit alerts, daily loss breaches, morning FYERS token checks, EOD digests
 * - STRICT POLICY: No silent mode on any trade alerts (every alert notifies with sound/vibration).
 */

import mongoose from 'mongoose';
import { User, Trade } from '../db/models/index.js';
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
}

export class TelegramAlertService {
  private static TELEGRAM_API_BASE = 'https://api.telegram.org';
  private static recentAlerts = new Map<string, number>();
  private static DEBOUNCE_MS = 60 * 1000; // Debounce identical alerts per 60 seconds

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
      const text =
        `🔔 <b>SetupMint Alert Link Verified</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Your SetupMint trading terminal is connected to this Telegram chat.\n\n` +
        `<b>Active Capabilities:</b>\n` +
        `• 🚨 Critical Stop Loss & Runway alerts\n` +
        `• ⚠️ Anti-Greed Profit Giveback radar\n` +
        `• 🎯 Scaling Ladder milestone updates\n` +
        `• 🛑 Daily Max Loss limit protection\n` +
        `• 📱 Two-Way Commands: /pnl, /trades, /panic\n\n` +
        `<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '📊 Check Live /pnl', callback_data: 'cmd_pnl' },
          { text: '📋 View /trades', callback_data: 'cmd_trades' },
        ],
      ];

      await this.sendMessage(botToken, chatId, text, buttons);
      return { success: true, message: 'Rich test notification sent to Telegram successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to dispatch Telegram test message' };
    }
  }

  /**
   * Configures Telegram Webhook for two-way interactive buttons and commands.
   */
  static async setWebhook(botToken: string, webhookUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.TELEGRAM_API_BASE}/bot${botToken}/setWebhook`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const json = (await res.json()) as any;
      if (!json.ok) throw new Error(json.description || 'Webhook registration failed');
      return { success: true, message: json.description || 'Telegram webhook configured successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to configure Telegram webhook' };
    }
  }

  /**
   * Dispatches an alert with deduplication and rich institutional layout.
   */
  static async sendAlert(payload: ITelegramAlertPayload): Promise<boolean> {
    const { botToken, chatId, title, body, severity = 'WARNING', metrics, progressBar, buttons } = payload;
    if (!botToken || !chatId) return false;

    const dedupeKey = `${chatId}:${title}:${body.slice(0, 30)}`;
    const now = Date.now();
    const lastSent = this.recentAlerts.get(dedupeKey);
    if (lastSent && now - lastSent < this.DEBOUNCE_MS) {
      return false; // Skip throttled duplicate alert
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

    // Format metrics into a clean monospace card
    if (metrics && Object.keys(metrics).length > 0) {
      let metricsText = '<pre>\n';
      const maxKeyLen = Math.max(...Object.keys(metrics).map((k) => k.length));
      for (const [k, v] of Object.entries(metrics)) {
        metricsText += `${k.padEnd(maxKeyLen + 1)}: ${v}\n`;
      }
      metricsText += '</pre>';
      message += `\n\n${metricsText}`;
    }

    // Append ASCII Visual Progress Bar if provided
    if (progressBar) {
      const bar = this.renderProgressBar(progressBar.percent);
      message += `\n<b>${progressBar.label}:</b> <code>${bar}</code>`;
    }

    message += `\n\n<i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    try {
      await this.sendMessage(botToken, chatId, message, buttons);
      return true;
    } catch (e: any) {
      console.warn(`[TelegramAlertService] Alert failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Low-level Telegram sendMessage API caller.
   * Note: disable_notification is strictly FALSE so all alerts notify with sound.
   */
  static async sendMessage(
    botToken: string,
    chatId: string | number,
    text: string,
    buttons?: ITelegramInlineButton[][]
  ): Promise<any> {
    const url = `${this.TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      disable_notification: false, // Strictly audible/vibrating alerts
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
   * Answers a Telegram callback query with immediate haptic notification popup.
   */
  static async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<void> {
    try {
      const url = `${this.TELEGRAM_API_BASE}/bot${botToken}/answerCallbackQuery`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || 'Processing order...',
          show_alert: showAlert,
        }),
      });
    } catch (err: any) {
      console.warn(`[TelegramAlertService] answerCallbackQuery failed:`, err.message);
    }
  }

  /**
   * Edits an existing message text in-place (e.g. after a button execution).
   */
  static async editMessageText(
    botToken: string,
    chatId: string | number,
    messageId: number,
    text: string,
    buttons?: ITelegramInlineButton[][]
  ): Promise<void> {
    try {
      const url = `${this.TELEGRAM_API_BASE}/bot${botToken}/editMessageText`;
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
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.warn(`[TelegramAlertService] editMessageText failed:`, err.message);
    }
  }

  /**
   * Handles incoming Webhook updates from Telegram (button clicks and commands).
   */
  static async processWebhookUpdate(update: any): Promise<void> {
    if (!update) return;

    // 1. Handle Inline Button Clicks (callback_query)
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id || cq.from?.id;
      const data: string = cq.data || '';
      const messageId = cq.message?.message_id;

      const user = await User.findOne({
        'liveWatcherSettings.telegramChatId': String(chatId),
      }).lean();

      if (!user) {
        return;
      }

      const botToken = user.liveWatcherSettings?.telegramBotToken;
      if (!botToken) return;

      if (data.startsWith('exit:')) {
        const tradeId = data.split(':')[1];
        await this.answerCallbackQuery(botToken, cq.id, '⚡ Sending emergency market exit to FYERS...');
        try {
          const tradeToClose = await Trade.findById(tradeId).lean();
          const exitQty = tradeToClose?.simpleExecution?.quantity || (tradeToClose as any)?.quantity || 1;
          const res = await FyersService.executeBrokerExit(user._id, tradeId, {
            exitQty,
            isFullClose: true,
          });
          const updateText =
            (cq.message?.text || '') +
            `\n\n<b>[✅ EXECUTED MARKET EXIT ON FYERS]</b>\n` +
            `Order Status: ${res.executedOnBroker ? 'FILLED ON EXCHANGE' : 'PAPER SIMULATED'}\n` +
            `Traded Price: ₹${res.tradedPrice || 'Market'} • Time: ${new Date().toLocaleTimeString('en-IN')}`;
          await this.editMessageText(botToken, chatId, messageId, updateText, []);
        } catch (err: any) {
          await this.sendMessage(botToken, chatId, `❌ Market exit failed for trade ${tradeId}: ${err.message}`);
        }
        return;
      }

      if (data.startsWith('lock_be:')) {
        const tradeId = data.split(':')[1];
        await this.answerCallbackQuery(botToken, cq.id, '🛡️ Trailing Stop to True Breakeven...');
        try {
          const metric = await LiveWatcherService.getSingleTradeLiveMetric(user._id.toString(), tradeId);
          if (!metric) throw new Error('Could not calculate current live metric');
          const bePrice = metric.trueBreakevenPrice ?? metric.entryPrice;
          const res = await FyersService.executeBrokerStopLoss(user._id, tradeId, bePrice);
          const updateText =
            (cq.message?.text || '') +
            `\n\n<b>[🛡️ STOP LOCKED AT TRUE BREAKEVEN]</b>\n` +
            `SL Price: ₹${bePrice} (Fees Covered: ₹${metric.estimatedCharges.toFixed(2)})\n` +
            `Order Status: ${res.executedOnBroker ? 'SL MODIFIED ON FYERS' : 'PAPER SIMULATED'}`;
          await this.editMessageText(botToken, chatId, messageId, updateText, []);
        } catch (err: any) {
          await this.sendMessage(botToken, chatId, `❌ Trailing to BE failed: ${err.message}`);
        }
        return;
      }

      if (data.startsWith('book_50:')) {
        const tradeId = data.split(':')[1];
        await this.answerCallbackQuery(botToken, cq.id, '🎯 Booking 50% & trailing SL...');
        try {
          const metric = await LiveWatcherService.getSingleTradeLiveMetric(user._id.toString(), tradeId);
          if (!metric) throw new Error('Trade metric unavailable');
          const exitQty = Math.max(1, Math.round(metric.quantity * 0.5));
          await FyersService.executeBrokerExit(user._id, tradeId, { exitQty });
          if (metric.trueBreakevenPrice) {
            await FyersService.executeBrokerStopLoss(user._id, tradeId, metric.trueBreakevenPrice);
          }
          const updateText =
            (cq.message?.text || '') +
            `\n\n<b>[🎯 50% BOOKED & STOP TO BREAKEVEN]</b>\n` +
            `Exited: ${exitQty} units • SL Trailed: ₹${metric.trueBreakevenPrice || metric.entryPrice}`;
          await this.editMessageText(botToken, chatId, messageId, updateText, []);
        } catch (err: any) {
          await this.sendMessage(botToken, chatId, `❌ Scaling step failed: ${err.message}`);
        }
        return;
      }

      if (data === 'cmd_pnl') {
        await this.answerCallbackQuery(botToken, cq.id);
        await this.handlePnlCommand(user, botToken, chatId);
        return;
      }

      if (data === 'cmd_trades') {
        await this.answerCallbackQuery(botToken, cq.id);
        await this.handleTradesCommand(user, botToken, chatId);
        return;
      }

      if (data === 'panic_prompt') {
        await this.answerCallbackQuery(botToken, cq.id);
        await this.sendMessage(
          botToken,
          chatId,
          `⚠️ <b>CONFIRM EMERGENCY KILLSWITCH</b>\n\nAre you sure you want to market exit <b>ALL open positions</b> on FYERS immediately?`,
          [[{ text: '🛑 YES, CLOSE ALL POSITIONS NOW', callback_data: 'confirm_panic' }]]
        );
        return;
      }

      if (data === 'confirm_panic') {
        await this.answerCallbackQuery(botToken, cq.id, '🚨 Flattening all open positions...');
        const openTrades = await Trade.find({ userId: user._id, status: 'OPEN' }).lean();
        let closedCount = 0;
        for (const t of openTrades) {
          try {
            const qty = t.simpleExecution?.quantity || (t as any)?.quantity || 1;
            await FyersService.executeBrokerExit(user._id, t._id.toString(), { exitQty: qty, isFullClose: true });
            closedCount++;
          } catch {}
        }
        await this.editMessageText(
          botToken,
          chatId,
          messageId,
          `🚨 <b>EMERGENCY KILLSWITCH COMPLETE</b>\n\nFlattened ${closedCount} open positions across FYERS exchange at market price.`
        );
        return;
      }
    }

    // 2. Handle Text Commands (/pnl, /trades, /summary, /panic, /start)
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const command = text.split(' ')[0].toLowerCase();

      const user = await User.findOne({
        'liveWatcherSettings.telegramChatId': String(chatId),
      }).lean();

      if (!user) {
        // Help unlinked user connect their Telegram
        const botToken = process.env.TELEGRAM_DEFAULT_BOT_TOKEN;
        if (botToken) {
          await this.sendMessage(
            botToken,
            chatId,
            `👋 <b>Welcome to SetupMint Terminal Bot</b>\n\n` +
            `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
            `To connect your account:\n` +
            `1. Open SetupMint in your browser\n` +
            `2. Go to <b>Settings > Live Watcher > Telegram Off-Screen Push Alerts</b>\n` +
            `3. Paste your Chat ID (<code>${chatId}</code>) and your Bot Token\n` +
            `4. Click <b>Test Connection</b> & <b>Save Settings</b>.`
          );
        }
        return;
      }

      const botToken = user.liveWatcherSettings?.telegramBotToken;
      if (!botToken) return;

      switch (command) {
        case '/start':
        case '/help':
          await this.sendMessage(
            botToken,
            chatId,
            `👋 <b>SetupMint Terminal Bot Commands</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• <b>/pnl</b> — Live floating PnL, open R-multiple & today's day PnL\n` +
            `• <b>/trades</b> — List active open trades with 1-tap Exit and Lock BE\n` +
            `• <b>/summary</b> — Today's performance stats, win rate & harvested R\n` +
            `• <b>/panic</b> — Emergency killswitch to market-exit all positions\n` +
            `• <b>/help</b> — Show this command reference\n\n` +
            `<i>Connected as: ${user.name || user.email}</i>`
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

        case '/panic':
        case '/killswitch':
          await this.sendMessage(
            botToken,
            chatId,
            `⚠️ <b>EMERGENCY KILLSWITCH REQUESTED</b>\n\nDo you want to immediately market-exit all open positions on FYERS?`,
            [[{ text: '🛑 YES, CLOSE ALL POSITIONS NOW', callback_data: 'confirm_panic' }]]
          );
          break;

        default:
          await this.sendMessage(
            botToken,
            chatId,
            `❓ Unknown command: <code>${command}</code>. Type <b>/help</b> for a list of valid commands.`
          );
      }
    }
  }

  /**
   * Generates live PnL report card for /pnl command.
   */
  private static async handlePnlCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString());
    const openCount = summary.positions.length;

    // Fetch today's closed trades for realized PnL
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
      `<i>Status: ${summary.provider} market feed • ${new Date().toLocaleTimeString('en-IN')} IST</i>`;

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
  private static async handleTradesCommand(user: any, botToken: string, chatId: string | number): Promise<void> {
    const summary = await LiveWatcherService.getLiveWatcherSummary(user._id.toString());
    if (summary.positions.length === 0) {
      await this.sendMessage(
        botToken,
        chatId,
        `✅ <b>No Open Positions</b>\n\nYou currently have 0 open positions. Capital is 100% safe and unexposed.`
      );
      return;
    }

    for (const pos of summary.positions) {
      const pnlSign = pos.floatingNetPnL >= 0 ? '+' : '';
      const rSign = (pos.unrealizedR || 0) >= 0 ? '+' : '';

      const mult = pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1;
      const exposure = pos.quantity * mult * pos.currentLtp;

      const stopInfo = pos.stopLoss ? `₹${pos.stopLoss} (${pos.distanceToStopPoints?.toFixed(1) || 0} pts left)` : 'NO STOP SET (NAKED)';
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

      const buttons: ITelegramInlineButton[][] = [
        [
          { text: '🚨 Market Exit', callback_data: `exit:${pos.tradeId}` },
          { text: '🛡️ Lock True BE', callback_data: `lock_be:${pos.tradeId}` },
          { text: '🎯 Book 50%', callback_data: `book_50:${pos.tradeId}` },
        ],
      ];

      await this.sendMessage(botToken, chatId, text, buttons);
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
          { text: '🚨 Quick Market Exit', callback_data: `exit:${trade._id}` },
        ],
      ],
    });
  }

  /**
   * Triggered when an open trade is closed.
   */
  static async notifyTradeClosed(
    user: any,
    trade: any,
    outcome: { netPnL: number; realizedR?: number; exitPrice: number; exitReason?: string }
  ): Promise<void> {
    const settings = user.liveWatcherSettings;
    if (!settings?.telegramAlertsEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
    if (settings.telegramAlertEvents && settings.telegramAlertEvents.tradeClosed === false) return;

    const isWin = outcome.netPnL > 0;
    const sign = outcome.netPnL >= 0 ? '+' : '';
    const rSign = (outcome.realizedR || 0) >= 0 ? '+' : '';

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: `${isWin ? '🏁 Trade Closed in Profit' : '🛑 Trade Closed in Loss'}: ${trade.symbol}`,
      body: `Position closed at ₹${outcome.exitPrice}. Net outcome recorded in your trading journal.`,
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

    await this.sendAlert({
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      title: isBreach ? '🚨 CRITICAL: Daily Loss Limit Breached!' : '⚠️ WARNING: Daily Loss Threshold Reached',
      body: isBreach
        ? `Daily loss limit of ₹${dailyLimit.toLocaleString('en-IN')} has been 100% BREACHED. Stop trading and protect remaining capital!`
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
        [
          { text: '🚨 Flatten All Positions', callback_data: 'panic_prompt' },
        ],
      ],
    });
  }
}
