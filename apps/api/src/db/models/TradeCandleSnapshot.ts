import mongoose, { Document, Schema } from 'mongoose';
import { ITradeCandle } from '@tradevault/shared';

export interface ITradeCandleSnapshotDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tradeId: mongoose.Types.ObjectId;
  symbol: string;
  resolution: string;
  candles: ITradeCandle[];
  provider?: 'FYERS' | 'ANGEL_ONE' | 'UNDERLYING';
  isUnderlyingFallback?: boolean;
  droppedRowsCount?: number;
  coverageFrom?: Date;
  coverageTo?: Date;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TradeCandleSnapshotSchema = new Schema<ITradeCandleSnapshotDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tradeId: {
      type: Schema.Types.ObjectId,
      ref: 'Trade',
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    resolution: {
      type: String,
      required: true,
      default: '1',
    },
    candles: [
      {
        t: { type: Number, required: true },
        o: { type: Number, required: true },
        h: { type: Number, required: true },
        l: { type: Number, required: true },
        c: { type: Number, required: true },
        v: { type: Number },
        _id: false,
      },
    ],
    provider: {
      type: String,
      enum: ['FYERS', 'ANGEL_ONE', 'UNDERLYING'],
      default: 'FYERS',
    },
    isUnderlyingFallback: {
      type: Boolean,
      default: false,
    },
    droppedRowsCount: {
      type: Number,
      default: 0,
    },
    coverageFrom: {
      type: Date,
    },
    coverageTo: {
      type: Date,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

TradeCandleSnapshotSchema.index({ userId: 1, tradeId: 1, resolution: 1 }, { unique: true });

export const TradeCandleSnapshot = mongoose.model<ITradeCandleSnapshotDoc>(
  'TradeCandleSnapshot',
  TradeCandleSnapshotSchema
);
