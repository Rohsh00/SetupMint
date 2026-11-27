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
  ICustomLadderRules,
  IExecutionSlippage,
} from '@tradevault/shared';
import { deriveSessionFromTime } from '@tradevault/financial-engine';

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

  // Pyramiding & Campaign Grouping
  campaignId?: string;
  isCampaignParent?: boolean;
  isPyramidLayer?: boolean;
  layerIndex?: number;
  pyramidDetails?: {
    parentTicket?: string;
    wasBaseStopProtectedToBE?: boolean;
    rMultipleAtScaleIn?: number;
    standalonePnL?: number;
    blendedEntryAfterAdd?: number;
  };

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
    spreadPoints?: number;
    spreadCost?: number;
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
    currentStopLoss?: number;
    initialStopSource?: 'MANUAL' | 'TEMPLATE' | 'BROKER_ORDERBOOK';
    slReviewReason?: string;
    slReviewCandidates?: any[];
    plannedTarget?: number;
    riskBudgetAmount?: number;
    plannedRiskAmount?: number;
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
      source?: 'FYERS_HISTORY' | 'ANGEL_ONE_HISTORY' | 'UNDERLYING_FALLBACK' | 'MT5_LIVE' | 'MANUAL' | 'GLOBAL_CFD_HISTORY';
      provider?: 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING' | 'SYNTHETIC' | 'MT5_LIVE' | 'MANUAL' | 'GLOBAL_CFD';
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
      excursionFlags?: string[];
      warnings?: string[];
      postExitMfePoints?: number;
      postExitMfeAmount?: number;
      postExitMfeR?: number;
      postExitPeakPrice?: number;
      postExitPeakTime?: Date | string;
      postExitLookaheadMinutes?: number;
      postExitCandleCount?: number;
      postExitRunBeyondExitPoints?: number;
      postExitRunBeyondExitR?: number;
      postExitMaePoints?: number;
      postExitMaeAmount?: number;
      postExitMaeR?: number;
      postExitTroughPrice?: number;
      postExitTroughTime?: Date | string;
      postExitAdverseBeyondExitPoints?: number;
      postExitAdverseBeyondExitR?: number;
      postExitTimeToPeakMinutes?: number;
      postExitVelocityRPerMin?: number;
      postStopMfePoints?: number;
      postStopMfeR?: number;
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
    liveMfeSummary?: {
      peakLtp?: number;
      peakFloatingNetPnL?: number;
      peakUnrealizedR?: number;
      peakTimestamp?: Date;
    };
    slippage?: IExecutionSlippage;
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
  customLadderRules?: ICustomLadderRules;
  executedLadderSteps?: string[];
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
      enum: ['NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'BSE_FNO', 'MCX', 'FOREX', 'CRYPTO', 'US_EQUITY', 'CME', 'OTHER'],
      required: true,
    },
    currency: { type: String, required: true, uppercase: true, trim: true },
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

    // Pyramiding & Campaign Grouping
    campaignId: { type: String, index: true },
    isCampaignParent: { type: Boolean, default: false },
    isPyramidLayer: { type: Boolean, default: false },
    layerIndex: { type: Number, default: 0 },
    pyramidDetails: {
      parentTicket: { type: String },
      wasBaseStopProtectedToBE: { type: Boolean },
      rMultipleAtScaleIn: { type: Number },
      standalonePnL: { type: Number },
      blendedEntryAfterAdd: { type: Number },
    },

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
      spreadPoints: { type: Number },
      spreadCost: { type: Number },
    },
    fills: [TradeFillSchema],

    risk: {
      plannedEntryPrice: { type: Number },
      initialStopLoss: { type: Number },
      currentStopLoss: { type: Number },
      initialStopSource: { type: String, enum: ['MANUAL', 'TEMPLATE', 'BROKER_ORDERBOOK'] },
      slReviewReason: { type: String },
      slReviewCandidates: [{ type: Schema.Types.Mixed }],
      plannedTarget: { type: Number },
      riskBudgetAmount: { type: Number },
      plannedRiskAmount: { type: Number },
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
          enum: ['FYERS_HISTORY', 'ANGEL_ONE_HISTORY', 'UNDERLYING_FALLBACK', 'MT5_LIVE', 'MANUAL'],
          default: 'FYERS_HISTORY',
        },
        provider: {
          type: String,
          enum: ['FYERS', 'ANGEL_ONE', 'UNDERLYING', 'SYNTHETIC', 'MT5_LIVE', 'MANUAL'],
          default: 'FYERS',
        },
        isUnderlyingFallback: { type: Boolean, default: false },
        resolution: { type: String },
        isLowResolution: { type: Boolean, default: false },
        failureReason: { type: String },
        excursionVersion: { type: Number, default: 2 },
        thresholdVersion: { type: String, default: 'v2' },
        maePoints: { type: Number },
        mfePoints: { type: Number },
        maeAmount: { type: Number },
        mfeAmount: { type: Number },
        maeR: { type: Number },
        mfeR: { type: Number },
        feeAdjustedMaePoints: { type: Number },
        feeAdjustedMfePoints: { type: Number },
        feeAdjustedMaeAmount: { type: Number },
        feeAdjustedMfeAmount: { type: Number },
        feeAdjustedMaeR: { type: Number },
        feeAdjustedMfeR: { type: Number },
        rLeftOnTable: { type: Number },
        exitEfficiency: { type: Number },
        stopEfficiency: { type: Number },
        entryQualityScore: { type: Number },
        earlyMfePoints: { type: Number },
        earlyMaePoints: { type: Number },
        maeBeforeMfe: { type: Boolean },
        timeOrdering: { type: String, enum: ['HEAT_FIRST', 'RUN_FIRST', 'SIMULTANEOUS'] },
        stopHit: { type: Boolean },
        reversedAfterStopHit: { type: Boolean },
        timeToMfeMinutes: { type: Number },
        timeToMaeMinutes: { type: Number },
        candleCount: { type: Number },
        excursionFlags: [{ type: String }],
        warnings: [{ type: String }],
        postExitMfePoints: { type: Number },
        postExitMfeAmount: { type: Number },
        postExitMfeR: { type: Number },
        postExitPeakPrice: { type: Number },
        postExitPeakTime: { type: Date },
        postExitLookaheadMinutes: { type: Number },
        postExitCandleCount: { type: Number },
        postExitRunBeyondExitPoints: { type: Number },
        postExitRunBeyondExitR: { type: Number },
        postExitMaePoints: { type: Number },
        postExitMaeAmount: { type: Number },
        postExitMaeR: { type: Number },
        postExitTroughPrice: { type: Number },
        postExitTroughTime: { type: Date },
        postExitAdverseBeyondExitPoints: { type: Number },
        postExitAdverseBeyondExitR: { type: Number },
        postExitTimeToPeakMinutes: { type: Number },
        postExitVelocityRPerMin: { type: Number },
        postStopMfePoints: { type: Number },
        postStopMfeR: { type: Number },
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
      liveMfeSummary: {
        peakLtp: { type: Number },
        peakFloatingNetPnL: { type: Number },
        peakUnrealizedR: { type: Number },
        peakTimestamp: { type: Date },
      },
      slippage: {
        hasSlippageData: { type: Boolean, default: false },
        entrySlippagePoints: { type: Number },
        entrySlippagePercent: { type: Number },
        entrySlippageCost: { type: Number },
        isEntryAdverse: { type: Boolean },
        exitSlippagePoints: { type: Number },
        exitSlippagePercent: { type: Number },
        exitSlippageCost: { type: Number },
        isExitAdverse: { type: Boolean },
        totalSlippageCost: { type: Number },
        summaryText: { type: String },
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
    customLadderRules: { type: Schema.Types.Mixed },
    executedLadderSteps: [{ type: String }],
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

TradeSchema.pre('validate', async function () {
  let account: any = null;
  if (this.accountId) {
    try {
      account = await mongoose.model('TradingAccount').findById(this.accountId).lean();
    } catch {
      // ignore
    }
  }

  if (!this.currency) {
    if (account) {
      this.currency = account.profile?.baseCurrency || account.baseCurrency || 'USD';
    } else {
      this.currency = 'USD';
    }
  }

  if (!this.session) {
    try {
      const calendarKey =
        account?.profile?.sessionCalendarKey ||
        (account?.broker === 'FYERS' || account?.baseCurrency === 'INR' ? 'NSE' : 'FOREX_24_5');
      this.session = deriveSessionFromTime(
        this.entryTime || this.tradeDate,
        this.exchange,
        this.marketSegment,
        calendarKey,
        this.symbol
      );
    } catch {
      // ignore
    }
  }
});

TradeSchema.index({ userId: 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, accountId: 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, entryTime: -1 });
TradeSchema.index({ userId: 1, accountId: 1, entryTime: -1 });
TradeSchema.index({ userId: 1, 'calculated.netPnL': -1 });
TradeSchema.index({ userId: 1, templateId: 1 });
TradeSchema.index({ userId: 1, strategyId: 1, 'setup.variantKey': 1, tradeDate: -1 });
TradeSchema.index({ userId: 1, 'calculated.excursion.status': 1 });
TradeSchema.index({ userId: 1, 'calculated.stopMoveSummary.hasWidenedRisk': 1 });

export const Trade = mongoose.model<ITradeDoc>('Trade', TradeSchema);
