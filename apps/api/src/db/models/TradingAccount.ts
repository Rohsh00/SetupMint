import mongoose, { Document, Schema } from 'mongoose';
import { AccountStatus, AccountType, IPropFirmAccountData, IPropFirmConfig } from '@tradevault/shared';

export interface ITradingAccountDoc extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  broker: string;
  accountNumber?: string;
  accountType: AccountType;
  baseCurrency: string;
  initialBalance: mongoose.Types.Decimal128;
  currentBalance: mongoose.Types.Decimal128;
  realizedPnL: mongoose.Types.Decimal128;
  totalDeposits: mongoose.Types.Decimal128;
  totalWithdrawals: mongoose.Types.Decimal128;
  totalAdjustments: mongoose.Types.Decimal128;
  brokerLink?: {
    broker: 'FYERS';
    clientId: string;
    linkedAt: Date;
  };
  status: AccountStatus;
  riskRules?: {
    maxDailyLoss?: number;
    maxRiskPerTradePercent?: number;
    maxOpenTrades?: number;
  };
  propFirmConfig?: IPropFirmConfig;
  propFirm?: IPropFirmAccountData;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TradingAccountSchema = new Schema<ITradingAccountDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    broker: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: { type: String, trim: true },
    accountType: {
      type: String,
      enum: ['EQUITY', 'COMMODITY', 'FUTURES_OPTIONS', 'FOREX', 'CRYPTO', 'PROP_FIRM', 'DEMO', 'OTHER'],
      default: 'EQUITY',
    },
    baseCurrency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    initialBalance: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    currentBalance: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    realizedPnL: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    totalDeposits: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    totalWithdrawals: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    totalAdjustments: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    brokerLink: {
      broker: { type: String, enum: ['FYERS'] },
      clientId: { type: String, trim: true },
      linkedAt: { type: Date },
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    riskRules: {
      maxDailyLoss: { type: Number },
      maxRiskPerTradePercent: { type: Number },
      maxOpenTrades: { type: Number },
    },
    propFirmConfig: {
      enabled: { type: Boolean, default: false },
      firm: {
        type: String,
        enum: ['THE5ERS', 'FTMO', 'FUNDED_NEXT', 'APEX', 'TOPSTEP', 'CUSTOM'],
        default: 'THE5ERS',
      },
      planName: { type: String, default: 'Summer Plan 10/5 ($149)' },
      phase: {
        type: String,
        enum: ['PHASE_1', 'PHASE_2', 'FUNDED'],
        default: 'PHASE_1',
      },
      initialBalance: { type: Number },
      targetProfitPercent: { type: Number },
      dailyLossLimitPercent: { type: Number },
      dailyLossReference: {
        type: String,
        enum: ['MAX_BALANCE_EQUITY_EOD', 'STARTING_BALANCE', 'STARTING_EQUITY'],
        default: 'MAX_BALANCE_EQUITY_EOD',
      },
      maxLossLimitPercent: { type: Number },
      maxLossType: {
        type: String,
        enum: ['STATIC_FROM_INITIAL', 'TRAILING_EOD', 'TRAILING_INTRADAY_HIGH'],
        default: 'STATIC_FROM_INITIAL',
      },
      maxLossFloor: { type: Number },
      minTradingDays: { type: Number, default: 0 },
      newsTradingAllowed: { type: Boolean, default: true },
      weekendHoldingAllowed: { type: Boolean, default: true },
      currentPhaseStartedAt: { type: String },
      status: {
        type: String,
        enum: ['ACTIVE', 'PASSED', 'BREACHED'],
        default: 'ACTIVE',
      },
    },
    propFirm: {
      firmKey: { type: String, trim: true },
      planKey: { type: String, trim: true },
      phase: { type: String, default: 'PHASE_1' },
      ruleSetOverrides: { type: Schema.Types.Mixed },
      phaseStartedAt: { type: String },
      startingBalance: { type: Number },
      status: {
        type: String,
        enum: ['ACTIVE', 'PASSED', 'FAILED'],
        default: 'ACTIVE',
      },
      breachedAt: { type: String },
      breachedRule: { type: String },
      breachReason: { type: String },
    },
    notes: { type: String },
  },
  { timestamps: true }
);

TradingAccountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const TradingAccount = mongoose.model<ITradingAccountDoc>(
  'TradingAccount',
  TradingAccountSchema
);
