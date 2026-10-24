import mongoose, { Document, Schema } from 'mongoose';
import { BrokerImportKind } from '@tradevault/shared';

export type SupportedImportBroker = 'ZERODHA' | 'FYERS' | 'ANGEL_ONE' | 'UPSTOX' | 'CUSTOM';

export interface IBrokerImportMappingDoc extends Document {
  userId: mongoose.Types.ObjectId;
  broker: SupportedImportBroker;
  importKind: BrokerImportKind;
  name: string;
  mapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const BrokerImportMappingSchema = new Schema<IBrokerImportMappingDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    broker: {
      type: String,
      enum: ['ZERODHA', 'FYERS', 'ANGEL_ONE', 'UPSTOX', 'CUSTOM'],
      required: true,
    },
    importKind: {
      type: String,
      enum: ['TRADES', 'CASH_FLOWS'],
      default: 'TRADES',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mapping: {
      type: Map,
      of: String,
      required: true,
    },
  },
  { timestamps: true }
);

BrokerImportMappingSchema.index(
  { userId: 1, broker: 1, importKind: 1 },
  { unique: true }
);

export const BrokerImportMapping = mongoose.model<IBrokerImportMappingDoc>(
  'BrokerImportMapping',
  BrokerImportMappingSchema
);
