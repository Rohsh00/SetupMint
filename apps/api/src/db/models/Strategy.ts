import mongoose, { Document, Schema } from 'mongoose';
import { AssetClass, IStrategyVariant } from '@tradevault/shared';

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
  variants: IStrategyVariant[];
  createdAt: Date;
  updatedAt: Date;
}

const StrategyVariantSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    expected: {
      type: Schema.Types.Mixed,
      default: {},
    },
    entryRules: [{ type: String }],
    stopLossRules: [{ type: String }],
    targetRules: [{ type: String }],
    invalidationCriteria: [{ type: String }],
    checklist: [{ type: String }],
    minRiskReward: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

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
    variants: {
      type: [StrategyVariantSchema],
      default: [],
    },
  },
  { timestamps: true }
);

StrategySchema.index({ userId: 1, name: 1 }, { unique: true });

export const Strategy = mongoose.model<IStrategyDoc>('Strategy', StrategySchema);
