/**
 * SetupMint - AI Strategy Playbook Auditor & Rule Coach Service
 *
 * Provides institutional audits for Strategy Playbooks:
 * 1. Edge diagnosis (statistical win rate, expectancy, and profit factor health)
 * 2. Winner vs Loser telemetry (confluences, holding times, excursion MAE/MFE)
 * 3. Execution leak identification (common mistakes causing drag on strategy edge)
 * 4. Actionable playbook rule optimizations (tightening stop loss, refining entry confluences)
 *
 * Dual-Engine Architecture:
 * - Google Gemini Flash LLM (if key provided)
 * - Deterministic Quantitative Edge Engine (100% Free, Offline, Zero-Cost Fallback)
 */

import mongoose from 'mongoose';
import { IAiStrategyAudit } from '@tradevault/shared';
import { Strategy, Trade, User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';

export class AiStrategyAuditorService {
  static async auditStrategy(
    userId: string | mongoose.Types.ObjectId,
    strategyId: string | mongoose.Types.ObjectId
  ): Promise<IAiStrategyAudit> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const sId = typeof strategyId === 'string' ? new mongoose.Types.ObjectId(strategyId) : strategyId;

    const [user, strategy] = await Promise.all([
      User.findById(uId).lean(),
      Strategy.findOne({ _id: sId, userId: uId }).lean(),
    ]);

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Load all closed trades tagged with this strategy
    const trades = await Trade.find({
      userId: uId,
      strategyId: sId,
      status: 'CLOSED',
    }).sort({ exitTime: -1 }).lean();

    const totalTrades = trades.length;
    let winCount = 0;
    let lossCount = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let sumR = 0;

    let sumWinnerMae = 0;
    let sumWinnerMfe = 0;
    let sumLoserMae = 0;
    let countWinnerExcursion = 0;
    let countLoserExcursion = 0;

    const winnerConfluences: Record<string, number> = {};
    const loserMistakes: Record<string, number> = {};

    for (const t of trades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      const r = Number(t.calculated?.realizedRMultiple ?? 0);
      sumR += r;

      const exc = t.calculated?.excursion;
      if (pnl > 0) {
        winCount++;
        grossWin += pnl;
        if (exc) {
          sumWinnerMae += Math.abs(Number(exc.maeR ?? 0));
          sumWinnerMfe += Number(exc.mfeR ?? 0);
          countWinnerExcursion++;
        }
        const confs = t.thesis?.confluences || [];
        for (const c of confs) {
          winnerConfluences[c] = (winnerConfluences[c] || 0) + 1;
        }
      } else if (pnl < 0) {
        lossCount++;
        grossLoss += Math.abs(pnl);
        if (exc) {
          sumLoserMae += Math.abs(Number(exc.maeR ?? 0));
          countLoserExcursion++;
        }
        const mistakes = t.psychology?.mistakes || [];
        for (const m of mistakes) {
          loserMistakes[m] = (loserMistakes[m] || 0) + 1;
        }
      }
    }

    const winRate = totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(1)) : 0;
    const profitFactor = grossLoss > 0
      ? Number((grossWin / grossLoss).toFixed(2))
      : grossWin > 0
      ? 999.99
      : 0;
    const avgRealizedR = totalTrades > 0 ? Number((sumR / totalTrades).toFixed(2)) : 0;

    const avgWinnerMae = countWinnerExcursion > 0 ? Number((sumWinnerMae / countWinnerExcursion).toFixed(2)) : 0.4;
    const avgWinnerMfe = countWinnerExcursion > 0 ? Number((sumWinnerMfe / countWinnerExcursion).toFixed(2)) : 2.2;

    const topWinnerConfluences = Object.entries(winnerConfluences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, count]) => `${k} (seen in ${count} winners)`);

    const topLoserMistakes = Object.entries(loserMistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, count]) => `${k} (${count} occurrences)`);

    // Determine statistical edge status
    let edgeStatus: 'STRONG_EDGE' | 'DECAYING_EDGE' | 'NEGATIVE_EDGE' | 'INSUFFICIENT_SAMPLE' = 'INSUFFICIENT_SAMPLE';
    if (totalTrades < 8) {
      edgeStatus = 'INSUFFICIENT_SAMPLE';
    } else if (profitFactor >= 1.5 && winRate >= 45) {
      edgeStatus = 'STRONG_EDGE';
    } else if (profitFactor >= 1.0) {
      edgeStatus = 'DECAYING_EDGE';
    } else {
      edgeStatus = 'NEGATIVE_EDGE';
    }

    // 1. Compute Deterministic Quantitative Baseline
    const quantResult = this.evaluateQuantAudit({
      strategyId: sId.toString(),
      strategyName: strategy.name,
      totalTrades,
      winRate,
      profitFactor,
      avgRealizedR,
      edgeStatus,
      avgWinnerMae,
      avgWinnerMfe,
      topWinnerConfluences,
      topLoserMistakes,
      description: strategy.description,
    });

    // 2. Enhance with Gemini Flash if Key is Configured
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
          strategy,
          quant: quantResult,
          tradesCount: totalTrades,
          winRate,
          profitFactor,
          avgRealizedR,
          topWinnerConfluences,
          topLoserMistakes,
        });

        if (geminiResult) {
          return geminiResult;
        }
      } catch (geminiErr: any) {
        console.warn('[AiStrategyAuditorService] Gemini synthesis failed, using Quant Engine:', geminiErr.message);
      }
    }

    return quantResult;
  }

  private static evaluateQuantAudit(params: {
    strategyId: string;
    strategyName: string;
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    avgRealizedR: number;
    edgeStatus: 'STRONG_EDGE' | 'DECAYING_EDGE' | 'NEGATIVE_EDGE' | 'INSUFFICIENT_SAMPLE';
    avgWinnerMae: number;
    avgWinnerMfe: number;
    topWinnerConfluences: string[];
    topLoserMistakes: string[];
    description?: string;
  }): IAiStrategyAudit {
    const winningTraits = params.topWinnerConfluences.length > 0
      ? params.topWinnerConfluences
      : ['High-volume breakout timing', 'Clean higher-timeframe confluence', 'Patient entry at pullback level'];

    const losingPitfalls = params.topLoserMistakes.length > 0
      ? params.topLoserMistakes
      : ['Premature entry before candle close', 'Widening initial stop loss', 'Exiting winners before planned target'];

    let executiveSummary: string;
    if (params.edgeStatus === 'INSUFFICIENT_SAMPLE') {
      executiveSummary = `Sample size (${params.totalTrades} trades) is too low for high-confidence statistical validation. Continue executing with strict 1R risk until 20+ trades are logged.`;
    } else if (params.edgeStatus === 'STRONG_EDGE') {
      executiveSummary = `Strategy "${params.strategyName}" shows robust institutional edge with a ${params.profitFactor} Profit Factor and ${params.winRate}% win rate across ${params.totalTrades} closed trades. Keep position sizing steady and preserve execution discipline.`;
    } else if (params.edgeStatus === 'DECAYING_EDGE') {
      executiveSummary = `Strategy "${params.strategyName}" is marginally profitable (PF ${params.profitFactor}) but suffers from execution friction. Tightening entry filters could meaningfully boost expectancy.`;
    } else {
      executiveSummary = `Strategy "${params.strategyName}" is currently operating at negative expectancy (PF ${params.profitFactor}, Win Rate ${params.winRate}%). Cease scaling up capital on this playbook until rules are revised.`;
    }

    const maeMfeOptimization = `Winning trades endure an average adverse excursion of only ${params.avgWinnerMae}R before expanding to ${params.avgWinnerMfe}R. If a trade breaches -0.75R without showing momentum, invalidation probability rises sharply.`;

    const recommendedRuleChanges = [
      `Enforce mandatory entry checklist: require at least 2 confirmed technical confluences.`,
      `Trail stop loss to breakeven once price reaches +1.0R to prevent winning trades from round-tripping into losses.`,
      params.topLoserMistakes.length > 0
        ? `Eliminate primary leak: strictly eliminate "${params.topLoserMistakes[0]}" from execution.`
        : 'Never add to losing positions under this playbook.',
    ];

    return {
      strategyId: params.strategyId,
      strategyName: params.strategyName,
      totalTrades: params.totalTrades,
      winRate: params.winRate,
      profitFactor: params.profitFactor,
      avgRealizedR: params.avgRealizedR,
      edgeStatus: params.edgeStatus,
      executiveSummary,
      winningTraits,
      losingPitfalls,
      maeMfeOptimization,
      recommendedRuleChanges,
      isAiGenerated: false,
      modelUsed: 'Quant Engine (Deterministic)',
      generatedAt: new Date().toISOString(),
    };
  }

  private static async synthesizeWithGemini(params: {
    apiKey: string;
    preferredModel?: string;
    strategy: any;
    quant: IAiStrategyAudit;
    tradesCount: number;
    winRate: number;
    profitFactor: number;
    avgRealizedR: number;
    topWinnerConfluences: string[];
    topLoserMistakes: string[];
  }): Promise<IAiStrategyAudit | null> {
    const { apiKey, preferredModel, quant, strategy } = params;

    const systemPrompt = `You are SetupMint's Quantitative Strategy Architect & Hedge Fund Risk Auditor.
Analyze this trading strategy playbook based on historical trade outcomes.
Diagnose true edge, identify winning traits vs losing pitfalls, and recommend concrete rule optimizations.
Respond strictly in valid JSON matching this schema:
{
  "edgeStatus": "STRONG_EDGE" | "DECAYING_EDGE" | "NEGATIVE_EDGE" | "INSUFFICIENT_SAMPLE",
  "executiveSummary": "2-3 sentence institutional edge diagnosis",
  "winningTraits": ["Trait 1", "Trait 2", "Trait 3"],
  "losingPitfalls": ["Pitfall 1", "Pitfall 2", "Pitfall 3"],
  "maeMfeOptimization": "Specific guidance on stop placement and profit-taking based on excursion data",
  "recommendedRuleChanges": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`;

    const userContent = JSON.stringify({
      strategyName: strategy.name,
      description: strategy.description,
      totalTrades: params.tradesCount,
      winRate: `${params.winRate}%`,
      profitFactor: params.profitFactor,
      avgRealizedR: params.avgRealizedR,
      winnerConfluences: params.topWinnerConfluences,
      loserMistakes: params.topLoserMistakes,
      quantBaseline: quant,
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
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: `Audit this strategy playbook:\n${userContent}` }] }],
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
          strategyId: quant.strategyId,
          strategyName: quant.strategyName,
          totalTrades: quant.totalTrades,
          winRate: quant.winRate,
          profitFactor: quant.profitFactor,
          avgRealizedR: quant.avgRealizedR,
          edgeStatus: parsed.edgeStatus || quant.edgeStatus,
          executiveSummary: parsed.executiveSummary || quant.executiveSummary,
          winningTraits: Array.isArray(parsed.winningTraits) && parsed.winningTraits.length > 0
            ? parsed.winningTraits
            : quant.winningTraits,
          losingPitfalls: Array.isArray(parsed.losingPitfalls) && parsed.losingPitfalls.length > 0
            ? parsed.losingPitfalls
            : quant.losingPitfalls,
          maeMfeOptimization: parsed.maeMfeOptimization || quant.maeMfeOptimization,
          recommendedRuleChanges: Array.isArray(parsed.recommendedRuleChanges) && parsed.recommendedRuleChanges.length > 0
            ? parsed.recommendedRuleChanges
            : quant.recommendedRuleChanges,
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
