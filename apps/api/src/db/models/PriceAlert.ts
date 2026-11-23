import mongoose, { Document, Schema } from 'mongoose';

export interface IPriceAlertDoc extends Document {
  userId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId;
  symbol: string;
  targetPrice: number;
  condition: 'CROSSES_ABOVE' | 'CROSSES_BELOW' | 'TOUCH_EXACT';
  initialPrice: number;
  status: 'ARMED' | 'TRIGGERED' | 'CANCELLED';
  isRecurring: boolean;
  note?: string;
  triggeredAt?: Date;
  triggeredPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PriceAlertSchema = new Schema<IPriceAlertDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'TradingAccount', index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
    targetPrice: { type: Number, required: true },
    condition: {
      type: String,
      required: true,
      enum: ['CROSSES_ABOVE', 'CROSSES_BELOW', 'TOUCH_EXACT'],
      default: 'CROSSES_ABOVE',
    },
    initialPrice: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['ARMED', 'TRIGGERED', 'CANCELLED'],
      default: 'ARMED',
      index: true,
    },
    isRecurring: { type: Boolean, default: false },
    note: { type: String, trim: true },
    triggeredAt: { type: Date },
    triggeredPrice: { type: Number },
  },
  { timestamps: true }
);

PriceAlertSchema.index({ userId: 1, status: 1 });
PriceAlertSchema.index({ status: 1, symbol: 1 });

export const PriceAlert = mongoose.model<IPriceAlertDoc>('PriceAlert', PriceAlertSchema);

