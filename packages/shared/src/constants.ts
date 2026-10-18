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

export const EMOTIONS: { value: Emotion; label: string; color: string }[] = [
  { value: 'CALM', label: 'Calm & Centered', color: 'emerald' },
  { value: 'CONFIDENT', label: 'Confident & Prepared', color: 'blue' },
  { value: 'DISCIPLINED', label: 'Disciplined & Patient', color: 'teal' },
  { value: 'NEUTRAL', label: 'Neutral / Routine', color: 'slate' },
  { value: 'ANXIOUS', label: 'Anxious / Hesitant', color: 'amber' },
  { value: 'FEARFUL', label: 'Fearful / Scared of Loss', color: 'orange' },
  { value: 'GREEDY', label: 'Greedy / Wanting Big Win', color: 'purple' },
  { value: 'EUPHORIC', label: 'Euphoric / Overconfident', color: 'indigo' },
  { value: 'FRUSTRATED', label: 'Frustrated / Angry', color: 'rose' },
];

export const MISTAKE_TAGS: { value: MistakeTag; label: string; description: string }[] = [
  { value: 'REVENGE_TRADING', label: 'Revenge Trading', description: 'Trying to quickly make back a recent loss' },
  { value: 'OVERTRADING', label: 'Overtrading', description: 'Taking trades outside playbook or beyond daily limit' },
  { value: 'PREMATURE_EXIT', label: 'Premature Exit', description: 'Closing winning trade before target without invalidation' },
  { value: 'STOP_MOVED', label: 'Moved Stop Loss', description: 'Widening or moving stop loss further away during trade' },
  { value: 'SIZE_VIOLATION', label: 'Position Sizing Violation', description: 'Trading bigger than permitted by risk rules' },
  { value: 'FOMO', label: 'FOMO / Chasing Move', description: 'Entering after the move started because of fear of missing out' },
  { value: 'CHASED_MARKET', label: 'Chased Market', description: 'Accepting poor entry price and bad R:R' },
  { value: 'NO_STOP_LOSS', label: 'No Hard Stop Loss', description: 'Entered position without predefined invalidation stop' },
  { value: 'EARLY_ENTRY', label: 'Early Entry', description: 'Anticipating setup before actual confirmation' },
  { value: 'LATE_ENTRY', label: 'Late Entry', description: 'Missed optimal entry, reduced profit margin' },
  { value: 'POOR_RR', label: 'Poor Risk/Reward Ratio', description: 'Planned reward was lower than minimum threshold' },
  { value: 'NEWS_GAMBLE', label: 'News Gambling', description: 'Holding high leverage through unpredictable macro events' },
];

export const CONFLUENCES: { value: Confluence; label: string }[] = [
  { value: 'BOS', label: 'Break of Structure (BOS)' },
  { value: 'CHOCH', label: 'Change of Character (CHOCH)' },
  { value: 'FVG', label: 'Fair Value Gap (FVG)' },
  { value: 'ORDER_BLOCK', label: 'Order Block (OB)' },
  { value: 'LIQUIDITY_SWEEP', label: 'Liquidity Sweep / Raid' },
  { value: 'PDH_PDL', label: 'Prev Day High / Low' },
  { value: 'PWH_PWL', label: 'Prev Week High / Low' },
  { value: 'SUPPORT_RESISTANCE', label: 'Key Support / Resistance' },
  { value: 'TRENDLINE', label: 'Trendline Liquidity' },
  { value: 'FIBONACCI', label: 'Fibonacci Golden Pocket / OTE' },
  { value: 'EMA_CROSS', label: 'EMA Alignment / Dynamic S/R' },
  { value: 'VWAP', label: 'VWAP Rejection / Deviation' },
  { value: 'VOLUME_SPIKE', label: 'Institutional Volume Spike' },
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
    displayName: 'Nifty 50 Index Futures',
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
    displayName: 'Bank Nifty Futures',
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
    displayName: 'Nifty Financial Services Futures',
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
];

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
];

