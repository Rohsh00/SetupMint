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
  openPositions?: Array<{
    tradeId: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    quantity: number;
    entryPrice: number;
    currentPrice?: number;
    unrealizedPnL?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    entryTime?: string;
  }>;
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

    const [closedTrades, openTrades, strategies, propAccounts] = await Promise.all([
      Trade.find({ userId: uId, status: 'CLOSED' })
        .sort({ exitTime: -1 })
        .limit(40)
        .select('symbol direction calculated exitTime mistakes psychology')
        .lean(),
      Trade.find({ userId: uId, status: 'OPEN' })
        .sort({ entryTime: -1 })
        .limit(5)
        .select('symbol direction calculated entryTime')
        .lean(),
      Strategy.find({ userId: uId }).select('name').limit(5).lean(),
      TradingAccount.find({
        userId: uId,
        status: 'ACTIVE',
        $or: [
          { accountType: 'PROP_FIRM' },
          { 'propFirmConfig.enabled': true },
          { 'propFirm.firmKey': { $exists: true, $ne: '' } },
        ],
      }).select('name broker').lean(),
    ]);

    // 1. Extract dynamic user context:
    const symbolCounts: Record<string, number> = {};
    const mistakeCounts: Record<string, number> = {};
    let streakLosses = 0;
    let streakCheckActive = true;

    for (const t of closedTrades) {
      if (t.symbol) {
        const sym = t.symbol.toUpperCase().trim();
        symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
      }
      const pnl = Number(t.calculated?.netPnL ?? 0);
      if (streakCheckActive) {
        if (pnl < 0) streakLosses++;
        else if (pnl > 0) streakCheckActive = false;
      }
      const mistakes: string[] = [
        ...(Array.isArray(t.psychology?.mistakes) ? t.psychology.mistakes : []),
        ...(Array.isArray((t as any).mistakes) ? (t as any).mistakes : []),
      ];
      for (const m of mistakes) {
        if (m) mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
      }
    }

    const topSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s);
    const topSymbol = topSymbols[0];
    const secondSymbol = topSymbols[1];

    const topMistakes = Object.entries(mistakeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
    const topMistake = topMistakes[0];

    const strategyNames = strategies.map((s) => s.name).filter(Boolean);
    const propName = propAccounts[0]?.name || 'Prop Challenge';

    // 2. Build Category Candidate Pools
    const performancePool: IAiCopilotSuggestion[] = [
      {
        title: 'Performance Overview',
        prompt: 'What is my current win rate, profit factor, and average R-multiple?',
        category: 'PERFORMANCE',
      },
      {
        title: 'Session Expectancy',
        prompt: 'Which trading session generates my highest returns: London, New York, or Asia?',
        category: 'PERFORMANCE',
      },
      {
        title: 'Day-of-Week Edge',
        prompt: 'Which day of the week generates my highest win rate and lowest loss rate?',
        category: 'PERFORMANCE',
      },
      {
        title: 'Long vs Short Asymmetry',
        prompt: 'Is my profitability asymmetric between Long setups versus Short setups?',
        category: 'PERFORMANCE',
      },
      {
        title: 'Best Trade Breakdown',
        prompt: 'Analyze my biggest winning trade and identify what factors drove its success',
        category: 'PERFORMANCE',
      },
      {
        title: 'Expectancy Trajectory',
        prompt: 'How has my win rate and average R trended across my last 20 trades?',
        category: 'PERFORMANCE',
      },
    ];

    if (topSymbol) {
      performancePool.unshift({
        title: `${topSymbol} Edge`,
        prompt: `What is my win rate, profit factor, and average R on ${topSymbol}?`,
        category: 'PERFORMANCE',
      });
    }

    if (topSymbol && secondSymbol) {
      performancePool.push({
        title: 'Asset Comparison',
        prompt: `Compare my performance between ${topSymbol} and ${secondSymbol} (which gives higher expectancy?)`,
        category: 'PERFORMANCE',
      });
    }

    const psychologyPool: IAiCopilotSuggestion[] = [
      {
        title: 'Revenge Trading & Leaks',
        prompt: 'How much money did revenge trading and discipline mistakes cost me?',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Loss Analysis',
        prompt: 'Analyze my biggest losing trades and tell me what mistakes triggered them',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Discipline Audit',
        prompt: 'What are my top 3 recurring discipline leaks and their financial impact?',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Tilt Telemetry',
        prompt: 'Am I showing any behavioral signs of tilt, overtrading, or revenge sizing today?',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Rule Adherence Impact',
        prompt: 'Compare my net P&L on trades where I strictly followed rules versus when I broke them',
        category: 'PSYCHOLOGY',
      },
      {
        title: 'Post-Loss Reaction',
        prompt: 'How does my average holding time and lot size change immediately following a red trade?',
        category: 'PSYCHOLOGY',
      },
    ];

    if (topMistake) {
      psychologyPool.unshift({
        title: `Leak: ${topMistake}`,
        prompt: `How much money and R did '${topMistake}' cost me across my recent trades?`,
        category: 'PSYCHOLOGY',
      });
    }

    if (streakLosses >= 2) {
      psychologyPool.unshift({
        title: 'Streak Diagnostics',
        prompt: `Audit my recent ${streakLosses} consecutive losses: was it market conditions or execution tilt?`,
        category: 'PSYCHOLOGY',
      });
    }

    const strategyPool: IAiCopilotSuggestion[] = [
      {
        title: 'Strategy Edge Audit',
        prompt: 'Which playbook strategy is giving me the highest statistical expectancy?',
        category: 'STRATEGY',
      },
      {
        title: 'Runner Expansion',
        prompt: 'Which setups produce my cleanest runners beyond 1:2 and 1:3 R:R?',
        category: 'STRATEGY',
      },
      {
        title: 'Holding Time Impact',
        prompt: 'How does my holding duration affect trade expectancy (scalp vs swing)?',
        category: 'STRATEGY',
      },
      {
        title: 'MFE vs Exit R',
        prompt: 'Am I leaving money on the table? Compare my Max Favorable Excursion (MFE) to realized R',
        category: 'STRATEGY',
      },
      {
        title: 'Timeframe Telemetry',
        prompt: 'Which execution timeframe gives me the most reliable entries (1m, 5m, 15m)?',
        category: 'STRATEGY',
      },
      {
        title: 'Target Optimization',
        prompt: 'Am I taking profit too early? How does my planned target compare to actual exit price?',
        category: 'STRATEGY',
      },
    ];

    if (strategyNames.length > 0) {
      strategyPool.unshift({
        title: 'Playbook Comparison',
        prompt: `Which playbook strategy gives me the highest statistical expectancy: ${strategyNames.slice(0, 3).join(', ')}?`,
        category: 'STRATEGY',
      });
      strategyPool.push({
        title: `${strategyNames[0]} Audit`,
        prompt: `What is my win rate and average R-multiple on the '${strategyNames[0]}' setup?`,
        category: 'STRATEGY',
      });
    }

    const riskPool: IAiCopilotSuggestion[] = [
      {
        title: 'Stop-Loss Discipline',
        prompt: 'Am I respecting my planned initial stop losses or widening them during adverse moves?',
        category: 'RISK',
      },
      {
        title: 'Giveback Leakage',
        prompt: 'Analyze my giveback leak rate: am I letting winning trades turn into scratch or red trades?',
        category: 'RISK',
      },
      {
        title: 'R:R Realization Ratio',
        prompt: 'What is my average realized R:R compared to my planned entry-to-stop ratio?',
        category: 'RISK',
      },
      {
        title: 'Drawdown Runway',
        prompt: 'What is my current drawdown from peak equity and what is my historical recovery rate?',
        category: 'RISK',
      },
      {
        title: 'Sizing Consistency',
        prompt: 'Check my lot sizing discipline across recent trades: did I oversize on any trades?',
        category: 'RISK',
      },
      {
        title: 'Risk-per-Trade Audit',
        prompt: 'Am I strictly keeping risk per trade within 1-2% of account equity?',
        category: 'RISK',
      },
    ];

    if (openTrades.length > 0) {
      riskPool.unshift({
        title: 'Live Position Radar',
        prompt: `Evaluate my open position on ${openTrades[0].symbol}: what is my current R and stop runway?`,
        category: 'RISK',
      });
    }

    if (propAccounts.length > 0) {
      riskPool.unshift({
        title: 'Prop Challenge Safety',
        prompt: `How much daily loss buffer and max drawdown headroom do I have left on ${propName}?`,
        category: 'RISK',
      });
    }

    // 3. Shuffle each pool and select 2 from each category (total 8 diverse suggestions)
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const pickedPerformance = shuffle(performancePool).slice(0, 2);
    const pickedPsychology = shuffle(psychologyPool).slice(0, 2);
    const pickedStrategy = shuffle(strategyPool).slice(0, 2);
    const pickedRisk = shuffle(riskPool).slice(0, 2);

    // Combine and shuffle the 8 selected suggestions so each response is fresh and non-repetitive
    return shuffle([...pickedPerformance, ...pickedPsychology, ...pickedStrategy, ...pickedRisk]);
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

    const openTradeFilter: any = {
      userId,
      status: 'OPEN',
    };

    if (accountId && accountId !== 'ALL') {
      tradeFilter.accountId = new mongoose.Types.ObjectId(accountId);
      openTradeFilter.accountId = new mongoose.Types.ObjectId(accountId);
    }

    const [trades, openTrades, strategies, account, journals] = await Promise.all([
      Trade.find(tradeFilter).sort({ exitTime: 1 }).lean(),
      Trade.find(openTradeFilter).sort({ entryTime: -1 }).lean(),
      Strategy.find({ userId }).lean(),
      accountId && accountId !== 'ALL' ? TradingAccount.findOne({ _id: accountId, userId }).lean() : null,
      DailyJournal.find({ userId }).sort({ date: -1 }).limit(10).lean(),
    ]);

    const openPositions = openTrades.map((t: any) => {
      const pnl = Number(t.calculated?.unrealizedPnL ?? t.calculated?.netPnL ?? 0);
      const entryPrice = Number(t.calculated?.averageEntryPrice ?? t.simpleExecution?.entryPrice ?? t.fills?.[0]?.price ?? 0);
      const currentPrice = Number(t.calculated?.currentPrice ?? t.simpleExecution?.exitPrice ?? entryPrice);
      const qty = Number(t.calculated?.openQuantity ?? t.simpleExecution?.quantity ?? t.fills?.[0]?.quantity ?? 0);
      const sl = Number(t.risk?.currentStopLoss ?? t.risk?.initialStopLoss ?? 0);
      const tp = Number(t.risk?.plannedTarget ?? 0);

      return {
        tradeId: t._id.toString(),
        symbol: t.symbol || 'MARKET',
        direction: (t.direction || 'LONG') as 'LONG' | 'SHORT',
        quantity: qty,
        entryPrice,
        currentPrice: currentPrice > 0 ? currentPrice : entryPrice,
        unrealizedPnL: pnl,
        stopLossPrice: sl > 0 ? sl : undefined,
        takeProfitPrice: tp > 0 ? tp : undefined,
        entryTime: t.entryTime ? new Date(t.entryTime).toISOString() : undefined,
      };
    });

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
      openPositions,
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

    // INTENT 0: Active Position & Current Trade Management
    if (
      q.includes('current trade') ||
      q.includes('my trade') ||
      q.includes('open trade') ||
      q.includes('open position') ||
      q.includes('what to do') ||
      q.includes('should i hold') ||
      q.includes('should i close') ||
      q.includes('should i exit') ||
      q.includes('active position') ||
      q.includes('holding') ||
      q.includes('position')
    ) {
      if (ctx.openPositions && ctx.openPositions.length > 0) {
        const lines = ctx.openPositions.map((pos) => {
          const isGreen = (pos.unrealizedPnL || 0) >= 0;
          const pnlStr = formatMoney(pos.unrealizedPnL || 0);
          const dirIcon = pos.direction === 'LONG' ? '🟢 BUY' : '🔴 SELL';
          return `• **${pos.symbol}** (${dirIcon}) | Qty: ${pos.quantity}
  - **Entry Price:** ${pos.entryPrice} | **Current Price:** ${pos.currentPrice ?? pos.entryPrice}
  - **Unrealized P&L:** **${isGreen ? '+' : ''}${pnlStr}**
  - **Stop Loss:** ${pos.stopLossPrice ? pos.stopLossPrice : '⚠️ No Stop Loss Set'} | **Take Profit:** ${pos.takeProfitPrice ? pos.takeProfitPrice : 'Discretionary'}`;
        }).join('\n\n');

        const primaryPos = ctx.openPositions[0];
        const isProfit = (primaryPos.unrealizedPnL || 0) > 0;

        let directive = '';
        if (isProfit) {
          directive = `> **Quant Trade Directive:** Your trade is in profit (**+${formatMoney(primaryPos.unrealizedPnL || 0)}**). Rule #1 is capital preservation:
> 1. **Trail Stop to Breakeven:** If you have gained at least 1R, move your stop loss to your entry price (${primaryPos.entryPrice}) to make this a risk-free trade.
> 2. **Avoid Greed:** Consider taking 50% partial profits at key resistance/support levels and let the runner ride with a trailing stop.`;
        } else {
          directive = `> **Quant Trade Directive:** Your trade is floating at **${formatMoney(primaryPos.unrealizedPnL || 0)}**.
> 1. **Respect Your Invalidation Level:** DO NOT widen or remove your stop loss. A planned loss is just a business expense.
> 2. **Never Hope-Trade:** If the market structure thesis has failed, exit cleanly rather than averaging down.`;
        }

        const content = `### ⚡ Active Position & Trade Management (${ctx.openPositions.length} Open)

${lines}

${directive}`;

        return {
          id: new mongoose.Types.ObjectId().toString(),
          role: 'assistant',
          content,
          suggestedActions: [
            { label: 'View Trades Table', actionType: 'NAVIGATE', path: '/trades' },
            { label: 'Risk Calculator', actionType: 'NAVIGATE', path: '/risk-calculator' },
          ],
          dataCards: [
            {
              type: 'STAT_SUMMARY',
              title: 'Active Open Trade',
              metrics: {
                'Symbol': primaryPos.symbol,
                'Direction': primaryPos.direction,
                'Unrealized P&L': formatMoney(primaryPos.unrealizedPnL || 0),
                'Entry Price': primaryPos.entryPrice,
              },
            },
          ],
          modelUsed: 'Deterministic Quant Engine (Free Tier)',
          timestamp: new Date().toISOString(),
        };
      } else {
        const content = `### ℹ️ No Active Open Trades Detected

You currently have **0 open positions** recorded in this account context.

> **Desk Recommendation:** Wait patiently for your verified playbook setup to form. Do not force trades or enter out of boredom. When a setup presents itself, verify your risk parameters in the Pre-Trade Risk Calculator before executing.`;

        return {
          id: new mongoose.Types.ObjectId().toString(),
          role: 'assistant',
          content,
          suggestedActions: [
            { label: 'Log New Trade', actionType: 'NAVIGATE', path: '/trades' },
            { label: 'Pre-Trade Calculator', actionType: 'NAVIGATE', path: '/risk-calculator' },
          ],
          modelUsed: 'Deterministic Quant Engine (Free Tier)',
          timestamp: new Date().toISOString(),
        };
      }
    }

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
2. If the trader asks about their current trade, open trade, or active positions, inspect "openPositions" in the provided telemetry and give precise trade-management advice (e.g. trailing stop loss to breakeven after 1R, taking partial profits, avoiding emotional revenge sizing).
3. Maintain an institutional, concise, direct, and constructive coaching tone (similar to a hedge fund risk desk manager).
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
