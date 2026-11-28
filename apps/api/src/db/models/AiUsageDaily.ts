import mongoose, { Document, Schema } from 'mongoose';

export interface IAiUsageDailyDoc extends Document {
  userId: mongoose.Types.ObjectId;
  dateStr: string; // YYYY-MM-DD in UTC
  requestCount: number;
  tokensEstimated: number;
  rateLimitedCount: number;
  features: Record<string, number>;
  lastRequestAt: Date;
  lastModelUsed?: string;
  lastStatus: 'OK' | 'RATE_LIMITED' | 'ERROR';
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiUsageDailySchema = new Schema<IAiUsageDailyDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateStr: { type: String, required: true, index: true },
    requestCount: { type: Number, required: true, default: 0 },
    tokensEstimated: { type: Number, required: true, default: 0 },
    rateLimitedCount: { type: Number, required: true, default: 0 },
    features: { type: Schema.Types.Mixed, default: {} },
    lastRequestAt: { type: Date, default: Date.now },
    lastModelUsed: { type: String },
    lastStatus: { type: String, enum: ['OK', 'RATE_LIMITED', 'ERROR'], default: 'OK' },
    lastErrorMessage: { type: String },
  },
  { timestamps: true }
);

AiUsageDailySchema.index({ userId: 1, dateStr: 1 }, { unique: true });

export const AiUsageDaily = mongoose.model<IAiUsageDailyDoc>('AiUsageDaily', AiUsageDailySchema);

