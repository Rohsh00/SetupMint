import { AssetClass } from '@tradevault/shared';

export interface StrategyPlaybookSeed {
  name: string;
  description: string;
  assetClasses: AssetClass[];
  timeframes: string[];
  entryRules: string[];
  stopLossRules: string[];
  targetRules: string[];
  invalidationCriteria: string[];
  checklist: string[];
  minRiskReward: number;
  tags: string[];
  isActive: boolean;
}

export const SEED_STRATEGY_PLAYBOOKS: StrategyPlaybookSeed[] = [
  {
    name: '15-Min Opening Range Breakout (ORB)',
    description: 'High momentum breakout of the 15-minute high/low with volume confirmation at market open.',
    assetClasses: ['EQUITY', 'FUTURES'],
    timeframes: ['5m', '15m'],
    entryRules: [
      'Wait for 15-minute opening candle to close cleanly',
      'Check if volume on breakout candle is > 1.5x 20-period average',
      'Ensure index and sector align with breakout direction',
    ],
    stopLossRules: ['Place hard stop at the midpoint or opposite side of the 15m range'],
    targetRules: ['Target 1.5R to 2.5R or next major pivot high/low'],
    invalidationCriteria: ['False breakout reversal closing back inside range'],
    checklist: [
      'No major news release within 10 minutes',
      'Risk is strictly within 1% of account equity',
      'Spread is normal',
    ],
    minRiskReward: 1.5,
    tags: ['Breakout', 'Momentum', 'MorningSession'],
    isActive: true,
  },
  {
    name: 'Liquidity Sweep + FVG Reversal',
    description: 'Smart Money Concept (SMC) entry following a sweep of prev day high/low and market structure shift.',
    assetClasses: ['FUTURES', 'COMMODITY', 'OPTIONS'],
    timeframes: ['3m', '15m', '1h'],
    entryRules: [
      'Liquidity sweep of PDH or PDL with rejection wick',
      'Change of Character (CHOCH) on 3m timeframe',
      'Limit order entry at 50% discount of Fair Value Gap (FVG)',
    ],
    stopLossRules: ['Invalidation stop beyond the extreme sweep swing high/low'],
    targetRules: ['Opposite liquidity pool or 2.5R - 3R target'],
    invalidationCriteria: ['Clean candle close beyond sweep extreme'],
    checklist: ['Higher timeframe bias confirmed', 'Risk strictly 1% of equity'],
    minRiskReward: 2.5,
    tags: ['SMC', 'LiquiditySweep', 'FVG'],
    isActive: true,
  },
  {
    name: '20 EMA Trend Pullback',
    description: 'Trend following setup waiting for price pullback into dynamic support of the 20 EMA on 15m.',
    assetClasses: ['EQUITY', 'COMMODITY'],
    timeframes: ['15m', '1h'],
    entryRules: [
      'Strong trend established above/below 50 EMA',
      'Touch and rejection wick off 20 EMA in trend direction',
      'Volume drying up on pullback candle',
    ],
    stopLossRules: ['Below/above rejection candle extreme'],
    targetRules: ['Recent swing high or 2.0R'],
    invalidationCriteria: ['Two consecutive closes through 20 EMA'],
    checklist: ['Market trend is intact', 'R:R is minimum 2:1'],
    minRiskReward: 2.0,
    tags: ['TrendFollowing', 'EMA', 'Pullback'],
    isActive: true,
  },
  {
    name: 'Previous Day High/Low (PDH/PDL) Breakout',
    description: 'Trading continuation moves once price breaks through the previous day extreme with sustained acceptance.',
    assetClasses: ['FUTURES', 'EQUITY'],
    timeframes: ['5m', '15m'],
    entryRules: [
      'Price breaks PDH/PDL with heavy volume',
      '5-minute candle closes outside yesterday range',
      'Enter on retest of the broken level',
    ],
    stopLossRules: ['Inside yesterday range by 0.3%'],
    targetRules: ['Fibonacci 1.618 extension or 2R'],
    invalidationCriteria: ['Immediate failure back into value area'],
    checklist: ['Market breadth is positive', 'Sector leading the index'],
    minRiskReward: 1.8,
    tags: ['Breakout', 'PDH_PDL', 'Volume'],
    isActive: true,
  },
  {
    name: 'Key Support & Resistance Demand Zone Bounce',
    description: 'Value buyer entry at daily demand zones and institutional support clusters.',
    assetClasses: ['EQUITY', 'FUTURES', 'OPTIONS'],
    timeframes: ['15m', '1h', '4h'],
    entryRules: [
      'Price reaches multi-day support zone',
      'Bullish engulfing or hammer candle on 15m',
      'RSI oversold divergence on 1h timeframe',
    ],
    stopLossRules: ['Buffer below the support cluster swing low'],
    targetRules: ['Next major overhead resistance pivot'],
    invalidationCriteria: ['Clean hourly close below support'],
    checklist: ['Higher timeframe bias aligned', 'Risk defined before entry'],
    minRiskReward: 2.0,
    tags: ['SupportResistance', 'Reversal', 'DemandZone'],
    isActive: true,
  },
  {
    name: 'Options Momentum & VWAP Rejection',
    description: 'Intraday option buying strategy capturing fast delta moves upon VWAP cross and volume surge.',
    assetClasses: ['OPTIONS'],
    timeframes: ['1m', '5m'],
    entryRules: [
      'Underlying breaks through VWAP with expanding volume',
      'Option premium crosses previous 15m high',
      'Open interest confirms directional build-up',
    ],
    stopLossRules: ['Hard stop at option premium VWAP minus 10%'],
    targetRules: ['Quick 20% to 35% premium gain or 2R'],
    invalidationCriteria: ['Underlying reversing through VWAP'],
    checklist: ['Avoid expiry day theta decay trap', 'Strict stop loss in broker terminal'],
    minRiskReward: 1.5,
    tags: ['Options', 'Scalping', 'VWAP'],
    isActive: true,
  },
  {
    name: 'MCX Evening Session Breakout',
    description: 'Capturing explosive commodity volatility during the US market opening overlap (17:30 - 20:00 IST).',
    assetClasses: ['COMMODITY'],
    timeframes: ['15m', '30m'],
    entryRules: [
      'Price breaks consolidation range established during Indian afternoon session',
      'NYMEX crude/gas aligns with breakout',
      'Enter on 15m candle close with volume surge',
    ],
    stopLossRules: ['Opposite side of afternoon consolidation range'],
    targetRules: ['Major daily pivot level or 2R'],
    invalidationCriteria: ['False spike reversing within 15 minutes'],
    checklist: ['Check EIA inventory report calendar', 'Verify international market trend'],
    minRiskReward: 2.0,
    tags: ['Commodity', 'MCX', 'EveningSession'],
    isActive: true,
  },
];
