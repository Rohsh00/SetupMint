import mongoose, { Document, Schema } from 'mongoose';

export interface ITelegramCallbackLockDoc extends Document {
  lockKey: string;
  createdAt: Date;
}

const TelegramCallbackLockSchema = new Schema<ITelegramCallbackLockDoc>({
  lockKey: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

// TTL index to automatically release callback locks after 15 seconds
TelegramCallbackLockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15 });

export const TelegramCallbackLock = mongoose.model<ITelegramCallbackLockDoc>(
  'TelegramCallbackLock',
  TelegramCallbackLockSchema
);

