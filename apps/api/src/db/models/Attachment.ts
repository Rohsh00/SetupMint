import mongoose, { Document, Schema } from 'mongoose';

export interface IAttachmentDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId;
  originalName: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  category: 'SETUP' | 'ENTRY' | 'EXIT' | 'REVIEW' | 'OTHER' | 'BEFORE_ENTRY' | 'ANNOTATED' | 'ATTACHMENT' | 'AUTO_CHART';
  description?: string;
  timeframe?: string;
  chartTimestamp?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachmentDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tradeId: {
      type: Schema.Types.ObjectId,
      ref: 'Trade',
      index: true,
    },
    originalName: { type: String, required: true },
    storedFilename: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    category: {
      type: String,
      enum: ['SETUP', 'ENTRY', 'EXIT', 'REVIEW', 'OTHER', 'BEFORE_ENTRY', 'ANNOTATED', 'ATTACHMENT', 'AUTO_CHART'],
      default: 'ENTRY',
    },
    description: { type: String },
    timeframe: { type: String },
    chartTimestamp: { type: String },
  },
  { timestamps: true }
);

AttachmentSchema.index({ userId: 1, tradeId: 1 });
AttachmentSchema.index({ tradeId: 1, category: 1 });

export const Attachment = mongoose.model<IAttachmentDoc>('Attachment', AttachmentSchema);
