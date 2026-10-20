import mongoose, { Document, Schema } from 'mongoose';

export interface ISessionDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash?: string;
  token?: string; // legacy fallback lookup for one-time seamless migration
  expiresAt: Date;
  absoluteExpiresAt: Date;
  lastUsedAt: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISessionDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    token: {
      type: String,
      required: false,
      sparse: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Automatically removed by MongoDB exactly at expiresAt
    },
    absoluteExpiresAt: {
      type: Date,
      required: false, // Optional so legacy sessions without this field load cleanly during migration
    },
    lastUsedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISessionDoc>('Session', SessionSchema);

// Clean up legacy unique index on token_1 so null/undefined tokens in new hashed sessions never trigger E11000
const dropLegacyIndex = async () => {
  try {
    await Session.collection.dropIndex('token_1');
  } catch {
    // Index did not exist or already dropped
  }
};

if (mongoose.connection.readyState === 1) {
  dropLegacyIndex();
} else {
  mongoose.connection.once('connected', dropLegacyIndex);
}

