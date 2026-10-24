import mongoose, { Document, Schema } from 'mongoose';

export interface IBrokerIntegrationDoc extends Document {
  userId: mongoose.Types.ObjectId;
  broker: 'FYERS';
  status: 'DISABLED' | 'IDLE' | 'CONNECTED' | 'SYNCING' | 'ERROR';
  appId?: string;
  secretKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  linkedAccountId?: mongoose.Types.ObjectId;
  tokenExpiresAt?: Date;
  authCodeExpiresAt?: Date;
  oauthStateHash?: string;
  oauthStateExpiresAt?: Date;
  autoSyncEnabled?: boolean;
  lastSyncAt?: Date;
  lastFundsSyncAt?: Date;
  fundsSyncError?: string;
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
    refreshToken: { type: String },
    clientId: { type: String, trim: true },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: 'TradingAccount' },
    tokenExpiresAt: { type: Date },
    authCodeExpiresAt: { type: Date },
    oauthStateHash: { type: String, index: true },
    oauthStateExpiresAt: { type: Date },
    autoSyncEnabled: { type: Boolean, default: true },
    lastSyncAt: { type: Date },
    lastFundsSyncAt: { type: Date },
    fundsSyncError: { type: String },
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

function redactBrokerSecrets(_doc: any, ret: Record<string, any>) {
  delete ret.secretKey;
  delete ret.accessToken;
  delete ret.refreshToken;
  delete ret.oauthStateHash;
  return ret;
}

BrokerIntegrationSchema.set('toJSON', { transform: redactBrokerSecrets });
BrokerIntegrationSchema.set('toObject', { transform: redactBrokerSecrets });

export const BrokerIntegration = mongoose.model<IBrokerIntegrationDoc>(
  'BrokerIntegration',
  BrokerIntegrationSchema
);
