import mongoose, { Document, Schema } from 'mongoose';
import { IAiCoachDebrief } from '@tradevault/shared';

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
  aiDebrief?: IAiCoachDebrief;
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
    aiDebrief: {
      date: { type: String },
      verdict: { type: String },
      disciplineScore: { type: Number },
      summary: { type: String },
      strengths: [{ type: String }],
      leaks: [{ type: String }],
      ruleForTomorrow: { type: String },
      isAiGenerated: { type: Boolean, default: false },
      modelUsed: { type: String },
      generatedAt: { type: String },
    },
  },
  { timestamps: true }
);

DailyJournalSchema.index({ userId: 1, date: 1, scopeKey: 1 }, { unique: true });
DailyJournalSchema.index({ userId: 1, accountId: 1, date: 1 });

export const DailyJournal = mongoose.model<IDailyJournalDoc>('DailyJournal', DailyJournalSchema);

/**
 * Safely removes legacy single-scope unique indexes (e.g. userId_1_date_1)
 * so that multi-account scoped daily journal reflections coexist without duplicate key errors.
 */
export async function reconcileDailyJournalIndexes(): Promise<void> {
  try {
    const coll = DailyJournal.collection;
    const indexes = await coll.indexes();
    const legacy = indexes.find((idx) => idx.name === 'userId_1_date_1');
    if (legacy) {
      await coll.dropIndex('userId_1_date_1');
      console.log('[DailyJournal] Reconciled indexes: dropped obsolete unique index userId_1_date_1');
    }
  } catch (err: any) {
    if (err.codeName !== 'NamespaceNotFound' && err.code !== 26) {
      console.warn('[DailyJournal] Note during index reconciliation:', err.message);
    }
  }
}
