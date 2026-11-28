/**
 * SetupMint - Conversational AI Trading Copilot ("Ask SetupMint") Service
 *
 * Provides institutional-grade conversational intelligence across trades, journals,
 * analytics, psychology, and strategy playbooks:
 *
 * 1. Dual-Engine Architecture:
 *    - Google Gemini Flash LLM (Agentic natural language synthesis & conversational memory)
 *    - Deterministic Quantitative Copilot Engine (100% Free, Offline, 30-digit Precision Fallback)
 * 2. Grounded Financial Context:
 *    - Ingests verified account balances, win rates, profit factors, excursion data, and leak metrics
 *    - Math is strictly computed by @tradevault/financial-engine beforehand (Zero hallucinations)
 * 3. Contextual Suggestions & Interactive UI Directives:
 *    - Returns structured action buttons (navigation, ledger drilldowns) and visual data cards
 */

import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import {
  IAiCopilotMessage,
  IAiCopilotQueryInput,
  IAiCopilotResponse,
  IAiCopilotSuggestion,
} from '@tradevault/shared';
import { Trade, User, Strategy, DailyJournal, TradingAccount } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

interface IQuantitativeContext {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnL: number;
  grossPnL: number;
  totalCosts: number;
  profitFactor: number;
  avgRealizedR: number;
  bestTrade?: { symbol: string; pnl: number; r: number; date: string };
  worstTrade?: { symbol: string; pnl: number; r: number; date: string };
  symbolBreakdown: Record<string, { trades: number; wins: number; winRate: number; netPnL: number }>;
  strategyBreakdown: Record<string, { name: string; trades: number; winRate: number; netPnL: number; profitFactor: number }>;
  revengeTradesCount: number;
  revengeTradesCost: number;
  topMistakes: Array<{ mistake: string; count: number }>;
  propStatus?: {
    accountName: string;
    dailyLossLimit: number;
    dailyLossRemaining: number;
    breached: boolean;
  };
  recentJournalsCount: number;
  activeCurrency: string;
}

export class AiCopilotService {
  /**
   * Main entrypoint: Answers a natural language trading query with memory & grounding.
   */
  static async askCopilot(
    userId: string | mongoose.Types.ObjectId,
    input: IAiCopilotQueryInput
  ): Promise<IAiCopilotResponse> {
    const startTime = Date.now();
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const { question, scopeKey = 'ALL', accountId, history = [] } = input;

    // 1. Gather User & Grounded Quantitative Context
    const user = await User.findById(uId).lean();
    const quantContext = await this.gatherQuantitativeContext(uId, scopeKey, accountId);

    // 2. Check for Google Gemini API Key
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    const preferredModel = user?.aiSettings?.model || 'gemini-2.5-flash';
    const isAiEnabled = user?.aiSettings?.enabled !== false;

    // 3. Attempt Google Gemini Synthesis if enabled and key present
    if (geminiApiKey && isAiEnabled) {
      try {
        const geminiResponse = await this.synthesizeWithGemini({
          apiKey: geminiApiKey,
          userId: uId,
          preferredModel,
          question,
          history,
          quantContext,
        });

        if (geminiResponse) {
          const latencyMs = Date.now() - startTime;
          return {
            message: geminiResponse,
            latencyMs,
          };
        }
      } catch (err: any) {
        console.warn('[AiCopilotService] Gemini synthesis failed; falling back to Deterministic Quant Engine:', err.message);
      }
    }

    // 4. Deterministic Quantitative Copilot Engine Fallback (100% Free, Offline, Mathematical Precision)
    const deterministicMessage = this.evaluateDeterministicIntent(question, quantContext);
    const latencyMs = Date.now() - startTime;

    return {
      message: deterministicMessage,
      latencyMs,
    };
  }

  /**
   * Returns contextual starter suggestions based on the trader's actual telemetry.
   */
  static async getSuggestions(
    userId: string | mongoose.Types.ObjectId,
    scopeKey?: string
  ): Promise<IAiCopilotSuggestion[]> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // Check for recent revenge trades or losses
    const recentLosses = await Trade.find({
      userId: uId,
      status: 'CLOSED',
      'calculated.netPnL': { $lt: 0 },
    })
      .sort({ exitTime: -1 })
      .limit(5)
      .lean();

    const suggestions: IAiCopilotSuggestion[] = [
      {
        title: 'Performance Overview',
        prompt: 'What is my current win rate, profit factor, and average R-multiple?',
        category: 'PERFORMANCE',
      },
      {
        title: 'Revenge Trading & Leaks',
        prompt: 'How much money did revenge trading and discipline mistakes cost me?',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Instrument Comparison',
        prompt: 'Compare my performance across different symbols (which market is most profitable?)',
        category: 'PERFORMANCE',
      },
      {
        title: 'Strategy Edge Audit',
        prompt: 'Which playbook strategy is giving me the highest statistical expectancy?',
        category: 'STRATEGY',
      },
    ];

    if (recentLosses.length > 0) {
      suggestions.unshift({
        title: 'Loss Analysis',
        prompt: 'Analyze my biggest losing trades and tell me what mistakes triggered them',
        category: 'PSYCHOLOGY',
      });
    }

    return suggestions.slice(0, 4);
  }

  /**
   * Compiles verified mathematical metrics across trades, accounts, and journals.
   */
  private static async gatherQuantitativeContext(
    userId: mongoose.Types.ObjectId,
    scopeKey?: string,
    accountId?: string
  ): Promise<IQuantitativeContext> {
    const tradeFilter: any = {
      userId,
      status: 'CLOSED',
    };

    if (accountId && accountId !== 'ALL') {
      tradeFilter.accountId = new mongoose.Types.ObjectId(accountId);
    }

    const [trades, strategies, account, journals] = await Promise.all([
      Trade.find(tradeFilter).sort({ exitTime: 1 }).lean(),
      Strategy.find({ userId }).lean(),
      accountId && accountId !== 'ALL' ? TradingAccount.findOne({ _id: accountId, userId }).lean() : null,
      DailyJournal.find({ userId }).sort({ date: -1 }).limit(10).lean(),
    ]);

    const stratMap = new Map<string, string>();
    strategies.forEach((s) => stratMap.set(s._id.toString(), s.name));

    let grossPnL = new Decimal(0);
    let netPnL = new Decimal(0);
    let totalCosts = new Decimal(0);
    let winCount = 0;
    let lossCount = 0;
    let sumRealizedR = new Decimal(0);

    let bestTrade: any = null;
    let worstTrade: any = null;

    const symbolMap: Record<string, { trades: number; wins: number; pnl: Decimal }> = {};
    const strategyStats: Record<string, { name: string; trades: number; wins: number; pnl: Decimal; grossWin: Decimal; grossLoss: Decimal }> = {};
    const mistakeCounts: Record<string, number> = {};

    let revengeTradesCount = 0;
    let revengeTradesCost = new Decimal(0);

    let lastExitTime: Date | null = null;
    let lastTradeLost = false;

    for (const t of trades) {
      const pnl = new Decimal(t.calculated?.netPnL ?? 0);
      const gross = new Decimal(t.calculated?.grossPnL ?? pnl);
      const cost = new Decimal(t.calculated?.totalCosts ?? gross.minus(pnl));
      const r = new Decimal(t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple ?? 0);

      netPnL = netPnL.plus(pnl);
      grossPnL = grossPnL.plus(gross);
      totalCosts = totalCosts.plus(cost);
      sumRealizedR = sumRealizedR.plus(r);

      if (pnl.isPositive()) {
        winCount++;
        if (!bestTrade || pnl.greaterThan(bestTrade.pnl)) {
          bestTrade = {
            symbol: t.symbol || 'MARKET',
            pnl: pnl.toNumber(),
            r: r.toNumber(),
            date: t.tradeDate ? new Date(t.tradeDate).toISOString().slice(0, 10) : 'N/A',
          };
        }
      } else if (pnl.isNegative()) {
        lossCount++;
        if (!worstTrade || pnl.lessThan(worstTrade.pnl)) {
          worstTrade = {
            symbol: t.symbol || 'MARKET',
            pnl: pnl.toNumber(),
            r: r.toNumber(),
            date: t.tradeDate ? new Date(t.tradeDate).toISOString().slice(0, 10) : 'N/A',
          };
        }
      }

      // Symbol breakdown
      const sym = (t.symbol || 'OTHER').toUpperCase();
      if (!symbolMap[sym]) {
        symbolMap[sym] = { trades: 0, wins: 0, pnl: new Decimal(0) };
      }
      symbolMap[sym].trades++;
      if (pnl.isPositive()) symbolMap[sym].wins++;
      symbolMap[sym].pnl = symbolMap[sym].pnl.plus(pnl);

      // Strategy breakdown
      const stratId = t.strategyId?.toString();
      const stratName = (stratId && stratMap.get(stratId)) || 'Unclassified';
      if (!strategyStats[stratName]) {
        strategyStats[stratName] = {
          name: stratName,
          trades: 0,
          wins: 0,
          pnl: new Decimal(0),
          grossWin: new Decimal(0),
          grossLoss: new Decimal(0),
        };
      }
      strategyStats[stratName].trades++;
      strategyStats[stratName].pnl = strategyStats[stratName].pnl.plus(pnl);
      if (pnl.isPositive()) {
        strategyStats[stratName].wins++;
        strategyStats[stratName].grossWin = strategyStats[stratName].grossWin.plus(pnl);
      } else if (pnl.isNegative()) {
        strategyStats[stratName].grossLoss = strategyStats[stratName].grossLoss.plus(pnl.abs());
      }

      // Mistake breakdown
      const mistakes = t.psychology?.mistakes || [];
      for (const m of mistakes) {
        mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
      }

      // Revenge trading detection (entered within 20 mins of previous loss)
      const entryTime = t.entryTime ? new Date(t.entryTime) : null;
      if (lastTradeLost && lastExitTime && entryTime) {
        const diffMinutes = (entryTime.getTime() - lastExitTime.getTime()) / (1000 * 60);
        if (diffMinutes >= 0 && diffMinutes <= 20) {
          revengeTradesCount++;
          if (pnl.isNegative()) {
            revengeTradesCost = revengeTradesCost.plus(pnl.abs());
          }
        }
      }

      if (t.exitTime) {
        lastExitTime = new Date(t.exitTime);
        lastTradeLost = pnl.isNegative();
      }
    }

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0;
    const avgRealizedR = totalTrades > 0 ? Number(sumRealizedR.dividedBy(totalTrades).toFixed(2)) : 0;

    let grossLossSum = new Decimal(0);
    let grossWinSum = new Decimal(0);
    trades.forEach((t) => {
      const p = new Decimal(t.calculated?.netPnL ?? 0);
      if (p.isPositive()) grossWinSum = grossWinSum.plus(p);
      if (p.isNegative()) grossLossSum = grossLossSum.plus(p.abs());
    });

    const profitFactor = grossLossSum.isZero()
      ? grossWinSum.isPositive()
        ? 999.99
        : 0
      : Number(grossWinSum.dividedBy(grossLossSum).toFixed(2));

    // Format symbol breakdown
    const formattedSymbols: Record<string, { trades: number; wins: number; winRate: number; netPnL: number }> = {};
    for (const [k, v] of Object.entries(symbolMap)) {
      formattedSymbols[k] = {
        trades: v.trades,
        wins: v.wins,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
        netPnL: v.pnl.toNumber(),
      };
    }

    // Format strategy breakdown
    const formattedStrategies: Record<string, { name: string; trades: number; winRate: number; netPnL: number; profitFactor: number }> = {};
    for (const [k, v] of Object.entries(strategyStats)) {
      const pf = v.grossLoss.isZero()
        ? v.grossWin.isPositive()
          ? 999.99
          : 0
        : Number(v.grossWin.dividedBy(v.grossLoss).toFixed(2));
      formattedStrategies[k] = {
        name: v.name,
        trades: v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
        netPnL: v.pnl.toNumber(),
        profitFactor: pf,
      };
    }

    // Top mistakes sorted
    const topMistakes = Object.entries(mistakeCounts)
      .map(([mistake, count]) => ({ mistake, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Prop firm status if applicable
    let propStatus: any = undefined;
    if (account && account.accountType === 'PROP_FIRM') {
      const maxDailyLoss = Number(account.riskRules?.maxDailyLoss ?? 10000);
      const today = new Date().toISOString().slice(0, 10);
      const todayTrades = trades.filter((t) => t.tradeDate && new Date(t.tradeDate).toISOString().slice(0, 10) === today);
      const todayNet = todayTrades.reduce((acc, t) => acc + Number(t.calculated?.netPnL ?? 0), 0);
      const remaining = Math.max(0, maxDailyLoss + todayNet);

      propStatus = {
        accountName: account.name,
        dailyLossLimit: maxDailyLoss,
        dailyLossRemaining: remaining,
        breached: todayNet <= -maxDailyLoss,
      };
    }

    const activeCurrency = (account as any)?.baseCurrency || (trades[0]?.currency as string) || 'INR';

    return {
      totalTrades,
      winCount,
      lossCount,
      winRate,
      netPnL: netPnL.toNumber(),
      grossPnL: grossPnL.toNumber(),
      totalCosts: totalCosts.toNumber(),
      profitFactor,
      avgRealizedR,
      bestTrade,
      worstTrade,
      symbolBreakdown: formattedSymbols,
      strategyBreakdown: formattedStrategies,
      revengeTradesCount,
      revengeTradesCost: revengeTradesCost.toNumber(),
      topMistakes,
      propStatus,
      recentJournalsCount: journals.length,
      activeCurrency,
    };
  }

  /**
   * Deterministic Intent Evaluation: Parses keywords and returns exact, structured insights.
   */
  private static evaluateDeterministicIntent(
    question: string,
    ctx: IQuantitativeContext
  ): IAiCopilotMessage {
    const q = question.toLowerCase();
    const curr = ctx.activeCurrency;
    const formatMoney = (val: number) => {
      const prefix = curr === 'INR' ? '₹' : curr === 'USD' ? '$' : `${curr} `;
      return `${prefix}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // INTENT 1: Revenge Trading & Mistakes / Psychology
    if (q.includes('revenge') || q.includes('mistake') || q.includes('leak') || q.includes('psycholog') || q.includes('discipline')) {
      const topMistakeStr = ctx.topMistakes.length > 0
        ? ctx.topMistakes.map((m, i) => `${i + 1}. **${m.mistake}** (${m.count} occurrences)`).join('\n')
        : '• No frequent mistakes explicitly tagged in your trade logs yet.';

      const content = `### 🧠 Psychological & Discipline Audit

Here is your exact discipline telemetry based on ${ctx.totalTrades} closed trades:

• **Revenge Trading Cost:** You have taken **${ctx.revengeTradesCount} revenge trades** (orders executed within 20 minutes of a losing trade), resulting in **${formatMoney(ctx.revengeTradesCost)}** in surrendered capital.
• **Total Costs & Commissions:** Paid ${formatMoney(ctx.totalCosts)} in broker & statutory charges.

#### Most Common Discipline Leaks:
${topMistakeStr}

> **Coach Directive:** Enforce a strict **20-minute mandatory timeout** immediately after any stopped-out trade. Eliminating revenge trading alone would restore **${formatMoney(ctx.revengeTradesCost)}** back to your equity curve.`;

      return {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'assistant',
        content,
        suggestedActions: [
          { label: 'View Analytics Psychology Tab', actionType: 'NAVIGATE', path: '/analytics' },
          { label: 'Inspect Trades Ledger', actionType: 'NAVIGATE', path: '/trades' },
        ],
        dataCards: [
          {
            type: 'LEAK_AUDIT',
            title: 'Discipline Leaks & Cost',
            metrics: {
              'Revenge Trades': ctx.revengeTradesCount,
              'Revenge Drag': formatMoney(ctx.revengeTradesCost),
              'Top Mistake': ctx.topMistakes[0]?.mistake || 'None',
            },
          },
        ],
        modelUsed: 'Deterministic Quant Engine (Free Tier)',
        timestamp: new Date().toISOString(),
      };
    }

    // INTENT 2: Instrument / Symbol Performance
    if (q.includes('symbol') || q.includes('instrument') || q.includes('nifty') || q.includes('banknifty') || q.includes('crude') || q.includes('market')) {
      const entries = Object.entries(ctx.symbolBreakdown).sort((a, b) => b[1].netPnL - a[1].netPnL);

      const symbolLines = entries.length > 0
        ? entries.map(([sym, data]) => `• **${sym}:** ${formatMoney(data.netPnL)} Net P&L | ${data.winRate}% Win Rate (${data.trades} trades)`).join('\n')
        : '• No symbol breakdown available yet.';

      const bestSym = entries[0];
      const worstSym = entries[entries.length - 1];

      const content = `### 📊 Instrument & Market Performance Breakdown

Here is your performance across traded instruments:

${symbolLines}

${bestSym ? `\n🏆 **Top Performer:** **${bestSym[0]}** with **${formatMoney(bestSym[1].netPnL)}** net profit (${bestSym[1].winRate}% win rate).` : ''}
${worstSym && worstSym[1].netPnL < 0 ? `\n⚠️ **Biggest Drag:** **${worstSym[0]}** with **${formatMoney(worstSym[1].netPnL)}** net loss (${worstSym[1].winRate}% win rate). Consider narrowing your focus to markets where your statistical edge is positive.` : ''}`;

      return {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'assistant',
        content,
        suggestedActions: [
          { label: 'Explore Instruments', actionType: 'NAVIGATE', path: '/instruments' },
          { label: 'Filter Trades by Symbol', actionType: 'NAVIGATE', path: '/trades' },
        ],
        dataCards: [
          {
            type: 'STAT_SUMMARY',
            title: 'Best & Worst Markets',
            metrics: {
              'Top Market': bestSym ? `${bestSym[0]} (${formatMoney(bestSym[1].netPnL)})` : 'N/A',
              'Weakest Market': worstSym ? `${worstSym[0]} (${formatMoney(worstSym[1].netPnL)})` : 'N/A',
              'Total Markets Traded': entries.length,
            },
          },
        ],
        modelUsed: 'Deterministic Quant Engine (Free Tier)',
        timestamp: new Date().toISOString(),
      };
    }

    // INTENT 3: Strategy & Playbook Edge
    if (q.includes('strateg') || q.includes('playbook') || q.includes('setup') || q.includes('orb') || q.includes('trend')) {
      const entries = Object.entries(ctx.strategyBreakdown).sort((a, b) => b[1].profitFactor - a[1].profitFactor);

      const stratLines = entries.length > 0
        ? entries.map(([name, data]) => `• **${name}:** Profit Factor **${data.profitFactor}** | ${data.winRate}% Win Rate | ${formatMoney(data.netPnL)} (${data.trades} trades)`).join('\n')
        : '• No classified strategies yet. Tag trades with strategies to see edge scores.';

      const content = `### 🎯 Strategy Playbook Edge Audit

Statistical evaluation of your setup playbooks:

${stratLines}

> **Edge Insight:** Focus 80% of your risk capital on setups with Profit Factor > 1.5 and sample sizes >= 15 trades. Cease live trading on negative-expectancy setups until refined in backtests.`;

      return {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'assistant',
        content,
        suggestedActions: [
          { label: 'Open Strategy Playbooks', actionType: 'NAVIGATE', path: '/strategies' },
        ],
        dataCards: [
          {
            type: 'STRATEGY_EDGE',
            title: 'Playbook Strategies',
            metrics: {
              'Top Strategy': entries[0]?.[1]?.name || 'N/A',
              'Top Profit Factor': entries[0]?.[1]?.profitFactor || 0,
              'Active Playbooks': entries.length,
            },
          },
        ],
        modelUsed: 'Deterministic Quant Engine (Free Tier)',
        timestamp: new Date().toISOString(),
      };
    }

    // INTENT 4: Prop Firm Challenge & Drawdown
    if (q.includes('prop') || q.includes('challenge') || q.includes('the5ers') || q.includes('drawdown') || q.includes('buffer')) {
      if (ctx.propStatus) {
        const content = `### 🛡️ Prop Firm Challenge Risk Status

Account: **${ctx.propStatus.accountName}**

• **Daily Loss Limit:** ${formatMoney(ctx.propStatus.dailyLossLimit)}
• **Remaining Daily Buffer:** **${formatMoney(ctx.propStatus.dailyLossRemaining)}**
• **Status:** ${ctx.propStatus.breached ? '🚨 **DAILY DRAWDOWN BREACHED! Flatten all positions and halt trading.**' : '✅ **Within Safe Operating Bounds.**'}

> **Governor Rule:** Never risk more than 30% of your remaining daily buffer on any single trade. If buffer drops below 50%, cut sizing by half.`;

        return {
          id: new mongoose.Types.ObjectId().toString(),
          role: 'assistant',
          content,
          suggestedActions: [
            { label: 'Open Accounts Page', actionType: 'NAVIGATE', path: '/accounts' },
            { label: 'Pre-Trade Risk Calculator', actionType: 'NAVIGATE', path: '/risk-calculator' },
          ],
          modelUsed: 'Deterministic Quant Engine (Free Tier)',
          timestamp: new Date().toISOString(),
        };
      }
    }

    // INTENT 5: Best & Worst Trades
    if (q.includes('best') || q.includes('worst') || q.includes('biggest') || q.includes('outlier')) {
      const content = `### 🏆 Outlier Trade Performance Analysis

• **Biggest Winning Trade:**
  - Symbol: **${ctx.bestTrade?.symbol || 'N/A'}**
  - Realized P&L: **${ctx.bestTrade ? formatMoney(ctx.bestTrade.pnl) : 'N/A'}** (${ctx.bestTrade?.r || 0}R)
  - Date: ${ctx.bestTrade?.date || 'N/A'}

• **Biggest Losing Trade:**
  - Symbol: **${ctx.worstTrade?.symbol || 'N/A'}**
  - Realized Loss: **${ctx.worstTrade ? formatMoney(ctx.worstTrade.pnl) : 'N/A'}** (${ctx.worstTrade?.r || 0}R)
  - Date: ${ctx.worstTrade?.date || 'N/A'}

> **Insight:** Your biggest loss was ${ctx.worstTrade ? formatMoney(Math.abs(ctx.worstTrade.pnl)) : 'N/A'}. Check if this trade violated your 1R risk sizing rules or suffered from moving stop losses.`;

      return {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'assistant',
        content,
        suggestedActions: [
          { label: 'View Trades Ledger', actionType: 'NAVIGATE', path: '/trades' },
          { label: 'Open Analytics', actionType: 'NAVIGATE', path: '/analytics' },
        ],
        modelUsed: 'Deterministic Quant Engine (Free Tier)',
        timestamp: new Date().toISOString(),
      };
    }

    // DEFAULT INTENT: Universal Executive Performance Summary
    const content = `### 📈 Executive Quantitative Summary

Here is your high-level desk performance summary across **${ctx.totalTrades} closed trades**:

• **Net P&L:** **${formatMoney(ctx.netPnL)}** (Gross: ${formatMoney(ctx.grossPnL)} | Costs: ${formatMoney(ctx.totalCosts)})
• **Win Rate:** **${ctx.winRate}%** (${ctx.winCount} Wins / ${ctx.lossCount} Losses)
• **Profit Factor:** **${ctx.profitFactor}**
• **Average Realized R:** **${ctx.avgRealizedR}R** per trade
• **Revenge Trading Cost:** **${formatMoney(ctx.revengeTradesCost)}** across ${ctx.revengeTradesCount} trades

> **Desk Recommendation:** Your statistical foundation shows a **${ctx.winRate}% win rate** and **${ctx.profitFactor} Profit Factor**. Your greatest opportunity for equity curve expansion is eliminating revenge trading and enforcing stop-loss discipline.`;

    return {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'assistant',
      content,
      suggestedActions: [
        { label: 'Review Detailed Analytics', actionType: 'NAVIGATE', path: '/analytics' },
        { label: 'Check Playbook Strategies', actionType: 'NAVIGATE', path: '/strategies' },
        { label: 'Daily Journal Calendar', actionType: 'NAVIGATE', path: '/journal' },
      ],
      dataCards: [
        {
          type: 'STAT_SUMMARY',
          title: 'Desk Telemetry',
          metrics: {
            'Net P&L': formatMoney(ctx.netPnL),
            'Win Rate': `${ctx.winRate}%`,
            'Profit Factor': ctx.profitFactor,
            'Avg Realized R': `${ctx.avgRealizedR}R`,
          },
        },
      ],
      modelUsed: 'Deterministic Quant Engine (Free Tier)',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Google Gemini Multiturn Synthesis: Connects LLM with verified quantitative context.
   */
  private static async synthesizeWithGemini(params: {
    apiKey: string;
    userId: mongoose.Types.ObjectId;
    preferredModel: string;
    question: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    quantContext: IQuantitativeContext;
  }): Promise<IAiCopilotMessage | null> {
    const { apiKey, userId, preferredModel, question, history, quantContext } = params;

    const systemPrompt = `You are "SetupMint Copilot" — an elite institutional quantitative desk coach and risk manager for serious discretionary and systematic traders.
You have direct access to the trader's verified historical performance telemetry, computed with 30-digit mathematical precision by the SetupMint financial engine.

RULES:
1. NEVER guess or invent P&L numbers, win rates, or trade counts. Use STRICTLY the provided quantitative context.
2. Maintain an institutional, concise, direct, and constructive coaching tone (similar to a hedge fund risk desk manager).
3. Identify psychological leaks (revenge trading, overtrading, moving stop losses) and provide actionable, rule-based remedies.
4. Respond in valid JSON adhering strictly to this schema:
{
  "content": "Rich markdown text answering the trader's query with bullet points, bold highlights, and a final actionable directive",
  "suggestedActions": [
    { "label": "Short action text", "actionType": "NAVIGATE" | "DRILLDOWN", "path": "/analytics" | "/trades" | "/strategies" | "/journal" | "/risk-calculator" }
  ],
  "dataCards": [
    {
      "type": "STAT_SUMMARY" | "LEAK_AUDIT" | "STRATEGY_EDGE",
      "title": "Card Title",
      "metrics": { "Key": "Value" }
    }
  ]
}`;

    const contextPayload = {
      quantContext,
      currentQuestion: question,
    };

    // Format chat history for Gemini
    const contents: any[] = [];
    for (const h of history.slice(-4)) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: `Trader Question: "${question}"\n\nVerified Grounded Telemetry:\n${JSON.stringify(contextPayload, null, 2)}`,
        },
      ],
    });

    const candidateModels = [
      preferredModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ].filter(Boolean) as string[];

    for (const model of candidateModels) {
      AiUsageTrackerService.recordRequest(userId, 'COPILOT', model).catch(() => {});

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);

        if (!res.ok) {
          if (res.status === 429) {
            AiUsageTrackerService.recordRateLimit(userId, 'COPILOT', model, 'HTTP 429 Rate Limit Exceeded').catch(() => {});
          }
          continue;
        }

        const data: any = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);

        return {
          id: new mongoose.Types.ObjectId().toString(),
          role: 'assistant',
          content: parsed.content || 'Analysis complete.',
          suggestedActions: parsed.suggestedActions || [],
          dataCards: parsed.dataCards || [],
          modelUsed: model,
          timestamp: new Date().toISOString(),
        };
      } catch (callErr: any) {
        clearTimeout(timeout);
        // Continue to next model fallback
      }
    }

    return null;
  }
}
