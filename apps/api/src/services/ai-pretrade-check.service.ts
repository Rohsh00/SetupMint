/**
 * SetupMint - Pre-Trade AI Sanity & Discipline Check Service
 *
 * Evaluates trade parameters BEFORE execution:
 * 1. Risk-to-Reward ratio vs historical setup expectancy
 * 2. Trader tilt & revenge-trading detection (consecutive losses today, recent loss cooldown)
 * 3. Daily loss limit headroom & risk budget compliance
 * 4. Historical edge for the specific symbol and strategy
 * 5. Actionable pre-trade checklist (e.g. entry confirmation, sizing discipline)
 *
 * Dual-Engine Architecture:
 * - Google Gemini Flash LLM (if key provided)
 * - Deterministic Quantitative Edge Engine (100% Free, Offline, Zero-Cost Fallback)
 */

import mongoose from 'mongoose';
import { IAiPreTradeCheckInput, IAiPreTradeCheckResult } from '@tradevault/shared';
import { Trade, User, Strategy, TradingAccount } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiPreTradeCheckService {
  static async checkPreTrade(
    userId: string | mongoose.Types.ObjectId,
    input: IAiPreTradeCheckInput
  ): Promise<IAiPreTradeCheckResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const [user, strategy, account] = await Promise.all([
      User.findById(uId).lean(),
      input.strategyId ? Strategy.findOne({ _id: input.strategyId, userId: uId }).lean() : null,
      input.accountId ? TradingAccount.findOne({ _id: input.accountId, userId: uId }).lean() : null,
    ]);

    // 1. Calculate Proposed Risk / Reward Metrics
    const entry = Number(input.entryPrice || 0);
    const stop = Number(input.stopLossPrice || 0);
    const target = input.targetPrice ? Number(input.targetPrice) : null;
    const direction = (input.direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';

    const riskPoints = Math.abs(entry - stop);
    const rewardPoints = target ? Math.abs(target - entry) : 0;
    const riskRewardRatio = riskPoints > 0 && rewardPoints > 0 ? Number((rewardPoints / riskPoints).toFixed(2)) : 0;

    // 2. Fetch Today's Session Activity (for tilt and streak detection)
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    const todayFilter: any = {
      userId: uId,
      tradeDate: { $gte: startOfToday },
      status: 'CLOSED',
    };
    if (input.accountId) {
      todayFilter.accountId = input.accountId;
    }

    const todayTrades = await Trade.find(todayFilter).sort({ exitTime: -1 }).lean();

    let netPnLToday = 0;
    let consecutiveLosses = 0;
    let lastTradeLossTime: Date | null = null;

    for (let i = 0; i < todayTrades.length; i++) {
      const pnl = Number(todayTrades[i].calculated?.netPnL ?? 0);
      netPnLToday += pnl;

      if (i === 0 && pnl < 0 && todayTrades[i].exitTime) {
        lastTradeLossTime = new Date(todayTrades[i].exitTime as unknown as string | number | Date);
      }
    }

    // Calculate current losing streak
    for (const t of todayTrades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      if (pnl < 0) {
        consecutiveLosses++;
      } else if (pnl > 0) {
        break;
      }
    }

    const maxDailyLoss = Number(
      account?.riskRules?.maxDailyLoss ??
      (account as any)?.propFirm?.ruleSetOverrides?.dailyLoss?.limitAmount ??
      (user as any)?.riskSettings?.maxDailyLoss ??
      10000
    );
    const dailyLossRemaining = Math.max(0, maxDailyLoss + netPnLToday);
    const dailyLossLimitBreached = netPnLToday <= -maxDailyLoss;

    // Revenge trading window: trade taken within 20 mins of a loss
    const minutesSinceLastLoss = lastTradeLossTime
      ? Math.floor((now.getTime() - lastTradeLossTime.getTime()) / 60000)
      : 999;
    const isRevengeDanger = minutesSinceLastLoss < 20;

    // 3. Fetch Historical Edge on this Symbol & Strategy
    const historyFilter: any = {
      userId: uId,
      status: 'CLOSED',
      symbol: (input.symbol || '').toUpperCase(),
    };
    if (input.strategyId) {
      historyFilter.strategyId = input.strategyId;
    }

    const historicalTrades = await Trade.find(historyFilter)
      .select('calculated.netPnL calculated.realizedRMultiple psychology.mistakes')
      .limit(100)
      .lean();

    const sampleSize = historicalTrades.length;
    let winCount = 0;
    let totalWinsPnL = 0;
    let totalLossesPnL = 0;
    let sumR = 0;
    const mistakeMap: Record<string, number> = {};

    for (const ht of historicalTrades) {
      const pnl = Number(ht.calculated?.netPnL ?? 0);
      const r = Number(ht.calculated?.realizedRMultiple ?? 0);
      sumR += r;

      if (pnl > 0) {
        winCount++;
        totalWinsPnL += pnl;
      } else if (pnl < 0) {
        totalLossesPnL += Math.abs(pnl);
      }

      const mistakes = ht.psychology?.mistakes || [];
      for (const m of mistakes) {
        mistakeMap[m] = (mistakeMap[m] || 0) + 1;
      }
    }

    const winRate = sampleSize > 0 ? Number(((winCount / sampleSize) * 100).toFixed(1)) : 50;
    const profitFactor = totalLossesPnL > 0
      ? Number((totalWinsPnL / totalLossesPnL).toFixed(2))
      : totalWinsPnL > 0
      ? 999.99
      : 1.0;
    const avgR = sampleSize > 0 ? Number((sumR / sampleSize).toFixed(2)) : 1.0;

    const frequentMistakes = Object.entries(mistakeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    // 4. Run Deterministic Quantitative Check
    const quantResult = this.evaluateQuantPreTrade({
      symbol: (input.symbol || '').toUpperCase(),
      direction,
      entry,
      stop,
      target,
      riskRewardRatio,
      todayCount: todayTrades.length,
      netPnLToday,
      consecutiveLosses,
      dailyLossRemaining,
      dailyLossLimitBreached,
      isRevengeDanger,
      minutesSinceLastLoss,
      sampleSize,
      winRate,
      profitFactor,
      avgR,
      frequentMistakes,
      strategyName: strategy?.name,
      userRiskMaxPercent: user?.riskSettings?.maxRiskPerTradePercent ?? 2.0,
      plannedRiskPercent: input.riskPercent,
    });

    // 5. Enhance with Google Gemini Flash if Key is Configured
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
          input,
          quant: quantResult,
          todayCount: todayTrades.length,
          netPnLToday,
          consecutiveLosses,
          isRevengeDanger,
          minutesSinceLastLoss,
          sampleSize,
          winRate,
          profitFactor,
          avgR,
          strategyName: strategy?.name,
        });

        if (geminiResult) {
          return geminiResult;
        }
      } catch (geminiErr: any) {
        console.warn('[AiPreTradeCheckService] Gemini synthesis failed, falling back to Quant Engine:', geminiErr.message);
      }
    }

    return quantResult;
  }

  /**
   * Deterministic institutional quant logic
   */
  private static evaluateQuantPreTrade(params: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry: number;
    stop: number;
    target: number | null;
    riskRewardRatio: number;
    todayCount: number;
    netPnLToday: number;
    consecutiveLosses: number;
    dailyLossRemaining: number;
    dailyLossLimitBreached: boolean;
    isRevengeDanger: boolean;
    minutesSinceLastLoss: number;
    sampleSize: number;
    winRate: number;
    profitFactor: number;
    avgR: number;
    frequentMistakes: string[];
    strategyName?: string;
    userRiskMaxPercent: number;
    plannedRiskPercent?: number;
  }): IAiPreTradeCheckResult {
    const keyChecks: Array<{ text: string; passed: boolean; severity: 'INFO' | 'WARNING' | 'CRITICAL' }> = [];
    let edgeScore = 75;

    // Check 1: Stop Loss Valid
    const hasValidStop = params.stop > 0 && (
      (params.direction === 'LONG' && params.stop < params.entry) ||
      (params.direction === 'SHORT' && params.stop > params.entry)
    );
    if (!hasValidStop) {
      keyChecks.push({
        text: 'Initial Stop Loss must be logically placed behind entry invalidation.',
        passed: false,
        severity: 'CRITICAL',
      });
      edgeScore -= 40;
    } else {
      keyChecks.push({
        text: `Stop loss properly set at ${params.stop} (${params.direction === 'LONG' ? 'below' : 'above'} entry).`,
        passed: true,
        severity: 'INFO',
      });
    }

    // Check 2: Risk-to-Reward Ratio
    if (params.target) {
      if (params.riskRewardRatio >= 1.5) {
        keyChecks.push({
          text: `Favorable Risk-to-Reward of 1:${params.riskRewardRatio} (meets 1.5R minimum edge standard).`,
          passed: true,
          severity: 'INFO',
        });
        edgeScore += 10;
      } else {
        keyChecks.push({
          text: `Sub-optimal Risk-to-Reward of 1:${params.riskRewardRatio}. Aim for at least 1:1.5R to maintain mathematical expectancy.`,
          passed: false,
          severity: 'WARNING',
        });
        edgeScore -= 15;
      }
    } else {
      keyChecks.push({
        text: 'No formal target price defined. Ensure an exit rule or scaling plan is active.',
        passed: true,
        severity: 'INFO',
      });
    }

    // Check 3: Daily Loss Limit
    if (params.dailyLossLimitBreached) {
      keyChecks.push({
        text: 'Maximum Daily Loss Limit already breached today. All new entries should be halted!',
        passed: false,
        severity: 'CRITICAL',
      });
      edgeScore -= 50;
    } else {
      keyChecks.push({
        text: `Daily risk buffer intact. You have room for controlled execution today.`,
        passed: true,
        severity: 'INFO',
      });
    }

    // Check 4: Tilt / Consecutive Loss Check
    let tiltRisk: 'LOW' | 'MODERATE' | 'CRITICAL' = 'LOW';
    if (params.consecutiveLosses >= 3 || params.dailyLossLimitBreached) {
      tiltRisk = 'CRITICAL';
      keyChecks.push({
        text: `HIGH TILT WARNING: You have suffered ${params.consecutiveLosses} consecutive losses today. High probability of revenge trading!`,
        passed: false,
        severity: 'CRITICAL',
      });
      edgeScore -= 35;
    } else if (params.consecutiveLosses === 2 || params.isRevengeDanger) {
      tiltRisk = 'MODERATE';
      keyChecks.push({
        text: params.isRevengeDanger
          ? `Last loss occurred ${params.minutesSinceLastLoss} mins ago. Institutional rule: step away for 20 mins before re-entering.`
          : `2 consecutive losses today. Size down by 50% to protect psychological capital.`,
        passed: false,
        severity: 'WARNING',
      });
      edgeScore -= 15;
    } else {
      keyChecks.push({
        text: 'Psychological tilt indicators are normal. No signs of overtrading or revenge trading.',
        passed: true,
        severity: 'INFO',
      });
    }

    // Check 5: Historical Edge
    if (params.sampleSize >= 5) {
      if (params.winRate >= 50 && params.profitFactor >= 1.3) {
        keyChecks.push({
          text: `Proven Historical Edge: ${params.symbol} has a ${params.winRate}% win rate and ${params.profitFactor} Profit Factor across ${params.sampleSize} recorded trades.`,
          passed: true,
          severity: 'INFO',
        });
        edgeScore += 10;
      } else if (params.profitFactor < 1.0) {
        keyChecks.push({
          text: `Historical Caution: ${params.symbol} currently has a negative historical expectancy (${params.profitFactor} PF). Require strict confluence!`,
          passed: false,
          severity: 'WARNING',
        });
        edgeScore -= 15;
      }
    }

    edgeScore = Math.max(5, Math.min(99, edgeScore));

    // Determine Verdict
    let verdict: 'APPROVED_HIGH_EDGE' | 'PROCEED_WITH_DISCIPLINE' | 'WARNING_HIGH_RISK';
    let verdictTitle: string;
    let summary: string;

    if (tiltRisk === 'CRITICAL' || !hasValidStop || params.dailyLossLimitBreached) {
      verdict = 'WARNING_HIGH_RISK';
      verdictTitle = 'HALT: High Risk / Discipline Warning';
      summary = `Execution not recommended. This setup violates core risk boundaries (Stop Loss placement, Daily Loss Limit, or elevated Tilt Risk from ${params.consecutiveLosses} losses today). Protect your capital.`;
    } else if (edgeScore >= 75 && params.riskRewardRatio >= 1.5) {
      verdict = 'APPROVED_HIGH_EDGE';
      verdictTitle = 'APPROVED: High Edge Setup';
      summary = `Strong execution setup. Stop loss is properly defined, Risk-to-Reward (1:${params.riskRewardRatio}) meets your edge threshold, and psychological indicators are clear. Execute without hesitation.`;
    } else {
      verdict = 'PROCEED_WITH_DISCIPLINE';
      verdictTitle = 'CAUTION: Proceed with Discipline';
      summary = `Acceptable setup, but watch your risk. Ensure you wait for full candlestick trigger confirmation and hold to planned target rather than exiting prematurely.`;
    }

    const ruleReminder = params.frequentMistakes.length > 0
      ? `Watch out for your most common historical leak on ${params.symbol}: "${params.frequentMistakes[0]}".`
      : 'Rule for this trade: Accept the 1R risk before entering; never move your stop loss.';

    return {
      verdict,
      verdictTitle,
      summary,
      riskRewardRatio: params.riskRewardRatio,
      edgeScore,
      tiltRisk,
      todayContext: {
        tradesCountToday: params.todayCount,
        netPnLToday: params.netPnLToday,
        consecutiveLosses: params.consecutiveLosses,
        dailyLossRemaining: params.dailyLossRemaining,
        dailyLossLimitBreached: params.dailyLossLimitBreached,
      },
      historicalEdge: {
        sampleSize: params.sampleSize,
        winRate: params.winRate,
        profitFactor: params.profitFactor,
        avgR: params.avgR,
        frequentMistakes: params.frequentMistakes,
      },
      keyChecks,
      ruleReminder,
      isAiGenerated: false,
      modelUsed: 'Quant Engine (Deterministic)',
    };
  }

  /**
   * Google Gemini Flash synthesis for nuanced coaching advice
   */
  private static async synthesizeWithGemini(params: {
    apiKey: string;
    userId?: mongoose.Types.ObjectId;
    preferredModel?: string;
    input: IAiPreTradeCheckInput;
    quant: IAiPreTradeCheckResult;
    todayCount: number;
    netPnLToday: number;
    consecutiveLosses: number;
    isRevengeDanger: boolean;
    minutesSinceLastLoss: number;
    sampleSize: number;
    winRate: number;
    profitFactor: number;
    avgR: number;
    strategyName?: string;
  }): Promise<IAiPreTradeCheckResult | null> {
    const { apiKey, userId, preferredModel, input, quant } = params;

    const systemPrompt = `You are SetupMint's Pre-Trade Risk & Edge Coach for professional discretionary traders.
Your mission is to audit a trader's proposed trade parameters BEFORE entry.
Evaluate risk-to-reward ratio, tilt state, streak, and historical edge.
Respond strictly in valid JSON format matching this schema:
{
  "verdict": "APPROVED_HIGH_EDGE" | "PROCEED_WITH_DISCIPLINE" | "WARNING_HIGH_RISK",
  "verdictTitle": "Short powerful header (max 6 words)",
  "summary": "Crisp 2-sentence institutional trade assessment",
  "edgeScore": number (0-100),
  "tiltRisk": "LOW" | "MODERATE" | "CRITICAL",
  "ruleReminder": "1 punchy psychological imperative for this exact trade",
  "keyChecks": [
    { "text": "Specific pre-trade check", "passed": true|false, "severity": "INFO"|"WARNING"|"CRITICAL" }
  ]
}`;

    const userContent = JSON.stringify({
      proposedTrade: {
        symbol: input.symbol,
        direction: input.direction,
        entryPrice: input.entryPrice,
        stopLossPrice: input.stopLossPrice,
        targetPrice: input.targetPrice,
        riskRewardRatio: quant.riskRewardRatio,
        strategy: params.strategyName || 'Discretionary',
      },
      sessionContext: {
        tradesToday: params.todayCount,
        netPnLToday: params.netPnLToday,
        consecutiveLosses: params.consecutiveLosses,
        isRevengeTradingDanger: params.isRevengeDanger,
        minutesSinceLastLoss: params.minutesSinceLastLoss,
      },
      historicalEdge: {
        sampleSize: params.sampleSize,
        winRate: `${params.winRate}%`,
        profitFactor: params.profitFactor,
        frequentLeaks: quant.historicalEdge.frequentMistakes,
      },
      quantBaseline: {
        verdict: quant.verdict,
        edgeScore: quant.edgeScore,
        tiltRisk: quant.tiltRisk,
      },
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
        AiUsageTrackerService.recordRequest(userId, 'PRETRADE_CHECK', model).catch(() => {});
      }

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
            contents: [{ parts: [{ text: `Evaluate this pre-trade scenario:\n${userContent}` }] }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);
        if (!response.ok) {
          if (response.status === 429 && userId) {
            AiUsageTrackerService.recordRateLimit(userId, 'PRETRADE_CHECK', 'HTTP 429 Pre-Trade Check Rate Limit Exceeded').catch(() => {});
          }
          continue;
        }

        const resJson: any = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);
        const latencyMs = Date.now() - startTime;

        return {
          verdict: parsed.verdict || quant.verdict,
          verdictTitle: parsed.verdictTitle || quant.verdictTitle,
          summary: parsed.summary || quant.summary,
          riskRewardRatio: quant.riskRewardRatio,
          edgeScore: Number(parsed.edgeScore ?? quant.edgeScore),
          tiltRisk: parsed.tiltRisk || quant.tiltRisk,
          todayContext: quant.todayContext,
          historicalEdge: quant.historicalEdge,
          keyChecks: Array.isArray(parsed.keyChecks) && parsed.keyChecks.length > 0
            ? parsed.keyChecks
            : quant.keyChecks,
          ruleReminder: parsed.ruleReminder || quant.ruleReminder,
          isAiGenerated: true,
          modelUsed: model,
          latencyMs,
        };
      } catch {
        clearTimeout(timeout);
      }
    }

    return null;
  }
}
