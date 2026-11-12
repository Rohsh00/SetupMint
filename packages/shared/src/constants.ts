import {
  AssetClass,
  AttachmentCategory,
  Confluence,
  Emotion,
  IInstrument,
  ITradeTemplate,
  MarketSegment,
  MistakeTag,
  TradingSession,
} from './types.js';

export const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'EQUITY', label: 'Equity / Stocks' },
  { value: 'FUTURES', label: 'Futures' },
  { value: 'OPTIONS', label: 'Options' },
  { value: 'COMMODITY', label: 'Commodity' },
  { value: 'FOREX', label: 'Forex' },
  { value: 'CRYPTO', label: 'Cryptocurrency' },
  { value: 'INDEX', label: 'Index' },
];

export const MARKET_SEGMENTS: { value: MarketSegment; label: string }[] = [
  { value: 'NSE_EQ', label: 'NSE Equity' },
  { value: 'NSE_FNO', label: 'NSE Futures & Options' },
  { value: 'BSE_EQ', label: 'BSE Equity' },
  { value: 'BSE_FNO', label: 'BSE Futures & Options' },
  { value: 'MCX', label: 'MCX Commodities' },
  { value: 'FOREX', label: 'Forex Spot / Futures' },
  { value: 'CRYPTO', label: 'Crypto Spot / Perps' },
  { value: 'US_EQUITY', label: 'US Equities (NASDAQ / NYSE)' },
  { value: 'CME', label: 'CME Futures' },
  { value: 'OTHER', label: 'Other Market' },
];

/**
 * Single Source of Truth: Unified Risk, Alert Hysteresis, Scaling Ladder & Statistical Thresholds.
 * Referenced across @tradevault/financial-engine, API alerts, Telegram cards, and help content.
 */
export const RISK_AND_ALERT_THRESHOLDS = {
  // Live Watcher & Telegram Stop Threat hysteresis (fraction of initial SL corridor remaining)
  STOP_CRITICAL_BUFFER_RATIO: 0.25, // <= 25% of initial SL buffer remaining = CRITICAL (75% consumed)
  STOP_ATTENTION_BUFFER_RATIO: 0.50, // <= 50% of initial SL buffer remaining = ATTENTION
  STOP_CLEAR_BUFFER_RATIO: 0.40, // > 40% recovers -> CLEARED

  // Live Watcher & Telegram Profit Giveback hysteresis
  CRITICAL_REVERSAL_PEAK_R: 1.0, // Reached >= +1.0R peak MFE
  CRITICAL_REVERSAL_CURRENT_R: 0.2, // Dropped to <= +0.2R current
  CRITICAL_REVERSAL_CLEAR_R: 0.5, // Clears when current R recovers > +0.5R
  GIVEBACK_WATCH_PEAK_R: 0.8,
  GIVEBACK_WATCH_PERCENT: 20,
  GIVEBACK_LEAKING_PEAK_R: 1.0,
  GIVEBACK_LEAKING_PERCENT: 35,
  GIVEBACK_CLEAR_PERCENT: 25,

  // Multi-Target Scaling Ladder ratios (whole-lot conservative floor rounding)
  LADDER_T1_RATIO_2STEP: 0.5, // 50% at T1 (+1.0R) for 2-lot positions
  LADDER_T1_RATIO_3STEP: 0.33, // 33% at T1 (+1.0R) for 3+ lot positions
  LADDER_T2_RATIO: 0.5, // 50% of remaining lots at T2 (+2.0R)

  // Statistical Edge & What-If thresholds
  MIN_RELIABLE_SAMPLE: 30,
  HOLDOUT_FRACTION: 0.30,
  MIN_HOLDOUT_SAMPLE: 15,
  CALIBRATION_MIN_AGREEMENT: 0.90,
  EMPIRICAL_BAYES_K: 10,
  MONTE_CARLO_DEFAULT_ITERATIONS: 10000,
  MONTE_CARLO_API_PREVIEW_ITERATIONS: 1000,

  // Canonical Discipline Score scale (1 to 5 stars, deterministic deductions from 5)
  DISCIPLINE_MIN: 1,
  DISCIPLINE_MAX: 5,
} as const;

export type EmotionCategory = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface IEmotionDefinition {
  value: Emotion;
  label: string;
  category: EmotionCategory;
  color: string;
}

export const EMOTIONS: IEmotionDefinition[] = [
  // Positive / Disciplined Mindset (Surfaced first)
  { value: 'CALM', label: 'Calm & Centered', category: 'POSITIVE', color: 'emerald' },
  { value: 'CONFIDENT', label: 'Confident & Prepared', category: 'POSITIVE', color: 'blue' },
  { value: 'DISCIPLINED', label: 'Disciplined & Rule-Adherent', category: 'POSITIVE', color: 'teal' },
  { value: 'PATIENT', label: 'Patient / Waiting for Level', category: 'POSITIVE', color: 'cyan' },
  { value: 'FOCUSED', label: 'Focused & Present', category: 'POSITIVE', color: 'sky' },
  { value: 'RELIEVED', label: 'Relieved / Execution Done', category: 'POSITIVE', color: 'emerald' },

  // Neutral / Observational Mindset
  { value: 'NEUTRAL', label: 'Neutral / Objective Routine', category: 'NEUTRAL', color: 'slate' },
  { value: 'BORED', label: 'Bored / Flat Session', category: 'NEUTRAL', color: 'zinc' },
  { value: 'HESITANT', label: 'Hesitant / Slight Reluctance', category: 'NEUTRAL', color: 'amber' },
  { value: 'DOUBTFUL_OF_LEVEL', label: 'Doubtful of Level Strength', category: 'NEUTRAL', color: 'stone' },

  // Negative / Reactive Mindset
  { value: 'ANXIOUS', label: 'Anxious / Hesitant', category: 'NEGATIVE', color: 'amber' },
  { value: 'FEARFUL', label: 'Fearful / Scared of Loss', category: 'NEGATIVE', color: 'orange' },
  { value: 'GREEDY', label: 'Greedy / Wanting Big Win', category: 'NEGATIVE', color: 'purple' },
  { value: 'EUPHORIC', label: 'Euphoric / Overconfident', category: 'NEGATIVE', color: 'indigo' },
  { value: 'FRUSTRATED', label: 'Frustrated / Angry', category: 'NEGATIVE', color: 'rose' },
  { value: 'IMPATIENT', label: 'Impatient / Front-Running', category: 'NEGATIVE', color: 'rose' },
  { value: 'FOMO', label: 'FOMO / Chasing Move', category: 'NEGATIVE', color: 'red' },
  { value: 'OVERCONFIDENT', label: 'Overconfident / Sizing Blindly', category: 'NEGATIVE', color: 'violet' },
  { value: 'STRESSED', label: 'Stressed / High Friction', category: 'NEGATIVE', color: 'orange' },
  { value: 'TILTED', label: 'Tilted / Emotionally Impaired', category: 'NEGATIVE', color: 'red' },
  { value: 'REVENGEFUL', label: 'Revengeful / Wanting Back Loss', category: 'NEGATIVE', color: 'rose' },
  { value: 'REGRETFUL', label: 'Regretful / Second-Guessing Plan', category: 'NEGATIVE', color: 'amber' },
  { value: 'FEAR_OF_STOP_HUNT', label: 'Fear of Stop Hunt / Paranoia', category: 'NEGATIVE', color: 'orange' },
];

export const EMOTION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  EMOTIONS.map((e) => [e.value, e.label])
);

export type MistakeCategory =
  | 'LIQUIDITY_LEVEL'
  | 'EXECUTION_TIMING'
  | 'RISK_DISCIPLINE'
  | 'SESSION_CONTEXT';

export interface IMistakeTagDefinition {
  value: MistakeTag;
  label: string;
  description: string;
  category: MistakeCategory;
}

export const MISTAKE_TAGS: IMistakeTagDefinition[] = [
  // Liquidity & Structural Level Mistakes (Surfaced First for S/R + Liquidity Traders)
  {
    value: 'ENTERED_BEFORE_SWEEP',
    label: 'Entered Before Sweep',
    description: 'Jumped into setup before resting high/low liquidity was raided',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'NO_LIQUIDITY_TAKEN',
    label: 'No Liquidity Taken',
    description: 'Traded in a liquidity vacuum / middle of range with no opposing orders',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'NO_CONFIRMATION_AFTER_SWEEP',
    label: 'No Confirmation Post-Sweep',
    description: 'Entered immediately upon sweep without LTF CHOCH or displacement',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'TRADED_INTO_HTF_LEVEL',
    label: 'Traded Into HTF Level',
    description: 'Bought directly into major HTF resistance or shorted into HTF demand',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'TRADED_MID_RANGE',
    label: 'Traded Mid-Range',
    description: 'Entered between key structural boundaries with 50/50 chop odds',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'STOP_INSIDE_LIQUIDITY_POOL',
    label: 'Stop Inside Liquidity Pool',
    description: 'Placed invalidation stop directly at equal highs/lows where sweeps occur',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'TARGET_NOT_AT_LIQUIDITY',
    label: 'Target Not at Liquidity',
    description: 'Set profit target at random price instead of resting opposing liquidity',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'NO_LIQUIDITY_TARGET',
    label: 'No Liquidity Target',
    description: 'Executed trade without defining an opposing resting liquidity target',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'COUNTER_TREND_NO_SWEEP',
    label: 'Counter-Trend Without Sweep',
    description: 'Faded strong trend without a clear HTF liquidity raid',
    category: 'LIQUIDITY_LEVEL',
  },
  {
    value: 'FAKE_BREAKOUT_CHASE',
    label: 'Chased Fake Breakout',
    description: 'Bought high of day or shorted low of day on obvious trap volume',
    category: 'LIQUIDITY_LEVEL',
  },

  // Execution & Timing Mistakes
  {
    value: 'EARLY_ENTRY',
    label: 'Early Entry',
    description: 'Anticipated setup before actual trigger candle closed',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'LATE_ENTRY',
    label: 'Late Entry',
    description: 'Missed optimal zone/retest, chased entry with poor R:R',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'FOMO_ENTRY',
    label: 'FOMO / Impulse Entry',
    description: 'Entered on momentum spike purely out of fear of missing the move',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'FOMO',
    label: 'FOMO / Chasing Move',
    description: 'Entering after the move started because of fear of missing out',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'CHASED_MARKET',
    label: 'Chased Market',
    description: 'Accepting poor entry price and bad risk-to-reward ratio',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'PREMATURE_EXIT',
    label: 'Premature Exit',
    description: 'Closing winning trade before target without structural invalidation',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'BREAKEVEN_TOO_EARLY',
    label: 'Moved Breakeven Too Early',
    description: 'Choked trade breathing room before structure gave reason to trail',
    category: 'EXECUTION_TIMING',
  },
  {
    value: 'STOP_TOO_TIGHT',
    label: 'Stop Loss Too Tight',
    description: 'Placed stop within normal market noise and tick volatility',
    category: 'EXECUTION_TIMING',
  },

  // Risk & Discipline Mistakes
  {
    value: 'REVENGE_TRADING',
    label: 'Revenge Trading',
    description: 'Trying to quickly make back a recent loss with impulsive entry',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'OVERTRADING',
    label: 'Overtrading',
    description: 'Taking trades outside playbook or beyond daily risk limit',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'STOP_MOVED',
    label: 'Moved Stop Loss',
    description: 'Widening or moving stop loss further away during trade lifecycle',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'SIZE_VIOLATION',
    label: 'Position Sizing Violation',
    description: 'Trading bigger than permitted by portfolio risk rules',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'NO_STOP_LOSS',
    label: 'No Hard Stop Loss',
    description: 'Entered position without predefined hard invalidation order',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'ADDED_TO_LOSER',
    label: 'Added to Losing Trade',
    description: 'Averaged down on an invalidating position without an edge',
    category: 'RISK_DISCIPLINE',
  },
  {
    value: 'POOR_RR',
    label: 'Poor Risk/Reward Ratio',
    description: 'Planned reward was lower than minimum strategy threshold',
    category: 'RISK_DISCIPLINE',
  },

  // Session & Macro Context Mistakes
  {
    value: 'IGNORED_HTF_BIAS',
    label: 'Ignored HTF Bias',
    description: 'Fought dominant daily/weekly trend direction without structure shift',
    category: 'SESSION_CONTEXT',
  },
  {
    value: 'TRADED_OUTSIDE_SESSION',
    label: 'Traded Outside Session',
    description: 'Executed outside prime volume killzones and core market hours',
    category: 'SESSION_CONTEXT',
  },
  {
    value: 'TRADED_NEWS_EVENT',
    label: 'Traded News Event',
    description: 'Held or entered through high-impact scheduled macroeconomic release',
    category: 'SESSION_CONTEXT',
  },
  {
    value: 'NEWS_GAMBLE',
    label: 'News Gambling',
    description: 'Holding high leverage through unpredictable macro events',
    category: 'SESSION_CONTEXT',
  },
];

export const MISTAKE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  MISTAKE_TAGS.map((m) => [m.value, m.label])
);

export type ConfluenceCategory =
  | 'LIQUIDITY'
  | 'SUPPORT_RESISTANCE'
  | 'CONFIRMATION_STRUCTURE'
  | 'INDICATORS_OTHER';

export interface IConfluenceDefinition {
  value: Confluence;
  label: string;
  category: ConfluenceCategory;
  description?: string;
}

export const CONFLUENCES: IConfluenceDefinition[] = [
  // ==========================================
  // 1. LIQUIDITY (Surfaced First for Liquidity Traders)
  // ==========================================
  {
    value: 'BUY_SIDE_LIQUIDITY_SWEEP',
    label: 'Buy-Side Liquidity (BSL) Sweep',
    category: 'LIQUIDITY',
    description: 'Swept buy stops above previous swing high / equal highs',
  },
  {
    value: 'SELL_SIDE_LIQUIDITY_SWEEP',
    label: 'Sell-Side Liquidity (SSL) Sweep',
    category: 'LIQUIDITY',
    description: 'Swept sell stops below previous swing low / equal lows',
  },
  {
    value: 'EQUAL_HIGHS',
    label: 'Equal Highs (EQH) Liquidity Pool',
    category: 'LIQUIDITY',
    description: 'Double top resting liquidity target or raid level',
  },
  {
    value: 'EQUAL_LOWS',
    label: 'Equal Lows (EQL) Liquidity Pool',
    category: 'LIQUIDITY',
    description: 'Double bottom resting liquidity target or raid level',
  },
  {
    value: 'PREV_DAY_HIGH_SWEEP',
    label: 'Previous Day High (PDH) Sweep',
    category: 'LIQUIDITY',
    description: 'Raided previous session high before rejection',
  },
  {
    value: 'PREV_DAY_LOW_SWEEP',
    label: 'Previous Day Low (PDL) Sweep',
    category: 'LIQUIDITY',
    description: 'Raided previous session low before reversal',
  },
  {
    value: 'PREV_WEEK_HIGH_SWEEP',
    label: 'Previous Week High (PWH) Sweep',
    category: 'LIQUIDITY',
    description: 'Major weekly swing high raid',
  },
  {
    value: 'PREV_WEEK_LOW_SWEEP',
    label: 'Previous Week Low (PWL) Sweep',
    category: 'LIQUIDITY',
    description: 'Major weekly swing low raid',
  },
  {
    value: 'ASIAN_RANGE_SWEEP',
    label: 'Asian Range Sweep (Judas Swing)',
    category: 'LIQUIDITY',
    description: 'London / Frankfurt open raid of overnight Asian session range',
  },
  {
    value: 'SESSION_HIGH_LOW_SWEEP',
    label: 'Session High/Low Sweep',
    category: 'LIQUIDITY',
    description: 'Morning or afternoon extreme sweep',
  },
  {
    value: 'STOP_HUNT',
    label: 'Stop Hunt / Turtle Soup',
    category: 'LIQUIDITY',
    description: 'Engineered false breakout trapping breakout traders',
  },
  {
    value: 'INDUCEMENT',
    label: 'Inducement (IDM) Trap',
    category: 'LIQUIDITY',
    description: 'Engineered minor swing high/low bait before real reversal',
  },
  {
    value: 'TRENDLINE_LIQUIDITY',
    label: 'Trendline Liquidity Run',
    category: 'LIQUIDITY',
    description: 'Retail trendline stop cascade raid',
  },
  {
    value: 'LIQUIDITY_VOID',
    label: 'Liquidity Void / Imbalance',
    category: 'LIQUIDITY',
    description: 'Fast price expansion leaving unfilled price void',
  },
  {
    value: 'LIQUIDITY_POOL_TARGET',
    label: 'Target Opposing Liquidity Pool',
    category: 'LIQUIDITY',
    description: 'Exiting at resting liquidity pool across the range',
  },
  {
    value: 'LIQUIDITY_GRAB_REJECTION',
    label: 'Liquidity Grab & Rejection Wick',
    category: 'LIQUIDITY',
    description: 'Clear candle pin/wick rejecting beyond key liquidity level',
  },
  {
    value: 'LIQUIDITY_SWEEP',
    label: 'Liquidity Sweep / Raid (General)',
    category: 'LIQUIDITY',
    description: 'General liquidity raid across key levels',
  },

  // ==========================================
  // 2. SUPPORT / RESISTANCE
  // ==========================================
  {
    value: 'HTF_SUPPORT',
    label: 'Higher Timeframe (HTF) Support',
    category: 'SUPPORT_RESISTANCE',
    description: 'Daily / 4-hour key institutional support level',
  },
  {
    value: 'HTF_RESISTANCE',
    label: 'Higher Timeframe (HTF) Resistance',
    category: 'SUPPORT_RESISTANCE',
    description: 'Daily / 4-hour key institutional resistance level',
  },
  {
    value: 'SUPPORT_RESISTANCE_FLIP',
    label: 'Support / Resistance Flip',
    category: 'SUPPORT_RESISTANCE',
    description: 'Prior broken resistance becomes support (or vice-versa)',
  },
  {
    value: 'SUPPORT_RETEST',
    label: 'Support Level Retest',
    category: 'SUPPORT_RESISTANCE',
    description: 'Clean pullback and bounce from established support',
  },
  {
    value: 'RESISTANCE_RETEST',
    label: 'Resistance Level Retest',
    category: 'SUPPORT_RESISTANCE',
    description: 'Clean pullback and rejection from established resistance',
  },
  {
    value: 'DEMAND_ZONE',
    label: 'Institutional Demand Zone',
    category: 'SUPPORT_RESISTANCE',
    description: 'Base of aggressive buying origin / order cluster',
  },
  {
    value: 'SUPPLY_ZONE',
    label: 'Institutional Supply Zone',
    category: 'SUPPORT_RESISTANCE',
    description: 'Base of aggressive selling origin / distribution',
  },
  {
    value: 'KEY_LEVEL_REJECTION',
    label: 'Key Horizontal Level Rejection',
    category: 'SUPPORT_RESISTANCE',
    description: 'Strong wick rejection off proven horizontal price pivot',
  },
  {
    value: 'ROUND_NUMBER_LEVEL',
    label: 'Round Number / Psychological Strike',
    category: 'SUPPORT_RESISTANCE',
    description: 'Heavy institutional resting volume at round strike (e.g. 25,000 / 50,000)',
  },
  {
    value: 'PREV_DAY_HIGH_LOW_LEVEL',
    label: 'Prev Day High / Low Reference Level',
    category: 'SUPPORT_RESISTANCE',
    description: 'PDH or PDL horizontal support/resistance reference',
  },
  {
    value: 'OPENING_RANGE_LEVEL',
    label: 'Opening Range Level',
    category: 'SUPPORT_RESISTANCE',
    description: 'Initial 15m high/low reference boundary',
  },
  {
    value: 'VWAP_LEVEL',
    label: 'VWAP Anchor / Band Level',
    category: 'SUPPORT_RESISTANCE',
    description: 'Session VWAP or upper/lower deviation band touch',
  },
  {
    value: 'FAKE_BREAKOUT_RECLAIM',
    label: 'Fake Breakout & Reclaim',
    category: 'SUPPORT_RESISTANCE',
    description: 'Price pierced level and immediately reclaimed inside boundary',
  },
  {
    value: 'DOUBLE_TOP_BOTTOM',
    label: 'Double Top / Double Bottom Level',
    category: 'SUPPORT_RESISTANCE',
    description: 'Classic double top or double bottom structural pivot',
  },
  {
    value: 'RANGE_HIGH_LOW_REJECTION',
    label: 'Range High / Low Boundary Rejection',
    category: 'SUPPORT_RESISTANCE',
    description: 'Rejection at outer boundary of multi-hour consolidation',
  },
  {
    value: 'OI_WALL_CE',
    label: 'Highest Call OI Wall (Resistance)',
    category: 'SUPPORT_RESISTANCE',
    description: 'Option chain highest open interest call strike acting as ceiling',
  },
  {
    value: 'OI_WALL_PE',
    label: 'Highest Put OI Wall (Support)',
    category: 'SUPPORT_RESISTANCE',
    description: 'Option chain highest open interest put strike acting as floor',
  },
  {
    value: 'SUPPORT_RESISTANCE',
    label: 'Key Support / Resistance (General)',
    category: 'SUPPORT_RESISTANCE',
    description: 'General support or resistance horizontal level',
  },
  {
    value: 'PDH_PDL',
    label: 'Prev Day High / Low (Legacy)',
    category: 'SUPPORT_RESISTANCE',
    description: 'Previous day extreme',
  },
  {
    value: 'PWH_PWL',
    label: 'Prev Week High / Low (Legacy)',
    category: 'SUPPORT_RESISTANCE',
    description: 'Previous week extreme',
  },

  // ==========================================
  // 3. CONFIRMATION & STRUCTURE
  // ==========================================
  {
    value: 'MARKET_STRUCTURE_SHIFT',
    label: 'Market Structure Shift (MSS)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Shift from bullish to bearish order flow (or vice-versa)',
  },
  {
    value: 'DISPLACEMENT',
    label: 'Displacement / Energetic Candle',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Large directional body candle showing institutional footprint',
  },
  {
    value: 'CHOCH',
    label: 'Change of Character (CHOCH)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'First structural break signaling trend exhaustion',
  },
  {
    value: 'BOS',
    label: 'Break of Structure (BOS)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Break of previous swing point confirming trend continuation',
  },
  {
    value: 'FVG',
    label: 'Fair Value Gap (FVG)',
    category: 'CONFIRMATION_STRUCTURE',
    description: '3-candle imbalance price target and entry mitigation zone',
  },
  {
    value: 'ORDER_BLOCK',
    label: 'Order Block (OB)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Institutional sponsorship candle preceding displacement',
  },
  {
    value: 'BREAKER_BLOCK',
    label: 'Breaker Block (Failed OB)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Invalidated order block flipping into support/resistance',
  },
  {
    value: 'MITIGATION_BLOCK',
    label: 'Mitigation Block',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Re-test block mitigating institutional drawdowns',
  },
  {
    value: 'PREMIUM_ZONE_ENTRY',
    label: 'Premium Zone Entry (Shorts)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Selling above 50% equilibrium of dealing range',
  },
  {
    value: 'DISCOUNT_ZONE_ENTRY',
    label: 'Discount Zone Entry (Longs)',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Buying below 50% equilibrium of dealing range',
  },
  {
    value: 'LTF_CONFIRMATION_CANDLE',
    label: 'LTF Confirmation Candle',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Lower timeframe reversal trigger candle (pinbar/engulfing)',
  },
  {
    value: 'LEVEL_RECLAIM',
    label: 'Level Reclaim & Hold',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Price pierced and accepted back above/below key level with rejection',
  },
  {
    value: 'VOLUME_SPIKE_AT_LEVEL',
    label: 'Volume Spike at Key Level',
    category: 'CONFIRMATION_STRUCTURE',
    description: 'Anomalous trading volume at reaction level',
  },

  // ==========================================
  // 4. INDICATORS & OTHER
  // ==========================================
  {
    value: 'TRENDLINE',
    label: 'Trendline Liquidity / Slope',
    category: 'INDICATORS_OTHER',
    description: 'Dynamic trendline support or resistance',
  },
  {
    value: 'FIBONACCI',
    label: 'Fibonacci Golden Pocket / OTE',
    category: 'INDICATORS_OTHER',
    description: '0.618 - 0.786 optimal trade entry zone',
  },
  {
    value: 'EMA_CROSS',
    label: 'EMA Alignment / Dynamic S/R',
    category: 'INDICATORS_OTHER',
    description: 'Exponential moving average trend alignment',
  },
  {
    value: 'VWAP',
    label: 'VWAP Rejection / Deviation',
    category: 'INDICATORS_OTHER',
    description: 'Volume-weighted average price reaction',
  },
  {
    value: 'VOLUME_SPIKE',
    label: 'Institutional Volume Spike',
    category: 'INDICATORS_OTHER',
    description: 'Volume > 2x average indicating smart money involvement',
  },
];

export const CONFLUENCE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CONFLUENCES.map((c) => [c.value, c.label])
);

export const LIQUIDITY_CONFLUENCE_VALUES: Set<string> = new Set(
  CONFLUENCES.filter((c) => c.category === 'LIQUIDITY').map((c) => c.value)
);

export const SR_CONFLUENCE_VALUES: Set<string> = new Set(
  CONFLUENCES.filter((c) => c.category === 'SUPPORT_RESISTANCE').map((c) => c.value)
);

export const LIQUIDITY_OR_SR_CONFLUENCE_VALUES: Set<string> = new Set([
  ...Array.from(LIQUIDITY_CONFLUENCE_VALUES),
  ...Array.from(SR_CONFLUENCE_VALUES),
]);

export const LIQUIDITY_RULE_CHECKLIST: string[] = [
  'HTF bias identified and trade aligned with it',
  'Key liquidity pool marked (equal highs/lows, PDH/PDL, session high/low)',
  'Liquidity was actually swept (wick beyond the level)',
  'Price reclaimed / rejected the level (no acceptance beyond it)',
  'LTF confirmation (CHOCH / MSS / displacement) after the sweep',
  'Entry at a valid zone (OB / FVG / S-R flip / demand-supply)',
  'Stop placed beyond the sweep wick, NOT inside a liquidity pool',
  'Target set at the next opposing liquidity pool or key level',
  'Planned R:R meets strategy minimum',
  'Inside valid session / no high-impact news conflict',
];

export const TRADING_SESSIONS: { value: TradingSession; label: string; timing: string }[] = [
  { value: 'NSE_REGULAR', label: 'NSE Market Hours', timing: '09:15 - 15:30 IST' },
  { value: 'MCX_EVENING', label: 'MCX Evening Session', timing: '17:00 - 23:30 IST' },
  { value: 'ASIA', label: 'Asian Session', timing: 'Tokyo / Sydney' },
  { value: 'LONDON', label: 'London Session', timing: '08:00 - 16:30 GMT' },
  { value: 'NEW_YORK', label: 'New York Session', timing: '09:30 - 16:00 EST' },
  { value: 'OFF_HOURS', label: 'Weekend / 24/7 Crypto', timing: 'Anytime' },
];

/**
 * Effective-dated NSE & BSE Index F&O Contract Lot Size Schedule.
 * Sources:
 *  - SEBI Circular SEBI/HO/MRD/TPD-1/P/CIR/2024/160 (minimum contract value ₹15–20L)
 *  - NSE Circular NSE/FAOP/61630 (Apr 26, 2024: NIFTY -> 25, FINNIFTY -> 25 eff. Jul 2024)
 *  - NSE Circular NSE/FAOP/64312 (Oct 2024 / eff. Nov 20, 2024: NIFTY -> 75, BANKNIFTY -> 30/35, FINNIFTY -> 65, MIDCPNIFTY -> 140)
 *  - NSE Circular NSE/FAOP/70616 (Oct 28, 2025 / eff. Dec 31, 2025 – Jan 2026: NIFTY -> 65, BANKNIFTY -> 30, FINNIFTY -> 60, MIDCPNIFTY -> 120, NIFTYNXT50 -> 25)
 *  - BSE Notice 20241025-17 (eff. Nov 22, 2024: SENSEX -> 20, BANKEX -> 30)
 */
export interface ILotSizeScheduleEntry {
  effectiveFrom: string; // Inclusive YYYY-MM-DD (IST)
  lotSize: number;
  source: string;
}

export const INDEX_LOT_SIZE_HISTORY: Record<string, readonly ILotSizeScheduleEntry[]> = {
  NIFTY: [
    { effectiveFrom: '1900-01-01', lotSize: 50, source: 'NSE pre-Apr 2024' },
    { effectiveFrom: '2024-04-26', lotSize: 25, source: 'NSE/FAOP/61630 (eff. Apr 26, 2024)' },
    { effectiveFrom: '2024-11-20', lotSize: 75, source: 'NSE/FAOP/64312 (eff. Nov 20, 2024)' },
    { effectiveFrom: '2026-01-01', lotSize: 65, source: 'NSE/FAOP/70616 (eff. Jan 2026)' },
  ],
  BANKNIFTY: [
    { effectiveFrom: '1900-01-01', lotSize: 15, source: 'NSE pre-Nov 2024' },
    { effectiveFrom: '2024-11-20', lotSize: 30, source: 'NSE/FAOP/64312 (eff. Nov 20, 2024)' },
    { effectiveFrom: '2025-04-25', lotSize: 35, source: 'NSE lot revision Apr 2025' },
    { effectiveFrom: '2026-01-01', lotSize: 30, source: 'NSE/FAOP/70616 (eff. Jan 2026)' },
  ],
  FINNIFTY: [
    { effectiveFrom: '1900-01-01', lotSize: 40, source: 'NSE pre-Jul 2024' },
    { effectiveFrom: '2024-07-01', lotSize: 25, source: 'NSE/FAOP/61630 (eff. Jul 2024)' },
    { effectiveFrom: '2024-11-20', lotSize: 65, source: 'NSE/FAOP/64312 (eff. Nov 20, 2024)' },
    { effectiveFrom: '2026-01-01', lotSize: 60, source: 'NSE/FAOP/70616 (eff. Jan 2026)' },
  ],
  MIDCPNIFTY: [
    { effectiveFrom: '1900-01-01', lotSize: 75, source: 'NSE pre-Jul 2024' },
    { effectiveFrom: '2024-07-01', lotSize: 50, source: 'NSE/FAOP/61630 (eff. Jul 2024)' },
    { effectiveFrom: '2024-11-20', lotSize: 140, source: 'NSE/FAOP/64312 (eff. Nov 20, 2024)' },
    { effectiveFrom: '2026-01-01', lotSize: 120, source: 'NSE/FAOP/70616 (eff. Jan 2026)' },
  ],
  NIFTYNXT50: [
    { effectiveFrom: '1900-01-01', lotSize: 10, source: 'NSE pre-Nov 2024' },
    { effectiveFrom: '2024-11-20', lotSize: 25, source: 'NSE/FAOP/64312 / NSE/FAOP/70616' },
  ],
  SENSEX: [
    { effectiveFrom: '1900-01-01', lotSize: 10, source: 'BSE pre-Nov 2024' },
    { effectiveFrom: '2024-11-22', lotSize: 20, source: 'BSE Notice 20241025-17 (eff. Nov 22, 2024)' },
  ],
  BANKEX: [
    { effectiveFrom: '1900-01-01', lotSize: 15, source: 'BSE pre-Nov 2024' },
    { effectiveFrom: '2024-11-22', lotSize: 30, source: 'BSE Notice 20241025-17 (eff. Nov 22, 2024)' },
  ],
  SENSEX50: [
    { effectiveFrom: '1900-01-01', lotSize: 25, source: 'BSE pre-Nov 2024' },
    { effectiveFrom: '2024-11-22', lotSize: 60, source: 'BSE Notice 20241025-17 (eff. Nov 22, 2024)' },
  ],
};

function toIstYmdForSchedule(dateInput?: Date | string): string {
  if (!dateInput) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    return dateInput.slice(0, 10);
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return toIstYmdForSchedule();
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

/**
 * Resolves the effective regulatory lot size for Indian index derivatives on `asOfDate`.
 * Falls back to current `PRESET_INSTRUMENTS` lot size for non-indexed symbols.
 */
export function getEffectiveLotSize(symbol: string, asOfDate?: Date | string): number | undefined {
  const clean = (symbol || '').trim().toUpperCase().replace(/^(NSE:|BSE:|MCX:|NFO:|BFO:)/i, '');
  const schedule = INDEX_LOT_SIZE_HISTORY[clean];
  if (schedule && schedule.length > 0) {
    const targetYmd = toIstYmdForSchedule(asOfDate);
    let resolved = schedule[0].lotSize;
    for (const entry of schedule) {
      if (targetYmd >= entry.effectiveFrom) {
        resolved = entry.lotSize;
      }
    }
    return resolved;
  }
  const preset = PRESET_INSTRUMENTS.find((p) => p.symbol === clean);
  return preset?.lotSize;
}

/**
 * Returns exchange-compliant tick size by price band for Indian markets.
 * Sources:
 *  - NSE Equity / Stock Futures (NSE/CMTR & NSE/FAOP/67134-67135, eff. Apr 15, 2025):
 *    < ₹250 -> 0.01; ₹250-1000 -> 0.05; > ₹1000-5000 -> 0.10; > ₹5000-10000 -> 0.50; > ₹10000-20000 -> 1.00; > ₹20000 -> 5.00
 *  - NSE Index Options: 0.05; Stock Options (NSE/FAOP/70382, eff. Nov 03, 2025): < ₹250 -> 0.01 else 0.05
 *  - NSE Index Futures: 0-15,000 -> 0.05; > 15,000-30,000 -> 0.10; > 30,000 -> 0.20 (FYERS standard F&O min tick remains 0.05 on options)
 */
export function getPairQuoteCurrency(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const clean = symbol
    .toUpperCase()
    .replace(/^(FX:|FOREX:|CRYPTO:|BINANCE:|GLOBAL:|NSE:|BSE:|CDS:|MCX:)/, '')
    .replace(/[^A-Z]/g, '');
  const m = clean.match(/^[A-Z]{3}(USD|EUR|GBP|JPY|INR|USDT|USDC|CHF|CAD|AUD|NZD)$/);
  return m ? m[1] : undefined;
}

export function getNseTickSize(
  price: number,
  assetClass: AssetClass,
  marketSegment?: MarketSegment,
  isIndexDerivative = false
): number {
  const p = Math.abs(Number(price) || 0);
  if (assetClass === 'OPTIONS') {
    if (!isIndexDerivative && marketSegment !== 'BSE_FNO' && p > 0 && p < 250) {
      return 0.01; // Stock options < ₹250 per NSE/FAOP/70382
    }
    return 0.05;
  }
  if (assetClass === 'FUTURES' && isIndexDerivative) {
    if (p > 30000) return 0.2;
    if (p > 15000) return 0.1;
    return 0.05;
  }
  // Equity Cash / Stock Futures banded tick schedule (NSE eff. Apr 15, 2025)
  if (p > 0 && p < 250) return 0.01;
  if (p <= 1000) return 0.05;
  if (p <= 5000) return 0.1;
  if (p <= 10000) return 0.5;
  if (p <= 20000) return 1.0;
  return 5.0;
}

export const PRESET_INSTRUMENTS: Omit<IInstrument, 'id'>[] = [
  // NSE / BSE Index Derivatives (Effective Jan 2026+ per NSE/FAOP/70616 & BSE Notice 20241025-17)
  {
    symbol: 'NIFTY',
    displayName: 'Nifty 50',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 65, // NSE/FAOP/70616 (eff. Jan 2026; was 75 Nov 2024-Dec 2025, 25 Apr-Nov 2024)
    tickSize: 0.05,
    quantityIncrement: 65,
    pricePrecision: 2,
    isActive: true,
    description: 'National Stock Exchange Nifty 50 Index F&O (current lot 65)',
  },
  {
    symbol: 'BANKNIFTY',
    displayName: 'Bank Nifty',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 30, // NSE/FAOP/70616 (eff. Jan 2026; was 35 Apr-Dec 2025, 15 pre-Nov 2024)
    tickSize: 0.05,
    quantityIncrement: 30,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Bank Index F&O contract (current lot 30)',
  },
  {
    symbol: 'FINNIFTY',
    displayName: 'Fin Nifty',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 60, // NSE/FAOP/70616 (eff. Jan 2026; was 65 Nov 2024-Dec 2025, 25/40 earlier)
    tickSize: 0.05,
    quantityIncrement: 60,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Financial Services Index F&O contract (current lot 60)',
  },
  {
    symbol: 'MIDCPNIFTY',
    displayName: 'Nifty Midcap Select',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 120, // NSE/FAOP/70616 (eff. Jan 2026; was 140 Nov 2024-Dec 2025, 50/75 earlier)
    tickSize: 0.05,
    quantityIncrement: 120,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Midcap Select Index F&O contract (current lot 120)',
  },
  {
    symbol: 'NIFTYNXT50',
    displayName: 'Nifty Next 50',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 25,
    tickSize: 0.05,
    quantityIncrement: 25,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Next 50 Index F&O contract',
  },
  {
    symbol: 'SENSEX',
    displayName: 'BSE Sensex',
    assetClass: 'FUTURES',
    exchange: 'BSE',
    marketSegment: 'BSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 20, // BSE Notice 20241025-17 (eff. Nov 22, 2024)
    tickSize: 0.05,
    quantityIncrement: 20,
    pricePrecision: 2,
    isActive: true,
    description: 'BSE Sensex Index F&O contract (lot 20)',
  },
  {
    symbol: 'BANKEX',
    displayName: 'BSE Bankex',
    assetClass: 'FUTURES',
    exchange: 'BSE',
    marketSegment: 'BSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 30, // BSE Notice 20241025-17 (eff. Nov 22, 2024)
    tickSize: 0.05,
    quantityIncrement: 30,
    pricePrecision: 2,
    isActive: true,
    description: 'BSE Bankex Index F&O contract (lot 30)',
  },
  {
    symbol: 'SENSEX50',
    displayName: 'BSE Sensex 50',
    assetClass: 'FUTURES',
    exchange: 'BSE',
    marketSegment: 'BSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 60,
    tickSize: 0.05,
    quantityIncrement: 60,
    pricePrecision: 2,
    isActive: true,
    description: 'BSE Sensex 50 Index F&O contract',
  },
  // NSE Equities (Cash)
  {
    symbol: 'RELIANCE',
    displayName: 'Reliance Industries Ltd',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    marketSegment: 'NSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'HDFCBANK',
    displayName: 'HDFC Bank Ltd',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    marketSegment: 'NSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'TATASTEEL',
    displayName: 'Tata Steel Ltd',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    marketSegment: 'NSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  // MCX Commodities (Quoted unit vs trading unit multipliers per MCX contract specifications)
  {
    symbol: 'CRUDEOIL',
    displayName: 'Crude Oil Futures (100 BBL)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 100, // Quoted per 1 BBL; 1 lot = 100 BBL
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Crude Oil 100 BBL contract',
  },
  {
    symbol: 'CRUDEOILMINI',
    displayName: 'Crude Oil Mini (10 BBL)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 10, // Quoted per 1 BBL; 1 lot = 10 BBL
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Crude Oil Mini 10 BBL contract',
  },
  {
    symbol: 'NATURALGAS',
    displayName: 'Natural Gas Futures (1250 mmBtu)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1250, // Quoted per 1 mmBtu; 1 lot = 1250 mmBtu
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Natural Gas 1250 mmBtu contract',
  },
  {
    symbol: 'NATGASMINI',
    displayName: 'Natural Gas Mini (250 mmBtu)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 250, // Quoted per 1 mmBtu; 1 lot = 250 mmBtu
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Natural Gas Mini 250 mmBtu contract',
  },
  {
    symbol: 'GOLD',
    displayName: 'Gold 1KG Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 100, // 1 KG contract quoted per 10g -> 1000g / 10g = 100x P&L per 1 INR quote move
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold 1kg contract (quoted per 10 grams -> multiplier 100)',
  },
  {
    symbol: 'GOLDM',
    displayName: 'Gold Mini (100g)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 10, // 100g contract quoted per 10g -> 100g / 10g = 10x
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold Mini 100g contract (quoted per 10 grams -> multiplier 10)',
  },
  {
    symbol: 'GOLDGUINEA',
    displayName: 'Gold Guinea (8g)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1, // Quoted per 8g; 1 lot = 8g -> multiplier 1
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold Guinea 8g contract (quoted per 8 grams -> multiplier 1)',
  },
  {
    symbol: 'GOLDPETAL',
    displayName: 'Gold Petal (1g)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1, // Quoted per 1g; 1 lot = 1g -> multiplier 1
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold Petal 1g contract (quoted per 1 gram -> multiplier 1)',
  },
  {
    symbol: 'SILVER',
    displayName: 'Silver 30KG Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 30, // 30 kg quoted per 1 kg -> multiplier 30
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Silver standard 30kg contract',
  },
  {
    symbol: 'SILVERM',
    displayName: 'Silver Mini (5KG)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 5, // 5 kg quoted per 1 kg -> multiplier 5
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Silver Mini 5kg contract',
  },
  {
    symbol: 'SILVERMIC',
    displayName: 'Silver Micro (1KG)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1, // 1 kg quoted per 1 kg -> multiplier 1
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Silver Micro 1kg contract',
  },
  {
    symbol: 'COPPER',
    displayName: 'Copper Futures (2.5 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 2500, // 2500 kg per lot quoted per 1 kg
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Copper 2.5 MT contract',
  },
  {
    symbol: 'ZINC',
    displayName: 'Zinc Futures (5 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 5000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'ZINCMINI',
    displayName: 'Zinc Mini Futures (1 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'ALUMINIUM',
    displayName: 'Aluminium Futures (5 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 5000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'ALUMINI',
    displayName: 'Aluminium Mini Futures (1 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'LEAD',
    displayName: 'Lead Futures (5 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 5000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'LEADMINI',
    displayName: 'Lead Mini Futures (1 MT)',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1000,
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  // NSE Currency Derivatives (INR settled, 1000 unit lots; JPYINR quoted per 100 JPY -> 1000 * 100 JPY = 100,000 JPY notional)
  {
    symbol: 'USDINR',
    displayName: 'NSE USD/INR Currency Derivative',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.0025,
    quantityIncrement: 1000,
    pricePrecision: 4,
    isActive: true,
    description: 'NSE CDS USD/INR Futures & Options (1 lot = 1,000 USD)',
  },
  {
    symbol: 'EURINR',
    displayName: 'NSE EUR/INR Currency Derivative',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.0025,
    quantityIncrement: 1000,
    pricePrecision: 4,
    isActive: true,
  },
  {
    symbol: 'GBPINR',
    displayName: 'NSE GBP/INR Currency Derivative',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.0025,
    quantityIncrement: 1000,
    pricePrecision: 4,
    isActive: true,
  },
  {
    symbol: 'JPYINR',
    displayName: 'NSE JPY/INR Currency Derivative',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1, // NSE reports qty as 1000 (100-JPY units) per lot matching quote per 100 JPY
    lotSize: 1000,
    tickSize: 0.0025,
    quantityIncrement: 1000,
    pricePrecision: 4,
    isActive: true,
  },
  // Global Forex (MT5 standard: 1.00 lot = 100,000 base units, min step 0.01 micro-lot = 1,000 units)
  {
    symbol: 'EURUSD',
    displayName: 'Euro / US Dollar Spot CFD',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100000, // 1.00 standard lot = 100,000 EUR -> 1 pip (0.0001) = $10/lot
    lotSize: 0.01,
    tickSize: 0.00001,
    quantityIncrement: 0.01,
    pricePrecision: 5,
    isActive: true,
  },
  {
    symbol: 'GBPUSD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100000,
    lotSize: 0.01,
    tickSize: 0.00001,
    quantityIncrement: 0.01,
    pricePrecision: 5,
    isActive: true,
    description: 'British Pound vs US Dollar spot CFD (100,000 units/lot)',
  },
  {
    symbol: 'USDJPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'JPY',
    contractMultiplier: 100000, // Raw price difference is in JPY; requires JPY->account conversion!
    lotSize: 0.01,
    tickSize: 0.001,
    quantityIncrement: 0.01,
    pricePrecision: 3,
    isActive: true,
    description: 'US Dollar vs Japanese Yen spot CFD (P&L in JPY -> convert to USD)',
  },
  {
    symbol: 'XAUUSD',
    displayName: 'Gold / US Dollar Spot (CFD/Forex)',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 100, // 1 standard lot = 100 troy ounces
    lotSize: 0.01,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    isActive: true,
    description: 'Spot Gold vs US Dollar (100 oz per standard contract lot)',
  },
  {
    symbol: 'XAGUSD',
    displayName: 'Silver / US Dollar Spot CFD',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 5000, // 1 standard lot = 5,000 troy ounces
    lotSize: 0.01,
    tickSize: 0.001,
    quantityIncrement: 0.01,
    pricePrecision: 3,
    isActive: true,
  },
  // Global Crypto
  {
    symbol: 'BTCUSDT',
    displayName: 'Bitcoin / Tether Perpetual',
    assetClass: 'CRYPTO',
    exchange: 'BINANCE',
    marketSegment: 'CRYPTO',
    quoteCurrency: 'USDT',
    contractMultiplier: 1,
    lotSize: 0.001,
    tickSize: 0.1,
    quantityIncrement: 0.001,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'ETHUSDT',
    displayName: 'Ethereum / Tether Perpetual',
    assetClass: 'CRYPTO',
    exchange: 'BINANCE',
    marketSegment: 'CRYPTO',
    quoteCurrency: 'USDT',
    contractMultiplier: 1,
    lotSize: 0.01,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    isActive: true,
    description: 'Ethereum vs Tether Perpetual Futures',
  },
  {
    symbol: 'SOLUSDT',
    displayName: 'Solana / Tether Perpetual',
    assetClass: 'CRYPTO',
    exchange: 'BINANCE',
    marketSegment: 'CRYPTO',
    quoteCurrency: 'USDT',
    contractMultiplier: 1,
    lotSize: 0.1,
    tickSize: 0.01,
    quantityIncrement: 0.1,
    pricePrecision: 2,
    isActive: true,
    description: 'Solana vs Tether Perpetual Futures',
  },
  // US Equities (SEC Reg NMS Rule 612: $0.01 tick >= $1.00)
  {
    symbol: 'SPY',
    displayName: 'SPDR S&P 500 ETF Trust',
    assetClass: 'EQUITY',
    exchange: 'NYSE',
    marketSegment: 'US_EQUITY',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'QQQ',
    displayName: 'Invesco QQQ Trust',
    assetClass: 'EQUITY',
    exchange: 'NASDAQ',
    marketSegment: 'US_EQUITY',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'AAPL',
    displayName: 'Apple Inc.',
    assetClass: 'EQUITY',
    exchange: 'NASDAQ',
    marketSegment: 'US_EQUITY',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  // CME Group Futures
  {
    symbol: 'ES',
    displayName: 'E-mini S&P 500 Futures',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 50,
    lotSize: 1,
    tickSize: 0.25,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'MES',
    displayName: 'Micro E-mini S&P 500 Futures',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 5,
    lotSize: 1,
    tickSize: 0.25,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'NQ',
    displayName: 'E-mini Nasdaq-100 Futures',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 20,
    lotSize: 1,
    tickSize: 0.25,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'MNQ',
    displayName: 'Micro E-mini Nasdaq-100 Futures',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 2,
    lotSize: 1,
    tickSize: 0.25,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'CL',
    displayName: 'WTI Crude Oil Futures (NYMEX)',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 1000,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'GC',
    displayName: 'COMEX Gold Futures',
    assetClass: 'FUTURES',
    exchange: 'CME',
    marketSegment: 'CME',
    quoteCurrency: 'USD',
    contractMultiplier: 100,
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
];

export type PresetInstrumentSpec = Omit<IInstrument, 'id'>;

/**
 * Internal spec lookup for known underlying symbols (lot size, tick size, multiplier, exchange, segment).
 * Supports optional `asOfDate` for historical index lot-size resolution.
 */
export function getPresetSpec(symbol: string, asOfDate?: Date | string): PresetInstrumentSpec | undefined {
  if (!symbol) return undefined;
  const clean = symbol.trim().toUpperCase().replace(/^(NSE:|BSE:|MCX:|NFO:|BFO:|CDS:|BINANCE:)/i, '');
  let base: PresetInstrumentSpec | undefined = PRESET_INSTRUMENTS.find(
    (p) => p.symbol === clean || p.symbol === symbol.trim().toUpperCase()
  );
  if (!base) {
    if (clean === 'CRUDEOILM' || clean === 'CRUDEOILMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'CRUDEOILMINI');
    } else if (clean === 'NATGASMINI' || clean === 'NATURALGASMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'NATGASMINI');
    } else if (clean === 'NATGAS') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'NATURALGAS');
    } else if (clean === 'GOLDM' || clean === 'GOLDMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'GOLDM');
    } else if (clean === 'SILVERM' || clean === 'SILVERMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'SILVERM');
    } else if (clean === 'SILVERMIC' || clean === 'SILVERMICRO') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'SILVERMIC');
    } else if (clean === 'GOLDGUINEA') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'GOLDGUINEA');
    } else if (clean === 'GOLDPETAL') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'GOLDPETAL');
    } else if (clean === 'ZINCMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'ZINCMINI');
    } else if (clean === 'ALUMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'ALUMINI');
    } else if (clean === 'LEADMINI') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'LEADMINI');
    } else if (clean === 'NIFTY50' || clean === 'NIFTY 50') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'NIFTY');
    } else if (clean === 'NIFTYBANK' || clean === 'NIFTY BANK') {
      base = PRESET_INSTRUMENTS.find((p) => p.symbol === 'BANKNIFTY');
    }
  }
  if (!base) return undefined;

  if (INDEX_LOT_SIZE_HISTORY[base.symbol]) {
    const datedLotSize = getEffectiveLotSize(base.symbol, asOfDate);
    if (datedLotSize && datedLotSize !== base.lotSize) {
      return {
        ...base,
        lotSize: datedLotSize,
        quantityIncrement: datedLotSize,
      };
    }
  }
  return base;
}


export const CHART_ATTACHMENT_CATEGORIES: {
  value: AttachmentCategory;
  label: string;
  description: string;
  badgeColor: string;
}[] = [
  {
    value: 'SETUP',
    label: 'Trade Setup',
    description: 'Higher timeframe opportunity, market structure, pre-entry context',
    badgeColor: '#3b82f6',
  },
  {
    value: 'ENTRY',
    label: 'Entry Trigger',
    description: 'Execution candle, lower timeframe entry confirmation, order fill point',
    badgeColor: '#10b981',
  },
  {
    value: 'EXIT',
    label: 'Exit / Target',
    description: 'Take profit target, stop loss hit, trailing stop or scale-out execution',
    badgeColor: '#f59e0b',
  },
  {
    value: 'REVIEW',
    label: 'Post-Trade Review',
    description: 'Annotated chart, lessons learned, and trade execution review',
    badgeColor: '#8b5cf6',
  },
  {
    value: 'OTHER',
    label: 'Reference / Other',
    description: 'Macro correlation, orderbook depth, news catalyst, or alternate timeframe',
    badgeColor: '#64748b',
  },
  {
    value: 'AUTO_CHART',
    label: 'Auto Execution Chart',
    description: 'Automated candlestick chart generated from FYERS historical market data',
    badgeColor: '#06b6d4',
  },
];

export const CHART_RESOLUTIONS = ['1', '5', '15', '30', '60', '240', 'D'] as const;
export type ChartResolution = (typeof CHART_RESOLUTIONS)[number];

export const CHART_RESOLUTION_LABELS: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  'D': '1D',
};

export const DEFAULT_CHART_PADDING_CANDLES = 45;
export const MAX_CHART_PADDING_CANDLES = 200;
export const CHART_PADDING_PRESETS: readonly number[] = [0, 15, 30, 45, 60, 100, 150];
export const MAX_CHART_TIMEFRAMES_PER_REQUEST = 5;
export const MAX_RENDERED_CANDLES = 1500;

export const CHART_TIMEFRAMES = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  'Daily',
  'Weekly',
] as const;

/**
 * Official NSE Trading Holidays by calendar year.
 * PROMINENT NOTICE: When NSE publishes official circulars for upcoming years,
 * this dictionary is supplemented or dynamically updated via the HolidayCalendar database service.
 */
export const NSE_TRADING_HOLIDAYS_BY_YEAR: Record<number, readonly string[]> = {
  2024: [
    '2024-01-22', // Ram Mandir Pran Pratishtha (Special Holiday)
    '2024-01-26', // Republic Day
    '2024-03-08', // Mahashivratri
    '2024-03-25', // Holi
    '2024-03-29', // Good Friday
    '2024-04-11', // Id-ul-Fitr (Ramzan Id)
    '2024-04-17', // Shri Ram Navami
    '2024-05-01', // Maharashtra Day
    '2024-05-20', // General Parliamentary Elections (Mumbai)
    '2024-06-17', // Bakri Id
    '2024-07-17', // Muharram
    '2024-08-15', // Independence Day
    '2024-10-02', // Mahatma Gandhi Jayanti
    '2024-11-01', // Diwali Laxmi Pujan (Diwali)
    '2024-11-15', // Guru Nanak Jayanti
    '2024-11-20', // Maharashtra Assembly General Election
    '2024-12-25', // Christmas
  ],
  2025: [
    '2025-02-26', // Mahashivratri
    '2025-03-14', // Holi
    '2025-03-31', // Id-ul-Fitr (Ramzan Id)
    '2025-04-10', // Mahavir Jayanti
    '2025-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2025-04-18', // Good Friday
    '2025-05-01', // Maharashtra Day
    '2025-06-07', // Bakri Id
    '2025-08-15', // Independence Day
    '2025-08-27', // Ganesh Chaturthi
    '2025-10-02', // Mahatma Gandhi Jayanti / Dussehra
    '2025-10-21', // Diwali Laxmi Pujan
    '2025-10-22', // Diwali Balipratipada
    '2025-11-05', // Guru Nanak Jayanti
    '2025-12-25', // Christmas
  ],
  // Official NSE 2026 Trading Holidays — Source: NSE Circular NSE/CMTR/71775 + Jan 15 Municipal Election holiday
  // Weekend holidays excluded per NSE calendar: Mahashivratri (Feb 15 Sun), Id-ul-Fitr (Mar 21 Sat), Independence Day (Aug 15 Sat), Diwali Laxmi Pujan (Nov 08 Sun)
  2026: [
    '2026-01-15', // Municipal Corporation Election (Maharashtra)
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-26', // Shri Ram Navami
    '2026-03-31', // Shri Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-28', // Bakri Id
    '2026-06-26', // Muharram
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra (Tuesday holiday -> shifts Nifty weekly expiry to Mon 2026-10-19)
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev (Last Tuesday holiday -> shifts NSE monthly expiry to Mon 2026-11-23)
    '2026-12-25', // Christmas
  ],
  2027: [
    '2027-01-26', // Republic Day
    '2027-03-08', // Mahashivratri
    '2027-03-23', // Holi
    '2027-03-26', // Good Friday
    '2027-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2027-05-01', // Maharashtra Day
    '2027-05-17', // Bakri Id
    '2027-06-16', // Muharram
    '2027-08-15', // Independence Day
    '2027-10-02', // Mahatma Gandhi Jayanti
    '2027-10-11', // Dussehra
    '2027-10-30', // Diwali
    '2027-11-15', // Guru Nanak Jayanti
    '2027-12-25', // Christmas
  ],
};

/**
 * Dynamically retrieves official NSE trading holidays for a specified year.
 * If the requested year is not yet pre-seeded, returns an empty array (falling back to standard calendar logic).
 */
export function getNseHolidaysForYear(year: number): readonly string[] {
  return NSE_TRADING_HOLIDAYS_BY_YEAR[year] || [];
}

/**
 * Backward-compatible alias for 2026 NSE Trading Holidays.
 */
export const NSE_HOLIDAYS_2026: readonly string[] = NSE_TRADING_HOLIDAYS_BY_YEAR[2026];

/**
 * Built-in Rule-Driven Market Templates for SetupMint.
 *
 * NOTE: ALL SL percentages and R:R values are PLACEHOLDER defaults for user configuration and demonstration.
 * Templates describe a SETUP for a MARKET. They NEVER name a symbol such as NIFTY or BANKNIFTY.
 * Option-buying templates are strictly LONG only (long premium, CE or PE).
 */
export const BUILT_IN_TEMPLATES: ITradeTemplate[] = [
  // ==========================================
  // 1. F&O (Futures & Options)
  // ==========================================
  {
    id: 'fno-orb',
    name: 'Opening Range Breakout',
    description: 'Breakout of the initial 15-minute range with volume expansion',
    group: 'FNO',
    markets: ['FUTURES', 'OPTIONS', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.3 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} ORB {DIR}',
    tags: ['FNO', 'ORB', 'INTRADAY', 'MOMENTUM'],
    confluences: ['BOS', 'VOLUME_SPIKE', 'VWAP'],
    checklist: ['First 15-min high/low established', 'Volume surge on breakout candle', 'Index breadth confirms move'],
    strategyName: 'Opening Range Breakout',
    timeWindow: { start: '09:15', end: '10:15' },
    isBuiltIn: true,
  },
  {
    id: 'fno-vwap-mean-reversion',
    name: 'VWAP Mean Reversion',
    description: 'Fade extended moves back toward session VWAP',
    group: 'FNO',
    markets: ['FUTURES', 'OPTIONS', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.25 }, // PLACEHOLDER default SL %
    minRR: 1.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} VWAP Mean Reversion {DIR}',
    tags: ['FNO', 'VWAP', 'MEAN_REVERSION', 'INTRADAY'],
    confluences: ['VWAP', 'SUPPORT_RESISTANCE', 'LIQUIDITY_SWEEP'],
    checklist: ['Price extended > 2 standard deviations from VWAP', 'Reversal candlestick confirmation', 'Clear target to VWAP band'],
    strategyName: 'Mean Reversion',
    timeWindow: { start: '10:30', end: '14:00' },
    isBuiltIn: true,
  },
  {
    id: 'fno-trend-pullback',
    name: 'Trend Pullback',
    description: 'Retest of EMA 20/50 or VWAP in strong intraday trend',
    group: 'FNO',
    markets: ['FUTURES', 'OPTIONS', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.35 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Trend Pullback {DIR}',
    tags: ['FNO', 'TREND', 'PULLBACK', 'INTRADAY'],
    confluences: ['EMA_CROSS', 'VWAP', 'BOS'],
    checklist: ['Higher timeframe trend clear', 'Pullback on declining volume', 'Bullish/bearish rejection at dynamic support'],
    strategyName: 'Trend Pullback',
    timeWindow: { start: '10:00', end: '14:30' },
    isBuiltIn: true,
  },
  {
    id: 'fno-options-directional-buy',
    name: 'Options Directional Buy',
    description: 'Long premium directional momentum scalp or intraday swing',
    group: 'FNO',
    markets: ['OPTIONS'],
    direction: 'LONG', // Option-buying is strictly LONG only (long premium)
    slRule: { type: 'PREMIUM_PERCENT', value: 20 }, // PLACEHOLDER default SL % (premium)
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Option Directional Long',
    tags: ['OPTIONS', 'MOMENTUM', 'SCALP', 'LONG_PREMIUM'],
    confluences: ['BOS', 'VOLUME_SPIKE', 'VWAP'],
    checklist: ['Underlying breaks key structure with momentum', 'Delta 0.45-0.55 ATM contract selected', 'Strict premium-based stop loss'],
    strategyName: 'Options Directional Momentum',
    timeWindow: { start: '09:30', end: '15:00' },
    isBuiltIn: true,
  },
  {
    id: 'fno-expiry-day-scalp',
    name: 'Expiry Day Scalp',
    description: 'Zero-hero or fast premium momentum on index expiry days',
    group: 'FNO',
    markets: ['OPTIONS', 'FUTURES', 'INDEX'],
    slRule: { type: 'PREMIUM_PERCENT', value: 25 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Expiry Scalp {DIR}',
    tags: ['EXPIRY', 'SCALP', 'GAMMA', 'INTRADAY'],
    confluences: ['SUPPORT_RESISTANCE', 'LIQUIDITY_SWEEP', 'VOLUME_SPIKE'],
    checklist: ['Active expiry day confirmed', 'Fast volume burst / breakout', 'Tight risk management for rapid decay'],
    strategyName: 'Expiry Day Scalp',
    expiryDayOnly: true,
    timeWindow: { start: '13:00', end: '15:15' },
    isBuiltIn: true,
  },

  // ==========================================
  // 2. Stocks (Equities)
  // ==========================================
  {
    id: 'stocks-gap-and-go',
    name: 'Gap & Go',
    description: 'Premarket earnings or catalyst gap continuation on opening volume',
    group: 'STOCKS',
    markets: ['EQUITY'],
    slRule: { type: 'PERCENT', value: 0.8 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Gap & Go {DIR}',
    tags: ['EQUITY', 'GAP', 'MOMENTUM', 'INTRADAY'],
    confluences: ['VOLUME_SPIKE', 'BOS', 'VWAP'],
    checklist: ['Gap > 1.5% with news/earnings catalyst', 'First 5-min candle breaks in gap direction', 'Relative volume (RVOL) > 2.0'],
    strategyName: 'High-Volume Breakout',
    timeWindow: { start: '09:15', end: '10:30' },
    isBuiltIn: true,
  },
  {
    id: 'stocks-vwap-pullback',
    name: 'VWAP Pullback',
    description: 'First or second touch of VWAP in leading market stock',
    group: 'STOCKS',
    markets: ['EQUITY'],
    slRule: { type: 'PERCENT', value: 0.6 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} VWAP Pullback {DIR}' ,
    tags: ['EQUITY', 'VWAP', 'PULLBACK', 'INTRADAY'],
    confluences: ['VWAP', 'EMA_CROSS', 'SUPPORT_RESISTANCE'],
    checklist: ['Stock leading sector in relative strength', 'Controlled pullback to VWAP on lower volume', 'Clean rejection candle wick'],
    strategyName: 'Trend Pullback',
    timeWindow: { start: '10:00', end: '13:30' },
    isBuiltIn: true,
  },
  {
    id: 'stocks-swing-breakout',
    name: 'Swing Breakout',
    description: 'Multi-week consolidation breakout with institutional volume',
    group: 'STOCKS',
    markets: ['EQUITY'],
    slRule: { type: 'PERCENT', value: 2.5 }, // PLACEHOLDER default SL %
    minRR: 3.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Swing Breakout {DIR}',
    tags: ['EQUITY', 'SWING', 'BREAKOUT', 'POSITIONAL'],
    confluences: ['SUPPORT_RESISTANCE', 'VOLUME_SPIKE', 'BOS'],
    checklist: ['Tight multi-week base or cup-with-handle', 'Volume expands 150%+ above 20-day average', 'Sector tailwind aligned'],
    strategyName: 'High-Volume Breakout',
    isBuiltIn: true,
  },
  {
    id: 'stocks-swing-support-bounce',
    name: 'Swing Support Bounce',
    description: 'Long swing entry at major weekly/daily horizontal support',
    group: 'STOCKS',
    markets: ['EQUITY'],
    direction: 'LONG',
    slRule: { type: 'PERCENT', value: 2.0 }, // PLACEHOLDER default SL %
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Support Bounce Long',
    tags: ['EQUITY', 'SWING', 'SUPPORT', 'LONG'],
    confluences: ['SUPPORT_RESISTANCE', 'FIBONACCI', 'ORDER_BLOCK'],
    checklist: ['Key horizontal support tested 2+ times', 'Bullish reversal candle (hammer or engulfing)', 'Risk reward to prior high > 2.5:1'],
    strategyName: 'Support Resistance Reversal',
    isBuiltIn: true,
  },

  // ==========================================
  // 3. Forex & Gold
  // ==========================================
  {
    id: 'forex-london-open-breakout',
    name: 'London Open Breakout',
    description: 'Breakout of the Asian session consolidation during London open',
    group: 'FOREX_GOLD',
    markets: ['FOREX', 'COMMODITY'],
    slRule: { type: 'PERCENT', value: 0.25 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} London Breakout {DIR}',
    tags: ['FOREX', 'GOLD', 'LONDON', 'BREAKOUT', 'SESSION'],
    confluences: ['LIQUIDITY_SWEEP', 'BOS', 'PDH_PDL'],
    checklist: ['Asian session range clearly mapped', 'Liquidity sweep of Asian high or low', 'Fast expansion candle entering London session'],
    strategyName: 'Liquidity Sweep + FVG Reversal',
    timeWindow: { start: '12:30', end: '16:00' },
    isBuiltIn: true,
  },
  {
    id: 'forex-ny-session-reversal',
    name: 'New York Session Reversal',
    description: 'Midday London reversal or US market open liquidity sweep',
    group: 'FOREX_GOLD',
    markets: ['FOREX', 'COMMODITY'],
    slRule: { type: 'PERCENT', value: 0.3 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} NY Session Reversal {DIR}',
    tags: ['FOREX', 'GOLD', 'NEW_YORK', 'REVERSAL', 'SESSION'],
    confluences: ['LIQUIDITY_SWEEP', 'CHOCH', 'ORDER_BLOCK'],
    checklist: ['London session trend exhausted into key higher timeframe level', 'US economic data release absorbed', 'Change of character on M5/M15'],
    strategyName: 'Liquidity Sweep + FVG Reversal',
    timeWindow: { start: '18:00', end: '22:00' },
    isBuiltIn: true,
  },
  {
    id: 'forex-trend-pullback-h1-h4',
    name: 'Trend Pullback (H1/H4)',
    description: 'Higher timeframe trend continuation after liquidity grab',
    group: 'FOREX_GOLD',
    markets: ['FOREX', 'COMMODITY'],
    slRule: { type: 'PERCENT', value: 0.4 }, // PLACEHOLDER default SL %
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Trend Pullback {DIR}',
    tags: ['FOREX', 'GOLD', 'SWING', 'TREND', 'H1_H4'],
    confluences: ['FIBONACCI', 'ORDER_BLOCK', 'BOS'],
    checklist: ['H4 market structure bullish/bearish', 'Retest into 61.8% golden pocket or unmitigated OB', 'Lower timeframe confirmation trigger'],
    strategyName: 'Trend Pullback',
    isBuiltIn: true,
  },

  // ==========================================
  // 4. Crypto
  // ==========================================
  {
    id: 'crypto-breakout-retest',
    name: 'Breakout & Retest',
    description: 'Break of horizontal consolidation with volume, followed by retest',
    group: 'CRYPTO',
    markets: ['CRYPTO'],
    slRule: { type: 'PERCENT', value: 1.5 }, // PLACEHOLDER default SL %
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Breakout & Retest {DIR}',
    tags: ['CRYPTO', 'BREAKOUT', 'RETEST', 'MOMENTUM'],
    confluences: ['SUPPORT_RESISTANCE', 'BOS', 'VOLUME_SPIKE'],
    checklist: ['Range consolidation lasting > 24 hours', 'Clean close beyond range high/low', 'Retest holds with lower wick rejection'],
    strategyName: 'Break of Structure (BOS) Trend Continuation',
    isBuiltIn: true,
  },
  {
    id: 'crypto-range-reversal',
    name: 'Range High/Low Reversal',
    description: 'Fade range boundary after false breakout / deviation wick',
    group: 'CRYPTO',
    markets: ['CRYPTO'],
    slRule: { type: 'PERCENT', value: 1.2 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Range Reversal {DIR}',
    tags: ['CRYPTO', 'RANGE', 'MEAN_REVERSION', 'S/R'],
    confluences: ['LIQUIDITY_SWEEP', 'SUPPORT_RESISTANCE', 'CHOCH'],
    checklist: ['Well-defined horizontal trading range', 'Deviation / fakeout outside range boundary', 'Prompt close back inside range'],
    strategyName: 'Mean Reversion',
    isBuiltIn: true,
  },
  {
    id: 'crypto-trend-pullback',
    name: 'Trend Pullback',
    description: 'Continuation in strong trending crypto perpetuals',
    group: 'CRYPTO',
    markets: ['CRYPTO'],
    slRule: { type: 'PERCENT', value: 1.8 }, // PLACEHOLDER default SL %
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Trend Pullback {DIR}',
    tags: ['CRYPTO', 'PERP', 'TREND', 'PULLBACK'],
    confluences: ['EMA_CROSS', 'BOS', 'FIBONACCI'],
    checklist: ['Supertrend / EMA alignment on 1h/4h', 'Healthy funding rate not overly crowded', 'Pullback to key demand/supply zone'],
    strategyName: 'Trend Pullback',
    isBuiltIn: true,
  },

  // ==========================================
  // 5. MCX Commodities
  // ==========================================
  {
    id: 'mcx-evening-breakout',
    name: 'Evening Session Breakout',
    description: 'US inventory release momentum or London close continuation',
    group: 'MCX',
    markets: ['COMMODITY'],
    slRule: { type: 'PERCENT', value: 0.5 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Evening Breakout {DIR}',
    tags: ['COMMODITY', 'MCX', 'EVENING', 'BREAKOUT'],
    confluences: ['VOLUME_SPIKE', 'VWAP', 'BOS'],
    checklist: ['US regular trading hours open surge (19:00+ IST)', 'Break of Indian day range high/low', 'Inventory data alignment (Crude / NG)'],
    strategyName: 'High-Volume Breakout',
    timeWindow: { start: '17:00', end: '22:00' },
    session: 'MCX_EVENING',
    isBuiltIn: true,
  },
  {
    id: 'mcx-trend-pullback',
    name: 'Trend Pullback',
    description: 'Pullback to session VWAP or EMA in commodity trend',
    group: 'MCX',
    markets: ['COMMODITY'],
    slRule: { type: 'PERCENT', value: 0.6 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} MCX Trend Pullback {DIR}',
    tags: ['COMMODITY', 'MCX', 'TREND', 'PULLBACK'],
    confluences: ['VWAP', 'EMA_CROSS', 'SUPPORT_RESISTANCE'],
    checklist: ['Clear multi-hour commodity trend', 'Low volume test of session VWAP', 'Reversal confirmation bar'],
    strategyName: 'Trend Pullback',
    timeWindow: { start: '17:00', end: '23:00' },
    session: 'MCX_EVENING',
    isBuiltIn: true,
  },

  // ==========================================
  // 6. Price Action (Universal - All Markets)
  // ==========================================
  {
    id: 'pa-smc-bos-fvg',
    name: 'SMC BOS + FVG Retest',
    description: 'Break of structure followed by fair value gap retest',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place beyond the invalidation order block / FVG origin',
    },
    minRR: 2.5, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} SMC BOS+FVG {DIR}',
    tags: ['PRICE_ACTION', 'SMC', 'FVG', 'BOS'],
    confluences: ['BOS', 'FVG', 'ORDER_BLOCK'],
    checklist: ['Impulsive break of market structure (BOS)', 'Imbalance / Fair Value Gap left behind', 'Price mitigates into FVG with rejection wick'],
    strategyName: 'Break of Structure (BOS) Trend Continuation',
    isBuiltIn: true,
  },
  {
    id: 'pa-smc-liquidity-sweep',
    name: 'SMC Liquidity Sweep',
    description: 'Raid of equal highs/lows or previous session extremes followed by displacement',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place beyond the liquidity raid wick',
    },
    minRR: 3.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} Liquidity Sweep {DIR}',
    tags: ['PRICE_ACTION', 'SMC', 'SWEEP', 'REVERSAL'],
    confluences: ['LIQUIDITY_SWEEP', 'CHOCH', 'ORDER_BLOCK'],
    checklist: ['Equal highs/lows or previous session extreme cleared', 'Sharp rejection wick leaving trailing liquidity', 'Change of character (CHOCH) confirming displacement'],
    strategyName: 'Liquidity Sweep + FVG Reversal',
    isBuiltIn: true,
  },
  {
    id: 'pa-sr-flip',
    name: 'Support/Resistance Flip',
    description: 'Prior resistance turning into support (or vice-versa) on retest',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.5 }, // PLACEHOLDER default SL %
    minRR: 2.0, // PLACEHOLDER default R:R
    titlePattern: '{SYMBOL} S/R Flip {DIR}',
    tags: ['PRICE_ACTION', 'SUPPORT_RESISTANCE', 'RETEST'],
    confluences: ['SUPPORT_RESISTANCE', 'VOLUME_SPIKE', 'BOS'],
    checklist: ['Significant horizontal level broken with clear impulse', 'Pullback cleanly retests the broken level', 'Rejection candle confirming polarity change'],
    strategyName: 'Support Resistance Reversal',
    isBuiltIn: true,
  },
  {
    id: 'pa-liquidity-sweep-reversal',
    name: 'Liquidity Sweep Reversal',
    description: 'High-probability reversal after stop raid of buy-side or sell-side resting liquidity',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place 2-5 ticks beyond the sweep wick extreme',
    },
    minRR: 2.5,
    titlePattern: '{SYMBOL} Liquidity Sweep {DIR}',
    tags: ['PRICE_ACTION', 'LIQUIDITY', 'SWEEP', 'REVERSAL'],
    confluences: ['BUY_SIDE_LIQUIDITY_SWEEP', 'SELL_SIDE_LIQUIDITY_SWEEP', 'CHOCH', 'MARKET_STRUCTURE_SHIFT', 'DISPLACEMENT'],
    checklist: [
      'Key resting liquidity pool identified on higher timeframe',
      'Liquidity was swept with a sharp rejection wick',
      'Lower timeframe structure shifted (CHOCH / MSS)',
      'Invalidation stop placed strictly beyond the sweep wick extreme',
    ],
    strategyName: 'Liquidity Sweep & Reversal',
    isBuiltIn: true,
  },
  {
    id: 'pa-equal-highs-lows-raid',
    name: 'Equal Highs/Lows Raid',
    description: 'Exploiting retail double top/bottom stop cascades with institutional displacement',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place beyond the raid extreme wick',
    },
    minRR: 3.0,
    titlePattern: '{SYMBOL} EQH/EQL Raid {DIR}',
    tags: ['PRICE_ACTION', 'LIQUIDITY', 'EQUAL_HIGHS', 'EQUAL_LOWS'],
    confluences: ['EQUAL_HIGHS', 'EQUAL_LOWS', 'STOP_HUNT', 'DISPLACEMENT', 'LIQUIDITY_GRAB_REJECTION'],
    checklist: [
      'Obvious equal highs or equal lows identified on 15m/1h',
      'Aggressive wick raid cleared out retail stop orders',
      'Immediate displacement back inside previous dealing range',
      'Target opposing liquidity pool across the consolidation',
    ],
    strategyName: 'Equal Highs/Lows Raid',
    isBuiltIn: true,
  },
  {
    id: 'pa-pdh-pdl-sweep-reversal',
    name: 'PDH/PDL Sweep Reversal',
    description: 'Fade failed expansion beyond previous day high or low with reclaim into prior value',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Place outside the PDH/PDL sweep point by instrument buffer',
    },
    minRR: 2.5,
    titlePattern: '{SYMBOL} PDH/PDL Sweep {DIR}',
    tags: ['PRICE_ACTION', 'PDH_PDL', 'SWEEP', 'REVERSAL'],
    confluences: ['PREV_DAY_HIGH_SWEEP', 'PREV_DAY_LOW_SWEEP', 'FAKE_BREAKOUT_RECLAIM', 'KEY_LEVEL_REJECTION'],
    checklist: [
      'Price expanded past yesterday extreme during active session',
      'Breakout immediately failed with zero candle acceptance above/below level',
      'Candle close back inside yesterday range confirms fake breakout',
      'Target set at session VWAP or opposing day extreme',
    ],
    strategyName: 'PDH/PDL Sweep Reversal',
    isBuiltIn: true,
  },
  {
    id: 'pa-sr-flip-retest',
    name: 'Support/Resistance Flip Retest',
    description: 'Polarity change confirmation where broken key horizontal structure is cleanly retested',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: { type: 'PERCENT', value: 0.4 },
    minRR: 2.0,
    titlePattern: '{SYMBOL} S/R Flip {DIR}',
    tags: ['PRICE_ACTION', 'SUPPORT_RESISTANCE', 'RETEST', 'SR_FLIP'],
    confluences: ['SUPPORT_RESISTANCE_FLIP', 'SUPPORT_RETEST', 'RESISTANCE_RETEST', 'VOLUME_SPIKE_AT_LEVEL'],
    checklist: [
      'Decisive structural break through major horizontal level on volume',
      'Controlled low-volume pullback retests the broken level',
      'Rejection pinbar or engulfing candle confirms polarity change',
      'Risk/reward minimum 1:2 to the next key resistance/support zone',
    ],
    strategyName: 'Support/Resistance Flip Retest',
    isBuiltIn: true,
  },
  {
    id: 'pa-supply-demand-rejection',
    name: 'Supply/Demand Zone Rejection',
    description: 'Institutional order block and imbalance mitigation at fresh supply or demand zones',
    group: 'PRICE_ACTION',
    markets: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
    slRule: {
      type: 'MANUAL',
      manualHint: 'Structure SL: Beyond zone boundary with tick buffer',
    },
    minRR: 2.5,
    titlePattern: '{SYMBOL} Supply/Demand {DIR}',
    tags: ['PRICE_ACTION', 'SUPPLY_ZONE', 'DEMAND_ZONE', 'ORDER_BLOCK'],
    confluences: ['DEMAND_ZONE', 'SUPPLY_ZONE', 'KEY_LEVEL_REJECTION', 'LTF_CONFIRMATION_CANDLE', 'DISCOUNT_ZONE_ENTRY'],
    checklist: [
      'Fresh, unmitigated institutional supply or demand zone on HTF',
      'Price taps zone and exhibits sharp rejection wicks',
      'Lower timeframe trigger candle confirms institutional entry',
      'Stop loss safely placed outside the distal zone boundary',
    ],
    strategyName: 'Supply/Demand Zone Rejection',
    isBuiltIn: true,
  },
];

// ----------------------------------------------------------------------------
// WHAT-IF CANDLE-REPLAY SIMULATION CONSTANTS
// ----------------------------------------------------------------------------
export const DEFAULT_STOP_R_GRID: (number | null)[] = [null, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
export const DEFAULT_TARGET_R_GRID: (number | null)[] = [null, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
export const MAX_WHAT_IF_GRID_CELLS = 100;
export const MAX_WHAT_IF_TRADES_SCOPE = 5000;
export const CALIBRATION_MIN_AGREEMENT = 0.90;
export const HOLDOUT_FRACTION = 0.30;
export const MIN_RELIABLE_SAMPLE = 30;
export const MIN_HOLDOUT_SAMPLE = 15;

export const WHAT_IF_FILL_MODELS = ['GAP_AWARE', 'AT_LEVEL'] as const;
export const WHAT_IF_RESOLUTION_POLICIES = ['FINEST_AVAILABLE', 'ONE_MINUTE_ONLY'] as const;
export const WHAT_IF_POLICIES = ['PESSIMISTIC', 'OPTIMISTIC'] as const;
export const WHAT_IF_EXCLUSION_REASONS = [
  'EXCLUDED_MULTI_FILL',
  'EXCLUDED_NO_STOP',
  'EXCLUDED_NO_CANDLES',
  'EXCLUDED_UNDERLYING_FALLBACK',
  'EXCLUDED_MANAGED_STOP',
  'EXCLUDED_OTHER',
] as const;
export const WHAT_IF_VERDICTS = ['BETTER_ROBUST', 'WORSE_ROBUST', 'INCONCLUSIVE'] as const;
export const WHAT_IF_CELL_STATUSES = ['EVALUABLE', 'CENSORED'] as const;
export const WHAT_IF_OUTCOMES = ['STOP', 'TARGET', 'ACTUAL'] as const;
export const WHAT_IF_COST_MODELS = ['RECOMPUTED', 'ACTUAL_FALLBACK'] as const;



