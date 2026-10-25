import mongoose, { Document, Schema } from 'mongoose';
import {
  IPatternDetectionSettings,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
} from '@tradevault/shared';

export interface IUserRiskSettings {
  maxDailyLoss?: number;
  maxDailyTrades?: number;
  maxOpenTrades?: number;
  maxRiskPerTradePercent?: number;
  revengeTradingMinutes?: number;
}

export interface IUserDoc extends Document {
  email: string;
  passwordHash: string;
  name: string;
  baseCurrency: string;
  theme: 'dark' | 'light' | 'system';
  riskSettings?: IUserRiskSettings;
  patternDetectionSettings?: IPatternDetectionSettings;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    baseCurrency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    theme: {
      type: String,
      enum: ['dark', 'light', 'system'],
      default: 'dark',
    },
    riskSettings: {
      maxDailyLoss: { type: Number, default: 5000 },
      maxDailyTrades: { type: Number, default: 6 },
      maxOpenTrades: { type: Number, default: 3 },
      maxRiskPerTradePercent: { type: Number, default: 2.0 },
      revengeTradingMinutes: { type: Number, default: 30 },
    },
    patternDetectionSettings: {
      defaultHtf: { type: String, default: '240' },
      defaultLtf: { type: String, default: '5' },
      autoDetectOnImport: { type: Boolean, default: true },
      autoDetectMistakes: { type: Boolean, default: true },
      instrumentOverrides: {
        type: [
          {
            symbol: { type: String, required: true },
            htf: { type: String, required: true },
            ltf: { type: String, required: true },
            preferredStrategyId: { type: String },
            preferredStrategyName: { type: String },
          },
        ],
        default: DEFAULT_PATTERN_DETECTION_SETTINGS.instrumentOverrides,
      },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUserDoc>('User', UserSchema);
