import mongoose, { Document, Schema } from 'mongoose';
import { AssetClass } from '@tradevault/shared';

export interface IStrategyDoc extends Document {
  userId: mongoose.Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

const StrategySchema = new Schema<IStrategyDoc>(
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
    description: {
      type: String,
      default: '',
    },
    assetClasses: [
      {
        type: String,
        enum: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
      },
    ],
    timeframes: [{ type: String }],
    entryRules: [{ type: String }],
    stopLossRules: [{ type: String }],
    targetRules: [{ type: String }],
    invalidationCriteria: [{ type: String }],
    checklist: [{ type: String }],
    minRiskReward: {
      type: Number,
      default: 1.5,
    },
    tags: [{ type: String }],
    notes: { type: String },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

StrategySchema.index({ userId: 1, name: 1 }, { unique: true });

export const Strategy = mongoose.model<IStrategyDoc>('Strategy', StrategySchema);
