import mongoose, { Document, Schema } from 'mongoose';

export interface IAttachmentDoc extends Document {
  userId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId;
  originalName: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  category: 'BEFORE_ENTRY' | 'ENTRY' | 'EXIT' | 'ANNOTATED' | 'ATTACHMENT';
  description?: string;
  createdAt: Date;
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
      enum: ['BEFORE_ENTRY', 'ENTRY', 'EXIT', 'ANNOTATED', 'ATTACHMENT'],
      default: 'ENTRY',
    },
    description: { type: String },
  },
  { timestamps: true }
);

AttachmentSchema.index({ userId: 1, tradeId: 1 });

export const Attachment = mongoose.model<IAttachmentDoc>('Attachment', AttachmentSchema);
