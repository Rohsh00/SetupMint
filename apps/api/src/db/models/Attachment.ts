import mongoose, { Document, Schema } from 'mongoose';

export interface IAttachmentChartMetaDoc {
  resolution: string;
  paddingBefore: number;
  paddingAfter: number;
  appliedBefore: number;
  appliedAfter: number;
  truncated: boolean;
  generatedAt: Date;
}

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
  chartMeta?: IAttachmentChartMetaDoc;
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
    chartMeta: {
      resolution: { type: String },
      paddingBefore: { type: Number },
      paddingAfter: { type: Number },
      appliedBefore: { type: Number },
      appliedAfter: { type: Number },
      truncated: { type: Boolean },
      generatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

AttachmentSchema.index({ userId: 1, tradeId: 1 });
AttachmentSchema.index({ tradeId: 1, category: 1 });
AttachmentSchema.index({ tradeId: 1, category: 1, timeframe: 1 });

export const Attachment = mongoose.model<IAttachmentDoc>('Attachment', AttachmentSchema);

