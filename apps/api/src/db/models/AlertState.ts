import mongoose, { Document, Schema } from 'mongoose';

export interface IAlertStateDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId;
  type: string;
  state: 'ACTIVE' | 'SNOOZED' | 'CLEARED' | 'RESOLVED';
  severity: number;
  enterCount: number;
  pingCount: number;
  firstAt: Date;
  lastSentAt: Date;
  lastEditAt?: Date;
  clearedAt?: Date;
  snoozedUntil?: Date;
  snoozedSeverity?: number;
  chatId: string;
  messageId?: number;
  cardVersion: number;
  resolvedAt?: Date;
  lastMetricValue?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AlertStateSchema = new Schema<IAlertStateDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', index: true },
    type: {
      type: String,
      required: true,
      enum: [
        'STOP_THREAT',
        'GIVEBACK',
        'LADDER',
        'DAILY_LOSS',
        'NAKED_POSITION',
        'TOKEN_EXPIRY',
        'TRADE_OPENED',
        'TRADE_CLOSED',
        'EOD_SUMMARY',
      ],
    },
    state: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'SNOOZED', 'CLEARED', 'RESOLVED'],
      default: 'ACTIVE',
    },
    severity: { type: Number, required: true, default: 0 },
    enterCount: { type: Number, required: true, default: 1 },
    pingCount: { type: Number, required: true, default: 0 },
    firstAt: { type: Date, required: true, default: Date.now },
    lastSentAt: { type: Date, required: true, default: Date.now },
    lastEditAt: { type: Date },
    clearedAt: { type: Date },
    snoozedUntil: { type: Date },
    snoozedSeverity: { type: Number },
    chatId: { type: String, required: true },
    messageId: { type: Number },
    cardVersion: { type: Number, required: true, default: 1 },
    resolvedAt: { type: Date },
    lastMetricValue: { type: String },
  },
  { timestamps: true }
);

// Unique composite index: one state record per trade per alert type per user
AlertStateSchema.index({ userId: 1, tradeId: 1, type: 1 }, { unique: true });

// TTL expiration for resolved alerts after 7 days
AlertStateSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 7 * 86400, partialFilterExpression: { resolvedAt: { $exists: true } } }
);

export const AlertState = mongoose.model<IAlertStateDoc>('AlertState', AlertStateSchema);

