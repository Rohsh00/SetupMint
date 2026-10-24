import mongoose, { Document, Schema } from 'mongoose';

export interface IBrokerFundsSnapshotDoc extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  broker: 'FYERS';
  clientId: string;
  fetchedAt: Date;
  totalBalance: mongoose.Types.Decimal128;
  clearBalance: mongoose.Types.Decimal128;
  availableBalance: mongoose.Types.Decimal128;
  realizedPnL: mongoose.Types.Decimal128;
  utilizedAmount: mongoose.Types.Decimal128;
  fundLimits: Array<{
    id?: number;
    title: string;
    equityAmount: mongoose.Types.Decimal128;
    commodityAmount: mongoose.Types.Decimal128;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const BrokerFundsSnapshotSchema = new Schema<IBrokerFundsSnapshotDoc>(
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
    broker: {
      type: String,
      enum: ['FYERS'],
      required: true,
    },
    clientId: { type: String, required: true, trim: true },
    fetchedAt: { type: Date, required: true },
    totalBalance: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    clearBalance: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    availableBalance: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    realizedPnL: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    utilizedAmount: {
      type: Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
    },
    fundLimits: [
      {
        id: { type: Number },
        title: { type: String, required: true },
        equityAmount: {
          type: Schema.Types.Decimal128,
          default: mongoose.Types.Decimal128.fromString('0.00'),
        },
        commodityAmount: {
          type: Schema.Types.Decimal128,
          default: mongoose.Types.Decimal128.fromString('0.00'),
        },
      },
    ],
  },
  { timestamps: true }
);

BrokerFundsSnapshotSchema.index({ userId: 1, accountId: 1, fetchedAt: -1 });

export const BrokerFundsSnapshot = mongoose.model<IBrokerFundsSnapshotDoc>(
  'BrokerFundsSnapshot',
  BrokerFundsSnapshotSchema
);
