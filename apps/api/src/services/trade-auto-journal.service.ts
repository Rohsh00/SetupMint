/**
 * SetupMint - Real-Time Post-Exit Trade Auto-Journaling Service
 *
 * Automatically executes deep AI candlestick price action perception, setup categorization,
 * mistake audit, and lesson extraction immediately upon trade closure with zero trader typing.
 */

import mongoose from 'mongoose';
import { Trade, User } from '../db/models/index.js';
import { TradeAiAnalyzerService } from './trade-ai-analyzer.service.js';
import { TelegramAlertService } from './telegram-alert.service.js';
import { safeDecryptSecret } from './crypto.service.js';

interface IAutoJournalTask {
  tradeId: string;
  userId: string;
  enqueuedAt: number;
}

export class TradeAutoJournalService {
  private static queue: IAutoJournalTask[] = [];
  private static isProcessing = false;
  private static processedTradeIds = new Set<string>();
  public static pacingDelayMs = 3500;

  /**
   * Resets queue state (used for testing and clean teardown)
   */
  static resetForTests(): void {
    this.queue = [];
    this.isProcessing = false;
    this.processedTradeIds.clear();
  }

  /**
   * Process a single trade directly (synchronous execution for tests or explicit runs)
   */
  static async processTradeDirect(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<void> {
    await this.processSingleTrade(tradeId.toString(), userId.toString());
  }

  /**
   * Waits for all pending queue items to finish processing
   */
  static async flush(): Promise<void> {
    while (this.queue.length > 0 || this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Enqueues a closed trade for instant post-exit AI auto-journaling
   */
  static enqueueClosedTrade(
    tradeId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): void {
    const tId = tradeId.toString();
    const uId = userId.toString();

    // Deduplicate in-memory to prevent duplicate runs for the same closed trade
    if (this.processedTradeIds.has(tId)) {
      return;
    }

    // Don't duplicate in active queue
    if (this.queue.some((item) => item.tradeId === tId)) {
      return;
    }

    this.queue.push({ tradeId: tId, userId: uId, enqueuedAt: Date.now() });

    // Kick off worker if not already running
    if (!this.isProcessing) {
      void this.processQueue();
    }
  }

  /**
   * Sequentially processes closed trades with safe pacing (3.5s spacing) to avoid 15 RPM burst limits
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) break;

        this.processedTradeIds.add(task.tradeId);
        // Cap processed trade set to last 1,000 entries
        if (this.processedTradeIds.size > 1000) {
          const firstKey = this.processedTradeIds.values().next().value;
          if (firstKey) this.processedTradeIds.delete(firstKey);
        }

        try {
          await this.processSingleTrade(task.tradeId, task.userId);
        } catch (err: any) {
          console.warn(`[TradeAutoJournal] Failed to auto-journal trade ${task.tradeId}:`, err.message);
        }

        // Pacing delay between AI runs if more tasks exist in queue
        if (this.queue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.pacingDelayMs));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Executes AI analysis and auto-application for a single trade
   */
  private static async processSingleTrade(tradeId: string, userId: string): Promise<void> {
    const [user, trade] = await Promise.all([
      User.findById(userId).lean(),
      Trade.findById(tradeId),
    ]);

    if (!user || !trade) return;

    // Verify user has auto-analysis enabled (defaults to true)
    if (user.aiSettings?.autoAnalyzeTrades === false) {
      return;
    }

    // If trade already has complete AI analysis and details applied, skip
    if (trade.aiAnalysis && trade.setup?.variantKey) {
      return;
    }

    const shouldAutoApply = user.aiSettings?.autoApplyTradeDetails !== false;

    // 1. Execute AI Multimodal / Quant Analysis
    const analysis = await TradeAiAnalyzerService.analyzeTrade(tradeId, userId, {
      autoApply: shouldAutoApply,
      force: false,
    });

    if (!analysis) return;

    // 2. Dispatch Telegram Real-Time Auto-Journaling Card if Telegram is configured
    try {
      const rawToken = user.liveWatcherSettings?.telegramBotToken;
      const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
      const chatId = user.liveWatcherSettings?.telegramChatId;
      const alertsEnabled = user.liveWatcherSettings?.telegramAlertsEnabled !== false;

      if (botToken && chatId && alertsEnabled) {
        const pnl = Number(trade.calculated?.netPnL ?? 0);
        const r = Number(trade.calculated?.realizedRMultiple ?? trade.risk?.realizedRMultiple ?? 0);
        const currency = trade.currency || user.baseCurrency || 'USD';

        const scoreStars =
          '⭐'.repeat(Math.max(1, Math.min(5, Math.round((analysis.executionScore || 5) / 2)))) +
          '☆'.repeat(5 - Math.max(1, Math.min(5, Math.round((analysis.executionScore || 5) / 2))));

        const isProfit = pnl >= 0;
        const outcomeEmoji = isProfit ? '🟢' : '🔴';

        let text =
          `🎯 <b>SetupMint AI Post-Exit Auto-Journal</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${outcomeEmoji} <b>${trade.symbol}</b> ${trade.direction} | <b>${isProfit ? '+' : ''}${pnl.toFixed(2)} ${currency} (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)</b>\n` +
          `🏷️ <b>Detected Setup:</b> <code>${analysis.setupType || 'Classified Setup'}</code>` +
          `${analysis.matchedStrategyName ? ` [${analysis.matchedStrategyName}]` : ''}\n` +
          `⭐ <b>Execution Score:</b> ${scoreStars} (${analysis.executionScore}/10)\n`;

        if (analysis.entryReview?.rating) {
          text += `🎯 <b>Entry Rating:</b> <code>${analysis.entryReview.rating}</code>\n`;
        }

        if (analysis.identifiedMistakes && analysis.identifiedMistakes.length > 0) {
          text += `⚠️ <b>Detected Mistakes:</b> <i>${analysis.identifiedMistakes.join(', ')}</i>\n`;
        }

        if (analysis.lessonsLearned && analysis.lessonsLearned.trim().length > 0) {
          text += `💡 <b>Lesson Learned:</b> <i>"${analysis.lessonsLearned}"</i>\n`;
        }

        text += `\n<i>Auto-applied setup, strategy, thesis & psychology to journal.</i>`;

        await TelegramAlertService.sendMessage(botToken, chatId, text, [
          [
            { text: '📊 Live /pnl', callback_data: 'cmd_pnl' },
            { text: '🧠 AI Coach', callback_data: 'cmd_coach' },
          ],
        ]);
      }
    } catch (telegramErr: any) {
      console.warn('[TradeAutoJournal] Failed to dispatch Telegram auto-journal card:', telegramErr.message);
    }
  }
}
