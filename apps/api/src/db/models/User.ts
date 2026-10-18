import mongoose, { Document, Schema } from 'mongoose';

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
  },
  { timestamps: true }
);

export const User = mongoose.model<IUserDoc>('User', UserSchema);
