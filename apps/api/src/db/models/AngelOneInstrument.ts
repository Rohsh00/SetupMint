import mongoose, { Document, Schema } from 'mongoose';

export interface IAngelOneInstrumentDoc extends Document {
  userId?: mongoose.Types.ObjectId | null;
  symboltoken: string;
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrumenttype: string;
  expiry?: string;
  strike?: number;
  lotsize?: number;
  tickSize?: number;
  refreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AngelOneInstrumentSchema = new Schema<IAngelOneInstrumentDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    symboltoken: {
      type: String,
      required: true,
      trim: true,
    },
    tradingsymbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    exchange: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    instrumenttype: {
      type: String,
      default: '',
      trim: true,
    },
    expiry: {
      type: String,
      default: '',
      trim: true,
    },
    strike: {
      type: Number,
      default: -1,
    },
    lotsize: {
      type: Number,
      default: 1,
    },
    tickSize: {
      type: Number,
      default: 0.05,
    },
    refreshedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Targeted indexes for fast O(1) symbol resolution and atomic refresh operations
AngelOneInstrumentSchema.index({ name: 1, exchange: 1, instrumenttype: 1 });
AngelOneInstrumentSchema.index({ tradingsymbol: 1, exchange: 1 });
AngelOneInstrumentSchema.index({ symboltoken: 1, exchange: 1 });
AngelOneInstrumentSchema.index({ userId: 1, name: 1 });
AngelOneInstrumentSchema.index({ userId: 1, refreshedAt: 1 });

export const AngelOneInstrument = mongoose.model<IAngelOneInstrumentDoc>(
  'AngelOneInstrument',
  AngelOneInstrumentSchema
);
