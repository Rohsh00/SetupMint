import { IExcursionCandle } from './excursion.js';
import {
  Direction,
  PatternType,
  SecondLegStatus,
  LiquiditySide,
  MomentumRelation,
  IStrategyVariant,
  suggestTradeVariant,
} from '@tradevault/shared';

export interface IHtfTrendResult {
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0 to 1
  reasoning: string;
  swingHighs: Array<{ price: number; timestamp: number }>;
  swingLows: Array<{ price: number; timestamp: number }>;
  lastSwingHigh?: number;
  lastSwingLow?: number;
  prevSwingHigh?: number;
  prevSwingLow?: number;
  ema20?: number;
}

export type LtfSetupPattern =
  | 'EQL'
  | 'W-SWEEP'
  | 'W-UNSWEPT'
  | 'EQH'
  | 'M-SWEEP'
  | 'M-UNSWEPT';

export interface ILtfSetupResult {
  pattern: LtfSetupPattern;
  patternType: PatternType;
  secondLegStatus: SecondLegStatus;
  liquiditySide: LiquiditySide;
  sweepExtreme?: number;
  liquidityLevel?: number;
  necklinePrice?: number;
  leg1Price?: number;
  leg2Price?: number;
  confidence: number;
  reasoning: string;
}

export interface IClassifiedStrategyMatch {
  strategyId?: string;
  strategyName: string;
  variantKey?: string;
  variantName?: string;
  momentumRelation: MomentumRelation;
  htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  pattern: LtfSetupPattern;
  patternType: PatternType;
  secondLegStatus: SecondLegStatus;
  liquiditySide: LiquiditySide;
  sweepExtreme?: number;
  liquidityLevel?: number;
  confidence: number;
  reasoning: string;
}

/**
 * Calculates exponential moving average for candle closes.
 */
function calculateEma(candles: IExcursionCandle[], period: number): number | undefined {
  if (candles.length < period) return undefined;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.c, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Detects swing points (fractals / local extrema) with a specified radius.
 */
function findSwingPoints(
  candles: IExcursionCandle[],
  radius: number = 1
): {
  swingHighs: Array<{ price: number; timestamp: number; index: number }>;
  swingLows: Array<{ price: number; timestamp: number; index: number }>;
} {
  const swingHighs: Array<{ price: number; timestamp: number; index: number }> = [];
  const swingLows: Array<{ price: number; timestamp: number; index: number }> = [];

  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= radius; j++) {
      if (i - j >= 0) {
        if (candles[i - j].h > cur.h) isHigh = false;
        if (candles[i - j].l < cur.l) isLow = false;
      }
      if (i + j < candles.length) {
        if (candles[i + j].h > cur.h) isHigh = false;
        if (candles[i + j].l < cur.l) isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({ price: cur.h, timestamp: cur.t, index: i });
    }
    if (isLow) {
      swingLows.push({ price: cur.l, timestamp: cur.t, index: i });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * 1. Higher Timeframe (HTF) Trend Detection on 4H (240m) Candlesticks.
 * Evaluates market structure swings (HH/HL vs LH/LL) and 20 EMA trend alignment.
 */
export function detectHtfTrend4h(candles4h: IExcursionCandle[]): IHtfTrendResult {
  if (!candles4h || candles4h.length < 5) {
    return {
      htfTrend: 'NEUTRAL',
      confidence: 0.5,
      reasoning: 'Insufficient 4H candle history (< 5 candles) to determine trend.',
      swingHighs: [],
      swingLows: [],
    };
  }

  // Sort candles chronologically
  const sorted = [...candles4h].sort((a, b) => {
    const aMs = a.t < 1e11 ? a.t * 1000 : a.t;
    const bMs = b.t < 1e11 ? b.t * 1000 : b.t;
    return aMs - bMs;
  });

  const { swingHighs, swingLows } = findSwingPoints(sorted, 1);
  const ema20 = calculateEma(sorted, 20) ?? calculateEma(sorted, Math.min(10, sorted.length));
  const latestCandle = sorted[sorted.length - 1];

  let structureScore = 0; // positive = bullish, negative = bearish
  const reasons: string[] = [];

  const lastHigh = swingHighs[swingHighs.length - 1];
  const prevHigh = swingHighs[swingHighs.length - 2];
  const lastLow = swingLows[swingLows.length - 1];
  const prevLow = swingLows[swingLows.length - 2];

  if (lastHigh && prevHigh) {
    if (lastHigh.price > prevHigh.price) {
      structureScore += 2;
      reasons.push(`Higher High on 4H (${lastHigh.price.toFixed(2)} > ${prevHigh.price.toFixed(2)})`);
    } else if (lastHigh.price < prevHigh.price) {
      structureScore -= 2;
      reasons.push(`Lower High on 4H (${lastHigh.price.toFixed(2)} < ${prevHigh.price.toFixed(2)})`);
    }
  }

  if (lastLow && prevLow) {
    if (lastLow.price > prevLow.price) {
      structureScore += 2;
      reasons.push(`Higher Low on 4H (${lastLow.price.toFixed(2)} > ${prevLow.price.toFixed(2)})`);
    } else if (lastLow.price < prevLow.price) {
      structureScore -= 2;
      reasons.push(`Lower Low on 4H (${lastLow.price.toFixed(2)} < ${prevLow.price.toFixed(2)})`);
    }
  }

  // Check EMA alignment
  if (ema20 !== undefined) {
    if (latestCandle.c > ema20) {
      structureScore += 1;
      reasons.push(`4H Close (${latestCandle.c.toFixed(2)}) above 20 EMA (${ema20.toFixed(2)})`);
    } else if (latestCandle.c < ema20) {
      structureScore -= 1;
      reasons.push(`4H Close (${latestCandle.c.toFixed(2)}) below 20 EMA (${ema20.toFixed(2)})`);
    }
  }

  // Also check general net move if swings are sparse
  if (swingHighs.length < 2 && swingLows.length < 2) {
    const firstCandle = sorted[0];
    if (latestCandle.c > firstCandle.c) {
      structureScore += 1;
      reasons.push(`Net 4H price change positive (+${(latestCandle.c - firstCandle.c).toFixed(2)})`);
    } else {
      structureScore -= 1;
      reasons.push(`Net 4H price change negative (${(latestCandle.c - firstCandle.c).toFixed(2)})`);
    }
  }

  let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0.5;

  if (structureScore >= 2) {
    htfTrend = 'BULLISH';
    confidence = Math.min(0.95, 0.6 + structureScore * 0.08);
  } else if (structureScore <= -2) {
    htfTrend = 'BEARISH';
    confidence = Math.min(0.95, 0.6 + Math.abs(structureScore) * 0.08);
  } else {
    htfTrend = 'NEUTRAL';
    confidence = 0.5;
  }

  return {
    htfTrend,
    confidence: Number(confidence.toFixed(2)),
    reasoning: reasons.join('; ') || 'Indecisive 4H market structure.',
    swingHighs: swingHighs.map((s) => ({ price: s.price, timestamp: s.timestamp })),
    swingLows: swingLows.map((s) => ({ price: s.price, timestamp: s.timestamp })),
    lastSwingHigh: lastHigh?.price,
    lastSwingLow: lastLow?.price,
    prevSwingHigh: prevHigh?.price,
    prevSwingLow: prevLow?.price,
    ema20,
  };
}

/**
 * 2. Lower Timeframe (LTF) Setup Detection on 5-Minute (5m) Candlesticks.
 * Detects:
 * - Equal Lows Sweep (EQL) vs W-Pattern Swept (W-SWEEP) vs W-Pattern Unswept (W-UNSWEPT) for LONG
 * - Equal Highs Sweep (EQH) vs M-Pattern Swept (M-SWEEP) vs M-Pattern Unswept (M-UNSWEPT) for SHORT
 */
export function detectLtfSetup5m(params: {
  candles5m: IExcursionCandle[];
  direction: Direction;
  entryTimeMs: number;
  entryPrice?: number;
}): ILtfSetupResult {
  const { candles5m, direction, entryTimeMs, entryPrice } = params;

  if (!candles5m || candles5m.length < 4) {
    // Fallback default
    if (direction === 'LONG') {
      return {
        pattern: 'W-SWEEP',
        patternType: 'W',
        secondLegStatus: 'SWEPT',
        liquiditySide: 'SELL_SIDE',
        confidence: 0.5,
        reasoning: 'Insufficient 5M candle history to verify structure; defaulting to standard sweep.',
      };
    } else {
      return {
        pattern: 'M-SWEEP',
        patternType: 'M',
        secondLegStatus: 'SWEPT',
        liquiditySide: 'BUY_SIDE',
        confidence: 0.5,
        reasoning: 'Insufficient 5M candle history to verify structure; defaulting to standard sweep.',
      };
    }
  }

  // Filter candles strictly up to entry time (+ 1 entry candle tolerance)
  const priorCandles = candles5m
    .filter((c) => {
      const cMs = c.t < 1e11 ? c.t * 1000 : c.t;
      return cMs <= entryTimeMs + 5 * 60 * 1000;
    })
    .sort((a, b) => {
      const aMs = a.t < 1e11 ? a.t * 1000 : a.t;
      const bMs = b.t < 1e11 ? b.t * 1000 : b.t;
      return aMs - bMs;
    });

  const lookbackCandles = priorCandles.slice(-30); // Look at last ~2.5 hours of 5m action
  const { swingHighs, swingLows } = findSwingPoints(lookbackCandles, 1);

  if (direction === 'LONG') {
    // LONG ANALYSIS: SSL, Equal Lows, and W Patterns
    // 1. Check for Equal Lows (EQL): any pair of distinct swing lows with |L1 - L2| <= 0.2%
    let equalLowsPair: { l1: number; l2: number; idx1: number; idx2: number } | null = null;
    const allLows = swingLows.length >= 2 ? swingLows : [];

    for (let i = 0; i < allLows.length - 1; i++) {
      for (let j = i + 1; j < allLows.length; j++) {
        const p1 = allLows[i].price;
        const p2 = allLows[j].price;
        const threshold = Math.max(p1 * 0.002, 0.08);
        if (Math.abs(p1 - p2) <= threshold) {
          equalLowsPair = { l1: p1, l2: p2, idx1: allLows[i].index, idx2: allLows[j].index };
          break;
        }
      }
      if (equalLowsPair) break;
    }

    if (equalLowsPair) {
      const minL = Math.min(equalLowsPair.l1, equalLowsPair.l2);
      const maxL = Math.max(equalLowsPair.l1, equalLowsPair.l2);
      const sweepLow = Math.min(...lookbackCandles.map((c) => c.l));
      const neckline = Math.max(...lookbackCandles.map((c) => c.h));
      return {
        pattern: 'EQL',
        patternType: 'EQUAL_LOWS',
        secondLegStatus: 'NOT_APPLICABLE',
        liquiditySide: 'SELL_SIDE',
        sweepExtreme: sweepLow,
        liquidityLevel: maxL,
        necklinePrice: neckline,
        leg1Price: equalLowsPair.l1,
        leg2Price: equalLowsPair.l2,
        confidence: 0.92,
        reasoning: `Equal Lows detected (L1: ${equalLowsPair.l1.toFixed(2)}, L2: ${equalLowsPair.l2.toFixed(2)}, tolerance <= ${(equalLowsPair.l1 * 0.002).toFixed(2)}). Sell-side liquidity sweep & reclaim.`,
      };
    }

    // 2. W-Pattern Analysis: Compare two major troughs
    let l1: number;
    let l2: number;
    let sweepExtreme: number;
    let neckline = 0;

    if (swingLows.length >= 2) {
      const lastTwo = swingLows.slice(-2);
      l1 = lastTwo[0].price;
      l2 = lastTwo[1].price;
      sweepExtreme = Math.min(l1, l2, ...lookbackCandles.map((c) => c.l));
      const intervening = lookbackCandles.filter(
        (c) => c.t >= lastTwo[0].timestamp && c.t <= lastTwo[1].timestamp
      );
      neckline = intervening.length > 0 ? Math.max(...intervening.map((c) => c.h)) : (entryPrice || l1);
    } else {
      const half = Math.floor(lookbackCandles.length / 2);
      const firstHalf = lookbackCandles.slice(0, half);
      const secondHalf = lookbackCandles.slice(half);
      l1 = Math.min(...firstHalf.map((c) => c.l));
      l2 = Math.min(...secondHalf.map((c) => c.l));
      sweepExtreme = Math.min(l1, l2);
      neckline = Math.max(...lookbackCandles.map((c) => c.h));
    }

    if (l2 < l1) {
      // Second leg traded lower than first leg -> W Pattern Second Leg Sweep
      return {
        pattern: 'W-SWEEP',
        patternType: 'W',
        secondLegStatus: 'SWEPT',
        liquiditySide: 'SELL_SIDE',
        sweepExtreme: l2,
        liquidityLevel: l1,
        necklinePrice: neckline,
        leg1Price: l1,
        leg2Price: l2,
        confidence: 0.9,
        reasoning: `W-Pattern Second-Leg Sweep confirmed. Second low (${l2.toFixed(2)}) swept below first low (${l1.toFixed(2)}) taking sell-side liquidity before bullish reclaim.`,
      };
    } else {
      // Second leg held above first leg -> W Pattern Unswept Second Leg (Higher Low)
      return {
        pattern: 'W-UNSWEPT',
        patternType: 'W',
        secondLegStatus: 'UNSWEPT',
        liquiditySide: 'NONE',
        sweepExtreme: l2,
        liquidityLevel: l1,
        necklinePrice: neckline,
        leg1Price: l1,
        leg2Price: l2,
        confidence: 0.88,
        reasoning: `W-Pattern Unswept Second-Leg confirmed. Second low (${l2.toFixed(2)}) held above first low (${l1.toFixed(2)}) forming higher-low structure shift.`,
      };
    }
  } else {
    // SHORT ANALYSIS: BSL, Equal Highs, and M Patterns
    // 1. Check for Equal Highs (EQH): any pair of distinct swing highs with |H1 - H2| <= 0.2%
    let equalHighsPair: { h1: number; h2: number; idx1: number; idx2: number } | null = null;
    const allHighs = swingHighs.length >= 2 ? swingHighs : [];

    for (let i = 0; i < allHighs.length - 1; i++) {
      for (let j = i + 1; j < allHighs.length; j++) {
        const p1 = allHighs[i].price;
        const p2 = allHighs[j].price;
        const threshold = Math.max(p1 * 0.002, 0.08);
        if (Math.abs(p1 - p2) <= threshold) {
          equalHighsPair = { h1: p1, h2: p2, idx1: allHighs[i].index, idx2: allHighs[j].index };
          break;
        }
      }
      if (equalHighsPair) break;
    }

    if (equalHighsPair) {
      const sweepHigh = Math.max(...lookbackCandles.map((c) => c.h));
      const neckline = Math.min(...lookbackCandles.map((c) => c.l));
      return {
        pattern: 'EQH',
        patternType: 'EQUAL_HIGHS',
        secondLegStatus: 'NOT_APPLICABLE',
        liquiditySide: 'BUY_SIDE',
        sweepExtreme: sweepHigh,
        liquidityLevel: Math.min(equalHighsPair.h1, equalHighsPair.h2),
        necklinePrice: neckline,
        leg1Price: equalHighsPair.h1,
        leg2Price: equalHighsPair.h2,
        confidence: 0.92,
        reasoning: `Equal Highs detected (H1: ${equalHighsPair.h1.toFixed(2)}, H2: ${equalHighsPair.h2.toFixed(2)}, tolerance <= ${(equalHighsPair.h1 * 0.002).toFixed(2)}). Buy-side liquidity sweep & reclaim.`,
      };
    }

    // 2. M-Pattern Analysis: Compare two major peaks
    let h1: number;
    let h2: number;
    let sweepExtreme: number;
    let neckline = 0;

    if (swingHighs.length >= 2) {
      const lastTwo = swingHighs.slice(-2);
      h1 = lastTwo[0].price;
      h2 = lastTwo[1].price;
      sweepExtreme = Math.max(h1, h2, ...lookbackCandles.map((c) => c.h));
      const intervening = lookbackCandles.filter(
        (c) => c.t >= lastTwo[0].timestamp && c.t <= lastTwo[1].timestamp
      );
      neckline = intervening.length > 0 ? Math.min(...intervening.map((c) => c.l)) : (entryPrice || h1);
    } else {
      const half = Math.floor(lookbackCandles.length / 2);
      const firstHalf = lookbackCandles.slice(0, half);
      const secondHalf = lookbackCandles.slice(half);
      h1 = Math.max(...firstHalf.map((c) => c.h));
      h2 = Math.max(...secondHalf.map((c) => c.h));
      sweepExtreme = Math.max(h1, h2);
      neckline = Math.min(...lookbackCandles.map((c) => c.l));
    }

    if (h2 > h1) {
      // Second leg traded higher than first leg -> M Pattern Second Leg Sweep
      return {
        pattern: 'M-SWEEP',
        patternType: 'M',
        secondLegStatus: 'SWEPT',
        liquiditySide: 'BUY_SIDE',
        sweepExtreme: h2,
        liquidityLevel: h1,
        necklinePrice: neckline,
        leg1Price: h1,
        leg2Price: h2,
        confidence: 0.9,
        reasoning: `M-Pattern Second-Leg Sweep confirmed. Second high (${h2.toFixed(2)}) swept above first high (${h1.toFixed(2)}) taking buy-side liquidity before bearish rejection.`,
      };
    } else {
      // Second leg held below first leg -> M Pattern Unswept Second Leg (Lower High)
      return {
        pattern: 'M-UNSWEPT',
        patternType: 'M',
        secondLegStatus: 'UNSWEPT',
        liquiditySide: 'NONE',
        sweepExtreme: h2,
        liquidityLevel: h1,
        necklinePrice: neckline,
        leg1Price: h1,
        leg2Price: h2,
        confidence: 0.88,
        reasoning: `M-Pattern Unswept Second-Leg confirmed. Second high (${h2.toFixed(2)}) held below first high (${h1.toFixed(2)}) forming lower-high structure shift.`,
      };
    }
  }
}

/**
 * 3. Strategy & Variant Classifier.
 * Combines 4H HTF Trend + 5M LTF Pattern + Direction and matches against available user strategies.
 */
export function matchStrategyAndVariant(params: {
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ltfSetup: ILtfSetupResult;
  direction: Direction;
  availableStrategies: any[];
}): IClassifiedStrategyMatch {
  const { htfTrend, ltfSetup, direction, availableStrategies } = params;

  // Determine Momentum Relation (Retracement vs Reversal)
  let momentumRelation: MomentumRelation = 'UNKNOWN';
  let targetStrategyKind: 'BULL_RETRACEMENT' | 'BEAR_RETRACEMENT' | 'BULL_REVERSAL' | 'BEAR_REVERSAL';

  if (direction === 'LONG') {
    if (htfTrend === 'BULLISH') {
      momentumRelation = 'WITH_HTF';
      targetStrategyKind = 'BULL_RETRACEMENT';
    } else {
      // BEARISH or NEUTRAL
      momentumRelation = 'AGAINST_HTF';
      targetStrategyKind = 'BULL_REVERSAL';
    }
  } else {
    // SHORT
    if (htfTrend === 'BEARISH') {
      momentumRelation = 'WITH_HTF';
      targetStrategyKind = 'BEAR_RETRACEMENT';
    } else {
      // BULLISH or NEUTRAL
      momentumRelation = 'AGAINST_HTF';
      targetStrategyKind = 'BEAR_REVERSAL';
    }
  }

  // Search available strategies for best match
  let matchedStrategy: any = null;

  for (const strat of availableStrategies) {
    const sName = (strat.name || '').toLowerCase();
    const isRetracement = sName.includes('retracement') || strat.tags?.includes('Retracement');
    const isReversal = sName.includes('reversal') || strat.tags?.includes('Reversal');
    const isBullish = sName.includes('bullish') || strat.tags?.includes('Bullish');
    const isBearish = sName.includes('bearish') || strat.tags?.includes('Bearish');

    if (targetStrategyKind === 'BULL_RETRACEMENT' && isBullish && isRetracement) {
      matchedStrategy = strat;
      break;
    }
    if (targetStrategyKind === 'BEAR_RETRACEMENT' && isBearish && isRetracement) {
      matchedStrategy = strat;
      break;
    }
    if (targetStrategyKind === 'BULL_REVERSAL' && isBullish && isReversal) {
      matchedStrategy = strat;
      break;
    }
    if (targetStrategyKind === 'BEAR_REVERSAL' && isBearish && isReversal) {
      matchedStrategy = strat;
      break;
    }
  }

  // Fallback to first active strategy if explicit naming pattern not found
  if (!matchedStrategy && availableStrategies.length > 0) {
    matchedStrategy = availableStrategies[0];
  }

  const stratVariants: IStrategyVariant[] = matchedStrategy?.variants || [];
  let matchedVariantKey: string | undefined = undefined;
  let matchedVariantName: string | undefined = undefined;

  // Expected standard variant keys:
  // Bullish Retracement: BULL-SSL-EQL, BULL-SSL-W-SWEEP, BULL-W-UNSWEPT
  // Bearish Retracement: BEAR-BSL-EQH, BEAR-BSL-M-SWEEP, BEAR-M-UNSWEPT
  // Bullish Reversal: BULL-REV-SSL-EQL, BULL-REV-SSL-W-SWEEP, BULL-REV-W-UNSWEPT
  // Bearish Reversal: BEAR-REV-BSL-EQH, BEAR-REV-BSL-M-SWEEP, BEAR-REV-M-UNSWEPT

  if (stratVariants.length > 0) {
    // 1. Try finding by matching pattern and secondLegStatus in expected attributes
    const exactVariant = stratVariants.find((v) => {
      const exp = v.expected;
      if (!exp) return false;
      if (exp.direction && exp.direction !== direction) return false;
      if (exp.patternType && exp.patternType !== ltfSetup.patternType) return false;
      if (
        exp.secondLegStatus &&
        exp.secondLegStatus !== 'NOT_APPLICABLE' &&
        exp.secondLegStatus !== ltfSetup.secondLegStatus
      ) {
        return false;
      }
      return true;
    });

    if (exactVariant) {
      matchedVariantKey = exactVariant.key;
      matchedVariantName = exactVariant.name;
    } else {
      // 2. Try by key pattern naming convention
      const patKey = ltfSetup.pattern; // e.g. EQL, W-SWEEP, W-UNSWEPT
      const byKey = stratVariants.find((v) => v.key.toUpperCase().includes(patKey.replace('-', '')));
      if (byKey) {
        matchedVariantKey = byKey.key;
        matchedVariantName = byKey.name;
      } else {
        // 3. Fallback to suggestTradeVariant
        const sug = suggestTradeVariant({
          direction,
          patternType: ltfSetup.patternType,
          secondLegStatus: ltfSetup.secondLegStatus,
          liquiditySide: ltfSetup.liquiditySide,
          availableVariants: stratVariants,
        });
        if (sug.primaryVariantKey) {
          matchedVariantKey = sug.primaryVariantKey;
          const f = stratVariants.find((v) => v.key === sug.primaryVariantKey);
          matchedVariantName = f?.name;
        }
      }
    }
  }

  const confidence = Math.min(
    0.95,
    Number(((ltfSetup.confidence + (htfTrend !== 'NEUTRAL' ? 0.9 : 0.6)) / 2).toFixed(2))
  );

  const fullReasoning = `4H Trend: ${htfTrend} (${momentumRelation === 'WITH_HTF' ? 'With-HTF Retracement' : 'Counter-HTF Reversal'}). 5M Setup: ${ltfSetup.reasoning}`;

  return {
    strategyId: matchedStrategy?._id ? String(matchedStrategy._id) : undefined,
    strategyName: matchedStrategy?.name || 'Discretionary Market Structure',
    variantKey: matchedVariantKey,
    variantName: matchedVariantName,
    momentumRelation,
    htfBias: htfTrend,
    pattern: ltfSetup.pattern,
    patternType: ltfSetup.patternType,
    secondLegStatus: ltfSetup.secondLegStatus,
    liquiditySide: ltfSetup.liquiditySide,
    sweepExtreme: ltfSetup.sweepExtreme,
    liquidityLevel: ltfSetup.liquidityLevel,
    confidence,
    reasoning: fullReasoning,
  };
}
