export interface TradeSetupTemplate {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  symbol: string;
  assetClass: 'EQUITY' | 'FUTURES' | 'OPTIONS' | 'COMMODITY' | 'FOREX' | 'CRYPTO' | 'INDEX';
  exchange: string;
  marketSegment: string;
  direction?: 'LONG' | 'SHORT';
  session?: string;
  strategyId?: string;
  strategyName?: string;
  riskBudgetAmount?: number;
  confluences?: string[];
  tags?: string[];
  preMarketBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  marketStructure?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
}

export const BUILTIN_TEMPLATES: TradeSetupTemplate[] = [
  {
    id: 'template-nifty-momentum',
    name: 'Nifty 50 Futures Momentum',
    description: 'Break of structure with FVG retest on 5m execution',
    isBuiltIn: true,
    symbol: 'NIFTY',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    direction: 'LONG',
    session: 'NSE_REGULAR',
    strategyName: 'Liquidity Sweep + FVG Reversal',
    riskBudgetAmount: 2500,
    confluences: ['BOS', 'FVG', 'VWAP'],
    tags: ['INDEX', 'MOMENTUM', 'INTRADAY'],
    preMarketBias: 'BULLISH',
    marketStructure: 'TRENDING_UP',
  },
  {
    id: 'template-banknifty-raid',
    name: 'Bank Nifty Liquidity Raid',
    description: 'Stop run of previous day high/low with order block tap',
    isBuiltIn: true,
    symbol: 'BANKNIFTY',
    assetClass: 'FUTURES',
    exchange: 'NSE',
    marketSegment: 'NSE_FNO',
    direction: 'SHORT',
    session: 'NSE_REGULAR',
    strategyName: 'Break of Structure (BOS) Trend Continuation',
    riskBudgetAmount: 3000,
    confluences: ['LIQUIDITY_SWEEP', 'ORDER_BLOCK', 'PDH_PDL'],
    tags: ['BANKNIFTY', 'SWEEP', 'SCALP'],
    preMarketBias: 'BEARISH',
    marketStructure: 'RANGING',
  },
  {
    id: 'template-equity-breakout',
    name: 'Large Cap Equity Breakout',
    description: 'Daily resistance breakout with institutional volume confirmation',
    isBuiltIn: true,
    symbol: 'RELIANCE',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    marketSegment: 'NSE_EQ',
    direction: 'LONG',
    session: 'NSE_REGULAR',
    strategyName: 'High-Volume Breakout',
    riskBudgetAmount: 5000,
    confluences: ['SUPPORT_RESISTANCE', 'VOLUME_SPIKE', 'EMA_CROSS'],
    tags: ['EQUITY', 'SWING', 'VOLUME'],
    preMarketBias: 'BULLISH',
    marketStructure: 'TRENDING_UP',
  },
  {
    id: 'template-mcx-crude',
    name: 'MCX Crude Oil Evening Session',
    description: 'US inventory release momentum or London close continuation',
    isBuiltIn: true,
    symbol: 'CRUDEOIL',
    assetClass: 'COMMODITY',
    exchange: 'MCX',
    marketSegment: 'MCX',
    direction: 'LONG',
    session: 'MCX_EVENING',
    strategyName: 'Trend Pullback',
    riskBudgetAmount: 4000,
    confluences: ['VWAP', 'EMA_CROSS', 'VOLUME_SPIKE'],
    tags: ['COMMODITY', 'MCX', 'EVENING'],
    preMarketBias: 'NEUTRAL',
    marketStructure: 'RANGING',
  },
  {
    id: 'template-crypto-perp',
    name: 'Crypto Perp Scalp',
    description: 'Order book liquidity grab and weekend consolidation breakout',
    isBuiltIn: true,
    symbol: 'BTCUSDT',
    assetClass: 'CRYPTO',
    exchange: 'BINANCE',
    marketSegment: 'CRYPTO',
    direction: 'LONG',
    session: 'OFF_HOURS',
    strategyName: 'Mean Reversion',
    riskBudgetAmount: 1500,
    confluences: ['LIQUIDITY_SWEEP', 'SUPPORT_RESISTANCE'],
    tags: ['CRYPTO', 'PERP', '24-7'],
    preMarketBias: 'NEUTRAL',
    marketStructure: 'RANGING',
  },
];

const CUSTOM_TEMPLATES_KEY = 'setupmint_custom_templates';
const LEGACY_CUSTOM_TEMPLATES_KEY = 'stratum_custom_templates';
const PREF_ACCOUNT_KEY = 'setupmint_pref_account';
const LEGACY_PREF_ACCOUNT_KEY = 'stratum_pref_account';
const PREF_INSTRUMENT_KEY = 'setupmint_pref_instrument';
const LEGACY_PREF_INSTRUMENT_KEY = 'stratum_pref_instrument';
const PREF_WORKFLOW_MODE_KEY = 'setupmint_pref_trade_mode';
const LEGACY_PREF_WORKFLOW_MODE_KEY = 'stratum_pref_trade_mode';

export function getCustomTemplates(): TradeSetupTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY) || localStorage.getItem(LEGACY_CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: Omit<TradeSetupTemplate, 'id' | 'isBuiltIn'>): TradeSetupTemplate {
  const existing = getCustomTemplates();
  const newTemplate: TradeSetupTemplate = {
    ...template,
    id: `custom-template-${Date.now()}`,
    isBuiltIn: false,
  };
  const updated = [newTemplate, ...existing];
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return newTemplate;
}

export function deleteCustomTemplate(id: string): void {
  const existing = getCustomTemplates();
  const updated = existing.filter((t) => t.id !== id);
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function getAllTemplates(): TradeSetupTemplate[] {
  return [...BUILTIN_TEMPLATES, ...getCustomTemplates()];
}

export interface TradePreferences {
  preferredAccountId?: string;
  preferredSymbol?: string;
  preferredWorkflow?: 'QUICK' | 'COMPREHENSIVE';
}

export function getRememberedTradePreferences(): TradePreferences {
  if (typeof window === 'undefined') return {};
  try {
    return {
      preferredAccountId: localStorage.getItem(PREF_ACCOUNT_KEY) || localStorage.getItem(LEGACY_PREF_ACCOUNT_KEY) || undefined,
      preferredSymbol: localStorage.getItem(PREF_INSTRUMENT_KEY) || localStorage.getItem(LEGACY_PREF_INSTRUMENT_KEY) || undefined,
      preferredWorkflow: (localStorage.getItem(PREF_WORKFLOW_MODE_KEY) || localStorage.getItem(LEGACY_PREF_WORKFLOW_MODE_KEY)) as 'QUICK' | 'COMPREHENSIVE' | undefined,
    };
  } catch {
    return {};
  }
}

export function saveRememberedTradePreferences(prefs: TradePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    if (prefs.preferredAccountId) localStorage.setItem(PREF_ACCOUNT_KEY, prefs.preferredAccountId);
    if (prefs.preferredSymbol) localStorage.setItem(PREF_INSTRUMENT_KEY, prefs.preferredSymbol);
    if (prefs.preferredWorkflow) localStorage.setItem(PREF_WORKFLOW_MODE_KEY, prefs.preferredWorkflow);
  } catch {
    // ignore
  }
}
