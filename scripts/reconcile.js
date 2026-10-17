import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Decimal from 'decimal.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tradevault';

async function reconcile() {
  console.log('[Reconcile] Connecting to database...');
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error(`[Reconcile] Could not connect to MongoDB at ${MONGODB_URI}. Ensure database or API daemon is running.`);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const accountsCol = db.collection('tradingaccounts');
  const tradesCol = db.collection('trades');
  const txCol = db.collection('accounttransactions');

  const accounts = await accountsCol.find({}).toArray();
  console.log(`[Reconcile] Found ${accounts.length} trading accounts to audit and reconcile.`);

  for (const acc of accounts) {
    // 1. Sum closed trades
    const tradeStats = await tradesCol.aggregate([
      {
        $match: {
          accountId: acc._id,
          status: 'CLOSED',
        },
      },
      {
        $group: {
          _id: null,
          totalNetPnL: { $sum: '$calculated.netPnL' },
          closedTradesCount: { $sum: 1 },
        },
      },
    ]).toArray();

    const closedTradesCount = tradeStats.length > 0 ? tradeStats[0].closedTradesCount : 0;
    const realizedPnL = new Decimal(tradeStats.length > 0 ? tradeStats[0].totalNetPnL : 0);

    // 2. Sum transactions
    const txStats = await txCol.aggregate([
      {
        $match: {
          accountId: acc._id,
        },
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
        },
      },
    ]).toArray();

    let totalDeposits = new Decimal(0);
    let totalWithdrawals = new Decimal(0);
    let totalAdjustments = new Decimal(0);

    for (const stat of txStats) {
      const amountDec = new Decimal(stat.totalAmount.toString());
      if (stat._id === 'DEPOSIT') {
        totalDeposits = totalDeposits.plus(amountDec);
      } else if (stat._id === 'WITHDRAWAL') {
        totalWithdrawals = totalWithdrawals.plus(amountDec);
      } else if (stat._id === 'ADJUSTMENT') {
        totalAdjustments = totalAdjustments.plus(amountDec);
      }
    }

    const initialBalance = new Decimal(acc.initialBalance.toString());
    const currentBalance = initialBalance
      .plus(realizedPnL)
      .plus(totalDeposits)
      .minus(totalWithdrawals)
      .plus(totalAdjustments);

    await accountsCol.updateOne(
      { _id: acc._id },
      {
        $set: {
          realizedPnL: mongoose.Types.Decimal128.fromString(realizedPnL.toFixed(2)),
          totalDeposits: mongoose.Types.Decimal128.fromString(totalDeposits.toFixed(2)),
          totalWithdrawals: mongoose.Types.Decimal128.fromString(totalWithdrawals.toFixed(2)),
          currentBalance: mongoose.Types.Decimal128.fromString(currentBalance.toFixed(2)),
        },
      }
    );

    console.log(
      `[Reconcile] ✓ Account: ${acc.name} | Closed Trades: ${closedTradesCount} | Realized P&L: ₹${realizedPnL.toFixed(2)} | Balance: ₹${currentBalance.toFixed(2)}`
    );
  }

  console.log('[Reconcile] All account balances have been authoritatively reconciled.');
  await mongoose.disconnect();
}

reconcile().catch((err) => {
  console.error('[Reconcile] Fatal error during reconciliation:', err);
  process.exit(1);
});
