import mongoose, { Document, Schema } from 'mongoose';
import { AssetClass, MarketSegment, OptionType } from '@tradevault/shared';

export interface IInstrumentDoc extends Document {
  userId?: mongoose.Types.ObjectId;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  exchange: string;
  marketSegment: MarketSegment;
  quoteCurrency: string;
  contractMultiplier: number;
  lotSize: number;
  tickSize: number;
  quantityIncrement: number;
  pricePrecision: number;
  isActive: boolean;
  expiryDate?: Date;
  optionType?: OptionType;
  strikePrice?: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InstrumentSchema = new Schema<IInstrumentDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    assetClass: {
      type: String,
      enum: ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'FOREX', 'CRYPTO', 'INDEX'],
      required: true,
      index: true,
    },
    exchange: {
      type: String,
      required: true,
      trim: true,
    },
    marketSegment: {
      type: String,
      enum: ['NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'MCX', 'FOREX', 'CRYPTO', 'US_EQUITY', 'CME', 'OTHER'],
      required: true,
    },
    quoteCurrency: {
      type: String,
      default: 'INR',
    },
    contractMultiplier: {
      type: Number,
      required: true,
      default: 1,
    },
    lotSize: {
      type: Number,
      required: true,
      default: 1,
    },
    tickSize: {
      type: Number,
      required: true,
      default: 0.05,
    },
    quantityIncrement: {
      type: Number,
      required: true,
      default: 1,
    },
    pricePrecision: {
      type: Number,
      required: true,
      default: 2,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    expiryDate: { type: Date },
    optionType: {
      type: String,
      enum: ['CALL', 'PUT'],
    },
    strikePrice: { type: Number },
    description: { type: String },
  },
  { timestamps: true }
);

InstrumentSchema.index({ userId: 1, symbol: 1 });

export const Instrument = mongoose.model<IInstrumentDoc>('Instrument', InstrumentSchema);
