import mongoose, { Document, Schema } from 'mongoose';
import {
  AssetClass,
  Direction,
  ExecutionMode,
  MarketSegment,
  OptionType,
  TradeOutcome,
  TradeStatus,
  TradingSession,
  ITradeSetup,
} from '@tradevault/shared';

export interface ITradeDoc extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  instrumentId?: mongoose.Types.ObjectId;
  symbol: string;
  underlying?: string;
  optionType?: OptionType;
  strikePrice?: number;
  expiryDate?: Date;
  instrumentName?: string;
  assetClass: AssetClass;
  exchange: string;
  marketSegment: MarketSegment;
  currency: string;
  direction: Direction;
  status: TradeStatus;
  strategyId?: mongoose.Types.ObjectId;
  strategyName?: string;
  tags: string[];
  tradeDate: Date;
  timeZone: string;
  entryTime: Date;
  exitTime?: Date;
  session?: TradingSession;
  tradeTitle?: string;
  externalBrokerOrderRef?: string;
  importBatchId?: string;
  templateId?: string;

  executionMode: ExecutionMode;
  simpleExecution?: {
    entryPrice: number;
    exitPrice?: number;
    quantity: number;
    contractMultiplier: number;
    brokerage: number;
    exchangeFees: number;
    regulatoryFees: number;
    taxes: number;
    otherFees: number;
    explicitAdjustments: number;
    adjustmentsReason?: string;
  };
  fills: Array<{
    fillId: string;
    type: 'ENTRY' | 'EXIT';
    price: number;
    quantity: number;
    timestamp: Date;
    fee?: number;
    brokerage?: number;
    exchangeFee?: number;
    taxes?: number;
    notes?: string;
  }>;

  risk: {
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
    riskRuleViolations: string[];
  };

  thesis: {
    preMarketBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    marketStructure?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
    entryRationale?: string;
    entryConfirmation?: string;
    stopLossRationale?: string;
    targetRationale?: string;
    exitRationale?: string;
    invalidationConditions?: string;
    higherTimeframeContext?: string;
    confluences: string[];
    customTechnicalLabels: string[];
  };

  psychology: {
    emotionBefore?: string;
    emotionDuring?: string;
    emotionAfter?: string;
    confidenceScore?: number;
    disciplineScore: number;
    checklistCompleted: boolean;
    rulesFollowed: boolean;
    mistakes: string[];
    revengeTrading: boolean;
    overtrading: boolean;
    prematureExit: boolean;
    stopLossMoved: boolean;
    positionSizeViolation: boolean;
    lessonsLearned?: string;
    notes?: string;
  };

  calculated: {
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
    excursion?: {
      status: 'PENDING' | 'COMPUTED' | 'UNAVAILABLE' | 'FAILED';
      computedAt?: Date;
      source?: 'FYERS_HISTORY' | 'ANGEL_ONE_HISTORY' | 'UNDERLYING_FALLBACK';
      provider?: 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING';
      isUnderlyingFallback?: boolean;
      resolution?: string;
      failureReason?: string;
      maePoints?: number;
      mfePoints?: number;
      maeAmount?: number;
      mfeAmount?: number;
      maeR?: number;
      mfeR?: number;
      exitEfficiency?: number;
      stopEfficiency?: number;
      stopHit?: boolean;
      reversedAfterStopHit?: boolean;
      timeToMfeMinutes?: number;
      timeToMaeMinutes?: number;
      candleCount?: number;
      excursionFlags?: string[];
    };
    stopMoveSummary?: {
      totalMoves: number;
      widenedCount: number;
      trailedCount: number;
      initialStop?: number;
      finalStop?: number;
      netRiskChangePoints: number;
      hasWidenedRisk: boolean;
      detectedAt?: Date;
    };
  };

  setup?: ITradeSetup;
  stopLossMoveEvents?: Array<{
    previousStop: number;
    newStop: number;
    changePoints: number;
    changePercent: number;
    moveType: 'TRAILED_FAVORABLY' | 'WIDENED_RISK' | 'UNCHANGED';
    movedAt: Date;
    orderId?: string;
    orderType?: number;
    reason?: string;
  }>;
  screenshotIds: mongoose.Types.ObjectId[];
  auditLog: Array<{
    action: string;
    timestamp: Date;
    changedBy: string;
    details?: Record<string, any>;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const TradeFillSchema = new Schema(
  {
    fillId: { type: String, required: true },
    type: { type: String, enum: ['ENTRY', 'EXIT'], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    fee: { type: Number, default: 0 },
    brokerage: { type: Number, default: 0 },
    exchangeFee: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    notes: { type: String },
  },
  { _id: false }
);

const TradeSchema = new Schema<ITradeDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'TradingAccount',
      required: true,
      index: true,
    },
    instrumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Instrument',
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    underlying: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    optionType: {
      type: String,
      enum: ['CALL', 'PUT'],
    },
    strikePrice: { type: Number },
    expiryDate: { type: Date },
    instrumentName: { type: String },
    assetClass: {
      type: String,
      enum: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
      required: true,
      index: true,
    },
    exchange: { type: String, required: true },
    marketSegment: {
      type: String,
      enum: ['NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'MCX', 'FOREX', 'CRYPTO', 'US_EQUITY', 'CME', 'OTHER'],
      required: true,
    },
    currency: { type: String, default: 'INR' },
    direction: {
      type: String,
      enum: ['LONG', 'SHORT'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PLANNED', 'OPEN', 'CLOSED', 'CANCELLED'],
      default: 'CLOSED',
      index: true,
    },
    strategyId: {
      type: Schema.Types.ObjectId,
      ref: 'Strategy',
      index: true,
    },
    strategyName: { type: String },
    tags: [{ type: String, index: true }],
    tradeDate: { type: Date, required: true, index: true },
    timeZone: { type: String, default: 'Asia/Kolkata' },
    entryTime: { type: Date, required: true },
    exitTime: { type: Date },
    session: {
      type: String,
      enum: ['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'],
    },
    tradeTitle: { type: String },
    externalBrokerOrderRef: { type: String },
    importBatchId: { type: String, index: true },
    templateId: { type: String, index: true },

    executionMode: {
      type: String,
      enum: ['SIMPLE', 'ADVANCED'],
      default: 'SIMPLE',
    },
    simpleExecution: {
      entryPrice: { type: Number },
      exitPrice: { type: Number },
      quantity: { type: Number },
      contractMultiplier: { type: Number, default: 1 },
      brokerage: { type: Number, default: 0 },
      exchangeFees: { type: Number, default: 0 },
      regulatoryFees: { type: Number, default: 0 },
      taxes: { type: Number, default: 0 },
      otherFees: { type: Number, default: 0 },
      explicitAdjustments: { type: Number, default: 0 },
      adjustmentsReason: { type: String },
    },
    fills: [TradeFillSchema],

    risk: {
      plannedEntryPrice: { type: Number },
      initialStopLoss: { type: Number },
      plannedTarget: { type: Number },
      riskBudgetAmount: { type: Number },
      riskPercentage: { type: Number },
      suggestedQuantity: { type: Number },
      actualQuantity: { type: Number },
      estimatedRiskAmount: { type: Number },
      riskAsPercentOfEquity: { type: Number },
      plannedRewardRiskRatio: { type: Number },
      realizedRMultiple: { type: Number },
      riskRuleViolations: [{ type: String }],
    },

    thesis: {
      preMarketBias: { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      marketStructure: { type: String, enum: ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'] },
      entryRationale: { type: String },
      entryConfirmation: { type: String },
      stopLossRationale: { type: String },
      targetRationale: { type: String },
      exitRationale: { type: String },
      invalidationConditions: { type: String },
      higherTimeframeContext: { type: String },
      confluences: [{ type: String }],
      customTechnicalLabels: [{ type: String }],
    },

    psychology: {
      emotionBefore: { type: String },
      emotionDuring: { type: String },
      emotionAfter: { type: String },
      confidenceScore: { type: Number },
      disciplineScore: { type: Number, default: 4 },
      checklistCompleted: { type: Boolean, default: true },
      rulesFollowed: { type: Boolean, default: true },
      mistakes: [{ type: String }],
      revengeTrading: { type: Boolean, default: false },
      overtrading: { type: Boolean, default: false },
      prematureExit: { type: Boolean, default: false },
      stopLossMoved: { type: Boolean, default: false },
      positionSizeViolation: { type: Boolean, default: false },
      lessonsLearned: { type: String },
      notes: { type: String },
    },

    calculated: {
      grossPnL: { type: Number, default: 0 },
      totalCosts: { type: Number, default: 0 },
      netPnL: { type: Number, default: 0 },
      realizedRMultiple: { type: Number },
      holdingTimeMinutes: { type: Number },
      outcome: {
        type: String,
        enum: ['WIN', 'LOSS', 'BREAKEVEN', 'OPEN', 'CANCELLED'],
        default: 'BREAKEVEN',
        index: true,
      },
      closedQuantity: { type: Number, default: 0 },
      openQuantity: { type: Number, default: 0 },
      averageEntryPrice: { type: Number, default: 0 },
      averageExitPrice: { type: Number },
      excursion: {
        status: {
          type: String,
          enum: ['PENDING', 'COMPUTED', 'UNAVAILABLE', 'FAILED'],
          default: 'PENDING',
        },
        computedAt: { type: Date },
        source: {
          type: String,
          enum: ['FYERS_HISTORY', 'ANGEL_ONE_HISTORY', 'UNDERLYING_FALLBACK'],
          default: 'FYERS_HISTORY',
        },
        provider: {
          type: String,
          enum: ['FYERS', 'ANGEL_ONE', 'UNDERLYING'],
          default: 'FYERS',
        },
        isUnderlyingFallback: { type: Boolean, default: false },
        resolution: { type: String },
        failureReason: { type: String },
        maePoints: { type: Number },
        mfePoints: { type: Number },
        maeAmount: { type: Number },
        mfeAmount: { type: Number },
        maeR: { type: Number },
        mfeR: { type: Number },
        exitEfficiency: { type: Number },
        stopEfficiency: { type: Number },
        stopHit: { type: Boolean },
        reversedAfterStopHit: { type: Boolean },
        timeToMfeMinutes: { type: Number },
        timeToMaeMinutes: { type: Number },
        candleCount: { type: Number },
        excursionFlags: [{ type: String }],
      },
      stopMoveSummary: {
        totalMoves: { type: Number, default: 0 },
        widenedCount: { type: Number, default: 0 },
        trailedCount: { type: Number, default: 0 },
        initialStop: { type: Number },
        finalStop: { type: Number },
        netRiskChangePoints: { type: Number, default: 0 },
        hasWidenedRisk: { type: Boolean, default: false },
        detectedAt: { type: Date },
      },
    },

    setup: {
      variantKey: { type: String, trim: true, index: true },
      variantStatus: {
        type: String,
        enum: ['CLASSIFIED', 'UNCLASSIFIED', 'NOT_APPLICABLE'],
        default: 'UNCLASSIFIED',
        index: true,
      },
      alsoMatches: [{ type: String }],
      htfBias: { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
      executionTimeframe: { type: String },
      liquiditySide: { type: String, enum: ['SELL_SIDE', 'BUY_SIDE', 'NONE'] },
      patternType: { type: String, enum: ['EQUAL_LOWS', 'EQUAL_HIGHS', 'W', 'M', 'OTHER'] },
      secondLegStatus: { type: String, enum: ['SWEPT', 'UNSWEPT', 'NOT_APPLICABLE'] },
      liquidityLevel: { type: Number },
      sweepExtreme: { type: Number },
      entryModel: { type: String, enum: ['CONFIRMATION_CANDLE', 'RETEST', 'OTHER'] },
    },

    stopLossMoveEvents: [
      {
        previousStop: { type: Number, required: true },
        newStop: { type: Number, required: true },
        changePoints: { type: Number, required: true },
        changePercent: { type: Number, required: true },
        moveType: {
          type: String,
          enum: ['TRAILED_FAVORABLY', 'WIDENED_RISK', 'UNCHANGED'],
          required: true,
        },
        movedAt: { type: Date, required: true },
        orderId: { type: String },
        orderType: { type: Number },
        reason: { type: String },
        _id: false,
      },
    ],

    screenshotIds: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
    auditLog: [
      {
        action: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        changedBy: { type: String, default: 'user' },
        details: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

TradeSchema.index({ userId: 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, accountId: 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, 'calculated.netPnL': -1 });
TradeSchema.index({ userId: 1, templateId: 1 });
TradeSchema.index({ userId: 1, strategyId: 1, 'setup.variantKey': 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, 'calculated.excursion.status': 1 });
TradeSchema.index({ userId: 1, 'calculated.stopMoveSummary.hasWidenedRisk': 1 });

export const Trade = mongoose.model<ITradeDoc>('Trade', TradeSchema);
