import mongoose, { Document, Schema } from 'mongoose';

export interface IBrokerIntegrationDoc extends Document {
  userId: mongoose.Types.ObjectId;
  broker: 'FYERS';
  status: 'DISABLED' | 'IDLE' | 'CONNECTED' | 'SYNCING' | 'ERROR';
  appId?: string;
  secretKey?: string;
  accessToken?: string;
  authCodeExpiresAt?: Date;
  autoSyncEnabled?: boolean;
  lastSyncAt?: Date;
  syncHistory: Array<{
    timestamp: Date;
    status: 'SUCCESS' | 'FAILED';
    syncedCount: number;
    reconciledCount: number;
    error?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const BrokerIntegrationSchema = new Schema<IBrokerIntegrationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    broker: {
      type: String,
      enum: ['FYERS'],
      default: 'FYERS',
      required: true,
    },
    status: {
      type: String,
      enum: ['DISABLED', 'IDLE', 'CONNECTED', 'SYNCING', 'ERROR'],
      default: 'DISABLED',
    },
    appId: { type: String },
    secretKey: { type: String },
    accessToken: { type: String },
    authCodeExpiresAt: { type: Date },
    autoSyncEnabled: { type: Boolean, default: true },
    lastSyncAt: { type: Date },
    syncHistory: [
      {
        timestamp: { type: Date, default: Date.now },
        status: { type: String, enum: ['SUCCESS', 'FAILED'] },
        syncedCount: { type: Number, default: 0 },
        reconciledCount: { type: Number, default: 0 },
        error: { type: String },
      },
    ],
  },
  { timestamps: true }
);

BrokerIntegrationSchema.index({ userId: 1, broker: 1 }, { unique: true });

export const BrokerIntegration = mongoose.model<IBrokerIntegrationDoc>(
  'BrokerIntegration',
  BrokerIntegrationSchema
);
