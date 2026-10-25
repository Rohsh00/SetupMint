import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  baseCurrency: z.string().default('INR'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  broker: z.string().min(1, 'Broker name is required'),
  accountNumber: z.string().optional(),
  accountType: z.enum([
    'EQUITY',
    'COMMODITY',
    'FUTURES_OPTIONS',
    'FOREX',
    'CRYPTO',
    'PROP_FIRM',
    'DEMO',
    'OTHER',
  ]),
  baseCurrency: z.string().default('INR'),
  initialBalance: z.number().nonnegative('Initial balance cannot be negative'),
  riskRules: z
    .object({
      maxDailyLoss: z.number().optional(),
      maxRiskPerTradePercent: z.number().optional(),
      maxOpenTrades: z.number().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const accountTransactionSourceSchema = z.enum([
  'MANUAL',
  'BROKER_LEDGER_IMPORT',
  'BROKER_SYNC',
]);

export const accountTransactionStatusSchema = z.enum([
  'CONFIRMED',
  'PENDING_REVIEW',
  'REJECTED',
]);

export const brokerImportKindSchema = z.enum(['TRADES', 'CASH_FLOWS']);

export const accountTransactionSchema = z
  .object({
    accountId: z.string().min(1, 'Account is required'),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'ADJUSTMENT']),
    amount: z.number().refine((value) => value !== 0, 'Amount must not be zero'),
    currency: z.string().default('INR'),
    date: z.string().min(1, 'Date is required'),
    notes: z.string().optional(),
    source: accountTransactionSourceSchema.optional(),
    status: accountTransactionStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'ADJUSTMENT' && value.amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Amount must be positive for deposits, withdrawals, and transfers',
      });
    }
  });

export const ledgerImportRowSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'IGNORE']),
  amount: z.number().refine((value) => value !== 0, 'Amount must not be zero'),
  description: z.string().optional(),
  runningBalance: z.number().optional(),
  externalType: z.string().optional(),
});

export const ledgerImportCommitSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  importKind: z.literal('CASH_FLOWS'),
  rows: z.array(ledgerImportRowSchema).min(1, 'At least one row is required'),
  broker: z.string().optional(),
  saveMapping: z.boolean().optional(),
  mapping: z.record(z.string()).optional(),
});

export const createInstrumentSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').transform((s) => s.toUpperCase().trim()),
  displayName: z.string().min(1, 'Display name is required'),
  assetClass: z.enum(['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX']),
  exchange: z.string().min(1, 'Exchange is required'),
  marketSegment: z.enum([
    'NSE_EQ',
    'NSE_FNO',
    'BSE_EQ',
    'MCX',
    'FOREX',
    'CRYPTO',
    'US_EQUITY',
    'CME',
    'OTHER',
  ]),
  quoteCurrency: z.string().default('INR'),
  contractMultiplier: z.number().positive('Contract multiplier must be positive').default(1),
  lotSize: z.number().positive('Lot size must be positive').default(1),
  tickSize: z.number().positive('Tick size must be positive').default(0.05),
  quantityIncrement: z.number().positive('Quantity increment must be positive').default(1),
  pricePrecision: z.number().int().nonnegative().default(2),
  isActive: z.boolean().default(true),
  source: z.enum(['AUTO', 'CUSTOM']).default('CUSTOM'),
  needsReview: z.boolean().default(false),
  expiryDate: z.string().optional(),
  optionType: z.enum(['CALL', 'PUT']).optional(),
  strikePrice: z.number().optional(),
  description: z.string().optional(),
});

export const strategyVariantExpectedSchema = z
  .object({
    direction: z.enum(['LONG', 'SHORT']).optional(),
    liquiditySide: z.enum(['SELL_SIDE', 'BUY_SIDE', 'NONE']).optional(),
    patternType: z.enum(['EQUAL_LOWS', 'EQUAL_HIGHS', 'W', 'M', 'OTHER']).optional(),
    secondLegStatus: z.enum(['SWEPT', 'UNSWEPT', 'NOT_APPLICABLE']).optional(),
    momentumRelation: z.enum(['WITH_HTF', 'AGAINST_HTF', 'UNKNOWN']).optional(),
  })
  .passthrough();

export const strategyVariantSchema = z.object({
  key: z
    .string()
    .min(1, 'Variant key is required')
    .max(60, 'Variant key must be under 60 characters')
    .transform((val) => val.trim().toUpperCase()),
  name: z.string().min(1, 'Variant name is required'),
  description: z.string().default(''),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  expected: strategyVariantExpectedSchema.optional().default({}),
  entryRules: z.array(z.string()).optional(),
  stopLossRules: z.array(z.string()).optional(),
  targetRules: z.array(z.string()).optional(),
  invalidationCriteria: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  minRiskReward: z.number().nonnegative().nullable().optional(),
});

export const createStrategySchema = z.object({
  name: z.string().min(1, 'Strategy name is required'),
  description: z.string().default(''),
  assetClasses: z.array(z.string()).default([]),
  timeframes: z.array(z.string()).default([]),
  entryRules: z.array(z.string()).default([]),
  stopLossRules: z.array(z.string()).default([]),
  targetRules: z.array(z.string()).default([]),
  invalidationCriteria: z.array(z.string()).default([]),
  checklist: z.array(z.string()).default([]),
  minRiskReward: z.number().nonnegative().default(1.5),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  variants: z
    .array(strategyVariantSchema)
    .max(12, 'Maximum of 12 variants allowed per strategy')
    .default([])
    .refine(
      (variants) => {
        const keys = variants.map((v) => v.key);
        return new Set(keys).size === keys.length;
      },
      { message: 'Variant keys must be unique within a strategy' }
    ),
});
export const updateStrategySchema = createStrategySchema.partial();
export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>;


export const tradeFillSchema = z.object({
  fillId: z.string(),
  type: z.enum(['ENTRY', 'EXIT']),
  price: z.number().positive('Price must be greater than zero'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  timestamp: z.string().min(1, 'Fill timestamp is required'),
  fee: z.preprocess((val) => (val === '' || Number.isNaN(val) || val === undefined ? 0 : Number(val)), z.number().nonnegative().default(0)),
  brokerage: z.preprocess((val) => (val === '' || Number.isNaN(val) || val === undefined ? 0 : Number(val)), z.number().nonnegative().default(0)),
  exchangeFee: z.preprocess((val) => (val === '' || Number.isNaN(val) || val === undefined ? 0 : Number(val)), z.number().nonnegative().default(0)),
  taxes: z.preprocess((val) => (val === '' || Number.isNaN(val) || val === undefined ? 0 : Number(val)), z.number().nonnegative().default(0)),
  notes: z.preprocess((val) => (val === null || val === undefined ? '' : String(val)), z.string().default('')),
});

export const simpleExecutionSchema = z.object({
  entryPrice: z.number().positive('Entry price must be positive'),
  exitPrice: z.number().positive('Exit price must be positive').optional(),
  quantity: z.number().positive('Quantity must be positive'),
  contractMultiplier: z.number().positive().default(1),
  brokerage: z.number().nonnegative().default(0),
  exchangeFees: z.number().nonnegative().default(0),
  regulatoryFees: z.number().nonnegative().default(0),
  taxes: z.number().nonnegative().default(0),
  otherFees: z.number().nonnegative().default(0),
  explicitAdjustments: z.number().default(0),
  adjustmentsReason: z.string().optional(),
});

const emptyStringToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

export const emotionEnum = z.enum([
  'CALM',
  'CONFIDENT',
  'DISCIPLINED',
  'PATIENT',
  'FOCUSED',
  'RELIEVED',
  'NEUTRAL',
  'BORED',
  'HESITANT',
  'DOUBTFUL_OF_LEVEL',
  'ANXIOUS',
  'FEARFUL',
  'GREEDY',
  'EUPHORIC',
  'FRUSTRATED',
  'IMPATIENT',
  'FOMO',
  'OVERCONFIDENT',
  'STRESSED',
  'TILTED',
  'REVENGEFUL',
  'REGRETFUL',
  'FEAR_OF_STOP_HUNT',
]);

export const tradeSetupSchema = z.object({
  variantKey: z.preprocess(emptyStringToUndefined, z.string().optional()),
  variantStatus: z.enum(['CLASSIFIED', 'UNCLASSIFIED', 'NOT_APPLICABLE']).default('UNCLASSIFIED'),
  alsoMatches: z.array(z.string()).default([]),
  htfBias: z.preprocess(emptyStringToUndefined, z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional()),
  executionTimeframe: z.preprocess(emptyStringToUndefined, z.string().optional()),
  liquiditySide: z.preprocess(emptyStringToUndefined, z.enum(['SELL_SIDE', 'BUY_SIDE', 'NONE']).optional()),
  patternType: z.preprocess(emptyStringToUndefined, z.enum(['EQUAL_LOWS', 'EQUAL_HIGHS', 'W', 'M', 'OTHER']).optional()),
  secondLegStatus: z.preprocess(emptyStringToUndefined, z.enum(['SWEPT', 'UNSWEPT', 'NOT_APPLICABLE']).optional()),
  liquidityLevel: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().optional()
  ),
  sweepExtreme: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().optional()
  ),
  entryModel: z.preprocess(emptyStringToUndefined, z.enum(['CONFIRMATION_CANDLE', 'RETEST', 'OTHER']).optional()),
});
export type TradeSetupInput = z.infer<typeof tradeSetupSchema>;

export const createTradeSchema = z.object({
  accountId: z.string().min(1, 'Trading account is required'),
  symbol: z.string().min(1, 'Symbol is required').transform((s) => s.toUpperCase().trim()),
  instrumentId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  instrumentName: z.preprocess(emptyStringToUndefined, z.string().optional()),
  underlying: z.preprocess(emptyStringToUndefined, z.string().optional()),
  optionType: z.preprocess(emptyStringToUndefined, z.enum(['CALL', 'PUT']).optional()),
  strikePrice: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().optional()
  ),
  expiryDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  assetClass: z.enum(['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX']),
  exchange: z.string().min(1, 'Exchange is required'),
  marketSegment: z.enum([
    'NSE_EQ',
    'NSE_FNO',
    'BSE_EQ',
    'MCX',
    'FOREX',
    'CRYPTO',
    'US_EQUITY',
    'CME',
    'OTHER',
  ]),
  currency: z.string().default('INR'),
  direction: z.enum(['LONG', 'SHORT']),
  status: z.enum(['PLANNED', 'OPEN', 'CLOSED', 'CANCELLED']).default('CLOSED'),
  strategyId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  strategyName: z.preprocess(emptyStringToUndefined, z.string().optional()),
  tags: z.array(z.string()).default([]),
  tradeDate: z.string().min(1, 'Trade date is required'),
  timeZone: z.string().default('Asia/Kolkata'),
  entryTime: z.string().min(1, 'Entry time is required'),
  exitTime: z.preprocess(emptyStringToUndefined, z.string().optional()),
  session: z
    .enum(['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'])
    .optional(),
  tradeTitle: z.preprocess(emptyStringToUndefined, z.string().optional()),
  externalBrokerOrderRef: z.preprocess(emptyStringToUndefined, z.string().optional()),
  templateId: z.preprocess(emptyStringToUndefined, z.string().optional()),

  executionMode: z.enum(['SIMPLE', 'ADVANCED']).default('SIMPLE'),
  simpleExecution: simpleExecutionSchema.optional(),
  fills: z.array(tradeFillSchema).default([]),

  risk: z
    .object({
      plannedEntryPrice: z.number().optional(),
      initialStopLoss: z.number().optional(),
      plannedTarget: z.number().optional(),
      riskBudgetAmount: z.number().optional(),
      riskPercentage: z.number().optional(),
      suggestedQuantity: z.number().optional(),
      actualQuantity: z.number().optional(),
      estimatedRiskAmount: z.number().optional(),
      riskAsPercentOfEquity: z.number().optional(),
      plannedRewardRiskRatio: z.number().optional(),
      realizedRMultiple: z.number().optional(),
      riskRuleViolations: z.array(z.string()).default([]),
    })
    .default({ riskRuleViolations: [] }),

  thesis: z
    .object({
      preMarketBias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
      marketStructure: z.enum(['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE']).optional(),
      entryRationale: z.string().optional(),
      entryConfirmation: z.string().optional(),
      stopLossRationale: z.string().optional(),
      targetRationale: z.string().optional(),
      exitRationale: z.string().optional(),
      invalidationConditions: z.string().optional(),
      higherTimeframeContext: z.string().optional(),
      confluences: z.array(z.any()).default([]),
      customTechnicalLabels: z.array(z.string()).default([]),
    })
    .default({ confluences: [], customTechnicalLabels: [] }),

  psychology: z
    .object({
      emotionBefore: emotionEnum.optional(),
      emotionDuring: emotionEnum.optional(),
      emotionAfter: emotionEnum.optional(),
      confidenceScore: z.number().int().min(1).max(5).optional(),
      disciplineScore: z.number().int().min(1).max(5).default(4),
      checklistCompleted: z.boolean().default(true),
      rulesFollowed: z.boolean().default(true),
      mistakes: z.array(z.any()).default([]),
      revengeTrading: z.boolean().default(false),
      overtrading: z.boolean().default(false),
      prematureExit: z.boolean().default(false),
      stopLossMoved: z.boolean().default(false),
      positionSizeViolation: z.boolean().default(false),
      lessonsLearned: z.string().optional(),
      notes: z.string().optional(),
    })
    .default({
      disciplineScore: 4,
      checklistCompleted: true,
      rulesFollowed: true,
      mistakes: [],
      revengeTrading: false,
      overtrading: false,
      prematureExit: false,
      stopLossMoved: false,
      positionSizeViolation: false,
    }),

  setup: tradeSetupSchema.optional(),
  screenshotIds: z.array(z.string()).default([]),
});

export const updateTradeSchema = createTradeSchema.partial().extend({
  simpleExecution: simpleExecutionSchema.partial().optional(),
});
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;

export const tradeFilterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  search: z.preprocess(emptyStringToUndefined, z.string().optional()),
  accountId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  symbol: z.preprocess(emptyStringToUndefined, z.string().optional()),
  assetClass: z.preprocess(emptyStringToUndefined, z.string().optional()),
  direction: z.preprocess(emptyStringToUndefined, z.enum(['LONG', 'SHORT']).optional()),
  status: z.preprocess(emptyStringToUndefined, z.enum(['PLANNED', 'OPEN', 'CLOSED', 'CANCELLED']).optional()),
  outcome: z.preprocess(emptyStringToUndefined, z.enum(['WIN', 'LOSS', 'BREAKEVEN', 'OPEN', 'CANCELLED']).optional()),
  strategyId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  templateId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  session: z.preprocess(emptyStringToUndefined, z.string().optional()),
  startDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  endDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  tags: z.preprocess(emptyStringToUndefined, z.string().optional()), // Comma-separated
  variantKey: z.preprocess(emptyStringToUndefined, z.string().optional()),
  variantStatus: z.preprocess(emptyStringToUndefined, z.enum(['CLASSIFIED', 'UNCLASSIFIED', 'NOT_APPLICABLE']).optional()),
  entryModel: z.preprocess(emptyStringToUndefined, z.enum(['CONFIRMATION_CANDLE', 'RETEST', 'OTHER']).optional()),
  sortBy: z.string().default('tradeDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const bulkClassifySchema = z.object({
  tradeIds: z.array(z.string()).min(1, 'At least one trade ID is required'),
  strategyId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  variantKey: z.preprocess(emptyStringToUndefined, z.string().optional()),
  variantStatus: z.preprocess(emptyStringToUndefined, z.enum(['CLASSIFIED', 'UNCLASSIFIED', 'NOT_APPLICABLE']).optional()),
});
export type BulkClassifyInput = z.infer<typeof bulkClassifySchema>;

export const slRuleSchema = z.object({
  type: z.enum(['PERCENT', 'POINTS', 'PREMIUM_PERCENT', 'MANUAL']),
  value: z.number().optional(),
  manualHint: z.string().optional(),
});

export const createTradeTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().default(''),
  group: z
    .enum(['FNO', 'STOCKS', 'FOREX_GOLD', 'CRYPTO', 'MCX', 'PRICE_ACTION', 'CUSTOM'])
    .default('CUSTOM'),
  markets: z
    .array(z.enum(['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX']))
    .min(1, 'At least one market is required'),
  direction: z.enum(['LONG', 'SHORT']).optional(),
  strategyName: z.string().optional(),
  slRule: slRuleSchema,
  minRR: z.number().nonnegative().default(1.5),
  titlePattern: z.string().min(1, 'Title pattern is required'),
  tags: z.array(z.string()).default([]),
  confluences: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  timeWindow: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  expiryDayOnly: z.boolean().optional(),
  session: z
    .enum(['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'])
    .optional(),
  isFavorite: z.boolean().optional(),
  clonedFromId: z.string().optional(),
});

export const updateTradeTemplateSchema = createTradeTemplateSchema.partial();
export type CreateTradeTemplateInput = z.infer<typeof createTradeTemplateSchema>;
export type UpdateTradeTemplateInput = z.infer<typeof updateTradeTemplateSchema>;

export const dailyJournalSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  marketConditions: z.string().optional(),
  marketBias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
  bestTradeId: z.string().optional(),
  worstTradeId: z.string().optional(),
  mistakes: z.array(z.string()).default([]),
  emotionalState: emotionEnum.optional(),
  disciplineRating: z.number().int().min(1).max(5).optional(),
  lessonsLearned: z.string().optional(),
  nextDayPlan: z.string().optional(),
  notes: z.string().optional(),
});

export const riskCalculatorQuerySchema = z.object({
  accountEquity: z.coerce.number().positive('Account equity must be positive'),
  riskPercent: z.coerce.number().positive().optional(),
  fixedRiskAmount: z.coerce.number().positive().optional(),
  entryPrice: z.coerce.number().positive('Entry price must be positive'),
  stopLossPrice: z.coerce.number().positive('Stop loss must be positive'),
  targetPrice: z.coerce.number().positive().optional(),
  direction: z.enum(['LONG', 'SHORT']),
  contractMultiplier: z.coerce.number().positive().default(1),
  lotSize: z.coerce.number().positive().default(1),
  tickSize: z.coerce.number().positive().default(0.05),
  quantityIncrement: z.coerce.number().positive().default(1),
  estimatedCosts: z.coerce.number().nonnegative().default(0),
});

export const riskSettingsSchema = z.object({
  maxDailyLoss: z.coerce.number().nonnegative().optional(),
  maxDailyTrades: z.coerce.number().int().positive().optional(),
  maxOpenTrades: z.coerce.number().int().positive().optional(),
  maxRiskPerTradePercent: z.coerce.number().positive().optional(),
  revengeTradingMinutes: z.coerce.number().int().positive().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  baseCurrency: z.string().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  riskSettings: riskSettingsSchema.optional(),
});

export const excursionAnalyticsQuerySchema = z.object({
  accountId: z.string().optional(),
  strategyId: z.string().optional(),
  variantKey: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  session: z
    .enum(['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'])
    .optional(),
});

export const excursionBackfillSchema = z.object({
  accountId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  provider: z.enum(['AUTO', 'ANGEL_ONE']).optional(),
});

export const stopMoveDetectionSchema = z.object({
  manualModifications: z
    .array(
      z.object({
        stopPrice: z.coerce.number().positive(),
        modifiedAt: z.union([z.string(), z.number(), z.date()]),
        orderId: z.string().optional(),
        orderType: z.number().optional(),
        reason: z.string().optional(),
      })
    )
    .optional(),
});

export const angelOneConfigSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
  clientCode: z.string().trim().min(1, 'Client code is required'),
  pin: z.string().trim().min(4, 'PIN/MPIN must be at least 4 digits'),
});

export const angelOneConnectSchema = z.object({
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'TOTP must be a valid 6-digit numeric string'),
});

export const excursionComputeOptionsSchema = z.object({
  forceRefetch: z.boolean().optional(),
  provider: z.enum(['AUTO', 'ANGEL_ONE']).default('AUTO'),
});

export const chartResolutionSchema = z.enum(['1', '5', '15', '30', '60', 'D']);

export const generateChartSchema = z
  .object({
    force: z.boolean().default(false),
    provider: z.enum(['AUTO', 'ANGEL_ONE']).default('AUTO'),
    resolutions: z
      .array(chartResolutionSchema)
      .min(1)
      .max(5)
      .refine((items) => new Set(items).size === items.length, {
        message: 'Resolutions must be unique',
      })
      .optional(),
    paddingBefore: z.number().int().min(0).max(200).default(45),
    paddingAfter: z.number().int().min(0).max(200).default(45),
  })
  .strict();

export const chartGenerateOptionsSchema = generateChartSchema;

export const analyticsFilterSchema = z
  .object({
    accountId: z.string().optional(),
    symbol: z.string().optional(),
    assetClass: z.string().optional(),
    marketSegment: z.string().optional(),
    direction: z.enum(['LONG', 'SHORT']).optional(),
    strategyId: z.string().optional(),
    variantKey: z.string().optional(),
    session: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    tags: z.string().optional(),
  })
  .partial()
  .strict();

export const whatIfRequestSchema = z
  .object({
    filters: analyticsFilterSchema.optional().default({}),
    stopRGrid: z
      .array(z.union([z.number().min(0.25).max(3.0), z.null()]))
      .default([null, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]),
    targetRGrid: z
      .array(z.union([z.number().min(0.5).max(10.0), z.null()]))
      .default([null, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0]),
    fillModel: z.enum(['GAP_AWARE', 'AT_LEVEL']).default('GAP_AWARE'),
    slippageTicks: z.number().int().min(0).max(20).default(0),
    resolutionPolicy: z.enum(['FINEST_AVAILABLE', 'ONE_MINUTE_ONLY']).default('FINEST_AVAILABLE'),
    excludeManagedStopTrades: z.boolean().default(true),
    holdoutFraction: z.number().min(0.2).max(0.5).default(0.3),
  })
  .strict()
  .refine(
    (data) => {
      const stopCount = data.stopRGrid.length;
      const targetCount = data.targetRGrid.length;
      return stopCount * targetCount <= 100;
    },
    {
      message: 'Grid cannot exceed 100 cells (stopRGrid.length * targetRGrid.length <= 100)',
    }
  );

export type WhatIfRequestInput = z.infer<typeof whatIfRequestSchema>;


