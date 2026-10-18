import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { validateAndFormatAtlasUri } from '../apps/api/src/db/connection.js';
import { AccountService } from '../apps/api/src/services/account.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

async function reconcile() {
  console.log('\n======================================================');
  console.log('⚖️  SetupMint Authoritative Account Balance Reconciler');
  console.log('======================================================\n');

  const rawUri = process.env.MONGODB_URI;
  const { uri: atlasUri, host: atlasHost } = validateAndFormatAtlasUri(rawUri);

  console.log(`[Reconcile] Connecting to Atlas MongoDB cluster at ${atlasHost}...`);
  try {
    await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 10000 });
  } catch (err: any) {
    console.error(`[Reconcile Error] Could not connect to Atlas at ${atlasHost}: ${err.message}`);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const accountsCol = db.collection('tradingaccounts');
  const accounts = await accountsCol.find({}).toArray();

  console.log(`[Reconcile] Found ${accounts.length} trading accounts to audit and reconcile.\n`);

  for (const acc of accounts) {
    const updated = await AccountService.recalculateAccountBalances(acc._id.toString(), acc.userId.toString());
    console.log(
      `[Reconcile] ✓ Account: "${acc.name}" | Realized P&L: ₹${updated.realizedPnL.toString()} | Balance: ₹${updated.currentBalance.toString()}`
    );
  }

  console.log('\n✅ All account balances have been authoritatively reconciled against Atlas ledgers.\n');
  await mongoose.disconnect();
}

reconcile().catch((err) => {
  console.error('[Reconcile Error] Fatal error during reconciliation:', err.message);
  process.exit(1);
});
