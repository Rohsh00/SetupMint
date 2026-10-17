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

export const accountTransactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'ADJUSTMENT']),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('INR'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
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
  expiryDate: z.string().optional(),
  optionType: z.enum(['CALL', 'PUT']).optional(),
  strikePrice: z.number().optional(),
  description: z.string().optional(),
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
});

export const tradeFillSchema = z.object({
  fillId: z.string(),
  type: z.enum(['ENTRY', 'EXIT']),
  price: z.number().positive('Price must be greater than zero'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  timestamp: z.string(),
  fee: z.number().nonnegative().optional(),
  brokerage: z.number().nonnegative().optional(),
  exchangeFee: z.number().nonnegative().optional(),
  taxes: z.number().nonnegative().optional(),
  notes: z.string().optional(),
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

export const createTradeSchema = z.object({
  accountId: z.string().min(1, 'Trading account is required'),
  symbol: z.string().min(1, 'Symbol is required').transform((s) => s.toUpperCase().trim()),
  instrumentId: z.string().optional(),
  instrumentName: z.string().optional(),
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
  strategyId: z.string().optional(),
  strategyName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  tradeDate: z.string().min(1, 'Trade date is required'),
  timeZone: z.string().default('Asia/Kolkata'),
  entryTime: z.string().min(1, 'Entry time is required'),
  exitTime: z.string().optional(),
  session: z
    .enum(['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'])
    .optional(),
  tradeTitle: z.string().optional(),
  externalBrokerOrderRef: z.string().optional(),

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
      emotionBefore: z
        .enum([
          'CALM',
          'CONFIDENT',
          'ANXIOUS',
          'EUPHORIC',
          'FEARFUL',
          'GREEDY',
          'FRUSTRATED',
          'DISCIPLINED',
          'NEUTRAL',
        ])
        .optional(),
      emotionDuring: z
        .enum([
          'CALM',
          'CONFIDENT',
          'ANXIOUS',
          'EUPHORIC',
          'FEARFUL',
          'GREEDY',
          'FRUSTRATED',
          'DISCIPLINED',
          'NEUTRAL',
        ])
        .optional(),
      emotionAfter: z
        .enum([
          'CALM',
          'CONFIDENT',
          'ANXIOUS',
          'EUPHORIC',
          'FEARFUL',
          'GREEDY',
          'FRUSTRATED',
          'DISCIPLINED',
          'NEUTRAL',
        ])
        .optional(),
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

  screenshotIds: z.array(z.string()).default([]),
});

const emptyStringToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

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
  session: z.preprocess(emptyStringToUndefined, z.string().optional()),
  startDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  endDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  tags: z.preprocess(emptyStringToUndefined, z.string().optional()), // Comma-separated
  sortBy: z.string().default('tradeDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dailyJournalSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  marketConditions: z.string().optional(),
  marketBias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
  bestTradeId: z.string().optional(),
  worstTradeId: z.string().optional(),
  mistakes: z.array(z.string()).default([]),
  emotionalState: z
    .enum([
      'CALM',
      'CONFIDENT',
      'ANXIOUS',
      'EUPHORIC',
      'FEARFUL',
      'GREEDY',
      'FRUSTRATED',
      'DISCIPLINED',
      'NEUTRAL',
    ])
    .optional(),
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
