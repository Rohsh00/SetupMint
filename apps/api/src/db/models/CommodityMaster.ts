import mongoose, { Document, Schema } from 'mongoose';

export interface ICommodityMasterDoc extends Document {
  symbol: string;             // Root underlying ticker, e.g. CRUDEOIL, GOLD, NATURALGAS
  displayName: string;        // e.g. Crude Oil, Gold, Natural Gas
  exchange: 'MCX' | 'NSE' | string;
  marketSegment: 'MCX' | 'NSE_COM' | string;
  aliases: string[];          // e.g. ['CRUDEOILM', 'CRUDEOILMINI'], ['NATGAS', 'NATGASMINI'], ['GOLDM']
  contractMultiplier: number; // e.g. 100 for Crude, 100 for Gold 1kg, 250 for NatGas mini
  lotSize: number;
  tickSize: number;
  pricePrecision: number;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommodityMasterSchema = new Schema<ICommodityMasterDoc>(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    exchange: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: 'MCX',
      index: true,
    },
    marketSegment: {
      type: String,
      uppercase: true,
      trim: true,
      default: 'MCX',
    },
    aliases: {
      type: [String],
      default: [],
      index: true,
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
    pricePrecision: {
      type: Number,
      default: 2,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

CommodityMasterSchema.index({ exchange: 1, isActive: 1 });

export const CommodityMaster = mongoose.model<ICommodityMasterDoc>(
  'CommodityMaster',
  CommodityMasterSchema
);
