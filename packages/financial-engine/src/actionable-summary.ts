import Decimal from './decimal.js';

export interface IActionableSummaryTradeInput {
  id: string;
  tradeDate: string | Date;
  entryTime?: string | Date;
  exitTime?: string | Date;
  symbol: string;
  direction?: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | string;
  currency?: string;
  strategyId?: string;
  strategyName?: string;
  status: string; // 'CLOSED' | 'OPEN'
  session?: string;
  assetClass?: string;
  quantity?: number;
  calculated?: {
    netPnL?: number;
    grossPnL?: number;
    totalCosts?: number;
    realizedRMultiple?: number;
    holdingTimeMinutes?: number;
    outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN';
    excursion?: {
      maeR?: number;
      mfeR?: number;
      exitEfficiency?: number;
      reversedAfterStopHit?: boolean;
      stopHit?: boolean;
    };
  };
  risk?: {
    plannedRiskAmount?: number;
    riskPercent?: number;
    initialStopLoss?: number;
    currentStopLoss?: number;
    plannedTarget?: number;
    realizedRMultiple?: number;
  };
  psychology?: {
    disciplineScore?: number;
    emotionBefore?: string;
    rulesFollowed?: boolean;
    mistakes?: string[];
    stopLossMoved?: boolean;
    revengeTrading?: boolean;
    overtrading?: boolean;
    prematureExit?: boolean;
    positionSizeViolation?: boolean;
  };
}

export type ConfidenceTier = 'HIGH' | 'MODERATE' | 'PRELIMINARY';
export type DirectiveSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY';
export type DirectiveCategory =
  | 'SESSION'
  | 'INSTRUMENT'
  | 'DIRECTION'
  | 'STRATEGY'
  | 'SIZING'
  | 'MISTAKE'
  | 'EXECUTION'
  | 'PSYCHOLOGY'
  | 'OVERTRADING';

export interface IDirectiveItem {
  id: string;
  type: 'DO' | 'DONT';
  category: DirectiveCategory;
  title: string;
  instruction: string;
  rationales: string[];
  metrics: {
    winRate?: number;
    profitFactor?: number;
    expectancyR?: number;
    sampleSize: number;
    netPnL?: number;
    leakPnL?: number;
    lossRate?: number;
    occurrences?: number;
  };
  confidence: ConfidenceTier;
  severity: DirectiveSeverity;
  badge: string;
  actionTag: string;
}

export interface ITraderScorecard {
  overallScore: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: 'PRIME_EXECUTION' | 'MODERATE_LEAKS' | 'CRITICAL_RISK';
  verdictLabel: string;
  totalPreventableLoss: number;
  currency: string;
  totalClosedTrades: number;
  winRate: number;
  profitFactor: number;
  netPnL: number;
  expectancyR?: number;
  ruleAdherencePercent: number;
  disciplineAvg: number;
  hasSufficientData: boolean;
}

export interface ICircuitBreakerSettings {
  maxDailyLossR: number;
  maxDailyTrades: number;
  consecutiveLossLimit: number;
  coolOffMinutes: number;
  rationale: {
    maxDailyLossExplanation: string;
    maxDailyTradesExplanation: string;
    consecutiveLossExplanation: string;
  };
}

export interface IDeskCheatSheet {
  preTradeChecklist: string[];
  duringTradeRules: string[];
  postTradeRules: string[];
}

export interface IActionableSummaryReport {
  scorecard: ITraderScorecard;
  priorityDirectives: IDirectiveItem[];
  dos: IDirectiveItem[];
  donts: IDirectiveItem[];
  circuitBreakers: ICircuitBreakerSettings;
  deskCheatSheet: IDeskCheatSheet;
  dataHealth: {
    closedTradesCount: number;
    openTradesCount: number;
    tradesWithRCount: number;
    tradesWithPsychologyCount: number;
    tradesWithExcursionCount: number;
    symbolsCount: number;
    strategiesCount: number;
  };
}

export interface IActionableSummaryOptions {
  currency?: string;
  timezone?: string;
  minConfidenceTrades?: number;
}

function getHourInTimezone(dateInput: Date | string, timezone: string): number {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 0;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const hourPart = parts.find((p) => p.type === 'hour');
    const h = hourPart ? parseInt(hourPart.value, 10) : d.getUTCHours();
    return h === 24 ? 0 : h;
  } catch {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.getUTCHours();
  }
}

function getDateStringInTimezone(dateInput: Date | string, timezone: string): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.toISOString().split('T')[0] || '';
  }
}

function determineConfidence(n: number): ConfidenceTier {
  if (n >= 15) return 'HIGH';
  if (n >= 6) return 'MODERATE';
  return 'PRELIMINARY';
}

export function calculateActionableSummary(
  trades: IActionableSummaryTradeInput[],
  options: IActionableSummaryOptions = {}
): IActionableSummaryReport {
  const currency = options.currency || 'USD';
  const timezone = options.timezone || 'Asia/Kolkata';

  const closedTrades = (trades || []).filter((t) => t.status === 'CLOSED');
  const openTrades = (trades || []).filter((t) => t.status === 'OPEN');

  const totalClosed = closedTrades.length;
  const hasSufficientData = totalClosed >= 5;

  let totalNet = new Decimal(0);
  let totalWinPnL = new Decimal(0);
  let totalLossPnL = new Decimal(0);
  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let rulesFollowedCount = 0;
  let disciplineScoreSum = 0;
  let disciplineScoreCount = 0;
  let sumR = new Decimal(0);
  let rCount = 0;
  let excursionCount = 0;
  let psychCount = 0;

  // Track Preventable Losses
  let preventableLossDec = new Decimal(0);
  const mistakeLeakMap = new Map<string, { count: number; loss: Decimal; occurrences: number }>();

  // Track Dimensions
  const symbolMap = new Map<string, { count: number; wins: number; losses: number; net: Decimal; winPnL: Decimal; lossPnL: Decimal; sumR: Decimal; rCount: number }>();
  const sessionMap = new Map<string, { count: number; wins: number; losses: number; net: Decimal; winPnL: Decimal; lossPnL: Decimal; sumR: Decimal; rCount: number }>();
  const strategyMap = new Map<string, { name: string; count: number; wins: number; losses: number; net: Decimal; winPnL: Decimal; lossPnL: Decimal; sumR: Decimal; rCount: number }>();
  const directionMap = new Map<string, { count: number; wins: number; losses: number; net: Decimal; winPnL: Decimal; lossPnL: Decimal; sumR: Decimal; rCount: number }>();
  const hourMap = new Map<number, { count: number; wins: number; losses: number; net: Decimal; sumR: Decimal; rCount: number }>();

  // Daily trade sequences (Overtrading analysis)
  const dailyTradesMap = new Map<string, IActionableSummaryTradeInput[]>();
  const quantities: number[] = [];
  const mfeValues: number[] = [];
  const maeValues: number[] = [];

  for (const trade of closedTrades) {
    const pnlNum = trade.calculated?.netPnL ?? 0;
    const pnlDec = new Decimal(pnlNum);
    totalNet = totalNet.plus(pnlDec);

    if (pnlNum > 0) {
      winCount++;
      totalWinPnL = totalWinPnL.plus(pnlDec);
    } else if (pnlNum < 0) {
      lossCount++;
      totalLossPnL = totalLossPnL.plus(pnlDec.abs());
    } else {
      breakevenCount++;
    }

    // R-multiple
    const rVal = trade.calculated?.realizedRMultiple ?? trade.risk?.realizedRMultiple;
    if (rVal !== undefined && Number.isFinite(rVal)) {
      sumR = sumR.plus(new Decimal(rVal));
      rCount++;
    }

    // Excursion
    if (trade.calculated?.excursion?.mfeR !== undefined || trade.calculated?.excursion?.maeR !== undefined) {
      excursionCount++;
      if (trade.calculated.excursion.mfeR !== undefined && Number.isFinite(trade.calculated.excursion.mfeR)) {
        mfeValues.push(trade.calculated.excursion.mfeR);
      }
      if (trade.calculated.excursion.maeR !== undefined && Number.isFinite(trade.calculated.excursion.maeR)) {
        maeValues.push(trade.calculated.excursion.maeR);
      }
    }

    // Psychology & Mistakes
    const psych = trade.psychology;
    if (psych) {
      psychCount++;
      if (psych.rulesFollowed === true) {
        rulesFollowedCount++;
      }
      if (typeof psych.disciplineScore === 'number' && psych.disciplineScore > 0) {
        disciplineScoreSum += psych.disciplineScore;
        disciplineScoreCount++;
      }

      // Collect trade mistakes
      const tradeMistakes = new Set<string>();
      if (psych.stopLossMoved) tradeMistakes.add('STOP_MOVED');
      if (psych.revengeTrading) tradeMistakes.add('REVENGE_TRADING');
      if (psych.overtrading) tradeMistakes.add('OVERTRADING');
      if (psych.prematureExit) tradeMistakes.add('PREMATURE_EXIT');
      if (psych.positionSizeViolation) tradeMistakes.add('SIZE_VIOLATION');
      if (Array.isArray(psych.mistakes)) {
        for (const m of psych.mistakes) {
          if (m && typeof m === 'string') tradeMistakes.add(m);
        }
      }

      if (tradeMistakes.size > 0 && pnlNum < 0) {
        preventableLossDec = preventableLossDec.plus(pnlDec.abs());
      }

      for (const mTag of tradeMistakes) {
        const existing = mistakeLeakMap.get(mTag) ?? { count: 0, loss: new Decimal(0), occurrences: 0 };
        existing.occurrences++;
        if (pnlNum < 0) {
          existing.count++;
          existing.loss = existing.loss.plus(pnlDec.abs());
        }
        mistakeLeakMap.set(mTag, existing);
      }
    }

    // Sizing
    const qty = trade.quantity ?? 0;
    if (qty > 0) {
      quantities.push(qty);
    }

    // Symbol segmentation
    const symKey = (trade.symbol || 'UNKNOWN').toUpperCase().trim();
    const symRecord = symbolMap.get(symKey) ?? {
      count: 0, wins: 0, losses: 0, net: new Decimal(0), winPnL: new Decimal(0), lossPnL: new Decimal(0), sumR: new Decimal(0), rCount: 0,
    };
    symRecord.count++;
    symRecord.net = symRecord.net.plus(pnlDec);
    if (pnlNum > 0) {
      symRecord.wins++;
      symRecord.winPnL = symRecord.winPnL.plus(pnlDec);
    } else if (pnlNum < 0) {
      symRecord.losses++;
      symRecord.lossPnL = symRecord.lossPnL.plus(pnlDec.abs());
    }
    if (rVal !== undefined && Number.isFinite(rVal)) {
      symRecord.sumR = symRecord.sumR.plus(new Decimal(rVal));
      symRecord.rCount++;
    }
    symbolMap.set(symKey, symRecord);

    // Direction segmentation
    const rawDir = (trade.direction || '').toUpperCase().trim();
    const dirKey = rawDir === 'BUY' ? 'LONG' : rawDir === 'SELL' ? 'SHORT' : rawDir || 'UNKNOWN';
    if (dirKey === 'LONG' || dirKey === 'SHORT') {
      const dirRecord = directionMap.get(dirKey) ?? {
        count: 0, wins: 0, losses: 0, net: new Decimal(0), winPnL: new Decimal(0), lossPnL: new Decimal(0), sumR: new Decimal(0), rCount: 0,
      };
      dirRecord.count++;
      dirRecord.net = dirRecord.net.plus(pnlDec);
      if (pnlNum > 0) {
        dirRecord.wins++;
        dirRecord.winPnL = dirRecord.winPnL.plus(pnlDec);
      } else if (pnlNum < 0) {
        dirRecord.losses++;
        dirRecord.lossPnL = dirRecord.lossPnL.plus(pnlDec.abs());
      }
      if (rVal !== undefined && Number.isFinite(rVal)) {
        dirRecord.sumR = dirRecord.sumR.plus(new Decimal(rVal));
        dirRecord.rCount++;
      }
      directionMap.set(dirKey, dirRecord);
    }

    // Session segmentation
    const sessKey = (trade.session || 'DISCRETIONARY').toUpperCase().trim();
    if (sessKey && sessKey !== 'UNKNOWN') {
      const sessRecord = sessionMap.get(sessKey) ?? {
        count: 0, wins: 0, losses: 0, net: new Decimal(0), winPnL: new Decimal(0), lossPnL: new Decimal(0), sumR: new Decimal(0), rCount: 0,
      };
      sessRecord.count++;
      sessRecord.net = sessRecord.net.plus(pnlDec);
      if (pnlNum > 0) {
        sessRecord.wins++;
        sessRecord.winPnL = sessRecord.winPnL.plus(pnlDec);
      } else if (pnlNum < 0) {
        sessRecord.losses++;
        sessRecord.lossPnL = sessRecord.lossPnL.plus(pnlDec.abs());
      }
      if (rVal !== undefined && Number.isFinite(rVal)) {
        sessRecord.sumR = sessRecord.sumR.plus(new Decimal(rVal));
        sessRecord.rCount++;
      }
      sessionMap.set(sessKey, sessRecord);
    }

    // Strategy segmentation
    const stratId = trade.strategyId || 'unclassified';
    const stratName = trade.strategyName || (stratId === 'unclassified' ? 'Discretionary' : 'Strategy');
    const stratRecord = strategyMap.get(stratId) ?? {
      name: stratName, count: 0, wins: 0, losses: 0, net: new Decimal(0), winPnL: new Decimal(0), lossPnL: new Decimal(0), sumR: new Decimal(0), rCount: 0,
    };
    stratRecord.count++;
    stratRecord.net = stratRecord.net.plus(pnlDec);
    if (pnlNum > 0) {
      stratRecord.wins++;
      stratRecord.winPnL = stratRecord.winPnL.plus(pnlDec);
    } else if (pnlNum < 0) {
      stratRecord.losses++;
      stratRecord.lossPnL = stratRecord.lossPnL.plus(pnlDec.abs());
    }
    if (rVal !== undefined && Number.isFinite(rVal)) {
      stratRecord.sumR = stratRecord.sumR.plus(new Decimal(rVal));
      stratRecord.rCount++;
    }
    strategyMap.set(stratId, stratRecord);

    // Hourly segmentation
    const entryDate = trade.entryTime || trade.tradeDate;
    const hour = getHourInTimezone(entryDate, timezone);
    const hourRecord = hourMap.get(hour) ?? { count: 0, wins: 0, losses: 0, net: new Decimal(0), sumR: new Decimal(0), rCount: 0 };
    hourRecord.count++;
    hourRecord.net = hourRecord.net.plus(pnlDec);
    if (pnlNum > 0) hourRecord.wins++;
    else if (pnlNum < 0) hourRecord.losses++;
    if (rVal !== undefined && Number.isFinite(rVal)) {
      hourRecord.sumR = hourRecord.sumR.plus(new Decimal(rVal));
      hourRecord.rCount++;
    }
    hourMap.set(hour, hourRecord);

    // Daily grouping
    const dayStr = getDateStringInTimezone(trade.tradeDate, timezone);
    if (dayStr) {
      const dayList = dailyTradesMap.get(dayStr) ?? [];
      dayList.push(trade);
      dailyTradesMap.set(dayStr, dayList);
    }
  }

  // Sizing Median
  quantities.sort((a, b) => a - b);
  const medianQuantity = quantities.length > 0
    ? (quantities.length % 2 === 1
        ? quantities[Math.floor(quantities.length / 2)]
        : (quantities[quantities.length / 2 - 1] + quantities[quantities.length / 2]) / 2)
    : 0;

  // Basic Metrics
  const winRate = totalClosed > 0 ? Number(((winCount / totalClosed) * 100).toFixed(1)) : 0;
  let profitFactor = 0;
  if (totalLossPnL.isZero()) {
    profitFactor = totalWinPnL.greaterThan(0) ? 999.99 : 0;
  } else {
    profitFactor = Number(totalWinPnL.dividedBy(totalLossPnL).toFixed(2));
  }

  const expectancyR = rCount > 0 ? Number(sumR.dividedBy(rCount).toFixed(2)) : undefined;
  const ruleAdherencePercent = psychCount > 0 ? Number(((rulesFollowedCount / psychCount) * 100).toFixed(1)) : 100;
  const disciplineAvg = disciplineScoreCount > 0 ? Number((disciplineScoreSum / disciplineScoreCount).toFixed(1)) : 3.0;

  // Composite Health Scorecard (0 to 100)
  // 1. Edge component (30 pts max): based on PF and Expectancy
  let edgeScore = 0;
  if (profitFactor >= 2.0) edgeScore += 20;
  else if (profitFactor >= 1.4) edgeScore += 15;
  else if (profitFactor >= 1.0) edgeScore += 10;
  else if (profitFactor > 0.6) edgeScore += 4;

  if (expectancyR !== undefined) {
    if (expectancyR >= 1.0) edgeScore += 10;
    else if (expectancyR >= 0.3) edgeScore += 7;
    else if (expectancyR > 0) edgeScore += 4;
  } else {
    edgeScore = Math.min(30, Math.round(edgeScore * 1.5));
  }

  // 2. Discipline component (25 pts max): based on rule adherence & discipline score
  const disciplineComponent = Math.round((ruleAdherencePercent / 100) * 15 + ((disciplineAvg - 1) / 4) * 10);

  // 3. Preventable loss mitigation (20 pts max):
  let leakMitigationScore = 20;
  if (totalLossPnL.greaterThan(0)) {
    const leakRatio = preventableLossDec.dividedBy(totalLossPnL).toNumber();
    leakMitigationScore = Math.max(0, Math.round(20 * (1 - leakRatio)));
  }

  // 4. Sample & Win Rate stability (25 pts max):
  let stabilityScore = 0;
  if (winRate >= 60) stabilityScore += 15;
  else if (winRate >= 45) stabilityScore += 12;
  else if (winRate >= 35) stabilityScore += 8;
  else stabilityScore += 3;

  if (totalClosed >= 30) stabilityScore += 10;
  else if (totalClosed >= 15) stabilityScore += 7;
  else if (totalClosed >= 5) stabilityScore += 4;

  const rawOverall = edgeScore + disciplineComponent + leakMitigationScore + stabilityScore;
  const overallScore = Math.min(100, Math.max(10, totalClosed === 0 ? 50 : rawOverall));

  let grade: ITraderScorecard['grade'] = 'C';
  if (overallScore >= 90) grade = 'A+';
  else if (overallScore >= 80) grade = 'A';
  else if (overallScore >= 68) grade = 'B';
  else if (overallScore >= 50) grade = 'C';
  else if (overallScore >= 35) grade = 'D';
  else grade = 'F';

  let verdict: ITraderScorecard['verdict'] = 'MODERATE_LEAKS';
  let verdictLabel = 'Moderate Behavioral Leaks Detected';
  if (overallScore >= 80) {
    verdict = 'PRIME_EXECUTION';
    verdictLabel = 'Prime Execution & Positive Alpha State';
  } else if (overallScore < 55) {
    verdict = 'CRITICAL_RISK';
    verdictLabel = 'Critical Risk & Capital Leaks Alert';
  }

  const scorecard: ITraderScorecard = {
    overallScore,
    grade,
    verdict,
    verdictLabel,
    totalPreventableLoss: Number(preventableLossDec.toFixed(2)),
    currency,
    totalClosedTrades: totalClosed,
    winRate,
    profitFactor,
    netPnL: Number(totalNet.toFixed(2)),
    expectancyR,
    ruleAdherencePercent,
    disciplineAvg,
    hasSufficientData,
  };

  // =========================================================================
  // RULE SYNTHESIS ENGINE (DO's and DON'Ts)
  // =========================================================================
  const dos: IDirectiveItem[] = [];
  const donts: IDirectiveItem[] = [];

  // 1. MISTAKE & DISCIPLINE DON'TS
  const mistakeLabels: Record<string, string> = {
    STOP_MOVED: 'Stop Loss Widening & Moving',
    REVENGE_TRADING: 'Revenge Trading After Loss',
    OVERTRADING: 'Session Overtrading',
    PREMATURE_EXIT: 'Panic / Premature Exit',
    SIZE_VIOLATION: 'Position Sizing Violations',
    CHASING: 'Chasing Extended Entries',
    FOMO: 'Fear Of Missing Out (FOMO) Entries',
    NO_STOP_LOSS: 'Trading Without Hard Stop Loss',
  };

  for (const [mKey, data] of mistakeLeakMap.entries()) {
    if (data.occurrences >= 2 || (data.count >= 1 && data.loss.greaterThan(50))) {
      const label = mistakeLabels[mKey] || mKey.replace(/_/g, ' ');
      const leakVal = Number(data.loss.toFixed(2));
      const lossRate = data.occurrences > 0 ? Number(((data.count / data.occurrences) * 100).toFixed(0)) : 100;

      let instruction = '';
      if (mKey === 'STOP_MOVED') {
        instruction = 'Never move or widen your initial stop loss order. Let your planned invalidation stand.';
      } else if (mKey === 'REVENGE_TRADING') {
        instruction = 'Enforce an automatic 30-minute cooling period immediately after any losing trade.';
      } else if (mKey === 'SIZE_VIOLATION') {
        instruction = 'Strictly lock lot size to your pre-calculated risk formula. Never double down.';
      } else if (mKey === 'PREMATURE_EXIT') {
        instruction = 'Honor your planned take-profit level. Do not micromanage open positions inside fair value.';
      } else {
        instruction = `Eliminate '${label}'. Set a mandatory pre-trade verification checklist before entry.`;
      }

      donts.push({
        id: `dont-mistake-${mKey.toLowerCase()}`,
        type: 'DONT',
        category: 'MISTAKE',
        title: `Hard Ban: ${label}`,
        instruction,
        rationales: [
          `Attributed directly to ${data.count} losing trades, causing an avoidable bleed of ${currency} ${leakVal}.`,
          `Trades tagged with this mistake have a ${lossRate}% loss rate.`,
        ],
        metrics: {
          leakPnL: leakVal,
          lossRate,
          occurrences: data.occurrences,
          sampleSize: data.occurrences,
        },
        confidence: determineConfidence(data.occurrences),
        severity: leakVal > 500 || lossRate >= 80 ? 'CRITICAL' : 'WARNING',
        badge: `-${currency} ${leakVal}`,
        actionTag: 'CAPITAL BLEED',
      });
    }
  }

  // 2. INSTRUMENT DIRECTIVES (DOs and DON'Ts)
  for (const [sym, data] of symbolMap.entries()) {
    if (data.count >= 3) {
      const symWR = Number(((data.wins / data.count) * 100).toFixed(1));
      let symPF = 0;
      if (data.lossPnL.isZero()) symPF = data.winPnL.greaterThan(0) ? 999.99 : 0;
      else symPF = Number(data.winPnL.dividedBy(data.lossPnL).toFixed(2));
      const symExpR = data.rCount > 0 ? Number(data.sumR.dividedBy(data.rCount).toFixed(2)) : undefined;
      const netVal = Number(data.net.toFixed(2));

      if (symPF >= 1.5 && symWR >= 50 && netVal > 0) {
        dos.push({
          id: `do-instrument-${sym.toLowerCase()}`,
          type: 'DO',
          category: 'INSTRUMENT',
          title: `Prime Asset: Focus on ${sym}`,
          instruction: `Prioritize trade setups on ${sym}. This instrument represents your highest positive expectancy hunt zone.`,
          rationales: [
            `Generates ${currency} ${netVal} in net profit across ${data.count} trades with ${symWR}% win rate.`,
            `Profit Factor of ${symPF >= 999 ? '∞' : symPF}${symExpR !== undefined ? ` and average expectancy of +${symExpR}R per trade` : ''}.`,
          ],
          metrics: {
            winRate: symWR,
            profitFactor: symPF,
            expectancyR: symExpR,
            netPnL: netVal,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'OPPORTUNITY',
          badge: `+${currency} ${netVal}`,
          actionTag: 'MAX ALLOCATION',
        });
      } else if (symPF < 0.8 && netVal < 0) {
        const leakPnL = Math.abs(netVal);
        donts.push({
          id: `dont-instrument-${sym.toLowerCase()}`,
          type: 'DONT',
          category: 'INSTRUMENT',
          title: `Capital Drain: Pause or Blacklist ${sym}`,
          instruction: `Stop taking live discretionary trades on ${sym} until backtested and revised. It is actively degrading your portfolio.`,
          rationales: [
            `Produced a net loss of -${currency} ${leakPnL} across ${data.count} trades with only ${symWR}% win rate.`,
            `Profit factor of ${symPF} indicates severe negative expectancy.`,
          ],
          metrics: {
            leakPnL,
            lossRate: 100 - symWR,
            occurrences: data.count,
            sampleSize: data.count,
            expectancyR: symExpR,
          },
          confidence: determineConfidence(data.count),
          severity: leakPnL > 400 ? 'CRITICAL' : 'WARNING',
          badge: `-${currency} ${leakPnL}`,
          actionTag: 'BLACKLIST ASSET',
        });
      }
    }
  }

  // 3. DIRECTIONAL ASYMMETRY (DOs and DON'Ts)
  const longData = directionMap.get('LONG');
  const shortData = directionMap.get('SHORT');
  if (longData && shortData && longData.count >= 4 && shortData.count >= 4) {
    const longWR = Number(((longData.wins / longData.count) * 100).toFixed(1));
    const shortWR = Number(((shortData.wins / shortData.count) * 100).toFixed(1));
    const longNet = Number(longData.net.toFixed(2));
    const shortNet = Number(shortData.net.toFixed(2));

    if (longWR >= 60 && shortWR <= 35 && shortNet < 0) {
      donts.push({
        id: 'dont-direction-short-bias',
        type: 'DONT',
        category: 'DIRECTION',
        title: 'Asymmetry Drag: Avoid Short / Sell Trades',
        instruction: 'Halt taking Short positions. Your directional edge is overwhelmingly skewed to the Long side.',
        rationales: [
          `Short trades have a low ${shortWR}% win rate (-${currency} ${Math.abs(shortNet)} net), while Long trades produce a ${longWR}% win rate (+${currency} ${longNet}).`,
          'Fighting underlying market momentum is systematically penalizing your returns.',
        ],
        metrics: {
          leakPnL: Math.abs(shortNet),
          lossRate: 100 - shortWR,
          occurrences: shortData.count,
          sampleSize: shortData.count,
        },
        confidence: determineConfidence(shortData.count),
        severity: 'WARNING',
        badge: `-${currency} ${Math.abs(shortNet)}`,
        actionTag: 'DIRECTIONAL BIAS',
      });
      dos.push({
        id: 'do-direction-long-focus',
        type: 'DO',
        category: 'DIRECTION',
        title: 'Directional Alpha: Focus on Long / Buy Setups',
        instruction: 'Trade with the predominant trend by taking high-probability Long setups.',
        rationales: [`Long trades maintain a verified ${longWR}% win rate across ${longData.count} trades.`],
        metrics: {
          winRate: longWR,
          netPnL: longNet,
          sampleSize: longData.count,
        },
        confidence: determineConfidence(longData.count),
        severity: 'OPPORTUNITY',
        badge: `+${currency} ${longNet}`,
        actionTag: 'TREND ALIGNMENT',
      });
    } else if (shortWR >= 60 && longWR <= 35 && longNet < 0) {
      donts.push({
        id: 'dont-direction-long-bias',
        type: 'DONT',
        category: 'DIRECTION',
        title: 'Asymmetry Drag: Avoid Long / Buy Trades',
        instruction: 'Halt taking Long positions. Your verified statistical edge is concentrated on Short executions.',
        rationales: [
          `Long trades have a low ${longWR}% win rate (-${currency} ${Math.abs(longNet)} net), while Short trades produce a ${shortWR}% win rate (+${currency} ${shortNet}).`,
        ],
        metrics: {
          leakPnL: Math.abs(longNet),
          lossRate: 100 - longWR,
          occurrences: longData.count,
          sampleSize: longData.count,
        },
        confidence: determineConfidence(longData.count),
        severity: 'WARNING',
        badge: `-${currency} ${Math.abs(longNet)}`,
        actionTag: 'DIRECTIONAL BIAS',
      });
    }
  }

  // 4. SESSION & KILL-ZONE DIRECTIVES (DOs and DON'Ts)
  for (const [sess, data] of sessionMap.entries()) {
    if (data.count >= 4) {
      const sessWR = Number(((data.wins / data.count) * 100).toFixed(1));
      let sessPF = 0;
      if (data.lossPnL.isZero()) sessPF = data.winPnL.greaterThan(0) ? 999.99 : 0;
      else sessPF = Number(data.winPnL.dividedBy(data.lossPnL).toFixed(2));
      const netVal = Number(data.net.toFixed(2));

      if (sessPF >= 1.6 && sessWR >= 50 && netVal > 0) {
        dos.push({
          id: `do-session-${sess.toLowerCase()}`,
          type: 'DO',
          category: 'SESSION',
          title: `Golden Session: Trade ${sess}`,
          instruction: `Concentrate execution strictly during the ${sess} session. Your setup execution and market volatility align best here.`,
          rationales: [
            `${sess} accounts for ${currency} ${netVal} net profit with a ${sessWR}% win rate and ${sessPF >= 999 ? '∞' : sessPF} Profit Factor.`,
          ],
          metrics: {
            winRate: sessWR,
            profitFactor: sessPF,
            netPnL: netVal,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'OPPORTUNITY',
          badge: `+${currency} ${netVal}`,
          actionTag: 'GOLDEN SESSION',
        });
      } else if (sessPF < 0.7 && netVal < 0) {
        const leakPnL = Math.abs(netVal);
        donts.push({
          id: `dont-session-${sess.toLowerCase()}`,
          type: 'DONT',
          category: 'SESSION',
          title: `Toxic Session: Avoid ${sess}`,
          instruction: `Close terminal during the ${sess} session. Low liquidity or adverse chop during this window consistently produces losses.`,
          rationales: [
            `${sess} is your worst performing window with a net drain of -${currency} ${leakPnL} and a ${sessWR}% win rate across ${data.count} trades.`,
          ],
          metrics: {
            leakPnL,
            lossRate: 100 - sessWR,
            occurrences: data.count,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'WARNING',
          badge: `-${currency} ${leakPnL}`,
          actionTag: 'SESSION BAN',
        });
      }
    }
  }

  // 5. TOXIC TRADING HOURS (DON'Ts)
  for (const [hour, data] of hourMap.entries()) {
    if (data.count >= 4) {
      const hWR = Number(((data.wins / data.count) * 100).toFixed(1));
      const hNet = Number(data.net.toFixed(2));
      if (hWR <= 30 && hNet < 0) {
        const hourStr = `${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00`;
        donts.push({
          id: `dont-hour-${hour}`,
          type: 'DONT',
          category: 'SESSION',
          title: `Toxic Window: Step Away Between ${hourStr} (${timezone})`,
          instruction: `Do not execute any new trades between ${hourStr}. Historical data proves a persistent negative expectancy in this time window.`,
          rationales: [
            `Trades placed in this hour suffer a ${100 - hWR}% loss rate and -${currency} ${Math.abs(hNet)} net drawdown across ${data.count} executions.`,
          ],
          metrics: {
            leakPnL: Math.abs(hNet),
            lossRate: 100 - hWR,
            occurrences: data.count,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'WARNING',
          badge: `-${currency} ${Math.abs(hNet)}`,
          actionTag: 'TOXIC TIME',
        });
      }
    }
  }

  // 6. STRATEGY SELECTION DIRECTIVES (DOs and DON'Ts)
  for (const [sId, data] of strategyMap.entries()) {
    if (data.count >= 4 && sId !== 'unclassified') {
      const stratWR = Number(((data.wins / data.count) * 100).toFixed(1));
      let stratPF = 0;
      if (data.lossPnL.isZero()) stratPF = data.winPnL.greaterThan(0) ? 999.99 : 0;
      else stratPF = Number(data.winPnL.dividedBy(data.lossPnL).toFixed(2));
      const netVal = Number(data.net.toFixed(2));

      if (stratPF >= 1.6 && stratWR >= 50 && netVal > 0) {
        dos.push({
          id: `do-strategy-${sId.toLowerCase()}`,
          type: 'DO',
          category: 'STRATEGY',
          title: `Core Edge: Prioritize '${data.name}' Playbook`,
          instruction: `Focus your execution exclusively on setups conforming to '${data.name}'. This strategy has confirmed edge.`,
          rationales: [
            `Generates ${currency} ${netVal} net with a ${stratWR}% win rate and ${stratPF >= 999 ? '∞' : stratPF} Profit Factor.`,
          ],
          metrics: {
            winRate: stratWR,
            profitFactor: stratPF,
            netPnL: netVal,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'OPPORTUNITY',
          badge: `+${currency} ${netVal}`,
          actionTag: 'CORE PLAYBOOK',
        });
      } else if (stratPF < 0.75 && netVal < 0) {
        const leakPnL = Math.abs(netVal);
        donts.push({
          id: `dont-strategy-${sId.toLowerCase()}`,
          type: 'DONT',
          category: 'STRATEGY',
          title: `Underperforming Playbook: Review '${data.name}'`,
          instruction: `Pause live execution of '${data.name}' and move it back to simulation for parameter recalibration.`,
          rationales: [
            `Incurred a cumulative loss of -${currency} ${leakPnL} across ${data.count} trades with a ${stratWR}% win rate.`,
          ],
          metrics: {
            leakPnL,
            lossRate: 100 - stratWR,
            occurrences: data.count,
            sampleSize: data.count,
          },
          confidence: determineConfidence(data.count),
          severity: 'WARNING',
          badge: `-${currency} ${leakPnL}`,
          actionTag: 'REVISE STRATEGY',
        });
      }
    }
  }

  // 7. OVERTRADING / SEQUENCE DIRECTIVES (DON'Ts)
  let trades1to2Count = 0;
  let trades1to2Wins = 0;
  let trades1to2Net = new Decimal(0);
  let trades3PlusCount = 0;
  let trades3PlusWins = 0;
  let trades3PlusNet = new Decimal(0);

  for (const dayTrades of dailyTradesMap.values()) {
    dayTrades.sort((a, b) => new Date(a.entryTime || a.tradeDate).getTime() - new Date(b.entryTime || b.tradeDate).getTime());
    dayTrades.forEach((t, idx) => {
      const p = new Decimal(t.calculated?.netPnL ?? 0);
      if (idx < 2) {
        trades1to2Count++;
        trades1to2Net = trades1to2Net.plus(p);
        if (p.greaterThan(0)) trades1to2Wins++;
      } else {
        trades3PlusCount++;
        trades3PlusNet = trades3PlusNet.plus(p);
        if (p.greaterThan(0)) trades3PlusWins++;
      }
    });
  }

  if (trades3PlusCount >= 4) {
    const earlyWR = trades1to2Count > 0 ? Number(((trades1to2Wins / trades1to2Count) * 100).toFixed(1)) : 0;
    const lateWR = Number(((trades3PlusWins / trades3PlusCount) * 100).toFixed(1));
    const lateNetNum = Number(trades3PlusNet.toFixed(2));

    if (lateWR <= 35 && lateNetNum < 0) {
      const leakPnL = Math.abs(lateNetNum);
      donts.push({
        id: 'dont-overtrading-trade3plus',
        type: 'DONT',
        category: 'OVERTRADING',
        title: 'Hard Limit: Cap at 2 Trades Per Day',
        instruction: 'Never take trade #3 or beyond in a single calendar day. Your execution quality drops precipitously after trade #2.',
        rationales: [
          `Trades 1 & 2 maintain a strong ${earlyWR}% win rate (+${currency} ${Number(trades1to2Net.toFixed(2))}).`,
          `Trades 3+ suffer a ${lateWR}% win rate and bleed -${currency} ${leakPnL} over ${trades3PlusCount} trades.`,
        ],
        metrics: {
          leakPnL,
          lossRate: 100 - lateWR,
          occurrences: trades3PlusCount,
          sampleSize: trades3PlusCount,
        },
        confidence: determineConfidence(trades3PlusCount),
        severity: 'CRITICAL',
        badge: `-${currency} ${leakPnL}`,
        actionTag: 'MAX 2 TRADES/DAY',
      });
    }
  }

  // 8. EXCURSION & TARGET DIRECTIVES (DOs)
  if (mfeValues.length >= 6) {
    mfeValues.sort((a, b) => a - b);
    const medianMfe = mfeValues[Math.floor(mfeValues.length / 2)];
    const p75Mfe = mfeValues[Math.floor(mfeValues.length * 0.75)];

    if (medianMfe >= 1.5 && (!expectancyR || medianMfe > expectancyR * 1.3)) {
      const targetRecommendation = Number(medianMfe.toFixed(1));
      dos.push({
        id: 'do-execution-target-mfe',
        type: 'DO',
        category: 'EXECUTION',
        title: `Target Discipline: Scale Out at ${targetRecommendation}R Target`,
        instruction: `Set your primary take-profit target at ${targetRecommendation}R. Excursion telemetry proves trades reliably push to ${targetRecommendation}R before retracing.`,
        rationales: [
          `Median Maximum Favorable Excursion (MFE) reaches ${targetRecommendation}R, with top runs extending to ${Number(p75Mfe.toFixed(1))}R.`,
          'Locking in partial gains at this level prevents giving back unrealized profits on runners.',
        ],
        metrics: {
          expectancyR: targetRecommendation,
          sampleSize: mfeValues.length,
        },
        confidence: determineConfidence(mfeValues.length),
        severity: 'OPPORTUNITY',
        badge: `${targetRecommendation}R TARGET`,
        actionTag: 'OPTIMAL TARGET',
      });
    }
  }

  // 9. SIZING DISCIPLINE (DOs and DON'Ts)
  if (quantities.length >= 6 && medianQuantity > 0) {
    const oversizedTrades = closedTrades.filter((t) => (t.quantity ?? 0) > medianQuantity * 1.5);
    if (oversizedTrades.length >= 3) {
      const overWins = oversizedTrades.filter((t) => (t.calculated?.netPnL ?? 0) > 0).length;
      const overLoss = oversizedTrades.filter((t) => (t.calculated?.netPnL ?? 0) < 0);
      const overNet = oversizedTrades.reduce((acc, t) => acc.plus(new Decimal(t.calculated?.netPnL ?? 0)), new Decimal(0));
      const overLossSum = overLoss.reduce((acc, t) => acc.plus(new Decimal(t.calculated?.netPnL ?? 0).abs()), new Decimal(0));
      const overWR = Number(((overWins / oversizedTrades.length) * 100).toFixed(1));

      if (overWR <= 35 && overNet.lessThan(0)) {
        const leakPnL = Number(overLossSum.toFixed(2));
        donts.push({
          id: 'dont-sizing-oversize-spikes',
          type: 'DONT',
          category: 'SIZING',
          title: 'Hard Ban: Oversized Position Spikes (>1.5x Median)',
          instruction: `Never execute positions exceeding 1.5x your median size (${medianQuantity.toFixed(2)} units). Size spikes produce severe drawdown spikes.`,
          rationales: [
            `Oversized trades have an abysmal ${overWR}% win rate, causing -${currency} ${leakPnL} in drawdown over ${oversizedTrades.length} trades.`,
            'Disproportionate losses on large positions wipe out gains from multiple normal-sized winners.',
          ],
          metrics: {
            leakPnL,
            lossRate: 100 - overWR,
            occurrences: oversizedTrades.length,
            sampleSize: oversizedTrades.length,
          },
          confidence: determineConfidence(oversizedTrades.length),
          severity: 'CRITICAL',
          badge: `-${currency} ${leakPnL}`,
          actionTag: 'FIXED RISK ONLY',
        });
      }
    }

    // Positive sizing directive
    dos.push({
      id: 'do-sizing-fixed-risk',
      type: 'DO',
      category: 'SIZING',
      title: 'Position Sizing: Maintain Standard Base Lot Size',
      instruction: `Anchor your default position size to approximately ${medianQuantity.toFixed(2)} units (or fixed 1% risk). Size consistency is essential for positive compounding.`,
      rationales: [
        `Base size consistency shields your capital from statistical variance and prevents psychological tilt.`,
      ],
      metrics: {
        sampleSize: quantities.length,
      },
      confidence: determineConfidence(quantities.length),
      severity: 'OPPORTUNITY',
      badge: 'FIXED SIZING',
      actionTag: 'CONSISTENCY',
    });
  }

  // Fallback defaults if trade history is small or has no extreme leaks
  if (dos.length === 0) {
    dos.push({
      id: 'do-general-pretrade-plan',
      type: 'DO',
      category: 'EXECUTION',
      title: 'Trading Plan: Pre-Define Stop Loss & Target Before Entry',
      instruction: 'Never enter a trade with market order without calculating position size and stop-loss level in the Risk Calculator.',
      rationales: ['Trade discipline begins with mathematical clarity on planned risk vs planned reward.'],
      metrics: { sampleSize: totalClosed },
      confidence: 'PRELIMINARY',
      severity: 'OPPORTUNITY',
      badge: 'CORE HABIT',
      actionTag: 'PRE-TRADE PLAN',
    });
  }

  if (donts.length === 0) {
    donts.push({
      id: 'dont-general-loss-widening',
      type: 'DONT',
      category: 'MISTAKE',
      title: 'Golden Rule: Never Move Stop Loss Further Away',
      instruction: 'Accept the initial risk parameter. Widening a stop loss transforms controlled losses into account-threatening drawdowns.',
      rationales: ['Professional risk management is strictly defined by honoring planned stop loss invalidations.'],
      metrics: { occurrences: 0, sampleSize: totalClosed },
      confidence: 'HIGH',
      severity: 'CRITICAL',
      badge: 'CAPITAL DEFENSE',
      actionTag: 'HARD STOP',
    });
  }

  // Sort DOs by highest positive impact
  dos.sort((a, b) => (b.metrics.netPnL ?? 0) - (a.metrics.netPnL ?? 0) || (b.metrics.winRate ?? 0) - (a.metrics.winRate ?? 0));

  // Sort DONTs by largest financial leak
  donts.sort((a, b) => (b.metrics.leakPnL ?? 0) - (a.metrics.leakPnL ?? 0) || (b.metrics.lossRate ?? 0) - (a.metrics.lossRate ?? 0));

  // Top Priority Directives (Top 2 to 3 highest impact)
  const priorityDirectives: IDirectiveItem[] = [];
  if (donts.length > 0) {
    priorityDirectives.push(donts[0]);
  }
  if (dos.length > 0) {
    priorityDirectives.push(dos[0]);
  }
  if (donts.length > 1) {
    priorityDirectives.push(donts[1]);
  }

  // Circuit Breakers
  const recommendedDailyLossR = 2.0;
  const recommendedDailyTrades = trades3PlusCount >= 4 && (trades3PlusNet.lessThan(0) || (trades3PlusWins / trades3PlusCount) < 0.35) ? 2 : 3;

  const circuitBreakers: ICircuitBreakerSettings = {
    maxDailyLossR: recommendedDailyLossR,
    maxDailyTrades: recommendedDailyTrades,
    consecutiveLossLimit: 2,
    coolOffMinutes: 30,
    rationale: {
      maxDailyLossExplanation: `Cap daily losses at -${recommendedDailyLossR}R. Recovering from a 2R loss requires only 1 standard winning trade, while 4R+ drawdowns trigger emotional spiral.`,
      maxDailyTradesExplanation: `Limit trading to ${recommendedDailyTrades} setups per day. Historical statistics prove trade quality deteriorates sharply on subsequent executions.`,
      consecutiveLossExplanation: 'Enforce a 30-minute terminal disconnect after 2 consecutive losses to break the psychological revenge-trading impulse.',
    },
  };

  // Desk Cheat Sheet
  const deskCheatSheet: IDeskCheatSheet = {
    preTradeChecklist: [
      'Is the setup conforming to your primary proven playbook?',
      `Are you within your golden trading session (${timezone})?`,
      'Is your stop loss anchored to logical market structure (not arbitrary dollar amount)?',
      'Is your position size capped at your standard fixed risk parameter?',
      'Are you in a calm, objective emotional state (no FOMO or revenge urgency)?',
    ],
    duringTradeRules: [
      'NEVER move or widen your initial stop loss under any circumstance.',
      'Allow the trade room to breathe: avoid panic closing during the first 5 minutes of market noise.',
      dos.find((d) => d.category === 'EXECUTION')?.instruction || 'Scale 50% at your primary target and trail stop to breakeven.',
    ],
    postTradeRules: [
      'Log the trade outcome, emotion, and any mistake tags immediately into your journal.',
      'If trade was a loss, take a mandatory 15-minute screen pause before assessing new setups.',
      `If you have completed ${recommendedDailyTrades} trades or reached -${recommendedDailyLossR}R loss today, SHUT DOWN the terminal.`,
    ],
  };

  return {
    scorecard,
    priorityDirectives,
    dos,
    donts,
    circuitBreakers,
    deskCheatSheet,
    dataHealth: {
      closedTradesCount: totalClosed,
      openTradesCount: openTrades.length,
      tradesWithRCount: rCount,
      tradesWithPsychologyCount: psychCount,
      tradesWithExcursionCount: excursionCount,
      symbolsCount: symbolMap.size,
      strategiesCount: strategyMap.size,
    },
  };
}
