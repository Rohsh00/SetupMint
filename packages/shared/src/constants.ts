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
  { value: 'MCX', label: 'MCX Commodities' },
  { value: 'FOREX', label: 'Forex Spot / Futures' },
  { value: 'CRYPTO', label: 'Crypto Spot / Perps' },
  { value: 'US_EQUITY', label: 'US Equities (NASDAQ / NYSE)' },
  { value: 'CME', label: 'CME Futures' },
  { value: 'OTHER', label: 'Other Market' },
];

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

export const PRESET_INSTRUMENTS: Omit<IInstrument, 'id'>[] = [
  {
    symbol: 'NIFTY',
    displayName: 'Nifty 50',
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
    description: 'National Stock Exchange 50 benchmark index future contract',
  },
  {
    symbol: 'BANKNIFTY',
    displayName: 'Bank Nifty',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 15,
    tickSize: 0.05,
    quantityIncrement: 15,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Bank Index futures contract',
  },
  {
    symbol: 'FINNIFTY',
    displayName: 'Fin Nifty',
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
    description: 'Financial services sectoral future',
  },
  {
    symbol: 'RELIANCE',
    displayName: 'Reliance Industries Ltd',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    marketSegment: 'NSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 1,
    tickSize: 0.05,
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
    tickSize: 0.05,
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
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
  },
  {
    symbol: 'CRUDEOIL',
    displayName: 'Crude Oil Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 100, // 100 barrels per lot
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Crude Oil 100 BBL contract',
  },
  {
    symbol: 'NATURALGAS',
    displayName: 'Natural Gas Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1250, // 1250 mmBtu per lot
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Natural Gas contract',
  },
  {
    symbol: 'GOLD',
    displayName: 'Gold 1KG Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 1, // Per 10 grams quoted, 1kg = 100 units
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold standard contract',
  },
  {
    symbol: 'COPPER',
    displayName: 'Copper Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 2500, // 2500 kg per lot
    lotSize: 1,
    tickSize: 0.05,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Copper 2.5 MT contract',
  },
  {
    symbol: 'EURUSD',
    displayName: 'Euro / US Dollar Spot/Futures',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.00001,
    quantityIncrement: 1000,
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
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.00001,
    quantityIncrement: 1000,
    pricePrecision: 5,
    isActive: true,
    description: 'British Pound vs US Dollar spot/futures',
  },
  {
    symbol: 'USDJPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'JPY',
    contractMultiplier: 1,
    lotSize: 1000,
    tickSize: 0.001,
    quantityIncrement: 1000,
    pricePrecision: 3,
    isActive: true,
    description: 'US Dollar vs Japanese Yen spot/futures',
  },
  {
    symbol: 'XAUUSD',
    displayName: 'Gold / US Dollar Spot (CFD/Forex)',
    assetClass: 'FOREX',
    exchange: 'FOREX',
    marketSegment: 'FOREX',
    quoteCurrency: 'USD',
    // 1 standard lot = 100 troy ounces. Default multiplier 100 for PnL calculations
    contractMultiplier: 100,
    lotSize: 1,
    tickSize: 0.01,
    quantityIncrement: 0.01,
    pricePrecision: 2,
    isActive: true,
    description: 'Spot Gold vs US Dollar (100 oz per standard contract lot)',
  },
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
  {
    symbol: 'SILVER',
    displayName: 'Silver 30KG Futures',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 30,
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Silver standard 30kg contract',
  },
  {
    symbol: 'SENSEX',
    displayName: 'BSE Sensex',
    assetClass: 'FUTURES',
    exchange: 'BSE',
    marketSegment: 'BSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 20,
    lotSize: 10,
    tickSize: 0.05,
    quantityIncrement: 10,
    pricePrecision: 2,
    isActive: true,
    description: 'BSE Sensex Index contract',
  },
  {
    symbol: 'BANKEX',
    displayName: 'BSE Bankex',
    assetClass: 'FUTURES',
    exchange: 'BSE',
    marketSegment: 'BSE_EQ',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 15,
    tickSize: 0.05,
    quantityIncrement: 15,
    pricePrecision: 2,
    isActive: true,
    description: 'BSE Bankex Index contract',
  },
  {
    symbol: 'MIDCPNIFTY',
    displayName: 'Nifty Midcap Select',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    quoteCurrency: 'INR',
    contractMultiplier: 1,
    lotSize: 50,
    tickSize: 0.05,
    quantityIncrement: 50,
    pricePrecision: 2,
    isActive: true,
    description: 'Nifty Midcap Select Index contract',
  },
  {
    symbol: 'CRUDEOILMINI',
    displayName: 'Crude Oil Mini',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 10, // 10 barrels per lot
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Crude Oil Mini 10 BBL contract',
  },
  {
    symbol: 'NATGASMINI',
    displayName: 'Natural Gas Mini',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 250, // 250 mmBtu per lot
    lotSize: 1,
    tickSize: 0.1,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Natural Gas Mini 250 mmBtu contract',
  },
  {
    symbol: 'GOLDM',
    displayName: 'Gold Mini',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    quoteCurrency: 'INR',
    contractMultiplier: 10, // 10 grams per point / 100g lot
    lotSize: 1,
    tickSize: 1.0,
    quantityIncrement: 1,
    pricePrecision: 2,
    isActive: true,
    description: 'MCX Gold Mini 100g contract',
  },
];

export type PresetInstrumentSpec = Omit<IInstrument, 'id'>;

/**
 * Internal spec lookup for known underlying symbols (lot size, tick size, multiplier, exchange, segment).
 * Never listed directly in the UI or API list response. Used only to prefill specs when auto-creating an instrument.
 */
export function getPresetSpec(symbol: string): PresetInstrumentSpec | undefined {
  if (!symbol) return undefined;
  const clean = symbol.trim().toUpperCase().replace(/^(NSE:|BSE:|MCX:)/i, '');
  const direct = PRESET_INSTRUMENTS.find(
    (p) => p.symbol === clean || p.symbol === symbol.trim().toUpperCase()
  );
  if (direct) return direct;
  if (clean === 'CRUDEOILM' || clean === 'CRUDEOILMINI') {
    return PRESET_INSTRUMENTS.find((p) => p.symbol === 'CRUDEOILMINI');
  }
  if (clean === 'NATGASMINI') {
    return PRESET_INSTRUMENTS.find((p) => p.symbol === 'NATGASMINI');
  }
  if (clean === 'NATGAS') {
    return PRESET_INSTRUMENTS.find((p) => p.symbol === 'NATURALGAS');
  }
  if (clean === 'GOLDM') {
    return PRESET_INSTRUMENTS.find((p) => p.symbol === 'GOLDM');
  }
  return undefined;
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
];

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
 * Official NSE Trading Holidays for calendar year 2026.
 * PROMINENT NOTICE: This list MUST be verified and updated annually when NSE publishes the official holiday circular for each calendar year.
 * Verified: Dussehra on 2026-10-20 (Tuesday) shifts Nifty weekly expiry to Monday 2026-10-19.
 * Verified: Guru Nanak Jayanti on 2026-11-24 (Tuesday) shifts NSE monthly expiry to Monday 2026-11-23.
 */
export const NSE_HOLIDAYS_2026: readonly string[] = [
  '2026-01-26', // Republic Day
  '2026-02-16', // Mahashivratri
  '2026-03-03', // Holi
  '2026-03-20', // Id-ul-Fitr (Ramzan Id)
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-27', // Bakri Id
  '2026-06-26', // Muharram
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra (Tuesday holiday -> shifts Nifty weekly expiry to Mon 2026-10-19)
  '2026-11-10', // Diwali Balipratipada
  '2026-11-24', // Guru Nanak Jayanti (Last Tuesday holiday -> shifts NSE monthly expiry to Mon 2026-11-23)
  '2026-12-25', // Christmas
];

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



