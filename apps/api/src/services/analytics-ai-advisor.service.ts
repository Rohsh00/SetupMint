/**
 * SetupMint - Full-Stack Analytics AI Advisor & Quantitative Desk Coach
 *
 * Provides institutional performance audits, edge detection, and leak remediation
 * across all analytics dimensions (Summary, Overview, Psychology, Execution, Sizing, Time).
 *
 * Dual-Engine Architecture:
 * 1. Google Gemini Flash LLM Synthesis (using active API key e.g. gemini-3.5-flash-lite)
 * 2. Deterministic Quantitative Engine (100% Free, Offline, Zero-Cost Fallback)
 */

import mongoose from 'mongoose';
import { IAnalyticsAiAudit, IAnalyticsAiDirective } from '@tradevault/shared';
import { User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';

export interface IAnalyticsAiInput {
  userId: string | mongoose.Types.ObjectId;
  trades: any[];
  scopeCurrency?: string;
  scopeLabel?: string;
  isMultiCurrency?: boolean;
  dateRangeLabel?: string;
  filterSummary?: string;
  forceRegenerate?: boolean;
}

export class AnalyticsAiAdvisorService {
  /**
   * Generates a comprehensive AI analytics audit across all performance dimensions.
   */
  static async generateAudit(input: IAnalyticsAiInput): Promise<IAnalyticsAiAudit> {
    const { userId, trades, scopeCurrency = 'USD', scopeLabel, isMultiCurrency, filterSummary } = input;

    // Load user for AI credentials
    const user = await User.findById(userId);

    // 1. Compute Quantitative Performance Telemetry
    const closedTrades = trades.filter((t) => t.status === 'CLOSED');
    const totalCount = closedTrades.length;

    let grossPnL = 0;
    let netPnL = 0;
    let totalCosts = 0;
    let winCount = 0;
    let lossCount = 0;
    let beCount = 0;
    let totalRealizedR = 0;
    let sumWinR = 0;
    let sumLossR = 0;

    let totalMaeR = 0;
    let totalMfeR = 0;
    let totalExitEfficiency = 0;
    let excursionValidCount = 0;
    let widenedStopsCount = 0;
    let trailedStopsCount = 0;

    const mistakeCounts: Record<string, number> = {};
    const emotionCounts: Record<string, number> = {};
    const sessionPnL: Record<string, { pnl: number; count: number; wins: number }> = {};
    const dayOfWeekPnL: Record<string, { pnl: number; count: number; wins: number }> = {};
    const symbolPnL: Record<string, { pnl: number; count: number; wins: number }> = {};
    const pnlByCurrency: Record<string, number> = {};

    let lotSizes: number[] = [];
    let martingaleRiskEvents = 0;
    let prevTradeLost = false;

    for (const t of closedTrades) {
      const pnl = Number(t.calculated?.netPnL ?? 0);
      const gross = Number(t.calculated?.grossPnL ?? pnl);
      const costs = Number(t.calculated?.totalCosts ?? (gross - pnl));
      const r = Number(t.calculated?.realizedRMultiple ?? t.risk?.realizedRMultiple ?? 0);
      const qty = Number(t.quantity ?? t.simpleExecution?.quantity ?? 0);
      const tradeCurr = String(t.currency || scopeCurrency).toUpperCase();

      pnlByCurrency[tradeCurr] = (pnlByCurrency[tradeCurr] || 0) + pnl;

      // In multi-currency mode, avoid summing cross-currency values
      if (!isMultiCurrency || tradeCurr === scopeCurrency.toUpperCase()) {
        netPnL += pnl;
        grossPnL += gross;
        totalCosts += costs;
      }
      totalRealizedR += r;

      if (qty > 0) lotSizes.push(qty);

      // Martingale detection (lot size jump after loss)
      if (prevTradeLost && lotSizes.length >= 2) {
        const prevQty = lotSizes[lotSizes.length - 2];
        if (qty >= prevQty * 1.5) {
          martingaleRiskEvents++;
        }
      }
      prevTradeLost = pnl < 0;

      if (pnl > 0) {
        winCount++;
        sumWinR += r > 0 ? r : 1;
      } else if (pnl < 0) {
        lossCount++;
        sumLossR += Math.abs(r < 0 ? r : 1);
      } else {
        beCount++;
      }

      // Excursion & stop moves
      if (t.calculated?.excursion) {
        const exc = t.calculated.excursion;
        if (exc.maeR !== undefined && exc.mfeR !== undefined) {
          totalMaeR += Number(exc.maeR || 0);
          totalMfeR += Number(exc.mfeR || 0);
          totalExitEfficiency += Number(exc.exitEfficiency || 0);
          excursionValidCount++;
        }
      }
      if (t.calculated?.stopMoveSummary) {
        widenedStopsCount += t.calculated.stopMoveSummary.widenedCount || 0;
        trailedStopsCount += t.calculated.stopMoveSummary.trailedCount || 0;
      }

      // Mistakes & emotions
      if (Array.isArray(t.psychology?.mistakes)) {
        for (const m of t.psychology.mistakes) {
          mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
        }
      }
      if (t.psychology?.emotionBefore) {
        emotionCounts[t.psychology.emotionBefore] = (emotionCounts[t.psychology.emotionBefore] || 0) + 1;
      }

      // Session
      const sess = t.session || 'DEFAULT';
      if (!sessionPnL[sess]) sessionPnL[sess] = { pnl: 0, count: 0, wins: 0 };
      sessionPnL[sess].pnl += pnl;
      sessionPnL[sess].count += 1;
      if (pnl > 0) sessionPnL[sess].wins += 1;

      // Symbol
      const sym = t.symbol || 'UNKNOWN';
      if (!symbolPnL[sym]) symbolPnL[sym] = { pnl: 0, count: 0, wins: 0 };
      symbolPnL[sym].pnl += pnl;
      symbolPnL[sym].count += 1;
      if (pnl > 0) symbolPnL[sym].wins += 1;

      // Day of week
      const dateObj = new Date(t.tradeDate || t.entryTime);
      if (!isNaN(dateObj.getTime())) {
        const dayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dateObj.getUTCDay()];
        if (!dayOfWeekPnL[dayName]) dayOfWeekPnL[dayName] = { pnl: 0, count: 0, wins: 0 };
        dayOfWeekPnL[dayName].pnl += pnl;
        dayOfWeekPnL[dayName].count += 1;
        if (pnl > 0) dayOfWeekPnL[dayName].wins += 1;
      }
    }

    const winRate = totalCount > 0 ? (winCount / totalCount) * 100 : 0;
    const profitFactor = sumLossR > 0 ? sumWinR / sumLossR : (winCount > 0 ? 99 : 1.0);
    const avgR = totalCount > 0 ? totalRealizedR / totalCount : 0;
    const avgMaeR = excursionValidCount > 0 ? totalMaeR / excursionValidCount : 0;
    const avgMfeR = excursionValidCount > 0 ? totalMfeR / excursionValidCount : 0;
    const avgExitEfficiency = excursionValidCount > 0 ? (totalExitEfficiency / excursionValidCount) * 100 : 0;

    // Sizing dispersion
    const minLot = lotSizes.length > 0 ? Math.min(...lotSizes) : 0;
    const maxLot = lotSizes.length > 0 ? Math.max(...lotSizes) : 0;
    const sizingDispersionRatio = minLot > 0 ? maxLot / minLot : 1;

    // 2. Generate Deterministic Quantitative Baseline Audit
    const quantAudit = this.generateDeterministicAudit({
      totalCount,
      winCount,
      lossCount,
      winRate,
      profitFactor,
      netPnL,
      avgR,
      avgMaeR,
      avgMfeR,
      avgExitEfficiency,
      widenedStopsCount,
      martingaleRiskEvents,
      sizingDispersionRatio,
      mistakeCounts,
      sessionPnL,
      dayOfWeekPnL,
      symbolPnL,
      scopeCurrency,
      scopeLabel,
      isMultiCurrency,
      pnlByCurrency,
    });

    // 3. Check for Active Google Gemini API Key
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    // If no closed trades, no key, or AI disabled, return deterministic quantitative audit immediately
    if (totalCount === 0 || !geminiApiKey || user?.aiSettings?.enabled === false) {
      return quantAudit;
    }

    // 4. Synthesize with Google Gemini Flash LLM
    try {
      const startTime = Date.now();
      const llmAudit = await this.synthesizeWithGemini({
        apiKey: geminiApiKey,
        quant: quantAudit,
        metrics: {
          totalCount,
          winRate: Math.round(winRate),
          profitFactor: Number(profitFactor.toFixed(2)),
          netPnL: Number(netPnL.toFixed(2)),
          currency: scopeCurrency,
          avgR: Number(avgR.toFixed(2)),
          avgMaeR: Number(avgMaeR.toFixed(2)),
          avgMfeR: Number(avgMfeR.toFixed(2)),
          avgExitEfficiency: Math.round(avgExitEfficiency),
          widenedStopsCount,
          martingaleRiskEvents,
          sizingDispersionRatio: Number(sizingDispersionRatio.toFixed(1)),
          topMistakes: Object.entries(mistakeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([m, c]) => `${m} (${c}x)`),
          sessionBreakdown: Object.entries(sessionPnL).map(([s, d]) => ({
            session: s,
            pnl: Math.round(d.pnl),
            trades: d.count,
            winRate: d.count > 0 ? Math.round((d.wins / d.count) * 100) : 0,
          })),
          dayOfWeekBreakdown: Object.entries(dayOfWeekPnL).map(([d, val]) => ({
            day: d,
            pnl: Math.round(val.pnl),
            trades: val.count,
            winRate: val.count > 0 ? Math.round((val.wins / val.count) * 100) : 0,
          })),
        },
        scopeLabel,
        filterSummary,
      });

      if (llmAudit) {
        llmAudit.latencyMs = Date.now() - startTime;
        return llmAudit;
      }
    } catch (err: any) {
      console.warn('[AnalyticsAiAdvisor] Gemini synthesis failed, using quant engine:', err.message);
    }

    return quantAudit;
  }

  /**
   * Deterministic Quantitative Audit Generator (100% Free, Offline, Zero-Cost)
   */
  private static generateDeterministicAudit(params: {
    totalCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    profitFactor: number;
    netPnL: number;
    avgR: number;
    avgMaeR: number;
    avgMfeR: number;
    avgExitEfficiency: number;
    widenedStopsCount: number;
    martingaleRiskEvents: number;
    sizingDispersionRatio: number;
    mistakeCounts: Record<string, number>;
    sessionPnL: Record<string, { pnl: number; count: number; wins: number }>;
    dayOfWeekPnL: Record<string, { pnl: number; count: number; wins: number }>;
    symbolPnL: Record<string, { pnl: number; count: number; wins: number }>;
    scopeCurrency: string;
    scopeLabel?: string;
    isMultiCurrency?: boolean;
    pnlByCurrency?: Record<string, number>;
  }): IAnalyticsAiAudit {
    const {
      totalCount,
      winRate,
      profitFactor,
      netPnL,
      avgR,
      avgMaeR,
      avgMfeR,
      avgExitEfficiency,
      widenedStopsCount,
      martingaleRiskEvents,
      sizingDispersionRatio,
      mistakeCounts,
      sessionPnL,
      dayOfWeekPnL,
      scopeCurrency,
      scopeLabel,
      isMultiCurrency,
    } = params;

    // Handle 0 closed trades cleanly
    if (totalCount === 0) {
      return {
        overallVerdict: 'NO_TRADES_IN_SCOPE',
        edgeGrade: 'B',
        executiveSummary: `No closed trades recorded within ${scopeLabel || 'this account scope'}. Log or sync trades to generate deep institutional edge analytics.`,
        topStrengths: ['Account scope connected', 'Awaiting closed trades for edge synthesis'],
        criticalLeaks: ['Insufficient sample size to assess execution leaks'],
        actionDirectives: [
          {
            category: 'PLAYBOOK',
            title: 'Log Validated Setups',
            directive: 'Execute and journal your core strategy setups to begin statistical calibration.',
            rationale: 'Deep quantitative edge detection requires closed trades.',
            impact: 'MEDIUM',
          },
        ],
        tabInsights: {
          summary: `No closed trades found for ${scopeLabel || 'this scope'}.`,
          overview: 'Equity curve and distribution will populate after trades are logged.',
          psychology: 'Psychology metrics require completed trade logs.',
          execution: 'Excursion and fill analytics require closed executions.',
          sizing: 'Position sizing analytics require trade quantity data.',
          time: 'Session performance will appear once trades are recorded.',
        },
        rulesForNextCycle: [
          'Execute only validated setups according to your trading playbook.',
          'Always set and honor an initial stop loss upon entry.',
          'Record psychological tags and execution screenshots for every trade.',
        ],
        modelUsed: 'Quant Engine (Deterministic)',
        generatedAt: new Date().toISOString(),
        isAiGenerated: false,
      };
    }

    // Compute edge grade
    let edgeGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'B';
    let overallVerdict = 'STEADY_BASE_EDGE';

    if (totalCount < 5) {
      edgeGrade = 'B';
      overallVerdict = 'INSUFFICIENT_SAMPLE_SIZE';
    } else if (profitFactor >= 2.0 && winRate >= 50 && netPnL > 0) {
      edgeGrade = 'A+';
      overallVerdict = 'INSTITUTIONAL_ALPHA_FLOW';
    } else if (profitFactor >= 1.5 && netPnL > 0) {
      edgeGrade = 'A';
      overallVerdict = 'PROVEN_EDGE_WITH_MINOR_LEAKS';
    } else if (profitFactor >= 1.1 && netPnL > 0) {
      edgeGrade = 'B';
      overallVerdict = 'MARGINAL_EDGE_PROFIT_GIVEBACK';
    } else if (profitFactor >= 0.8) {
      edgeGrade = 'C';
      overallVerdict = 'NEGATIVE_EXPECTANCY_DISCIPLINE_DRIFT';
    } else {
      edgeGrade = 'D';
      overallVerdict = 'CRITICAL_CAPITAL_EROSION';
    }

    // Strengths
    const topStrengths: string[] = [];
    if (winRate >= 50) topStrengths.push(`Solid baseline win rate of ${winRate.toFixed(1)}% across ${totalCount} closed trades.`);
    if (profitFactor >= 1.3) topStrengths.push(`Healthy profit factor of ${profitFactor.toFixed(2)} demonstrating positive statistical payoff.`);
    if (avgExitEfficiency >= 65) topStrengths.push(`High exit efficiency (${avgExitEfficiency.toFixed(1)}%) capturing the majority of trade run-up.`);
    if (widenedStopsCount === 0) topStrengths.push('Disciplined stop loss management with zero widened stop losses.');
    if (martingaleRiskEvents === 0 && sizingDispersionRatio < 2.5) topStrengths.push('Consistent position sizing with zero revenge escalation detected.');
    if (topStrengths.length === 0) {
      topStrengths.push('Active sample data gathered for quantitative performance feedback.');
    }

    // Leaks
    const criticalLeaks: string[] = [];
    if (widenedStopsCount > 0) {
      criticalLeaks.push(`Stop Loss Widening: Stops were moved further away ${widenedStopsCount} times, escalating downside loss.`);
    }
    if (martingaleRiskEvents > 0) {
      criticalLeaks.push(`Revenge Sizing Escalation: Position size jumped 1.5x+ immediately following a loss ${martingaleRiskEvents} times.`);
    }
    if (avgExitEfficiency < 45 && totalCount > 3) {
      criticalLeaks.push(`Profit Giveback: Exit efficiency is only ${avgExitEfficiency.toFixed(1)}%, indicating significant R surrendered from peaks.`);
    }
    const topMistakeEntries = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]);
    if (topMistakeEntries.length > 0) {
      const [mName, mCnt] = topMistakeEntries[0];
      criticalLeaks.push(`Psychological Rule Breach: "${mName}" logged ${mCnt} times.`);
    }
    if (criticalLeaks.length === 0) {
      criticalLeaks.push('No severe structural leaks detected. Focus on scaling high-conviction playbook setups.');
    }

    // Action Directives
    const actionDirectives: IAnalyticsAiDirective[] = [
      {
        category: 'EXECUTION',
        title: 'Lock In Breakeven At +1.0R',
        directive: 'Whenever trade reaches +1.0R excursion, trail stop loss to entry price immediately.',
        rationale: `Prevents turning winners into losses, especially with current ${avgMfeR.toFixed(2)}R average favorable excursion.`,
        impact: 'HIGH',
      },
      {
        category: 'SIZING',
        title: 'Hard Lot Size Cap',
        directive: 'Fix position risk strictly at 1.0% per setup with zero post-loss scaling.',
        rationale: 'Eliminates sizing dispersion and prevents revenge escalation spirals.',
        impact: widenedStopsCount > 0 || martingaleRiskEvents > 0 ? 'CRITICAL' : 'MEDIUM',
      },
      {
        category: 'PSYCHOLOGY',
        title: 'Mandatory 20-Minute Reset After Loss',
        directive: 'Enforce a strict 20-minute screen break immediately after any stop loss exit.',
        rationale: 'Dissolves adrenaline and restores analytical objectivity before taking the next trade.',
        impact: 'HIGH',
      },
    ];

    // Tab-Specific Insights
    const tabInsights = {
      summary: `Overall Scorecard: Grade ${edgeGrade} (${overallVerdict}). Net ${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)} ${scopeCurrency} with ${winRate.toFixed(1)}% win rate across ${totalCount} trades.`,
      overview: `Equity curve exhibits a Profit Factor of ${profitFactor.toFixed(2)} and Expectancy of ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R per trade. ${netPnL >= 0 ? 'Edge is profitable but needs leak plugging.' : 'Negative expectancy requires immediate guardrail enforcement.'}`,
      psychology: `${topMistakeEntries.length > 0 ? `Primary leak is "${topMistakeEntries[0][0]}" (${topMistakeEntries[0][1]}x).` : 'Psychological discipline is stable.'} Prioritize rule adherence and emotional neutrality over PnL outcomes.`,
      execution: `Excursion profile shows average MAE of ${avgMaeR.toFixed(2)}R vs MFE of ${avgMfeR.toFixed(2)}R. Exit efficiency stands at ${avgExitEfficiency.toFixed(1)}%. ${avgExitEfficiency < 50 ? 'Tighten profit capture rules.' : 'Fills and exits are well-timed.'}`,
      sizing: `Sizing dispersion ratio is ${sizingDispersionRatio.toFixed(1)}x. ${martingaleRiskEvents > 0 ? 'WARNING: Revenge sizing detected after losses.' : 'Risk distribution is well-controlled.'} Adhere strictly to fixed percentage sizing.`,
      time: `Review your session performance closely: focus trades strictly in your highest win rate session and eliminate low-volume off-hours trading.`,
    };

    return {
      overallVerdict,
      edgeGrade,
      executiveSummary: `Performance across ${totalCount} closed trades shows a ${winRate.toFixed(1)}% win rate and ${profitFactor.toFixed(2)} Profit Factor (${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)} ${scopeCurrency}). Execution quality reflects ${topStrengths[0]} ${criticalLeaks[0]}`,
      topStrengths,
      criticalLeaks,
      actionDirectives,
      tabInsights,
      rulesForNextCycle: [
        'Execute only validated A+ playbook setups during prime session liquidity.',
        'Never widen or remove a stop loss under any market condition.',
        'Cap daily loss at 2R maximum and shut down the terminal upon hitting it.',
      ],
      modelUsed: 'Quant Engine (Deterministic)',
      generatedAt: new Date().toISOString(),
      isAiGenerated: false,
    };
  }

  /**
   * Google Gemini Synthesis (Multi-model candidate iteration with vision / text)
   */
  private static async synthesizeWithGemini(params: {
    apiKey: string;
    quant: IAnalyticsAiAudit;
    metrics: any;
    scopeLabel?: string;
    filterSummary?: string;
  }): Promise<IAnalyticsAiAudit | null> {
    const { apiKey, quant, metrics, scopeLabel, filterSummary } = params;

    const systemPrompt = `You are SetupMint's Chief Quantitative Trading Officer & Elite Trading Performance Coach.
Analyze the trader's quantitative performance metrics across all dimensions (Summary, Overview, Psychology, Execution Quality, Position Sizing, Time & Sessions).
All metrics, feedback, and analysis MUST be strictly scoped to the specified account context: "${scopeLabel || 'Selected Account'}" with currency "${metrics.currency}".
NEVER mention, assume, or mix other currencies (e.g. do not mention INR if currency is USD, or USD if INR).

Return ONLY valid JSON matching this exact structure:
{
  "overallVerdict": "SHORT_UPPERCASE_VERDICT (e.g. HIGH_CONVICTION_INSTITUTIONAL_FLOW, PROFIT_GIVEBACK_DRIFT, REVENGE_SIZING_HAZARD, DISCIPLINED_DEFENSIVE_EDGE)",
  "edgeGrade": "A+" | "A" | "B" | "C" | "D" | "F",
  "executiveSummary": "2-3 punchy, institutional sentences diagnosing the trader's actual statistical edge, capital efficiency, and core leaks. Analytical, direct, zero fluff.",
  "topStrengths": ["Concrete statistical strength 1", "Concrete statistical strength 2", "Concrete statistical strength 3"],
  "criticalLeaks": ["Specific financial or discipline leak 1", "Specific leak 2"],
  "actionDirectives": [
    {
      "category": "EXECUTION" | "SIZING" | "PSYCHOLOGY" | "TIME" | "PLAYBOOK",
      "title": "Short punchy directive title",
      "directive": "Concrete action to take on every trade",
      "rationale": "Empirical reason based on the metrics",
      "impact": "CRITICAL" | "HIGH" | "MEDIUM"
    }
  ],
  "tabInsights": {
    "summary": "1-2 sentence executive takeaway for the Summary tab",
    "overview": "1-2 sentence statistical edge review for the Overview & Distribution tab",
    "psychology": "1-2 sentence behavioral coaching prescription for the Psychology & Mistakes tab",
    "execution": "1-2 sentence MAE/MFE and stop loss calibration advice for the Execution Quality tab",
    "sizing": "1-2 sentence lot size and risk management feedback for the Position Sizing tab",
    "time": "1-2 sentence session and kill zone recommendation for the Time & Session tab"
  },
  "rulesForNextCycle": [
    "Rule 1 for the upcoming trading week",
    "Rule 2 for the upcoming trading week",
    "Rule 3 for the upcoming trading week"
  ]
}`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    const contentPrompt = `Analyze this trader's comprehensive telemetry:
Account Scope: ${scopeLabel || 'Selected Account'}
Target Currency: ${metrics.currency}
${filterSummary ? `Filters Active: ${filterSummary}\n` : ''}
Metrics Summary:
${JSON.stringify(metrics, null, 2)}

Deterministic Baseline Scorecard:
Grade: ${quant.edgeGrade} (${quant.overallVerdict})
`;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: contentPrompt }] }],
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

        const p = JSON.parse(rawText);

        return {
          overallVerdict: String(p.overallVerdict || quant.overallVerdict),
          edgeGrade: ['A+', 'A', 'B', 'C', 'D', 'F'].includes(p.edgeGrade) ? p.edgeGrade : quant.edgeGrade,
          executiveSummary: String(p.executiveSummary || quant.executiveSummary),
          topStrengths: Array.isArray(p.topStrengths) && p.topStrengths.length > 0 ? p.topStrengths : quant.topStrengths,
          criticalLeaks: Array.isArray(p.criticalLeaks) && p.criticalLeaks.length > 0 ? p.criticalLeaks : quant.criticalLeaks,
          actionDirectives: Array.isArray(p.actionDirectives) && p.actionDirectives.length > 0 ? p.actionDirectives : quant.actionDirectives,
          tabInsights: {
            summary: String(p.tabInsights?.summary || quant.tabInsights.summary),
            overview: String(p.tabInsights?.overview || quant.tabInsights.overview),
            psychology: String(p.tabInsights?.psychology || quant.tabInsights.psychology),
            execution: String(p.tabInsights?.execution || quant.tabInsights.execution),
            sizing: String(p.tabInsights?.sizing || quant.tabInsights.sizing),
            time: String(p.tabInsights?.time || quant.tabInsights.time),
          },
          rulesForNextCycle: Array.isArray(p.rulesForNextCycle) && p.rulesForNextCycle.length > 0 ? p.rulesForNextCycle : quant.rulesForNextCycle,
          modelUsed: model,
          generatedAt: new Date().toISOString(),
          isAiGenerated: true,
        };
      } catch (err: any) {
        clearTimeout(timeout);
        // Try next candidate model
        continue;
      }
    }

    return null;
  }
}
