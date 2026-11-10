import mongoose, { Document, Schema } from 'mongoose';
import {
  AccountStatus,
  AccountType,
  IPropFirmAccountData,
  IPropFirmConfig,
  ITradingAccountProfile,
} from '@tradevault/shared';
import { BrokerAdapterRegistry } from '@tradevault/financial-engine';

export interface ITradingAccountDoc extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  broker: string;
  accountNumber?: string;
  accountType: AccountType;
  baseCurrency: string;
  profile: ITradingAccountProfile;
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

export function buildDefaultAccountProfile(doc: any): ITradingAccountProfile {
  const brokerNorm = String(doc.broker || '').toUpperCase();
  const accType = String(doc.accountType || '').toUpperCase();
  const isProp =
    accType === 'PROP_FIRM' ||
    Boolean(doc.propFirm?.firmKey && String(doc.propFirm.firmKey).trim() !== '') ||
    doc.propFirmConfig?.enabled === true;

  const isElefin = /ELEFIN|MT5/i.test(brokerNorm) || /ELEFIN|MT5/i.test(String(doc.name || ''));

  if (isProp) {
    const baseCurrency = String(doc.baseCurrency || 'USD').toUpperCase();
    const timezone = doc.propFirm?.ruleSetOverrides?.dailyLoss?.resetTimezone || 'UTC';
    return {
      marketRegion: 'GLOBAL',
      baseCurrency,
      timezone,
      feeModelKey: 'FOREX_COMMISSION',
      executionAdapterKey: 'PROP_SIM',
      positionModel: 'HEDGING',
      sessionCalendarKey: 'FOREX_24_5',
      riskRules: {
        maxDailyLoss: doc.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: doc.riskRules?.maxRiskPerTradePercent ?? 1,
        maxOpenTrades: doc.riskRules?.maxOpenTrades ?? 5,
        lotCap: doc.propFirm?.ruleSetOverrides?.lotCap,
        requireStopLoss: true,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities('PROP_SIM'),
    };
  }

  if (isElefin) {
    const baseCurrency = String(doc.baseCurrency || 'USD').toUpperCase();
    return {
      marketRegion: 'GLOBAL',
      baseCurrency,
      timezone: 'UTC',
      feeModelKey: 'FOREX_COMMISSION',
      executionAdapterKey: 'ELEFIN_MT5',
      positionModel: 'HEDGING',
      sessionCalendarKey: 'FOREX_24_5',
      riskRules: {
        maxDailyLoss: doc.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: doc.riskRules?.maxRiskPerTradePercent,
        maxOpenTrades: doc.riskRules?.maxOpenTrades,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities('ELEFIN_MT5'),
    };
  }

  if (brokerNorm === 'FYERS' || (brokerNorm.length > 0 && ['EQUITY', 'COMMODITY', 'FUTURES_OPTIONS'].includes(accType))) {
    const baseCurrency = String(doc.baseCurrency || 'INR').toUpperCase();
    return {
      marketRegion: 'IN',
      baseCurrency,
      timezone: 'Asia/Kolkata',
      feeModelKey: 'INDIA_STATUTORY',
      executionAdapterKey: brokerNorm === 'FYERS' ? 'FYERS' : 'MANUAL',
      positionModel: 'NETTING_FIFO',
      sessionCalendarKey: accType === 'COMMODITY' ? 'MCX' : 'NSE',
      riskRules: {
        maxDailyLoss: doc.riskRules?.maxDailyLoss,
        maxRiskPerTradePercent: doc.riskRules?.maxRiskPerTradePercent,
        maxOpenTrades: doc.riskRules?.maxOpenTrades,
      },
      capabilities: BrokerAdapterRegistry.getCapabilities(brokerNorm === 'FYERS' ? 'FYERS' : 'MANUAL'),
    };
  }

  const baseCurrency = String(doc.baseCurrency || 'USD').toUpperCase();
  const isIndian = baseCurrency === 'INR';
  return {
    marketRegion: isIndian ? 'IN' : 'GLOBAL',
    baseCurrency,
    timezone: isIndian ? 'Asia/Kolkata' : 'UTC',
    feeModelKey: isIndian ? 'INDIA_STATUTORY' : 'FOREX_COMMISSION',
    executionAdapterKey: 'MANUAL',
    positionModel: 'NETTING_FIFO',
    sessionCalendarKey: isIndian ? 'NSE' : 'FOREX_24_5',
    riskRules: {
      maxDailyLoss: doc.riskRules?.maxDailyLoss,
      maxRiskPerTradePercent: doc.riskRules?.maxRiskPerTradePercent,
      maxOpenTrades: doc.riskRules?.maxOpenTrades,
    },
    capabilities: BrokerAdapterRegistry.getCapabilities('MANUAL'),
  };
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
      required: true,
      trim: true,
    },
    profile: {
      marketRegion: {
        type: String,
        enum: ['IN', 'US', 'EU', 'GLOBAL'],
        default: 'GLOBAL',
      },
      baseCurrency: { type: String, required: true, trim: true },
      timezone: { type: String, required: true, trim: true },
      feeModelKey: {
        type: String,
        enum: ['INDIA_STATUTORY', 'FOREX_COMMISSION', 'NONE', 'CUSTOM'],
        default: 'NONE',
      },
      executionAdapterKey: {
        type: String,
        enum: ['FYERS', 'ELEFIN_MT5', 'PROP_SIM', 'MANUAL'],
        default: 'MANUAL',
      },
      positionModel: {
        type: String,
        enum: ['NETTING_FIFO', 'HEDGING'],
        default: 'NETTING_FIFO',
      },
      sessionCalendarKey: {
        type: String,
        enum: ['NSE', 'MCX', 'FOREX_24_5', 'CRYPTO_24_7'],
        default: 'FOREX_24_5',
      },
      riskRules: { type: Schema.Types.Mixed },
      capabilities: {
        canPlaceOrders: { type: Boolean, default: false },
        canModifyStopLoss: { type: Boolean, default: false },
        canExitPositions: { type: Boolean, default: false },
        canScaleLadder: { type: Boolean, default: false },
        canAutoExecute: { type: Boolean, default: false },
        canSyncFunds: { type: Boolean, default: false },
        canFetchHistory: { type: Boolean, default: false },
        canStreamQuotes: { type: Boolean, default: false },
      },
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

TradingAccountSchema.pre('validate', function (next) {
  if (!this.baseCurrency && (this as any).profile?.baseCurrency) {
    this.baseCurrency = (this as any).profile.baseCurrency;
  }
  if (!this.profile || !this.profile.baseCurrency) {
    this.profile = buildDefaultAccountProfile(this) as any;
  }
  if (!this.baseCurrency && this.profile?.baseCurrency) {
    this.baseCurrency = this.profile.baseCurrency;
  }
  next();
});

TradingAccountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const TradingAccount = mongoose.model<ITradingAccountDoc>(
  'TradingAccount',
  TradingAccountSchema
);
