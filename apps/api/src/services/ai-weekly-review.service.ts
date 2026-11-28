/**
 * SetupMint - AI Weekly Executive Review & Coaching Service
 *
 * Provides institutional end-of-week executive debriefs for discretionary traders:
 * 1. Weekly Performance & Capital Discipline Grade (A+, A, B, C, D, F)
 * 2. Weekly Psychological Leaks & Tilt Diagnosis
 * 3. Best Execution Trait of the Week
 * 4. ONE Recommended Focus Rule for Next Week with psychological reinforcement
 *
 * Dual-Engine Architecture:
 * - Google Gemini Flash LLM (if key provided)
 * - Deterministic Quantitative Edge Engine (100% Free, Offline, Zero-Cost Fallback)
 */

import mongoose from 'mongoose';
import { IAiWeeklySummary, isoWeekToRange } from '@tradevault/shared';
import { WeeklyReview, DailyJournal, Trade, User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiWeeklyReviewService {
  static async getOrGenerateWeeklySummary(params: {
    userId: string | mongoose.Types.ObjectId;
    week: string; // YYYY-Www
    accountId?: string;
    forceRegenerate?: boolean;
  }): Promise<IAiWeeklySummary> {
    const { userId, week, accountId, forceRegenerate = false } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const user = await User.findById(uId).lean();

    // 1. Resolve ISO Week Range
    const range = isoWeekToRange(week);
    const startDate = new Date(`${range.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${range.endDate}T23:59:59.999Z`);

    // 2. Fetch Trades in this ISO Week
    const tradeFilter: any = {
      userId: uId,
      tradeDate: { $gte: startDate, $lte: endDate },
      status: 'CLOSED',
    };
    if (accountId && accountId !== 'ALL') {
      tradeFilter.accountId = accountId;
    }

    const [trades, dailyJournals] = await Promise.all([
      Trade.find(tradeFilter).sort({ entryTime: 1 }).lean(),
      DailyJournal.find({
        userId: uId,
        date: { $gte: range.startDate, $lte: range.endDate },
      }).lean(),
    ]);

    // 3. Compute Weekly Performance Metrics
    const totalTrades = trades.length;
    let netPnL = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let winCount = 0;
    let sumR = 0;

    const mistakeCounts: Record<string, number> = {};
    for (const t of trades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      const r = Number(t.calculated?.realizedRMultiple ?? 0);
      netPnL += pnl;
      sumR += r;

      if (pnl > 0) {
        winCount++;
        grossWin += pnl;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl);
      }

      const mistakes = t.psychology?.mistakes || [];
      for (const m of mistakes) {
        mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
      }
    }

    const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0;
    const profitFactor = grossLoss > 0
      ? Number((grossWin / grossLoss).toFixed(2))
      : grossWin > 0
      ? 999.99
      : 0;

    const avgDiscipline = dailyJournals.length > 0
      ? Math.round(
          dailyJournals.reduce((acc, j) => acc + (j.disciplineRating || 3), 0) / dailyJournals.length
        )
      : 3;

    const mostFrequentMistake = Object.entries(mistakeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // 4. Compute Quantitative Weekly Baseline
    const quantSummary = this.evaluateQuantWeeklySummary({
      week,
      totalTrades,
      netPnL,
      winRate,
      profitFactor,
      avgDiscipline,
      dailyJournalsCount: dailyJournals.length,
      mostFrequentMistake,
    });

    // 5. Try Gemini Flash if Key is Configured
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
          userId: uId,
          preferredModel: user?.aiSettings?.model,
          week,
          quant: quantSummary,
          trades,
          dailyJournals,
          mostFrequentMistake,
        });

        if (geminiResult) {
          return geminiResult;
        }
      } catch (geminiErr: any) {
        console.warn('[AiWeeklyReviewService] Gemini synthesis failed, using Quant Engine:', geminiErr.message);
      }
    }

    return quantSummary;
  }

  private static evaluateQuantWeeklySummary(params: {
    week: string;
    totalTrades: number;
    netPnL: number;
    winRate: number;
    profitFactor: number;
    avgDiscipline: number;
    dailyJournalsCount: number;
    mostFrequentMistake?: string;
  }): IAiWeeklySummary {
    let weeklyGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'B';

    if (params.totalTrades === 0) {
      weeklyGrade = 'B';
    } else if (params.netPnL > 0 && params.avgDiscipline >= 4 && params.profitFactor >= 1.5) {
      weeklyGrade = 'A+';
    } else if (params.netPnL > 0 && params.avgDiscipline >= 3) {
      weeklyGrade = 'A';
    } else if (params.netPnL >= 0) {
      weeklyGrade = 'B';
    } else if (params.avgDiscipline >= 3) {
      weeklyGrade = 'C';
    } else if (params.avgDiscipline >= 2) {
      weeklyGrade = 'D';
    } else {
      weeklyGrade = 'F';
    }

    const executiveSummary = params.totalTrades === 0
      ? `No closed trades recorded in week ${params.week}. Capital was 100% protected.`
      : `Week ${params.week} concluded with ${params.totalTrades} closed trades, generating a Net P&L of ${params.netPnL >= 0 ? '+' : ''}${params.netPnL.toFixed(2)} (${params.winRate}% win rate, ${params.profitFactor} Profit Factor). Average discipline rating across logged sessions was ${params.avgDiscipline}/5.`;

    const capitalDisciplineReview = params.avgDiscipline >= 4
      ? 'Exemplary risk containment. Stop losses were respected and sizing remained consistent across sessions.'
      : 'Capital discipline experienced minor lapses. Ensure losses are cut at predetermined invalidation levels without hesitation.';

    const biggestLeakOfTheWeek = params.mostFrequentMistake
      ? `Primary behavioral leak: "${params.mostFrequentMistake}". Surrendered profits or inflated drawdown occurred due to this execution error.`
      : 'No critical behavioral leak dominated the week. Sizing and risk rules were generally adhered to.';

    const bestExecutionTrait = params.winRate >= 50
      ? 'High-conviction entries aligned with established strategy confluence.'
      : 'Patience in waiting for high-quality market conditions.';

    const recommendedFocusRule = params.mostFrequentMistake
      ? `Zero tolerance for "${params.mostFrequentMistake}" next week. Write it on your desk before Monday's open.`
      : 'Hold winning trades to planned technical target; avoid early premature exits at 0.5R.';

    const coachingAdvice = 'The edge is not in predicting the next candle, but in executing your mathematical plan with complete emotional neutrality. Review your winning trades to reinforce good habits.';

    return {
      week: params.week,
      weeklyGrade,
      executiveSummary,
      capitalDisciplineReview,
      biggestLeakOfTheWeek,
      bestExecutionTrait,
      recommendedFocusRule,
      coachingAdvice,
      isAiGenerated: false,
      modelUsed: 'Quant Engine (Deterministic)',
      generatedAt: new Date().toISOString(),
    };
  }

  private static async synthesizeWithGemini(params: {
    apiKey: string;
    userId?: mongoose.Types.ObjectId;
    preferredModel?: string;
    week: string;
    quant: IAiWeeklySummary;
    trades: any[];
    dailyJournals: any[];
    mostFrequentMistake?: string;
  }): Promise<IAiWeeklySummary | null> {
    const { apiKey, userId, preferredModel, week, quant } = params;

    const systemPrompt = `You are SetupMint's Chief Hedge Fund Risk Officer & Trader Performance Director.
Generate an institutional end-of-week executive performance review for an active discretionary trader.
Grade the week rigorously based on capital discipline, emotional control, and edge execution.
Respond strictly in valid JSON matching this schema:
{
  "weeklyGrade": "A+" | "A" | "B" | "C" | "D" | "F",
  "executiveSummary": "2-3 sentence executive recap of the trading week",
  "capitalDisciplineReview": "Assessment of sizing, stop adherence, and loss limit discipline",
  "biggestLeakOfTheWeek": "The single most damaging execution or psychological mistake",
  "bestExecutionTrait": "The strongest positive execution habit exhibited",
  "recommendedFocusRule": "ONE imperative focus rule for next week",
  "coachingAdvice": "1-2 sentences of direct, high-impact trading wisdom"
}`;

    const userContent = JSON.stringify({
      week,
      totalTrades: params.trades.length,
      quantBaseline: quant,
      mostFrequentMistake: params.mostFrequentMistake,
      dailyJournalsCount: params.dailyJournals.length,
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
      if (userId) {
        AiUsageTrackerService.recordRequest(userId, 'WEEKLY_REVIEW', model).catch(() => {});
      }

      const startTime = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: `Generate weekly performance review for ${week}:\n${userContent}` }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);
        if (!response.ok) {
          if (response.status === 429 && userId) {
            AiUsageTrackerService.recordRateLimit(userId, 'WEEKLY_REVIEW', 'HTTP 429 Weekly Review Rate Limit Exceeded').catch(() => {});
          }
          continue;
        }

        const resJson: any = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);
        const latencyMs = Date.now() - startTime;

        return {
          week,
          weeklyGrade: parsed.weeklyGrade || quant.weeklyGrade,
          executiveSummary: parsed.executiveSummary || quant.executiveSummary,
          capitalDisciplineReview: parsed.capitalDisciplineReview || quant.capitalDisciplineReview,
          biggestLeakOfTheWeek: parsed.biggestLeakOfTheWeek || quant.biggestLeakOfTheWeek,
          bestExecutionTrait: parsed.bestExecutionTrait || quant.bestExecutionTrait,
          recommendedFocusRule: parsed.recommendedFocusRule || quant.recommendedFocusRule,
          coachingAdvice: parsed.coachingAdvice || quant.coachingAdvice,
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
