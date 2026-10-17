import mongoose, { Document, Schema } from 'mongoose';

export interface ISessionDoc extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
}

const SessionSchema = new Schema<ISessionDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '30d' }, // Automatically removed by MongoDB after expiry
    },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISessionDoc>('Session', SessionSchema);
