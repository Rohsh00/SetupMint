export type SeedProfileName =
  | 'beginner'
  | 'active-trader'
  | 'options-specialist'
  | 'commodity-trader'
  | 'multi-broker'
  | 'psychology'
  | 'analytics'
  | 'edge-cases';

export type SeedDensity = 'minimal' | 'standard' | 'rich' | 'analytics' | 'stress';

export interface SeedOptions {
  profile?: SeedProfileName;
  density?: SeedDensity;
  randomSeed?: number;
  asOfDate?: Date;
  customTradeCount?: number;
}

export interface SeedResult {
  profile: SeedProfileName;
  density: SeedDensity;
  userEmail: string;
  userId: string;
  counts: {
    accounts: number;
    transactions: number;
    instruments: number;
    strategies: number;
    trades: number;
    attachments: number;
    dailyJournals: number;
    brokerIntegrations: number;
  };
  tradesSummary: {
    closed: number;
    open: number;
    planned: number;
    cancelled: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRatePercent: number;
    totalGrossPnL: number;
    totalCosts: number;
    totalNetPnL: number;
  };
  accountsSummary: Array<{
    name: string;
    broker: string;
    initialBalance: number;
    currentBalance: number;
    realizedPnL: number;
  }>;
  durationMs: number;
}
