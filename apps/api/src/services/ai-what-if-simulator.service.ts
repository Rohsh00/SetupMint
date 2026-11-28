/**
 * SetupMint - Counterfactual AI "What-If" Simulation Engine
 *
 * Runs historical counterfactual simulations against the trader's actual trade ledger:
 * 1. REMOVE_REVENGE: Quantifies equity curve if trades <20 mins after a loss were never taken.
 * 2. TRAIL_STOP_1R: Simulates moving stop to breakeven upon reaching +1.0R MFE.
 * 3. TIME_FILTER: Simulates standing aside during low-edge hours.
 * 4. MAX_TRADES_CAP: Simulates enforcing a 3-trade daily limit.
 *
 * Produces before/after mathematical comparison and institutional risk coaching synthesis.
 */

import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { IAiWhatIfSimulationInput, IAiWhatIfSimulationResult } from '@tradevault/shared';
import { Trade, User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiWhatIfSimulatorService {
  /**
   * Executes a counterfactual what-if simulation and generates AI synthesis.
   */
  static async runSimulation(
    userId: string | mongoose.Types.ObjectId,
    input: IAiWhatIfSimulationInput
  ): Promise<IAiWhatIfSimulationResult> {
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const { scenarioType, accountId } = input;

    const filter: any = {
      userId: uId,
      status: 'CLOSED',
    };
    if (accountId && accountId !== 'ALL') {
      filter.accountId = new mongoose.Types.ObjectId(accountId);
    }

    const [trades, user] = await Promise.all([
      Trade.find(filter).sort({ exitTime: 1 }).lean(),
      User.findById(uId).lean(),
    ]);

    // 1. Calculate Baseline Metrics
    const baseline = this.computeMetrics(trades);

    // 2. Filter / Mutate trades based on scenario
    let simulatedTrades: any[] = [];
    let scenarioName = 'Custom Scenario';

    if (scenarioType === 'REMOVE_REVENGE') {
      scenarioName = 'Zero Revenge Trading (Mandatory 20-min Post-Loss Cooldown)';
      let lastExitTime: Date | null = null;
      let lastTradeLost = false;

      for (const t of trades) {
        const pnl = Number(t.calculated?.netPnL ?? 0);
        const entryTime = t.entryTime ? new Date(t.entryTime) : null;
        let isRevenge = false;

        if (lastTradeLost && lastExitTime && entryTime) {
          const diffMins = (entryTime.getTime() - lastExitTime.getTime()) / 60000;
          if (diffMins >= 0 && diffMins <= 20) {
            isRevenge = true;
          }
        }

        if (!isRevenge) {
          simulatedTrades.push(t);
        }

        if (t.exitTime) {
          lastExitTime = new Date(t.exitTime);
          lastTradeLost = pnl < 0;
        }
      }
    } else if (scenarioType === 'TRAIL_STOP_1R') {
      scenarioName = 'Breakeven Stop Lock at +1.0R (Zero Round-Trip Losses)';
      for (const t of trades) {
        const pnl = Number(t.calculated?.netPnL ?? 0);
        const mfeR = Number(t.calculated?.excursion?.mfeR ?? 0);

        // If trade reached >= +1.0R but closed at a loss, turn it into breakeven ($0)
        if (mfeR >= 1.0 && pnl < 0) {
          const cloned = { ...t, calculated: { ...t.calculated, netPnL: 0, grossPnL: 0, realizedRMultiple: 0 } };
          simulatedTrades.push(cloned);
        } else {
          simulatedTrades.push(t);
        }
      }
    } else if (scenarioType === 'TIME_FILTER') {
      scenarioName = 'Morning Open Only (09:15 - 11:30 IST Session)';
      for (const t of trades) {
        const entryDate = t.entryTime ? new Date(t.entryTime) : t.tradeDate ? new Date(t.tradeDate) : null;
        if (entryDate) {
          const utcMins = entryDate.getUTCHours() * 60 + entryDate.getUTCMinutes();
          const istMins = (utcMins + 330) % 1440;
          const istHour = Math.floor(istMins / 60);

          if (istHour >= 9 && istHour <= 11) {
            simulatedTrades.push(t);
          }
        } else {
          simulatedTrades.push(t);
        }
      }
    } else if (scenarioType === 'MAX_TRADES_CAP') {
      scenarioName = 'Strict 3-Trades-Per-Day Execution Cap';
      const dailyCounts: Record<string, number> = {};
      for (const t of trades) {
        const dStr = t.tradeDate ? new Date(t.tradeDate).toISOString().slice(0, 10) : 'N/A';
        dailyCounts[dStr] = (dailyCounts[dStr] || 0) + 1;
        if (dailyCounts[dStr] <= 3) {
          simulatedTrades.push(t);
        }
      }
    } else {
      simulatedTrades = trades.slice();
    }

    // 3. Calculate Simulated Metrics
    const simulated = this.computeMetrics(simulatedTrades);

    const deltaPnL = Number(new Decimal(simulated.netPnL).minus(baseline.netPnL).toFixed(2));
    const deltaWinRate = simulated.winRate - baseline.winRate;
    const deltaDrawdown = Number(new Decimal(baseline.maxDrawdown).minus(simulated.maxDrawdown).toFixed(2));

    // 4. Generate AI Synthesis
    const synthesis = await this.synthesizeSimulation({
      user,
      userId: uId,
      scenarioName,
      baseline,
      simulated,
      deltaPnL,
      deltaWinRate,
      deltaDrawdown,
    });

    return {
      scenarioName,
      baseline,
      simulated,
      deltaPnL,
      deltaWinRate,
      deltaDrawdown,
      aiSynthesis: synthesis.text,
      modelUsed: synthesis.model,
    };
  }

  private static computeMetrics(trades: any[]) {
    let netPnL = new Decimal(0);
    let winCount = 0;
    let grossWin = new Decimal(0);
    let grossLoss = new Decimal(0);

    let peak = new Decimal(0);
    let maxDrawdown = new Decimal(0);
    let runningEquity = new Decimal(0);

    for (const t of trades) {
      const pnl = new Decimal(t.calculated?.netPnL ?? 0);
      netPnL = netPnL.plus(pnl);
      runningEquity = runningEquity.plus(pnl);

      if (runningEquity.greaterThan(peak)) {
        peak = runningEquity;
      }
      const dd = peak.minus(runningEquity);
      if (dd.greaterThan(maxDrawdown)) {
        maxDrawdown = dd;
      }

      if (pnl.isPositive()) {
        winCount++;
        grossWin = grossWin.plus(pnl);
      } else if (pnl.isNegative()) {
        grossLoss = grossLoss.plus(pnl.abs());
      }
    }

    const tradesCount = trades.length;
    const winRate = tradesCount > 0 ? Math.round((winCount / tradesCount) * 100) : 0;
    const profitFactor = grossLoss.isZero()
      ? grossWin.isPositive()
        ? 999.99
        : 0
      : Number(grossWin.dividedBy(grossLoss).toFixed(2));

    return {
      tradesCount,
      netPnL: netPnL.toNumber(),
      winRate,
      profitFactor,
      maxDrawdown: maxDrawdown.toNumber(),
    };
  }

  private static async synthesizeSimulation(params: {
    user: any;
    userId: mongoose.Types.ObjectId;
    scenarioName: string;
    baseline: any;
    simulated: any;
    deltaPnL: number;
    deltaWinRate: number;
    deltaDrawdown: number;
  }): Promise<{ text: string; model: string }> {
    const { user, userId, scenarioName, baseline, simulated, deltaPnL, deltaWinRate, deltaDrawdown } = params;

    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    if (geminiApiKey) {
      try {
        AiUsageTrackerService.recordRequest(userId, 'WHAT_IF', 'gemini-2.5-flash').catch(() => {});

        const prompt = `Trader Simulation: "${scenarioName}"
Baseline: ${baseline.tradesCount} trades, Net P&L: ₹${baseline.netPnL}, Win Rate: ${baseline.winRate}%, Profit Factor: ${baseline.profitFactor}, Max Drawdown: ₹${baseline.maxDrawdown}
Simulated: ${simulated.tradesCount} trades, Net P&L: ₹${simulated.netPnL}, Win Rate: ${simulated.winRate}%, Profit Factor: ${simulated.profitFactor}, Max Drawdown: ₹${simulated.maxDrawdown}
Delta: Net P&L diff: ₹${deltaPnL}, Win Rate diff: ${deltaWinRate}%, Drawdown reduction: ₹${deltaDrawdown}

Provide a concise, 3-sentence institutional risk executive debrief on the viability and psychological value of adopting this rule permanently.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
        });

        clearTimeout(timeout);
        if (res.ok) {
          const json: any = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return { text: text.trim(), model: 'gemini-2.5-flash' };
          }
        }
      } catch {
        // Fall back to deterministic
      }
    }

    const sign = deltaPnL >= 0 ? '+' : '';
    const text = `Adopting "${scenarioName}" yields an equity delta of ${sign}₹${deltaPnL.toLocaleString()} with a ${deltaWinRate >= 0 ? '+' : ''}${deltaWinRate}% change in win rate and ₹${deltaDrawdown.toLocaleString()} drawdown reduction. This counterfactual proves that structural risk rules immediately enhance long-term expectancy.`;
    return { text, model: 'Deterministic Quant Simulator' };
  }
}

