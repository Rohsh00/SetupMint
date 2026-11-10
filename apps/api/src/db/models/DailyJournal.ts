import mongoose, { Document, Schema } from 'mongoose';

export interface IDailyJournalDoc extends Document {
  userId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId;
  scopeKey: string; // 'ALL' or accountId string
  date: string; // YYYY-MM-DD
  marketConditions?: string;
  marketBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bestTradeId?: mongoose.Types.ObjectId;
  worstTradeId?: mongoose.Types.ObjectId;
  mistakes: string[];
  emotionalState?: string;
  disciplineRating?: number;
  lessonsLearned?: string;
  nextDayPlan?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyJournalSchema = new Schema<IDailyJournalDoc>(
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
      index: true,
    },
    scopeKey: {
      type: String,
      default: 'ALL',
      trim: true,
      index: true,
    },
    date: {
      type: String, // Stored as YYYY-MM-DD string to avoid time zone shifts
      required: true,
    },
    marketConditions: { type: String },
    marketBias: { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
    bestTradeId: { type: Schema.Types.ObjectId, ref: 'Trade' },
    worstTradeId: { type: Schema.Types.ObjectId, ref: 'Trade' },
    mistakes: [{ type: String }],
    emotionalState: { type: String },
    disciplineRating: { type: Number, min: 1, max: 5 },
    lessonsLearned: { type: String },
    nextDayPlan: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

DailyJournalSchema.index({ userId: 1, date: 1, scopeKey: 1 }, { unique: true });
DailyJournalSchema.index({ userId: 1, accountId: 1, date: 1 });

export const DailyJournal = mongoose.model<IDailyJournalDoc>('DailyJournal', DailyJournalSchema);
