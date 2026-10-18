import mongoose, { Document, Schema } from 'mongoose';
import { AssetClass, Direction, TradingSession, TemplateGroup, SlRule } from '@tradevault/shared';

export interface ITradeTemplateDoc extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  group: TemplateGroup;
  markets: AssetClass[];
  direction?: Direction;
  strategyName?: string;
  slRule: SlRule;
  minRR: number;
  titlePattern: string;
  tags: string[];
  confluences?: string[];
  checklist?: string[];
  timeWindow?: {
    start: string;
    end: string;
  };
  expiryDayOnly?: boolean;
  session?: TradingSession;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: Date;
  clonedFromId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SlRuleSchema = new Schema<SlRule>(
  {
    type: {
      type: String,
      enum: ['PERCENT', 'POINTS', 'PREMIUM_PERCENT', 'MANUAL'],
      required: true,
    },
    value: { type: Number },
    manualHint: { type: String },
  },
  { _id: false }
);

const TimeWindowSchema = new Schema(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false }
);

const TradeTemplateSchema = new Schema<ITradeTemplateDoc>(
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
    group: {
      type: String,
      enum: ['FNO', 'STOCKS', 'FOREX_GOLD', 'CRYPTO', 'MCX', 'PRICE_ACTION', 'CUSTOM'],
      default: 'CUSTOM',
      index: true,
    },
    markets: [
      {
        type: String,
        enum: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
      },
    ],
    direction: {
      type: String,
      enum: ['LONG', 'SHORT'],
    },
    strategyName: {
      type: String,
      trim: true,
    },
    slRule: {
      type: SlRuleSchema,
      required: true,
    },
    minRR: {
      type: Number,
      default: 1.5,
    },
    titlePattern: {
      type: String,
      required: true,
      trim: true,
    },
    tags: [{ type: String }],
    confluences: [{ type: String }],
    checklist: [{ type: String }],
    timeWindow: {
      type: TimeWindowSchema,
    },
    expiryDayOnly: {
      type: Boolean,
      default: false,
    },
    session: {
      type: String,
      enum: ['NSE_REGULAR', 'MCX_EVENING', 'ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'],
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsedAt: {
      type: Date,
    },
    clonedFromId: {
      type: String,
    },
  },
  { timestamps: true }
);

TradeTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });
TradeTemplateSchema.index({ userId: 1, isFavorite: 1 });
TradeTemplateSchema.index({ userId: 1, group: 1 });

export const TradeTemplate = mongoose.model<ITradeTemplateDoc>('TradeTemplate', TradeTemplateSchema);
