import mongoose, { Document, Schema } from 'mongoose';
import { TransactionType } from '@tradevault/shared';

export interface IAccountTransactionDoc extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: mongoose.Types.Decimal128;
  currency: string;
  date: Date;
  notes?: string;
  createdAt: Date;
}

const AccountTransactionSchema = new Schema<IAccountTransactionDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'TradingAccount',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'ADJUSTMENT'],
      required: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    notes: { type: String },
  },
  { timestamps: true }
);

AccountTransactionSchema.index({ userId: 1, accountId: 1, date: -1 });

export const AccountTransaction = mongoose.model<IAccountTransactionDoc>(
  'AccountTransaction',
  AccountTransactionSchema
);
