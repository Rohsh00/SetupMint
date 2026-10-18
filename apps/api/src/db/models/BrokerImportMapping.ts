import mongoose, { Document, Schema } from 'mongoose';

export type SupportedImportBroker = 'ZERODHA' | 'FYERS' | 'ANGEL_ONE' | 'UPSTOX' | 'CUSTOM';

export interface IBrokerImportMappingDoc extends Document {
  userId: mongoose.Types.ObjectId;
  broker: SupportedImportBroker;
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

// Unique mapping per user and broker
BrokerImportMappingSchema.index({ userId: 1, broker: 1 }, { unique: true });

export const BrokerImportMapping = mongoose.model<IBrokerImportMappingDoc>(
  'BrokerImportMapping',
  BrokerImportMappingSchema
);
