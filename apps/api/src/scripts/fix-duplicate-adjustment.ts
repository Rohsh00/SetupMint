import { connectDatabase, disconnectDatabase } from '../db/connection.js';
import { AccountTransaction, TradingAccount, User } from '../db/models/index.js';
import { AccountService } from '../services/account.service.js';
import { FyersService } from '../services/fyers.service.js';
import Decimal from 'decimal.js';
import mongoose from 'mongoose';

async function main() {
  await connectDatabase();
  const user = await User.findOne({ email: 'komaltrader@gmail.com' });
  const account = await TradingAccount.findOne({ userId: user!._id, name: 'Fyers' });
  console.log('Account ID:', account!._id);

  // Sync funds with FYERS to verify live balance
  const funds = await FyersService.syncFundsForAccount(account!._id, user!._id);
  const liveFyersBalance = new Decimal(funds.brokerBalance);
  console.log('Live FYERS Clear Balance:', liveFyersBalance.toString());

  // Inspect all transactions
  const txs = await AccountTransaction.find({ accountId: account!._id, userId: user!._id });
  console.log('\nCurrent Transactions count:', txs.length);
  for (const t of txs) {
    console.log(`- ID: ${t._id}, Type: ${t.type}, Amount: ${t.amount}, Status: ${t.status}, Source: ${t.source}`);
  }

  // Remove duplicate adjustment transactions, leaving only ONE authoritative adjustment
  const brokerSyncTxs = txs.filter((t) => t.source === 'BROKER_SYNC' && t.type === 'ADJUSTMENT');
  if (brokerSyncTxs.length > 1) {
    console.log(`Found ${brokerSyncTxs.length} broker sync adjustments. Cleaning up duplicates...`);
    // Keep the latest one, delete the rest
    const toDelete = brokerSyncTxs.slice(0, -1);
    for (const d of toDelete) {
      await AccountTransaction.deleteOne({ _id: d._id });
      console.log(`Deleted duplicate adjustment: ${d._id}`);
    }
  }

  // Recalculate without adjustment to get exact base balance
  const latestTx = await AccountTransaction.findOne({
    accountId: account!._id,
    userId: user!._id,
    source: 'BROKER_SYNC',
  });
  if (latestTx) {
    latestTx.status = 'PENDING_REVIEW';
    await latestTx.save();
  }

  const baseSummary = await AccountService.recalculateAccountBalances(account!._id, user!._id);
  const baseBalance = new Decimal(baseSummary!.currentBalance);
  console.log('Base Balance (without adjustment):', baseBalance.toFixed(2));

  // Target balance is liveFyersBalance
  const requiredAdjustment = liveFyersBalance.minus(baseBalance);
  console.log('Required exact adjustment:', requiredAdjustment.toFixed(2));

  if (latestTx) {
    latestTx.amount = mongoose.Types.Decimal128.fromString(requiredAdjustment.toFixed(2));
    latestTx.status = 'CONFIRMED';
    latestTx.notes = `FYERS Capital Reconciliation: Synced to live Clear Balance ₹${liveFyersBalance.toFixed(2)}`;
    await latestTx.save();
    console.log(`Updated adjustment ${latestTx._id} to ₹${requiredAdjustment.toFixed(2)} and CONFIRMED.`);
  }

  const finalSummary = await AccountService.recalculateAccountBalances(account!._id, user!._id);
  console.log('\nFINAL RECONCILED SUMMARY:');
  console.log(JSON.stringify(finalSummary, null, 2));

  await disconnectDatabase();
}

main().catch(console.error);
