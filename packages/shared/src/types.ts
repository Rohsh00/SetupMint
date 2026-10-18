export type AssetClass =
  | 'EQUITY'
  | 'FUTURES'
  | 'OPTIONS'
  | 'COMMODITY'
  | 'FOREX'
  | 'CRYPTO'
  | 'INDEX';

export type MarketSegment =
  | 'NSE_EQ'
  | 'NSE_FNO'
  | 'BSE_EQ'
  | 'MCX'
  | 'FOREX'
  | 'CRYPTO'
  | 'US_EQUITY'
  | 'CME'
  | 'OTHER';

export type Direction = 'LONG' | 'SHORT';

export type TradeStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED';

export type TradeOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN' | 'CANCELLED';

export type ExecutionMode = 'SIMPLE' | 'ADVANCED';

export type FillType = 'ENTRY' | 'EXIT';

export type OptionType = 'CALL' | 'PUT';

export type AccountType =
  | 'EQUITY'
  | 'COMMODITY'
  | 'FUTURES_OPTIONS'
  | 'FOREX'
  | 'CRYPTO'
  | 'PROP_FIRM'
  | 'DEMO'
  | 'OTHER';

export type AccountStatus = 'ACTIVE' | 'ARCHIVED';

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'ADJUSTMENT';

export type Emotion =
  | 'CALM'
  | 'CONFIDENT'
  | 'ANXIOUS'
  | 'EUPHORIC'
  | 'FEARFUL'
  | 'GREEDY'
  | 'FRUSTRATED'
  | 'DISCIPLINED'
  | 'NEUTRAL';

export type MistakeTag =
  | 'REVENGE_TRADING'
  | 'OVERTRADING'
  | 'PREMATURE_EXIT'
  | 'STOP_MOVED'
  | 'SIZE_VIOLATION'
  | 'FOMO'
  | 'CHASED_MARKET'
  | 'NO_STOP_LOSS'
  | 'EARLY_ENTRY'
  | 'LATE_ENTRY'
  | 'POOR_RR'
  | 'NEWS_GAMBLE';

export type Confluence =
  | 'BOS'
  | 'CHOCH'
  | 'FVG'
  | 'ORDER_BLOCK'
  | 'LIQUIDITY_SWEEP'
  | 'PDH_PDL'
  | 'PWH_PWL'
  | 'SUPPORT_RESISTANCE'
  | 'TRENDLINE'
  | 'FIBONACCI'
  | 'EMA_CROSS'
  | 'VWAP'
  | 'VOLUME_SPIKE';

export type TradingSession =
  | 'NSE_REGULAR'
  | 'MCX_EVENING'
  | 'ASIA'
  | 'LONDON'
  | 'NEW_YORK'
  | 'OFF_HOURS';

export interface IUser {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  theme: 'dark' | 'light' | 'system';
  createdAt: string;
  updatedAt: string;
}

export interface ITradingAccount {
  id: string;
  userId: string;
  name: string;
  broker: string;
  accountNumber?: string;
  accountType: AccountType;
  baseCurrency: string;
  initialBalance: number;
  currentBalance: number;
  realizedPnL: number;
  totalDeposits: number;
  totalWithdrawals: number;
  status: AccountStatus;
  riskRules?: {
    maxDailyLoss?: number;
    maxRiskPerTradePercent?: number;
    maxOpenTrades?: number;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAccountTransaction {
  id: string;
  userId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface IInstrument {
  id: string;
  userId?: string; // Optional if global system preset
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  exchange: string;
  marketSegment: MarketSegment;
  quoteCurrency: string;
  contractMultiplier: number;
  lotSize: number;
  tickSize: number;
  quantityIncrement: number;
  pricePrecision: number;
  isActive: boolean;
  expiryDate?: string;
  optionType?: OptionType;
  strikePrice?: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IStrategy {
  id: string;
  userId: string;
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
  notes?: string;
  isActive: boolean;
  totalTrades?: number;
  winRate?: number;
  netPnL?: number;
  profitFactor?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ITradeFill {
  fillId: string;
  type: FillType;
  price: number;
  quantity: number;
  timestamp: string;
  fee?: number;
  brokerage?: number;
  exchangeFee?: number;
  taxes?: number;
  notes?: string;
}

export interface ISimpleExecution {
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  contractMultiplier: number;
  brokerage: number;
  exchangeFees: number;
  regulatoryFees: number;
  taxes: number; // STT, GST, Stamp duty
  otherFees: number;
  explicitAdjustments: number;
  adjustmentsReason?: string;
}

export interface IRiskDetails {
  plannedEntryPrice?: number;
  initialStopLoss?: number;
  plannedTarget?: number;
  riskBudgetAmount?: number;
  riskPercentage?: number;
  suggestedQuantity?: number;
  actualQuantity?: number;
  estimatedRiskAmount?: number;
  riskAsPercentOfEquity?: number;
  plannedRewardRiskRatio?: number;
  realizedRMultiple?: number;
  riskRuleViolations?: string[];
}

export interface ITradeThesis {
  preMarketBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  marketStructure?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
  entryRationale?: string;
  entryConfirmation?: string;
  stopLossRationale?: string;
  targetRationale?: string;
  exitRationale?: string;
  invalidationConditions?: string;
  higherTimeframeContext?: string;
  confluences: Confluence[];
  customTechnicalLabels: string[];
}

export interface IPsychologyDetails {
  emotionBefore?: Emotion;
  emotionDuring?: Emotion;
  emotionAfter?: Emotion;
  confidenceScore?: number; // 1 to 5
  disciplineScore?: number; // 1 to 5
  checklistCompleted?: boolean;
  rulesFollowed?: boolean;
  mistakes: MistakeTag[];
  revengeTrading: boolean;
  overtrading: boolean;
  prematureExit: boolean;
  stopLossMoved: boolean;
  positionSizeViolation: boolean;
  lessonsLearned?: string;
  notes?: string;
}

export interface ICalculatedDetails {
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  realizedRMultiple?: number;
  holdingTimeMinutes?: number;
  outcome: TradeOutcome;
  closedQuantity: number;
  openQuantity: number;
  averageEntryPrice: number;
  averageExitPrice?: number;
}

export type AttachmentCategory =
  | 'SETUP'
  | 'ENTRY'
  | 'EXIT'
  | 'REVIEW'
  | 'OTHER'
  | 'BEFORE_ENTRY'
  | 'ANNOTATED'
  | 'ATTACHMENT';

export interface IAttachment {
  id: string;
  userId: string;
  tradeId?: string;
  originalName: string;
  storedFilename?: string;
  mimeType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  caption?: string;
  description?: string;
  timeframe?: string;
  chartTimestamp?: string;
  downloadUrl?: string;
  createdAt: string;
}

export interface IAuditEntry {
  action: string;
  timestamp: string;
  changedBy: string;
  details?: Record<string, any>;
}

export interface ITrade {
  id: string;
  userId: string;
  accountId: string;
  accountName?: string;
  instrumentId?: string;
  symbol: string;
  instrumentName?: string;
  assetClass: AssetClass;
  exchange: string;
  marketSegment: MarketSegment;
  currency: string;
  direction: Direction;
  status: TradeStatus;
  strategyId?: string;
  strategyName?: string;
  tags: string[];
  tradeDate: string; // YYYY-MM-DD
  timeZone: string;
  entryTime: string; // ISO
  exitTime?: string; // ISO
  session?: TradingSession;
  tradeTitle?: string;
  externalBrokerOrderRef?: string;
  externalExecutionId?: string;

  executionMode: ExecutionMode;
  simpleExecution?: ISimpleExecution;
  fills: ITradeFill[];

  risk: IRiskDetails;
  thesis: ITradeThesis;
  psychology: IPsychologyDetails;
  calculated: ICalculatedDetails;

  screenshotIds: string[];
  attachments?: IAttachment[];
  auditLog: IAuditEntry[];

  createdAt: string;
  updatedAt: string;
}

export interface IDailyJournal {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  marketConditions?: string;
  marketBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bestTradeId?: string;
  worstTradeId?: string;
  mistakes: string[];
  emotionalState?: Emotion;
  disciplineRating?: number; // 1 to 5
  lessonsLearned?: string;
  nextDayPlan?: string;
  notes?: string;
  tradesCount?: number;
  netPnL?: number;
  winCount?: number;
  lossCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface IDashboardStats {
  netPnL: number;
  grossPnL: number;
  totalCosts: number;
  openPnL: number;
  closedTradesCount: number;
  openTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  breakevenTradesCount: number;
  winRate: number;
  lossRate: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  profitFactor: number;
  expectancy: number;
  avgRealizedR: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  currentStreak: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldingTimeMinutes: number;
  bestTradingDay?: { date: string; netPnL: number };
  worstTradingDay?: { date: string; netPnL: number };
  ruleAdherencePercent: number;

  equityCurve: Array<{
    date: string;
    tradeId?: string;
    symbol?: string;
    netPnL: number;
    cumulativeEquity: number;
    drawdown: number;
    drawdownPercent: number;
  }>;

  dailyPnL: Array<{
    date: string;
    netPnL: number;
    tradesCount: number;
    winCount: number;
    lossCount: number;
  }>;

  monthlyPnL: Array<{
    yearMonth: string;
    netPnL: number;
    tradesCount: number;
    winRate: number;
  }>;

  performanceByInstrument: Array<{
    symbol: string;
    tradesCount: number;
    netPnL: number;
    winRate: number;
    profitFactor: number;
  }>;

  performanceByStrategy: Array<{
    strategyId: string;
    strategyName: string;
    tradesCount: number;
    netPnL: number;
    winRate: number;
    profitFactor: number;
  }>;

  performanceByWeekday: Array<{
    day: string; // Monday, Tuesday, ...
    tradesCount: number;
    netPnL: number;
    winRate: number;
  }>;

  performanceBySession: Array<{
    session: TradingSession;
    tradesCount: number;
    netPnL: number;
    winRate: number;
  }>;

  pnlDistribution: Array<{
    range: string;
    count: number;
    isProfit: boolean;
  }>;
}

export interface IRiskCalculationParams {
  accountEquity: number;
  riskPercent?: number;
  fixedRiskAmount?: number;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice?: number;
  direction: Direction;
  contractMultiplier?: number;
  lotSize?: number;
  tickSize?: number;
  quantityIncrement?: number;
  estimatedCosts?: number;
}

export interface IRiskCalculationResult {
  plannedRiskAmount: number;
  riskPercentage: number;
  stopLossDistance: number;
  lossPerUnitAtStop: number;
  rawSuggestedQuantity: number;
  roundedLotQuantity: number;
  estimatedMonetaryLoss: number;
  actualRiskPercentage: number;
  estimatedReward?: number;
  rewardRiskRatio?: number;
  estimatedNetReward?: number;
  isDirectionValid: boolean;
  isStopDistanceZero: boolean;
  warnings: string[];
}

// Future FYERS Broker Integration Architecture Abstractions
export interface INormalizedExecution {
  broker: 'FYERS';
  brokerTradeId: string;
  brokerOrderId: string;
  symbol: string;
  exchange: string;
  segment: string;
  direction: Direction;
  price: number;
  quantity: number;
  timestamp: string;
  orderType: string;
  productType: string;
  rawPayload?: Record<string, any>;
}

export interface IBrokerSyncJob {
  id: string;
  userId: string;
  broker: 'FYERS';
  status: 'IDLE' | 'SYNCING' | 'COMPLETED' | 'FAILED';
  lastSyncAt?: string;
  syncedExecutionsCount: number;
  reconciledTradesCount: number;
  unreconciledCount: number;
  errorMessage?: string;
}

export interface IReconciliationItem {
  execution: INormalizedExecution;
  matchedTradeId?: string;
  matchConfidence: 'EXACT' | 'HIGH' | 'AMBIGUOUS' | 'NEW';
  status: 'PENDING_REVIEW' | 'MERGED' | 'CREATED_NEW' | 'IGNORED';
}
