import mongoose, { Document, Schema } from 'mongoose';
import { MarketDataProvider, MarketDataStatus } from '@tradevault/shared';

export interface IMarketDataIntegrationDoc extends Document {
  userId: mongoose.Types.ObjectId;
  provider: MarketDataProvider;
  apiKey?: string;
  clientCode?: string;
  pin?: string;
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
  tokenExpiresAt?: Date;
  status: MarketDataStatus;
  lastUsedAt?: Date;
  lastError?: string;
  dailyCallCount: number;
  dailyCallDate?: string; // YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

const MarketDataIntegrationSchema = new Schema<IMarketDataIntegrationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['ANGEL_ONE'],
      required: true,
      default: 'ANGEL_ONE',
    },
    apiKey: {
      type: String,
      trim: true,
    },
    clientCode: {
      type: String,
      trim: true,
    },
    pin: {
      type: String,
      trim: true,
    },
    jwtToken: {
      type: String,
      trim: true,
    },
    refreshToken: {
      type: String,
      trim: true,
    },
    feedToken: {
      type: String,
      trim: true,
    },
    tokenExpiresAt: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ['DISABLED', 'IDLE', 'ERROR'],
      default: 'IDLE',
      required: true,
    },
    lastUsedAt: {
      type: Date,
    },
    lastError: {
      type: String,
      trim: true,
    },
    dailyCallCount: {
      type: Number,
      default: 0,
      required: true,
    },
    dailyCallDate: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).apiKey;
        delete (ret as any).clientCode;
        delete (ret as any).pin;
        delete (ret as any).jwtToken;
        delete (ret as any).refreshToken;
        delete (ret as any).feedToken;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete (ret as any).apiKey;
        delete (ret as any).clientCode;
        delete (ret as any).pin;
        delete (ret as any).jwtToken;
        delete (ret as any).refreshToken;
        delete (ret as any).feedToken;
        return ret;
      },
    },
  }
);

// Compound unique index ensuring one integration per provider per user
MarketDataIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export const MarketDataIntegration = mongoose.model<IMarketDataIntegrationDoc>(
  'MarketDataIntegration',
  MarketDataIntegrationSchema
);
