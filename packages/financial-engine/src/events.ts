import Decimal from 'decimal.js';
import {
  calculateContinuousTiltScore,
  TiltComponentScores,
  TiltLevel,
  TiltTradeHistoryItem,
} from './tilt.js';
import { checkDailyLossBreach } from './mistakes.js';

export interface EventMarkerTradeInput {
  id: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  exitTime?: string | Date;
  symbol: string;
  status: string;
  quantity?: number;
  entryPrice?: number;
  netPnL?: number;
  plannedRiskAmount?: number;
}

export interface BreachDayMarker {
  date: string;
  maxDailyLoss: number;
  currentDailyLoss: number;
  breachAmount: number;
  tradesCount: number;
}

export interface TiltDayMarker {
  date: string;
  tradeId: string;
  symbol: string;
  score: number;
  level: TiltLevel;
  components: TiltComponentScores;
  entryMoment: string;
  explanation: string;
}

export interface DailyEventMarkersResult {
  breachDays: BreachDayMarker[];
  tiltDays: TiltDayMarker[];
}

/**
 * Extracts daily-loss-breach days and high-tilt event markers from historical trades.
 *
 * Rules:
 * - Daily loss breaches evaluated per calendar date using current riskSettings.maxDailyLoss.
 * - Tilt is evaluated at each trade's entry moment from prior trade history.
 * - For tilt, marks the first trade of each calendar day that reaches score >= 61.
 */
export function calculateDailyEventMarkers(
  trades: EventMarkerTradeInput[],
  maxDailyLoss: number = 5000
): DailyEventMarkersResult {
  const closedTrades = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : new Date(a.tradeDate).getTime();
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : new Date(b.tradeDate).getTime();
      return timeA - timeB;
    });

  // 1. Group closed trades by calendar day for breach calculation
  const dayMap = new Map<string, EventMarkerTradeInput[]>();
  for (const t of closedTrades) {
    const dStr = typeof t.tradeDate === 'string'
      ? t.tradeDate.split('T')[0]
      : t.tradeDate.toISOString().split('T')[0];

    const list = dayMap.get(dStr) ?? [];
    list.push(t);
    dayMap.set(dStr, list);
  }

  const breachDays: BreachDayMarker[] = [];
  for (const [dateStr, dayTrades] of dayMap.entries()) {
    // Map to mistakes summary format
    const summaryList = dayTrades.map((t) => ({
      symbol: t.symbol,
      status: t.status,
      entryTime: t.entryTime || t.tradeDate,
      exitTime: t.exitTime,
      quantity: t.quantity || 1,
      entryPrice: t.entryPrice || 0,
      netPnL: t.netPnL ?? 0,
    }));

    const result = checkDailyLossBreach(summaryList, maxDailyLoss);
    if (result.breached) {
      breachDays.push({
        date: dateStr,
        maxDailyLoss,
        currentDailyLoss: result.currentDailyLoss,
        breachAmount: Number(new Decimal(result.currentDailyLoss).minus(maxDailyLoss).toFixed(2)),
        tradesCount: dayTrades.length,
      });
    }
  }

  // 2. Continuous tilt evaluation at each trade's entry moment
  const tiltDays: TiltDayMarker[] = [];
  const daysWithTiltMarked = new Set<string>();

  const historyForTilt: TiltTradeHistoryItem[] = [];
  let currentDayRunningLoss = new Decimal(0);
  let currentEvaluatingDay = '';

  for (let i = 0; i < closedTrades.length; i++) {
    const currentTrade = closedTrades[i];
    const tradeDateStr = typeof currentTrade.tradeDate === 'string'
      ? currentTrade.tradeDate.split('T')[0]
      : currentTrade.tradeDate.toISOString().split('T')[0];

    if (tradeDateStr !== currentEvaluatingDay) {
      currentEvaluatingDay = tradeDateStr;
      currentDayRunningLoss = new Decimal(0);
    }

    const proposedEntryTime = currentTrade.entryTime || currentTrade.tradeDate;

    // Evaluate tilt at this trade's entry moment
    const tiltResult = calculateContinuousTiltScore({
      recentTrades: historyForTilt,
      proposedQuantity: currentTrade.quantity,
      proposedRiskAmount: currentTrade.plannedRiskAmount,
      proposedEntryTime,
      dailyLossLimit: maxDailyLoss,
      currentDayRealizedLoss: currentDayRunningLoss.toNumber(),
    });

    if (tiltResult.score >= 61 && !daysWithTiltMarked.has(tradeDateStr)) {
      daysWithTiltMarked.add(tradeDateStr);
      tiltDays.push({
        date: tradeDateStr,
        tradeId: currentTrade.id,
        symbol: currentTrade.symbol,
        score: tiltResult.score,
        level: tiltResult.level,
        components: tiltResult.components,
        entryMoment: new Date(proposedEntryTime).toISOString(),
        explanation: tiltResult.advisoryNote,
      });
    }

    // After evaluating currentTrade entry, append currentTrade to history
    historyForTilt.push({
      id: currentTrade.id,
      tradeDate: currentTrade.tradeDate,
      exitTime: currentTrade.exitTime || currentTrade.tradeDate,
      netPnL: currentTrade.netPnL ?? 0,
      quantity: currentTrade.quantity,
      plannedRiskAmount: currentTrade.plannedRiskAmount,
    });

    if ((currentTrade.netPnL ?? 0) < 0) {
      currentDayRunningLoss = currentDayRunningLoss.plus(Math.abs(currentTrade.netPnL ?? 0));
    }
  }

  return {
    breachDays: breachDays.sort((a, b) => a.date.localeCompare(b.date)),
    tiltDays: tiltDays.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
