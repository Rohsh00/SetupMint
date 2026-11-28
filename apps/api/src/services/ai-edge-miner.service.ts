/**
 * SetupMint - Unsupervised Edge Mining & Leak Discovery Engine
 *
 * Scans historical trade populations across multidimensional axes:
 * 1. Time-of-Day Execution Buckets (Morning Open vs Mid-Day Chop vs Power Hour)
 * 2. Day-of-Week Seasonality (Monday momentum vs Thursday expiry drag)
 * 3. Holding Time Sweet Spots (<15m scalps vs 15-60m swings vs >90m stale positions)
 * 4. Technical Confluence Synergy vs Drag
 *
 * Discovers statistical advantages and behavioral leaks without manual spreadsheet queries.
 */

import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { IAiEdgeMiningInsight, IAiEdgeMiningReport } from '@tradevault/shared';
import { Trade } from '../db/models/index.js';

export class AiEdgeMinerService {
  /**
   * Runs unsupervised statistical analysis across all closed trades for a user.
   */
  static async mineInsights(params: {
    userId: string | mongoose.Types.ObjectId;
    scopeKey?: string;
    accountId?: string;
    limit?: number;
  }): Promise<IAiEdgeMiningReport> {
    const { userId, accountId, limit = 200 } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const filter: any = {
      userId: uId,
      status: 'CLOSED',
    };
    if (accountId && accountId !== 'ALL') {
      filter.accountId = new mongoose.Types.ObjectId(accountId);
    }

    const trades = await Trade.find(filter)
      .sort({ exitTime: -1 })
      .limit(limit)
      .lean();

    if (trades.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        totalTradesSampled: 0,
        overallWinRate: 0,
        overallProfitFactor: 0,
        insights: [],
      };
    }

    // 1. Overall baseline metrics
    let totalWinCount = 0;
    let totalGrossWin = new Decimal(0);
    let totalGrossLoss = new Decimal(0);
    let totalNetPnL = new Decimal(0);

    // Multi-dimensional telemetry buckets
    const timeOfDayBuckets: Record<string, { wins: number; total: number; pnl: Decimal; grossWin: Decimal; grossLoss: Decimal }> = {
      'Morning Open (09:15-11:00)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      'Mid-Day Transition (11:00-13:30)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      'Afternoon & Power Hour (13:30-15:30)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      'Off-Hours / Global (Other)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
    };

    const dayOfWeekBuckets: Record<string, { wins: number; total: number; pnl: Decimal; grossWin: Decimal; grossLoss: Decimal }> = {
      Monday: { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      Tuesday: { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      Wednesday: { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      Thursday: { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      Friday: { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
    };

    const durationBuckets: Record<string, { wins: number; total: number; pnl: Decimal; grossWin: Decimal; grossLoss: Decimal }> = {
      'Quick Scalp (< 15 mins)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      'Sweet Spot Swing (15 - 60 mins)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
      'Extended Hold (> 60 mins)': { wins: 0, total: 0, pnl: new Decimal(0), grossWin: new Decimal(0), grossLoss: new Decimal(0) },
    };

    for (const t of trades) {
      const pnl = new Decimal(t.calculated?.netPnL ?? 0);
      totalNetPnL = totalNetPnL.plus(pnl);

      if (pnl.isPositive()) {
        totalWinCount++;
        totalGrossWin = totalGrossWin.plus(pnl);
      } else if (pnl.isNegative()) {
        totalGrossLoss = totalGrossLoss.plus(pnl.abs());
      }

      // Time of Day
      const entryDate = t.entryTime ? new Date(t.entryTime) : t.tradeDate ? new Date(t.tradeDate) : null;
      if (entryDate) {
        // Resolve IST hour (UTC + 5:30)
        const utcMinutes = entryDate.getUTCHours() * 60 + entryDate.getUTCMinutes();
        const istMinutes = (utcMinutes + 330) % 1440;
        const istHour = Math.floor(istMinutes / 60);

        let todKey = 'Off-Hours / Global (Other)';
        if (istHour >= 9 && (istHour < 11 || (istHour === 9 && istMinutes % 60 >= 15))) {
          todKey = 'Morning Open (09:15-11:00)';
        } else if (istHour >= 11 && istHour < 13 || (istHour === 13 && istMinutes % 60 <= 30)) {
          todKey = 'Mid-Day Transition (11:00-13:30)';
        } else if (istHour >= 13 && istHour < 16) {
          todKey = 'Afternoon & Power Hour (13:30-15:30)';
        }

        const b = timeOfDayBuckets[todKey];
        b.total++;
        b.pnl = b.pnl.plus(pnl);
        if (pnl.isPositive()) {
          b.wins++;
          b.grossWin = b.grossWin.plus(pnl);
        } else if (pnl.isNegative()) {
          b.grossLoss = b.grossLoss.plus(pnl.abs());
        }

        // Day of Week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[entryDate.getUTCDay()];
        if (dayOfWeekBuckets[dayName]) {
          const db = dayOfWeekBuckets[dayName];
          db.total++;
          db.pnl = db.pnl.plus(pnl);
          if (pnl.isPositive()) {
            db.wins++;
            db.grossWin = db.grossWin.plus(pnl);
          } else if (pnl.isNegative()) {
            db.grossLoss = db.grossLoss.plus(pnl.abs());
          }
        }
      }

      // Holding Duration
      const holdingMins = t.calculated?.holdingTimeMinutes ?? 0;
      let durKey = 'Quick Scalp (< 15 mins)';
      if (holdingMins > 60) durKey = 'Extended Hold (> 60 mins)';
      else if (holdingMins >= 15) durKey = 'Sweet Spot Swing (15 - 60 mins)';

      const durB = durationBuckets[durKey];
      durB.total++;
      durB.pnl = durB.pnl.plus(pnl);
      if (pnl.isPositive()) {
        durB.wins++;
        durB.grossWin = durB.grossWin.plus(pnl);
      } else if (pnl.isNegative()) {
        durB.grossLoss = durB.grossLoss.plus(pnl.abs());
      }
    }

    const overallWinRate = trades.length > 0 ? Math.round((totalWinCount / trades.length) * 100) : 0;
    const overallProfitFactor = totalGrossLoss.isZero()
      ? totalGrossWin.isPositive()
        ? 999.99
        : 0
      : Number(totalGrossWin.dividedBy(totalGrossLoss).toFixed(2));

    const insights: IAiEdgeMiningInsight[] = [];

    // Helper to evaluate bucket
    const evaluateBucket = (
      dimension: 'TIME_OF_DAY' | 'DAY_OF_WEEK' | 'HOLDING_DURATION',
      label: string,
      data: { wins: number; total: number; pnl: Decimal; grossWin: Decimal; grossLoss: Decimal }
    ) => {
      if (data.total < 3) return; // Ignore insignificant samples

      const wr = Math.round((data.wins / data.total) * 100);
      const pf = data.grossLoss.isZero()
        ? data.grossWin.isPositive()
          ? 999.99
          : 0
        : Number(data.grossWin.dividedBy(data.grossLoss).toFixed(2));

      const wrDiff = wr - overallWinRate;
      const isPositive = wrDiff >= 10 || pf >= overallProfitFactor * 1.25;
      const isNegative = wrDiff <= -10 || (pf < 1.0 && data.pnl.isNegative());

      if (isPositive) {
        insights.push({
          id: `${dimension}-${label.replace(/\s+/g, '_')}`,
          dimension,
          title: `Statistical Edge in ${label}`,
          verdict: 'POSITIVE_EDGE',
          sampleSize: data.total,
          winRate: wr,
          profitFactor: pf,
          netPnL: data.pnl.toNumber(),
          comparisonBaseline: `${wrDiff >= 0 ? '+' : ''}${wrDiff}% win rate vs your ${overallWinRate}% baseline`,
          actionableDirective: `Prioritize sizing and capital allocation during ${label}. This cohort generates an outsized portion of your edge.`,
        });
      } else if (isNegative) {
        insights.push({
          id: `${dimension}-${label.replace(/\s+/g, '_')}`,
          dimension,
          title: `Discipline Drag in ${label}`,
          verdict: 'CRITICAL_LEAK',
          sampleSize: data.total,
          winRate: wr,
          profitFactor: pf,
          netPnL: data.pnl.toNumber(),
          comparisonBaseline: `${wrDiff}% win rate vs your ${overallWinRate}% baseline`,
          actionableDirective: `Consider reducing size or enforcing a strict rule to stand aside during ${label}. This cohort has been a drag on your equity curve.`,
        });
      }
    };

    // Evaluate all buckets
    for (const [k, v] of Object.entries(timeOfDayBuckets)) evaluateBucket('TIME_OF_DAY', k, v);
    for (const [k, v] of Object.entries(dayOfWeekBuckets)) evaluateBucket('DAY_OF_WEEK', k, v);
    for (const [k, v] of Object.entries(durationBuckets)) evaluateBucket('HOLDING_DURATION', k, v);

    // Sort: positive edges first, then critical leaks by loss magnitude
    insights.sort((a, b) => b.netPnL - a.netPnL);

    const topPositiveEdge = insights.find((i) => i.verdict === 'POSITIVE_EDGE');
    const biggestSurrenderedLeak = insights
      .slice()
      .reverse()
      .find((i) => i.verdict === 'CRITICAL_LEAK');

    return {
      generatedAt: new Date().toISOString(),
      totalTradesSampled: trades.length,
      overallWinRate,
      overallProfitFactor,
      insights,
      topPositiveEdge,
      biggestSurrenderedLeak,
    };
  }
}

