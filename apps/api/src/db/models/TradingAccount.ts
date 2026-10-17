import mongoose, { Document, Schema } from 'mongoose';
import { AccountStatus, AccountType } from '@tradevault/shared';

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
  status: AccountStatus;
  riskRules?: {
    maxDailyLoss?: number;
    maxRiskPerTradePercent?: number;
    maxOpenTrades?: number;
  };
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
    notes: { type: String },
  },
  { timestamps: true }
);

TradingAccountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const TradingAccount = mongoose.model<ITradingAccountDoc>(
  'TradingAccount',
  TradingAccountSchema
);
