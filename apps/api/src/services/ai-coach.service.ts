/**
 * SetupMint - Post-Session AI Trading Coach Service
 *
 * Provides institutional post-session performance audits and psychological debriefs.
 * Built on a dual-engine architecture:
 * 1. Deterministic Quantitative Coach Engine (100% Free, Offline, Zero-Cost)
 * 2. Google Gemini Flash LLM Synthesis (Free Tier via Google AI Studio)
 */

import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { IAiCoachDebrief } from '@tradevault/shared';
import { DailyJournal, Trade, User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';

interface ISessionAnalysisInput {
  date: string;
  trades: any[];
  userRiskSettings?: {
    maxDailyLoss?: number;
    maxDailyTrades?: number;
    revengeTradingMinutes?: number;
  };
  journalNotes?: string;
  emotionalState?: string;
}

export class AiCoachService {
  /**
   * Generates or fetches an AI Coach debrief for a specific trading day.
   */
  static async getOrGenerateDebrief(params: {
    userId: string | mongoose.Types.ObjectId;
    date: string;
    scopeKey?: string;
    forceRegenerate?: boolean;
  }): Promise<IAiCoachDebrief> {
    const { userId, date, scopeKey = 'ALL', forceRegenerate = false } = params;

    // 1. Check existing journal entry for cached debrief if not forced
    if (!forceRegenerate) {
      const existingJournal = await DailyJournal.findOne({
        userId,
        date,
        $or: [{ scopeKey }, { scopeKey: 'ALL' }],
      }).lean();

      if (existingJournal?.aiDebrief) {
        return existingJournal.aiDebrief;
      }
    }

    // 2. Load trades for the target date
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const tradeFilter: any = {
      userId,
      tradeDate: { $gte: startOfDay, $lte: endOfDay },
    };

    const trades = await Trade.find(tradeFilter).sort({ entryTime: 1 }).lean();

    // 3. Load user settings
    const user = await User.findById(userId).lean();

    // 4. Generate Debrief
    const debrief = await this.generateDebrief({
      date,
      trades,
      userRiskSettings: user?.riskSettings,
      journalNotes: undefined,
      emotionalState: undefined,
      user,
    });

    // 5. Persist debrief onto DailyJournal for fast retrieval
    try {
      await DailyJournal.findOneAndUpdate(
        { userId, date, scopeKey },
        {
          $set: {
            aiDebrief: debrief,
            scopeKey,
          },
        },
        { upsert: true, new: true }
      );
    } catch (saveErr: any) {
      console.warn(`[AiCoachService] Failed to cache debrief to DailyJournal:`, saveErr.message);
    }

    return debrief;
  }

  /**
   * Generates a complete debrief using the deterministic quant engine,
   * enhanced with Google Gemini Flash LLM if an API key is available.
   */
  static async generateDebrief(input: ISessionAnalysisInput & { user?: any }): Promise<IAiCoachDebrief> {
    const { date, trades, userRiskSettings, user } = input;

    // Run Deterministic Quantitative Analysis
    const quantAnalysis = this.analyzeQuantitativeMetrics(date, trades, userRiskSettings);

    // Check for Gemini API key
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    // If no key or AI disabled, return deterministic quant debrief immediately
    if (!geminiApiKey || user?.aiSettings?.enabled === false) {
      return quantAnalysis;
    }

    // Call Gemini API free tier
    try {
      const llmDebrief = await this.callGeminiSynthesis(geminiApiKey, quantAnalysis, trades);
      if (llmDebrief) {
        return llmDebrief;
      }
    } catch (apiErr: any) {
      console.warn(`[AiCoachService] Gemini synthesis failed; falling back to Quant Engine:`, apiErr.message);
    }

    return quantAnalysis;
  }

  /**
   * Deterministic Quantitative Coach Engine (100% Free, Offline, Mathematical Precision)
   */
  public static analyzeQuantitativeMetrics(
    date: string,
    trades: any[],
    userRiskSettings?: {
      maxDailyLoss?: number;
      maxDailyTrades?: number;
      revengeTradingMinutes?: number;
    }
  ): IAiCoachDebrief {
    if (!trades || trades.length === 0) {
      return {
        date,
        verdict: 'NO_TRADING_ACTIVITY',
        disciplineScore: 5,
        summary: 'No trades were executed on this calendar day. Capital and psychological stamina were fully preserved.',
        strengths: ['Patience to wait for high-probability market conditions', 'Zero capital drawdown risked'],
        leaks: [],
        ruleForTomorrow: 'Maintain strict setup criteria and trade only when high-probability edge aligns with your playbook.',
        isAiGenerated: false,
        modelUsed: 'Quant Engine (Deterministic)',
        generatedAt: new Date().toISOString(),
      };
    }

    const closedTrades = trades.filter((t) => t.status === 'CLOSED');
    const winningTrades = closedTrades.filter((t) => (t.calculated?.netPnL || 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.calculated?.netPnL || 0) < 0);
    const totalNetPnL = closedTrades.reduce((sum, t) => sum + (t.calculated?.netPnL || 0), 0);
    const totalR = closedTrades.reduce((sum, t) => sum + (t.calculated?.realizedRMultiple ?? 0), 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    const strengths: string[] = [];
    const leaks: string[] = [];

    // 1. Giveback & Excursion Analysis
    let totalSurrenderedR = 0;
    let worstGivebackTrade: any = null;

    for (const t of closedTrades) {
      const maxFavorableR = t.calculated?.excursion?.maxFavorableR ?? t.calculated?.liveMfeSummary?.peakMfeR ?? 0;
      const realizedR = t.calculated?.realizedRMultiple ?? 0;

      // If trade reached >= +1.0R but exited at <= +0.3R or at a loss
      if (maxFavorableR >= 1.0 && realizedR <= 0.3) {
        const surrendered = Math.max(0, maxFavorableR - realizedR);
        totalSurrenderedR += surrendered;
        if (!worstGivebackTrade || surrendered > (worstGivebackTrade.surrendered || 0)) {
          worstGivebackTrade = { symbol: t.symbol, maxFavorableR, realizedR, surrendered };
        }
      }
    }

    if (worstGivebackTrade && worstGivebackTrade.surrendered >= 1.0) {
      leaks.push(
        `Surrendered +${worstGivebackTrade.maxFavorableR.toFixed(1)}R peak gain on ${worstGivebackTrade.symbol} to exit at ${worstGivebackTrade.realizedR.toFixed(1)}R.`
      );
    } else if (totalR > 0) {
      strengths.push(`Captured positive expectancy (+${totalR.toFixed(2)}R) with controlled profit retention.`);
    }

    // 2. Position Sizing & Revenge / Martingale Detection
    let hasMartingale = false;
    let hasRapidReentry = false;
    const revengeThresholdMins = userRiskSettings?.revengeTradingMinutes || 15;

    for (let i = 1; i < trades.length; i++) {
      const prevTrade = trades[i - 1];
      const currTrade = trades[i];

      const prevPnL = prevTrade.calculated?.netPnL ?? 0;
      if (prevPnL < 0) {
        // Check sizing escalation
        const prevQty = prevTrade.simpleExecution?.quantity ?? prevTrade.calculated?.closedQuantity ?? 1;
        const currQty = currTrade.simpleExecution?.quantity ?? currTrade.calculated?.closedQuantity ?? 1;

        if (currQty >= prevQty * 1.5 && prevQty > 0) {
          hasMartingale = true;
          leaks.push(
            `Escalated position size ${(currQty / prevQty).toFixed(1)}x on ${currTrade.symbol} immediately after a losing trade on ${prevTrade.symbol} (Martingale tilt).`
          );
        }

        // Check rapid re-entry
        if (prevTrade.exitTime && currTrade.entryTime) {
          const prevExit = new Date(prevTrade.exitTime).getTime();
          const currEntry = new Date(currTrade.entryTime).getTime();
          const diffMinutes = (currEntry - prevExit) / (1000 * 60);

          if (diffMinutes >= 0 && diffMinutes <= revengeThresholdMins) {
            hasRapidReentry = true;
            leaks.push(
              `Re-entered market within ${Math.round(diffMinutes)} minutes of a stopped-out trade without mental reset.`
            );
          }
        }
      }
    }

    if (!hasMartingale && !hasRapidReentry && closedTrades.length > 1) {
      strengths.push('Strict position sizing stability maintained across consecutive fills with zero Martingale escalation.');
    }

    // 3. Trade Frequency & Daily Loss Cap
    const maxDailyTrades = userRiskSettings?.maxDailyTrades || 5;
    const isOvertrading = trades.length > maxDailyTrades;
    if (isOvertrading) {
      leaks.push(`Exceeded maximum daily trade cap (${trades.length} trades taken vs limit of ${maxDailyTrades}).`);
    } else {
      strengths.push(`Respected daily volume cap (${trades.length}/${maxDailyTrades} trades).`);
    }

    const maxDailyLoss = userRiskSettings?.maxDailyLoss;
    const isLossBreached = maxDailyLoss && maxDailyLoss > 0 && Math.abs(totalNetPnL) >= maxDailyLoss && totalNetPnL < 0;
    if (isLossBreached) {
      leaks.push(`Breached maximum daily loss limit (${totalNetPnL.toFixed(2)} vs cap of -${maxDailyLoss}).`);
    }

    // 4. Determine Discipline Score & Verdict
    let disciplineScore = 5;
    let verdict = 'EXEMPLARY_DISCIPLINE';

    if (isLossBreached || hasMartingale) {
      disciplineScore = 1;
      verdict = 'CRITICAL_TILT_BREACH';
    } else if (hasRapidReentry || isOvertrading) {
      disciplineScore = 2;
      verdict = 'REVENGE_OR_OVERTRADING';
    } else if (leaks.length > 0 || totalSurrenderedR >= 1.5) {
      disciplineScore = 3;
      verdict = 'RULE_DRIFT_AND_GIVEBACK';
    } else if (totalNetPnL < 0) {
      disciplineScore = 4;
      verdict = 'CONTROLLED_DEFENSIVE_EXECUTION';
    } else {
      disciplineScore = 5;
      verdict = 'EXEMPLARY_EDGE_MONETIZATION';
    }

    // 5. Generate Rule for Tomorrow
    let ruleForTomorrow = 'Maintain strict adherence to high-probability playbook setups.';
    if (hasMartingale) {
      ruleForTomorrow = 'Enforce hard 1% lot size cap. Never increase position size following a loss under any circumstances.';
    } else if (hasRapidReentry) {
      ruleForTomorrow = 'Mandatory 20-minute screen break after any stop loss exit before re-evaluating market bias.';
    } else if (worstGivebackTrade && worstGivebackTrade.surrendered >= 1.0) {
      ruleForTomorrow = 'Lock breakeven stop loss immediately upon reaching +1.0R and scale 50% partial at +2.0R.';
    } else if (isOvertrading) {
      ruleForTomorrow = `Strict 3-trade hard limit tomorrow. Shut down the terminal once 3 trades are completed.`;
    } else if (totalR > 1.5) {
      ruleForTomorrow = 'Stay humble and avoid euphoria. Start tomorrow with standard risk and wait patiently for valid setups.';
    }

    // 6. Formulate Executive Summary
    let summary = '';
    if (disciplineScore >= 4) {
      summary = `Disciplined session across ${trades.length} trades (${winningTrades.length}W / ${losingTrades.length}L). Total realized: ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R. Risk parameters and position sizing remained tightly managed.`;
    } else if (disciplineScore === 3) {
      summary = `Mixed execution with ${trades.length} trades. While setups showed validity, performance was hindered by profit givebacks or minor rule drift. Net realized: ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R.`;
    } else {
      summary = `Challenging psychological session with clear discipline leaks detected. Noticeable sizing fluctuations or rapid re-entries occurred following market friction. Immediate focus required on reset protocols.`;
    }

    return {
      date,
      verdict,
      disciplineScore,
      summary,
      strengths: strengths.slice(0, 3),
      leaks: leaks.slice(0, 3),
      ruleForTomorrow,
      isAiGenerated: false,
      modelUsed: 'Quant Engine (Deterministic)',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calls Google Gemini Flash Free Tier to synthesize the quantitative session data
   * into an institutional mentor debrief.
   */
  private static async callGeminiSynthesis(
    apiKey: string,
    quant: IAiCoachDebrief,
    trades: any[]
  ): Promise<IAiCoachDebrief | null> {
    const tradeTelemetry = trades.map((t, idx) => ({
      index: idx + 1,
      symbol: t.symbol,
      direction: t.direction,
      netPnL: t.calculated?.netPnL ?? 0,
      realizedR: t.calculated?.realizedRMultiple ?? 0,
      maxFavorableR: t.calculated?.excursion?.maxFavorableR ?? t.calculated?.liveMfeSummary?.peakMfeR ?? 0,
      mistakes: t.psychology?.mistakes ?? [],
    }));

    const systemPrompt = `You are the SetupMint Institutional AI Trading Coach, a seasoned quantitative risk manager and trading psychologist (inspired by Mark Douglas and Jared Tendler).
Your task is to analyze the day's quantitative trading telemetry and generate a sharp, objective post-session debrief.

Return ONLY a valid JSON object matching this schema:
{
  "verdict": "string (Short uppercase phrase, e.g. DISCIPLINED_DEFENSE, CRITICAL_TILT_BREACH, PROFIT_GIVEBACK_DRIFT, OPTIMAL_FLOW)",
  "disciplineScore": number (Integer from 1 to 5),
  "summary": "string (Concise 2-3 sentence executive review. Direct, analytical, zero fluff.)",
  "strengths": ["string", "string"] (Max 3 concise bullet points of positive execution discipline),
  "leaks": ["string", "string"] (Max 3 concise bullet points of financial or psychological leaks),
  "ruleForTomorrow": "string (1 non-negotiable, punchy, concrete rule for tomorrow)"
}`;

    const userContent = JSON.stringify({
      date: quant.date,
      deterministicMetrics: {
        disciplineScore: quant.disciplineScore,
        quantVerdict: quant.verdict,
        observedStrengths: quant.strengths,
        observedLeaks: quant.leaks,
      },
      trades: tradeTelemetry,
    });

    // We use gemini-2.5-flash or gemini-1.5-flash endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [{ text: `Analyze this trading session:\n${userContent}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // If 2.5-flash is not available, try 1.5-flash fallback
        if (response.status === 404) {
          return await this.callGeminiFallback15(apiKey, systemPrompt, userContent, quant);
        }
        return null;
      }

      const resJson: any = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);

      return {
        date: quant.date,
        verdict: String(parsed.verdict || quant.verdict).toUpperCase(),
        disciplineScore: Math.min(5, Math.max(1, Number(parsed.disciplineScore || quant.disciplineScore))),
        summary: String(parsed.summary || quant.summary),
        strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths.slice(0, 3) : quant.strengths,
        leaks: Array.isArray(parsed.leaks) ? parsed.leaks.slice(0, 3) : quant.leaks,
        ruleForTomorrow: String(parsed.ruleForTomorrow || quant.ruleForTomorrow),
        isAiGenerated: true,
        modelUsed: 'gemini-2.5-flash',
        generatedAt: new Date().toISOString(),
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Fallback to gemini-1.5-flash if 2.5-flash is unavailable.
   */
  private static async callGeminiFallback15(
    apiKey: string,
    systemPrompt: string,
    userContent: string,
    quant: IAiCoachDebrief
  ): Promise<IAiCoachDebrief | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${systemPrompt}\n\nSession Data:\n${userContent}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) return null;
      const resJson: any = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      return {
        date: quant.date,
        verdict: String(parsed.verdict || quant.verdict).toUpperCase(),
        disciplineScore: Math.min(5, Math.max(1, Number(parsed.disciplineScore || quant.disciplineScore))),
        summary: String(parsed.summary || quant.summary),
        strengths: Array.isArray(parsed.strengths) && parsed.strengths.length > 0 ? parsed.strengths.slice(0, 3) : quant.strengths,
        leaks: Array.isArray(parsed.leaks) ? parsed.leaks.slice(0, 3) : quant.leaks,
        ruleForTomorrow: String(parsed.ruleForTomorrow || quant.ruleForTomorrow),
        isAiGenerated: true,
        modelUsed: 'gemini-1.5-flash',
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

