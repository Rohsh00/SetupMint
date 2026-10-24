import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { Strategy, User } from '../db/models/index.js';

export async function insertReversalStrategies() {
  console.log('Connecting to database...');
  await connectDatabase();

  const targetEmail = 'komaltrader@gmail.com';
  const user = await User.findOne({ email: targetEmail });

  if (!user) {
    throw new Error(`Target user ${targetEmail} not found!`);
  }

  console.log(`Found target user: ${user.name} (${user.email}), ID: ${user._id}`);

  const strategiesToInsert = [
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
      tags: ['Reversal', 'LiquiditySweep', 'SMC', 'MSS', 'BullishReversal'],
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
      tags: ['Reversal', 'LiquiditySweep', 'SMC', 'MSS', 'BearishReversal'],
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

  for (const s of strategiesToInsert) {
    const existing = await Strategy.findOne({ userId: user._id, name: s.name });
    if (existing) {
      console.log(`Strategy "${s.name}" already exists for ${user.email}. Updating fields and variants...`);
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
      console.log(`Successfully updated strategy "${s.name}" (ID: ${existing._id}) with ${existing.variants.length} variants.`);
    } else {
      console.log(`Creating strategy "${s.name}" for ${user.email}...`);
      const created = await Strategy.create({
        ...s,
        userId: user._id,
      });
      console.log(`Successfully created strategy "${s.name}" (ID: ${created._id}) with ${created.variants.length} variants.`);
    }
  }

  console.log('\nVerification: Fetching all strategies for komaltrader...');
  const userStrategies = await Strategy.find({ userId: user._id });
  for (const strat of userStrategies) {
    console.log(`- [${strat._id}] ${strat.name} (Min R:R: ${strat.minRiskReward}, Variants: ${strat.variants?.length || 0})`);
    if (strat.variants && strat.variants.length > 0) {
      strat.variants.forEach((v) => {
        console.log(`    * [${v.key}] ${v.name}`);
      });
    }
  }

  await disconnectDatabase();
  console.log('Done!');
}

if (process.argv[1] && process.argv[1].endsWith('insert-reversal-strategies.ts')) {
  insertReversalStrategies().catch((err) => {
    console.error('Fatal error inserting reversal strategies:', err);
    process.exit(1);
  });
}
