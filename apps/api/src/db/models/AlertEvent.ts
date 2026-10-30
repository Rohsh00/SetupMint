import mongoose, { Document, Schema } from 'mongoose';

export interface IAlertEventDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId;
  type: string;
  severity: number;
  action: string;
  enterCount: number;
  sentAt: Date;
  actedAt?: Date;
  actionTaken?: string;
  latencyMs?: number;
  error?: string;
  createdAt: Date;
}

const AlertEventSchema = new Schema<IAlertEventDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', index: true },
    type: { type: String, required: true },
    severity: { type: Number, required: true },
    action: { type: String, required: true },
    enterCount: { type: Number, required: true, default: 1 },
    sentAt: { type: Date, required: true, default: Date.now },
    actedAt: { type: Date },
    actionTaken: { type: String },
    latencyMs: { type: Number },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AlertEventSchema.index({ userId: 1, createdAt: -1 });

export const AlertEvent = mongoose.model<IAlertEventDoc>('AlertEvent', AlertEventSchema);

