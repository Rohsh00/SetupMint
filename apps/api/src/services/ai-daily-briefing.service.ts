/**
 * SetupMint - Dashboard AI Daily Trading Readiness & Executive Briefing Service
 *
 * Prepares the trader's mindset, capital risk, and edge awareness before each market session:
 * 1. Mindset & Readiness Score (quantifying emotional readiness based on yesterday's performance)
 * 2. Yesterday's Performance & Leak Recap (discipline rating, net P&L, revenge trading flags)
 * 3. Recent High-Edge Setups (identifying which strategies/instruments are performing best)
 * 4. Daily Directives & Focus Rule (one imperative rule to keep the trader disciplined today)
 *
 * Dual-Engine Architecture:
 * - Google Gemini Flash LLM (if key provided)
 * - Deterministic Quantitative Coach Engine (100% Free, Offline, Zero-Cost Fallback)
 */

import mongoose from 'mongoose';
import { IAiDailyBriefing } from '@tradevault/shared';
import { DailyJournal, Trade, User, Strategy } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';

export class AiDailyBriefingService {
  static async getOrGenerateBriefing(params: {
    userId: string | mongoose.Types.ObjectId;
    date?: string; // YYYY-MM-DD
    forceRegenerate?: boolean;
  }): Promise<IAiDailyBriefing> {
    const { userId, forceRegenerate = false } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const todayStr = params.date || new Date().toISOString().slice(0, 10);

    const user = await User.findById(uId).lean();

    // 1. Fetch Yesterday / Previous Active Day's Journal & Trades
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
    const pastJournals = await DailyJournal.find({
      userId: uId,
      date: { $lt: todayStr },
    })
      .sort({ date: -1 })
      .limit(3)
      .lean();

    const lastJournal = pastJournals[0];

    // Fetch last 15 closed trades for recent edge trends
    const recentTrades = await Trade.find({
      userId: uId,
      status: 'CLOSED',
    })
      .sort({ exitTime: -1 })
      .limit(15)
      .lean();

    // Compute recent stats
    let recentWins = 0;
    let recentTotalPnL = 0;
    const symbolMap: Record<string, { wins: number; total: number; pnl: number }> = {};
    const recentMistakes: Record<string, number> = {};

    for (const t of recentTrades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      recentTotalPnL += pnl;
      if (pnl > 0) recentWins++;

      const sym = t.symbol || 'MARKET';
      if (!symbolMap[sym]) symbolMap[sym] = { wins: 0, total: 0, pnl: 0 };
      symbolMap[sym].total++;
      symbolMap[sym].pnl += pnl;
      if (pnl > 0) symbolMap[sym].wins++;

      const mistakes = t.psychology?.mistakes || [];
      for (const m of mistakes) {
        recentMistakes[m] = (recentMistakes[m] || 0) + 1;
      }
    }

    // Identify top symbol with positive expectancy
    let topSymbol = '';
    let topSymbolWinRate = 0;
    for (const [sym, data] of Object.entries(symbolMap)) {
      if (data.total >= 3 && data.pnl > 0) {
        const wr = Math.round((data.wins / data.total) * 100);
        if (wr > topSymbolWinRate) {
          topSymbol = sym;
          topSymbolWinRate = wr;
        }
      }
    }

    const mostCommonLeak = Object.entries(recentMistakes)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // 2. Compute Deterministic Quantitative Baseline Briefing
    const quantBriefing = this.evaluateQuantBriefing({
      date: todayStr,
      lastJournal,
      recentTradesCount: recentTrades.length,
      recentWinRate: recentTrades.length > 0 ? Math.round((recentWins / recentTrades.length) * 100) : 50,
      recentTotalPnL,
      topSymbol,
      topSymbolWinRate,
      mostCommonLeak,
      maxDailyLoss: user?.riskSettings?.maxDailyLoss ?? 10000,
      maxDailyTrades: user?.riskSettings?.maxDailyTrades ?? 4,
    });

    // 3. Try Gemini Flash if Key is Configured
    let activeKey = '';
    if (user?.aiSettings?.geminiApiKey) {
      activeKey = safeDecryptSecret(user.aiSettings.geminiApiKey) || '';
    }
    if (!activeKey && config.geminiApiKey) {
      activeKey = config.geminiApiKey;
    }

    if (activeKey && user?.aiSettings?.enabled !== false) {
      try {
        const geminiResult = await this.synthesizeWithGemini({
          apiKey: activeKey,
          preferredModel: user?.aiSettings?.model,
          quant: quantBriefing,
          lastJournal,
          recentTrades,
          topSymbol,
          mostCommonLeak,
        });

        if (geminiResult) {
          return geminiResult;
        }
      } catch (geminiErr: any) {
        console.warn('[AiDailyBriefingService] Gemini synthesis failed, falling back to Quant Engine:', geminiErr.message);
      }
    }

    return quantBriefing;
  }

  private static evaluateQuantBriefing(params: {
    date: string;
    lastJournal?: any;
    recentTradesCount: number;
    recentWinRate: number;
    recentTotalPnL: number;
    topSymbol?: string;
    topSymbolWinRate?: number;
    mostCommonLeak?: string;
    maxDailyLoss: number;
    maxDailyTrades: number;
  }): IAiDailyBriefing {
    let readinessScore = 85;

    // Adjust readiness based on last session's discipline & outcome
    const lastDiscipline = params.lastJournal?.disciplineRating ?? params.lastJournal?.aiDebrief?.disciplineScore ?? 4;
    const lastPnL = params.lastJournal?.netPnL ?? 0;

    if (lastDiscipline <= 2 || lastPnL < -params.maxDailyLoss * 0.8) {
      readinessScore = 65; // Tilt hangover caution
    } else if (lastDiscipline >= 4 && lastPnL >= 0) {
      readinessScore = 95; // In the zone
    }

    const yesterdayRecap = {
      tradesCount: params.lastJournal?.tradesCount ?? 0,
      netPnL: lastPnL,
      keyLeak: params.lastJournal?.aiDebrief?.leaks?.[0] || params.mostCommonLeak,
      disciplineScore: lastDiscipline,
    };

    let topEdgeInsight = 'Maintain neutral market structure perspective. Wait for your predefined setup trigger.';
    if (params.topSymbol && params.topSymbolWinRate) {
      topEdgeInsight = `Strong recent momentum in ${params.topSymbol} (${params.topSymbolWinRate}% win rate over recent sessions). Prioritize A+ setups in ${params.topSymbol}.`;
    } else if (params.recentWinRate >= 60) {
      topEdgeInsight = `Recent execution win rate is healthy at ${params.recentWinRate}%. Avoid complacency and protect early morning gains.`;
    }

    const dailyDirectives = [
      `Cap total daily executions at maximum ${params.maxDailyTrades} trades to prevent overtrading.`,
      `Strict stop loss discipline: If daily drawdown hits ${params.maxDailyLoss}, shut down terminals immediately.`,
      params.mostCommonLeak
        ? `Primary discipline priority: Guard against "${params.mostCommonLeak}" which has been your most frequent recent leak.`
        : 'Never move your stop loss once an order is filled; let the trade hit either target or invalidation.',
    ];

    const focusRuleForToday = params.lastJournal?.aiDebrief?.ruleForTomorrow ||
      (params.mostCommonLeak
        ? `Zero tolerance for ${params.mostCommonLeak} today. Verify your confluence checklist before placing orders.`
        : 'Accept 1R risk on entry. Trade the plan, not your P&L ticker.');

    return {
      date: params.date,
      readinessScore,
      marketSessionBias: 'NEUTRAL',
      psychologicalState: readinessScore >= 80 ? 'FOCUSED_AND_CENTERED' : 'CAUTIOUS_DISCIPLINE_REQUIRED',
      yesterdayRecap,
      topEdgeInsight,
      dailyDirectives,
      focusRuleForToday,
      isAiGenerated: false,
      modelUsed: 'Quant Engine (Deterministic)',
      generatedAt: new Date().toISOString(),
    };
  }

  private static async synthesizeWithGemini(params: {
    apiKey: string;
    preferredModel?: string;
    quant: IAiDailyBriefing;
    lastJournal?: any;
    recentTrades: any[];
    topSymbol?: string;
    mostCommonLeak?: string;
  }): Promise<IAiDailyBriefing | null> {
    const { apiKey, preferredModel, quant } = params;

    const systemPrompt = `You are SetupMint's Chief Psychological Trading Coach & Desk Risk Officer.
Generate an institutional morning readiness debrief for an active discretionary trader before their session.
Focus on psychology, risk containment, recent leaks, and high-probability edge execution.
Respond strictly in valid JSON matching this schema:
{
  "readinessScore": number (0-100),
  "marketSessionBias": "BULLISH" | "BEARISH" | "NEUTRAL" | "CHOP",
  "psychologicalState": "Short status string (e.g. FOCUSED_AND_CENTERED, CAUTIOUS_DISCIPLINE_REQUIRED)",
  "topEdgeInsight": "2-sentence strategic insight on what setups/symbols are generating edge",
  "dailyDirectives": ["Directive 1", "Directive 2", "Directive 3"],
  "focusRuleForToday": "One powerful, memorable discipline rule for today"
}`;

    const userContent = JSON.stringify({
      quantBaseline: quant,
      yesterdaySummary: quant.yesterdayRecap,
      topSymbol: params.topSymbol,
      mostCommonLeak: params.mostCommonLeak,
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
      const startTime = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: `Generate today's pre-session trading briefing:\n${userContent}` }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);
        if (!response.ok) continue;

        const resJson: any = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);
        const latencyMs = Date.now() - startTime;

        return {
          date: quant.date,
          readinessScore: Number(parsed.readinessScore ?? quant.readinessScore),
          marketSessionBias: parsed.marketSessionBias || quant.marketSessionBias,
          psychologicalState: parsed.psychologicalState || quant.psychologicalState,
          yesterdayRecap: quant.yesterdayRecap,
          topEdgeInsight: parsed.topEdgeInsight || quant.topEdgeInsight,
          dailyDirectives: Array.isArray(parsed.dailyDirectives) && parsed.dailyDirectives.length > 0
            ? parsed.dailyDirectives
            : quant.dailyDirectives,
          focusRuleForToday: parsed.focusRuleForToday || quant.focusRuleForToday,
          isAiGenerated: true,
          modelUsed: model,
          generatedAt: new Date().toISOString(),
          latencyMs,
        };
      } catch {
        clearTimeout(timeout);
      }
    }

    return null;
  }
}
