import mongoose, { Document, Schema } from 'mongoose';
import {
  IFocusRule,
  IFocusRuleEvaluation,
  IWeeklyReviewSnapshot,
  WeeklyReviewStatus,
} from '@tradevault/shared';

export interface IWeeklyReviewDoc extends Document {
  userId: mongoose.Types.ObjectId;
  week: string; // YYYY-Www
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  accountId?: mongoose.Types.ObjectId | null;
  snapshot: IWeeklyReviewSnapshot;
  generatedAt: Date;
  focusRule?: IFocusRule;
  previousFocusEvaluation?: IFocusRuleEvaluation;
  notes?: string;
  status: WeeklyReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

const WeeklyReviewSchema = new Schema<IWeeklyReviewDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    week: {
      type: String,
      required: true,
    },
    startDate: {
      type: String,
      required: true,
    },
    endDate: {
      type: String,
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'TradingAccount',
      default: null,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    focusRule: {
      code: { type: String },
      text: { type: String },
      metric: { type: Schema.Types.Mixed },
      source: { type: String, enum: ['SUGGESTED', 'CUSTOM'], default: 'SUGGESTED' },
    },
    previousFocusEvaluation: {
      followed: { type: Boolean, default: null },
      actual: { type: Schema.Types.Mixed },
      target: { type: Schema.Types.Mixed },
      note: { type: String },
    },
    notes: {
      type: String,
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'FINALIZED'],
      default: 'DRAFT',
    },
  },
  { timestamps: true }
);

WeeklyReviewSchema.index({ userId: 1, week: 1, accountId: 1 }, { unique: true });

export const WeeklyReview = mongoose.model<IWeeklyReviewDoc>(
  'WeeklyReview',
  WeeklyReviewSchema,
  'weeklyreviews'
);
