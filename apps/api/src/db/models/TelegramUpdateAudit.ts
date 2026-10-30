import mongoose, { Document, Schema } from 'mongoose';

export interface ITelegramUpdateAuditDoc extends Document {
  updateId: number;
  processedAt: Date;
}

const TelegramUpdateAuditSchema = new Schema<ITelegramUpdateAuditDoc>({
  updateId: { type: Number, required: true, unique: true },
  processedAt: { type: Date, required: true, default: Date.now },
});

// TTL index to automatically prune update audit records after 24 hours
TelegramUpdateAuditSchema.index({ processedAt: 1 }, { expireAfterSeconds: 86400 });

export const TelegramUpdateAudit = mongoose.model<ITelegramUpdateAuditDoc>(
  'TelegramUpdateAudit',
  TelegramUpdateAuditSchema
);

