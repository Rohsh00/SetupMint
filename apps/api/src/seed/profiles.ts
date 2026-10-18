import { AccountType, AssetClass } from '@tradevault/shared';
import { SeedDensity, SeedProfileName } from './types.js';

export interface SeedAccountConfig {
  name: string;
  broker: string;
  accountNumber: string;
  accountType: AccountType;
  initialBalance: number;
  notes: string;
  isPrimary?: boolean;
}

export interface ProfileDefinition {
  name: SeedProfileName;
  displayName: string;
  description: string;
  defaultDensity: SeedDensity;
  tradeCountMap: Record<SeedDensity, number>;
  accounts: SeedAccountConfig[];
  allowedAssetClasses: AssetClass[];
  winRateTarget: number; // e.g. 0.58 for 58%
  allowAdvancedFills: boolean;
  allowOpenTrades: boolean;
  allowPlannedTrades: boolean;
  allowCancelledTrades: boolean;
  behaviorFocus?: 'PSYCHOLOGY' | 'BALANCED' | 'DISCIPLINED' | 'EDGE_CASES';
}

export const SEED_PROFILES: Record<SeedProfileName, ProfileDefinition> = {
  // Profile A: Beginner Trader
  beginner: {
    name: 'beginner',
    displayName: 'Profile A — Beginner Trader',
    description: 'Small account balance (₹1,00,000), 30–50 trades, basic equity and index trading, simple executions.',
    defaultDensity: 'minimal',
    tradeCountMap: {
      minimal: 35,
      standard: 50,
      rich: 80,
      analytics: 120,
      stress: 200,
    },
    accounts: [
      {
        name: 'FYERS Starter Account',
        broker: 'FYERS',
        accountNumber: 'FY-DEMO-001',
        accountType: 'EQUITY',
        initialBalance: 100000,
        notes: 'Personal beginner cash equity learning account',
        isPrimary: true,
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES'],
    winRateTarget: 0.52,
    allowAdvancedFills: false,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: false,
    behaviorFocus: 'BALANCED',
  },

  // Profile B: Active Indian Intraday Trader
  'active-trader': {
    name: 'active-trader',
    displayName: 'Profile B — Active Indian Intraday Trader',
    description: '500–1,000 trades, NSE Equity & Index derivatives, intraday IST executions, stop-loss and target exits, full cost breakdown.',
    defaultDensity: 'rich',
    tradeCountMap: {
      minimal: 60,
      standard: 350,
      rich: 750,
      analytics: 1500,
      stress: 3000,
    },
    accounts: [
      {
        name: 'FYERS Trading Pro (F&O & Equity)',
        broker: 'FYERS',
        accountNumber: 'FY-89240',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 500000,
        notes: 'Primary intraday F&O index execution account',
        isPrimary: true,
      },
      {
        name: 'FYERS Positional Portfolio',
        broker: 'FYERS',
        accountNumber: 'FY-89241',
        accountType: 'EQUITY',
        initialBalance: 250000,
        notes: 'Swing and momentum equity portfolio',
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES', 'OPTIONS'],
    winRateTarget: 0.58,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'BALANCED',
  },

  // Profile C: Options Specialist
  'options-specialist': {
    name: 'options-specialist',
    displayName: 'Profile C — Options Specialist',
    description: '500–1,000 trades, CE/PE instruments, strikes, monthly/weekly expiries, bought options and directional spreads.',
    defaultDensity: 'rich',
    tradeCountMap: {
      minimal: 50,
      standard: 300,
      rich: 650,
      analytics: 1200,
      stress: 2500,
    },
    accounts: [
      {
        name: 'FYERS Options Desk',
        broker: 'FYERS',
        accountNumber: 'FY-OPT-771',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 750000,
        notes: 'Dedicated index and stock options buying desk',
        isPrimary: true,
      },
    ],
    allowedAssetClasses: ['OPTIONS'],
    winRateTarget: 0.55,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'BALANCED',
  },

  // Profile D: MCX Commodity Trader
  'commodity-trader': {
    name: 'commodity-trader',
    displayName: 'Profile D — MCX Commodity Trader',
    description: '300–600 trades, CRUDEOIL, NATURALGAS, GOLD, SILVER, MCX evening sessions, contract multipliers & tick sizes.',
    defaultDensity: 'standard',
    tradeCountMap: {
      minimal: 40,
      standard: 350,
      rich: 600,
      analytics: 1000,
      stress: 2000,
    },
    accounts: [
      {
        name: 'FYERS MCX Commodities Desk',
        broker: 'FYERS',
        accountNumber: 'FY-MCX-552',
        accountType: 'COMMODITY',
        initialBalance: 500000,
        notes: 'Crude Oil, Natural Gas, Gold & Silver evening session account',
        isPrimary: true,
      },
    ],
    allowedAssetClasses: ['COMMODITY'],
    winRateTarget: 0.56,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: false,
    behaviorFocus: 'BALANCED',
  },

  // Profile E: Multi-Broker Professional
  'multi-broker': {
    name: 'multi-broker',
    displayName: 'Profile E — Multi-Broker Professional',
    description: '1,500–3,000 trades across FYERS, Zerodha, Angel One, Upstox, and ICICI Direct accounts.',
    defaultDensity: 'rich',
    tradeCountMap: {
      minimal: 80,
      standard: 500,
      rich: 1800,
      analytics: 3200,
      stress: 6000,
    },
    accounts: [
      {
        name: 'FYERS Main Active F&O',
        broker: 'FYERS',
        accountNumber: 'FY-MAIN-01',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 1000000,
        notes: 'Primary algorithmic and discretionary F&O desk',
        isPrimary: true,
      },
      {
        name: 'Zerodha Kite (Equities & Swing)',
        broker: 'Zerodha',
        accountNumber: 'ZR-88291',
        accountType: 'EQUITY',
        initialBalance: 500000,
        notes: 'CNC Equity delivery & swing trading',
      },
      {
        name: 'Angel One (Commodities)',
        broker: 'Angel One',
        accountNumber: 'AO-55219',
        accountType: 'COMMODITY',
        initialBalance: 400000,
        notes: 'MCX energy and bullion derivatives',
      },
      {
        name: 'Upstox Pro (Scalping)',
        broker: 'Upstox',
        accountNumber: 'UP-33108',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 300000,
        notes: 'High-frequency momentum scalping',
      },
      {
        name: 'ICICI Direct Prime (Core Long-Term)',
        broker: 'ICICI Direct',
        accountNumber: 'IC-99014',
        accountType: 'EQUITY',
        initialBalance: 800000,
        notes: 'Long-term equity investment & fundamental positioning',
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY'],
    winRateTarget: 0.60,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'BALANCED',
  },

  // Profile F: Psychology and Discipline
  psychology: {
    name: 'psychology',
    displayName: 'Profile F — Psychology and Discipline',
    description: '200–500 trades focused on behavioral analysis: FOMO, revenge trading, overtrading, discipline scores, contrasting outcomes.',
    defaultDensity: 'standard',
    tradeCountMap: {
      minimal: 50,
      standard: 300,
      rich: 500,
      analytics: 800,
      stress: 1500,
    },
    accounts: [
      {
        name: 'FYERS Psychology Tracker Account',
        broker: 'FYERS',
        accountNumber: 'FY-PSY-101',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 300000,
        notes: 'Trader psychology and emotional bias investigation account',
        isPrimary: true,
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES', 'OPTIONS'],
    winRateTarget: 0.50,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'PSYCHOLOGY',
  },

  // Profile G: Analytics Showcase
  analytics: {
    name: 'analytics',
    displayName: 'Profile G — Analytics Showcase',
    description: '2,000+ trades with balanced distribution across years, months, brokers, accounts, instruments, strategies, dense calendar.',
    defaultDensity: 'analytics',
    tradeCountMap: {
      minimal: 100,
      standard: 600,
      rich: 1500,
      analytics: 2500,
      stress: 5000,
    },
    accounts: [
      {
        name: 'FYERS Alpha Desk (F&O)',
        broker: 'FYERS',
        accountNumber: 'FY-SHOWCASE-01',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 1500000,
        notes: 'Institutional quality F&O execution ledger',
        isPrimary: true,
      },
      {
        name: 'FYERS Equity Growth Portfolio',
        broker: 'FYERS',
        accountNumber: 'FY-SHOWCASE-02',
        accountType: 'EQUITY',
        initialBalance: 800000,
        notes: 'Midcap & largecap momentum growth portfolio',
      },
      {
        name: 'FYERS MCX Energy Desk',
        broker: 'FYERS',
        accountNumber: 'FY-SHOWCASE-03',
        accountType: 'COMMODITY',
        initialBalance: 500000,
        notes: 'Commodity trend following desk',
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY'],
    winRateTarget: 0.62,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'BALANCED',
  },

  // Profile H: Edge Cases and Regression Testing
  'edge-cases': {
    name: 'edge-cases',
    displayName: 'Profile H — Edge Cases & Boundary Scenarios',
    description: 'Challenging scenarios: breakeven streaks, zero-loss days, open positions, planned trades, multi-fills, boundary timestamps.',
    defaultDensity: 'minimal',
    tradeCountMap: {
      minimal: 45,
      standard: 80,
      rich: 150,
      analytics: 250,
      stress: 500,
    },
    accounts: [
      {
        name: 'FYERS Primary Edge Test Account',
        broker: 'FYERS',
        accountNumber: 'FY-EDGE-01',
        accountType: 'FUTURES_OPTIONS',
        initialBalance: 500000,
        notes: 'Active edge cases execution account',
        isPrimary: true,
      },
      {
        name: 'FYERS Dormant Empty Account',
        broker: 'FYERS',
        accountNumber: 'FY-EDGE-EMPTY',
        accountType: 'EQUITY',
        initialBalance: 200000,
        notes: 'Testing zero trades empty state',
      },
    ],
    allowedAssetClasses: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY'],
    winRateTarget: 0.50,
    allowAdvancedFills: true,
    allowOpenTrades: true,
    allowPlannedTrades: true,
    allowCancelledTrades: true,
    behaviorFocus: 'EDGE_CASES',
  },
};
