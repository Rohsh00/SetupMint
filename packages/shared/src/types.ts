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

export type AccountTransactionSource = 'MANUAL' | 'BROKER_LEDGER_IMPORT' | 'BROKER_SYNC';

export type AccountTransactionStatus = 'CONFIRMED' | 'PENDING_REVIEW' | 'REJECTED';

export type BrokerImportKind = 'TRADES' | 'CASH_FLOWS';

export type Emotion =
  // Positive
  | 'CALM'
  | 'CONFIDENT'
  | 'DISCIPLINED'
  | 'PATIENT'
  | 'FOCUSED'
  | 'RELIEVED'
  // Neutral
  | 'NEUTRAL'
  | 'BORED'
  | 'HESITANT'
  | 'DOUBTFUL_OF_LEVEL'
  // Negative
  | 'ANXIOUS'
  | 'FEARFUL'
  | 'GREEDY'
  | 'EUPHORIC'
  | 'FRUSTRATED'
  | 'IMPATIENT'
  | 'FOMO'
  | 'OVERCONFIDENT'
  | 'STRESSED'
  | 'TILTED'
  | 'REVENGEFUL'
  | 'REGRETFUL'
  | 'FEAR_OF_STOP_HUNT';

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
  | 'NEWS_GAMBLE'
  // Liquidity & Level Mistakes
  | 'ENTERED_BEFORE_SWEEP'
  | 'NO_LIQUIDITY_TAKEN'
  | 'NO_CONFIRMATION_AFTER_SWEEP'
  | 'TRADED_INTO_HTF_LEVEL'
  | 'TRADED_MID_RANGE'
  | 'STOP_INSIDE_LIQUIDITY_POOL'
  | 'STOP_TOO_TIGHT'
  | 'TARGET_NOT_AT_LIQUIDITY'
  | 'NO_LIQUIDITY_TARGET'
  | 'IGNORED_HTF_BIAS'
  | 'COUNTER_TREND_NO_SWEEP'
  | 'FAKE_BREAKOUT_CHASE'
  | 'FOMO_ENTRY'
  | 'BREAKEVEN_TOO_EARLY'
  | 'ADDED_TO_LOSER'
  | 'TRADED_OUTSIDE_SESSION'
  | 'TRADED_NEWS_EVENT';

export type Confluence =
  // Existing SMC & Technical Core
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
  | 'VOLUME_SPIKE'
  // Liquidity Confluences
  | 'BUY_SIDE_LIQUIDITY_SWEEP'
  | 'SELL_SIDE_LIQUIDITY_SWEEP'
  | 'EQUAL_HIGHS'
  | 'EQUAL_LOWS'
  | 'PREV_DAY_HIGH_SWEEP'
  | 'PREV_DAY_LOW_SWEEP'
  | 'PREV_WEEK_HIGH_SWEEP'
  | 'PREV_WEEK_LOW_SWEEP'
  | 'ASIAN_RANGE_SWEEP'
  | 'SESSION_HIGH_LOW_SWEEP'
  | 'STOP_HUNT'
  | 'INDUCEMENT'
  | 'TRENDLINE_LIQUIDITY'
  | 'LIQUIDITY_VOID'
  | 'LIQUIDITY_POOL_TARGET'
  | 'LIQUIDITY_GRAB_REJECTION'
  // Support / Resistance Confluences
  | 'HTF_SUPPORT'
  | 'HTF_RESISTANCE'
  | 'SUPPORT_RESISTANCE_FLIP'
  | 'SUPPORT_RETEST'
  | 'RESISTANCE_RETEST'
  | 'DEMAND_ZONE'
  | 'SUPPLY_ZONE'
  | 'KEY_LEVEL_REJECTION'
  | 'ROUND_NUMBER_LEVEL'
  | 'PREV_DAY_HIGH_LOW_LEVEL'
  | 'OPENING_RANGE_LEVEL'
  | 'VWAP_LEVEL'
  | 'FAKE_BREAKOUT_RECLAIM'
  | 'DOUBLE_TOP_BOTTOM'
  | 'RANGE_HIGH_LOW_REJECTION'
  | 'OI_WALL_CE'
  | 'OI_WALL_PE'
  // Confirmation / Structure Confluences
  | 'MARKET_STRUCTURE_SHIFT'
  | 'DISPLACEMENT'
  | 'BREAKER_BLOCK'
  | 'MITIGATION_BLOCK'
  | 'PREMIUM_ZONE_ENTRY'
  | 'DISCOUNT_ZONE_ENTRY'
  | 'LTF_CONFIRMATION_CANDLE'
  | 'LEVEL_RECLAIM'
  | 'VOLUME_SPIKE_AT_LEVEL';

export type TradingSession =
  | 'NSE_REGULAR'
  | 'MCX_EVENING'
  | 'ASIA'
  | 'LONDON'
  | 'NEW_YORK'
  | 'OFF_HOURS';

export interface IRiskSettings {
  maxDailyLoss?: number;
  maxDailyTrades?: number;
  maxOpenTrades?: number;
  maxRiskPerTradePercent?: number;
  revengeTradingMinutes?: number;
}

export interface IInstrumentDetectionSetting {
  symbol: string;
  htf: string;
  ltf: string;
  preferredStrategyId?: string;
  preferredStrategyName?: string;
}

export interface IExcursionSettings {
  gaveBackMinMfeR?: number;
  gaveBackEfficiencyThreshold?: number;
  earlyExitEfficiencyThreshold?: number;
  stopTooTightReversalR?: number;
  stopTooTightCandleLookahead?: number;
  stopTooTightMaxBreachBufferR?: number;
  entryQualityCandleCount?: number;
}

export const DEFAULT_EXCURSION_SETTINGS: IExcursionSettings = {
  gaveBackMinMfeR: 1.0,
  gaveBackEfficiencyThreshold: 0.5,
  earlyExitEfficiencyThreshold: 0.35,
  stopTooTightReversalR: 1.0,
  stopTooTightCandleLookahead: 20,
  stopTooTightMaxBreachBufferR: 0.75,
  entryQualityCandleCount: 3,
};

export interface IPatternDetectionSettings {
  defaultHtf: string;
  defaultLtf: string;
  autoDetectOnImport?: boolean;
  autoDetectMistakes?: boolean;
  instrumentOverrides: IInstrumentDetectionSetting[];
  excursionSettings?: IExcursionSettings;
}

export const DEFAULT_PATTERN_DETECTION_SETTINGS: IPatternDetectionSettings = {
  defaultHtf: '240',
  defaultLtf: '5',
  autoDetectOnImport: true,
  autoDetectMistakes: true,
  instrumentOverrides: [
    { symbol: 'NIFTY', htf: '60', ltf: '1' },
    { symbol: 'BANKNIFTY', htf: '60', ltf: '1' },
    { symbol: 'CRUDEOIL', htf: '240', ltf: '5' },
  ],
  excursionSettings: DEFAULT_EXCURSION_SETTINGS,
};

export interface IUser {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  theme: 'dark' | 'light' | 'system';
  riskSettings?: IRiskSettings;
  patternDetectionSettings?: IPatternDetectionSettings;
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
  totalAdjustments?: number;
  liveBalance?: {
    totalBalance: number;
    clearBalance: number;
    availableBalance: number;
    realizedPnL: number;
    utilizedAmount: number;
    fetchedAt: string;
  } | null;
  brokerLink?: {
    broker: 'FYERS';
    clientId: string;
    linkedAt: string;
  };
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
  source: AccountTransactionSource;
  status: AccountTransactionStatus;
  idempotencyKey?: string;
  importBatchId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type InstrumentSource = 'AUTO' | 'CUSTOM';

export interface IInstrument {
  id: string;
  userId?: string;
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
  source?: InstrumentSource;
  needsReview?: boolean;
  tradeCount?: number;
  lastTradedAt?: string;
  firstTradedAt?: string;
  netPnL?: number;
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
  variants?: IStrategyVariant[];
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

export type InitialStopSource = 'MANUAL' | 'TEMPLATE' | 'BROKER_ORDERBOOK';

export interface IRiskDetails {
  plannedEntryPrice?: number;
  initialStopLoss?: number;
  initialStopSource?: InitialStopSource;
  slReviewReason?: string;
  slReviewCandidates?: any[];
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

export type ExcursionStatus = 'PENDING' | 'COMPUTED' | 'UNAVAILABLE' | 'FAILED';

export type ExcursionFlag =
  | 'GAVE_BACK_PROFIT'
  | 'EXITED_EARLY'
  | 'STOP_TOO_TIGHT_EVIDENCE'
  | 'STOP_TOO_LOOSE_EVIDENCE'
  | 'ENTRY_OUTSIDE_CANDLE'
  | 'EXIT_OUTSIDE_CANDLE'
  | 'LOW_RESOLUTION';

export interface ITradeExcursion {
  status: ExcursionStatus;
  computedAt?: string;
  source?: 'FYERS_HISTORY' | 'ANGEL_ONE_HISTORY' | 'UNDERLYING_FALLBACK';
  provider?: 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING';
  isUnderlyingFallback?: boolean;
  resolution?: string;
  isLowResolution?: boolean;
  failureReason?: string;
  excursionVersion?: number;
  thresholdVersion?: string;
  maePoints?: number;
  mfePoints?: number;
  maeAmount?: number;
  mfeAmount?: number;
  maeR?: number;
  mfeR?: number;
  feeAdjustedMaePoints?: number;
  feeAdjustedMfePoints?: number;
  feeAdjustedMaeAmount?: number;
  feeAdjustedMfeAmount?: number;
  feeAdjustedMaeR?: number;
  feeAdjustedMfeR?: number;
  rLeftOnTable?: number;
  exitEfficiency?: number | null;
  stopEfficiency?: number;
  entryQualityScore?: number;
  earlyMfePoints?: number;
  earlyMaePoints?: number;
  maeBeforeMfe?: boolean;
  timeOrdering?: 'HEAT_FIRST' | 'RUN_FIRST' | 'SIMULTANEOUS';
  stopHit?: boolean;
  reversedAfterStopHit?: boolean;
  timeToMfeMinutes?: number;
  timeToMaeMinutes?: number;
  candleCount?: number;
  excursionFlags?: ExcursionFlag[];
  warnings?: string[];
}

export type CandleProviderName = 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING';
export type CandleFallbackProvider = 'AUTO' | 'FYERS' | 'ANGEL_ONE';
export type MarketDataProvider = 'ANGEL_ONE';
export type MarketDataStatus = 'DISABLED' | 'IDLE' | 'ERROR';

export type CandleUnavailableReason =
  | 'NO_SYMBOL_TOKEN'
  | 'OUTSIDE_PROVIDER_LOOKBACK'
  | 'DAILY_BUDGET_EXHAUSTED'
  | 'NOT_CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'EMPTY_RESULT'
  | 'CIRCUIT_OPEN';

export interface IMarketDataIntegrationStatus {
  provider: MarketDataProvider;
  status: MarketDataStatus;
  hasApiKey: boolean;
  hasClientCode: boolean;
  hasPin: boolean;
  clientCode?: string | null;
  connected: boolean;
  isTokenExpired: boolean;
  instrumentCount: number;
  tokenExpiresAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  dailyCallsUsed: number;
  dailyBudget: number;
  instrumentCacheRefreshedAt: string | null;
}

export interface ITradeCandle {
  t: number; // Unix epoch timestamp in seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface ITradeCandleSnapshot {
  id?: string;
  userId: string;
  tradeId: string;
  symbol: string;
  resolution: string;
  candles: ITradeCandle[];
  provider?: 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING';
  isUnderlyingFallback?: boolean;
  droppedRowsCount?: number;
  fetchedAt: string;
}

export interface IExcursionScatterPoint {
  tradeId: string;
  symbol: string;
  maeR?: number;
  mfeR?: number;
  netPnL: number;
  outcome: TradeOutcome;
  exitEfficiency?: number;
  tradeDate: string;
}

export interface IExcursionAnalyticsResponse {
  summary: {
    totalEvaluated: number;
    avgMaeR?: number;
    avgMfeR?: number;
    avgExitEfficiency?: number;
    gaveBackProfitPercent: number;
    reversalAfterStopPercent: number;
  };
  scatterPoints: IExcursionScatterPoint[];
}

export interface IExcursionBackfillResponse {
  processed: number;
  computed: number;
  unavailable: number;
  failed: number;
  remaining: number;
  fyersFilled?: number;
  angelOneFilled?: number;
}

export type StopMoveType = 'TRAILED_FAVORABLY' | 'WIDENED_RISK' | 'UNCHANGED';

export interface IStopLossMoveEvent {
  previousStop: number;
  newStop: number;
  changePoints: number;
  changePercent: number;
  moveType: StopMoveType;
  movedAt: string;
  orderId?: string;
  orderType?: number;
  reason?: string;
}

export interface IStopMoveSummary {
  totalMoves: number;
  widenedCount: number;
  trailedCount: number;
  initialStop?: number;
  finalStop?: number;
  netRiskChangePoints: number;
  hasWidenedRisk: boolean;
  detectedAt?: string;
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
  excursion?: ITradeExcursion;
  stopMoveSummary?: IStopMoveSummary;
}

export type AttachmentCategory =
  | 'SETUP'
  | 'ENTRY'
  | 'EXIT'
  | 'REVIEW'
  | 'OTHER'
  | 'BEFORE_ENTRY'
  | 'ANNOTATED'
  | 'ATTACHMENT'
  | 'AUTO_CHART';

export interface IChartMeta {
  resolution: string;
  paddingBefore: number;
  paddingAfter: number;
  appliedBefore: number;
  appliedAfter: number;
  truncated: boolean;
  generatedAt: string;
  settingsSource?: string;
  isStale?: boolean;
}

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
  chartMeta?: IChartMeta;
  downloadUrl?: string;
  createdAt: string;
}

export interface IChartGenerateResult {
  resolution: string;
  timeframe: string;
  status: 'CREATED' | 'REPLACED' | 'SKIPPED_EXISTS' | 'FAILED';
  attachment?: IAttachment;
  errorCode?: string;
  requestedBefore: number;
  requestedAfter: number;
  appliedBefore: number;
  appliedAfter: number;
  truncated: boolean;
  warnings: string[];
}

export interface IChartGenerateResponse {
  results: IChartGenerateResult[];
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
  importBatchId?: string;
  templateId?: string;
  underlying?: string;
  optionType?: OptionType;
  strikePrice?: number;
  expiryDate?: string;

  executionMode: ExecutionMode;
  simpleExecution?: ISimpleExecution;
  fills: ITradeFill[];

  risk: IRiskDetails;
  thesis: ITradeThesis;
  psychology: IPsychologyDetails;
  calculated: ICalculatedDetails;

  screenshotIds: string[];
  attachments?: IAttachment[];
  setup?: ITradeSetup;
  stopLossMoveEvents?: IStopLossMoveEvent[];
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

// FYERS Broker Integration Architecture Abstractions
export interface IBrokerFundLimit {
  id?: number;
  title: string;
  equityAmount: number;
  commodityAmount: number;
}

export interface IBrokerFundsSnapshot {
  broker: 'FYERS';
  fetchedAt: string;
  totalBalance: number;
  clearBalance: number;
  availableBalance: number;
  realizedPnL: number;
  utilizedAmount: number;
  fundLimits: IBrokerFundLimit[];
}

export interface IBrokerAuthTokens {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string;
}

export interface IBrokerCredentials {
  appId: string;
  secretKey: string;
  pin?: string;
}

export interface IBrokerAdapter {
  readonly broker: 'FYERS';
  generateLoginUrl(state: string, redirectUri: string): string;
  exchangeAuthCode(authCode: string, credentials: IBrokerCredentials): Promise<IBrokerAuthTokens>;
  refreshAccessToken?(refreshToken: string, credentials: IBrokerCredentials): Promise<IBrokerAuthTokens>;
  fetchFunds(accessToken: string, credentials: Pick<IBrokerCredentials, 'appId'>): Promise<IBrokerFundsSnapshot>;
}

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

export type SupportedImportBroker = 'ZERODHA' | 'FYERS' | 'ANGEL_ONE' | 'UPSTOX' | 'CUSTOM';

export interface IBrokerImportMapping {
  id: string;
  userId: string;
  broker: SupportedImportBroker;
  importKind: BrokerImportKind;
  name: string;
  mapping: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface IMistakeSuggestion {
  tradeId?: string;
  rule:
    | 'REVENGE_TRADING'
    | 'OVERTRADING'
    | 'SIZE_VIOLATION'
    | 'NO_LIQUIDITY_TAKEN'
    | 'NO_LIQUIDITY_TARGET'
    | 'STOP_TOO_TIGHT'
    | string;
  mistakeTag: MistakeTag;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface IDailyLossBreach {
  breached: boolean;
  maxDailyLoss: number;
  currentDailyLoss: number;
  currency?: string;
  message?: string;
}

export interface IReviewQueueItem {
  id: string;
  symbol: string;
  tradeDate: string;
  entryTime: string;
  exitTime?: string;
  status: string;
  direction?: string;
  strategyName?: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  netPnL?: number;
  missing: Array<'MISSING_EXIT' | 'MISSING_PSYCHOLOGY' | 'MISSING_SCREENSHOTS' | 'SL_AMBIGUOUS'>;
  reviewReasons?: string[];
  suggestedMistakes: IMistakeSuggestion[];
}

export interface IUnreviewedDay {
  date: string;
  tradesCount: number;
  netPnL: number;
  hasJournal: boolean;
}

export interface IReviewQueueResponse {
  queue: IReviewQueueItem[];
  unreviewedDays: IUnreviewedDay[];
  dailyLossBreach: IDailyLossBreach;
  summary: {
    totalUnreviewedTrades: number;
    missingExitCount: number;
    missingPsychologyCount: number;
    missingScreenshotsCount: number;
    unreviewedDaysCount: number;
  };
}

export interface IDailyPrefillResponse {
  date: string;
  suggestedBestTrade?: {
    id: string;
    symbol: string;
    netPnL: number;
  } | null;
  suggestedWorstTrade?: {
    id: string;
    symbol: string;
    netPnL: number;
  } | null;
  aggregatedMistakes: MistakeTag[];
  suggestedDisciplineRating: number;
  reasoning: string;
  dailyLossBreach: IDailyLossBreach;
  tradesCount: number;
  netPnL: number;
}

export type TemplateGroup =
  | 'FNO'
  | 'STOCKS'
  | 'FOREX_GOLD'
  | 'CRYPTO'
  | 'MCX'
  | 'PRICE_ACTION'
  | 'CUSTOM';

export type TemplateAssetClass = AssetClass;

export type SlRuleType = 'PERCENT' | 'POINTS' | 'PREMIUM_PERCENT' | 'MANUAL';

export interface SlRule {
  type: SlRuleType;
  value?: number;
  manualHint?: string;
}

export interface ITradeTemplate {
  id: string;
  name: string;
  description: string;
  group: TemplateGroup;
  markets: AssetClass[];
  direction?: Direction;
  strategyName?: string;
  slRule: SlRule;
  minRR: number;
  titlePattern: string;
  tags: string[];
  confluences?: string[];
  checklist?: string[];
  timeWindow?: {
    start: string; // HH:mm in IST
    end: string;   // HH:mm in IST
  };
  expiryDayOnly?: boolean;
  session?: TradingSession;
  isBuiltIn: boolean;
  isFavorite?: boolean;
  usageCount?: number;
  lastUsedAt?: string | Date;
  userId?: string;
  clonedFromId?: string;
  performance?: {
    totalTrades: number;
    winTrades: number;
    winRate: number;
    netPnL: number;
    profitFactor: number;
    meanExpectancyR?: number;
  };
}

export type ProvenanceSource = 'TEMPLATE' | 'RULE' | 'AUTO';

export interface TemplateContext {
  symbol?: string;
  assetClass?: AssetClass;
  direction?: Direction;
  entryPrice?: number;
  tickSize?: number;
  lotSize?: number;
  contractMultiplier?: number;
  entryTime?: string | Date;
  sameDayTradeCount?: number;
  existingTitlesToday?: string[];
  isFavorite?: boolean;
  usageCount?: number;
  globalMeanExpectancyR?: number;
}

export interface TemplatePatch {
  tradeTitle?: string;
  direction?: Direction;
  strategyName?: string;
  tags?: string[];
  confluences?: string[];
  checklist?: string[];
  session?: TradingSession;
  risk?: {
    plannedRewardRiskRatio?: number;
    initialStopLoss?: number;
    plannedTarget?: number;
    slHint?: string;
  };
  provenance: Record<string, ProvenanceSource>;
}

export type LiquiditySide = 'SELL_SIDE' | 'BUY_SIDE' | 'NONE';
export type PatternType = 'EQUAL_LOWS' | 'EQUAL_HIGHS' | 'W' | 'M' | 'OTHER';
export type SecondLegStatus = 'SWEPT' | 'UNSWEPT' | 'NOT_APPLICABLE';
export type MomentumRelation = 'WITH_HTF' | 'AGAINST_HTF' | 'UNKNOWN';
export type EntryModel = 'CONFIRMATION_CANDLE' | 'RETEST' | 'OTHER';
export type VariantStatus = 'CLASSIFIED' | 'UNCLASSIFIED' | 'NOT_APPLICABLE';

export interface IStrategyVariantExpected {
  direction?: Direction;
  liquiditySide?: LiquiditySide;
  patternType?: PatternType;
  secondLegStatus?: SecondLegStatus;
  momentumRelation?: MomentumRelation;
  [key: string]: any;
}

export interface IStrategyVariant {
  key: string;
  name: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  expected?: IStrategyVariantExpected;
  entryRules?: string[];
  stopLossRules?: string[];
  targetRules?: string[];
  invalidationCriteria?: string[];
  checklist?: string[];
  minRiskReward?: number | null;
  [key: string]: any;
}

export interface ITradeSetup {
  variantKey?: string;
  variantStatus?: VariantStatus;
  alsoMatches?: string[];
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  executionTimeframe?: string;
  liquiditySide?: LiquiditySide;
  patternType?: PatternType;
  secondLegStatus?: SecondLegStatus;
  liquidityLevel?: number;
  sweepExtreme?: number;
  entryModel?: EntryModel;
}

export function deriveMomentumRelation(
  direction?: Direction | null,
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null
): MomentumRelation {
  if (!direction || !htfBias || htfBias === 'NEUTRAL') return 'UNKNOWN';
  if ((direction === 'LONG' && htfBias === 'BULLISH') || (direction === 'SHORT' && htfBias === 'BEARISH')) {
    return 'WITH_HTF';
  }
  if ((direction === 'LONG' && htfBias === 'BEARISH') || (direction === 'SHORT' && htfBias === 'BULLISH')) {
    return 'AGAINST_HTF';
  }
  return 'UNKNOWN';
}

export interface VariantSuggestionResult {
  primaryVariantKey?: string;
  suggestedStatus: VariantStatus;
  alsoMatches: string[];
}

/**
 * Pure dynamic suggestion logic for custom strategy setup variants.
 * Matches input trade parameters dynamically against the provided availableVariants.
 * No static keys, no hardcoded variants. Fully custom.
 * UI suggests; user confirms; never silently assigned.
 */
export function suggestTradeVariant(params: {
  direction?: Direction | null;
  patternType?: PatternType | null;
  secondLegStatus?: SecondLegStatus | null;
  liquiditySide?: LiquiditySide | null;
  availableVariants?: IStrategyVariant[];
}): VariantSuggestionResult {
  const { direction, patternType, secondLegStatus, liquiditySide, availableVariants } = params;

  if (!availableVariants || availableVariants.length === 0) {
    return {
      primaryVariantKey: undefined,
      suggestedStatus: 'UNCLASSIFIED',
      alsoMatches: [],
    };
  }

  const candidates = availableVariants.filter((v) => v.isActive !== false);
  const pool = candidates.length > 0 ? candidates : availableVariants;

  const scored: Array<{ variant: IStrategyVariant; score: number }> = [];

  for (const v of pool) {
    const exp = v.expected;
    if (!exp) continue;

    let score = 0;
    let mismatch = false;

    // Direction check
    if (exp.direction && direction) {
      if (exp.direction === direction) {
        score += 10;
      } else {
        mismatch = true;
      }
    }

    // Pattern type check
    if (exp.patternType && patternType) {
      if (exp.patternType === patternType) {
        score += 20;
      } else {
        mismatch = true;
      }
    }

    // Second leg status check
    if (
      exp.secondLegStatus &&
      exp.secondLegStatus !== 'NOT_APPLICABLE' &&
      secondLegStatus &&
      secondLegStatus !== 'NOT_APPLICABLE'
    ) {
      if (exp.secondLegStatus === secondLegStatus) {
        score += 15;
      } else {
        mismatch = true;
      }
    }

    // Liquidity side check
    if (
      exp.liquiditySide &&
      exp.liquiditySide !== 'NONE' &&
      liquiditySide &&
      liquiditySide !== 'NONE'
    ) {
      if (exp.liquiditySide === liquiditySide) {
        score += 10;
      } else {
        mismatch = true;
      }
    }

    if (!mismatch && score > 0) {
      scored.push({ variant: v, score });
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.variant.sortOrder ?? 0) - (b.variant.sortOrder ?? 0);
    });

    return {
      primaryVariantKey: scored[0].variant.key,
      suggestedStatus: 'CLASSIFIED',
      alsoMatches: scored.slice(1).map((s) => s.variant.key),
    };
  }

  return {
    primaryVariantKey: undefined,
    suggestedStatus: 'UNCLASSIFIED',
    alsoMatches: [],
  };
}

/**
 * Returns effective rules and parameters by combining strategy rules with variant overrides.
 * Empty list on variant inherits parent list. Non-empty combines parent + variant.
 * minRiskReward null/undefined on variant inherits parent.
 */
export function getEffectiveStrategyRules(
  strategy: {
    entryRules?: string[];
    stopLossRules?: string[];
    targetRules?: string[];
    invalidationCriteria?: string[];
    checklist?: string[];
    minRiskReward?: number;
  },
  variant?: {
    entryRules?: string[];
    stopLossRules?: string[];
    targetRules?: string[];
    invalidationCriteria?: string[];
    checklist?: string[];
    minRiskReward?: number | null;
  } | null
) {
  if (!variant) {
    return {
      entryRules: strategy.entryRules || [],
      stopLossRules: strategy.stopLossRules || [],
      targetRules: strategy.targetRules || [],
      invalidationCriteria: strategy.invalidationCriteria || [],
      checklist: strategy.checklist || [],
      minRiskReward: strategy.minRiskReward ?? 1.5,
    };
  }

  const combine = (parentRules?: string[], variantRules?: string[]): string[] => {
    if (!variantRules || variantRules.length === 0) return parentRules || [];
    return [...(parentRules || []), ...variantRules];
  };

  return {
    entryRules: combine(strategy.entryRules, variant.entryRules),
    stopLossRules: combine(strategy.stopLossRules, variant.stopLossRules),
    targetRules: combine(strategy.targetRules, variant.targetRules),
    invalidationCriteria: combine(strategy.invalidationCriteria, variant.invalidationCriteria),
    checklist: combine(strategy.checklist, variant.checklist),
    minRiskReward:
      variant.minRiskReward !== null && variant.minRiskReward !== undefined
        ? variant.minRiskReward
        : (strategy.minRiskReward ?? 1.5),
  };
}

// ----------------------------------------------------------------------------
// WHAT-IF CANDLE-REPLAY SIMULATION TYPES
// ----------------------------------------------------------------------------
export type WhatIfFillModel = 'GAP_AWARE' | 'AT_LEVEL';
export type WhatIfResolutionPolicy = 'FINEST_AVAILABLE' | 'ONE_MINUTE_ONLY';
export type WhatIfPolicy = 'PESSIMISTIC' | 'OPTIMISTIC';
export type WhatIfExclusionReason =
  | 'EXCLUDED_MULTI_FILL'
  | 'EXCLUDED_NO_STOP'
  | 'EXCLUDED_NO_CANDLES'
  | 'EXCLUDED_UNDERLYING_FALLBACK'
  | 'EXCLUDED_MANAGED_STOP'
  | 'EXCLUDED_OTHER';
export type WhatIfVerdict = 'BETTER_ROBUST' | 'WORSE_ROBUST' | 'INCONCLUSIVE';
export type WhatIfCellStatus = 'EVALUABLE' | 'CENSORED';
export type WhatIfOutcome = 'STOP' | 'TARGET' | 'ACTUAL';
export type WhatIfCostModel = 'RECOMPUTED' | 'ACTUAL_FALLBACK';

export interface IWhatIfFilters {
  accountId?: string;
  symbol?: string;
  assetClass?: string;
  direction?: 'LONG' | 'SHORT';
  strategyId?: string;
  session?: string;
  startDate?: string;
  endDate?: string;
  tags?: string;
}

export interface IWhatIfRequest {
  filters?: IWhatIfFilters;
  stopRGrid?: (number | null)[];
  targetRGrid?: (number | null)[];
  fillModel?: WhatIfFillModel;
  slippageTicks?: number;
  resolutionPolicy?: WhatIfResolutionPolicy;
  excludeManagedStopTrades?: boolean;
  holdoutFraction?: number;
}

export interface IWhatIfExclusionsCount {
  EXCLUDED_MULTI_FILL: number;
  EXCLUDED_NO_STOP: number;
  EXCLUDED_NO_CANDLES: number;
  EXCLUDED_UNDERLYING_FALLBACK: number;
  EXCLUDED_MANAGED_STOP: number;
  EXCLUDED_OTHER: number;
}

export interface IWhatIfScope {
  tradesInScope: number;
  nEligible: number;
  exclusions: IWhatIfExclusionsCount;
  resolutionCounts: Record<string, number>;
  costModelCounts: Record<string, number>;
}

export interface IWhatIfCalibration {
  testedCount: number;
  matchingStopCount: number;
  agreement: number;
  pessOptSpread: number;
  calibrationWarning: boolean;
}

export interface IWhatIfCellStats {
  nEval: number;
  nCensored: number;
  nAmbiguous: number;
  meanR_pess: number;
  meanR_opt: number;
  meanR_actual_sameSubset: number;
  totalNet_pess: number;
  totalNet_opt: number;
  totalNet_actual: number;
  winRate_pess: number;
  winRate_opt: number;
  profitFactor_pess: number;
  profitFactor_opt: number;
  stopHitRate: number;
  targetHitRate: number;
  exitsByPartialCandle: number;
}

export interface IWhatIfCellResult {
  stopR: number | null;
  targetR: number | null;
  all: IWhatIfCellStats;
  inSample: IWhatIfCellStats;
  holdout: IWhatIfCellStats;
  verdict: WhatIfVerdict;
  holdsOutOfSample: boolean;
  bootstrapIntervalPess: [number, number];
  bootstrapIntervalOpt: [number, number];
}

export interface IWhatIfDrillTrade {
  tradeId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: string;
  exitTime?: string;
  entryPrice: number;
  actualExitPrice?: number;
  initialStopLoss?: number;
  plannedTarget?: number;
  realizedR?: number;
  reason?: string;
}

export interface IWhatIfDrillDescriptors {
  ambiguous: Array<{
    stopR: number | null;
    targetR: number | null;
    tradeIds: string[];
    count: number;
  }>;
  censored: Array<{
    stopR: number | null;
    targetR: number | null;
    tradeIds: string[];
    count: number;
  }>;
  exclusions: Record<
    WhatIfExclusionReason,
    {
      count: number;
      tradeIds: string[];
      trades?: IWhatIfDrillTrade[];
    }
  >;
}

export interface IWhatIfExcursionDistributionBucket {
  range: string;
  count: number;
  minR: number;
  maxR: number;
  tradeIds: string[];
}

export interface IWhatIfBaseline {
  nEligible: number;
  meanR_actual: number;
  totalNet_actual: number;
  winRate_actual: number;
  profitFactor_actual: number;
}

export interface IWhatIfResponse {
  meta: {
    filters: IWhatIfFilters;
    fillModel: WhatIfFillModel;
    slippageTicks: number;
    resolutionPolicy: WhatIfResolutionPolicy;
    excludeManagedStopTrades: boolean;
    holdoutFraction: number;
    generatedAt: string;
  };
  scope: IWhatIfScope;
  calibration: IWhatIfCalibration;
  baseline: IWhatIfBaseline;
  cells: IWhatIfCellResult[];
  drillDescriptors: IWhatIfDrillDescriptors;
  winnersMaeDistribution: IWhatIfExcursionDistributionBucket[];
  allTradesMfeDistribution: IWhatIfExcursionDistributionBucket[];
}

// ============================================================================
// UNIVERSAL TRADE DRILL-DOWN CONTRACTS
// ============================================================================

export interface IDrilldownAggregate {
  count: number;
  closedCount: number;
  netPnL: number;
  grossPnL: number;
  totalCosts: number;
  winRate: number;
  avgR: number;
  winsCount: number;
  lossesCount: number;
  breakevenCount: number;
}

export interface IDrilldownResponse {
  trades: ITrade[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  aggregate: IDrilldownAggregate;
  descriptor: any;
  exclusionReasons?: string[];
  metadata?: {
    breachAmount?: number;
    tiltScore?: number;
    tiltComponents?: any;
    label?: string;
  };
}

// ============================================================================
// MULTI-PANEL PERFORMANCE EQUITY CURVES CONTRACTS
// ============================================================================

export interface IStrategyOverlayCurve {
  strategyId: string;
  strategyName: string;
  tradesCount: number;
  winRate: number;
  curve: Array<{
    date: string;
    tradeId?: string;
    symbol?: string;
    rMultiple: number;
    cumulativeR: number;
  }>;
}

export interface IEquityCurvesResponse {
  moneyCurve: Array<{
    date: string;
    tradeId?: string;
    symbol?: string;
    netPnL: number;
    cumulativeEquity: number;
    drawdown: number;
    drawdownPercent: number;
  }>;
  cumulativeRCurve: {
    curve: Array<{
      date: string;
      tradeId?: string;
      symbol?: string;
      rMultiple: number;
      cumulativeR: number;
    }>;
    coveragePercent: number;
    coverageText: string;
    eligibleTrades: number;
    totalTrades: number;
    excludedTrades: number;
  };
  recoveryStats: {
    currentDrawdown: number;
    currentDrawdownPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    longestRecoveryDays: number;
    longestRecoveryPoints: number;
  };
  strategyOverlays: IStrategyOverlayCurve[];
  monteCarloCone: Array<{
    step: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  }>;
  coneMeta: {
    sampleSize: number;
    edgeVerdict?: string;
    isLowSample: boolean;
    warning?: string;
    tradesPerPath: number;
  };
  eventMarkers: {
    breachDays: Array<{
      date: string;
      maxDailyLoss: number;
      currentDailyLoss: number;
      breachAmount: number;
      tradesCount: number;
    }>;
    tiltDays: Array<{
      date: string;
      tradeId: string;
      symbol: string;
      score: number;
      level: string;
      components: any;
      entryMoment: string;
      explanation: string;
    }>;
  };
  startingEquity: number;
}

// ==========================================
// LIVE OPEN TRADE WATCHER TYPES
// ==========================================

export type StopThreatLevel = 'SAFE' | 'ATTENTION' | 'CRITICAL' | 'BREACHED' | 'NO_STOP';

export type LiveQuoteProvider = 'FYERS' | 'ANGEL_ONE' | 'SIMULATED' | 'MIXED';

export interface ILiveQuote {
  symbol: string;
  ltp: number;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
  timestamp?: number;
  provider?: LiveQuoteProvider;
}

export type GivebackThreatLevel = 'SAFE' | 'WATCH' | 'LEAKING' | 'CRITICAL_REVERSAL';

export interface ILiveGivebackMetric {
  peakFloatingNetPnL: number;
  peakUnrealizedR: number;
  peakLtp: number;
  givebackAmount: number;
  givebackPercent: number; // 0 to 100%
  retentionPercent: number; // 0 to 100%
  threatLevel: GivebackThreatLevel;
  alertMessage?: string;
}

export type TargetLadderStepStatus = 'PENDING' | 'IN_PROGRESS' | 'MET' | 'EXECUTED';

export interface ILiveTargetLadderStep {
  targetIndex: number; // 1, 2, 3
  name: string; // 'T1 (+1.0R)', 'T2 (+2.0R)', 'Runner (+3.0R)'
  targetR: number; // 1.0, 2.0, 3.0
  targetPrice: number;
  plannedExitRatio: number; // e.g. 0.50, 0.33
  plannedExitQty: number; // e.g. 5, 3
  suggestedStopLoss: number; // e.g. entryPrice (BE) for T1, +1R for T2
  suggestedStopLabel: string; // 'Move Stop to Breakeven (₹9859.10)'
  distancePoints: number;
  distancePercent: number;
  progressPercent: number; // 0 to 100%
  status: TargetLadderStepStatus;
  isActionable: boolean; // true if reached or currently met
}

export interface ILiveTargetLadder {
  initialRiskPoints: number;
  initialRiskAmount: number;
  steps: ILiveTargetLadderStep[];
  activeStepIndex: number; // 1, 2, 3
}

export interface ILiveOpenTradeMetric {
  tradeId: string;
  symbol: string;
  direction: Direction;
  quantity: number;
  contractMultiplier?: number;
  entryPrice: number;
  currentLtp: number;
  priceDeltaPoints: number;
  priceDeltaPercent: number;
  floatingGrossPnL: number;
  estimatedCharges: number;
  floatingNetPnL: number;
  initialRiskAmount: number | null;
  unrealizedR: number | null;
  stopLoss: number | null;
  target: number | null;
  distanceToStopPoints: number | null;
  distanceToStopTicks: number | null;
  distanceToStopPercent: number | null;
  stopThreatLevel: StopThreatLevel;
  distanceToTargetPoints: number | null;
  distanceToTargetTicks: number | null;
  targetProgressPercent: number | null;
  tickSize: number;
  provider: LiveQuoteProvider;
  asOf: string | Date;
  giveback?: ILiveGivebackMetric;
  targetLadder?: ILiveTargetLadder;
}

export interface ILiveWatcherSummary {
  openTradesCount: number;
  totalFloatingGrossPnL: number;
  totalEstimatedCharges: number;
  totalFloatingNetPnL: number;
  totalRiskCapital: number;
  portfolioUnrealizedR: number | null;
  profitableCount: number;
  losingCount: number;
  breakevenCount: number;
  positions: ILiveOpenTradeMetric[];
  provider: LiveQuoteProvider;
  asOf: string | Date;
}

// ==========================================
// WEEKLY REVIEW CONTRACTS
// ==========================================

export type FocusRuleSource = 'SUGGESTED' | 'CUSTOM';

export interface IFocusRuleMetric {
  type:
    | 'MAX_DAILY_LOSS_BREACH'
    | 'MISTAKE_COUNT'
    | 'TEMPLATE_PAUSE'
    | 'REPEAT_TEMPLATE'
    | 'MAINTAIN_DISCIPLINE'
    | 'CUSTOM';
  tag?: MistakeTag | string;
  templateId?: string;
  templateName?: string;
  target?: number;
  [key: string]: any;
}

export interface IFocusRule {
  code: string;
  text: string;
  metric?: IFocusRuleMetric;
  source?: FocusRuleSource;
}

export interface IFocusRuleEvaluation {
  followed: boolean | null;
  actual: any;
  target: any;
  note: string;
}

export interface IWeeklyMistakeItem {
  tag: MistakeTag | string;
  count: number;
  totalLoss: number;
  tradeIds: string[];
}

export interface IWeeklyTemplateItem {
  templateId?: string;
  name: string;
  n: number;
  shrunkExpectancy: number;
  sampleSizeWarning: boolean;
  winRate: number;
  netPnL: number;
  tradeIds: string[];
}

export interface IWeeklyDisciplineDay {
  date: string;
  dayOfWeek: string;
  rating: number | null;
  tradesCount: number;
  hasJournal: boolean;
  journalId?: string;
}

export interface IWeeklyDailyLossBreach {
  date: string;
  maxDailyLoss: number;
  currentDailyLoss: number;
  breachAmount: number;
  tradesCount: number;
  tradeIds: string[];
}

export interface IWeeklyTiltDay {
  date: string;
  tradeId: string;
  symbol: string;
  score: number;
  level: string;
  explanation: string;
}

export interface IWeeklyOvertradingDay {
  date: string;
  tradesCount: number;
  maxDailyTrades: number;
  tradeIds: string[];
}

export interface IWeeklyRiskEvents {
  dailyLossBreaches: IWeeklyDailyLossBreach[];
  highTiltDays: IWeeklyTiltDay[];
  overtradingDays: IWeeklyOvertradingDay[];
  unjournaledDaysCount: number;
  unjournaledDates: string[];
}

export interface IWeeklyWeekdayItem {
  day: string;
  netPnL: number;
  tradesCount: number;
  winRate: number;
  tradeIds: string[];
}

export interface IWeeklySessionItem {
  session: string;
  netPnL: number;
  tradesCount: number;
  winRate: number;
  tradeIds: string[];
}

export interface IWeeklyReviewSnapshot {
  weekSummary: {
    tradeCount: number;
    closedCount: number;
    netPnL: number;
    grossPnL: number;
    totalCosts: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    sumRealizedR: number;
    avgRealizedR: number;
    maxDrawdown: number;
    rCoveragePercent: number;
    winsCount: number;
    lossesCount: number;
    breakevenCount: number;
    rCount: number;
    tradeIds: string[];
  };
  vsPreviousWeek: {
    deltaNetPnL: number;
    deltaWinRate: number;
    deltaAvgRealizedR: number;
    deltaAvgDiscipline: number;
  };
  mistakes: {
    items: IWeeklyMistakeItem[];
    topMistake: IWeeklyMistakeItem | null;
    topMistakes: IWeeklyMistakeItem[];
  };
  templates: {
    items: IWeeklyTemplateItem[];
    bestTemplate: IWeeklyTemplateItem | null;
    worstTemplate: IWeeklyTemplateItem | null;
  };
  discipline: {
    averageRating: number;
    dailyRatings: IWeeklyDisciplineDay[];
    trendDirection: 'IMPROVED' | 'DECLINED' | 'STABLE';
  };
  riskEvents: IWeeklyRiskEvents;
  sessionsAndWeekdays: {
    byWeekday: IWeeklyWeekdayItem[];
    bySession: IWeeklySessionItem[];
    bestWeekday: { day: string; netPnL: number } | null;
    worstWeekday: { day: string; netPnL: number } | null;
    bestSession: { session: string; netPnL: number } | null;
    worstSession: { session: string; netPnL: number } | null;
  };
  focusRuleSuggestion: IFocusRule;
  isEmpty: boolean;
}

export type WeeklyReviewStatus = 'DRAFT' | 'FINALIZED';

export interface IWeeklyReview {
  id?: string;
  userId: string;
  week: string; // YYYY-Www
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  accountId?: string | null;
  snapshot: IWeeklyReviewSnapshot;
  generatedAt: string;
  focusRule?: IFocusRule;
  previousFocusEvaluation?: IFocusRuleEvaluation;
  notes?: string;
  status: WeeklyReviewStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ISystemBackupStatus {
  configured: boolean;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  result?: 'OK' | 'FAILED' | 'SUSPICIOUS' | null;
  durationMs?: number;
  sizeBytes?: number;
  uploadedKey?: string;
  error?: string;
  isStale?: boolean;
}

export interface ISystemStatusResponse {
  tradeCount: number;
  accountCount: number;
  attachmentCount: number;
  database: string;
  privacyMode: string;
  appVersion: string;
  backup: ISystemBackupStatus;
}

