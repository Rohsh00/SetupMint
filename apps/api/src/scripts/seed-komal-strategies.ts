import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { User, Strategy } from '../db/models/index.js';

export const FOUR_STRATEGIES = [
  // 1. Bullish HTF Retracement
  {
    name: 'Bullish HTF Retracement — LTF Liquidity Sweep & Confirmation',
    description:
      'Bullish daily/4h/1h structure retracing into demand/support/bullish OB. Trades sell-side liquidity sweeps on 5m with MSS, displacement, and confirmation targeting opposing swing highs and external buy-side liquidity.',
    assetClasses: ['EQUITY', 'FUTURES', 'COMMODITY', 'FOREX', 'OPTIONS', 'CRYPTO', 'INDEX'],
    timeframes: ['5m', '15m', '1h', '4h', 'Daily'],
    entryRules: [
      '1. Bullish daily/4h/1h structure confirmed into support, demand zone, or bullish order block.',
      '2. Sell-side liquidity pool raid identified (equal lows sweep or W pattern second leg).',
      '3. Bullish Market Structure Shift (MSS) or BOS with energetic displacement candle.',
      '4. Enter on predefined confirmation-candle close or retest of reclaimed level.',
    ],
    stopLossRules: [
      '1. Hard stop beyond actual sweep low / structural invalidation extreme.',
      '2. Calculate position size from entry-to-stop distance and risk limit.',
      '3. Never widen stop after entry.',
    ],
    targetRules: [
      '1. First target: Nearest opposing swing high or W neckline.',
      '2. Final target: Predefined external buy-side liquidity pool.',
    ],
    invalidationCriteria: [
      '1. Sustained candle close below the structural sweep low.',
      '2. Failure to hold the reclaimed liquidity level.',
    ],
    checklist: [
      '1. Higher timeframe bullish context verified.',
      '2. Sell-side liquidity taken prior to entry (or unswept continuation satisfied).',
      '3. Bullish displacement candle confirmed.',
      '4. Risk is strictly within defined account parameters.',
    ],
    minRiskReward: 2.0,
    tags: ['LiquiditySweep', 'SMC', 'BullishRetracement', 'MSS', 'Retracement', 'Bullish'],
    isActive: true,
    variants: [
      {
        key: 'BULL-SSL-EQL',
        name: 'Equal Lows Sweep',
        description:
          'Equal or near-equal 5m swing lows swept taking sell-side liquidity; rejection, reclaim, bullish MSS/BOS and displacement.',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'LONG',
          liquiditySide: 'SELL_SIDE',
          patternType: 'EQUAL_LOWS',
          secondLegStatus: 'NOT_APPLICABLE',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'Equal/near-equal 5m swing lows swept below taking sell-side liquidity',
          'Sharp rejection wick and clean reclaim of the sweep level',
          'Bullish MSS/BOS accompanied by energetic displacement candle',
          'Entry on confirmation candle close or optimal retest',
        ],
        stopLossRules: ['Hard stop beyond actual sweep low'],
        targetRules: ['Nearest opposing swing high and external buy-side liquidity target'],
        invalidationCriteria: ['Sustained 5m close below the sweep low'],
        checklist: ['Equal lows clearly identified', 'Sell-side liquidity taken', 'Displacement confirmed'],
        minRiskReward: 2.0,
      },
      {
        key: 'BULL-SSL-W-SWEEP',
        name: 'W Pattern, Second-Leg Sweep',
        description:
          'First 5m low forms W baseline; second low sweeps BELOW first low taking sell-side liquidity; reclaim, MSS + displacement.',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'LONG',
          liquiditySide: 'SELL_SIDE',
          patternType: 'W',
          secondLegStatus: 'SWEPT',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'First 5m low established, rally forms W neckline',
          'Second low trades below first low taking resting sell-side liquidity',
          'Reclaim and rejection followed by bullish MSS + displacement',
          'Entry on confirmation candle close or retest',
        ],
        stopLossRules: ['Hard stop below second-leg sweep low'],
        targetRules: ['W neckline and external buy-side liquidity target'],
        invalidationCriteria: ['Clean close below second-leg sweep low'],
        checklist: ['W structure clear', 'Second leg swept first low', 'MSS + displacement verified'],
        minRiskReward: 2.0,
      },
      {
        key: 'BULL-W-UNSWEPT',
        name: 'W Pattern, Second-Leg Unswept',
        description:
          'Second low stays ABOVE first low (liquidity untaken; must NOT be labelled a sweep). Testable continuation model with bullish shift.',
        isActive: true,
        sortOrder: 3,
        expected: {
          direction: 'LONG',
          liquiditySide: 'NONE',
          patternType: 'W',
          secondLegStatus: 'UNSWEPT',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'Second low forms higher than first low (liquidity untaken; not a sweep)',
          'Bullish structure shift and displacement through meaningful local swing high',
          'Enter on confirmation candle or retest of demand/breakout level',
        ],
        stopLossRules: ['Hard stop below second low subject to structural invalidation'],
        targetRules: ['W neckline and relevant buy-side liquidity'],
        invalidationCriteria: ['Close below the second low'],
        checklist: [
          'Second leg confirmed higher than first low',
          'Displacement through local swing high',
          'Not classified as a liquidity sweep',
        ],
        minRiskReward: 2.0,
      },
    ],
  },

  // 2. Bearish HTF Retracement
  {
    name: 'Bearish HTF Retracement — LTF Liquidity Sweep & Confirmation',
    description:
      'Bearish daily/4h/1h structure retracing into supply/resistance/bearish OB. Trades buy-side liquidity sweeps on 5m with MSS, displacement, and confirmation targeting opposing swing lows and external sell-side liquidity.',
    assetClasses: ['EQUITY', 'FUTURES', 'COMMODITY', 'FOREX', 'OPTIONS', 'CRYPTO', 'INDEX'],
    timeframes: ['5m', '15m', '1h', '4h', 'Daily'],
    entryRules: [
      '1. Bearish daily/4h/1h structure confirmed into resistance, supply zone, or bearish order block.',
      '2. Buy-side liquidity pool raid identified (equal highs sweep or M pattern second leg).',
      '3. Bearish Market Structure Shift (MSS) or BOS with energetic displacement candle.',
      '4. Enter on predefined confirmation-candle close or retest of reclaimed level.',
    ],
    stopLossRules: [
      '1. Hard stop beyond actual sweep high / structural invalidation extreme.',
      '2. Calculate position size from entry-to-stop distance and risk limit.',
      '3. Never widen stop after entry.',
    ],
    targetRules: [
      '1. First target: Nearest opposing swing low or M neckline.',
      '2. Final target: Predefined external sell-side liquidity pool.',
    ],
    invalidationCriteria: [
      '1. Sustained candle close above the structural sweep high.',
      '2. Failure to hold the reclaimed liquidity level.',
    ],
    checklist: [
      '1. Higher timeframe bearish context verified.',
      '2. Buy-side liquidity taken prior to entry (or unswept continuation satisfied).',
      '3. Bearish displacement candle confirmed.',
      '4. Risk is strictly within defined account parameters.',
    ],
    minRiskReward: 2.0,
    tags: ['LiquiditySweep', 'SMC', 'BearishRetracement', 'MSS', 'Retracement', 'Bearish'],
    isActive: true,
    variants: [
      {
        key: 'BEAR-BSL-EQH',
        name: 'Equal Highs Sweep',
        description:
          'Equal or near-equal 5m swing highs swept taking buy-side liquidity; rejection, reclaim, bearish MSS/BOS and displacement.',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'BUY_SIDE',
          patternType: 'EQUAL_HIGHS',
          secondLegStatus: 'NOT_APPLICABLE',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'Equal/near-equal 5m swing highs swept above taking buy-side liquidity',
          'Sharp rejection wick and clean reclaim of the sweep level back down',
          'Bearish MSS/BOS accompanied by energetic displacement candle',
          'Entry on confirmation candle close or optimal retest',
        ],
        stopLossRules: ['Hard stop above actual sweep high'],
        targetRules: ['Nearest opposing swing low and external sell-side liquidity target'],
        invalidationCriteria: ['Sustained 5m close above the sweep high'],
        checklist: ['Equal highs clearly identified', 'Buy-side liquidity taken', 'Displacement confirmed'],
        minRiskReward: 2.0,
      },
      {
        key: 'BEAR-BSL-M-SWEEP',
        name: 'M Pattern, Second-Leg Sweep',
        description:
          'First 5m high forms M baseline; second high sweeps ABOVE first high taking buy-side liquidity; reclaim, MSS + displacement.',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'BUY_SIDE',
          patternType: 'M',
          secondLegStatus: 'SWEPT',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'First 5m high established, pullback forms M neckline',
          'Second high trades above first high taking resting buy-side liquidity',
          'Reclaim and rejection followed by bearish MSS + displacement',
          'Entry on confirmation candle close or retest',
        ],
        stopLossRules: ['Hard stop above second-leg sweep high'],
        targetRules: ['M neckline and external sell-side liquidity target'],
        invalidationCriteria: ['Clean close above second-leg sweep high'],
        checklist: ['M structure clear', 'Second leg swept first high', 'MSS + displacement verified'],
        minRiskReward: 2.0,
      },
      {
        key: 'BEAR-M-UNSWEPT',
        name: 'M Pattern, Second-Leg Unswept',
        description:
          'Second high stays BELOW first high (liquidity untaken; must NOT be labelled a sweep). Testable continuation model with bearish shift.',
        isActive: true,
        sortOrder: 3,
        expected: {
          direction: 'SHORT',
          liquiditySide: 'NONE',
          patternType: 'M',
          secondLegStatus: 'UNSWEPT',
          momentumRelation: 'WITH_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          'Second high forms lower than first high (liquidity untaken; not a sweep)',
          'Bearish structure shift and displacement through meaningful local swing low',
          'Enter on confirmation candle or retest of supply/breakdown level',
        ],
        stopLossRules: ['Hard stop above second high subject to structural invalidation'],
        targetRules: ['M neckline and relevant sell-side liquidity'],
        invalidationCriteria: ['Close above the second high'],
        checklist: [
          'Second leg confirmed lower than first high',
          'Displacement through local swing low',
          'Not classified as a liquidity sweep',
        ],
        minRiskReward: 2.0,
      },
    ],
  },

  // 3. Bullish HTF Reversal
  {
    name: 'Bullish HTF Reversal — LTF Liquidity Sweep & Confirmation',
    description: [
      '1. Analyze the Daily, 4H, and 1H charts to identify bearish momentum, a possible exhaustion area, and major demand/support.',
      '2. Mark previous day low, session low, significant swing lows, equal lows, and other sell-side liquidity pools.',
      '3. Identify whether price forms equal lows, a W-pattern second-leg sweep, or an unswept W-pattern higher low.',
      '4. Treat the setup as a potential reversal, not a confirmed reversal, until lower-timeframe structure shifts bullish.',
      '5. Require evidence such as a reclaim of a swept level, bullish MSS/BOS, and clear displacement.',
      '6. Mark the actual structural invalidation point and the nearest opposing liquidity targets.',
      '7. Record the reversal context and selected child variant before entry.',
    ].join('\n'),
    minRiskReward: 1.5,
    assetClasses: ['EQUITY', 'FUTURES', 'COMMODITY', 'FOREX', 'OPTIONS', 'CRYPTO', 'INDEX'],
    timeframes: ['5m', '15m', '1h', '4h', 'Daily'],
    entryRules: [
      '1. Identify a meaningful low or potential reversal zone near support, demand, or sell-side liquidity.',
      '2. Confirm the selected variant\'s pattern and sweep status.',
      '3. Require bullish 5-minute MSS/BOS through a meaningful local swing high.',
      '4. Require clear bullish displacement; a wick or higher low alone is insufficient.',
      '5. Prefer entry on a retest of the reclaimed level, broken structure, or displacement origin.',
      '6. Avoid entering before confirmation or chasing an extended impulse.',
      '7. Skip the trade if the thesis is invalidated or minimum R:R is unavailable.',
    ],
    stopLossRules: [
      '1. For swept-low variants, place the stop below the actual sweep extreme with an appropriate buffer.',
      '2. For the unswept W variant, place the stop below the second low or predefined structural invalidation level.',
      '3. Calculate position size from entry-to-stop distance and the account risk limit.',
      '4. Include brokerage, taxes, fees, and realistic slippage.',
      '5. Never widen the stop after entry.',
    ],
    targetRules: [
      '1. Consider the nearest neckline, local swing high, or broken structure as an initial target where appropriate.',
      '2. Further targets may include equal highs, previous day high, session high, HTF resistance, and external buy-side liquidity.',
      '3. Define partial exits, final target, and trailing-stop rules before entry.',
      '4. Do not assume a complete Daily or 4H trend reversal from one 5-minute structure shift.',
      '5. Record planned R and realized R separately.',
    ],
    invalidationCriteria: [
      '1. Price breaks the predefined structural invalidation level.',
      '2. Bullish MSS/BOS or displacement fails to appear.',
      '3. Price fails to reclaim the swept level where the variant requires a reclaim.',
      '4. The selected pattern or sweep classification is incorrect.',
      '5. Minimum R:R is unavailable before entry.',
    ],
    checklist: [
      '1. Bearish context and potential reversal zone are documented.',
      '2. Key support, demand, and sell-side liquidity are marked.',
      '3. The selected pattern and sweep status are confirmed.',
      '4. Bullish MSS/BOS and displacement are present.',
      '5. Entry, stop, target, position size, account risk, and costs are calculated.',
      '6. The trade is classified as a reversal, not a bullish trend-continuation retracement.',
    ],
    tags: ['Reversal', 'LiquiditySweep', 'SMC', 'MSS', 'BullishReversal', 'Bullish'],
    isActive: true,
    variants: [
      {
        key: 'BULL-REV-SSL-EQL',
        name: 'Bullish Reversal — Equal Lows Liquidity Sweep',
        description:
          'Counter-momentum bullish reversal after price sweeps equal or near-equal lows during bearish momentum, reclaims the liquidity level, and confirms a bullish lower-timeframe structure shift. A sweep alone is not an entry signal.',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'LONG',
          patternType: 'EQUAL_LOWS',
          secondLegStatus: 'NOT_APPLICABLE',
          liquiditySide: 'SELL_SIDE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bearish HTF or intraday momentum and a potential reversal zone near support or demand.',
          '2. Mark equal or near-equal lows that are visible and relevant before the setup develops.',
          '3. Require price to trade below the equal lows, taking sell-side liquidity.',
          '4. Confirm rejection and reclaim above the swept level; do not treat a wick alone as confirmation.',
          '5. Require bullish 5-minute MSS/BOS through a meaningful local swing high.',
          '6. Require clear bullish displacement after the sweep.',
          '7. Enter on a retest of the reclaimed level, broken structure, or displacement origin.',
          '8. Target the nearest opposing swing high, neckline, equal highs, session high, or external buy-side liquidity.',
          '9. Skip the trade if bullish confirmation fails or minimum R:R is unavailable.',
        ],
        stopLossRules: [
          '1. Place the stop below the actual sweep low with an appropriate buffer.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
      {
        key: 'BULL-REV-SSL-W-SWEEP',
        name: 'Bullish Reversal — W Pattern Second-Leg Sweep',
        description:
          'Counter-momentum bullish reversal in which a W-pattern second low trades below the first low, sweeps sell-side liquidity, and then reclaims the level. A bullish MSS and displacement must confirm the potential change of direction.',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'LONG',
          patternType: 'W',
          secondLegStatus: 'SWEPT',
          liquiditySide: 'SELL_SIDE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bearish HTF momentum and a potential reversal zone near demand or significant support.',
          '2. Mark the first low, intervening rally/neckline, and second low.',
          '3. Require the second low to trade below the first low, sweeping sell-side liquidity.',
          '4. Confirm rejection and reclaim of the swept area.',
          '5. Require bullish 5-minute MSS/BOS through a meaningful local swing high.',
          '6. Require clear bullish displacement after the sweep.',
          '7. Prefer a neckline reclaim or enter on a retest of the reclaimed level or displacement origin.',
          '8. Target the W neckline first where appropriate, then opposing swing highs, equal highs, or external buy-side liquidity.',
          '9. Do not assume a full HTF trend reversal without further evidence.',
        ],
        stopLossRules: [
          '1. Place the stop below the actual second-leg sweep low with an appropriate buffer.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
      {
        key: 'BULL-REV-W-UNSWEPT',
        name: 'Bullish Reversal — W Pattern Unswept Second Leg',
        description:
          'Potential bullish counter-momentum reversal during bearish HTF conditions. The second W low holds above the first low, leaving the first low unswept. The higher low is only a potential signal; a bullish structure shift and displacement are required.',
        isActive: true,
        sortOrder: 3,
        expected: {
          direction: 'LONG',
          patternType: 'W',
          secondLegStatus: 'UNSWEPT',
          liquiditySide: 'NONE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bearish HTF momentum and a potential reversal zone near demand or support.',
          '2. Mark the first low, neckline, and second low.',
          '3. Confirm the second low remains above the first low.',
          '4. Record the setup as unswept; do not classify it as a sell-side liquidity sweep.',
          '5. Require bullish 5-minute MSS/BOS through a meaningful local swing high or lower high.',
          '6. Require clear bullish displacement; a higher low alone is insufficient.',
          '7. Enter on a retest of the broken structure or displacement origin.',
          '8. Target the neckline, nearest opposing swing high, or external buy-side liquidity.',
          '9. Treat the trade as a potential reversal until higher-timeframe evidence supports a broader trend change.',
        ],
        stopLossRules: [
          '1. Place the stop below the second low or predefined structural invalidation level.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
    ],
  },

  // 4. Bearish HTF Reversal
  {
    name: 'Bearish HTF Reversal — LTF Liquidity Sweep & Confirmation',
    description: [
      '1. Analyze the Daily, 4H, and 1H charts to identify bullish momentum, a possible exhaustion area, and major supply/resistance.',
      '2. Mark previous day high, session high, significant swing highs, equal highs, and other buy-side liquidity pools.',
      '3. Identify whether price forms equal highs, an M-pattern second-leg sweep, or an unswept M-pattern lower high.',
      '4. Treat the setup as a potential reversal, not a confirmed reversal, until lower-timeframe structure shifts bearish.',
      '5. Require evidence such as rejection or reclaim below a swept level, bearish MSS/BOS, and clear displacement.',
      '6. Mark the actual structural invalidation point and nearest opposing liquidity targets.',
      '7. Record the reversal context and selected child variant before entry.',
    ].join('\n'),
    minRiskReward: 1.5,
    assetClasses: ['EQUITY', 'FUTURES', 'COMMODITY', 'FOREX', 'OPTIONS', 'CRYPTO', 'INDEX'],
    timeframes: ['5m', '15m', '1h', '4h', 'Daily'],
    entryRules: [
      '1. Identify a meaningful high or potential reversal zone near resistance, supply, or buy-side liquidity.',
      '2. Confirm the selected variant\'s pattern and sweep status.',
      '3. Require bearish 5-minute MSS/BOS through a meaningful local swing low.',
      '4. Require clear bearish displacement; a wick or lower high alone is insufficient.',
      '5. Prefer entry on a retest of the reclaimed/broken level or displacement origin.',
      '6. Avoid entering before confirmation or chasing an extended impulse.',
      '7. Skip the trade if the thesis is invalidated or minimum R:R is unavailable.',
    ],
    stopLossRules: [
      '1. For swept-high variants, place the stop above the actual sweep extreme with an appropriate buffer.',
      '2. For the unswept M variant, place the stop above the second high or predefined structural invalidation level.',
      '3. Calculate position size from entry-to-stop distance and the account risk limit.',
      '4. Include brokerage, taxes, fees, and realistic slippage.',
      '5. Never widen the stop after entry.',
    ],
    targetRules: [
      '1. Consider the nearest neckline, local swing low, or broken structure as an initial target where appropriate.',
      '2. Further targets may include equal lows, previous day low, session low, HTF support, and external sell-side liquidity.',
      '3. Define partial exits, final target, and trailing-stop rules before entry.',
      '4. Do not assume a complete Daily or 4H trend reversal from one 5-minute structure shift.',
      '5. Record planned R and realized R separately.',
    ],
    invalidationCriteria: [
      '1. Price breaks the predefined structural invalidation level.',
      '2. Bearish MSS/BOS or displacement fails to appear.',
      '3. Price fails to reject or reclaim below the swept level where the variant requires it.',
      '4. The selected pattern or sweep classification is incorrect.',
      '5. Minimum R:R is unavailable before entry.',
    ],
    checklist: [
      '1. Bullish context and potential reversal zone are documented.',
      '2. Key resistance, supply, and buy-side liquidity are marked.',
      '3. The selected pattern and sweep status are confirmed.',
      '4. Bearish MSS/BOS and displacement are present.',
      '5. Entry, stop, target, position size, account risk, and costs are calculated.',
      '6. The trade is classified as a reversal, not a bearish trend-continuation retracement.',
    ],
    tags: ['Reversal', 'LiquiditySweep', 'SMC', 'MSS', 'BearishReversal', 'Bearish'],
    isActive: true,
    variants: [
      {
        key: 'BEAR-REV-BSL-EQH',
        name: 'Bearish Reversal — Equal Highs Liquidity Sweep',
        description:
          'Counter-momentum bearish reversal after price sweeps equal or near-equal highs during bullish momentum, rejects or reclaims below the liquidity level, and confirms a bearish lower-timeframe structure shift. A sweep alone is not an entry signal.',
        isActive: true,
        sortOrder: 1,
        expected: {
          direction: 'SHORT',
          patternType: 'EQUAL_HIGHS',
          secondLegStatus: 'NOT_APPLICABLE',
          liquiditySide: 'BUY_SIDE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bullish HTF or intraday momentum and a potential reversal zone near resistance or supply.',
          '2. Mark equal or near-equal highs that are visible and relevant before the setup develops.',
          '3. Require price to trade above the equal highs, taking buy-side liquidity.',
          '4. Confirm rejection and reclaim below the swept level; do not treat a wick alone as confirmation.',
          '5. Require bearish 5-minute MSS/BOS through a meaningful local swing low.',
          '6. Require clear bearish displacement after the sweep.',
          '7. Enter on a retest of the reclaimed level, broken structure, or displacement origin.',
          '8. Target the nearest opposing swing low, equal lows, session low, or external sell-side liquidity.',
          '9. Skip the trade if bearish confirmation fails or minimum R:R is unavailable.',
        ],
        stopLossRules: [
          '1. Place the stop above the actual sweep high with an appropriate buffer.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
      {
        key: 'BEAR-REV-BSL-M-SWEEP',
        name: 'Bearish Reversal — M Pattern Second-Leg Sweep',
        description:
          'Counter-momentum bearish reversal in which an M-pattern second high trades above the first high, sweeps buy-side liquidity, and then rejects or reclaims below the level. A bearish MSS and displacement must confirm the potential change of direction.',
        isActive: true,
        sortOrder: 2,
        expected: {
          direction: 'SHORT',
          patternType: 'M',
          secondLegStatus: 'SWEPT',
          liquiditySide: 'BUY_SIDE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bullish HTF momentum and a potential reversal zone near supply or significant resistance.',
          '2. Mark the first high, intervening pullback/neckline, and second high.',
          '3. Require the second high to trade above the first high, sweeping buy-side liquidity.',
          '4. Confirm rejection and reclaim below the swept area.',
          '5. Require bearish 5-minute MSS/BOS through a meaningful local swing low.',
          '6. Require clear bearish displacement after the sweep.',
          '7. Prefer a neckline breakdown or enter on a retest of the broken level or displacement origin.',
          '8. Target the M neckline first where appropriate, then opposing swing lows, equal lows, or external sell-side liquidity.',
          '9. Do not assume a full HTF trend reversal without further evidence.',
        ],
        stopLossRules: [
          '1. Place the stop above the actual second-leg sweep high with an appropriate buffer.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
      {
        key: 'BEAR-REV-M-UNSWEPT',
        name: 'Bearish Reversal — M Pattern Unswept Second Leg',
        description:
          'Potential bearish counter-momentum reversal during bullish HTF conditions. The second M high remains below the first high, leaving the first high unswept. The lower high is only a potential signal; a bearish structure shift and displacement are required.',
        isActive: true,
        sortOrder: 3,
        expected: {
          direction: 'SHORT',
          patternType: 'M',
          secondLegStatus: 'UNSWEPT',
          liquiditySide: 'NONE',
          momentumRelation: 'AGAINST_HTF',
          entryModel: 'RETEST',
        },
        entryRules: [
          '1. Identify bullish HTF momentum and a potential reversal zone near supply or resistance.',
          '2. Mark the first high, neckline, and second high.',
          '3. Confirm the second high remains below the first high.',
          '4. Record the setup as unswept; do not classify it as a buy-side liquidity sweep.',
          '5. Require bearish 5-minute MSS/BOS through a meaningful local swing low or higher low.',
          '6. Require clear bearish displacement; a lower high alone is insufficient.',
          '7. Enter on a retest of the broken structure or displacement origin.',
          '8. Target the neckline, nearest opposing swing low, or external sell-side liquidity.',
          '9. Treat the trade as a potential reversal until higher-timeframe evidence supports a broader trend change.',
        ],
        stopLossRules: [
          '1. Place the stop above the second high or predefined structural invalidation level.',
          '2. Calculate position size from entry-to-stop distance and the account risk limit.',
          '3. Include brokerage, taxes, fees, and realistic slippage.',
          '4. Never widen the stop after entry.',
          '5. Exit if the predefined structural invalidation condition is met.',
        ],
        targetRules: [],
        invalidationCriteria: [],
        checklist: [],
        minRiskReward: null,
      },
    ],
  },
];

async function main() {
  console.log('\n======================================================');
  console.log('🌱 Seeding 4 Core Strategies into komal@gmail.com');
  console.log('======================================================\n');

  await connectDatabase();

  const targetEmail = 'komal@gmail.com';
  const targetUser = await User.findOne({ email: targetEmail });
  if (!targetUser) {
    throw new Error(`Target user "${targetEmail}" not found in database!`);
  }

  console.log(`Target User: ${targetUser.name} (${targetUser.email}) [${targetUser._id}]\n`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const s of FOUR_STRATEGIES) {
    // Check if strategy already exists by matching normalized name (handling - vs —)
    const existing = await Strategy.findOne({
      userId: targetUser._id,
      $or: [
        { name: s.name },
        { name: s.name.replace('—', '-') },
        { name: s.name.replace('-', '—') },
      ],
    });

    if (existing) {
      console.log(`Updating existing strategy "${existing.name}" (ID: ${existing._id})...`);
      existing.name = s.name;
      existing.description = s.description;
      existing.minRiskReward = s.minRiskReward;
      existing.assetClasses = s.assetClasses as any;
      existing.timeframes = s.timeframes;
      existing.entryRules = s.entryRules;
      existing.stopLossRules = s.stopLossRules;
      existing.targetRules = s.targetRules;
      existing.invalidationCriteria = s.invalidationCriteria;
      existing.checklist = s.checklist;
      existing.tags = s.tags;
      existing.isActive = s.isActive;
      existing.variants = s.variants as any;
      await existing.save();
      updatedCount++;
      console.log(` ✓ Updated "${existing.name}" with ${existing.variants.length} variants.`);
    } else {
      console.log(`Creating strategy "${s.name}"...`);
      const created = await Strategy.create({
        ...s,
        userId: targetUser._id,
      });
      insertedCount++;
      console.log(` ✓ Created "${created.name}" (ID: ${created._id}) with ${created.variants.length} variants.`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`🎉 SUCCESS: ${insertedCount} created, ${updatedCount} updated for ${targetEmail}.`);
  console.log(`======================================================\n`);

  const userStrategies = await Strategy.find({ userId: targetUser._id }).sort({ createdAt: 1 });
  console.log(`All strategies for ${targetEmail} (${userStrategies.length}):`);
  for (const strat of userStrategies) {
    console.log(`\n📁 Strategy: "${strat.name}"`);
    console.log(`   ID: ${strat._id}`);
    console.log(`   Min R:R: ${strat.minRiskReward} | Active: ${strat.isActive}`);
    console.log(`   Tags: ${strat.tags?.join(', ') || 'none'}`);
    console.log(`   Variants (${strat.variants?.length || 0}):`);
    for (const v of strat.variants || []) {
      console.log(`    - [${v.key}] ${v.name}`);
      console.log(`      Direction: ${v.expected?.direction} | Pattern: ${v.expected?.patternType} | Sweep: ${v.expected?.secondLegStatus}`);
    }
  }

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('\n❌ [Error]', err.message);
  try {
    await disconnectDatabase();
  } catch {}
  process.exit(1);
});
