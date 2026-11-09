import mongoose, { Document, Schema } from 'mongoose';

export type Mt5Action = 'MODIFY_SL' | 'MODIFY_TP' | 'CLOSE_POSITION';
export type Mt5CommandStatus = 'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED';

export interface IMt5CommandDoc extends Document {
  accountId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId;
  ticket: number;
  action: Mt5Action;
  stopLoss?: number;
  takeProfit?: number;
  volume?: number;
  status: Mt5CommandStatus;
  resultMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
}

const Mt5CommandSchema = new Schema<IMt5CommandDoc>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'TradingAccount', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', index: true },
    ticket: { type: Number, required: true },
    action: { type: String, enum: ['MODIFY_SL', 'MODIFY_TP', 'CLOSE_POSITION'], required: true },
    stopLoss: { type: Number },
    takeProfit: { type: Number },
    volume: { type: Number },
    status: { type: String, enum: ['PENDING', 'SENT', 'EXECUTED', 'FAILED'], default: 'PENDING', index: true },
    resultMessage: { type: String },
    executedAt: { type: Date },
  },
  { timestamps: true }
);

export const Mt5Command =
  mongoose.models.Mt5Command || mongoose.model<IMt5CommandDoc>('Mt5Command', Mt5CommandSchema);

